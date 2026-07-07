const fs = require('fs');
const path = require('path');

const artifactsDir = process.argv[2];
const changelogFile = process.argv[3];
const outputFile = process.argv[4];

if (!artifactsDir || !changelogFile || !outputFile) {
  console.error('Usage: node generate-release-body.cjs <artifacts-dir> <changelog-file> <output-file>');
  process.exit(1);
}

const releaseTag = process.argv[5] || process.env.GITHUB_REF_NAME || 'dev-release';
const changelog = fs.existsSync(changelogFile) ? fs.readFileSync(changelogFile, 'utf8') : '';

function getAllFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllFiles(filePath));
    } else {
      results.push(filePath);
    }
  }
  return results;
}

const files = getAllFiles(artifactsDir);
const groups = {
  macos: {},
  windows: {},
  linux: {}
};

for (const file of files) {
  const ext = path.extname(file);
  const base = path.basename(file);
  let sizeMB = '0.0 MB';
  try {
    const stat = fs.statSync(file);
    sizeMB = (stat.size / (1024 * 1024)).toFixed(1) + ' MB';
  } catch (err) {
    // Ignore
  }

  if (ext === '.dmg') {
    const arch = 'Universal';
    groups.macos[arch] = groups.macos[arch] || {};
    groups.macos[arch].dmg = { file: base, size: sizeMB };
  } else if (ext === '.msi') {
    const arch = base.toLowerCase().includes('arm64') ? 'ARM64' : 'x64';
    groups.windows[arch] = groups.windows[arch] || {};
    groups.windows[arch].msi = { file: base, size: sizeMB };
  } else if (ext === '.exe') {
    const arch = base.toLowerCase().includes('arm64') ? 'ARM64' : 'x64';
    groups.windows[arch] = groups.windows[arch] || {};
    groups.windows[arch].exe = { file: base, size: sizeMB };
  } else if (ext === '.deb') {
    const arch = base.toLowerCase().includes('arm64') ? 'ARM64' : 'x64';
    groups.linux[arch] = groups.linux[arch] || {};
    groups.linux[arch].deb = { file: base, size: sizeMB };
  } else if (ext === '.rpm') {
    const arch = base.toLowerCase().includes('aarch64') || base.toLowerCase().includes('arm64') ? 'ARM64' : 'x64';
    groups.linux[arch] = groups.linux[arch] || {};
    groups.linux[arch].rpm = { file: base, size: sizeMB };
  }
}

let body = '## 📥 Downloads\n\n';
body += '| Platform | Architecture | Recommended (Standard) | Alternative / System |\n';
body += '| :--- | :--- | :--- | :--- |\n';

let hasDownloads = false;

// macOS
if (Object.keys(groups.macos).length > 0) {
  for (const arch of ['Universal']) {
    const item = groups.macos[arch];
    if (item && item.dmg) {
      body += `| 🍎 **macOS** | Universal *(Intel + Apple Silicon)* | [Download DMG (${item.dmg.size})](https://github.com/LookAtWhatAiCanDo/Codeoba/releases/download/${releaseTag}/${item.dmg.file}) | — |\n`;
      hasDownloads = true;
    }
  }
}

// Windows
if (Object.keys(groups.windows).length > 0) {
  for (const arch of ['x64', 'ARM64']) {
    const item = groups.windows[arch];
    if (item) {
      const archLabel = arch === 'x64' ? 'x64 *(Standard 64-bit)*' : 'ARM64 *(Copilot+ PCs)*';
      let exeCol = '—';
      let msiCol = '—';
      if (item.exe) {
        exeCol = `[Standard Installer EXE (${item.exe.size})](https://github.com/LookAtWhatAiCanDo/Codeoba/releases/download/${releaseTag}/${item.exe.file})`;
      }
      if (item.msi) {
        msiCol = `[Enterprise MSI (${item.msi.size})](https://github.com/LookAtWhatAiCanDo/Codeoba/releases/download/${releaseTag}/${item.msi.file}) *(for SysAdmins)*`;
      }
      body += `| 🪟 **Windows** | ${archLabel} | ${exeCol} | ${msiCol} |\n`;
      hasDownloads = true;
    }
  }
}

// Linux
if (Object.keys(groups.linux).length > 0) {
  for (const arch of ['x64', 'ARM64']) {
    const item = groups.linux[arch];
    if (item) {
      const archLabel = arch === 'x64' ? 'x64 *(Standard 64-bit)*' : 'ARM64 *(Pi / ARM servers)*';
      let debCol = '—';
      let rpmCol = '—';
      if (item.deb) {
        debCol = `[DEB for Ubuntu / Debian (${item.deb.size})](https://github.com/LookAtWhatAiCanDo/Codeoba/releases/download/${releaseTag}/${item.deb.file})`;
      }
      if (item.rpm) {
        rpmCol = `[RPM for Fedora / RHEL (${item.rpm.size})](https://github.com/LookAtWhatAiCanDo/Codeoba/releases/download/${releaseTag}/${item.rpm.file})`;
      }
      body += `| 🐧 **Linux** | ${archLabel} | ${debCol} | ${rpmCol} |\n`;
      hasDownloads = true;
    }
  }
}

if (!hasDownloads) {
  body = '';
} else {
  body += '\n---\n\n';
}

body += changelog;

fs.writeFileSync(outputFile, body);
console.log(`Generated release body at: ${outputFile}`);
