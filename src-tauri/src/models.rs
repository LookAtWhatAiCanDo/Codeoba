use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PerformanceChartPoint {
    pub label: String,
    pub value: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub key_actions: Vec<String>,
    pub errors: Vec<String>,
    pub performance_charts: Vec<PerformanceChartPoint>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Turn {
    pub turn_id: String,
    pub user_message: String,
    pub assistant_message: String,
    pub timestamp: i64,
    #[serde(default)]
    pub input_tokens: Option<i64>,
    #[serde(default)]
    pub output_tokens: Option<i64>,
    #[serde(default)]
    pub extra_data: HashMap<String, String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub source_id: String,
    pub file_path: String,
    pub timestamp: i64,
    pub updated_at: i64,
    pub cwd: Option<String>,
    pub thread_name: Option<String>,
    pub turns: Vec<Turn>,
    #[serde(default)]
    pub is_archived: bool,
    #[serde(default)]
    pub is_pinned: bool,
    pub summary: Option<SessionSummary>,
    #[serde(default)]
    pub snippet: Option<String>,
}

impl Session {
    pub fn to_lightweight(&self) -> Self {
        let snippet = self.snippet.clone().or_else(|| {
            self.turns.last().map(|turn| {
                let msg = if !turn.user_message.is_empty() {
                    &turn.user_message
                } else {
                    &turn.assistant_message
                };
                let mut snippet_text = msg.chars().take(100).collect::<String>().replace('\n', " ");
                if msg.chars().count() > 100 {
                    snippet_text.truncate(100);
                    snippet_text.push_str("...");
                }
                snippet_text
            })
        });

        Self {
            id: self.id.clone(),
            source_id: self.source_id.clone(),
            file_path: self.file_path.clone(),
            timestamp: self.timestamp,
            updated_at: self.updated_at,
            cwd: self.cwd.clone(),
            thread_name: self.thread_name.clone(),
            turns: self.turns.iter().map(|t| Turn {
                turn_id: t.turn_id.clone(),
                user_message: String::new(),
                assistant_message: String::new(),
                timestamp: t.timestamp,
                input_tokens: t.input_tokens,
                output_tokens: t.output_tokens,
                extra_data: t.extra_data.clone(),
            }).collect(),
            is_archived: self.is_archived,
            is_pinned: self.is_pinned,
            summary: None,
            snippet,
        }
    }
}

