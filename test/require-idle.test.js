'use strict';
// P3 fix S3: the UI feature suite refuses to run outside scripts/when-idle.sh
// (BUILD-PLAN, Sharing the Mac): a bare `npm test` would drive the screen with
// no idle wait and no input guard.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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
