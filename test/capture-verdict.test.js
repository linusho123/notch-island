'use strict';
// head-1: a foreign window above the D110 backdrop (a menu-bar app's popover)
// darkens the capture without the island being in it. That is an environment
// problem for the visionary to clear, never "D110 is false".
const test = require('node:test');
const assert = require('node:assert/strict');
const { captureVerdict } = require('./support/capture');

const dark = { screencapture: { mean: 0.87 }, screenCaptureKit: { mean: 0.87 }, foreignWindows: [] };
const popover = { owner: 'CPU Monitor', pid: 4242, layer: 101, frame: { x: 900, y: 40, w: 63, h: 190 } };

test('head-1: a foreign window over the rect is reported as the environment, not as D110 false', () => {
  const v = captureVerdict({ ...dark, foreignWindows: [popover] });
  assert.equal(v.ok, false);
  assert.equal(v.kind, 'environment');
  assert.match(v.message, /CPU Monitor/);
  assert.doesNotMatch(v.message, /shows the island/);
});

test('head-1: dark captures with nothing foreign over the rect still read as D110 false', () => {
  const v = captureVerdict(dark);
  assert.equal(v.ok, false);
  assert.equal(v.kind, 'd110');
  assert.match(v.message, /shows the island/);
});

test('head-1: bright captures pass', () => {
  const v = captureVerdict({ screencapture: { mean: 1 }, screenCaptureKit: { mean: 1 }, foreignWindows: [] });
  assert.equal(v.ok, true);
});

test('head-1: a foreign window does not hide a passing capture', () => {
  const v = captureVerdict({ screencapture: { mean: 1 }, screenCaptureKit: { mean: 1 }, foreignWindows: [popover] });
  assert.equal(v.ok, true);
});

const screen = { x: 0, y: 0, w: 1710, h: 1107 };
test('B7: ruled full-screen Dock/Notification Center layers cannot mask D110', () => {
  const layers = [{ owner: 'Dock', layer: 20, frame: screen }, { owner: 'Notification Center', layer: 21, frame: screen }];
  assert.equal(captureVerdict({ ...dark, screen, foreignWindows: layers }).kind, 'd110');
  for (const foreign of [popover, { ...layers[0], frame: popover.frame }, { ...layers[0], layer: 21 }]) {
    assert.equal(captureVerdict({ ...dark, screen, foreignWindows: [...layers, foreign] }).kind, 'environment');
  }
});

test('B7: capture rectangle comes from the settled panel, never the first open frame', async () => {
  const { settledPanel } = require('./support/capture');
  let clock = 0;
  const views = [-8, 11, 110, 154, 150].map((h) => ({ open: true, panel: { x: 600, y: 41, w: 470, h } }));
  const view = await settledPanel(async () => views.length > 1 ? views.shift() : views[0], {
    now: () => clock, sleep: async (ms) => { clock += ms; },
  });
  assert.equal(view.panel.h, 150);
  assert.ok(clock >= 350);
});
