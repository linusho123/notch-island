'use strict';
// The acceptance suite: every feature file under features/, bound to its
// steps, under the gherkin-node-test ratchet. A feature leaves `wip` only
// when every one of its steps is bound and green; wip only shrinks.
const path = require('node:path');
const { runFeatures } = require('gherkin-node-test');

runFeatures(path.join(__dirname, '..', 'features'), {
  'music-panel': require('./steps/music-panel.steps'),
  'music-sources': require('./steps/music-sources.steps'),
}, {
  wip: [
    'around-the-clock',
    // The shelf-item row of the drag outline waits for the shelf (P4).
    { feature: 'music-panel', scenarios: ['Dragging <what> far from the island keeps it open until let go'] },
    'new-song-notice',
    'shelf-captures-and-files',
    'shelf-notes-and-reminders',
  ],
  manifest: path.join(__dirname, '..', 'features', 'run-manifest.ndjson'),
});
