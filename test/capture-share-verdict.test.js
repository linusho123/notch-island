'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { sharedCaptureVerdict: verdict } = require('./support/capture');
const { foreignOverNotch } = require('./support/capture-preflight');
const good = { control: 1, baselineControl: 1, changedFraction: 0 };
const shots = () => ({ screencapture: { ...good }, screenCaptureKit: { ...good } });

test('V2a requires both capture paths and their same-frame positive control', () => {
  assert.equal(verdict(shots()).ok, true);
  for (const name of ['screencapture', 'screenCaptureKit']) {
    for (const [field, value, kind] of [
      ['control', 0, 'no-control'], ['baselineControl', 0, 'no-control'],
      ['changedFraction', 0.2, 'd110'], ['changedFraction', NaN, 'd110'],
    ]) {
      const s = shots();
      s[name][field] = value;
      assert.equal(verdict(s).kind, kind, `${name} ${field}`);
    }
    const s = shots();
    delete s[name];
    assert.equal(verdict(s).kind, 'no-shot');
  }
});

test('V2a rejects a missing control before reading island absence', () => {
  const s = shots();
  s.screencapture.control = 0;
  s.screencapture.changedFraction = 0;
  assert.match(verdict(s).message, /nothing on screen/);
});

test('V2a preflight catches foreign floating windows without moving them', () => {
  const notch = { x: 763, y: 0, w: 185, h: 33 };
  const window = { owner: 'Dock', pid: 123, layer: 20, frame: { x: 0, y: 0, w: 1710, h: 1107 } };
  assert.deepEqual(foreignOverNotch([window], notch), [window]);
  assert.deepEqual(foreignOverNotch([{ ...window, layer: 0 }], notch), []);
  assert.deepEqual(foreignOverNotch([{ ...window, frame: { x: 0, y: 100, w: 100, h: 100 } }], notch), []);
  assert.deepEqual(foreignOverNotch([{ ...window, owner: 'Window Server' }], notch), []);
});
