'use strict';
// The acceptance suite: every feature file under features/, bound to its
// steps, under the gherkin-node-test ratchet. A feature leaves `wip` only
// when every one of its steps is bound and green; wip only shrinks.
const path = require('node:path');
const { runFeatures } = require('gherkin-node-test');

runFeatures(path.join(__dirname, '..', 'features'), {
  'music-panel': require('./steps/music-panel.steps'),
}, {
  wip: [
    'around-the-clock',
    'music-panel',
    'music-sources',
    'new-song-notice',
    'shelf-captures-and-files',
    'shelf-notes-and-reminders',
  ],
  manifest: path.join(__dirname, '..', 'features', 'run-manifest.ndjson'),
});
