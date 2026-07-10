use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::Path;
use tauri::Emitter;
use futures_util::StreamExt;
use sha2::{Digest, Sha256};

pub fn verify_file_hash(path: &Path, expected_hash: &str) -> Result<(), String> {
    let mut file = File::open(path).map_err(|e| format!("Failed to open file for hash check: {}", e))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 8192];
    loop {
        let count = file.read(&mut buffer).map_err(|e| format!("Failed to read file for hash check: {}", e))?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    let hash = hex::encode(hasher.finalize());
    if hash == expected_hash {
        Ok(())
    } else {
        Err(format!(
            "Integrity check failed: expected {}, got {}",
            expected_hash, hash
        ))
    }
}


use super::{
    get_home_model_dir, get_home_model_file, get_home_vocab_file,
    MODEL_FILENAME, VOCAB_FILENAME, EXPECTED_MODEL_HASH, EXPECTED_VOCAB_HASH,
};

pub const MODEL_BASE_URL: &str = "https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/";

pub fn delete_model_files() {
    let model = get_home_model_file();
    let vocab = get_home_vocab_file();
    if model.exists() {
        let _ = fs::remove_file(model);
    }
    if vocab.exists() {
        let _ = fs::remove_file(vocab);
    }
    // Also clean up any legacy model_quantized.onnx
    let legacy_model = get_home_model_dir().join("model_quantized.onnx");
    if legacy_model.exists() {
        let _ = fs::remove_file(legacy_model);
    }
}

pub async fn download_model<R: tauri::Runtime>(app_handle: tauri::AppHandle<R>) -> Result<(), String> {
    let model_dir = get_home_model_dir();
    let temp_model = model_dir.join(format!("{}.tmp", MODEL_FILENAME));
    let temp_vocab = model_dir.join(format!("{}.tmp", VOCAB_FILENAME));

    // Clean up any stale temp files
    if temp_model.exists() {
        let _ = fs::remove_file(&temp_model);
    }
    if temp_vocab.exists() {
        let _ = fs::remove_file(&temp_vocab);
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    let handle_clone = app_handle.clone();
    let emit_prog = move |progress: f32| {
        let _ = handle_clone.emit("semantic-model-download-progress", progress);
    };

    let vocab_url = format!("{}{}", MODEL_BASE_URL, VOCAB_FILENAME);
    let model_url = format!("{}onnx/{}", MODEL_BASE_URL, MODEL_FILENAME);

    // 1. Download vocab.txt (~232 KB, mapped to 0% - 2% of overall progress)
    crate::log_info!("Starting vocab download from {}", vocab_url);
    download_file_with_progress(&client, &vocab_url, &temp_vocab, 0.0, 0.02, emit_prog.clone()).await?;

    // 2. Download model.onnx (~90.3 MB, mapped to 2% - 100% of overall progress)
    crate::log_info!("Starting model download from {}", model_url);
    download_file_with_progress(&client, &model_url, &temp_model, 0.02, 1.0, emit_prog.clone()).await?;

    // Atomic rename
    let model_dest = get_home_model_file();
    let vocab_dest = get_home_vocab_file();

    if temp_vocab.exists() && temp_model.exists() {
        // Verify integrity of downloaded files before final rename
        verify_file_hash(&temp_vocab, EXPECTED_VOCAB_HASH)
            .map_err(|e| format!("Vocab integrity check failed: {}", e))?;
        verify_file_hash(&temp_model, EXPECTED_MODEL_HASH)
            .map_err(|e| format!("Model integrity check failed: {}", e))?;

        fs::rename(&temp_vocab, &vocab_dest).map_err(|e| format!("Failed to rename {}: {}", VOCAB_FILENAME, e))?;
        fs::rename(&temp_model, &model_dest).map_err(|e| format!("Failed to rename {}: {}", MODEL_FILENAME, e))?;
        crate::log_info!("Semantic search model downloaded successfully to {:?}", model_dir);
        // Emit final 1.0 progress to be sure
        let _ = app_handle.emit("semantic-model-download-progress", 1.0f32);
        Ok(())
    } else {
        Err("Failed to verify downloaded model files. Please try again.".to_string())
    }
}

async fn download_file_with_progress<F>(
    client: &reqwest::Client,
    url: &str,
    dest_path: &Path,
    prog_start: f32,
    prog_end: f32,
    emit_progress: F,
) -> Result<(), String>
where
    F: Fn(f32) + Clone,
{
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Server returned error status: {}", response.status()));
    }

    let total_size = response.content_length().unwrap_or(0);
    let mut file = File::create(dest_path)
        .map_err(|e| format!("Failed to create destination file: {}", e))?;

    let mut stream = response.bytes_stream();
    let mut downloaded = 0u64;

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("Error downloading chunk: {}", e))?;
        file.write_all(&chunk)
            .map_err(|e| format!("Failed to write chunk to file: {}", e))?;

        downloaded += chunk.len() as u64;

        if total_size > 0 {
            let file_progress = downloaded as f32 / total_size as f32;
            let overall_progress = prog_start + file_progress * (prog_end - prog_start);
            emit_progress(overall_progress);
        }
    }

    file.flush().map_err(|e| format!("Failed to flush file: {}", e))?;
    Ok(())
}
