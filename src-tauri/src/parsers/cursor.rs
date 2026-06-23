use crate::models::Session;
use crate::parsers::SourceAdapter;

pub struct CursorSource;

impl SourceAdapter for CursorSource {
    fn id(&self) -> &str {
        "cursor"
    }

    fn display_name(&self) -> &str {
        "Cursor"
    }

    fn is_available(&self) -> bool {
        false
    }

    fn get_default_log_paths(&self) -> Vec<String> {
        Vec::new()
    }

    fn get_watch_paths(&self) -> Vec<String> {
        Vec::new()
    }

    async fn parse_session(&self, _file_path: &str) -> Option<Session> {
        None
    }

    async fn parse_all_sessions(&self) -> Vec<Session> {
        Vec::new()
    }
}
