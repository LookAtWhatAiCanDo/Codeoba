// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() > 1 && args.get(1).map(|s| s.as_str()) == Some("search") {
        if args.len() < 3 {
            println!("Usage: cargo run -- search \"<query>\"");
            return;
        }
        let query = match args.get(2) {
            Some(q) => q,
            None => return,
        };

        println!("==================================================");
        println!("           Codeoba CLI Search Tool                ");
        println!("==================================================");
        println!("Query: \"{}\"", query);
        println!("Mode:  Lexical");
        println!("Indexing sessions... please wait...");

        tauri::async_runtime::block_on(async {
            let state = codeoba_lib::search::SearchIndexState::new();
            if let Err(e) = state.rebuild(None::<tauri::AppHandle>).await {
                println!("Error building index: {}", e);
                return;
            }

            let sessions = {
                let guard = state.sessions.read().unwrap_or_else(|e| e.into_inner());
                println!("Total sessions in index: {}", guard.len());
                guard.values().cloned().collect::<Vec<_>>()
            };

            let filter = codeoba_lib::search::SearchFilter::default();

            let search_start = std::time::Instant::now();
            let results = codeoba_lib::search::lexical::lexical_search(&sessions, query, &filter);
            println!("[main] Search execution time: {:?}", search_start.elapsed());

            let print_start = std::time::Instant::now();
            println!("\nFound {} matching session(s):\n", results.len());
            for (idx, result) in results.iter().enumerate() {
                let thread_name = result.session.thread_name.as_deref().unwrap_or("Untitled");
                println!(
                    "{}. [{}] {} (Score: {:.4})",
                    idx + 1,
                    result.session.source_id,
                    thread_name,
                    result.score
                );
                println!("   Path: {}", result.session.file_path);
                if !result.matched_turn_indexes.is_empty() {
                    println!("   Matched turn indexes: {:?}", result.matched_turn_indexes);
                    if let Some(&turn_idx) = result.matched_turn_indexes.first() {
                        if let Some(turn) = result.session.turns.get(turn_idx) {
                            // Char-based, not byte-based: slicing &s[0..80] panics when
                            // byte 80 lands inside a multi-byte UTF-8 character.
                            let user_snippet = if turn.user_message.chars().count() > 80 {
                                format!(
                                    "{}...",
                                    turn.user_message
                                        .chars()
                                        .take(80)
                                        .collect::<String>()
                                        .replace("\n", " ")
                                )
                            } else {
                                turn.user_message.replace("\n", " ")
                            };
                            println!("   Snippet (Turn {}): {}", turn_idx, user_snippet);
                        }
                    }
                }
                println!();
            }
            println!("[main] Printing results time: {:?}", print_start.elapsed());
        });
        println!("==================================================");
    } else {
        codeoba_lib::run()
    }
}
