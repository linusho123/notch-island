'use strict';
// The release fixture has V1's disconnect-cleanup lifecycle, but restores the
// existing TEST executable before unregistering its own unique identity.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { root, testBinary } = require('./paths');
const { pids } = require('./login-guardian');

async function cleanup(dir, home) {
  assert.equal(path.dirname(dir), path.join(root, 'build', 'apps.noindex'));
  assert.match(path.basename(dir), /^p6-cost-[A-Za-z0-9]+$/);
  assert.equal(path.dirname(home), '/tmp');
  assert.match(path.basename(home), /^ni-cost-home-[A-Za-z0-9]+$/);
  const app = path.join(dir, 'NotchIsland.app');
  const binary = path.join(app, 'Contents', 'MacOS', 'NotchIsland');
  const identifier = `local.notch-island.cost.${path.basename(dir)}`;
  const plist = path.join(app, 'Contents', 'Info.plist');
  assert.equal(execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', plist], { encoding: 'utf8' }).trim(), identifier);
  // Stop only this fixture. The adapter exits on its stdin pipe closing.
  for (const signal of ['SIGTERM', 'SIGKILL']) {
    for (const pid of pids(binary)) if (pids(binary).includes(pid)) {
      try { process.kill(pid, signal); } catch (e) { if (e.code !== 'ESRCH') throw e; }
    }
    const end = Date.now() + 3000;
    while (pids(binary).length && Date.now() < end) execFileSync('sleep', ['0.1']);
  }
  assert.equal(pids(binary).length, 0, 'release fixture survived cleanup');
  const { enabledApp } = require('./registry');
  if (await enabledApp(identifier)) {
    // Only this fixture's ID; never local.notch-island or the V1 test ID.
    fs.copyFileSync(testBinary, binary);
    execFileSync('/usr/bin/codesign', ['--force', '--sign', '-', app], { stdio: 'pipe' });
    const input = path.join(home, 'cleanup-input.json');
    fs.writeFileSync(input, JSON.stringify({ dataDirectory: home }));
    const r = spawnSync(binary, ['--test-unregister-login-and-exit'], {
      env: { ...process.env, HOME: home, CFFIXED_USER_HOME: home, NOTCH_ISLAND_TEST_INPUT: input },
      encoding: 'utf8', timeout: 20000,
    });
    assert.equal(r.status, 0, `fixture unregister failed: ${r.stderr || r.error}`);
  }
  assert.equal(await enabledApp(identifier), null, 'cost fixture left enabled');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });
}

if (require.main === module) {
  const [dir, home] = process.argv.slice(2);
  let cleaning = false;
  async function finish() {
    if (cleaning) return;
    cleaning = true;
    try {
      await cleanup(dir, home);
      process.exit(0);
    } catch (e) { console.error(e.stack); process.exit(1); }
  }
  process.on('disconnect', finish);
  process.on('message', (m) => { if (m === 'cleanup') finish(); });
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, finish);
  process.send({ ready: true });
}

module.exports = { cleanup };
