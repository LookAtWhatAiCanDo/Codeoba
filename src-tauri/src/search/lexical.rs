use crate::models::Session;
use crate::search::{SearchFilter, SearchResult};
use regex::{Regex, RegexBuilder};

pub fn build_find_regex(query: &str, match_case: bool, whole_word: bool, use_regex: bool) -> Option<Regex> {
    if query.is_empty() {
        return None;
    }
    let pattern = if use_regex {
        query.to_string()
    } else {
        regex::escape(query)
    };
    let final_pattern = if whole_word {
        format!(r"\b{}\b", pattern)
    } else {
        pattern
    };

    RegexBuilder::new(&final_pattern)
        .case_insensitive(!match_case)
        .build()
        .ok()
}

pub fn lexical_search(
    sessions: &[Session],
    query: &str,
    filter: &SearchFilter,
) -> Vec<SearchResult> {
    if query.trim().is_empty() {
        let mut results: Vec<SearchResult> = sessions
            .iter()
            .filter(|s| filter.matches(s))
            .map(|s| SearchResult {
                session: s.clone(),
                matched_turn_indexes: Vec::new(),
                score: 1.0,
            })
            .collect();
        results.sort_by(|a, b| b.session.updated_at.cmp(&a.session.updated_at));
        return results;
    }

    let is_single_pattern = filter.use_regex || query.contains('\n');
    let regexes: Vec<Regex> = if is_single_pattern {
        build_find_regex(query, filter.match_case, filter.whole_word, filter.use_regex)
            .map(|r| vec![r])
            .unwrap_or_default()
    } else {
        let terms: Vec<&str> = query.split_whitespace().filter(|t| !t.is_empty()).collect();
        terms
            .iter()
            .filter_map(|t| build_find_regex(t, filter.match_case, filter.whole_word, false))
            .collect()
    };

    if regexes.is_empty() {
        return Vec::new();
    }

    let mut results = Vec::new();

    for session in sessions {
        if !filter.matches(session) {
            continue;
        }

        let mut score = 0.0;
        let mut matched_turn_indexes = Vec::new();

        let thread_name = session.thread_name.as_deref().unwrap_or("");
        let mut thread_name_matches = 0;
        for regex in &regexes {
            thread_name_matches += regex.find_iter(thread_name).count();
        }
        if thread_name_matches > 0 {
            score += thread_name_matches as f32 * 5.0;
        }

        let cwd = session.cwd.as_deref().unwrap_or("");
        if !cwd.is_empty() {
            let mut cwd_matches = 0;
            for regex in &regexes {
                cwd_matches += regex.find_iter(cwd).count();
            }
            if cwd_matches > 0 {
                score += cwd_matches as f32 * 2.0;
            }
        }

        for (index, turn) in session.turns.iter().enumerate() {
            let mut user_matches = 0;
            let mut assistant_matches = 0;
            for regex in &regexes {
                user_matches += regex.find_iter(&turn.user_message).count();
                assistant_matches += regex.find_iter(&turn.assistant_message).count();
            }
            let turn_matches = user_matches * 2 + assistant_matches * 1;
            if turn_matches > 0 {
                score += turn_matches as f32 * 1.0;
                matched_turn_indexes.push(index);
            }
        }

        if score > 0.0 {
            results.push(SearchResult {
                session: session.clone(),
                matched_turn_indexes,
                score,
            });
        }
    }

    results.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| b.session.updated_at.cmp(&a.session.updated_at))
    });

    results
}
