'use strict';
// Legacy callers retain the entry point, but a fixture never intervenes in
// the installed app. Stale keeper state belongs to the visionary to recover.
const fs = require('node:fs');
const { assertFixtureSession } = require('./fixture-preflight');
const INSTALLED_APP = '/Applications/NotchIsland.app';
function createInstalledKeeper({ driver, file }) {
  function preflight() {
    if (fs.existsSync(file) || driver.installedRunning() || driver.testIslands() > 0) {
      throw new Error('BLOCKED: installed island or stale keeper state; no automatic recovery');
    }
  }
  return { pause: preflight, resume: preflight, sweep: preflight };
}
module.exports = { createInstalledKeeper, pauseInstalled: assertFixtureSession, INSTALLED_APP };
