'use strict';
// A separate session owns the V1 fixture. IPC disconnect also runs cleanup
// when the test runner is SIGKILLed (which cannot run Node exit hooks).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { root } = require('./paths');

function fixturePaths(dir) {
  const parent = path.join(root, 'build', 'apps.noindex');
  assert.equal(path.dirname(dir), parent, 'login fixture must be inside build/apps.noindex');
  assert.match(path.basename(dir), /^p6-login-[A-Za-z0-9]+$/);
  const app = path.join(dir, 'NotchIsland.app');
  return { app, binary: path.join(app, 'Contents', 'MacOS', 'NotchIsland'), input: path.join(dir, 'input.json') };
}

function pids(binary) {
  const out = execFileSync('ps', ['-axo', 'pid=,comm='], { encoding: 'utf8' });
  return out.split('\n').flatMap((line) => {
    const m = /^\s*(\d+)\s+(.+)$/.exec(line);
    return m && m[2] === binary ? [Number(m[1])] : [];
  });
}

function cleanup(dir) {
  const { binary, input } = fixturePaths(dir);
  // The path is unique to this test. Re-read it before each signal; never
  // signal an installed island or a PID that has been reused.
  for (const signal of ['SIGTERM', 'SIGKILL']) {
    for (const pid of pids(binary)) {
      if (pids(binary).includes(pid)) {
        try { process.kill(pid, signal); } catch (e) { if (e.code !== 'ESRCH') throw e; }
      }
    }
    const end = Date.now() + 3000;
    while (pids(binary).length && Date.now() < end) execFileSync('sleep', ['0.1']);
  }
  assert.equal(pids(binary).length, 0, 'a V1 test island survived cleanup');
  const r = spawnSync(binary, ['--test-unregister-login-and-exit'], {
    env: { ...process.env, NOTCH_ISLAND_TEST_INPUT: input },
    encoding: 'utf8', timeout: 20000,
  });
  assert.equal(r.status, 0, `could not unregister the V1 login item: ${r.stderr || r.error}`);
  const config = JSON.parse(fs.readFileSync(input, 'utf8'));
  fs.rmSync(config.chromeSocket, { force: true });
}

if (require.main === module) {
  const dir = process.argv[2];
  fixturePaths(dir);
  let cleaning = false;
  async function finish() {
    if (cleaning) return;
    cleaning = true;
    try {
      cleanup(dir);
      const { items } = require('./registry');
      const { app } = fixturePaths(dir);
      const { fileURLToPath } = require('node:url');
      const enabled = (await items()).filter((i) => i.url?.startsWith('file:') && fileURLToPath(i.url).replace(/\/$/, '') === app
        && /\[\s*enabled\b/.test(i.disposition || ''));
      assert.equal(enabled.length, 0, 'V1 login item is still enabled after unregister');
      fs.rmSync(dir, { recursive: true, force: true });
      if (process.connected) process.send({ cleaned: true });
      process.exit(0);
    } catch (e) {
      console.error(e.stack);
      if (process.connected) process.send({ error: e.message });
      // Keep the fixture and log for recovery if macOS refused cleanup.
      process.exit(1);
    }
  }
  process.on('message', (m) => { if (m === 'cleanup') finish(); });
  process.on('disconnect', finish);
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, finish);
  process.send({ ready: true });
}

module.exports = { fixturePaths, pids, cleanup };
