'use strict';
// MF4: screen-free round-trip test of pasteboard-save and pasteboard-restore
// on a named scratch pasteboard (never touches the general pasteboard).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { harness } = require('./support/paths');

test('harness pasteboard-save and pasteboard-restore round-trip on a named scratch pasteboard', () => {
  const scratchName = `test-scratch-pb-${process.pid}`;
  // Set some known content
  execFileSync(harness, ['pasteboard-set', scratchName, 'public.utf8-plain-text', 'hello notch island']);

  // Save the pasteboard state
  const savedOutput = execFileSync(harness, ['pasteboard-save', scratchName], { encoding: 'utf8' });
  const saved = JSON.parse(savedOutput);
  assert.ok(Array.isArray(saved.items), 'saved pasteboard has items array');
  assert.ok(saved.types.includes('public.utf8-plain-text'), 'saved types include plain text');

  // Overwrite the scratch pasteboard with something else
  execFileSync(harness, ['pasteboard-set', scratchName, 'public.utf8-plain-text', 'overwritten content']);
  const overwrittenOutput = execFileSync(harness, ['pasteboard-save', scratchName], { encoding: 'utf8' });
  const overwritten = JSON.parse(overwrittenOutput);
  assert.notDeepEqual(overwritten.items, saved.items);

  // Restore the saved state via temporary file
  const tmpFile = path.join(os.tmpdir(), `pb-test-${process.pid}.json`);
  fs.writeFileSync(tmpFile, JSON.stringify(saved));
  try {
    const restoreOutput = execFileSync(harness, ['pasteboard-restore', tmpFile, scratchName], { encoding: 'utf8' });
    const restoredRes = JSON.parse(restoreOutput);
    assert.equal(restoredRes.ok, true);
  } finally {
    try { fs.rmSync(tmpFile, { force: true }); } catch {}
  }

  // Verify the restored pasteboard matches the original saved state
  const verifyOutput = execFileSync(harness, ['pasteboard-save', scratchName], { encoding: 'utf8' });
  const verified = JSON.parse(verifyOutput);
  assert.deepEqual(verified.items, saved.items);
  assert.deepEqual(verified.types, saved.types);
});
