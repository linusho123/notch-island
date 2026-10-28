'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./support/load-isolated');
const root = '/repo';
const dir = '/repo/build/apps.noindex/p6-cost-owned';
const home = '/tmp/ni-cost-home-owned';
const identifier = 'local.notch-island.cost.fixture';

function fixture({ failed = false, status = 'requiresApproval' } = {}) {
  const calls = [];
  const fs = {
    existsSync: () => true, realpathSync: (p) => p,
    copyFileSync: () => calls.push('copy'), writeFileSync: () => {},
    rmSync: (p) => calls.push(`delete:${p}`),
    readFileSync: () => JSON.stringify({ chromeSocket: '/tmp/ni-p6-login-owned.sock' }),
  };
  const service = {
    COST_IDENTIFIER: identifier, LOGIN_IDENTIFIER: 'local.notch-island.test.login-fixture',
    status: () => { calls.push('status'); return status; },
    assertUnregistered: () => { if (status !== 'notRegistered') throw new Error('live registration'); },
    unregister: () => {
      calls.push('unregister');
      if (failed) throw new Error('unregister failed');
      status = 'notRegistered';
    },
  };
  const cp = { execFileSync: (cmd) => cmd.includes('PlistBuddy') ? identifier : '',
    spawnSync: () => { calls.push('unregister'); return { status: failed ? 1 : 0 }; } };
  return { calls, service, stubs: {
    'node:fs': fs, 'node:child_process': cp,
    './paths': { root, testBinary: '/test-binary' }, './login-guardian': { pids: () => [] },
    './login-service': service, './signing': () => ['--sign', 'test identity'],
    './registry': { enabledApp: async () => null, items: async () => [{ bundleID: identifier, disposition: '[disabled, visible]', url: `file://${dir}/NotchIsland.app` }] },
  } };
}

test('M03: pending registration is removed before deleting the owned cost fixture', async () => {
  const f = fixture();
  await load('cost-guardian.js', f.stubs).cleanup(dir, home);
  assert.ok(f.calls.includes('unregister'), 'pending registration was skipped');
  assert.ok(f.calls.indexOf('unregister') < f.calls.indexOf(`delete:${dir}`));
});

test('M03: failed unregister preserves the fixture and reports failure', async () => {
  const f = fixture({ failed: true });
  await assert.rejects(load('cost-guardian.js', f.stubs).cleanup(dir, home), /unregister failed/);
  assert.ok(!f.calls.some((c) => c.startsWith('delete:')));
});

test('M03: historical tombstone with notRegistered status is removable', async () => {
  const f = fixture({ status: 'notRegistered' });
  await load('cost-guardian.js', f.stubs).cleanup(dir, home);
  assert.ok(f.calls.includes(`delete:${dir}`));
});

test('M03: pending registration blocks release launch even when BTM has no enabled row', async () => {
  const { EventEmitter } = require('node:events');
  const launches = [];
  const guardian = new EventEmitter();
  guardian.once = function (event, fn) {
    EventEmitter.prototype.once.call(this, event, fn);
    if (event === 'message') queueMicrotask(() => this.emit('message', { ready: true }));
    return this;
  };
  const f = fixture();
  const cost = load('cost.js', { ...f.stubs,
    'node:fs': { ...f.stubs['node:fs'], mkdtempSync: (p) => p.includes('home') ? home : dir,
      cpSync: () => {}, openSync: () => 123, closeSync: () => {}, mkdirSync: () => {} },
    'node:child_process': { ...f.stubs['node:child_process'], spawn: () => guardian, execFile: () => {} },
    './fixture-preflight': { assertFixtureSession() {} }, './installed-island': { pauseInstalled() {} },
    './cost-check': { assertRelease: () => ({ sha256: 'same' }), hash: () => 'same' },
    './paths': { root, testBinary: '/test', releaseBinary: '/release', releaseApp: '/release.app' },
    './harness': { windows: async () => [{}] },
    './island': { until: async (fn) => fn() }, './music': {}, './scenes': {},
    './procs': { sleep: async () => {}, stop: async () => {}, start: (name) => {
      launches.push(name);
      if (name === 'D79 release island') throw new Error('release was launched');
      return { pid: 1 };
    } },
  });
  await assert.rejects(cost.prepare({ defer() {} }), /live registration/);
  assert.deepEqual(launches, ['D79 test-build registration preflight']);
});

for (const state of ['notFound', 'enabled', 'requiresApproval']) test(`B1: ${state} fixture with no live URL record gates release launch`, async () => {
  const { EventEmitter } = require('node:events');
  const launches = [];
  const guardian = new EventEmitter();
  guardian.once = function (event, fn) {
    EventEmitter.prototype.once.call(this, event, fn);
    if (event === 'message') queueMicrotask(() => this.emit('message', { ready: true }));
    return this;
  };
  const f = fixture({ status: state });
  f.stubs['./login-service'] = load('login-service.js', {
    './paths': { root }, 'node:fs': { realpathSync: (p) => p },
    './registry': { items: async () => [] },
    'node:child_process': { execFileSync: () => identifier,
      spawnSync: () => ({ status: 0, stdout: JSON.stringify({ bundleID: identifier, status: state }) }) },
  });
  const cost = load('cost.js', { ...f.stubs,
    'node:fs': { ...f.stubs['node:fs'], mkdtempSync: (p) => p.includes('home') ? home : dir,
      cpSync: () => {}, openSync: () => 123, closeSync: () => {}, mkdirSync: () => {} },
    'node:child_process': { ...f.stubs['node:child_process'], spawn: () => guardian, execFile: () => {} },
    './fixture-preflight': { assertFixtureSession() {} }, './installed-island': { pauseInstalled() {} },
    './cost-check': { assertRelease: () => ({ sha256: 'same' }), hash: () => 'same' },
    './paths': { root, testBinary: '/test', releaseBinary: '/release', releaseApp: '/release.app' },
    './harness': { windows: async () => [{}] },
    './island': { until: async (fn) => fn() }, './music': {}, './scenes': {},
    './procs': { sleep: async () => {}, stop: async () => {}, start: (name) => {
      launches.push(name);
      if (name === 'D79 release island') throw new Error('release was launched');
      return { pid: 1 };
    } },
  });
  await assert.rejects(cost.prepare({ defer() {} }), state === 'notFound' ? /release was launched/ : /live registration/);
  assert.deepEqual(launches, ['D79 test-build registration preflight', ...(state === 'notFound' ? ['D79 release island'] : [])]);
});

for (const guardian of ['cost', 'login']) for (const event of ['message', 'disconnect']) {
  test(`M03: ${guardian} ${event} propagates unregister failure and retains owned artifacts`, async () => {
    const { EventEmitter } = require('node:events');
    const f = fixture({ failed: true });
    const fake = new EventEmitter();
    let exit;
    Object.assign(fake, { argv: ['node', 'guardian', guardian === 'cost' ? dir : '/repo/build/apps.noindex/p6-login-owned', home],
      env: {}, connected: true, send() {}, exit: (code) => { exit = code; } });
    load(`${guardian}-guardian.js`, f.stubs, { runAsMain: true, process: fake, console: { error() {} } });
    fake.emit(event, 'cleanup');
    await new Promise((r) => setImmediate(r));
    assert.equal(exit, 1);
    assert.ok(f.calls.includes('unregister'));
    assert.ok(!f.calls.some((c) => c.startsWith('delete:')));
  });
}

for (const guardian of ['cost', 'login']) test(`M03: ${guardian} setup failure before any launch deletes only owned scratch`, async () => {
  const f = fixture();
  f.stubs['node:fs'].existsSync = () => false;
  await load(`${guardian}-guardian.js`, f.stubs).cleanup(guardian === 'cost' ? dir : '/repo/build/apps.noindex/p6-login-owned', home);
  assert.ok(!f.calls.includes('unregister'));
});

for (const state of ['requiresApproval', 'enabled', 'notFound', 'notRegistered']) {
  test(`M03: native service status ${state} overrides disabled BTM history`, async () => {
    const calls = [];
    const service = load('login-service.js', {
      './paths': { root }, 'node:fs': { realpathSync: (p) => p },
      './registry': { items: async () => [] },
      'node:child_process': {
        execFileSync: () => identifier,
        spawnSync: (binary, args) => { calls.push([binary, ...args]); return {
          status: 0, stdout: JSON.stringify({ status: state, bundleID: identifier }),
        }; },
      },
    });
    if (state === 'notRegistered' || state === 'notFound') await service.assertUnregistered(`${dir}/NotchIsland.app`, identifier);
    else await assert.rejects(async () => service.assertUnregistered(`${dir}/NotchIsland.app`, identifier), /live registration/);
    assert.equal(calls[0][0], `${dir}/NotchIsland.app/Contents/MacOS/NotchIsland`);
    assert.equal(calls[0][1], '--test-login-status-and-exit');
  });
}

test('M03: native unregister error cannot be hidden by an apparently absent status', async () => {
  const service = load('login-service.js', {
    './paths': { root }, 'node:fs': { realpathSync: (p) => p },
      './registry': { items: async () => [] },
    'node:child_process': { execFileSync: () => identifier,
      spawnSync: () => ({ status: 1, stderr: 'denied', stdout: JSON.stringify({ status: 'notRegistered', bundleID: identifier }) }) },
  });
  await assert.rejects(async () => service.unregister(`${dir}/NotchIsland.app`, identifier), /denied/);
});

for (const [record, allowed] of [
  [null, true],
  [{ url: `file://${dir}/NotchIsland.app/`, disposition: '[enabled, allowed, visible]' }, false],
  [{ url: `file://${dir}/NotchIsland.app/`, disposition: '[requiresApproval, visible]' }, false],
  [{ url: `file://${dir}/NotchIsland.app/`, disposition: '[disabled, visible]' }, true],
  [{ url: 'file:///other/NotchIsland.app/', disposition: '[enabled, visible]' }, true],
]) test(`B1: notFound cross-check ${JSON.stringify(record)}`, async () => {
  const service = load('login-service.js', {
    './paths': { root }, 'node:fs': { realpathSync: (p) => p },
    './registry': { items: async () => record ? [record] : [] },
    'node:child_process': { execFileSync: () => identifier,
      spawnSync: () => ({ status: 0, stdout: JSON.stringify({ status: 'notFound', bundleID: identifier }) }) },
  });
  const check = async () => service.assertUnregistered(`${dir}/NotchIsland.app`, identifier);
  if (allowed) await assert.doesNotReject(check());
  else await assert.rejects(check(), /live registration/);
});
