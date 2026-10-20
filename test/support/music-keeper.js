'use strict';
// Puts Apple Music back the way the visionary had it: whether it was running,
// its player state, the current track and position, shuffle and repeat. The
// state is saved before the harness first touches Music and written to a file,
// so a run that is killed outright (SIGKILL) is still put right by the next
// run's first touch (`sweep`). Everything is synchronous so it can run from
// the process-exit and signal clean-ups. The driver (the real one lives in
// music.js) is injectable for the node test.
const fs = require('node:fs');

function createKeeper({ driver, file }) {
  let saved = null;

  function persist() { fs.writeFileSync(file, JSON.stringify(saved)); }

  /** Restore from a file left by a run that never got to clean up. */
  function sweep() {
    if (saved || !fs.existsSync(file)) return;
    try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { saved = null; }
    if (saved) restore();
    else fs.rmSync(file, { force: true });
  }

  /** Remember Music as it is now (once; the first call before Music is touched). */
  function save() {
    sweep();
    if (saved) return;
    const wasRunning = driver.isRunning();
    // Reading the state starts Music if it was quit; wasRunning is already known.
    let snap;
    try {
      snap = driver.snapshot();
    } catch (e) {
      // Reading started Music if it was quit: do not leave it running.
      if (!wasRunning) { try { driver.quit(); driver.waitExited(); } catch { /* best effort */ } }
      throw e;
    }
    saved = { wasRunning, ...snap };
    persist();
  }

  function restore() {
    if (!saved) return;
    const s = saved;
    saved = null;
    try {
      if (s.wasRunning) driver.apply(s);
      else {
        driver.apply({ ...s, state: 'stopped', track: null, position: 0 });
        driver.quit();
        // Music takes a moment to exit; no read may come before it has.
        driver.waitExited();
      }
    } finally {
      fs.rmSync(file, { force: true });
    }
  }

  return { save, restore, sweep };
}

module.exports = { createKeeper };
