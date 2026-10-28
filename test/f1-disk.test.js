'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { load } = require('./support/load-isolated');

for (const kind of ['foreign-name', 'misleading-path', 'owned', 'wrong-device', 'replaced-image', 'foreign-record']) {
  test(`M05: stale disk ${kind} requires canonical image and recorded device ownership`, (t) => {
    const base = path.join(os.tmpdir(), 'notch-island-tests');
    fs.mkdirSync(base, { recursive: true });
    const outer = kind === 'foreign-record' ? fs.mkdtempSync(path.join(os.tmpdir(), 'f1-foreign-disk-')) : base;
    if (outer !== base) t.after(() => fs.rmSync(outer, { recursive: true, force: true }));
    const dir = fs.mkdtempSync(path.join(outer, 'scenario-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const image = path.join(dir, 'documents.dmg');
    fs.writeFileSync(image, 'owned');
    const stat = fs.statSync(image);
    fs.writeFileSync(path.join(dir, 'documents.mount.json'), JSON.stringify({
      image: fs.realpathSync(image), device: '/dev/disk41', ino: kind === 'replaced-image' ? -1 : stat.ino, dev: stat.dev,
    }));
    const source = kind === 'foreign-name' ? '/Users/someone/Downloads/foreign.dmg'
      : kind === 'misleading-path' ? `/Users/someone/notch-island-tests/scenario-fake/documents.dmg` : image;
    const device = kind === 'wrong-device' ? '/dev/disk42' : '/dev/disk41';
    const calls = [];
    const info = `================================================\nimage-path : ${source}\n${device}\tGUID_partition_scheme\n${device}s1\tAPFS\t/Volumes/NotchIslandScratchDocs\n`;
    const shelf = load('shelf.js', {
      './cleanup': { onCleanup() {} }, './sandbox': { scratch: () => dir }, './island': {}, './procs': {}, './paths': {},
      './scratch-images': require('./support/scratch-images'),
    });
    shelf._setHdiutilRunner((args) => { calls.push(args); if (args[0] === 'info') return info; throw new Error('stop before create'); });
    assert.throws(() => shelf.scratchDocuments({ defer() {} }), /stop before create/);
    const detaches = calls.filter((a) => a[0] === 'detach');
    if (kind === 'owned') assert.equal(detaches.filter((a) => a[1] === device).length, 1);
    else assert.equal(detaches.length, 0, 'foreign disk must never be detached');
  });
}

test('M05: disconnect preserves a scratch mount lacking ownership instead of deleting through it', async (t) => {
  const { EventEmitter } = require('node:events');
  const base = path.join(os.tmpdir(), 'notch-island-tests');
  fs.mkdirSync(base, { recursive: true });
  const dir = fs.mkdtempSync(path.join(base, 'scenario-'));
  fs.mkdirSync(path.join(dir, 'ScratchVolume'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const fake = new EventEmitter();
  let exit;
  Object.assign(fake, { argv: ['node', 'guardian', dir], connected: true, send() {}, exit: (code) => { exit = code; } });
  load('scratch-guardian.js', {
    './scratch-images': require('./support/scratch-images'),
    'node:child_process': { execFileSync: () => `image-path : /foreign/image.dmg\n/dev/disk41\tAPFS\t${fs.realpathSync(dir)}/ScratchVolume\n` },
  }, { process: fake, console: { error() {} } });
  fake.emit('disconnect');
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(exit, 1);
  assert.ok(fs.existsSync(dir), 'cleanup deleted through an unowned mount');
});
