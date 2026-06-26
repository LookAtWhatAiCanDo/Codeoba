const fs = require('fs');
const path = require('path');

const tag = process.env.GITHUB_REF_NAME;
if (!tag || !tag.startsWith('v')) {
  console.log('No valid version tag (e.g. vX.Y.Z) found. Skipping version sync.');
  process.exit(0);
}

const version = tag.substring(1);
console.log(`Syncing project versions to: ${version}`);

// 1. Update package.json
const pkgPath = path.join(__dirname, '../package.json');
if (fs.existsSync(pkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.version = version;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`Updated package.json version to ${version}`);
}

// 2. Update package-lock.json
const lockPath = path.join(__dirname, '../package-lock.json');
if (fs.existsSync(lockPath)) {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  if (lock.version) lock.version = version;
  if (lock.packages && lock.packages['']) {
    lock.packages[''].version = version;
  }
  fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
  console.log(`Updated package-lock.json version to ${version}`);
}

// 3. Update tauri.conf.json
const confPath = path.join(__dirname, '../src-tauri/tauri.conf.json');
if (fs.existsSync(confPath)) {
  const conf = JSON.parse(fs.readFileSync(confPath, 'utf8'));
  conf.version = version;
  if (conf.plugins && conf.plugins.updater) {
    conf.plugins.updater.active = true;
    conf.plugins.updater.endpoints = ["https://codeoba.com/api/update"];
    
    // Override public key for production if provided in environment
    const prodPubKey = process.env.CODEOBA_TAURI_UPDATE_PUBLIC_KEY;
    if (prodPubKey) {
      conf.plugins.updater.pubkey = prodPubKey;
      console.log('Overrode updater public key to production key');
    }
  }
  fs.writeFileSync(confPath, JSON.stringify(conf, null, 2) + '\n');
  console.log(`Updated tauri.conf.json version to ${version} and set production update endpoint`);
}

// 4. Update Cargo.toml (Section-aware line parser)
const cargoPath = path.join(__dirname, '../src-tauri/Cargo.toml');
if (fs.existsSync(cargoPath)) {
  const content = fs.readFileSync(cargoPath, 'utf8');
  const lines = content.split(/\r?\n/);
  let inPackageSection = false;
  let updated = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('[package]')) {
      inPackageSection = true;
    } else if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      // Entered a different section, e.g. [dependencies] or [lib]
      inPackageSection = false;
    }

    if (inPackageSection && trimmed.startsWith('version =')) {
      // Extract original indentation/formatting and replace the version
      const match = lines[i].match(/^(\s*version\s*=\s*['"])[^'"]*(['"].*)$/);
      if (match) {
        lines[i] = `${match[1]}${version}${match[2]}`;
      } else {
        lines[i] = `version = "${version}"`;
      }
      updated = true;
      break;
    }
  }

  if (updated) {
    fs.writeFileSync(cargoPath, lines.join('\n'));
    console.log(`Updated Cargo.toml version to ${version}`);
  } else {
    console.warn('Could not find package version in Cargo.toml');
  }
}
