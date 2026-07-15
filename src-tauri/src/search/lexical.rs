use crate::models::Session;
use crate::search::{SearchFilter, SearchResult};
use rayon::prelude::*;
use regex::{Regex, RegexBuilder};

pub fn build_find_regex(
    query: &str,
    match_case: bool,
    whole_word: bool,
    use_regex: bool,
) -> Option<Regex> {
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

pub(crate) fn parse_query_terms(query: &str) -> Vec<String> {
    let mut terms = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;

    for c in query.chars() {
        if c == '"' {
            in_quotes = !in_quotes;
            if !in_quotes {
                let trimmed = current.trim();
                if !trimmed.is_empty() {
                    terms.push(trimmed.to_string());
                }
                current.clear();
            }
        } else if c.is_whitespace() && !in_quotes {
            let trimmed = current.trim();
            if !trimmed.is_empty() {
                terms.push(trimmed.to_string());
            }
            current.clear();
        } else {
            current.push(c);
        }
    }

    let trimmed = current.trim();
    if !trimmed.is_empty() {
        terms.push(trimmed.to_string());
    }

    terms
}

pub fn lexical_search<'a>(
    sessions: impl IntoIterator<Item = &'a Session>,
    query: &str,
    filter: &SearchFilter,
) -> Vec<SearchResult> {
    // Collect references, not clones: the caller can pass the live index without deep-cloning the
    // whole corpus per query. Only sessions that actually match are cloned (below).
    let sessions: Vec<&Session> = sessions.into_iter().collect();

    if query.trim().is_empty() {
        let mut results: Vec<SearchResult> = sessions
            .par_iter()
            .copied()
            .filter(|s| filter.matches(s))
            .map(|s| SearchResult {
                session: s.clone(),
                matched_turn_indexes: Vec::new(),
                score: 1.0,
            })
            .collect();
        results.sort_by_key(|r| std::cmp::Reverse(r.session.updated_at));
        return results;
    }

    let is_single_pattern = filter.use_regex || query.contains('\n');
    let regexes: Vec<Regex> = if is_single_pattern {
        build_find_regex(
            query,
            filter.match_case,
            filter.whole_word,
            filter.use_regex,
        )
        .map(|r| vec![r])
        .unwrap_or_default()
    } else {
        let mut terms = parse_query_terms(query);
        // Deduplicate query terms to avoid redundant regex operations
        terms.sort();
        terms.dedup();
        terms
            .iter()
            .filter_map(|t| build_find_regex(t, filter.match_case, filter.whole_word, false))
            .collect()
    };

    if regexes.is_empty() {
        return Vec::new();
    }

    let mut results: Vec<SearchResult> = sessions
        .into_par_iter()
        .filter_map(|session| {
            if !filter.matches(session) {
                return None;
            }

            let thread_name = session.thread_name.as_deref().unwrap_or("");
            let cwd = session.cwd.as_deref().unwrap_or("");

            // All query terms must match somewhere in the session (AND logic)
            let mut all_terms_match = true;
            for regex in &regexes {
                let matches_thread = regex.is_match(thread_name);
                let matches_cwd = !cwd.is_empty() && regex.is_match(cwd);
                let matches_turns = session.turns.iter().any(|turn| {
                    regex.is_match(&turn.user_message) || regex.is_match(&turn.assistant_message)
                });
                if !matches_thread && !matches_cwd && !matches_turns {
                    all_terms_match = false;
                    break;
                }
            }

            if !all_terms_match {
                return None;
            }

            let mut score = 0.0;
            let mut matched_turn_indexes = Vec::new();

            // 1. Thread name matches (Title boost - matches in title are heavily weighted)
            for regex in &regexes {
                let matches = regex.find_iter(thread_name).count();
                if matches > 0 {
                    score += matches as f32 * 10.0;
                }
            }

            // 2. Cwd matches
            if !cwd.is_empty() {
                for regex in &regexes {
                    let matches = regex.find_iter(cwd).count();
                    if matches > 0 {
                        score += matches as f32 * 3.0;
                    }
                }
            }

            // 3. Saturated Turn matches per query term (prevents stop word flooding in long sessions)
            for regex in &regexes {
                let mut term_turn_matches = 0;
                for (index, turn) in session.turns.iter().enumerate() {
                    let user_matches = regex.find_iter(&turn.user_message).count();
                    let assistant_matches = regex.find_iter(&turn.assistant_message).count();
                    let turn_matches = user_matches * 2 + assistant_matches;
                    if turn_matches > 0 {
                        term_turn_matches += turn_matches;
                        if !matched_turn_indexes.contains(&index) {
                            matched_turn_indexes.push(index);
                        }
                    }
                }
                if term_turn_matches > 0 {
                    // BM25-like saturation formula: TF * (k1 + 1) / (TF + k1) with k1 = 1.0. Capped at 2.0 per term.
                    let saturated_score =
                        (term_turn_matches as f32 * 2.0) / (term_turn_matches as f32 + 1.0);
                    score += saturated_score;
                }
            }

            matched_turn_indexes.sort_unstable();

            if score > 0.0 {
                Some(SearchResult {
                    session: session.clone(),
                    matched_turn_indexes,
                    score,
                })
            } else {
                None
            }
        })
        .collect();

    results.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| b.session.updated_at.cmp(&a.session.updated_at))
    });

    results
}
