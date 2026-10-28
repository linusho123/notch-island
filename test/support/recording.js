'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startOwned } = require('./sandbox');
const { scratchDesktop, setupScreenshotLocation } = require('./shelf');
const procs = require('./procs');
const harness = require('./harness');
const exactName = 'Screen Recording 2026-10-18 at 10.16.40.mov';

async function start(w, name = 'Screen Recording privacy.mov') {
  const desktop = scratchDesktop(w);
  setupScreenshotLocation(w, desktop);
  const file = path.join(desktop, name);
  assert.equal(path.dirname(file), desktop);
  assert.ok(!fs.existsSync(file), 'never overwrite an existing recording');
  // Let the existing watcher observe its scratch location before creation.
  await procs.sleep(1200);
  const screens = await harness.screens();
  const index = screens.screens.findIndex((s) => s.displayID === screens.builtIn.displayID) + 1;
  assert.ok(index > 0, 'no built-in recording display');
  const started = Date.now();
  const handle = await startOwned(w, '/usr/sbin/screencapture', ['-v', '-x', `-D${index}`, file]);
  w.recording = { file, started, handle, stopped: false };
  // F1's independent owner terminates this exact native child BEFORE deleting
  // its scratch Desktop on failure, owner death or interruption.
  w.defer(() => procs.stop(handle));
  await procs.sleep(1000);
  assert.ok(procs.alive(handle), 'native recorder exited before the action');
}
async function stop(w) {
  const r = w.recording;
  assert.ok(r, 'native recording was not started');
  if (r.stopped) return;
  assert.ok(procs.ownsPid(r.handle.pid), 'recording no longer has its owned process');
  // screencapture finalizes the movie on SIGINT. Never signal the toolbar,
  // another recorder, or any system process.
  process.kill(r.handle.pid, 'SIGINT');
  let timer;
  let end;
  try {
    end = await Promise.race([r.handle.finished, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('native recording did not finalize')), 10000);
    })]);
  } finally { clearTimeout(timer); }
  assert.equal(end.code, 0, `native recorder failed (${end.code ?? end.signal})`);
  assert.ok(fs.existsSync(r.file) && fs.statSync(r.file).size > 0, 'native recording was not saved');
  r.stopped = true;
}
const { assertArrival } = require('./recording-check');
module.exports = { start, stop, exactName, assertArrival };
