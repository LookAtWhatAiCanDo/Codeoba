const fs = require('fs');
const path = require('path');

const artifactsDir = process.argv[2] || path.join(__dirname, '../artifacts');
const targetTag = process.argv[3] || process.env.GITHUB_REF_NAME || 'dev-release';

// Resolve release tag (use 'dev-release' for non-version refs like 'main')
const releaseTag = (targetTag.startsWith('v') && targetTag !== 'v*') ? targetTag : 'dev-release';

console.log(`Merging updater manifests from: ${artifactsDir}`);
console.log(`Using release tag for URLs: ${releaseTag}`);

if (!fs.existsSync(artifactsDir)) {
  console.error(`Error: Artifacts directory not found at ${artifactsDir}`);
  process.exit(1);
}

const mergedManifest = {
  version: '',
  pub_date: '',
  platforms: {}
};

let foundAny = false;

// Scan subdirectories for latest.json
const items = fs.readdirSync(artifactsDir);
for (const item of items) {
  const itemPath = path.join(artifactsDir, item);
  if (fs.statSync(itemPath).isDirectory()) {
    const jsonPath = path.join(itemPath, 'latest.json');
    if (fs.existsSync(jsonPath)) {
      console.log(`Found manifest: ${jsonPath}`);
      try {
        const content = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        
        // Take version and pub_date from the first manifest we find
        if (!mergedManifest.version && content.version) {
          mergedManifest.version = content.version;
          mergedManifest.pub_date = content.pub_date || new Date().toISOString();
        }
        
        // Merge platforms
        if (content.platforms) {
          for (const [platformName, platformData] of Object.entries(content.platforms)) {
            if (platformData.url && platformData.signature) {
              const filename = path.basename(platformData.url);
              const rewrittenUrl = `https://github.com/LookAtWhatAiCanDo/Codeoba-Tauri/releases/download/${releaseTag}/${filename}`;
              
              mergedManifest.platforms[platformName] = {
                signature: platformData.signature,
                url: rewrittenUrl
              };
              console.log(`  Added platform: ${platformName}`);
              console.log(`    Original URL: ${platformData.url}`);
              console.log(`    Rewritten URL: ${rewrittenUrl}`);
            }
          }
          foundAny = true;
        }
      } catch (err) {
        console.error(`Error reading or parsing ${jsonPath}:`, err.message);
      }
    }
  }
}

if (!foundAny) {
  console.warn('Warning: No tauri updater manifests (latest.json) were found to merge.');
  process.exit(0);
}

// Write the merged manifest to the root of the artifacts directory
const outputPath = path.join(artifactsDir, 'latest.json');
fs.writeFileSync(outputPath, JSON.stringify(mergedManifest, null, 2) + '\n');
console.log(`\n✅ Merged manifest successfully written to: ${outputPath}`);
console.log(JSON.stringify(mergedManifest, null, 2));
