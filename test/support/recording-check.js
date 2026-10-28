'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
function assertArrival({ beforeItems, file, expectedFile, started, stat, view }) {
  assert.equal(beforeItems, 0, 'recording arrival cannot be proved from a seeded shelf');
  assert.equal(file, expectedFile, 'recording was not saved directly under its exact name');
  assert.ok(stat.birthtimeMs >= started - 1000 && stat.size > 0, 'recording predates the native run');
  assert.ok(view.open && view.page === 'shelf' && view.texts.includes(path.basename(file)), 'native recording did not arrive on the shelf');
  assert.equal(view.elements.filter((e) => e.identifier === 'shelf-item').length, 1,
    'watcher arrival must be the single new shelf item');
}
module.exports = { assertArrival };
