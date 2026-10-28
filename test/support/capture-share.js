'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { preflight } = require('./capture-preflight');
const { sharedCaptureVerdict } = require('./capture');
const { scratch } = require('./sandbox');
const paths = require('./paths');

async function start(w) {
  // Refuse before starting a fixture; never use the installed-app keeper.
  const { notch } = preflight();
  const island = require('./island');
  const procs = require('./procs');
  const dir = path.join(scratch(w), 'share');
  fs.mkdirSync(dir);
  const log = fs.openSync(path.join(dir, 'stream.log'), 'a');
  const handle = procs.start('Zoom/Meet capture stand-in', paths.harness,
    ['capture-share', dir, notch.x, notch.y, notch.w, notch.h].map(String),
    { env: { ...process.env, NOTCH_ISLAND_OWNER_PID: String(process.pid) }, stdio: ['ignore', log, log] });
  fs.closeSync(log);
  const read = (name) => {
    const error = path.join(dir, 'error.json');
    if (fs.existsSync(error)) throw new Error(fs.readFileSync(error, 'utf8'));
    const file = path.join(dir, name);
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  };
  let stopped = false;
  const request = async (value) => {
    fs.rmSync(path.join(dir, 'response.json'), { force: true });
    const temp = path.join(dir, 'request.tmp');
    fs.writeFileSync(temp, JSON.stringify(value));
    fs.renameSync(temp, path.join(dir, 'request.json'));
    return island.until(() => {
      const response = read(value.op === 'stop' ? 'stopped.json' : 'response.json');
      if (response?.error) throw new Error(response.error);
      return response;
    }, 10000, `share stand-in did not answer ${value.op}`);
  };
  const stop = async () => {
    if (stopped) return;
    try {
      const response = await request({ op: 'stop' });
      assert.ok(response.streamStopped && response.controlsClosed, 'share did not tear down');
      await island.until(() => !procs.alive(handle), 3000, 'share process stayed alive after stopping');
      stopped = true;
    } finally { await procs.stop(handle); }
  };
  w.defer(stop);
  w.captureShare = { handle, request, stop };
  await island.until(() => read('ready.json')?.streamStarted, 10000, 'SCK stream did not start');
  // Check again immediately before the existing launcher can touch anything.
  preflight();
  // V1's existing fixture and disconnect guardian unregister even if the
  // runner is SIGKILLed. It never pauses or restarts the installed island.
  await require('./login').prepare(w);
}

async function baseline(w) {
  const island = require('./island');
  const harness = require('./harness');
  const { notch } = await harness.builtIn();
  const view = await island.look(w.island.pid);
  assert.ok(island.isPlainNotch(view, notch), 'reference was not the plain notch');
  const result = await w.captureShare.request({ op: 'baseline' });
  assert.ok(result.baseline, 'no plain reference was captured');
}

async function capture(w) {
  const island = require('./island');
  const before = await island.look(w.island.pid);
  assert.ok(w.captureVisible(before), 'nothing on screen: Accessibility lost the visible island before capture');
  const rect = w.captureKind === 'wing' ? before.wing.frame : before.panel;
  const shots = await w.captureShare.request({ op: 'capture', rect, kind: w.captureKind });
  const after = await island.look(w.island.pid);
  assert.ok(w.captureVisible(after), 'nothing on screen: Accessibility lost the visible island during capture');
  const afterRect = w.captureKind === 'wing' ? after.wing.frame : after.panel;
  assert.ok(['x', 'y', 'w', 'h'].every((k) => Math.abs(rect[k] - afterRect[k]) <= 1),
    'the island moved during the capture');
  // Optional measurement probes alter only the far-side check's input. They
  // never change the app or turn a missing control into a successful absence.
  if (process.env.P6_CAPTURE_PROBE === 'visible-island') {
    for (const s of Object.values(shots)) s.changedFraction = 1;
  } else if (process.env.P6_CAPTURE_PROBE === 'missing-control') {
    for (const s of Object.values(shots)) s.control = 0;
  }
  console.log(`V2a capture ${w.captureKind}: ${JSON.stringify({ rect, shots })}`);
  const verdict = sharedCaptureVerdict(shots);
  assert.ok(verdict.ok, verdict.message);
}

module.exports = { start, baseline, capture };
