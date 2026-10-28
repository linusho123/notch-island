'use strict';
// Read-only and safe to import before UI helpers. No recovery is attempted.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { listIslands } = require('./island-procs');
const keeperFile = path.join(os.tmpdir(), 'notch-island-installed-island.json');
function assertFixtureSession({ islands = listIslands, exists = fs.existsSync,
  owned = () => false } = {}) {
  if (exists(keeperFile)) throw new Error(`BLOCKED: installed-island keeper state needs human recovery: ${keeperFile}`);
  const foreign = islands().filter((pid) => !owned(pid));
  if (foreign.length) throw new Error(`BLOCKED: an unowned island is running (${foreign.join(', ')}); prepare a fixture-only session`);
}
module.exports = { assertFixtureSession };
