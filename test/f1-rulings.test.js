'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createInstalledKeeper } = require('./support/installed-island');
const { foreignOverNotch } = require('./support/capture-preflight');

test('Q1: explicit pause steps the installed island aside and restores once', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-q1-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let running = true;
  const calls = [];
  const keeper = createInstalledKeeper({ file: path.join(dir, 'keeper.json'), driver: {
    installedRunning: () => running, testIslands: () => 0,
    quitInstalled: () => { calls.push('pause'); running = false; },
    launchInstalled: () => { calls.push('restore'); running = true; },
  } });
  assert.deepEqual(calls, [], 'import/construction must have no effects');
  keeper.pause();
  keeper.pause();
  assert.equal(running, false, 'installed observer remains during fixture Music');
  keeper.resume();
  keeper.resume();
  assert.equal(running, true);
  assert.deepEqual(calls, ['pause', 'restore']);
});

test('Q1: stale keeper refuses before any action, including explicit pause', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-q1-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'keeper.json');
  fs.writeFileSync(file, '{"wasRunning":true}');
  const calls = [];
  const keeper = createInstalledKeeper({ file, driver: {
    installedRunning: () => false, testIslands: () => 0,
    quitInstalled: () => calls.push('pause'), launchInstalled: () => calls.push('restore'),
  } });
  assert.throws(keeper.pause, /BLOCKED/);
  assert.deepEqual(calls, []);
  assert.equal(fs.readFileSync(file, 'utf8'), '{"wasRunning":true}');
});

test('notch preflight ignores only the two ruled full-screen system layers', () => {
  const screen = { x: 0, y: 0, w: 1710, h: 1107 };
  const notch = { x: 763, y: 0, w: 185, h: 33 };
  const dock = { owner: 'Dock', layer: 20, frame: screen };
  const nc = { owner: 'Notification Center', layer: 21, frame: screen };
  assert.deepEqual(foreignOverNotch([dock, nc], notch, screen), []);
  for (const w of [{ ...dock, owner: 'foreign' }, { ...dock, layer: 21 },
    { ...dock, frame: { x: 760, y: 0, w: 200, h: 100 } }]) {
    assert.deepEqual(foreignOverNotch([w], notch, screen), [w]);
  }
});

test('M02: read-only installed verifier rejects a scratch URL and needs the canonical enabled app', () => {
  const { verifyInstalled } = require('./support/registry');
  const app = { bundleID: 'local.notch-island', type: 'app (0x2)', disposition: '[enabled, allowed, visible]', url: 'file:///Applications/NotchIsland.app/' };
  assert.doesNotThrow(() => verifyInstalled([app]));
  assert.throws(() => verifyInstalled([{ ...app, url: 'file:///tmp/recovery/NotchIsland.app/' }]), /canonical/);
  assert.throws(() => verifyInstalled([{ ...app, disposition: '[disabled, allowed, visible]' }]), /enabled/);
});

test('Q1: an active pause lease needs the same idle run and a live, unreused owner', () => {
  const { load } = require('./support/load-isolated');
  for (const [stamp, started, expected] of [['run', 'birth', true], ['other', 'birth', false], ['run', 'reused', false], [null, 'birth', false]]) {
    const guard = load('fixture-preflight.js', {
      'node:fs': { readFileSync: () => JSON.stringify({ pid: 123, started: 'birth', stamp }) },
      'node:child_process': { execFileSync: () => started },
      './island-procs': { listIslands: () => [] },
    }, { process: { env: { NOTCH_ISLAND_POST_STAMP: 'run' } } });
    assert.equal(guard.activePause(), expected);
  }
});
