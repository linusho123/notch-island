'use strict';
// One look at the island answers "which face, and which count" together: a
// face and a count read at different moments can each be right and still
// describe a card that was never so (P2 fix S1).

/** Whether one look (a view of the island) shows `face` (when known) with the count `count`. */
function showsFaceWithCount(view, face, count) {
  if (view.count?.value !== count) return false;
  return !face || view.title?.value === face;
}

module.exports = { showsFaceWithCount };
