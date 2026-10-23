'use strict';
// The one-time setup that lets the visionary's own Chrome start the island's
// native-messaging host (D126, the P2 exit): it writes the host manifest
// pointing at the installed app and listing only the companion extension's
// id. Tested against a scratch Chrome folder only; the real install waits
// for the visionary's go-ahead (P2 fix M5).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'install-chrome-host.js');
const ID = fs.readFileSync(path.join(__dirname, '..', 'app', 'chrome-extension', 'extension-id.txt'), 'utf8').trim();
const scratch = () => fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-host-'));

test('it writes the host manifest into the given Chrome folder, for the installed app and the extension only', () => {
  const dir = scratch();
  const run = spawnSync('node', [SCRIPT, '--chrome-dir', dir], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const file = path.join(dir, 'NativeMessagingHosts', 'local.notch_island.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(manifest.name, 'local.notch_island');
  assert.equal(manifest.type, 'stdio');
  assert.equal(manifest.path, '/Applications/NotchIsland.app/Contents/MacOS/NotchIsland');
  assert.deepEqual(manifest.allowed_origins, [`chrome-extension://${ID}/`]);
  assert.equal(fs.statSync(file).mode & 0o022, 0, 'the manifest is writable by others');
});

test('running it again changes nothing', () => {
  const dir = scratch();
  spawnSync('node', [SCRIPT, '--chrome-dir', dir]);
  const file = path.join(dir, 'NativeMessagingHosts', 'local.notch_island.json');
  const before = fs.readFileSync(file, 'utf8');
  const run = spawnSync('node', [SCRIPT, '--chrome-dir', dir], { encoding: 'utf8' });
  assert.equal(run.status, 0);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('it never installs into the real Chrome unless told so with --real', () => {
  const run = spawnSync('node', [SCRIPT], { encoding: 'utf8', env: { ...process.env, HOME: scratch() } });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /--chrome-dir|--real/);
});

test('--real writes under the user\'s own Chrome folder (checked against a scratch home)', () => {
  const home = scratch();
  const run = spawnSync('node', [SCRIPT, '--real'], { encoding: 'utf8', env: { ...process.env, HOME: home } });
  assert.equal(run.status, 0, run.stderr);
  assert.ok(fs.existsSync(path.join(home, 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts', 'local.notch_island.json')));
});
