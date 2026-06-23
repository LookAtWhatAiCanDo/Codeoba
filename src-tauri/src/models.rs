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
}
