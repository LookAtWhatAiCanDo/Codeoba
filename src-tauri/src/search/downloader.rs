use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::Emitter;
use futures_util::StreamExt;

const MODEL_URL: &str = "https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/onnx/model_quantized.onnx";
const VOCAB_URL: &str = "https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/vocab.txt";

pub fn get_model_dir() -> PathBuf {
    let home = crate::parsers::get_home_dir();
    let dir = home.join(".codeoba/models");
    let _ = fs::create_dir_all(&dir);
    dir
}

pub fn get_model_file() -> PathBuf {
    get_model_dir().join("model_quantized.onnx")
}

pub fn get_vocab_file() -> PathBuf {
    get_model_dir().join("vocab.txt")
}

pub fn is_model_downloaded() -> bool {
    let model = get_model_file();
    let vocab = get_vocab_file();
    model.exists() && model.metadata().map(|m| m.len()).unwrap_or(0) > 10_000_000
        && vocab.exists() && vocab.metadata().map(|m| m.len()).unwrap_or(0) > 100_000
}

pub fn delete_model_files() {
    let model = get_model_file();
    let vocab = get_vocab_file();
    if model.exists() {
        let _ = fs::remove_file(model);
    }
    if vocab.exists() {
        let _ = fs::remove_file(vocab);
    }
}

pub async fn download_model<R: tauri::Runtime>(app_handle: tauri::AppHandle<R>) -> Result<(), String> {
    let model_dir = get_model_dir();
    let temp_model = model_dir.join("model_quantized.onnx.tmp");
    let temp_vocab = model_dir.join("vocab.txt.tmp");

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

    // 1. Download vocab.txt (~232 KB, mapped to 0% - 2% of overall progress)
    crate::log_info!("Starting vocab download from {}", VOCAB_URL);
    download_file_with_progress(&client, VOCAB_URL, &temp_vocab, 0.0, 0.02, emit_prog.clone()).await?;

    // 2. Download model_quantized.onnx (~22.9 MB, mapped to 2% - 100% of overall progress)
    crate::log_info!("Starting model download from {}", MODEL_URL);
    download_file_with_progress(&client, MODEL_URL, &temp_model, 0.02, 1.0, emit_prog.clone()).await?;

    // Atomic rename
    let model_dest = get_model_file();
    let vocab_dest = get_vocab_file();

    if temp_vocab.exists() && temp_model.exists() {
        fs::rename(&temp_vocab, &vocab_dest).map_err(|e| format!("Failed to rename vocab.txt: {}", e))?;
        fs::rename(&temp_model, &model_dest).map_err(|e| format!("Failed to rename model_quantized.onnx: {}", e))?;
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
