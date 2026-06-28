use std::path::{Path, PathBuf};
use url::Url;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "type", content = "data")]
pub enum LocalFileResolution {
    Allowed(PathBuf),
    ConfirmationRequired(PathBuf, String),
    Rejected(String),
}

pub fn resolve_local_file_link(
    raw_link: &str,
    base_directory: Option<&Path>,
    trusted_root: Option<&Path>,
) -> LocalFileResolution {
    let trimmed = raw_link.trim();
    if trimmed.is_empty() {
        return LocalFileResolution::Rejected("Empty link".to_string());
    }

    let lower = trimmed.to_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") {
        return LocalFileResolution::Rejected("Web URLs not supported for local resolution".to_string());
    }

    let path: PathBuf = if lower.starts_with("file:") {
        match Url::parse(trimmed) {
            Ok(url) => {
                if url.cannot_be_a_base() {
                    return LocalFileResolution::Rejected("Opaque file URIs are not supported".to_string());
                }
                if let Some(host) = url.host_str() {
                    if host != "localhost" && host != "127.0.0.1" && !host.is_empty() {
                        return LocalFileResolution::Rejected("Remote authorities/UNC shares are not supported".to_string());
                    }
                }
                match url.to_file_path() {
                    Ok(p) => p,
                    Err(_) => return LocalFileResolution::Rejected("Failed to convert file URL to path".to_string()),
                }
            }
            Err(e) => return LocalFileResolution::Rejected(format!("Invalid file URL: {}", e)),
        }
    } else {
        // Plain paths
        if trimmed.starts_with('~') {
            let home = crate::parsers::get_home_dir();
            if trimmed == "~" {
                home
            } else if trimmed.starts_with("~/") || trimmed.starts_with("~\\") {
                home.join(&trimmed[2..])
            } else {
                PathBuf::from(trimmed)
            }
        } else if let Some(base) = base_directory {
            let p = Path::new(trimmed);
            if p.is_absolute() {
                p.to_path_buf()
            } else {
                base.join(trimmed)
            }
        } else {
            PathBuf::from(trimmed)
        }
    };

    // Normalize and resolve symlinks
    let canonical = match path.canonicalize() {
        Ok(c) => c,
        Err(_) => return LocalFileResolution::Rejected(format!("File does not exist: {:?}", path)),
    };

    // Validate type constraints
    if canonical.is_dir() {
        return LocalFileResolution::Rejected(format!("Target path is a directory: {:?}", canonical));
    }
    if !canonical.is_file() {
        return LocalFileResolution::Rejected(format!("Target path is not a regular file: {:?}", canonical));
    }

    // Compare against trusted root
    if let Some(root) = trusted_root {
        if let Ok(real_root) = root.canonicalize() {
            if canonical.starts_with(&real_root) {
                return LocalFileResolution::Allowed(canonical);
            }
        } else if let Ok(real_root) = std::fs::canonicalize(root) {
            if canonical.starts_with(&real_root) {
                return LocalFileResolution::Allowed(canonical);
            }
        } else if canonical.starts_with(root) {
            return LocalFileResolution::Allowed(canonical);
        }
    }

    LocalFileResolution::ConfirmationRequired(canonical, "The path lies outside your workspace.".to_string())
}
