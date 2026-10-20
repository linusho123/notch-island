'use strict';
// One scratch folder per scenario, removed when the scenario ends. The island
// keeps its data there (fed through the test input), never in the
// visionary's own Application Support folder.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const base = path.join(os.tmpdir(), 'notch-island-tests');

function scratch(world) {
  if (!world.scratch) {
    fs.mkdirSync(base, { recursive: true });
    world.scratch = fs.mkdtempSync(path.join(base, 'scenario-'));
    const dir = world.scratch;
    world.defer(() => fs.rmSync(dir, { recursive: true, force: true }));
  }
  return world.scratch;
}

module.exports = { scratch };
