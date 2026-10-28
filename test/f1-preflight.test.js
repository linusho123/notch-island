'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./support/load-isolated');

test('NB1: refusal identifies every foreign PID by executable, parent, start time and arguments', () => {
  const processes = {
    41: { comm: '/foreign/NotchIsland.app/Contents/MacOS/NotchIsland', ppid: '17',
      lstart: 'Wed Oct 28 01:02:03 2026', args: '/foreign/NotchIsland.app/Contents/MacOS/NotchIsland --unknown' },
    42: { comm: '/another path/NotchIsland', ppid: '18',
      lstart: 'Wed Oct 28 01:02:04 2026', args: `/another path/NotchIsland ${'long-argument '.repeat(30)}`.trim() },
  };
  const { assertFixtureSession } = load('fixture-preflight.js', {
    './island-procs': {},
    'node:child_process': { execFileSync: (cmd, args) => {
      assert.equal(cmd, 'ps', 'diagnostics must be read-only');
      assert.ok(args.includes('-ww'), 'diagnostics must not truncate arguments or paths');
      const pid = args[args.indexOf('-p') + 1];
      const field = args[args.indexOf('-o') + 1].replace(/=$/, '');
      return processes[pid][field] + '\n';
    } },
  });
  assert.throws(() => assertFixtureSession({ exists: () => false, islands: () => [41, 42], isTest: () => false }), (e) => {
    assert.match(e.message, /BLOCKED: an unowned island is running/);
    for (const [pid, fields] of Object.entries(processes)) {
      const line = e.message.split('\n').find((s) => s.startsWith(`pid=${pid} `));
      assert.ok(line, `missing diagnostic for PID ${pid}: ${e.message}`);
      for (const [field, value] of Object.entries(fields)) assert.ok(line.includes(`${field}=${JSON.stringify(value)}`), line);
    }
    return true;
  });
});

for (const stale of [false, true]) test(`M01: ${stale ? 'stale keeper' : 'installed observer'} refuses without intervention`, () => {
  const calls = [];
  const keeper = load('installed-island.js', {
    'node:fs': { existsSync: () => true, readFileSync: () => '{"wasRunning":true}',
      rmSync: () => calls.push('remove'), writeFileSync: () => calls.push('write') },
    'node:child_process': { execFileSync: (cmd) => { calls.push(cmd); throw new Error('system action forbidden'); } },
    './cleanup': { onCleanup: () => {} }, './paths': { testBinary: '/fixture' },
    './island-procs': { listIslands: () => [] }, './procs': { startTimeOf: () => 'fake' },
    './fixture-preflight': { assertFixtureSession: () => { throw new Error('BLOCKED: fixture conflict'); } },
  });
  assert.deepEqual(calls, [], 'import attempted recovery');
  const driver = { installedRunning: () => !stale, testIslands: () => 0,
    quitInstalled: () => calls.push('quit'), launchInstalled: () => calls.push('launch') };
  const guard = keeper.createInstalledKeeper({ driver, file: '/stale' });
  assert.throws(() => guard.pause(), /BLOCKED/);
  assert.deepEqual(calls, [], 'refusal touched the Mac');
});

test('M01: login refuses before registry, fixture, harness or launch actions', async () => {
  const calls = [];
  const action = (name) => () => { calls.push(name); throw new Error(`unsafe ${name}`); };
  const login = load('login.js', {
    './fixture-preflight': { assertFixtureSession: () => { throw new Error('BLOCKED: installed observer'); } },
    './registry': { items: action('registry') }, './procs': { start: action('launch') },
    './harness': { builtIn: action('pointer') }, './paths': {}, './login-guardian': {},
    './signing': action('signing'),
  });
  await assert.rejects(login.prepare({ defer() {} }), /BLOCKED/);
  assert.deepEqual(calls, []);
});

test('M01: read-only preflight rejects stale state and unowned observers, permits owned fixture only', () => {
  const { assertFixtureSession } = load('fixture-preflight.js', { './island-procs': { listIslands: () => [] } });
  assert.throws(() => assertFixtureSession({ exists: () => true, islands: () => [] }), /BLOCKED/);
  assert.throws(() => assertFixtureSession({ exists: () => false, islands: () => [41] }), /BLOCKED/);
  assertFixtureSession({ exists: () => false, islands: () => [41], owned: (pid) => pid === 41 });
});

test('M01: Music refuses before its keeper can restore or write anything', () => {
  const calls = [];
  const music = load('music.js', {
    './paths': {}, './cleanup': { onCleanup() {} },
    './fixture-preflight': { assertFixtureSession: () => { throw new Error('BLOCKED: installed observer'); } },
    './procs': { ownsPid: () => false },
    './music-keeper': { createKeeper: () => ({ save: () => calls.push('save/restore'), restore: () => calls.push('restore') }) },
  });
  assert.throws(music.keepMusic, /BLOCKED/);
  assert.deepEqual(calls, []);
});

for (const persistent of [false, true]) test(`B5: exiting test binary grace, persistent=${persistent}`, () => {
  const { assertFixtureSession } = load('fixture-preflight.js', { './island-procs': {} });
  let clock = 0;
  const check = () => assertFixtureSession({ exists: () => false,
    islands: () => persistent || clock < 200 ? [41] : [], isTest: () => true,
    now: () => clock, sleep: (ms) => { clock += ms; }, graceMs: 300 });
  if (persistent) assert.throws(check, /unowned island/);
  else assert.doesNotThrow(check);
});

test('B5: a persistent foreign island or reused PID never gets the test grace', () => {
  const { assertFixtureSession } = load('fixture-preflight.js', { './island-procs': {} });
  let waits = 0;
  assert.throws(() => assertFixtureSession({ exists: () => false, islands: () => [41],
    isTest: () => false, sleep: () => waits++ }), /unowned island/);
  assert.equal(waits, 0);
});

test('B5: a retiring owned scratch fixture gets the same grace as the standard test binary', () => {
  for (const location of ['p6-login-owned', 'p6-cost-owned']) {
    let clock = 0;
    const { assertFixtureSession } = load('fixture-preflight.js', {
      './island-procs': {}, './paths': { root: '/repo', testBinary: '/repo/build/apps.noindex/test/NotchIsland.app/Contents/MacOS/NotchIsland' },
      'node:fs': { realpathSync: (p) => p },
      'node:child_process': { execFileSync: () => `/repo/build/apps.noindex/${location}/NotchIsland.app/Contents/MacOS/NotchIsland` },
    });
    assert.doesNotThrow(() => assertFixtureSession({ exists: () => false,
      islands: () => clock < 200 ? [41] : [], now: () => clock,
      sleep: (ms) => { clock += ms; }, graceMs: 300 }));
  }
});
