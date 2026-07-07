const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

// 1. Get password from argument or generate one
let password = process.argv[2];
let isGenerated = false;

if (!password) {
  password = crypto.randomBytes(24).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 32);
  isGenerated = true;
}

const keyPath = path.join(__dirname, '../secrets/codeoba-updater.key');
const pubKeyPath = keyPath + '.pub';
const configPath = path.join(__dirname, '../src-tauri/tauri.conf.json');

console.log('Generating new Tauri Update Signer Keypair...');

try {
  // Run tauri signer generate
  const cmd = `npx tauri signer generate -p "${password}" -w "${keyPath}" --force`;
  execSync(cmd, { stdio: 'inherit' });

  // Read public key file
  if (!fs.existsSync(pubKeyPath)) {
    throw new Error(`Public key file was not found at ${pubKeyPath}`);
  }
  const pubKey = fs.readFileSync(pubKeyPath, 'utf8').trim();

  console.log('\n==================================================');
  console.log('✅ KEY GENERATION SUCCESSFUL!');
  console.log('==================================================\n');
  console.log(`🔑 GENERATED PUBLIC KEY:`);
  console.log(`   -->  ${pubKey}  <--`);
  console.log(`\n📂 FILE LOCATIONS:`);
  console.log(`   * Private Key saved to: secrets/codeoba-updater.key (DO NOT COMMIT)`);
  console.log(`   * Public Key file: secrets/codeoba-updater.key.pub`);
  console.log(`\n🔑 YOUR PRIVATE KEY PASSWORD:`);
  console.log(`   -->  ${password}  <--`);
  if (isGenerated) {
    console.log(`   (This secure password was randomly generated for you)`);
  }
  console.log('\n👉 NEXT STEPS FOR PRODUCTION RELEASES:');
  console.log('   Add these two secrets to GitHub Repository Secrets:');
  console.log('   - CODEOBA_TAURI_UPDATE_PRIVATE_KEY: (Contents of secrets/codeoba-updater.key)');
  console.log(`   - CODEOBA_TAURI_UPDATE_PRIVATE_KEY_PASSWORD: ${password}`);
  console.log('==================================================\n');

} catch (err) {
  console.error('❌ Error generating keys:', err.message);
  process.exit(1);
}
