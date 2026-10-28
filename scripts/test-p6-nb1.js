#!/usr/bin/env node
'use strict';
// NB1's three regression rows, without writing the phase manifest.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseFeature, StepRegistry, runFeature } = require('gherkin-node-test');
require('../test/support/require-idle').assertInIdleRun();

const rows = {
  'music-panel': 'The island checked 0.1 seconds after it starts closing [1]',
  'music-sources': 'Play after the visionary quit Apple Music resumes "Wonderwall" at 2:10 [1]',
  'new-song-notice': '20 songs starting about a second apart keep the wing out [3]',
};
for (const [name, title] of Object.entries(rows)) {
  const file = path.resolve(__dirname, '..', 'features', `${name}.feature`);
  const feature = parseFeature(fs.readFileSync(file, 'utf8'), file);
  feature.scenarios = feature.scenarios.filter((s) => s.name === title);
  assert.equal(feature.scenarios.length, 1, `missing NB1 row: ${title}`);
  const texts = feature.scenarios.flatMap((s) => s.steps.map((step) => step.text));
  const registry = new StepRegistry();
  require(`../test/steps/${name}.steps`)({ define: (pattern, fn) => {
    if (texts.some((text) => pattern.test(text))) registry.define(pattern, fn);
  } });
  runFeature(feature, registry);
}
