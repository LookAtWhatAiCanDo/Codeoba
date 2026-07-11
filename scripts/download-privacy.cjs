const fs = require('fs');
const path = require('path');

const resourcesDir = path.join(__dirname, '..', 'src', 'resources', 'privacy');
const cachePath = path.join(resourcesDir, 'cache.json');

// Resolve the active target base URL based on environment/config
function resolveBaseUrl() {
  // 1. Check environment variable override
  if (process.env.CODEOBA_BASE_URL) {
    const envUrl = process.env.CODEOBA_BASE_URL.replace(/\/+$/, '');
    console.log(`Resolved base URL from environment variable: ${envUrl}`);
    return envUrl;
  }

  // 2. Check command-line arguments
  const args = process.argv.slice(2);
  for (const arg of args) {
    if (arg.startsWith('--base-url=')) {
      const argUrl = arg.split('=')[1].replace(/\/+$/, '');
      console.log(`Resolved base URL from CLI argument: ${argUrl}`);
      return argUrl;
    }
  }

  // 3. Read from src-tauri/tauri.conf.json
  const confPath = path.join(__dirname, '..', 'src-tauri', 'tauri.conf.json');
  if (fs.existsSync(confPath)) {
    try {
      const conf = JSON.parse(fs.readFileSync(confPath, 'utf8'));
      const endpoints = conf.plugins?.updater?.endpoints || [];
      const firstEndpoint = endpoints[0];
      if (firstEndpoint) {
        const url = new URL(firstEndpoint);
        const resolved = `${url.protocol}//${url.host}`;
        console.log(`Resolved base URL from tauri.conf.json updater endpoint: ${resolved}`);
        return resolved;
      }
    } catch (e) {
      console.warn('Warning: Failed to parse tauri.conf.json for base-url resolve.');
    }
  }

  // 4. Default fallback to production
  console.log('Using default production base URL: https://codeoba.com');
  return 'https://codeoba.com';
}

async function downloadLocale(lang, cacheData, baseUrl) {
  const privacyUrl = `${baseUrl}/privacy/privacy_${lang}.md`;
  const privacyPath = path.join(resourcesDir, `privacy_${lang}.md`);
  
  const cache = cacheData[lang] || {};
  const etag = cache.etag || '';
  const lastModified = cache.lastModified || '';

  const headers = {};
  if (etag && fs.existsSync(privacyPath)) {
    headers['If-None-Match'] = etag;
  }
  if (lastModified && fs.existsSync(privacyPath)) {
    headers['If-Modified-Since'] = lastModified;
  }

  console.log(`Checking for privacy policy updates (${lang}) from ${privacyUrl}...`);
  try {
    const res = await fetch(privacyUrl, { headers, signal: AbortSignal.timeout(5000) });
    
    if (res.status === 304) {
      console.log(`Privacy policy (${lang}) is up to date (304 Not Modified).`);
      return { status: 304 };
    }

    if (res.status === 200) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('text/html')) {
        throw new Error('Response content-type is HTML instead of Markdown');
      }

      const text = await res.text();
      if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html') || text.trim().startsWith('<HTML')) {
        throw new Error('Fetched file content contains HTML tags (possible redirect or fallback)');
      }

      fs.writeFileSync(privacyPath, text, 'utf8');
      
      const newCache = {
        etag: res.headers.get('etag') || '',
        lastModified: res.headers.get('last-modified') || '',
        downloadedAt: new Date().toISOString()
      };
      console.log(`Successfully updated local privacy_${lang}.md with latest version from server.`);
      return { status: 200, cache: newCache };
    }

    throw new Error(`Server returned HTTP status ${res.status}`);
  } catch (error) {
    console.warn(`Warning: Failed to fetch privacy_${lang}.md (${error.message}).`);
    
    if (fs.existsSync(privacyPath)) {
      console.log(`Using existing local copy for privacy_${lang}.md.`);
    } else if (lang !== 'en') {
      const enPath = path.join(resourcesDir, 'privacy_en.md');
      if (fs.existsSync(enPath)) {
        fs.copyFileSync(enPath, privacyPath);
        console.log(`Copied English privacy policy as fallback for privacy_${lang}.md.`);
      } else {
        const fallbackText = `# Privacy Policy\n\nCodeoba is a local-first application. To read our full privacy policy, please visit ${baseUrl}/privacy.html.`;
        fs.writeFileSync(privacyPath, fallbackText, 'utf8');
        console.log(`Created default fallback copy for privacy_${lang}.md.`);
      }
    } else {
      const fallbackText = `# Privacy Policy\n\nCodeoba is a local-first application. To read our full privacy policy, please visit ${baseUrl}/privacy.html.`;
      fs.writeFileSync(privacyPath, fallbackText, 'utf8');
      console.log(`Created default fallback copy for privacy_${lang}.md.`);
    }
    return { status: 'fallback' };
  }
}

async function downloadAll() {
  if (!fs.existsSync(resourcesDir)) {
    fs.mkdirSync(resourcesDir, { recursive: true });
  }

  const baseUrl = resolveBaseUrl();

  let cacheData = {};
  if (fs.existsSync(cachePath)) {
    try {
      cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    } catch (e) {
      console.warn('Warning: Failed to parse privacy cache JSON, ignoring.');
    }
  }

  let cacheUpdated = false;

  for (const lang of locales = ["en", "ar", "de", "es", "fr", "it", "ja", "ko", "nl", "pt", "ru", "zh", "zh-TW"]) {
    const result = await downloadLocale(lang, cacheData, baseUrl);
    if (result.status === 200 && result.cache) {
      cacheData[lang] = result.cache;
      cacheUpdated = true;
    }
  }

  if (cacheUpdated) {
    fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2), 'utf8');
    console.log('Saved updated privacy policy cache manifest.');
  }
  console.log('All privacy policies processed.');
}

downloadAll();
