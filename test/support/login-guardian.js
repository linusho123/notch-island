'use strict';
// A separate session owns the V1 fixture. IPC disconnect also runs cleanup
// when the test runner is SIGKILLed (which cannot run Node exit hooks).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { root } = require('./paths');

function fixturePaths(dir) {
  const parent = path.join(root, 'build', 'apps.noindex');
  assert.equal(path.dirname(dir), parent, 'login fixture must be inside build/apps.noindex');
  assert.match(path.basename(dir), /^p6-login-[A-Za-z0-9]+$/);
  const app = path.join(dir, 'NotchIsland.app');
  return { app, identifier: require('./login-service').LOGIN_IDENTIFIER, binary: path.join(app, 'Contents', 'MacOS', 'NotchIsland'), input: path.join(dir, 'input.json') };
}

function pids(binary) {
  const out = execFileSync('ps', ['-axo', 'pid=,comm='], { encoding: 'utf8' });
  return out.split('\n').flatMap((line) => {
    const m = /^\s*(\d+)\s+(.+)$/.exec(line);
    return m && m[2] === binary ? [Number(m[1])] : [];
  });
}

async function cleanup(dir) {
  const { app, binary, input, identifier } = fixturePaths(dir);
  if (!fs.existsSync(path.join(dir, 'registration-armed'))) return;
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
  const service = require('./login-service');
  const env = { ...process.env, NOTCH_ISLAND_TEST_INPUT: input };
  if (service.status(app, identifier, env) !== 'notRegistered') {
    await service.unregister(app, identifier, env);
  }
  await service.assertUnregistered(app, identifier, env);
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
      await cleanup(dir);
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
  if (process.connected) process.send({ ready: true }, (error) => { if (error) finish(); });
  else finish();
}

module.exports = { fixturePaths, pids, cleanup };
