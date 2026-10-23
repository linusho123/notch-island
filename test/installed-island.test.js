'use strict';
// The release island is installed (/Applications/NotchIsland.app, bundle id
// local.notch-island) and runs from login. The harness's own island refuses
// to start beside another, so the harness quits the installed one before it
// starts its own, relaunches it when the run ends, and puts it back after an
// interrupted run (signal clean-ups, and a sweep at the start of the next
// run). It never leaves two islands on the notch and never touches the
// installed island's login item. A fake driver stands in for the system,
// then one check runs against the real installed island.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { createInstalledKeeper } = require('./support/installed-island');

function fakeSystem({ running = true, testIslands = 0 } = {}) {
  const sys = { running, testIslands, log: [], loginItem: 'enabled' };
  const driver = {
    installedRunning: () => sys.running,
    quitInstalled: () => {
      sys.log.push('quit');
      if (sys.testIslands > 0) throw new Error('quit asked while a test island runs');
      sys.running = false;
    },
    launchInstalled: () => {
      sys.log.push('launch');
      if (sys.testIslands > 0) sys.twoIslands = true;
      sys.running = true;
    },
    testIslands: () => sys.testIslands,
    stopTestIslands: () => { sys.log.push('stop-test-islands'); sys.testIslands = 0; },
  };
  return { sys, driver };
}

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'installed-island-')), 'state.json');

test('the installed island is quit before the run and relaunched after it', () => {
  const { sys, driver } = fakeSystem({ running: true });
  const keeper = createInstalledKeeper({ driver, file: tmpFile() });
  keeper.pause();
  assert.equal(sys.running, false, 'the installed island still runs beside the test island');
  sys.testIslands = 1; // the run starts its own island
  keeper.resume();
  assert.equal(sys.running, true, 'the installed island was not relaunched');
  assert.equal(sys.twoIslands, undefined, 'the installed island was relaunched while a test island ran');
  assert.equal(sys.loginItem, 'enabled');
});

test('an installed island that was not running is not started at the end', () => {
  const { sys, driver } = fakeSystem({ running: false });
  const keeper = createInstalledKeeper({ driver, file: tmpFile() });
  keeper.pause();
  keeper.resume();
  assert.equal(sys.running, false);
  assert.ok(!sys.log.includes('launch'));
});

test('pausing twice keeps the first state; resuming twice relaunches once', () => {
  const { sys, driver } = fakeSystem({ running: true });
  const keeper = createInstalledKeeper({ driver, file: tmpFile() });
  keeper.pause();
  keeper.pause();
  keeper.resume();
  keeper.resume();
  assert.equal(sys.log.filter((e) => e === 'launch').length, 1);
  assert.equal(sys.running, true);
});

test('after a killed run, the next run\'s sweep relaunches the installed island', () => {
  const file = tmpFile();
  const { sys, driver } = fakeSystem({ running: true });
  createInstalledKeeper({ driver, file }).pause();
  // SIGKILL: no clean-up ran; the file is all that is left.
  assert.ok(fs.existsSync(file), 'the paused state was not written down');
  createInstalledKeeper({ driver, file }).sweep();
  assert.equal(sys.running, true, 'the sweep did not relaunch the installed island');
  assert.ok(!fs.existsSync(file), 'the stale file was left behind');
});

test('the sweep never relaunches beside a test island left running: it stops that one first', () => {
  const file = tmpFile();
  const { sys, driver } = fakeSystem({ running: true });
  createInstalledKeeper({ driver, file }).pause();
  sys.testIslands = 1; // an orphan of the killed run
  createInstalledKeeper({ driver, file }).sweep();
  assert.equal(sys.twoIslands, undefined, 'two islands were on the notch');
  assert.equal(sys.running, true);
});

test('a resume that cannot stop the test islands leaves the installed one off and keeps the state for the next sweep', () => {
  const file = tmpFile();
  const { sys, driver } = fakeSystem({ running: true });
  driver.stopTestIslands = () => {}; // one will not die
  const keeper = createInstalledKeeper({ driver, file });
  keeper.pause();
  sys.testIslands = 1;
  assert.throws(() => keeper.resume(), /test island/);
  assert.equal(sys.twoIslands, undefined, 'two islands were on the notch');
  assert.ok(fs.existsSync(file), 'the state was dropped, so no later sweep can put the island back');
});

test('the keeper only ever quits and launches: it never touches the login item', () => {
  const src = fs.readFileSync(path.join(__dirname, 'support', 'installed-island.js'), 'utf8');
  assert.doesNotMatch(src, /unregister|SMAppService|sfltool|launchctl\s+(remove|unload|bootout)|LoginItems/i);
});

// ------------------------------------------------- the real installed island

const INSTALLED = '/Applications/NotchIsland.app/Contents/MacOS/NotchIsland';
const installedPids = () => {
  let pids = [];
  try { pids = execFileSync('pgrep', ['-x', 'NotchIsland'], { encoding: 'utf8' }).split('\n').filter(Boolean); } catch { /* none */ }
  return pids.filter((p) => {
    try { return execFileSync('ps', ['-o', 'comm=', '-p', p], { encoding: 'utf8' }).trim() === INSTALLED; } catch { return false; }
  });
};

test('real: an interrupted run puts the installed island back, and it ran alone throughout', {
  skip: fs.existsSync(INSTALLED) ? false : 'the release island is not installed',
}, async () => {
  const before = installedPids().length > 0;
  const support = path.join(__dirname, 'support');
  const child = spawn(process.execPath, ['-e', `
    const keeper = require(${JSON.stringify(path.join(support, 'installed-island'))});
    keeper.pauseInstalled();
    console.log('READY');
    setInterval(() => {}, 1000);
  `], { stdio: ['ignore', 'pipe', 'inherit'] });
  let out = '';
  let pausedSeen = null;
  await new Promise((resolve, reject) => {
    child.stdout.on('data', (d) => {
      out += d;
      if (out.includes('READY') && pausedSeen === null) {
        pausedSeen = installedPids().length;
        child.kill('SIGINT');
      }
    });
    child.on('exit', resolve);
    child.on('error', reject);
    setTimeout(() => { child.kill('SIGKILL'); reject(new Error('the child did not finish')); }, 40000).unref();
  });
  assert.equal(pausedSeen, 0, 'the installed island still ran while the test run held the notch');
  if (before) {
    const end = Date.now() + 15000;
    while (installedPids().length === 0 && Date.now() < end) await new Promise((r) => setTimeout(r, 200));
    assert.equal(installedPids().length, 1, 'the installed island was not put back after the interrupted run');
  } else {
    assert.equal(installedPids().length, 0, 'an installed island that was not running was started');
  }
});
