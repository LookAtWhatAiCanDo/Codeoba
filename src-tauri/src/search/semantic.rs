use crate::models::Session;
use crate::search::{SearchFilter, SearchResult, SessionVectorIndex};
use rayon::prelude::*;
use std::path::Path;
use std::sync::Arc;
use tract_onnx::prelude::tract_ndarray::Array2;
use tract_onnx::prelude::*;

pub struct OnnxSemanticEmbedder {
    runnable: Arc<TypedRunnableModel>,
    tokenizer: super::tokenizer::WordPieceTokenizer,
}

impl OnnxSemanticEmbedder {
    pub fn new(model_path: &Path, vocab_path: &Path) -> Result<Self, String> {
        let tokenizer = super::tokenizer::WordPieceTokenizer::new(vocab_path)?;

        let runnable = tract_onnx::onnx()
            .model_for_path(model_path)
            .map_err(|e| e.to_string())?
            .into_optimized()
            .map_err(|e| e.to_string())?
            .into_runnable()
            .map_err(|e| e.to_string())?;

        Ok(Self {
            runnable,
            tokenizer,
        })
    }

    pub fn get_embeddings(&self, text: &str) -> Result<Vec<f32>, String> {
        let tokenized = self.tokenizer.tokenize_to_ids(text, 256);
        let seq_len = tokenized.input_ids.len();

        let input_ids_array =
            Array2::from_shape_vec((1, seq_len), tokenized.input_ids).map_err(|e| e.to_string())?;
        let attention_mask_array =
            Array2::from_shape_vec((1, seq_len), tokenized.attention_mask.clone())
                .map_err(|e| e.to_string())?;
        let token_type_ids_array = Array2::from_shape_vec((1, seq_len), tokenized.token_type_ids)
            .map_err(|e| e.to_string())?;

        let input_ids_val = Tensor::from(input_ids_array);
        let attention_mask_val = Tensor::from(attention_mask_array);
        let token_type_ids_val = Tensor::from(token_type_ids_array);

        let mut outputs = self
            .runnable
            .run(tvec![
                input_ids_val.into(),
                attention_mask_val.into(),
                token_type_ids_val.into(),
            ])
            .map_err(|e| e.to_string())?;

        let output_value = outputs.remove(0).into_tensor();

        let shape = output_value.shape();
        let dim = shape[2] as usize;
        let array_view = output_value
            .to_plain_array_view::<f32>()
            .map_err(|e| e.to_string())?;
        let slice = array_view
            .as_slice()
            .ok_or_else(|| "Tensor is not contiguous".to_string())?;

        // Mean Pooling
        let mut sentence_embedding = vec![0.0f32; dim];
        let mut valid_count = 0;

        for i in 0..seq_len {
            if i < tokenized.attention_mask.len() && tokenized.attention_mask[i] == 1 {
                for d in 0..dim {
                    sentence_embedding[d] += slice[i * dim + d];
                }
                valid_count += 1;
            }
        }

        if valid_count > 0 {
            for se in &mut sentence_embedding {
                *se /= valid_count as f32;
            }
        }

        // L2 Normalization
        let mut sum_squares = 0.0;
        for &v in &sentence_embedding {
            sum_squares += v * v;
        }
        let magnitude = sum_squares.sqrt();
        if magnitude > 0.0 {
            for se in &mut sentence_embedding {
                *se /= magnitude;
            }
        }

        Ok(sentence_embedding)
    }
}

pub struct HashSemanticEmbedder {
    dimensions: usize,
}

impl HashSemanticEmbedder {
    pub fn new(dimensions: usize) -> Self {
        Self { dimensions }
    }

    pub fn get_embeddings(&self, text: &str) -> Vec<f32> {
        let mut vector = vec![0.0f32; self.dimensions];
        let words = tokenize_to_simple_words(text);
        if words.is_empty() {
            return vector;
        }

        for word in words {
            let hash = calculate_word_hash(&word);
            let mut rng = SimpleRng::new(hash);
            for v in &mut vector {
                let weight = rng.next_float() * 2.0 - 1.0;
                *v += weight;
            }
        }

        // L2 Normalization
        let mut sum_squares = 0.0;
        for &v in &vector {
            sum_squares += v * v;
        }
        let magnitude = sum_squares.sqrt();
        if magnitude > 0.0 {
            for v in &mut vector {
                *v /= magnitude;
            }
        }

        vector
    }
}

fn tokenize_to_simple_words(text: &str) -> Vec<String> {
    text.to_lowercase()
        .split(|c: char| c.is_whitespace())
        .filter(|t| !t.is_empty())
        .map(|s| s.to_string())
        .collect()
}

fn calculate_word_hash(word: &str) -> i32 {
    let mut hash = 0i32;
    for c in word.chars() {
        hash = hash.wrapping_mul(31).wrapping_add(c as i32);
    }
    hash
}

struct SimpleRng {
    seed: u64,
}

impl SimpleRng {
    fn new(seed: i32) -> Self {
        Self {
            seed: (seed as u64) & 0xFFFFFFFF,
        }
    }

    fn next_float(&mut self) -> f32 {
        self.seed = self.seed.wrapping_mul(0x5DEECE66D).wrapping_add(0xB) & 0xFFFFFFFFFFFF;
        let bits = (self.seed >> 24) as u32;
        (bits as f32) / 16777216.0f32
    }
}

pub fn semantic_search<'a>(
    sessions: impl IntoIterator<Item = &'a Session>,
    embeddings: &std::collections::HashMap<String, SessionVectorIndex>,
    query_vector: &[f32],
    similarity_threshold: f32,
    filter: &SearchFilter,
) -> Vec<SearchResult> {
    let sessions: Vec<&Session> = sessions.into_iter().collect();

    let mut results: Vec<SearchResult> = sessions
        .into_par_iter()
        .filter_map(|session| {
            if !filter.matches(session) {
                return None;
            }

            let index = embeddings.get(&session.id)?;

            let mut max_similarity = -1.0f32;
            let mut matched_turn_indexes = Vec::new();

            if !index.thread_name_embedding.is_empty() && !query_vector.is_empty() {
                let sim = cosine_similarity(query_vector, &index.thread_name_embedding);
                if sim > max_similarity {
                    max_similarity = sim;
                }
            }

            for (idx, turn_emb) in index.turn_embeddings.iter().enumerate() {
                if turn_emb.is_empty() || query_vector.is_empty() {
                    continue;
                }
                let sim = cosine_similarity(query_vector, turn_emb);
                if sim >= similarity_threshold {
                    matched_turn_indexes.push(idx);
                }
                if sim > max_similarity {
                    max_similarity = sim;
                }
            }

            if max_similarity >= similarity_threshold {
                Some(SearchResult {
                    session: session.clone(),
                    matched_turn_indexes,
                    score: max_similarity,
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

/// Cosine similarity of two embedding vectors.
///
/// Every embedding here is L2-normalized at construction (see `OnnxSemanticEmbedder` and
/// `HashSemanticEmbedder`), so cosine similarity reduces to the plain dot product. We therefore
/// skip recomputing both magnitudes on every comparison (N sessions × M turns × 384 dims per
/// query). A zero vector yields 0, matching the previous behavior.
fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let mut dot_product = 0.0;
    for i in 0..a.len() {
        dot_product += a[i] * b[i];
    }
    dot_product
}
