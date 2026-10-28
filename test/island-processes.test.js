'use strict';
// The companion extension's native-messaging host is the island's own
// binary, started by Chrome with `chrome-extension://<id>/` as its first
// argument. Once the extension is in the visionary's Chrome, that process
// runs beside the island. It is not an island: the harness must not refuse
// to run because of it, and the installed-island keeper must never quit it
// or count it (P2 fix M5).
const test = require('node:test');
const assert = require('node:assert/strict');
const { listIslands, isHostMode } = require('./support/island-procs');
const { createInstalledKeeper } = require('./support/installed-island');

const APP = '/Applications/NotchIsland.app/Contents/MacOS/NotchIsland';
const ORIGIN = 'chrome-extension://iibgeapdjhifkjdbhpehkdpjejakjnfh/';

/** A fake pgrep and ps over a table of { pid, args }. */
function fakeExec(table) {
  return (cmd, args) => {
    if (cmd === 'pgrep') return table.map((p) => p.pid).join('\n') + '\n';
    if (cmd === 'ps') {
      const pid = Number(args[args.indexOf('-p') + 1]);
      return table.find((p) => p.pid === pid).args + '\n';
    }
    throw new Error(`unexpected ${cmd}`);
  };
}

test('a process running the binary in host mode is not an island', () => {
  assert.equal(isHostMode(`${APP} ${ORIGIN}`), true);
  assert.equal(isHostMode(`${APP} ${ORIGIN} --parent-window=0`), true);
  assert.equal(isHostMode(APP), false);
  assert.equal(isHostMode(`${APP} --test-unregister-login-and-exit`), false);
});

test('the islands listed leave out the hosts', () => {
  const exec = fakeExec([
    { pid: 100, args: APP },
    { pid: 200, args: `${APP} ${ORIGIN}` },
    { pid: 300, args: `${APP} chrome-extension://someoneelse/` },
  ]);
  assert.deepEqual(listIslands({ exec }), [100]);
});

test('with only a host running there is no island to refuse for', () => {
  assert.deepEqual(listIslands({ exec: fakeExec([{ pid: 200, args: `${APP} ${ORIGIN}` }]) }), []);
});

test('the keeper does not quit, wait for or relaunch because of a host', (t) => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'islands-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'state.json');
  const table = [{ pid: 200, args: `${APP} ${ORIGIN}` }];
  const log = [];
  const driver = {
    installedRunning: () => listIslands({ exec: fakeExec(table) }).length > 0,
    quitInstalled: () => log.push('quit'),
    launchInstalled: () => log.push('launch'),
    testIslands: () => 0,
    stopTestIslands: () => {},
  };
  const keeper = createInstalledKeeper({ driver, file });
  keeper.pause();
  keeper.resume();
  assert.deepEqual(log, [], 'the keeper touched the installed app because a host runs');
});
