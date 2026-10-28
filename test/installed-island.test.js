'use strict';
// The installed app and any stale recovery journal are never changed by tests.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createInstalledKeeper } = require('./support/installed-island');
for (const state of ['stale', 'clear']) test(`installed keeper: ${state}`, (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-keeper-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'state.json');
  if (state === 'stale') fs.writeFileSync(file, '{"wasRunning":true}');
  const calls = [];
  const keeper = createInstalledKeeper({ file, driver: {
    installedRunning: () => state === 'running', testIslands: () => 0,
    quitInstalled: () => calls.push('quit'), launchInstalled: () => calls.push('launch'),
  } });
  for (const fn of [keeper.pause, keeper.resume, keeper.sweep]) {
    if (state === 'clear' || fn === keeper.resume) fn(); else assert.throws(fn, /BLOCKED/);
  }
  assert.deepEqual(calls, []);
  assert.equal(fs.existsSync(file), state === 'stale');
});

function keeperFixture(t, { running = true, remaining = 0, exits = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fu-keeper-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'state.json');
  const calls = [];
  let clock = 0;
  const keeper = createInstalledKeeper({ file, timeoutMs: 300, now: () => clock,
    sleep: (ms) => { clock += ms; if (exits) remaining = 0; }, driver: {
      installedRunning: () => running,
      quitInstalled: () => { calls.push('quit'); running = false; },
      launchInstalled: () => { calls.push('launch'); running = true; },
      testIslands: () => remaining,
      stopTestIslands: () => calls.push('stop-owned'),
      registerLogin: () => { throw new Error('keeper must never register'); },
      unregisterLogin: () => { throw new Error('keeper must never unregister'); },
    } });
  return { keeper, file, calls, running: () => running, setRemaining: (n) => { remaining = n; } };
}

test('B4: resume waits for the launchd fixture guardian before restoring installed island', (t) => {
  const f = keeperFixture(t, { remaining: 1 });
  f.keeper.pause();
  f.keeper.resume();
  assert.equal(f.running(), true);
  assert.deepEqual(f.calls, ['quit', 'stop-owned', 'launch']);
  assert.equal(fs.existsSync(f.file), false);
});

test('B6: two-islands guard retains journal and refuses a persistent fixture', (t) => {
  const f = keeperFixture(t, { remaining: 1, exits: false });
  f.keeper.pause();
  assert.throws(f.keeper.resume, /test island is still running/);
  assert.equal(f.running(), false);
  assert.equal(fs.existsSync(f.file), true);
  f.setRemaining(0);
  f.keeper.resume();
  assert.equal(f.running(), true);
  assert.equal(fs.existsSync(f.file), false);
});

test('B6: installed island initially off stays off; keeper never changes login items', (t) => {
  for (const running of [false, true]) {
    const f = keeperFixture(t, { running });
    f.keeper.pause();
    f.keeper.resume();
    f.keeper.resume();
    assert.equal(f.running(), running);
    assert.deepEqual(f.calls, running ? ['quit', 'launch'] : []);
    assert.equal(fs.existsSync(f.file), false);
  }
});

test('B4: only the originating waiter can resume a dead owner pause after SIGKILL', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fu-resume-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'state.json');
  const saved = { wasRunning: true, pid: 123, started: 'birth', stamp: 'originating-waiter' };
  fs.writeFileSync(file, JSON.stringify(saved));
  let running = false;
  let ownerAlive = true;
  const keeper = createInstalledKeeper({ file, driver: {
    installedRunning: () => running, ownerAlive: () => ownerAlive, testIslands: () => 0,
    launchInstalled: () => { running = true; },
  } });
  assert.throws(() => keeper.resumeRun('unrelated-waiter'), /BLOCKED/);
  assert.throws(() => keeper.resumeRun(saved.stamp), /BLOCKED/);
  assert.equal(running, false);
  assert.equal(fs.existsSync(file), true);
  ownerAlive = false;
  assert.throws(() => keeper.resumeRun('unrelated-waiter'), /BLOCKED/);
  keeper.resumeRun(saved.stamp);
  assert.equal(running, true);
  assert.equal(fs.existsSync(file), false);
});
