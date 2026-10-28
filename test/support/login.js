'use strict';
// D60/Q1: read the real login registry, then ask LaunchServices to open its
// registered URL in the background. The authorized P5 keeper isolates the
// installed app before fixture actions; no real login participates. All state belongs to a signed test bundle copy.
const assert = require('node:assert/strict');
const { assertFixtureSession } = require('./fixture-preflight');
const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { spawn, execFileSync } = require('node:child_process');
const registry = require('./registry');
const procs = require('./procs');
const harness = require('./harness');
const { root, testApp } = require('./paths');
const { fixturePaths, pids } = require('./login-guardian');

async function until(pred, message, ms = 15000) {
  const end = Date.now() + ms;
  while (!(await pred())) {
    assert.ok(Date.now() < end, message);
    await procs.sleep(100);
  }
}

const installedState = async () => (await registry.items()).filter((i) => i.bundleID === 'local.notch-island');
const version = (app) => execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleVersion',
  path.join(app, 'Contents', 'Info.plist')], { encoding: 'utf8' }).trim();

function stamp(app, number, identifier) {
  if (identifier) execFileSync('/usr/libexec/PlistBuddy', ['-c', `Set :CFBundleIdentifier ${identifier}`, path.join(app, 'Contents', 'Info.plist')]);
  execFileSync('/usr/libexec/PlistBuddy', ['-c', `Set :CFBundleVersion ${number}`, path.join(app, 'Contents', 'Info.plist')]);
  execFileSync('codesign', ['--force', '--sign', '-', app], { stdio: 'pipe' });
}

async function registered(w) {
  const found = await registry.enabledApp(w.login.identifier);
  assert.ok(found, 'macOS does not list the test island as an enabled login item');
  const app = fileURLToPath(found.url).replace(/\/$/, '');
  assert.equal(app, w.login.app, 'the enabled login item points at a different app');
  assert.ok(fs.existsSync(path.join(app, 'Contents', 'MacOS', 'NotchIsland')));
  return app;
}

async function prepare(w) {
  assertFixtureSession({ allowInstalled: true });
  require('./installed-island').pauseInstalled();
  assertFixtureSession();
  const before = await installedState();
  w.defer(async () => assert.deepEqual(await installedState(), before, 'the installed island registration changed'));
  const dir = fs.mkdtempSync(path.join(root, 'build', 'apps.noindex', 'p6-login-'));
  const paths = fixturePaths(dir);
  const log = fs.openSync(path.join(dir, 'guardian.log'), 'a');
  const guardian = spawn(process.execPath, [path.join(__dirname, 'login-guardian.js'), dir], {
    detached: true, stdio: ['ignore', log, log, 'ipc'],
  });
  fs.closeSync(log);
  const finished = new Promise((resolve, reject) => {
    guardian.once('error', reject);
    guardian.once('exit', (code, signal) => code === 0 ? resolve()
      : reject(new Error(`login guardian exited ${code ?? signal}; inspect ${dir}/guardian.log`)));
  });
  // Setup may itself throw before the deferred cleanup awaits this promise.
  finished.catch(() => {});
  // Register before launching any test island, including on setup failure.
  w.defer(async () => {
    if (guardian.connected) guardian.send('cleanup');
    await finished;
  });
  await new Promise((resolve, reject) => {
    guardian.once('message', (m) => m.ready ? resolve() : reject(new Error(JSON.stringify(m))));
    guardian.once('error', reject);
    guardian.once('exit', (code) => reject(new Error(`login guardian exited before ready: ${code}`)));
  });
  // Test build only; its input redirects data, captures and socket into scratch.
  fs.cpSync(testApp, paths.app, { recursive: true });
  stamp(paths.app, 6001, paths.identifier);
  const data = path.join(dir, 'data');
  const desktop = path.join(dir, 'Desktop');
  fs.mkdirSync(data);
  fs.mkdirSync(desktop);
  const socket = `/tmp/ni-${path.basename(dir)}.sock`;
  fs.writeFileSync(paths.input, JSON.stringify({ dataDirectory: data, screenshotDirectory: desktop, chromeSocket: socket }));
  w.login = { ...paths, dir };
  const n = (await harness.builtIn()).notch;
  await harness.move(n.x + n.w / 2, 420);
  assert.equal(pids(paths.binary).length, 0);
  fs.writeFileSync(path.join(dir, 'registration-armed'), paths.identifier);
  const handle = procs.start('previous test island', paths.binary, [], {
    env: { ...process.env, NOTCH_ISLAND_TEST_INPUT: paths.input },
  });
  w.island = handle;
  await until(async () => (await harness.windows(handle.pid)).length > 0, 'previous test island did not start');
  // Registration must have come from the app's normal startup, not a test
  // registry writer. A missing/disabled/wrong-path registry row is red.
  await registered(w);
  console.log(`D60 previous pid=${handle.pid} build=${version(paths.app)} registry=${paths.app}`);
}

async function login(w, reason) {
  const old = w.island;
  const oldVersion = version(w.login.app);
  assert.ok(procs.alive(old), 'previous test instance is missing');
  assert.deepEqual(pids(w.login.binary), [old.pid], 'unexpected test island before login');
  if (reason === 'after a restart for an update') {
    // A normal Quit event is handled by NSApplication, just as an updater's
    // clean exit. The target is this test bundle, never the installed ID.
    execFileSync('osascript', ['-e', `tell application id "${w.login.identifier}" to quit`], { timeout: 10000 });
    await until(() => !procs.alive(old), 'previous build did not quit cleanly');
    await procs.sleep(50);
    assert.equal(old.child.exitCode, 0, 'previous build did not exit cleanly');
    assert.equal(old.child.signalCode, null);
    // This is a newly versioned, signed bundle build of the same app code;
    // P6 adds no app behaviour. Replace it only after the old process exits.
    stamp(w.login.app, Number(oldVersion) + 1);
    assert.ok(Number(version(w.login.app)) > Number(oldVersion), 'update did not install a newer build');
  } else {
    const signal = reason === 'after a restart following a crash' ? 'SIGKILL' : 'SIGTERM';
    assert.equal(pids(w.login.binary)[0], old.pid);
    process.kill(old.pid, signal);
    await until(() => !procs.alive(old), `previous test instance survived ${signal}`);
    await procs.sleep(50);
    assert.equal(old.child.signalCode, signal, `previous instance did not exit with ${signal}`);
  }
  assert.equal(pids(w.login.binary).length, 0, 'a previous test instance survived');
  // Keep exactly the same data directory and socket after the crash. A
  // stale lock/socket or reopen prompt must not be hidden by fresh state.
  const app = await registered(w);
  const front = await harness.frontmost();
  execFileSync('/usr/bin/open', ['-g', '-n', '--env', `NOTCH_ISLAND_TEST_INPUT=${w.login.input}`, app], { timeout: 20000 });
  await until(() => pids(w.login.binary).length === 1, 'registered test app did not start in the background');
  const pid = pids(w.login.binary)[0];
  assert.notEqual(pid, old.pid, 'the previous instance was reused');
  w.island = procs.adopt('login test island', pid);
  await until(async () => (await harness.windows(pid)).length > 0, 'login app never showed an accessible window');
  assert.equal((await harness.frontmost()).pid, front.pid, 'background login activated the island');
  await registered(w);
  console.log(`D60 ${reason}: previous=${old.pid} next=${pid} build=${oldVersion}->${version(app)} via open -g`);
}

module.exports = { prepare, login };
