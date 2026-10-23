#!/usr/bin/env node
'use strict';
// One-time setup for the companion Chrome extension (D126): writes the
// native-messaging host manifest that lets Chrome start the installed island
// as the extension's host. The manifest points at the installed app and
// allows only the companion extension's id.
//
//   node scripts/install-chrome-host.js --chrome-dir <Chrome user data folder>
//   node scripts/install-chrome-host.js --real      (the user's own Chrome)
//
// Without one of the two it does nothing: the user's own Chrome is only
// touched when asked for with --real.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOST_NAME = 'local.notch_island';
const APP_BINARY = '/Applications/NotchIsland.app/Contents/MacOS/NotchIsland';
const ID = fs.readFileSync(path.join(__dirname, '..', 'app', 'chrome-extension', 'extension-id.txt'), 'utf8').trim();

function install(chromeDir) {
  const dir = path.join(chromeDir, 'NativeMessagingHosts');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${HOST_NAME}.json`);
  const manifest = JSON.stringify({
    name: HOST_NAME,
    description: 'notch-island',
    path: APP_BINARY,
    type: 'stdio',
    allowed_origins: [`chrome-extension://${ID}/`],
  }, null, 2) + '\n';
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== manifest) fs.writeFileSync(file, manifest, { mode: 0o644 });
  return file;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--chrome-dir');
  let chromeDir = null;
  if (i >= 0 && args[i + 1]) chromeDir = args[i + 1];
  else if (args.includes('--real')) chromeDir = path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
  if (!chromeDir) {
    console.error('Give --chrome-dir <folder> for a scratch Chrome, or --real for your own Chrome.');
    process.exit(2);
  }
  console.log(`wrote ${install(chromeDir)}`);
}

module.exports = { install, HOST_NAME };
