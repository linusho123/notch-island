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
    // The shelf-item row of the drag outline waits for the shelf (P4).
    { feature: 'music-panel', scenarios: ['Dragging <what> far from the island keeps it open until let go'] },
    {
      feature: 'shelf-captures-and-files',
      scenarios: [
        'A stack drags out as one group',
        'Dragging a file onto the closed notch opens the shelf as a drop target',
        'Letting go over the open shelf parks the file',
        'Dropping <dropped> onto the notch parks <parked>',
        'Dropped highlighted text is refused',
        'A parked stack of files drags out as a group',
        'A parked folder drags out whole',
        'Moving <item> in Finder keeps it on the shelf at its new place',
        'A parked file moved to the Trash leaves the shelf',
        'A parked file dropped on the Desktop leaves the shelf',
        'Parking a file leaves it in its folder',
        'Dragging a parked file out behaves as if dragged from its folder',
        'Dragging a parked screenshot into <target> attaches it',
        'An accepted drop takes the screenshot off the shelf',
        'A refused drop leaves <item> on the shelf',
        'Removing <item> from the shelf by <how>',
        'Removing a link by the remove area',
        'The remove area shows only while a shelf item is being dragged',
        'Dropping a parked file on <where> is a real drop',
      ],
    },
    'shelf-notes-and-reminders',
  ],
  manifest: path.join(__dirname, '..', 'features', 'run-manifest.ndjson'),
});
