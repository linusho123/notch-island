'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { sharedCaptureVerdict: verdict } = require('./support/capture');
const good = () => ({ control: 1, baselineControl: 1, changedFraction: 0 });
const evidence = () => ({ screencapture: good(), screenCaptureKit: good(),
  timeline: { start: 10, end: 10.2, visible: [10.1, 10.15], frames: [
    { id: 1, captured: 10.01, ...good() }, { id: 2, captured: 10.1, ...good() },
    { id: 3, captured: 10.21, ...good() },
  ] } });

test('M08: a queued old frame is not made fresh by late delivery', () => {
  const e = evidence();
  e.timeline.frames = [{ id: 1, captured: 9, delivered: 10.3, ...good() }];
  assert.equal(verdict(e).ok, false);
});
test('M08: a leaking transition followed by a clean frame still fails', () => {
  const e = evidence();
  e.timeline.frames[1].changedFraction = 0.5;
  assert.equal(verdict(e).ok, false);
});
test('M08: bounded fresh evidence covers the action and visible interval', () => {
  assert.equal(verdict(evidence()).ok, true);
});
test('M07: decoded playback must contain its control and no panel or wing', () => {
  for (const kind of ['panel', 'wing']) {
    const e = evidence();
    e.playback = { kind, frames: [{ id: 1, captured: 10.1, ...good(), changedFraction: 0.3 }] };
    assert.equal(verdict(e).ok, false, `${kind} in playback`);
    e.playback.frames[0] = { id: 1, captured: 10.1, ...good(), control: 0 };
    assert.equal(verdict(e).ok, false, `${kind} has no playback control`);
  }
});
test('M06: named viewer claims reject an unmapped generic proxy', () => {
  for (const service of ['Zoom', 'Meet']) {
    const e = evidence();
    e.service = { name: service, evidence: { source: 'ScreenCaptureKit' } };
    assert.equal(verdict(e).ok, false);
  }
});

test('M07: arrival rejects seeded contents, a renamed/old file and missing watcher arrival', () => {
  const { assertArrival } = require('./support/recording-check');
  const file = '/owned/Desktop/Screen Recording 2026-10-18 at 10.16.40.mov';
  const row = { beforeItems: 0, file, expectedFile: file, started: 2000, stat: { birthtimeMs: 2001, size: 100 },
    view: { open: true, page: 'shelf', texts: [require('node:path').basename(file)], elements: [{ identifier: 'shelf-item' }] } };
  assert.doesNotThrow(() => assertArrival(row));
  for (const change of [{ beforeItems: 1 }, { file: '/other.mov' }, { stat: { birthtimeMs: 0, size: 100 } },
    { view: { ...row.view, texts: [] } }]) assert.throws(() => assertArrival({ ...row, ...change }));
});

test('M06: a reviewed real-service spike maps only its own service', () => {
  const service = require('./support/service-evidence');
  const observation = { visibleLocally: true, viewerControl: true, islandAbsent: true, artifact: 'viewer.mov', sha256: 'a'.repeat(64) };
  const spike = { service: 'Zoom', source: 'Zoom viewer', version: 'fixture', macos: 'fixture', observedAt: '2026-10-27', reviewedBy: 'fixture',
    observations: { panel: observation, wing: observation }, mapping: { checks: ['ScreenCaptureKit', 'screencapture'], reason: 'fixture mapping' } };
  assert.doesNotThrow(() => service.validate('Zoom', spike));
  assert.throws(() => service.validate('Meet', spike), /missing Meet/);
  assert.throws(() => service.validate('Zoom', { ...spike, mapping: null }));
  assert.throws(() => service.load('Zoom', null), /BLOCKED.*real Zoom/);
});

test('M08: evidence rejects truncated actions, missing visible correlation and duplicate frame IDs', () => {
  for (const change of [
    (e) => { e.timeline.frames.pop(); },
    (e) => { e.timeline.visible = []; },
    (e) => { e.timeline.frames[1].id = 1; },
    (e) => { e.timeline.overflow = true; },
    (e) => { e.timeline.frames[1].control = 0; },
  ]) {
    const e = evidence(); change(e); assert.equal(verdict(e).ok, false);
  }
});
