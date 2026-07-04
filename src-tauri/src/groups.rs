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

pub fn load_groups() -> Vec<ConversationGroup> {
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

pub fn save_groups(groups: &[ConversationGroup]) -> Result<(), String> {
    let file = get_groups_file();
    let container = GroupsContainer {
        groups: groups.to_vec(),
    };
    let content = serde_json::to_string_pretty(&container)
        .map_err(|e| format!("Failed to serialize groups: {}", e))?;
    fs::write(file, content)
        .map_err(|e| format!("Failed to write groups file: {}", e))?;
    Ok(())
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
      let exists = groups.iter().any(|g| g.name.to_lowercase() == name.to_lowercase());
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
    if groups.iter().any(|g| g.name.to_lowercase() == new_name.to_lowercase()) {
        return Ok(false);
    }
    let existing_idx = groups.iter().position(|g| g.name.to_lowercase() == old_name.to_lowercase());
    if let Some(idx) = existing_idx {
        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        groups[idx].name = new_name.to_string();
        groups[idx].updated_at = now;
        
        let prefix = format!("{}/", old_name.to_lowercase());
        for g in &mut groups {
            let name_lower = g.name.to_lowercase();
            if name_lower.starts_with(&prefix) {
                let remaining = &g.name[prefix.len()..];
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
    
    let existing_idx = groups.iter().position(|g| g.name.to_lowercase() == group_name.to_lowercase());
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
    let existing_idx = groups.iter().position(|g| g.name.to_lowercase() == group_name.to_lowercase());
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
    let existing_idx = groups.iter().position(|g| g.name.to_lowercase() == name.to_lowercase());
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
        group.session_ids.retain(|id| all_valid_session_ids.contains(id));
        
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
    let existing_idx = groups.iter().position(|g| g.name.to_lowercase() == name.to_lowercase());
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
