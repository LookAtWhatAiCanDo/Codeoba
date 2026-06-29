const fs = require('fs');
const path = require('path');

const artifactsDir = process.argv[2];
const changelogFile = process.argv[3];
const outputFile = process.argv[4];

if (!artifactsDir || !changelogFile || !outputFile) {
  console.error('Usage: node generate-release-body.cjs <artifacts-dir> <changelog-file> <output-file>');
  process.exit(1);
}

const releaseTag = process.env.GITHUB_REF_NAME || 'dev-release';
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
const downloads = {
  macos: [],
  windows: [],
  linux: []
};

for (const file of files) {
  const ext = path.extname(file);
  const base = path.basename(file);
  if (ext === '.dmg') {
    downloads.macos.push({ name: 'macOS DMG (Universal)', file: base });
  } else if (ext === '.msi') {
    const arch = base.includes('arm64') ? 'ARM64' : 'x64';
    downloads.windows.push({ name: `Windows MSI (${arch})`, file: base });
  } else if (ext === '.exe') {
    const arch = base.includes('arm64') ? 'ARM64' : 'x64';
    downloads.windows.push({ name: `Windows EXE (${arch})`, file: base });
  } else if (ext === '.deb') {
    const arch = base.includes('arm64') ? 'ARM64' : 'x64';
    downloads.linux.push({ name: `Linux DEB (${arch})`, file: base });
  } else if (ext === '.rpm') {
    const arch = base.includes('aarch64') ? 'ARM64' : 'x64';
    downloads.linux.push({ name: `Linux RPM (${arch})`, file: base });
  }
}

let body = '## 📥 Downloads\n\n';
body += '| Platform | Installer |\n';
body += '| --- | --- |\n';

let hasDownloads = false;
if (downloads.macos.length > 0) {
  downloads.macos.forEach(d => {
    body += `| **macOS** | [${d.file}](https://github.com/LookAtWhatAiCanDo/Codeoba/releases/download/${releaseTag}/${d.file}) |\n`;
    hasDownloads = true;
  });
}
if (downloads.windows.length > 0) {
  downloads.windows.forEach(d => {
    body += `| **Windows** | [${d.file}](https://github.com/LookAtWhatAiCanDo/Codeoba/releases/download/${releaseTag}/${d.file}) |\n`;
    hasDownloads = true;
  });
}
if (downloads.linux.length > 0) {
  downloads.linux.forEach(d => {
    body += `| **Linux** | [${d.file}](https://github.com/LookAtWhatAiCanDo/Codeoba/releases/download/${releaseTag}/${d.file}) |\n`;
    hasDownloads = true;
  });
}

if (!hasDownloads) {
  body = '';
} else {
  body += '\n---\n\n';
}

body += changelog;

fs.writeFileSync(outputFile, body);
console.log(`Generated release body at: ${outputFile}`);
