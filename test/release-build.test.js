'use strict';
// The test-only input is compiled out of the installed app: the release
// bundle carries none of its names, while the test bundle does (so the check
// is looking at the right thing).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { releaseBinary, testBinary } = require('./support/paths');

// Long enough to sit in the binary as text (Swift keeps strings of 15 bytes
// or fewer inside the code itself).
const MARKERS = ['NOTCH_ISLAND_TEST_INPUT', '--test-unregister-login-and-exit'];

test('the installed app carries no test input', () => {
  const release = fs.readFileSync(releaseBinary);
  const testBuild = fs.readFileSync(testBinary);
  for (const m of MARKERS) {
    assert.ok(testBuild.includes(m), `the test build lacks ${m}: the check looks at the wrong thing`);
    assert.ok(!release.includes(m), `the release build still carries ${m}`);
  }
});
