use std::path::PathBuf;
use std::sync::{OnceLock, RwLock};
use tokenizers::Tokenizer;
use std::collections::HashMap;

static CUSTOM_TOKENIZERS: OnceLock<RwLock<HashMap<String, Tokenizer>>> = OnceLock::new();

fn get_custom_tokenizers() -> &'static RwLock<HashMap<String, Tokenizer>> {
    CUSTOM_TOKENIZERS.get_or_init(|| RwLock::new(HashMap::new()))
}

/// Returns the config directory for Codeoba.
fn get_config_dir() -> PathBuf {
    let home = crate::parsers::get_home_dir();
    home.join(".codeoba")
}

/// Loads a tokenizer for a specific model from ~/.codeoba/tokenizers/<model_family>.json.
fn load_custom_tokenizer(model_family: &str) -> Option<Tokenizer> {
    let config_dir = get_config_dir();
    let tokenizer_path = config_dir.join("tokenizers").join(format!("{}.json", model_family));
    
    if tokenizer_path.exists() && tokenizer_path.is_file() {
        Tokenizer::from_file(&tokenizer_path).ok()
    } else {
        // Check for a default generic one
        let default_path = config_dir.join("tokenizer.json");
        if default_path.exists() && default_path.is_file() {
            Tokenizer::from_file(&default_path).ok()
        } else {
            None
        }
    }
}

/// Normalizes a model name to a standard family.
fn get_model_family(model_name: &str) -> &'static str {
    let lower = model_name.to_lowercase();
    if lower.contains("gpt-4") || lower.contains("gpt-3.5") || lower.contains("o1") {
        "cl100k_base"
    } else if lower.contains("claude") {
        "claude"
    } else if lower.contains("llama") {
        "llama"
    } else if lower.contains("gemini") {
        "gemini"
    } else {
        "generic"
    }
}

/// Estimates the number of tokens in a text string.
/// If a custom tokenizer JSON exists in ~/.codeoba/tokenizers/<family>.json, it uses it for 100% precision.
/// Otherwise, it uses a calibrated byte-count scale/offset ratio based on the model family.
pub fn estimate_tokens(text: &str, model_name: &str) -> i64 {
    if text.is_empty() {
        return 0;
    }

    let family = get_model_family(model_name);
    
    // Try to use custom tokenizer if loaded
    let cached = {
        let guard = get_custom_tokenizers().read().unwrap();
        guard.get(family).cloned()
    };

    if let Some(tokenizer) = cached {
        if let Ok(encoding) = tokenizer.encode(text, true) {
            return encoding.get_ids().len() as i64;
        }
    }

    // Try loading it on cache miss
    if let Some(tokenizer) = load_custom_tokenizer(family) {
        let mut guard = get_custom_tokenizers().write().unwrap();
        guard.insert(family.to_string(), tokenizer.clone());
        if let Ok(encoding) = tokenizer.encode(text, true) {
            return encoding.get_ids().len() as i64;
        }
    }

    // Calibrated estimation fallback based on average byte-to-token ratios
    let byte_count = text.len() as f64;
    
    // Calibrated scales:
    // cl100k_base/gpt-4: average ~3.8 chars per token -> scale = 1 / 3.8 = 0.263
    // Claude: average ~3.9 chars per token -> scale = 1 / 3.9 = 0.256
    // Gemini: average ~4.0 chars per token -> scale = 0.25
    let (scale, offset) = match family {
        "cl100k_base" => (0.263, 2.0),
        "claude" => (0.256, 3.0),
        "gemini" => (0.250, 1.0),
        "llama" => (0.280, 2.0),
        _ => (0.260, 2.0), // generic fallback
    };

    let estimated = (byte_count * scale + offset) as i64;
    estimated.max(1) // if text is not empty, it's at least 1 token
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_estimate_tokens_empty() {
        assert_eq!(estimate_tokens("", "gpt-4"), 0);
    }

    #[test]
    fn test_estimate_tokens_calibrated() {
        // Calibrated estimation check for cl100k_base family
        let text = "Hello world"; // 11 chars
        // 11 * 0.263 + 2.0 = 4.893 -> 4 tokens
        let count = estimate_tokens(text, "gpt-4");
        assert_eq!(count, 4);

        // Calibrated estimation check for Claude family
        // 11 * 0.256 + 3.0 = 5.816 -> 5 tokens
        let count_claude = estimate_tokens(text, "claude-3-sonnet");
        assert_eq!(count_claude, 5);
    }

    #[test]
    fn test_load_custom_tokenizer() {
        // Create a temporary mock home directory
        let temp_dir = tempfile::tempdir().unwrap();
        let original_home = std::env::var_os("HOME");
        std::env::set_var("HOME", temp_dir.path());

        // Create mock ~/.codeoba/tokenizer.json
        let config_dir = temp_dir.path().join(".codeoba");
        fs::create_dir_all(&config_dir).unwrap();

        // Write a simple valid WordLevel tokenizer JSON configuration
        let simple_config = r#"{
            "version": "1.0",
            "normalizer": null,
            "pre_tokenizer": {
                "type": "Whitespace"
            },
            "post_processor": null,
            "decoder": null,
            "model": {
                "type": "WordLevel",
                "vocab": {
                    "[UNK]": 0,
                    "Hello": 1,
                    "world": 2
                },
                "unk_token": "[UNK]"
            }
        }"#;

        fs::write(config_dir.join("tokenizer.json"), simple_config).unwrap();

        // Clear custom tokenizers cache to force reload
        {
            let mut guard = get_custom_tokenizers().write().unwrap();
            guard.clear();
        }

        // "Hello world" will be split into "Hello" (id 1) and "world" (id 2) -> 2 tokens
        let count = estimate_tokens("Hello world", "gpt-4");
        assert_eq!(count, 2);

        // Restore original HOME
        if let Some(h) = original_home {
            std::env::set_var("HOME", h);
        } else {
            std::env::remove_var("HOME");
        }
    }
}

