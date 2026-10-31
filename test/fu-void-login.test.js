'use strict';
// A live waiter interruption at the D60 LaunchServices/adoption boundary.
// The outer when-idle run owns the screen; the inner guard is a deterministic
// stand-in for the input notification, never an untagged physical event.
require('./support/require-idle').assertInIdleRun();
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { listIslands } = require('./support/island-procs');
const keeperFile = path.join(os.tmpdir(), 'notch-island-installed-island.json');
const installed = () => listIslands().filter((pid) => {
  try { return execFileSync('ps', ['-o', 'comm=', '-p', String(pid)], { encoding: 'utf8' }).trim()
    === '/Applications/NotchIsland.app/Contents/MacOS/NotchIsland'; } catch { return false; }
});

if (process.argv.includes('--owner')) {
  (async () => {
    const login = require('./support/login');
    const procs = require('./support/procs');
    const { pids } = require('./support/login-guardian');
    const w = { defer() {} };
    await login.prepare(w);
    await procs.stop(w.island);
    const item = await require('./support/registry').enabledApp(w.login.identifier);
    assert.equal(require('./support/registry').itemPath(item.url), w.login.app);
    execFileSync('/usr/bin/open', ['-g', '-n', '--env', `NOTCH_ISLAND_TEST_INPUT=${w.login.input}`, w.login.app]);
    const end = Date.now() + 15000;
    while (!pids(w.login.binary).length && Date.now() < end) await procs.sleep(100);
    assert.equal(pids(w.login.binary).length, 1);
    // Deliberately stop before procs.adopt: this is the B4 race.
    fs.writeFileSync(process.argv.at(-1), JSON.stringify(w.login));
    setInterval(() => {}, 1000);
  })().catch((e) => { console.error(e); process.exitCode = 1; });
} else {
  require('node:test')('B4: waiter void during D60 restores installed app and clears its journal', async (t) => {
    assert.ok(installed().length, 'live restoration probe requires the installed app initially running');
    assert.equal(fs.existsSync(keeperFile), false, 'probe must own its pause lease');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fu-void-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const marker = path.join(dir, 'launch.json');
    const guard = path.join(dir, 'guard.js');
    fs.writeFileSync(guard, `process.stdout.write('{"ready":true}\\n{"harness":true}\\n'); setInterval(() => {}, 1000);`);
    const { runGuarded } = require('../scripts/lib/when-idle');
    const result = await runGuarded({
      command: [process.execPath, __filename, '--owner', marker],
      guardCommand: [process.execPath, guard],
      harness: { pointer: async () => ({ x: 0, y: 0 }), nudge: async () => {},
        leftHeld: async () => false, move: async () => {},
        outputDevice: async () => ({ builtIn: !fs.existsSync(marker), name: 'simulated input interruption' }) },
      restore: async () => {}, stopGraceMs: 30000,
    });
    assert.equal(result.void, true, JSON.stringify(result));
    assert.ok(installed().length, 'installed island stayed quit after the void');
    assert.equal(fs.existsSync(keeperFile), false, 'void left a stale pause journal');
    const fixture = JSON.parse(fs.readFileSync(marker, 'utf8'));
    const end = Date.now() + 30000;
    while (fs.existsSync(fixture.dir) && Date.now() < end) await new Promise((r) => setTimeout(r, 100));
    assert.equal(fs.existsSync(fixture.dir), false, 'fixture guardian did not finish unregistering');
    assert.equal(await require('./support/registry').enabledApp(fixture.identifier), null);
  });
}
