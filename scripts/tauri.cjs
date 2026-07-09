#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Extract command-line arguments
const args = process.argv.slice(2);

// Find and extract --base-url if present
let baseUrl = null;
const filteredArgs = args.filter(arg => {
  if (arg.startsWith('--base-url=')) {
    baseUrl = arg.split('=')[1].replace(/\/+$/, ''); // Strip any trailing slashes
    return false; // Remove this argument so it isn't passed to Tauri CLI
  }
  return true;
});

if (baseUrl) {
  const confPath = path.join(__dirname, '../src-tauri/tauri.conf.json');
  if (fs.existsSync(confPath)) {
    try {
      const conf = JSON.parse(fs.readFileSync(confPath, 'utf8'));
      
      // 1. Dynamically update CSP to allow connect-src to the base URL
      let csp = conf.app.security.csp || "default-src 'self'; connect-src 'self' ipc: http://ipc.localhost;";
      if (csp.includes('connect-src')) {
        csp = csp.replace('connect-src', `connect-src ${baseUrl}`);
      } else {
        csp = csp.trim().replace(/;?$/, `; connect-src 'self' ${baseUrl};`);
      }
      
      // 2. Build the updater endpoint from the base URL
      const updateEndpoint = `${baseUrl}/api/update?version={{current_version}}&target={{target}}&arch={{arch}}`;
      
      // 3. Create the overrides JSON object
      const overrides = {
        app: {
          security: {
            csp: csp
          }
        },
        plugins: {
          updater: {
            active: true,
            endpoints: [updateEndpoint]
          }
        }
      };
      
      // 4. Inject the merge configuration into the Tauri CLI arguments
      filteredArgs.push('--config', JSON.stringify(overrides));
      
      console.log(`\x1b[36m[Codeoba Config Wrapper]\x1b[0m Injecting compile-time base URL: ${baseUrl}`);
      console.log(`\x1b[36m[Codeoba Config Wrapper]\x1b[0m CSP connect-src updated to allow: ${baseUrl}`);
      console.log(`\x1b[36m[Codeoba Config Wrapper]\x1b[0m Updater endpoint set to: ${updateEndpoint}\n`);
    } catch (e) {
      console.error('Error parsing tauri.conf.json for base-url override:', e);
    }
  }
}

// Resolve local @tauri-apps/cli entry point to avoid shell escaping issues
const tauriCliPath = path.join(__dirname, '../node_modules/@tauri-apps/cli/tauri.js');

if (!fs.existsSync(tauriCliPath)) {
  console.error(`Error: Could not find @tauri-apps/cli at ${tauriCliPath}. Please run npm install first.`);
  process.exit(1);
}

// Spawn tauri using node directly (shell: false) to preserve double quotes in JSON config
const tauriProcess = spawn('node', [tauriCliPath, ...filteredArgs], {
  stdio: 'inherit'
});

tauriProcess.on('exit', (code) => {
  process.exit(code || 0);
});
