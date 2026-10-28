'use strict';
// Explicit P5 pause/restore, authorized by Q1. Importing never recovers a
// previous run. A stale journal requires review before any fixture action.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { onCleanup } = require('./cleanup');
const { testBinary } = require('./paths');
const { listIslands } = require('./island-procs');

const INSTALLED_APP = '/Applications/NotchIsland.app';
const INSTALLED_BINARY = path.join(INSTALLED_APP, 'Contents', 'MacOS', 'NotchIsland');

function createInstalledKeeper({ driver, file, lease = {} }) {
  let saved = null;

  function persist() { fs.writeFileSync(file, JSON.stringify(saved)); }

  /** Quit the installed island (once), remembering whether it ran. */
  function pause() {
    if (!saved && fs.existsSync(file)) {
      throw new Error('BLOCKED: stale installed-island keeper state; no automatic recovery');
    }
    if (!saved) {
      saved = { wasRunning: driver.installedRunning(), ...lease };
      persist();
    }
    if (driver.installedRunning()) driver.quitInstalled();
  }

  /**
   * Put the installed island back as it was. Any test island still running
   * is stopped first; if one will not stop, the installed island stays off
   * and the state is kept for review, so two islands never share the
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

  /** Detect a journal left by a run that never got to clean up. */
  function sweep() {
    if (!saved && fs.existsSync(file)) throw new Error('BLOCKED: stale installed-island keeper state');
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
  testIslands: () => islandPids().filter((pid) => binaryOf(pid) !== INSTALLED_BINARY).length,
  stopTestIslands: () => { try { stopByBinary(() => testPids().filter(require('./procs').ownsPid), testBinary, 'an owned test island'); } catch { /* resume checks */ } },
};

const keeper = createInstalledKeeper({
  driver: realDriver,
  file: path.join(os.tmpdir(), 'notch-island-installed-island.json'),
  lease: { pid: process.pid, started: require('./procs').startTimeOf(process.pid), stamp: process.env.NOTCH_ISLAND_POST_STAMP },
});

let armed = false;
/** Before the harness starts an island: quit the installed one, and arm its return. */
function pauseInstalled() {
  require('./require-idle').assertInIdleRun();
  const preflight = require('./fixture-preflight');
  preflight.assertFixtureSession({ allowInstalled: true, owned: require('./procs').ownsPid });
  if (preflight.activePause()) return;
  if (!fs.existsSync(INSTALLED_BINARY)) return;
  if (!armed) {
    armed = true;
    onCleanup(() => { try { keeper.resume(); } catch (e) { console.error(`installed island restore failed: ${e.message}`); } });
  }
  keeper.pause();
}

module.exports = { createInstalledKeeper, pauseInstalled, INSTALLED_APP };
