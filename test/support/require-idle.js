'use strict';
/** The UI suites run only through scripts/when-idle.sh, which sets the post stamp. */
function assertInIdleRun(env = process.env) {
  if (!env.NOTCH_ISLAND_POST_STAMP) {
    throw new Error('this suite drives the screen and must run through scripts/when-idle.sh '
      + '(it waits for an idle window and guards the pointer): scripts/when-idle.sh caffeinate -i npm test');
  }
}
module.exports = { assertInIdleRun };
