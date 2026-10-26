'use strict';
// Sharing the Mac (BUILD-PLAN, ruled 2026-10-23): every UI run waits for an
// idle window (3 minutes without keyboard or trackpad input, on AC power, lid
// open, display awake, screen unlocked), and runs under the input guard: real
// input the harness did not make stops the run, puts the pointer back and
// voids it (a distinct exit code), and the waiter retries a void run at the
// next idle window. None of these tests touches the screen.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const w = require('../scripts/lib/when-idle');

// ------------------------------------------------------------ the readings

test('the idle time is read from IOHIDSystem in nanoseconds, as milliseconds', () => {
  const text = '    | |   "HIDIdleTime" = 71981611416\n    | |   "HIDIdleTime" = 5\n';
  assert.equal(w.parseHidIdleMs(text), 71981.611416);
  assert.equal(w.parseHidIdleMs('no such key'), null);
});

test('AC power is read from pmset', () => {
  assert.equal(w.parseOnAC("Now drawing from 'AC Power'\n -InternalBattery-0 100%; charged"), true);
  assert.equal(w.parseOnAC("Now drawing from 'Battery Power'\n -InternalBattery-0 80%; discharging"), false);
  assert.equal(w.parseOnAC(''), false);
});

test('the lid is open when the clamshell state reads No', () => {
  assert.equal(w.parseLidOpen('  |   "AppleClamshellState" = No\n'), true);
  assert.equal(w.parseLidOpen('  |   "AppleClamshellState" = Yes\n'), false);
  // A Mac without a lid reports none: nothing to close.
  assert.equal(w.parseLidOpen(''), true);
});

// --------------------------------------------------------- the conditions

const ready = { idleMs: 200000, onAC: true, lidOpen: true, displayAsleep: false, locked: false, screenSaver: false, builtInOutput: true };

test('a Mac idle for 3 minutes, on AC, lid open, display awake and unlocked is ready', () => {
  assert.deepEqual(w.conditions(ready), { ready: true, reasons: [] });
});

for (const [what, patch, reason] of [
  ['input in the last 3 minutes', { idleMs: 179000 }, /input/],
  ['on battery', { onAC: false }, /AC power/],
  ['the lid closed', { lidOpen: false }, /lid/],
  ['the display asleep', { displayAsleep: true }, /display/],
  ['the screen locked', { locked: true }, /locked/],
  ['the screen saver running', { screenSaver: true }, /screen saver/],
  ['an unreadable idle time', { idleMs: null }, /idle time/],
]) {
  test(`a Mac with ${what} is not ready`, () => {
    const c = w.conditions({ ...ready, ...patch });
    assert.equal(c.ready, false);
    assert.match(c.reasons.join('; '), reason);
  });
}

test('the built-in speakers with all else ready is ready', () => {
  assert.deepEqual(w.conditions({ ...ready, builtInOutput: true }), { ready: true, reasons: [] });
});

test('headphones as output is not ready with that reason naming the device', () => {
  const c = w.conditions({ ...ready, builtInOutput: false, outputName: 'AirPods Pro' });
  assert.equal(c.ready, false);
  assert.deepEqual(c.reasons, ['the sound goes out through "AirPods Pro", not the built-in speakers']);
});

test('unknown sound output is not ready', () => {
  for (const builtInOutput of [undefined, null]) {
    const c = w.conditions({ ...ready, builtInOutput });
    assert.equal(c.ready, false);
    assert.deepEqual(c.reasons, ['the sound output could not be read']);
  }
});

test('the idle window is 3 minutes', () => {
  assert.equal(w.IDLE_NEEDED_MS, 180000);
  assert.equal(w.conditions({ ...ready, idleMs: 180000 }).ready, true);
});

// ------------------------------------------------------- the fake Mac clock

/** A Mac whose input and state follow a script over a fake clock. */
function fakeMac({ inputs = [], states = [] } = {}) {
  let now = 0;
  const clock = () => now;
  const sleep = async (ms) => { now += ms; };
  const read = async () => {
    const last = Math.max(-Infinity, ...inputs.filter((t) => t <= now));
    const state = [...states].reverse().find((s) => s.from <= now) || {};
    return { ...ready, idleMs: Number.isFinite(last) ? now - last : 10 * 60 * 1000, ...state.set };
  };
  return { clock, sleep, read, at: () => now };
}

test('the waiter returns at once when the Mac has been idle long enough', async () => {
  const mac = fakeMac();
  await w.waitForIdle({ read: mac.read, sleep: mac.sleep, clock: mac.clock, log: () => {} });
  assert.equal(mac.at(), 0);
});

test('the waiter waits until 3 minutes after the last input', async () => {
  const mac = fakeMac({ inputs: [0, 60000] });
  await w.waitForIdle({ read: mac.read, sleep: mac.sleep, clock: mac.clock, log: () => {} });
  assert.ok(mac.at() >= 240000, `started at ${mac.at()}`);
  assert.ok(mac.at() <= 240000 + 1000, `waited too long: ${mac.at()}`);
});

test('the waiter waits out battery power, a closed lid, a locked screen and a sleeping display', async () => {
  const mac = fakeMac({
    states: [
      { from: 0, set: { onAC: false } },
      { from: 100000, set: { lidOpen: false } },
      { from: 200000, set: { locked: true } },
      { from: 300000, set: { displayAsleep: true } },
      { from: 400000, set: {} },
    ],
  });
  await w.waitForIdle({ read: mac.read, sleep: mac.sleep, clock: mac.clock, log: () => {} });
  assert.ok(mac.at() >= 400000, `started at ${mac.at()} while a condition still failed`);
  assert.ok(mac.at() <= 400000 + 30000, `waited too long: ${mac.at()}`);
});

// ------------------------------------------------- void, fail and the retry

test('the void exit code is distinct from a failure and from success', () => {
  assert.equal(w.VOID_EXIT, 75);
  assert.notEqual(w.VOID_EXIT, 0);
  assert.notEqual(w.VOID_EXIT, 1);
});

test('a run that passes or fails hands its own exit code back', () => {
  assert.equal(w.exitCodeOf({ code: 0 }), 0);
  assert.equal(w.exitCodeOf({ code: 1 }), 1);
  assert.equal(w.exitCodeOf({ code: 3 }), 3);
  assert.equal(w.exitCodeOf({ void: true }), w.VOID_EXIT);
});

test("a command's own exit with the void code counts as a failure, never as void", () => {
  assert.equal(w.exitCodeOf({ code: w.VOID_EXIT }), 1);
});

test('a void run is retried at the next idle window, and the retry decides the exit code', async () => {
  const mac = fakeMac();
  const runs = [];
  const code = await w.runWhenIdle({
    waitForIdle: () => w.waitForIdle({ read: mac.read, sleep: mac.sleep, clock: mac.clock, log: () => {} }),
    runGuarded: async () => {
      runs.push(mac.at());
      if (runs.length === 1) {
        // The visionary comes back 50 s in: the run is voided.
        await mac.sleep(50000);
        return { void: true, reason: 'keyboard' };
      }
      return { code: 0 };
    },
    log: () => {},
  });
  assert.equal(code, 0);
  assert.equal(runs.length, 2);
});

test('a void run waits for a fresh idle window before it is retried', async () => {
  const inputs = [];
  const mac = fakeMac({ inputs });
  const runs = [];
  await w.runWhenIdle({
    waitForIdle: () => w.waitForIdle({ read: mac.read, sleep: mac.sleep, clock: mac.clock, log: () => {} }),
    runGuarded: async () => {
      runs.push(mac.at());
      if (runs.length === 1) {
        await mac.sleep(50000);
        inputs.push(mac.at()); // the input that voided it
        return { void: true, reason: 'trackpad' };
      }
      return { code: 1 };
    },
    log: () => {},
  });
  assert.equal(runs.length, 2);
  assert.ok(runs[1] - (runs[0] + 50000) >= 180000, `retried ${runs[1] - runs[0] - 50000} ms after the input`);
});

test('a failing run is not retried', async () => {
  let n = 0;
  const code = await w.runWhenIdle({
    waitForIdle: async () => {},
    runGuarded: async () => { n += 1; return { code: 1 }; },
    log: () => {},
  });
  assert.equal(code, 1);
  assert.equal(n, 1);
});

test('a guard that cannot start or see the harness stops the waiter after three tries, unguarded never', async () => {
  let n = 0;
  const code = await w.runWhenIdle({
    waitForIdle: async () => {},
    runGuarded: async () => { n += 1; return { guardError: 'the guard saw none of the harness events' }; },
    log: () => {},
  });
  assert.equal(n, 3);
  assert.equal(code, w.GUARD_FAILED_EXIT);
  assert.notEqual(code, 0);
});

test('a cap on void runs, when given, ends the waiter with the void code', async () => {
  let n = 0;
  const code = await w.runWhenIdle({
    waitForIdle: async () => {},
    runGuarded: async () => { n += 1; return { void: true, reason: 'keyboard' }; },
    maxVoids: 2,
    log: () => {},
  });
  assert.equal(n, 2);
  assert.equal(code, w.VOID_EXIT);
});

// ----------------------------------------------------------- the supervisor

/** A stand-in guard process speaking the guard's line protocol. */
function fakeGuardScript(dir, lines) {
  const file = path.join(dir, 'guard.js');
  fs.writeFileSync(file, `
    const lines = ${JSON.stringify(lines)};
    let i = 0;
    (function next() {
      if (i >= lines.length) return setInterval(() => {}, 1000);
      const [ms, line] = lines[i++];
      setTimeout(() => { process.stdout.write(JSON.stringify(line) + '\\n'); next(); }, ms);
    })();
  `);
  return file;
}

function fakeHarness() {
  const calls = [];
  return {
    calls,
    pointer: async () => { calls.push('pointer'); return { x: 321, y: 456 }; },
    nudge: async () => { calls.push('nudge'); },
    leftHeld: async () => { calls.push('leftHeld'); return true; },
    release: async () => { calls.push('release'); },
    move: async (x, y) => { calls.push(`move ${x},${y}`); },
  };
}

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'when-idle-'));

test('input that lands just as the command exits still voids the run (P3 fix S7)', async () => {
  const dir = tmp();
  const guard = fakeGuardScript(dir, [[0, { ready: true }], [20, { harness: true }], [300, { real: true, signal: 'tap', type: 5 }]]);
  const r = await w.runGuarded({
    command: [process.execPath, '-e', '0'], // exits at once: the exit wins the race
    guardCommand: [process.execPath, guard],
    harness: fakeHarness(),
    restore: () => {},
    log: () => {},
  });
  assert.equal(r.void, true, `the run was not voided: ${JSON.stringify(r)}`);
});

test('a command that exits with no input after it is not voided (P3 fix S7)', async () => {
  const dir = tmp();
  const guard = fakeGuardScript(dir, [[0, { ready: true }], [20, { harness: true }]]);
  const r = await w.runGuarded({
    command: [process.execPath, '-e', '0'],
    guardCommand: [process.execPath, guard],
    harness: fakeHarness(),
    restore: () => {},
    log: () => {},
  });
  assert.equal(r.void, false);
  assert.equal(r.code, 0);
});

test('real input stops the run within about a second, puts the pointer back and voids it', async () => {
  const dir = tmp();
  const marker = path.join(dir, 'terminated');
  const guard = fakeGuardScript(dir, [[0, { ready: true }], [20, { harness: true }], [700, { real: true, signal: 'tap', type: 5 }]]);
  const harness = fakeHarness();
  let restored = 0;
  const started = Date.now();
  const r = await w.runGuarded({
    command: [process.execPath, '-e', `
      process.on('SIGTERM', () => { require('fs').writeFileSync(${JSON.stringify(marker)}, 'x'); process.exit(143); });
      setInterval(() => {}, 1000);`],
    guardCommand: [process.execPath, guard],
    harness,
    restore: () => { restored += 1; },
    log: () => {},
  });
  const took = Date.now() - started;
  assert.equal(r.void, true);
  assert.match(r.reason, /tap/);
  assert.ok(fs.existsSync(marker), 'the command was not stopped');
  assert.ok(took < 700 + 1500, `the stop took ${took} ms`);
  // The pointer goes back where the visionary left it, a held button let go.
  assert.ok(harness.calls.includes('move 321,456'), harness.calls.join(' | '));
  assert.ok(harness.calls.indexOf('release') < harness.calls.indexOf('move 321,456'));
  assert.equal(restored, 1, 'the installed island was not put back');
  assert.equal(w.exitCodeOf(r), w.VOID_EXIT);
});

test('the whole process group of the command is stopped, not only its leader', async () => {
  const dir = tmp();
  const marker = path.join(dir, 'grandchild');
  const guard = fakeGuardScript(dir, [[0, { ready: true }], [20, { harness: true }], [600, { real: true, signal: 'idle' }]]);
  const r = await w.runGuarded({
    command: ['/bin/sh', '-c', `sh -c 'trap "echo x > ${marker}; exit 0" TERM; while :; do sleep 0.05; done' & wait`],
    guardCommand: [process.execPath, guard],
    harness: fakeHarness(),
    restore: () => {},
    log: () => {},
  });
  assert.equal(r.void, true);
  for (let i = 0; i < 40 && !fs.existsSync(marker); i++) await new Promise((res) => setTimeout(res, 50));
  assert.ok(fs.existsSync(marker), 'a grandchild of the command kept running');
});

test('a run with no real input ends with the command\'s own exit code and stops the guard', async () => {
  const dir = tmp();
  const guard = fakeGuardScript(dir, [[0, { ready: true }], [20, { harness: true }]]);
  const harness = fakeHarness();
  let spawned = 0;
  const r = await w.runGuarded({
    command: [process.execPath, '-e', 'setTimeout(() => process.exit(3), 300)'],
    guardCommand: [process.execPath, guard],
    harness,
    onSpawn: (pid) => { spawned = pid; },
    restore: () => {},
    log: () => {},
  });
  assert.deepEqual({ void: r.void, code: r.code }, { void: false, code: 3 });
  assert.ok(spawned > 0, 'the run\'s process group was not handed back for the waiter\'s own stop');
  assert.ok(!harness.calls.some((c) => c.startsWith('move')), 'the pointer was moved after a clean run');
});

test('a guard that never says it is ready means no run at all', async () => {
  const dir = tmp();
  const ran = path.join(dir, 'ran');
  const guard = fakeGuardScript(dir, []);
  const r = await w.runGuarded({
    command: [process.execPath, '-e', `require('fs').writeFileSync(${JSON.stringify(ran)}, 'x')`],
    guardCommand: [process.execPath, guard],
    harness: fakeHarness(),
    restore: () => {},
    readyMs: 300,
    log: () => {},
  });
  assert.ok(r.guardError, 'no guard error');
  assert.ok(!fs.existsSync(ran), 'the command ran unguarded');
});

test('a guard blind to the harness\'s own tagged events means no run at all', async () => {
  const dir = tmp();
  const ran = path.join(dir, 'ran');
  const guard = fakeGuardScript(dir, [[0, { ready: true }]]);
  const harness = fakeHarness();
  const r = await w.runGuarded({
    command: [process.execPath, '-e', `require('fs').writeFileSync(${JSON.stringify(ran)}, 'x')`],
    guardCommand: [process.execPath, guard],
    harness,
    restore: () => {},
    readyMs: 300,
    log: () => {},
  });
  assert.ok(harness.calls.includes('nudge'), 'the guard was never shown a harness event');
  assert.match(r.guardError || '', /harness/);
  assert.ok(!fs.existsSync(ran), 'the command ran unguarded');
});

test('a guard that dies mid-run stops the run rather than leave it unguarded', async () => {
  const dir = tmp();
  const file = path.join(dir, 'dying-guard.js');
  fs.writeFileSync(file, `
    process.stdout.write(JSON.stringify({ ready: true }) + '\\n');
    setTimeout(() => process.stdout.write(JSON.stringify({ harness: true }) + '\\n'), 20);
    setTimeout(() => process.exit(9), 400);`);
  const r = await w.runGuarded({
    command: [process.execPath, '-e', 'setInterval(() => {}, 1000)'],
    guardCommand: [process.execPath, file],
    harness: fakeHarness(),
    restore: () => {},
    log: () => {},
  });
  assert.ok(r.guardError, 'the run went on without its guard');
});

// ----------------------------------------------------------- the cross-run lock (SF10)

test('a second waiter refuses to run while a lock is held by an active process', () => {
  const dir = tmp();
  const lockFile = path.join(dir, 'when-idle.lock');
  const lock1 = w.acquireLock(lockFile, { pid: process.pid });
  assert.equal(lock1.acquired, true);

  // A second waiter attempting to acquire the same lock while the first is held
  const lock2 = w.acquireLock(lockFile, { pid: 99999999 });
  assert.equal(lock2.acquired, false);
  assert.match(lock2.reason, /active/);

  // Releasing the lock allows another waiter to acquire it
  w.releaseLock(lockFile, { pid: process.pid });
  const lock3 = w.acquireLock(lockFile, { pid: process.pid });
  assert.equal(lock3.acquired, true);
  w.releaseLock(lockFile, { pid: process.pid });
});

test('a stale lock from a dead process is cleared and acquired', () => {
  const dir = tmp();
  const lockFile = path.join(dir, 'when-idle.lock');
  // Write a PID that does not exist
  fs.writeFileSync(lockFile, '99999999\n');
  const lock = w.acquireLock(lockFile, { pid: process.pid });
  assert.equal(lock.acquired, true);
  w.releaseLock(lockFile, { pid: process.pid });
});

