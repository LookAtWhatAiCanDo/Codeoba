const fs = require('fs');
const path = require('path');

const resourcesDir = path.join(__dirname, '..', 'src-tauri', 'resources');
const ttsDir = path.join(resourcesDir, 'tts');
const voicesDir = path.join(ttsDir, 'voices');
const onnxDir = path.join(resourcesDir, 'onnx');

// Hugging Face base URLs for assets
const HF_ONNX_BASE_URL = 'https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main';
const HF_KOKORO_BASE_URL = 'https://huggingface.co/hexgrad/Kokoro-82M/resolve/main';

async function fetchVoicesFromHF() {
  console.log("Fetching voices list from Hugging Face Model API...");
  try {
    const response = await fetch("https://huggingface.co/api/models/hexgrad/Kokoro-82M");
    if (!response.ok) {
      throw new Error(`HF API HTTP status ${response.status}`);
    }
    const data = await response.json();
    const voiceFiles = data.siblings
      .map(s => s.rfilename)
      .filter(f => f.startsWith("voices/") && f.endsWith(".pt"));

    if (voiceFiles.length === 0) {
      throw new Error("No voices found in Hugging Face repository siblings list.");
    }

    const mappedVoices = voiceFiles.map(f => {
      const name = f.substring("voices/".length, f.length - ".pt".length);
      // Map name prefix to readable label
      let labelSuffix = "";
      if (name.startsWith("af_")) labelSuffix = "en-us female";
      else if (name.startsWith("am_")) labelSuffix = "en-us male";
      else if (name.startsWith("bf_")) labelSuffix = "en-gb female";
      else if (name.startsWith("bm_")) labelSuffix = "en-gb male";
      else if (name.startsWith("zf_")) labelSuffix = "zh-cn female";
      else if (name.startsWith("zm_")) labelSuffix = "zh-cn male";
      else if (name.startsWith("jf_")) labelSuffix = "ja-jp female";
      else if (name.startsWith("jm_")) labelSuffix = "ja-jp male";
      else if (name.startsWith("ef_")) labelSuffix = "es-es female";
      else if (name.startsWith("em_")) labelSuffix = "es-es male";
      else if (name.startsWith("ff_")) labelSuffix = "fr-fr female";
      else if (name.startsWith("fm_")) labelSuffix = "fr-fr male";
      else if (name.startsWith("if_")) labelSuffix = "it-it female";
      else if (name.startsWith("im_")) labelSuffix = "it-it male";
      else if (name.startsWith("pf_")) labelSuffix = "pt-br female";
      else if (name.startsWith("pm_")) labelSuffix = "pt-br male";
      else if (name.startsWith("hf_")) labelSuffix = "hi-in female";
      else if (name.startsWith("hm_")) labelSuffix = "hi-in male";
      else {
        // Fallback gender based on 'f' or 'm' in prefix
        const secondChar = name.split('_')[0]?.charAt(1) || '';
        labelSuffix = secondChar === 'f' ? 'female' : 'male';
      }
      return {
        name,
        label: `${name} (${labelSuffix})`
      };
    });
    return mappedVoices;
  } catch (err) {
    console.warn("Failed to fetch voices list from Hugging Face, falling back to local/default seed. Error:", err);
    return null;
  }
}

function getFallbackVoices() {
  const jsonPath = path.join(__dirname, '..', 'src', 'utils', 'kokoro_voices.json');
  if (fs.existsSync(jsonPath)) {
    try {
      return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    } catch (e) {
      console.warn("Failed to parse local voices fallback json:", e);
    }
  }
  return [
    { name: "af_heart", label: "af_heart (en-us female)" }
  ];
}

async function downloadFile(url, destPath) {
  const tempPath = destPath + '.tmp';
  console.log(`Downloading ${url} -> ${destPath}...`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: HTTP status ${response.status}`);
  }
  const fileStream = fs.createWriteStream(tempPath);
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    fileStream.write(Buffer.from(value));
  }
  fileStream.end();
  
  // Clean up and rename
  if (fs.existsSync(destPath)) {
    fs.unlinkSync(destPath);
  }
  fs.renameSync(tempPath, destPath);
  console.log(`Successfully saved: ${destPath}`);
}

async function downloadFileIfModified(url, destPath) {
  if (!fs.existsSync(destPath)) {
    await downloadFile(url, destPath);
    return;
  }

  const headers = {};
  const stats = fs.statSync(destPath);
  headers['If-Modified-Since'] = stats.mtime.toUTCString();

  console.log(`Checking update for ${url} -> ${destPath}...`);
  try {
    const response = await fetch(url, { headers });
    if (response.status === 304) {
      console.log(`${path.basename(destPath)} is up to date (304 Not Modified).`);
      return;
    }
    if (!response.ok) {
      throw new Error(`HTTP status ${response.status}`);
    }

    const tempPath = destPath + '.tmp';
    console.log(`Downloading update: ${url} -> ${destPath}...`);
    const fileStream = fs.createWriteStream(tempPath);
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fileStream.write(Buffer.from(value));
    }
    fileStream.end();

    if (fs.existsSync(destPath)) {
      fs.unlinkSync(destPath);
    }
    fs.renameSync(tempPath, destPath);
    console.log(`Successfully updated: ${destPath}`);
  } catch (err) {
    console.warn(`[Asset Cache] Failed to check modification status for ${url}, keeping existing file. Error:`, err);
  }
}

function isPlaceholder(filePath, minSize = 1024) {
  if (!fs.existsSync(filePath)) {
    return true;
  }
  const stats = fs.statSync(filePath);
  if (stats.size < minSize) {
    return true;
  }
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    if (content.includes('placeholder')) {
      return true;
    }
  } catch (e) {
    // If it's a large binary file, readFileSync might fail or not be UTF-8
  }
  return false;
}

async function main() {
  // Ensure directories exist
  if (!fs.existsSync(resourcesDir)) {
    fs.mkdirSync(resourcesDir, { recursive: true });
  }
  if (!fs.existsSync(ttsDir)) {
    fs.mkdirSync(ttsDir, { recursive: true });
  }
  if (!fs.existsSync(voicesDir)) {
    fs.mkdirSync(voicesDir, { recursive: true });
  }
  if (!fs.existsSync(onnxDir)) {
    fs.mkdirSync(onnxDir, { recursive: true });
  }

  // Discover and configure voices dynamically
  let kokoroVoices = await fetchVoicesFromHF();
  if (!kokoroVoices) {
    kokoroVoices = getFallbackVoices();
  } else {
    const jsonPath = path.join(__dirname, '..', 'src', 'utils', 'kokoro_voices.json');
    try {
      fs.writeFileSync(jsonPath, JSON.stringify(kokoroVoices, null, 2), 'utf8');
      console.log(`Saved dynamic voices configuration file to: ${jsonPath}`);
    } catch (err) {
      console.error("Failed to write dynamic voices config file:", err);
    }
  }

  const voicesToDownload = kokoroVoices.map(v => v.name);

  // === 1. ONNX Semantic Search Model ===
  console.log('Checking ONNX semantic search model...');
  const onnxModelPath = path.join(onnxDir, 'model.onnx');
  if (isPlaceholder(onnxModelPath, 1024 * 1024 * 10)) { // 10MB minimum
    await downloadFile(`${HF_ONNX_BASE_URL}/onnx/model.onnx`, onnxModelPath);
  } else {
    console.log('ONNX search model.onnx is already present and valid.');
  }

  const onnxVocabPath = path.join(onnxDir, 'vocab.txt');
  if (isPlaceholder(onnxVocabPath, 1024 * 10)) { // 10KB minimum
    await downloadFile(`${HF_ONNX_BASE_URL}/vocab.txt`, onnxVocabPath);
  } else {
    console.log('ONNX search vocab.txt is already present and valid.');
  }

  // === 2. Offline TTS Weights ===
  console.log('Checking Offline TTS model...');
  const dummySafetensors = path.join(ttsDir, 'model.safetensors');
  if (isPlaceholder(dummySafetensors, 1024 * 1024 * 10)) {
    if (fs.existsSync(dummySafetensors)) {
      console.log('Removing dummy model.safetensors placeholder...');
      fs.unlinkSync(dummySafetensors);
    }
  }

  const configPath = path.join(ttsDir, 'config.json');
  await downloadFileIfModified(`${HF_KOKORO_BASE_URL}/config.json`, configPath);

  const modelPath = path.join(ttsDir, 'kokoro-v1_0.pth');
  if (isPlaceholder(modelPath, 1024 * 1024 * 10)) { // 10MB minimum
    await downloadFile(`${HF_KOKORO_BASE_URL}/kokoro-v1_0.pth`, modelPath);
  } else {
    console.log('kokoro-v1_0.pth is already present and valid.');
  }

  // === 3. Selected Voice Files ===
  console.log('Checking Selected TTS voices...');
  for (const voice of voicesToDownload) {
    const voicePath = path.join(voicesDir, `${voice}.pt`);
    if (isPlaceholder(voicePath, 1024 * 50)) { // 50KB minimum
      await downloadFile(`${HF_KOKORO_BASE_URL}/voices/${voice}.pt`, voicePath);
    } else {
      console.log(`Voice ${voice}.pt is already present and valid.`);
    }
  }

  console.log('All model assets downloaded and configured successfully.');
}

main().catch(err => {
  console.error('Fatal error during asset download:', err);
  process.exit(1);
});
