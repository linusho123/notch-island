'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./support/load-isolated');

for (const stale of [false, true]) test(`M01: ${stale ? 'stale keeper' : 'installed observer'} refuses without intervention`, () => {
  const calls = [];
  const keeper = load('installed-island.js', {
    'node:fs': { existsSync: () => true, readFileSync: () => '{"wasRunning":true}',
      rmSync: () => calls.push('remove'), writeFileSync: () => calls.push('write') },
    'node:child_process': { execFileSync: (cmd) => { calls.push(cmd); throw new Error('system action forbidden'); } },
    './cleanup': { onCleanup: () => {} }, './paths': { testBinary: '/fixture' },
    './island-procs': { listIslands: () => [] },
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
  });
  await assert.rejects(login.prepare({ defer() {} }), /BLOCKED/);
  assert.deepEqual(calls, []);
});
