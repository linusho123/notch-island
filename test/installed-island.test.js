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
