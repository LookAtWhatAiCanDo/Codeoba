use any_tts::{load_model, ModelType, SynthesisRequest, TtsConfig, TtsModel};
use lazy_static::lazy_static;
use std::sync::Mutex;
use tauri::{path::BaseDirectory, AppHandle, Manager};

lazy_static! {
    static ref MODEL: Mutex<Option<Box<dyn TtsModel>>> = Mutex::new(None);
}

/// Prewarm the TTS model by loading it into memory if not already loaded.
pub fn prewarm(app_handle: &AppHandle) -> Result<(), String> {
    let mut lock = MODEL
        .lock()
        .map_err(|e| format!("Failed to lock TTS engine: {}", e))?;

    if lock.is_none() {
        let tts_dir = app_handle
            .path()
            .resolve("resources/tts", BaseDirectory::Resource)
            .map_err(|e| {
                let err_msg = format!("Failed to resolve tts path: {}", e);
                eprintln!("[TTS Engine] {}", err_msg);
                err_msg
            })?;

        eprintln!("[TTS Engine] Prewarming: Resolved tts_dir: {:?}", tts_dir);

        if !tts_dir.exists() {
            let err_msg = format!("Offline TTS resources not found at {:?}", tts_dir);
            eprintln!("[TTS Engine] Prewarming: {}", err_msg);
            return Err(err_msg);
        }

        let config = TtsConfig::new(ModelType::Kokoro)
            .with_model_path(tts_dir.to_string_lossy().to_string());

        let loaded = load_model(config).map_err(|e| {
            let err_msg = format!("Failed to load Kokoro model: {}", e);
            eprintln!("[TTS Engine] Prewarming: {}", err_msg);
            err_msg
        })?;

        *lock = Some(loaded);
    }
    Ok(())
}

/// Helper function to synthesize speech offline using embedded Kokoro-82M model.
/// Returns WAV file bytes on success.
pub fn synthesize_offline(
    app_handle: &AppHandle,
    text: &str,
    voice: &str,
) -> Result<Vec<u8>, String> {
    let mut lock = MODEL
        .lock()
        .map_err(|e| format!("Failed to lock TTS engine: {}", e))?;

    if lock.is_none() {
        let tts_dir = app_handle
            .path()
            .resolve("resources/tts", BaseDirectory::Resource)
            .map_err(|e| {
                let err_msg = format!("Failed to resolve tts path: {}", e);
                eprintln!("[TTS Engine] {}", err_msg);
                err_msg
            })?;

        eprintln!("[TTS Engine] Resolved tts_dir: {:?}", tts_dir);

        if !tts_dir.exists() {
            let err_msg = format!("Offline TTS resources not found at {:?}", tts_dir);
            eprintln!("[TTS Engine] {}", err_msg);
            return Err(err_msg);
        }

        let config = TtsConfig::new(ModelType::Kokoro)
            .with_model_path(tts_dir.to_string_lossy().to_string());

        let loaded = load_model(config).map_err(|e| {
            let err_msg = format!("Failed to load Kokoro model: {}", e);
            eprintln!("[TTS Engine] {}", err_msg);
            err_msg
        })?;

        *lock = Some(loaded);
    }

    if let Some(ref model) = *lock {
        // Map voice prefixes to ISO language codes for Kokoro
        let lang = if voice.starts_with("af_") || voice.starts_with("am_") {
            "en"
        } else if voice.starts_with("bf_") || voice.starts_with("bm_") {
            "en-gb"
        } else if voice.starts_with("jf_") || voice.starts_with("jm_") {
            "ja"
        } else if voice.starts_with("zf_") || voice.starts_with("zm_") {
            "zh"
        } else if voice.starts_with("kf_") || voice.starts_with("km_") {
            "ko"
        } else if voice.starts_with("ff_") || voice.starts_with("fm_") {
            "fr"
        } else if voice.starts_with("df_") || voice.starts_with("dm_") {
            "de"
        } else if voice.starts_with("if_") || voice.starts_with("im_") {
            "it"
        } else if voice.starts_with("pf_") || voice.starts_with("pm_") {
            "pt"
        } else if voice.starts_with("es_") || voice.starts_with("es-") {
            "es"
        } else {
            "en" // default fallback
        };

        let request = SynthesisRequest::new(text)
            .with_language(lang)
            .with_voice(voice);

        let mut audio = model.synthesize(&request).map_err(|e| {
            let err_msg = format!("Failed to synthesize speech: {}", e);
            eprintln!("[TTS Engine] {}", err_msg);
            err_msg
        })?;

        // Prepend 150ms of digital silence (zero samples) to prevent OS audio wake-up clipping.
        // At 24000Hz sample rate, 150ms is 3600 samples.
        let silence_len = (audio.sample_rate as f32 * 0.15) as usize;
        let mut padded = vec![0.0f32; silence_len];
        padded.extend_from_slice(&audio.samples);
        audio.samples = padded;

        Ok(audio.get_wav())
    } else {
        let err_msg = "TTS engine not initialized".to_string();
        eprintln!("[TTS Engine] {}", err_msg);
        Err(err_msg)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_load_and_synthesize() {
        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let tts_dir = manifest_dir.join("resources").join("tts");
        if !tts_dir.join("kokoro-v1_0.pth").exists() {
            println!("Skipping test: kokoro-v1_0.pth not found in resources");
            return;
        }
        let config = TtsConfig::new(ModelType::Kokoro)
            .with_model_path(tts_dir.to_string_lossy().to_string());
        let model = load_model(config).expect("Failed to load Kokoro model");
        let test_txt = "WKWebView";

        let request = SynthesisRequest::new(test_txt)
            .with_language("en")
            .with_voice("af_heart");
        let audio = model
            .synthesize(&request)
            .expect("Failed to synthesize speech");
        let wav = audio.get_wav();
        assert!(!wav.is_empty());
    }
}
