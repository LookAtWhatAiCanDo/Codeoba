use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::sync::Mutex;
use std::time::SystemTime;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GroupTask {
    pub id: String,
    pub title: String,
    pub is_completed: bool,
    pub associated_session_id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ConversationGroup {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default = "default_status")]
    pub status: String,
    #[serde(default)]
    pub session_ids: HashSet<String>,
    #[serde(default)]
    pub tasks: Vec<GroupTask>,
    #[serde(default)]
    pub past_work_summary: String,
    #[serde(default)]
    pub is_pinned: bool,
    #[serde(default)]
    pub created_at: i64,
    #[serde(default)]
    pub updated_at: i64,
}

fn default_status() -> String {
    "Active".to_string()
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct GroupsContainer {
    pub groups: Vec<ConversationGroup>,
}

pub struct GroupState {
    pub lock: Mutex<()>,
}

impl Default for GroupState {
    fn default() -> Self {
        Self::new()
    }
}

impl GroupState {
    pub fn new() -> Self {
        Self {
            lock: Mutex::new(()),
        }
    }
}

fn get_groups_file() -> std::path::PathBuf {
    let home = crate::parsers::get_home_dir();
    let dir = home.join(".codeoba");
    if !dir.exists() {
        let _ = fs::create_dir_all(&dir);
    }
    dir.join("groups.json")
}

/// In-memory copy of groups.json. This process is the only writer (every write goes through
/// save_groups), so the cache stays authoritative and lets repeated group mutations avoid
/// re-reading and re-parsing the whole file on every call.
fn groups_cache() -> &'static Mutex<Option<Vec<ConversationGroup>>> {
    static CACHE: std::sync::OnceLock<Mutex<Option<Vec<ConversationGroup>>>> =
        std::sync::OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(None))
}

fn load_groups_from_disk() -> Vec<ConversationGroup> {
    let file = get_groups_file();
    if !file.exists() {
        return Vec::new();
    }
    let content = match fs::read_to_string(&file) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };
    if content.trim().is_empty() {
        return Vec::new();
    }
    match serde_json::from_str::<GroupsContainer>(&content) {
        Ok(container) => container.groups,
        Err(e) => {
            crate::log_error!("Failed to parse groups.json: {}", e);
            Vec::new()
        }
    }
}

pub fn load_groups() -> Vec<ConversationGroup> {
    if let Ok(mut guard) = groups_cache().lock() {
        if let Some(ref groups) = *guard {
            return groups.clone();
        }
        // First access: read from disk once and memoize.
        let groups = load_groups_from_disk();
        *guard = Some(groups.clone());
        return groups;
    }
    load_groups_from_disk()
}

pub fn save_groups(groups: &[ConversationGroup]) -> Result<(), String> {
    let file = get_groups_file();
    let container = GroupsContainer {
        groups: groups.to_vec(),
    };
    let content = serde_json::to_string_pretty(&container)
        .map_err(|e| format!("Failed to serialize groups: {}", e))?;
    crate::fs_util::atomic_write(&file, content.as_bytes())
        .map_err(|e| format!("Failed to write groups file: {}", e))?;
    // Keep the cache in sync with what was just persisted.
    if let Ok(mut guard) = groups_cache().lock() {
        *guard = Some(groups.to_vec());
    }
    Ok(())
}

#[cfg(test)]
fn reset_groups_cache() {
    if let Ok(mut guard) = groups_cache().lock() {
        *guard = None;
    }
}

pub fn get_groups() -> Vec<ConversationGroup> {
    load_groups()
}

pub fn add_group(name: &str) -> Result<bool, String> {
    let name_normalized = name.replace('\\', "/");
    let name = name_normalized.trim();
    if name.is_empty() {
        return Ok(false);
    }
    let mut groups = load_groups();
    let exists = groups
        .iter()
        .any(|g| g.name.to_lowercase() == name.to_lowercase());
    if exists {
        return Ok(false);
    }
    let now = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    groups.push(ConversationGroup {
        name: name.to_string(),
        description: String::new(),
        status: "Active".to_string(),
        session_ids: HashSet::new(),
        tasks: Vec::new(),
        past_work_summary: String::new(),
        is_pinned: false,
        created_at: now,
        updated_at: now,
    });
    save_groups(&groups)?;
    Ok(true)
}

pub fn delete_group(name: &str) -> Result<(), String> {
    let name_normalized = name.replace('\\', "/");
    let name = name_normalized.trim();
    let mut groups = load_groups();

    let name_lower = name.to_lowercase();
    let prefix = format!("{}/", name_lower);
    groups.retain(|g| {
        let g_name_lower = g.name.to_lowercase();
        g_name_lower != name_lower && !g_name_lower.starts_with(&prefix)
    });

    save_groups(&groups)
}

pub fn rename_group(old_name: &str, new_name: &str) -> Result<bool, String> {
    let old_name_normalized = old_name.replace('\\', "/");
    let old_name = old_name_normalized.trim();
    let new_name_normalized = new_name.replace('\\', "/");
    let new_name = new_name_normalized.trim();

    if new_name.is_empty() || old_name.to_lowercase() == new_name.to_lowercase() {
        return Ok(false);
    }
    let mut groups = load_groups();
    if groups
        .iter()
        .any(|g| g.name.to_lowercase() == new_name.to_lowercase())
    {
        return Ok(false);
    }
    let existing_idx = groups
        .iter()
        .position(|g| g.name.to_lowercase() == old_name.to_lowercase());
    if let Some(idx) = existing_idx {
        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        groups[idx].name = new_name.to_string();
        groups[idx].updated_at = now;

        // Re-parent child groups (names are "Parent/Child" paths) by replacing the leading
        // segments that match old_name. This is done segment-by-segment rather than by byte
        // slicing: the old code sliced g.name at `old_name.to_lowercase().len()`, i.e. a byte
        // offset measured on the *lowercased* string applied to the *original-case* string.
        // Unicode lowercasing is not length-preserving (e.g. Turkish 'İ' -> "i̇"), so that
        // offset could land mid-codepoint and panic — poisoning the GroupState mutex and
        // bricking the groups feature for the rest of the session.
        let old_segments: Vec<&str> = old_name.split('/').collect();
        for (i, g) in groups.iter_mut().enumerate() {
            if i == idx {
                continue; // the parent itself was already renamed above
            }
            let g_segments: Vec<&str> = g.name.split('/').collect();
            let is_descendant = g_segments.len() > old_segments.len()
                && g_segments[..old_segments.len()]
                    .iter()
                    .zip(&old_segments)
                    .all(|(seg, old)| seg.to_lowercase() == old.to_lowercase());
            if is_descendant {
                let remaining = g_segments[old_segments.len()..].join("/");
                g.name = format!("{}/{}", new_name, remaining);
                g.updated_at = now;
            }
        }
        save_groups(&groups)?;
        Ok(true)
    } else {
        Ok(false)
    }
}

pub fn assign_session_to_group(session_id: &str, group_name: &str) -> Result<(), String> {
    let group_name_normalized = group_name.replace('\\', "/");
    let group_name = group_name_normalized.trim();

    let mut groups = load_groups();
    let now = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);

    let existing_idx = groups
        .iter()
        .position(|g| g.name.to_lowercase() == group_name.to_lowercase());
    if let Some(idx) = existing_idx {
        let group = &mut groups[idx];
        if !group.session_ids.contains(session_id) {
            group.session_ids.insert(session_id.to_string());
            group.updated_at = now;
            save_groups(&groups)?;
        }
    } else {
        let mut session_ids = HashSet::new();
        session_ids.insert(session_id.to_string());
        groups.push(ConversationGroup {
            name: group_name.to_string(),
            description: String::new(),
            status: "Active".to_string(),
            session_ids,
            tasks: Vec::new(),
            past_work_summary: String::new(),
            is_pinned: false,
            created_at: now,
            updated_at: now,
        });
        save_groups(&groups)?;
    }
    Ok(())
}

pub fn remove_session_from_group(session_id: &str, group_name: &str) -> Result<(), String> {
    let group_name_normalized = group_name.replace('\\', "/");
    let group_name = group_name_normalized.trim();

    let mut groups = load_groups();
    let existing_idx = groups
        .iter()
        .position(|g| g.name.to_lowercase() == group_name.to_lowercase());
    if let Some(idx) = existing_idx {
        let group = &mut groups[idx];
        if group.session_ids.contains(session_id) {
            group.session_ids.remove(session_id);
            group.updated_at = SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0);
            save_groups(&groups)?;
        }
    }
    Ok(())
}

pub fn set_group_pinned(name: &str, pinned: bool) -> Result<(), String> {
    let name_normalized = name.replace('\\', "/");
    let name = name_normalized.trim();

    let mut groups = load_groups();
    let existing_idx = groups
        .iter()
        .position(|g| g.name.to_lowercase() == name.to_lowercase());
    if let Some(idx) = existing_idx {
        let group = &mut groups[idx];
        group.is_pinned = pinned;
        group.updated_at = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        save_groups(&groups)?;
    }
    Ok(())
}

pub fn clean_orphaned_sessions(all_valid_session_ids: &HashSet<String>) -> Result<(), String> {
    let mut groups = load_groups();
    let mut changed = false;
    let now = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);

    for group in &mut groups {
        let original_len = group.session_ids.len();
        group
            .session_ids
            .retain(|id| all_valid_session_ids.contains(id));

        let mut tasks_changed = false;
        for task in &mut group.tasks {
            if let Some(ref assoc_id) = task.associated_session_id {
                if !all_valid_session_ids.contains(assoc_id) {
                    task.associated_session_id = None;
                    tasks_changed = true;
                }
            }
        }

        if group.session_ids.len() != original_len || tasks_changed {
            group.updated_at = now;
            changed = true;
        }
    }
    if changed {
        save_groups(&groups)?;
    }
    Ok(())
}

pub fn update_group_details(
    name: &str,
    description: &str,
    status: &str,
    past_work_summary: &str,
    tasks: Vec<GroupTask>,
) -> Result<(), String> {
    let name_normalized = name.replace('\\', "/");
    let name = name_normalized.trim();

    let mut groups = load_groups();
    let existing_idx = groups
        .iter()
        .position(|g| g.name.to_lowercase() == name.to_lowercase());
    if let Some(idx) = existing_idx {
        let group = &mut groups[idx];
        group.description = description.to_string();
        group.status = status.to_string();
        group.past_work_summary = past_work_summary.to_string();
        group.tasks = tasks;
        group.updated_at = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        save_groups(&groups)?;
        Ok(())
    } else {
        Err(format!("Group '{}' not found", name))
    }
}

#[cfg(test)]
mod rename_tests {
    use super::*;

    fn group(name: &str) -> ConversationGroup {
        ConversationGroup {
            name: name.to_string(),
            description: String::new(),
            status: "Active".to_string(),
            session_ids: HashSet::new(),
            tasks: Vec::new(),
            past_work_summary: String::new(),
            is_pinned: false,
            created_at: 0,
            updated_at: 0,
        }
    }

    /// Runs `f` against a fresh, isolated ~/.codeoba via CODEOBA_MOCK_HOME, serialized with
    /// the other env-mutating tests.
    fn with_temp_home(f: impl FnOnce()) {
        let _lock = crate::HOME_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
        let temp = tempfile::tempdir().unwrap();
        std::env::set_var("CODEOBA_MOCK_HOME", temp.path());
        super::reset_groups_cache(); // isolate the process-wide cache between tests
        f();
        super::reset_groups_cache();
        std::env::remove_var("CODEOBA_MOCK_HOME");
    }

    /// The cache is authoritative: after a save, load must serve from memory without touching disk.
    #[test]
    fn load_serves_from_cache_after_save() {
        with_temp_home(|| {
            save_groups(&[group("X")]).unwrap();
            // Delete the backing file — a cached load must still return the saved groups.
            let _ = std::fs::remove_file(super::get_groups_file());
            let names: Vec<String> = load_groups().into_iter().map(|g| g.name).collect();
            assert_eq!(names, vec!["X".to_string()]);
        });
    }

    /// Regression: a name whose lowercasing changes byte length ('İ' -> "i̇") used to slice
    /// mid-codepoint and panic. Renaming the parent must re-parent the child safely, keeping
    /// the child's original-case remainder.
    #[test]
    fn turkish_dotted_i_rename_does_not_panic() {
        with_temp_home(|| {
            save_groups(&[group("İ"), group("İ/İs")]).unwrap();

            let changed = rename_group("İ", "Renamed").unwrap();
            assert!(changed);

            let names: Vec<String> = load_groups().into_iter().map(|g| g.name).collect();
            assert!(
                names.contains(&"Renamed".to_string()),
                "parent should be renamed: {names:?}"
            );
            assert!(
                names.contains(&"Renamed/İs".to_string()),
                "child should be re-parented: {names:?}"
            );
        });
    }

    #[test]
    fn ascii_rename_reparents_nested_children_only() {
        with_temp_home(|| {
            save_groups(&[
                group("Work"),
                group("Work/api"),
                group("Work/api/db"),
                group("Personal"),
                group("Workshop"), // must NOT match "Work" (segment boundary)
            ])
            .unwrap();

            assert!(rename_group("Work", "Job").unwrap());

            let names: Vec<String> = load_groups().into_iter().map(|g| g.name).collect();
            assert!(names.contains(&"Job".to_string()));
            assert!(names.contains(&"Job/api".to_string()));
            assert!(names.contains(&"Job/api/db".to_string()));
            assert!(names.contains(&"Personal".to_string()));
            assert!(
                names.contains(&"Workshop".to_string()),
                "'Workshop' must be untouched: {names:?}"
            );
        });
    }

    #[test]
    fn rename_leaf_group_without_children() {
        with_temp_home(|| {
            save_groups(&[group("Solo")]).unwrap();
            assert!(rename_group("Solo", "Alone").unwrap());
            let names: Vec<String> = load_groups().into_iter().map(|g| g.name).collect();
            assert_eq!(names, vec!["Alone".to_string()]);
        });
    }
}
