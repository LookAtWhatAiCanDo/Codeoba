const { execSync } = require('child_process');

const currentTag = process.argv[2];
if (!currentTag) {
  console.error('Error: No current tag specified to exclude from pruning.');
  process.exit(1);
}

console.log(`Pruning old dev pre-releases. Keeping current tag: ${currentTag}`);

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
