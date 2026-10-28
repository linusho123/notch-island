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
