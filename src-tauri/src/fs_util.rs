use std::io::{self, Write};
use std::path::Path;

/// Writes `contents` to `path` atomically and durably.
///
/// The naive `fs::write` truncates the destination to zero length and *then* streams the new
/// bytes. A crash or power loss in that window leaves a truncated or empty file — and the state
/// loaders here treat an empty/unparseable file as "no data", so a mid-write crash silently wipes
/// user-authored state (groups, permissions, source decisions) that cannot be regenerated.
///
/// Instead we write to a sibling temp file in the *same* directory, fsync it, then rename it over
/// the destination. `rename` is atomic on POSIX and replaces the destination on Windows
/// (`MoveFileEx` with `MOVEFILE_REPLACE_EXISTING`), so a reader ever only observes the complete
/// old file or the complete new file. Creating the temp in the target directory guarantees the
/// rename stays on one filesystem (a cross-device rename would fail).
pub fn atomic_write(path: &Path, contents: &[u8]) -> io::Result<()> {
    let dir = path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    std::fs::create_dir_all(dir)?;

    let mut tmp = tempfile::NamedTempFile::new_in(dir)?;
    tmp.write_all(contents)?;
    tmp.flush()?;
    // Durability: force the bytes to disk before the rename so a crash can't leave the renamed
    // file pointing at data that never made it out of the page cache.
    tmp.as_file().sync_all()?;

    tmp.persist(path).map_err(|e| e.error)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::atomic_write;

    #[test]
    fn creates_parent_dirs_and_writes() {
        let tmp = tempfile::tempdir().unwrap();
        let target = tmp.path().join("nested/dir/state.json");

        atomic_write(&target, b"hello").unwrap();

        assert_eq!(std::fs::read_to_string(&target).unwrap(), "hello");
    }

    #[test]
    fn overwrites_existing_completely() {
        let tmp = tempfile::tempdir().unwrap();
        let target = tmp.path().join("state.json");

        atomic_write(&target, b"a much longer original payload").unwrap();
        atomic_write(&target, b"short").unwrap();

        // No leftover bytes from the longer previous content.
        assert_eq!(std::fs::read_to_string(&target).unwrap(), "short");
    }

    #[test]
    fn does_not_leave_temp_files_behind() {
        let tmp = tempfile::tempdir().unwrap();
        let target = tmp.path().join("state.json");

        atomic_write(&target, b"x").unwrap();

        let leftovers = std::fs::read_dir(tmp.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name() != "state.json")
            .count();
        assert_eq!(leftovers, 0, "temp file should have been renamed, not left behind");
    }
}
