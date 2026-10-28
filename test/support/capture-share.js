'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { preflight } = require('./capture-preflight');
const { sharedCaptureVerdict } = require('./capture');
const { scratch, startOwned } = require('./sandbox');
const paths = require('./paths');

async function start(w, service) {
  // R1 evidence is required BEFORE pausing an app, starting a stream or
  // changing Music. An absent prerequisite is blocked, not a proxy pass.
  if (service !== 'recording') {
    w.captureService = { name: service, evidence: require('./service-evidence').load(service) };
  }
  // Refuse conflicts before the explicit authorized P5 pause or a fixture.
  const { notch } = preflight();
  const island = require('./island');
  const procs = require('./procs');
  const dir = path.join(scratch(w), 'share');
  fs.mkdirSync(dir);
  const log = path.join(dir, 'stream.log');
  const handle = await startOwned(w, paths.harness,
    ['capture-share', dir, notch.x, notch.y, notch.w, notch.h],
    { env: { ...process.env, NOTCH_ISLAND_OWNER_PID: String(process.pid) }, stdout: log, stderr: log });
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
  w.captureShare = { handle, request, stop, dir };
  await island.until(() => read('ready.json')?.streamStarted, 10000, 'SCK stream did not start');
  // Check again immediately before the existing launcher can touch anything.
  preflight();
  // V1's existing fixture and disconnect guardian unregister even if the
  // runner is SIGKILLed. It never pauses or restarts the installed island.
  await require('./login').prepare(w);
  // Reused P3/P4 Given helpers must feed this exact owned fixture.
  fs.symlinkSync(w.login.input, island.inputFile(w));
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

async function arm(w, kind) {
  w.captureKind = kind;
  w.captureInterval = await w.captureShare.request({ op: 'arm', kind });
}

async function capture(w) {
  const island = require('./island');
  const before = await island.look(w.island.pid);
  assert.ok(w.captureVisible(before), 'nothing on screen: Accessibility lost the visible island before capture');
  const rect = w.captureKind === 'wing' ? before.wing.frame : before.panel;
  const region = w.captureInterval.rect;
  assert.ok(rect.x >= region.x - 1 && rect.y >= region.y - 1
    && rect.x + rect.w <= region.x + region.w + 1 && rect.y + rect.h <= region.y + region.h + 1,
  'visible island escaped the measured region');
  const first = await w.captureShare.request({ op: 'mark' });
  await w.captureShare.request({ op: 'capture' });
  const after = await island.look(w.island.pid);
  assert.ok(w.captureVisible(after), 'nothing on screen: Accessibility lost the visible island during capture');
  const last = await w.captureShare.request({ op: 'mark' });
  const shots = await w.captureShare.request({ op: 'capture' });
  shots.timeline.end = last.time;
  shots.timeline.visible = [first.time, last.time];
  if (w.captureService) shots.service = w.captureService;
  if (w.recording) {
    await require('./recording').stop(w);
    shots.playback = await w.captureShare.request({ op: 'playback', file: w.recording.file });
  }
  // Measurement-input probes, explicitly separate from physical app probes.
  if (process.env.P6_CAPTURE_PROBE === 'visible-island') shots.timeline.frames[0].changedFraction = 1;
  if (process.env.P6_CAPTURE_PROBE === 'missing-control') shots.timeline.frames[0].control = 0;
  if (process.env.P6_CAPTURE_PROBE === 'stale-frame') shots.timeline.frames[0].captured = shots.timeline.start - 1;
  if (process.env.P6_CAPTURE_PROBE === 'playback-leak' && shots.playback) shots.playback.frames[0].changedFraction = 1;
  if (process.env.P6_CAPTURE_PROBE === 'playback-control' && shots.playback) shots.playback.frames[0].control = 0;
  console.log(`P6 capture ${w.captureService?.name || 'native recording'} ${w.captureKind}: ${JSON.stringify({ rect, shots })}`);
  const verdict = sharedCaptureVerdict(shots);
  assert.ok(verdict.ok, verdict.message);
}

module.exports = { start, baseline, arm, capture };
