'use strict';
// The acceptance suite: every feature file under features/, bound to its
// steps, under the gherkin-node-test ratchet. A feature leaves `wip` only
// when every one of its steps is bound and green; wip only shrinks.
const path = require('node:path');
const { runFeatures } = require('gherkin-node-test');
const { assertInIdleRun } = require('./support/require-idle');

assertInIdleRun();

runFeatures(path.join(__dirname, '..', 'features'), {
  'music-panel': require('./steps/music-panel.steps'),
  'music-sources': require('./steps/music-sources.steps'),
  'new-song-notice': require('./steps/new-song-notice.steps'),
  'shelf-captures-and-files': require('./steps/shelf-captures-and-files.steps'),
}, {
  wip: [
    'around-the-clock',
    'shelf-notes-and-reminders',
  ],
  manifest: path.join(__dirname, '..', 'features', 'run-manifest.ndjson'),
});
