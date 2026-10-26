'use strict';
// MF2: forced hdiutil failure must make scratchDocuments fail with a plain message,
// and never fall back to the boot volume where Finder's delete reaches the real Trash.
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.NOTCH_ISLAND_POST_STAMP = process.env.NOTCH_ISLAND_POST_STAMP || '/tmp/screen-free-scratch-test';
const { scratchDocuments } = require('./support/shelf');

test('forced hdiutil failure makes scratchDocuments fail with a plain message, never falls back to boot volume', () => {
  const world = { defer: () => {} };
  process.env.NOTCH_ISLAND_FORCE_HDIUTIL_FAIL = '1';
  try {
    assert.throws(
      () => scratchDocuments(world),
      /scratch disk image creation or attach failed/
    );
  } finally {
    delete process.env.NOTCH_ISLAND_FORCE_HDIUTIL_FAIL;
  }
});
