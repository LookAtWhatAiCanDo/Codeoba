const fs = require('fs');
const path = require('path');
const https = require('https');

// Helper to fetch Google Translate free API URL
function translateText(text, targetLang) {
  let googleLang = targetLang;
  // Normalize language codes for Google Translate
  if (targetLang === 'zh') googleLang = 'zh-CN';
  if (targetLang === 'zh-TW') googleLang = 'zh-TW';

  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${googleLang}&dt=t&q=${encodeURIComponent(text)}`;

  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed && parsed[0]) {
            const translation = parsed[0].map(item => item[0]).join('');
            resolve(translation);
          } else {
            resolve(text); // Fallback to English
          }
        } catch (e) {
          resolve(text); // Fallback
        }
      });
    }).on('error', () => {
      resolve(text); // Fallback
    });
  });
}

// Flat map of a nested object into dot notation
function getFlatKeys(obj, prefix = '') {
  let keys = {};
  for (const k in obj) {
    const newPrefix = prefix ? `${prefix}.${k}` : k;
    if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
      Object.assign(keys, getFlatKeys(obj[k], newPrefix));
    } else {
      keys[newPrefix] = obj[k];
    }
  }
  return keys;
}

// Set nested value in object by path
function setNestedValue(obj, pathStr, value) {
  const parts = pathStr.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
      current[part] = {};
    }
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
}

// Parse args
const args = process.argv.slice(2);
let limitKeys = null;
const keysIdx = args.indexOf('--keys');
if (keysIdx !== -1 && args[keysIdx + 1]) {
  limitKeys = args[keysIdx + 1].split(',').map(k => k.trim());
}

const localesDir = path.join(__dirname, '../src/i18n/locales');
const enPath = path.join(localesDir, 'en.json');

if (!fs.existsSync(enPath)) {
  console.error(`Error: en.json not found at ${enPath}`);
  process.exit(1);
}

const enJson = JSON.parse(fs.readFileSync(enPath, 'utf8'));
const enFlat = getFlatKeys(enJson);

// Get all translation target files (excluding en.json)
const files = fs.readdirSync(localesDir)
  .filter(f => f.endsWith('.json') && f !== 'en.json');

async function run() {
  console.log(`Starting translation process...`);
  if (limitKeys) {
    console.log(`Limit scope to keys: ${limitKeys.join(', ')}`);
  } else {
    console.log(`Checking for missing keys across all locale files...`);
  }

  for (const file of files) {
    const lang = file.replace('.json', '');
    const filePath = path.join(localesDir, file);
    const targetJson = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const targetFlat = getFlatKeys(targetJson);

    let keysToTranslate = [];

    if (limitKeys) {
      // Find all keys matching specified patterns
      for (const flatKey of Object.keys(enFlat)) {
        const matches = limitKeys.some(limitK => flatKey === limitK || flatKey.startsWith(limitK + '.'));
        if (matches) {
          keysToTranslate.push(flatKey);
        }
      }
    } else {
      // Find all keys missing in target locale file
      for (const flatKey of Object.keys(enFlat)) {
        if (!(flatKey in targetFlat)) {
          keysToTranslate.push(flatKey);
        }
      }
    }

    if (keysToTranslate.length === 0) {
      console.log(`- ${lang}: Up to date.`);
      continue;
    }

    console.log(`- ${lang}: Translating ${keysToTranslate.length} keys...`);
    for (const flatKey of keysToTranslate) {
      const sourceText = enFlat[flatKey];
      console.log(`  [${flatKey}] Translating: "${sourceText}"`);
      const translated = await translateText(sourceText, lang);
      setNestedValue(targetJson, flatKey, translated);
    }

    // Write file
    fs.writeFileSync(filePath, JSON.stringify(targetJson, null, 2) + '\n', 'utf8');
    console.log(`  Updated ${file}`);
  }
  console.log('Translation process completed!');
}

run().catch(console.error);
