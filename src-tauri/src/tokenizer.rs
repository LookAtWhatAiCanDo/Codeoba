/// Estimates the number of tokens in a text string.
/// Uses a calibrated character-count scale/offset ratio based on the model family.
pub fn estimate_tokens(text: &str, model_name: &str) -> i64 {
    if text.is_empty() {
        return 0;
    }

    let lower = model_name.to_lowercase();
    let family = if lower.contains("gpt-4") || lower.contains("gpt-3.5") || lower.contains("o1") {
        "cl100k_base"
    } else if lower.contains("claude") {
        "claude"
    } else if lower.contains("llama") {
        "llama"
    } else if lower.contains("gemini") {
        "gemini"
    } else {
        "generic"
    };

    // Calibrated estimation fallback based on average character-to-token ratios.
    // Must count characters, not bytes: the scales below are chars-per-token, and text.len()
    // (bytes) overcounts multi-byte scripts ~3x (e.g. CJK), inflating token estimates for the
    // zh/ja/ko locales.
    let char_count = text.chars().count() as f64;

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

    let estimated = (char_count * scale + offset) as i64;
    estimated.max(1) // if text is not empty, it's at least 1 token
}

pub fn clear_custom_tokenizers_cache() {
    // No-op stub since caching is removed with the tokenizers dependency
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_estimate_tokens_empty() {
        assert_eq!(estimate_tokens("", "gpt-4"), 0);
    }

    #[test]
    fn test_estimate_tokens_calibrated() {
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
    fn test_estimate_tokens_counts_chars_not_bytes() {
        // 4 CJK chars = 12 bytes. The estimate must be driven by the 4 characters:
        //   chars: 4 * 0.263 + 2.0 = 3.05 -> 3
        //   bytes: 12 * 0.263 + 2.0 = 5.15 -> 5
        let cjk = estimate_tokens("你好世界", "gpt-4");
        assert_eq!(cjk, 3);

        // A pure-ASCII string of the same character count yields the same estimate.
        let ascii = estimate_tokens("abcd", "gpt-4");
        assert_eq!(cjk, ascii);
    }
}
