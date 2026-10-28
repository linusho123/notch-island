'use strict';
// Screen-free replay of the run-7 playback timeout. The helper answers with
// real-style playback data after 12 seconds of virtual decode time.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./support/load-isolated');

function fixture(delay) {
  const files = new Map();
  let op;
  let clock = 0;
  let due = Infinity;
  const dir = '/scratch/share';
  const fs = {
    mkdirSync() {}, rmSync: (p) => files.delete(p), symlinkSync() {},
    writeFileSync: (p, value) => files.set(p, value),
    renameSync: (from, to) => { files.set(to, files.get(from)); op = JSON.parse(files.get(to)).op; due = clock + delay; },
    existsSync: (p) => p.endsWith('ready.json') || files.has(p)
      || (p.endsWith('response.json') && clock >= due),
    readFileSync: (p) => p.endsWith('ready.json') ? '{"streamStarted":true}'
      : p.endsWith('response.json') ? JSON.stringify({ frames: [{ captured: 1 }], op }) : files.get(p),
  };
  const share = load('capture-share.js', {
    'node:fs': fs, './capture-preflight': { preflight: () => ({ notch: {} }) }, './capture': {},
    './sandbox': { scratch: () => '/scratch', startOwned: async () => ({ pid: 1 }) },
    './paths': { harness: '/helper' }, './procs': {},
    './island': { inputFile: () => '/input', until: async (pred, timeout, message) => {
      const end = clock + timeout;
      while (clock < end) { const result = await pred(); if (result) return result; clock += 100; }
      throw new Error(message);
    } },
    './login': { prepare: async (w) => { w.login = { input: '/login' }; } },
  });
  const w = { defer() {} };
  return { share, w };
}

test('B8: native playback decoding gets its own bounded deadline', async () => {
  const { share, w } = fixture(12000);
  await share.start(w, 'recording');
  assert.equal((await w.captureShare.request({ op: 'playback', file: '/owned/movie.mov' })).op, 'playback');
});

test('B8: a hung live request still fails at the short deadline', async () => {
  const { share, w } = fixture(12000);
  await share.start(w, 'recording');
  await assert.rejects(w.captureShare.request({ op: 'capture' }), /did not answer capture/);
});

test('B8: playback still refuses a helper that never finishes', async () => {
  const { share, w } = fixture(61000);
  await share.start(w, 'recording');
  await assert.rejects(w.captureShare.request({ op: 'playback' }), /did not answer playback/);
});

test('B8: run-7 wing evidence cannot pass without a screenshot reference control', () => {
  const { sharedCaptureVerdict } = require('./support/capture');
  const { shots } = require('./fixtures/recorded-wing-run-7.json');
  assert.equal(shots.screencapture.baselineControl, 0);
  assert.equal(shots.screenCaptureKit.baselineControl, 1);
  const verdict = sharedCaptureVerdict(shots);
  assert.equal(verdict.ok, false);
  assert.match(verdict.message, /control window is absent/);
});
