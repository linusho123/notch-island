'use strict';
// P6 D79: an unchanged, optimized release executable; real Music and macOS
// top are the far side. No test input is fed or read by these checks.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile, execFileSync } = require('node:child_process');
const { promisify } = require('node:util');
const check = require('./cost-check');
const { root, releaseBinary, releaseApp } = require('./paths');
const { onCleanup } = require('./cleanup');
const procs = require('./procs');
const registry = require('./registry');
const harness = require('./harness');
const island = require('./island');
const music = require('./music');
const scenes = require('./scenes');
const run = promisify(execFile);

function processTable() {
  return execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,args='], { encoding: 'utf8', maxBuffer: 16 << 20 })
    .split('\n').flatMap((line) => {
      const m = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line);
      return m ? [{ pid: Number(m[1]), ppid: Number(m[2]), args: m[3] }] : [];
    });
}

const islandItems = async () => (await registry.items()).filter((i) => /local\.notch-island/.test(i.bundleID || ''));

async function prepare(w) {
  // Fail before launching if this is debug, has test input, or does not match
  // SwiftPM's release compiler output. Both marker checks have a test-build
  // positive control, so an empty/wrong binary cannot silently pass.
  const build = check.assertRelease();
  const before = await islandItems();
  const fixture = fs.mkdtempSync(path.join(root, 'build', 'apps.noindex', 'p6-cost-'));
  const home = fs.mkdtempSync('/tmp/ni-cost-home-');
  const remove = () => {
    fs.rmSync(fixture, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  };
  const disarm = onCleanup(remove);
  w.defer(() => { remove(); disarm(); });
  // Normal Foundation home resolution, not an app test switch. The release
  // executable is unbundled (no bundle ID / login-item identity). Denying BTM
  // IPC additionally prevents registration; no release .app is ever launched.
  const binary = path.join(fixture, 'NotchIsland');
  const adapter = path.join(fixture, 'now-playing-adapter.dylib');
  fs.copyFileSync(releaseBinary, binary);
  fs.chmodSync(binary, 0o755);
  fs.copyFileSync(path.join(releaseApp, 'Contents', 'Resources', 'now-playing-adapter.dylib'), adapter);
  assert.equal(check.hash(binary), build.sha256, 'scratch executable is not the checked release binary');
  fs.mkdirSync(path.join(home, 'Desktop'));
  fs.mkdirSync(path.join(home, 'Library', 'Application Support'), { recursive: true });
  const profile = `(version 1)(allow default)
    (deny mach-lookup (global-name-regex #"com\\.apple\\.backgroundtaskmanagement.*"))
    (deny file-write* (subpath ${JSON.stringify(os.homedir())}))`;
  const env = { ...process.env, HOME: home, CFFIXED_USER_HOME: home };
  delete env.NOTCH_ISLAND_TEST_INPUT;
  const logFile = path.join(home, 'island.log');
  const log = fs.openSync(logFile, 'a');
  let handle;
  try {
    handle = procs.start('D79 release island', '/usr/bin/sandbox-exec', ['-p', profile, binary], {
      env, stdio: ['ignore', log, log],
    });
  } finally { fs.closeSync(log); }
  w.island = handle;
  w.defer(async () => {
    await procs.stop(handle);
    assert.deepEqual(await islandItems(), before, 'D79 changed a login-item registration');
  });
  w.cost = { build, binary, adapter, home, logFile };
  await island.until(async () => (await harness.windows(handle.pid)).length > 0, 10000,
    'release island did not launch (inspect scratch log)');
  await island.until(() => processTable().some((p) => p.ppid === handle.pid && p.args.includes(adapter)), 5000,
    'the release now-playing adapter did not launch: its cost must not be omitted');
  // Adopt only this launch's children so synchronous signal cleanup stops them
  // too. Never signal another island, its host, or a system process.
  for (const p of processTable().filter((p) => p.ppid === handle.pid)) {
    const child = procs.adopt('D79 release helper', p.pid);
    w.defer(() => procs.stop(child));
  }
  await music.play('Wonderwall', 30);
  w.defer(() => music.pause().catch(() => {}));
  await scenes.plainNotch(w);
  const state = await music.state();
  assert.equal(state.name, 'Wonderwall');
  assert.equal(state.state, 'playing');
  assert.ok(fs.existsSync(path.join(home, 'Library', 'Application Support', 'notch-island')),
    'Foundation did not isolate the release home');
  assert.ok(!/the now-playing adapter is missing/.test(fs.readFileSync(logFile, 'utf8')));
  assert.deepEqual(await islandItems(), before, 'release startup changed a login item');
  console.log(`D79 release ${build.sha256}; -O, whole-module optimization; both test markers absent. pid=${handle.pid}`);
}

async function sample(w) {
  const { pid } = w.island;
  const n = (await harness.builtIn()).notch;
  assert.ok(island.isPlainNotch(await island.look(pid), n), 'island was not closed at minute start');
  const tables = [];
  const discover = () => tables.push({ at: Date.now(), processes: processTable() });
  discover();
  // ps only reads process ownership. There is no pointer movement, AX polling,
  // screenshot, music control, or test-input activity inside this minute.
  const timer = setInterval(discover, 1000);
  const started = performance.now();
  let stdout;
  try {
    ({ stdout } = await run('/usr/bin/top', ['-l', '61', '-s', '1', '-stats', 'pid,ppid,cpu,power,command', '-ncols', '200'], {
      encoding: 'utf8', maxBuffer: 32 << 20, timeout: 90000,
    }));
  } finally { clearInterval(timer); }
  const elapsedMs = performance.now() - started;
  discover();
  const output = path.join(root, 'build', 'p6-cost');
  fs.mkdirSync(output, { recursive: true });
  const stem = path.join(output, `${Date.now()}-${process.pid}`);
  fs.writeFileSync(`${stem}.top.txt`, stdout);
  fs.writeFileSync(`${stem}.processes.json`, JSON.stringify(tables, null, 2));
  assert.ok(elapsedMs >= 60000 && elapsedMs < 75000, `top's minute took ${elapsedMs} ms`);
  const snapshots = check.parseTop(stdout);
  const companions = tables.flatMap((t) => t.processes).filter((p) =>
    p.args.startsWith(`${w.cost.binary} chrome-extension://`) || p.args.includes(w.cost.adapter));
  const minute = check.sumMinute(snapshots, pid, companions.map((p) => p.pid));
  // The native host is the island binary launched by Chrome. None is expected
  // here: Wonderwall uses Music, and the release socket is in a scratch home.
  // If one exists for this exact executable, it is nevertheless included.
  const hosts = companions.filter((p) => p.args.startsWith(`${w.cost.binary} chrome-extension://`));
  w.cost.minute = { ...minute, elapsedMs, build: w.cost.build, top: `${stem}.top.txt`,
    ownership: `${stem}.processes.json`, nativeHostPids: [...new Set(hosts.map((p) => p.pid))],
    cpu: check.summary(minute.samples, 'CPU'), energyImpact: check.summary(minute.samples, 'Energy Impact') };
  w.cost.report = `${stem}.json`;
  fs.writeFileSync(w.cost.report, JSON.stringify(w.cost.minute, null, 2));
  console.log(`D79 minute ${w.cost.report}: ${JSON.stringify(w.cost.minute)}`);
  assert.ok(island.isPlainNotch(await island.look(pid), n), 'island was not closed at minute end');
  const state = await music.state();
  assert.equal(state.name, 'Wonderwall');
  assert.equal(state.state, 'playing');
  assert.ok(state.position >= 89 && state.position < 115, 'Wonderwall did not play throughout the minute');
  assert.equal(check.hash(w.cost.binary), w.cost.build.sha256, 'measured executable changed during sampling');
}

function assertCost(w, measure, ceiling) {
  const result = check.summary(w.cost.minute.samples, measure);
  console.log(`D79 ${measure}: mean=${result.mean.toFixed(3)}, max=${result.max.toFixed(3)}, ceiling=${result.ceiling}; `
    + `longest >3x spike=${result.longestSpikeSeconds}s${result.finding ? ' FINDING (>5s)' : ''}; ${w.cost.report}`);
  // Assert the mean as D79 rules; a sustained spike is a reported finding,
  // never discarded or silently converted into a different acceptance bar.
  check.assertCeiling(w.cost.minute.samples, measure, ceiling);
}

module.exports = { prepare, sample, assertCost };
