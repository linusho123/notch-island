'use strict';
// The login-item registry is read through `sudo -n /usr/bin/sfltool dumpbtm`:
// sudo never prompts (-n), so a missing sudoers rule fails fast with a clear
// message instead of an administrator-password dialog and a 30 s "hang".
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const registry = require('./support/registry');

const uid = os.userInfo().uid;
const DUMP = `Records for UID -2 : X\n  #1:\n   Name: other\n   Type: app (0x2)\n   Bundle Identifier: other.app\n   Disposition: [enabled, allowed, visible, notified] (0xb)\n   URL: file:///x\nRecords for UID ${uid} : Y\n  #1:\n   Name: Mine\n   Type: app (0x2)\n   Bundle Identifier: mine.app\n   Disposition: [enabled, allowed, visible, notified] (0xb)\n   URL: file:///m\n`;

test('registry: the dump runs as `sudo -n /usr/bin/sfltool dumpbtm` and reads this user\'s uid section', async () => {
  const calls = [];
  const runner = async (cmd, args) => { calls.push([cmd, ...args]); return { stdout: DUMP }; };
  const found = await registry.enabledApp('mine.app', { runner });
  assert.deepEqual(calls, [['sudo', '-n', '/usr/bin/sfltool', 'dumpbtm']]);
  assert.equal(found && found.name, 'Mine');
  assert.equal(await registry.enabledApp('other.app', { runner }), null);
});

test('registry: a missing sudoers rule gives the clear error, and no prompt is possible', async () => {
  const runner = async () => {
    const e = new Error('Command failed: sudo -n');
    e.code = 1;
    e.stderr = 'sudo: a password is required\n';
    throw e;
  };
  await assert.rejects(registry.items({ runner }), (e) => {
    assert.match(e.message, /sfltool needs the sudoers rule \/etc\/sudoers\.d\/sfltool-dumpbtm \(see docs or the phase report\)/);
    return true;
  });
});

test('registry: a hung dump is retried once at most', async () => {
  let n = 0;
  const runner = async () => { n++; const e = new Error('timed out'); e.killed = true; throw e; };
  await assert.rejects(registry.items({ runner }), /hung/);
  assert.ok(n <= 2, `asked ${n} times`);
});
