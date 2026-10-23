'use strict';
// Sharing the Mac (BUILD-PLAN, ruled by the visionary 2026-10-23). The
// visionary keeps using this Mac while a phase runs, so every UI run:
//
//  - waits for an idle window: 3 minutes with no keyboard or trackpad input
//    (IOHIDSystem's HIDIdleTime), on AC power, lid open, the display awake,
//    no screen saver and the screen unlocked (`waitForIdle`);
//  - runs under the input guard (`runGuarded`): the helper's `input-guard`
//    watches every input event through a listen-only event tap, and any the
//    harness did not post itself (the harness tags its own) stops the run's
//    whole process group at once, lets go of a held button, puts the pointer
//    back where the visionary left it and marks the run void;
//  - is retried at the next idle window when void (`runWhenIdle`). A void
//    run never counts as red or green.
//
// Everything that reads or drives the Mac is passed in, so the logic is
// tested with a fake clock and stand-in processes (test/when-idle.test.js).
const { spawn } = require('node:child_process');

const IDLE_NEEDED_MS = 3 * 60 * 1000;
/** A run stopped by the visionary's input: neither red nor green. */
const VOID_EXIT = 75; // EX_TEMPFAIL: try again later
/** The guard could not start, or could not see the harness's own events. */
const GUARD_FAILED_EXIT = 70; // EX_SOFTWARE
const GUARD_TRIES = 3;

// --------------------------------------------------------------- readings

/** `ioreg -c IOHIDSystem -d 4`: HIDIdleTime (ns) as milliseconds. */
function parseHidIdleMs(text) {
  const m = /"HIDIdleTime"\s*=\s*(\d+)/.exec(text || '');
  return m ? Number(m[1]) / 1e6 : null;
}

/** `pmset -g batt`: whether the Mac draws from AC power. */
function parseOnAC(text) {
  return /Now drawing from 'AC Power'/.test(text || '');
}

/** `ioreg -r -k AppleClamshellState -d 4`: the lid is open (no lid: open). */
function parseLidOpen(text) {
  const m = /"AppleClamshellState"\s*=\s*(Yes|No)/.exec(text || '');
  return m ? m[1] === 'No' : true;
}

/** Whether the Mac is ready for a UI run, and if not, why not. */
function conditions(r, idleNeededMs = IDLE_NEEDED_MS) {
  const reasons = [];
  if (r.idleMs == null) reasons.push('the idle time could not be read');
  else if (r.idleMs < idleNeededMs) reasons.push(`input ${Math.round(r.idleMs / 1000)} s ago (needs ${idleNeededMs / 1000} s)`);
  if (!r.onAC) reasons.push('not on AC power');
  if (!r.lidOpen) reasons.push('the lid is closed');
  if (r.displayAsleep) reasons.push('the display is asleep');
  if (r.screenSaver) reasons.push('the screen saver is running');
  if (r.locked) reasons.push('the screen is locked');
  return { ready: reasons.length === 0, reasons };
}

// ----------------------------------------------------------------- waiting

/** Wait until the Mac has been idle long enough and every condition holds. */
async function waitForIdle({ read, sleep, clock = Date.now, log = console.error, idleNeededMs = IDLE_NEEDED_MS }) {
  let said = null;
  const since = clock();
  for (;;) {
    const r = await read();
    const c = conditions(r, idleNeededMs);
    if (c.ready) {
      if (said !== null) log(`when-idle: idle window after ${Math.round((clock() - since) / 1000)} s`);
      return r;
    }
    // Only the idle time counts on its own; anything else is checked again
    // every 15 s. Waiting for the idle time sleeps just as long as it needs.
    const onlyIdle = c.reasons.length === 1 && r.idleMs != null && r.idleMs < idleNeededMs;
    const kinds = c.reasons.map((s) => s.replace(/\d+ s ago/, 'recently')).join('; ');
    if (kinds !== said) { log(`when-idle: waiting: ${c.reasons.join('; ')}`); said = kinds; }
    const ms = onlyIdle ? Math.min(Math.max(idleNeededMs - r.idleMs, 250), 30000) : 15000;
    await sleep(ms);
  }
}

/** The exit code a run hands back: its own, the void code, never confused. */
function exitCodeOf(result) {
  if (result.void) return VOID_EXIT;
  if (result.guardError) return GUARD_FAILED_EXIT;
  // A command that itself exits with the void code is a failure, not a void.
  if (result.code === VOID_EXIT || result.code === GUARD_FAILED_EXIT) return 1;
  return result.code;
}

/** Wait, run under the guard, and run again at the next window while void. */
async function runWhenIdle({ waitForIdle: wait, runGuarded: run, log = console.error, maxVoids = Infinity }) {
  let voids = 0;
  let guardErrors = 0;
  for (;;) {
    await wait();
    const r = await run();
    if (r.void) {
      voids += 1;
      log(`when-idle: run ${voids} void (${r.reason}); retrying at the next idle window`);
      if (voids >= maxVoids) return VOID_EXIT;
      continue;
    }
    if (r.guardError) {
      guardErrors += 1;
      log(`when-idle: the input guard failed: ${r.guardError}`);
      if (guardErrors >= GUARD_TRIES) return GUARD_FAILED_EXIT;
      continue;
    }
    if (voids) log(`when-idle: ${voids} void run(s) before this one`);
    return exitCodeOf(r);
  }
}

// -------------------------------------------------------------- the guard

const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

/** Start the guard process and follow its line protocol. */
function startGuard(argv) {
  const child = spawn(argv[0], argv.slice(1), { stdio: ['ignore', 'pipe', 'inherit'] });
  const state = { ready: false, sawHarness: false, real: null, exited: false, child };
  const waiters = new Set();
  const notify = () => { for (const f of waiters) f(); };
  let buf = '';
  child.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.ready) state.ready = true;
      if (msg.harness) state.sawHarness = true;
      if (msg.real && !state.real) state.real = msg;
      notify();
    }
  });
  child.on('exit', (code, signal) => { state.exited = { code, signal }; notify(); });
  child.on('error', (e) => { state.exited = { error: e.message }; notify(); });
  const until = (pred, ms) => new Promise((resolve) => {
    if (pred()) return resolve(true);
    const timer = ms == null ? null : setTimeout(() => { waiters.delete(check); resolve(pred()); }, ms);
    const check = () => { if (pred()) { if (timer) clearTimeout(timer); waiters.delete(check); resolve(true); } };
    waiters.add(check);
  });
  const stop = () => { if (!state.exited) { try { child.kill('SIGTERM'); } catch { /* gone */ } } };
  return { state, until, stop };
}

function signalGroup(pid, signal) {
  try { process.kill(-pid, signal); return true; } catch { return false; }
}

/**
 * Run a command under the input guard. Returns { void, reason } when the
 * visionary's input stopped it, { guardError } when the guard was not up to
 * guarding it (the command then never runs, or is stopped), or { code }.
 */
async function runGuarded({ command, guardCommand, harness, restore, log = console.error, readyMs = 5000, stopGraceMs = 10000, onSpawn = () => {} }) {
  const left = await harness.pointer(); // where the visionary left it
  const guard = startGuard(guardCommand);
  try {
    if (!await guard.until(() => guard.state.ready || guard.state.exited, readyMs) || !guard.state.ready) {
      return { guardError: `the input guard did not start (${JSON.stringify(guard.state.exited || 'no ready line')})` };
    }
    // The guard must see the harness's own tagged events, or it would take
    // them for the visionary's (or see nothing): show it one, a move to where
    // the pointer already is.
    await harness.nudge();
    if (!await guard.until(() => guard.state.sawHarness || guard.state.exited, readyMs) || !guard.state.sawHarness) {
      return { guardError: 'the input guard saw none of the harness events (is the event tap allowed?)' };
    }
    if (guard.state.real) return { void: true, reason: describe(guard.state.real) };

    const child = spawn(command[0], command.slice(1), { stdio: 'inherit', detached: true });
    onSpawn(child.pid);
    let exit = null;
    const exited = new Promise((resolve) => {
      child.on('exit', (code, signal) => { exit = { code: code ?? (signal ? 128 : 1), signal }; resolve(); });
      child.on('error', (e) => { exit = { code: 127, error: e.message }; resolve(); });
    });
    const outcome = await Promise.race([
      exited.then(() => 'done'),
      guard.until(() => guard.state.real || guard.state.exited).then(() => (guard.state.real ? 'real' : 'guard-died')),
    ]);
    if (outcome === 'done') return { void: false, code: exit.code };

    // Stop at once: the whole process group, so no harness helper posts
    // another event; then give the pointer back.
    signalGroup(child.pid, 'SIGTERM');
    try { if (await harness.leftHeld()) await harness.release(); } catch (e) { log(`when-idle: could not let go of the button: ${e.message}`); }
    try { await harness.move(left.x, left.y); } catch (e) { log(`when-idle: could not put the pointer back: ${e.message}`); }
    const end = Date.now() + stopGraceMs;
    while (!exit && Date.now() < end) await sleepMs(50);
    if (!exit) { signalGroup(child.pid, 'SIGKILL'); await exited; }
    // A grandchild may outlive its leader: the rest of the group goes too.
    signalGroup(child.pid, 'SIGKILL');
    try { await restore(); } catch (e) { log(`when-idle: restore after the stop failed: ${e.message}`); }
    if (outcome === 'real') {
      const reason = describe(guard.state.real);
      log(`when-idle: input from the visionary (${reason}): run stopped and void`);
      return { void: true, reason };
    }
    return { guardError: `the input guard ended mid-run (${JSON.stringify(guard.state.exited)}); the run was stopped` };
  } finally {
    guard.stop();
  }
}

function describe(real) {
  if (real.signal === 'idle') return `idle clock: input ${Math.round(real.hidIdleMs ?? 0)} ms ago, none of it the harness's`;
  return `${real.signal || 'tap'}: ${real.kind || `event type ${real.type}`}`;
}

module.exports = {
  IDLE_NEEDED_MS,
  VOID_EXIT,
  GUARD_FAILED_EXIT,
  parseHidIdleMs,
  parseOnAC,
  parseLidOpen,
  conditions,
  waitForIdle,
  exitCodeOf,
  runWhenIdle,
  runGuarded,
};
