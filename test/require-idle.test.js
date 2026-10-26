'use strict';
// P3 fix S3: the UI feature suite refuses to run outside scripts/when-idle.sh
// (BUILD-PLAN, Sharing the Mac): a bare `npm test` would drive the screen with
// no idle wait and no input guard.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { assertInIdleRun } = require('./support/require-idle');

test('outside the waiter the UI suite refuses, and says to use scripts/when-idle.sh', () => {
  assert.throws(() => assertInIdleRun({}), /scripts\/when-idle\.sh/);
});

test('inside the waiter (its post stamp is set) the UI suite may run', () => {
  assert.doesNotThrow(() => assertInIdleRun({ NOTCH_ISLAND_POST_STAMP: '/tmp/stamp' }));
});

test('the feature suite asks before it starts', () => {
  const src = fs.readFileSync(path.join(__dirname, 'features.test.js'), 'utf8');
  assert.match(src, /assertInIdleRun\(\)/);
  assert.ok(src.indexOf('assertInIdleRun()') < src.indexOf('runFeatures('), 'it asks only after it started');
});

test('the harness asks before any UI test file can drive the screen', () => {
  const src = fs.readFileSync(path.join(__dirname, 'support', 'harness.js'), 'utf8');
  assert.match(src, /assertInIdleRun\(\)/);
});

test('fullscreen-wing-out relies on the shared check in harness, not a copy per file', () => {
  const src = fs.readFileSync(path.join(__dirname, 'fullscreen-wing-out.test.js'), 'utf8');
  assert.ok(!src.includes('assertInIdleRun'), 'fullscreen-wing-out still has a copy per file');
});

test('loading the harness outside the waiter refuses with the when-idle message', () => {
  const env = { ...process.env };
  delete env.NOTCH_ISLAND_POST_STAMP;
  const r = spawnSync(process.execPath, ['-e', 'require("./test/support/harness")'], { env, encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /scripts\/when-idle\.sh/);
});

const UI_FILES = [
  'drag-keeps-open.test.js',
  'flip-card.test.js',
  'fullscreen-wing-out.test.js',
  'hidden-from-capture.test.js',
  'last-song-controls.test.js',
  'lost-mouse-up.test.js',
  'seek-no-flicker.test.js',
  'shelf-drop-on-island.test.js',
];

for (const file of UI_FILES) {
  test(`a UI file run directly (${file}) refuses with a plain message and a non-zero exit, without moving the pointer`, () => {
    const env = { ...process.env };
    delete env.NOTCH_ISLAND_POST_STAMP;
    const r = spawnSync(process.execPath, [path.join(__dirname, file)], { env, encoding: 'utf8' });
    assert.notEqual(r.status, 0, `${file} should exit non-zero`);
    assert.match(r.stderr, /scripts\/when-idle\.sh/, `${file} should explain that scripts/when-idle.sh is required`);
    assert.match(r.stderr, /support\/harness\.js/, `${file} should refuse from harness.js`);
    assert.equal(r.stdout, '', `${file} started running tests instead of refusing during load`);
  });
}
