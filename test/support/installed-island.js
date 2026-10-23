'use strict';
// The visionary's installed island (/Applications/NotchIsland.app, bundle id
// local.notch-island), started at login. The harness's island refuses to run
// beside another, so before the harness starts its own it quits the installed
// one, and when the run ends it relaunches it, so there is never more than
// one island on the notch. Whether it was running is written to a file first,
// so a run killed outright is put right by the next run's sweep (at the
// require of this module), like the Music keeper. The keeper only quits and
// launches the app: the installed island's login item is never touched.
// Everything is synchronous so it can run from the exit and signal clean-ups.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { onCleanup } = require('./cleanup');
const { testBinary } = require('./paths');
const { listIslands } = require('./island-procs');

const INSTALLED_APP = '/Applications/NotchIsland.app';
const INSTALLED_BINARY = path.join(INSTALLED_APP, 'Contents', 'MacOS', 'NotchIsland');

function createInstalledKeeper({ driver, file }) {
  let saved = null;

  function persist() { fs.writeFileSync(file, JSON.stringify(saved)); }

  /** Quit the installed island (once), remembering whether it ran. */
  function pause() {
    if (!saved && fs.existsSync(file)) {
      // A run that never cleaned up: the installed island's state before it
      // is the one to put back at the end of this run.
      try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { saved = null; }
    }
    if (!saved) {
      saved = { wasRunning: driver.installedRunning() };
      persist();
    }
    if (driver.installedRunning()) driver.quitInstalled();
  }

  /**
   * Put the installed island back as it was. Any test island still running
   * is stopped first; if one will not stop, the installed island stays off
   * and the state is kept for the next sweep, so two islands never share the
   * notch.
   */
  function resume() {
    if (!saved) return;
    if (driver.testIslands() > 0) driver.stopTestIslands();
    if (driver.testIslands() > 0) {
      throw new Error('a test island is still running, so the installed island was not relaunched');
    }
    if (saved.wasRunning && !driver.installedRunning()) driver.launchInstalled();
    saved = null;
    fs.rmSync(file, { force: true });
  }

  /** Restore from a file left by a run that never got to clean up. */
  function sweep() {
    if (saved || !fs.existsSync(file)) return;
    try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { saved = null; }
    if (saved) resume();
    else fs.rmSync(file, { force: true });
  }

  return { pause, resume, sweep };
}

// ------------------------------------------------------------- the real Mac

const islandPids = () => listIslands();

function binaryOf(pid) {
  try { return execFileSync('ps', ['-o', 'comm=', '-p', String(pid)], { encoding: 'utf8' }).trim(); } catch { return null; }
}

const installedPids = () => islandPids().filter((p) => binaryOf(p) === INSTALLED_BINARY);
const testPids = () => islandPids().filter((p) => binaryOf(p) === testBinary);

function sleepSync(ms) { execFileSync('sleep', [String(ms / 1000)]); }

/** Signal the processes running `binary` (checked again before each signal), until gone. */
function stopByBinary(pids, binary, what) {
  for (const signal of ['SIGTERM', 'SIGKILL']) {
    for (const pid of pids()) {
      if (binaryOf(pid) === binary) { try { process.kill(pid, signal); } catch { /* gone */ } }
    }
    const end = Date.now() + 5000;
    while (pids().length && Date.now() < end) sleepSync(100);
    if (!pids().length) return;
  }
  throw new Error(`${what} did not quit`);
}

const realDriver = {
  installedRunning: () => installedPids().length > 0,
  quitInstalled: () => stopByBinary(installedPids, INSTALLED_BINARY, 'the installed island'),
  launchInstalled: () => {
    execFileSync('open', ['-g', INSTALLED_APP], { timeout: 20000 });
    const end = Date.now() + 15000;
    while (!installedPids().length) {
      if (Date.now() > end) throw new Error('the installed island did not start again');
      sleepSync(200);
    }
  },
  testIslands: () => testPids().length,
  stopTestIslands: () => { try { stopByBinary(testPids, testBinary, 'a test island'); } catch { /* resume checks */ } },
};

const keeper = createInstalledKeeper({
  driver: realDriver,
  file: path.join(os.tmpdir(), 'notch-island-installed-island.json'),
});

let armed = false;
/** Before the harness starts an island: quit the installed one, and arm its return. */
function pauseInstalled() {
  if (!fs.existsSync(INSTALLED_BINARY)) return;
  if (!armed) {
    armed = true;
    onCleanup(() => { try { keeper.resume(); } catch { /* the next sweep */ } });
  }
  keeper.pause();
}

// The start-of-run sweep: a run killed outright left the installed island off.
try { keeper.sweep(); } catch { /* left for the next sweep */ }

module.exports = { createInstalledKeeper, pauseInstalled, INSTALLED_APP };
