#!/usr/bin/env node
'use strict';
// The idle waiter and input guard on the real Mac (scripts/when-idle.sh is
// its entry point; the logic and its tests are in scripts/lib/when-idle.js).
//
//   scripts/when-idle.sh caffeinate -i npm test
//
// Exits with the command's own exit code; 70 if the input guard could not
// guard the run; 75 (void) only when WHEN_IDLE_MAX_VOIDS is set and that many
// runs in a row were stopped by the visionary's input.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const w = require('./lib/when-idle');

const run = promisify(execFile);
const root = path.join(__dirname, '..');
const built = path.join(root, 'build', 'island-harness');
const logFile = path.join(root, 'build', 'when-idle.log');

const command = process.argv.slice(2);
if (!command.length) {
  console.error('usage: scripts/when-idle.sh <command...>');
  process.exit(2);
}

const lockPath = process.env.WHEN_IDLE_LOCK_FILE || w.DEFAULT_LOCK_FILE;
const lock = w.acquireLock(lockPath);
if (!lock.acquired) {
  console.error(`when-idle: refused: ${lock.reason}`);
  process.exit(1);
}
process.on('exit', () => w.releaseLock(lockPath));

// The harness stamps each event it posts into this file just before posting
// it; the guard counts the harness's quiet from it as well as from what its
// tap saw (an event can tickle the idle clock and reach the tap late or not
// at all). Both inherit the name.
const postStamp = path.join(os.tmpdir(), `notch-island-posted-${process.pid}`);
process.env.NOTCH_ISLAND_POST_STAMP = postStamp;
process.on('exit', () => { try { fs.rmSync(postStamp, { force: true }); } catch { /* gone */ } });

function log(message) {
  console.error(message);
  try { fs.appendFileSync(logFile, `${new Date().toISOString()} ${message}\n`); } catch { /* no log */ }
}

/** The helper, built if missing or older than its sources. */
function ensureHarness() {
  const sources = ['island-harness', 'HarnessCore'].flatMap((d) => {
    const dir = path.join(root, 'Sources', d);
    return fs.readdirSync(dir).map((f) => path.join(dir, f));
  });
  const newest = Math.max(...sources.map((f) => fs.statSync(f).mtimeMs), fs.statSync(path.join(root, 'Package.swift')).mtimeMs);
  if (!fs.existsSync(built) || fs.statSync(built).mtimeMs < newest) {
    execFileSync('sh', [path.join(root, 'scripts', 'build-harness.sh')], { stdio: ['ignore', process.stderr, 'inherit'] });
  }
  // The guard runs from a private copy: the command under it (npm test)
  // rebuilds build/island-harness, which must not pull the file out from
  // under a running guard.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'notch-island-when-idle-'));
  const copy = path.join(dir, 'island-harness');
  fs.copyFileSync(built, copy);
  fs.chmodSync(copy, 0o755);
  process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));
  return copy;
}

const helper = ensureHarness();
const h = async (...args) => JSON.parse((await run(helper, args.map(String), { encoding: 'utf8' })).stdout);

const harness = {
  pointer: () => h('pointer'),
  nudge: () => h('nudge'),
  leftHeld: async () => (await h('button')).left,
  release: () => h('release'),
  move: (x, y) => h('move', x, y),
};

const text = async (file, args) => {
  try { return (await run(file, args, { encoding: 'utf8', maxBuffer: 64 << 20 })).stdout; } catch { return ''; }
};

async function read() {
  const [hid, batt, lid] = await Promise.all([
    text('/usr/sbin/ioreg', ['-c', 'IOHIDSystem', '-d', '4']),
    text('/usr/bin/pmset', ['-g', 'batt']),
    text('/usr/sbin/ioreg', ['-r', '-k', 'AppleClamshellState', '-d', '4']),
  ]);
  let session = { displayAsleep: true, locked: true, screenSaver: false };
  try { session = await h('session'); } catch { /* read as not ready */ }
  let output = null;
  try { output = await h('output-device'); } catch { /* leave unknown */ }
  return {
    idleMs: w.parseHidIdleMs(hid),
    onAC: w.parseOnAC(batt),
    lidOpen: w.parseLidOpen(lid),
    displayAsleep: session.displayAsleep,
    locked: session.locked || session.onConsole === false,
    screenSaver: session.screenSaver,
    builtInOutput: output?.builtIn,
    outputName: output?.name,
  };
}

/** After a stopped run: the installed island back as it was (its sweep). */
function restore() {
  const keeper = path.join(root, 'test', 'support', 'installed-island.js');
  execFileSync(process.execPath, ['-e', `require(${JSON.stringify(keeper)})`], { stdio: 'inherit', timeout: 60000 });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The command runs in its own process group: if the waiter itself is told to
// stop, the run stops with it (its own clean-ups put the Mac back).
let current = null;
for (const [signal, n] of [['SIGINT', 2], ['SIGTERM', 15], ['SIGHUP', 1]]) {
  process.on(signal, () => {
    if (current) { try { process.kill(-current, 'SIGTERM'); } catch { /* gone */ } }
    log(`when-idle: ${signal}: stopped`);
    setTimeout(() => process.exit(128 + n), current ? 3000 : 0);
  });
}

let runs = 0;
let voids = 0;
w.runWhenIdle({
  waitForIdle: () => w.waitForIdle({ read, sleep, log }),
  runGuarded: async () => {
    runs += 1;
    log(`when-idle: run ${runs} starts: ${command.join(' ')}`);
    const r = await w.runGuarded({
      command,
      guardCommand: [helper, 'input-guard'],
      harness,
      restore,
      log,
      onSpawn: (pid) => { current = pid; },
    });
    current = null;
    if (r.void) voids += 1;
    log(`when-idle: run ${runs} ${r.void ? `void (${r.reason})` : r.guardError ? `not guarded: ${r.guardError}` : `exited ${r.code}`}`);
    return r;
  },
  log,
  maxVoids: process.env.WHEN_IDLE_MAX_VOIDS ? Number(process.env.WHEN_IDLE_MAX_VOIDS) : Infinity,
}).then((code) => {
  log(`when-idle: done, exit ${code}, ${voids} void run(s) of ${runs}`);
  process.exit(code);
}, (e) => {
  log(`when-idle: ${e.stack || e.message}`);
  process.exit(1);
});
