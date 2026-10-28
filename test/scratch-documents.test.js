'use strict';
// Screen-free hdiutil stand-in: exact image/device ownership, no mount calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { load } = require('./support/load-isolated');
function fixture(t) {
  const base = path.join(os.tmpdir(), 'notch-island-tests');
  fs.mkdirSync(base, { recursive: true });
  const dir = fs.mkdtempSync(path.join(base, 'scenario-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const defers = [];
  const hooks = [];
  const shelf = load('shelf.js', {
    './sandbox': { scratch: () => dir }, './island': {}, './procs': {}, './paths': {},
    './cleanup': { onCleanup: (fn) => { hooks.push(fn); return () => {}; } },
    './scratch-images': require('./support/scratch-images'),
  });
  return { shelf, dir, defers, hooks, world: { defer: (fn) => defers.push(fn) } };
}

test('forced image failure never falls back to the boot volume', (t) => {
  const f = fixture(t);
  f.shelf._setHdiutilRunner(() => '');
  process.env.NOTCH_ISLAND_FORCE_HDIUTIL_FAIL = '1';
  try { assert.throws(() => f.shelf.scratchDocuments(f.world), /forced failure/); }
  finally { delete process.env.NOTCH_ISLAND_FORCE_HDIUTIL_FAIL; }
});

test('detach cleanup is armed before attach and uses its recorded device', (t) => {
  const f = fixture(t);
  const image = path.join(f.dir, 'documents.dmg');
  const calls = [];
  f.shelf._setHdiutilRunner((args) => {
    calls.push(args);
    if (args[0] === 'info') return fs.existsSync(image) ? `image-path : ${image}\n/dev/disk41\tGUID_partition_scheme\n` : '';
    if (args[0] === 'create') fs.writeFileSync(image, 'disk');
    if (args[0] === 'attach') {
      assert.ok(f.defers.length && f.hooks.length, 'cleanup not armed before attach');
      return '/dev/disk41\tGUID_partition_scheme\n';
    }
    return '';
  });
  f.shelf.scratchDocuments(f.world);
  for (const fn of f.defers.reverse()) fn();
  assert.deepEqual(Array.from(calls.find((a) => a[0] === 'detach')), ['detach', '/dev/disk41', '-force', '-quiet']);
});

test('failed attach never force-detaches a guessed mountpoint', (t) => {
  const f = fixture(t);
  const calls = [];
  f.shelf._setHdiutilRunner((args) => {
    calls.push(args);
    if (args[0] === 'attach') throw new Error('failed attach');
    return '';
  });
  assert.throws(() => f.shelf.scratchDocuments(f.world), /failed attach/);
  assert.ok(!calls.some((a) => a[0] === 'detach'));
});
