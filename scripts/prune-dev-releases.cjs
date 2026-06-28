const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const isLocal = process.argv.includes('--local');
const args = process.argv.filter(arg => !arg.endsWith('prune-dev-releases.cjs') && arg !== '--local' && !arg.startsWith('node'));
let currentTag = args[0];

if (!currentTag) {
  try {
    const pkgPath = path.join(__dirname, '../package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      currentTag = 'v' + pkg.version;
    }
  } catch (err) {
    // Ignore
  }
}

if (isLocal) {
  console.log(`Pruning local dev pre-release tags. Keeping current tag: ${currentTag || 'none'}`);
  try {
    const output = execSync('git tag --list', { encoding: 'utf8' });
    const tags = output.split('\n').map(t => t.trim()).filter(Boolean);
    
    const devTagRegex = /^v\d+\.\d+\.\d+-\d+$/;
    let deletedCount = 0;
    
    for (const tag of tags) {
      if (devTagRegex.test(tag)) {
        if (tag !== currentTag) {
          console.log(`Deleting local tag: ${tag}`);
          execSync(`git tag -d "${tag}"`, { stdio: 'inherit' });
          deletedCount++;
        }
      }
    }
    console.log(`✅ Completed local tag pruning. Deleted ${deletedCount} local tags.`);
  } catch (err) {
    console.error('Error during local tags pruning:', err.message);
    process.exit(1);
  }
} else {
  if (!currentTag) {
    console.error('Error: No current tag specified to exclude from pruning.');
    process.exit(1);
  }

  console.log(`Pruning old dev pre-releases on GitHub. Keeping current tag: ${currentTag}`);

  try {
    // Query releases from GitHub CLI as JSON
    const output = execSync('gh release list --json tagName,isPrerelease --limit 100', { encoding: 'utf8' });
    const releases = JSON.parse(output);
    
    if (!Array.isArray(releases)) {
      throw new Error('Expected release list to be an array');
    }
    
    const devTagRegex = /^v\d+\.\d+\.\d+-\d+$/;
    
    for (const release of releases) {
      const tag = release.tagName;
      if (release.isPrerelease && devTagRegex.test(tag)) {
        if (tag !== currentTag) {
          console.log(`Deleting old dev release and tag: ${tag}`);
          try {
            // Delete release
            execSync(`gh release delete "${tag}" --yes`, { stdio: 'inherit' });
            // Delete remote Git tag
            execSync(`git push origin :refs/tags/${tag}`, { stdio: 'inherit' });
          } catch (err) {
            console.error(`Warning: Failed to delete release/tag ${tag}:`, err.message);
          }
        }
      }
    }
    console.log('✅ Old dev pre-releases pruning completed.');
  } catch (err) {
    console.error('Error during pre-releases pruning:', err.message);
    process.exit(1);
  }
}

