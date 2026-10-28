'use strict';
// P6 D79: an unchanged, optimized release executable; real Music and macOS
// top are the far side. No test input is fed or read by these checks.
const assert = require('node:assert/strict');
const { assertFixtureSession } = require('./fixture-preflight');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile, execFileSync, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const check = require('./cost-check');
const { root, releaseBinary, releaseApp, testBinary } = require('./paths');
const procs = require('./procs');
const registry = require('./registry');
const harness = require('./harness');
const island = require('./island');
const music = require('./music');
const scenes = require('./scenes');
const signing = require('./signing');
const { COST_IDENTIFIER } = require('./login-service');
const run = promisify(execFile);

function processTable() {
  return execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,lstart=,state=,args='], { encoding: 'utf8', maxBuffer: 16 << 20 })
    .split('\n').flatMap((line) => {
      const m = /^\s*(\d+)\s+(\d+)\s+(\w{3}\s+\w{3}\s+\d+\s+[\d:]+\s+\d{4})\s+(\S+)\s+(.+)$/.exec(line);
      return m ? [{ pid: Number(m[1]), ppid: Number(m[2]), started: m[3].replace(/\s+/g, ' '), state: m[4], args: m[5] }] : [];
    });
}

const islandItems = async () => (await registry.items()).filter((i) => /local\.notch-island/.test(i.bundleID || ''));

async function prepare(w) {
  assertFixtureSession({ allowInstalled: true });
  require('./installed-island').pauseInstalled();
  assertFixtureSession();
  // Fail before launching if this is debug, has test input, or does not match
  // SwiftPM's release compiler output. Both marker checks have a test-build
  // positive control, so an empty/wrong binary cannot silently pass.
  const originalBuild = check.assertRelease();
  const before = (await islandItems()).filter((i) => !i.bundleID?.startsWith('local.notch-island.cost.'));
  const fixture = fs.mkdtempSync(path.join(root, 'build', 'apps.noindex', 'p6-cost-'));
  const home = fs.mkdtempSync('/tmp/ni-cost-home-');
  const guardianLog = fs.openSync(path.join(home, 'guardian.log'), 'a');
  const guardian = spawn(process.execPath, [path.join(__dirname, 'cost-guardian.js'), fixture, home], {
    detached: true, stdio: ['ignore', guardianLog, guardianLog, 'ipc'],
  });
  fs.closeSync(guardianLog);
  const disarm = require('./cleanup').onCleanup(() => { if (guardian.connected) guardian.disconnect(); });
  const finished = new Promise((resolve, reject) => {
    guardian.once('error', reject);
    guardian.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`cost guardian exited ${code}: ${home}/guardian.log`)));
  });
  finished.catch(() => {});
  w.defer(async () => {
    if (guardian.connected) guardian.send('cleanup');
    await finished;
    disarm();
    assert.deepEqual((await islandItems()).filter((i) => !i.bundleID?.startsWith('local.notch-island.cost.')), before,
      'D79 changed an existing login item');
  });
  await new Promise((resolve, reject) => {
    guardian.once('message', resolve);
    guardian.once('error', reject);
    guardian.once('exit', (code) => reject(new Error(`cost guardian not ready: ${code}`)));
  });
  // Normal Foundation home resolution, not an app test switch. Keep the
  // release code intact and give the fixture its own Apple Events identity.
  // Service Management IPC/job creation are denied before launch and proved
  // using the test build first; this release copy must never register.
  const app = path.join(fixture, 'NotchIsland.app');
  fs.cpSync(releaseApp, app, { recursive: true });
  const binary = path.join(app, 'Contents', 'MacOS', 'NotchIsland');
  const adapter = path.join(app, 'Contents', 'Resources', 'now-playing-adapter.dylib');
  assert.equal(check.hash(binary), originalBuild.sha256, 'scratch executable is not the checked release binary');
  // A separate identity prevents LaunchServices from redirecting the installed
  // app's existing login-item URL when it notices this scratch bundle. It is
  // the same on every run, so macOS asks for Automation consent only once.
  const identifier = COST_IDENTIFIER;
  execFileSync('/usr/libexec/PlistBuddy', ['-c', `Set :CFBundleIdentifier ${identifier}`, path.join(app, 'Contents', 'Info.plist')]);
  const entitlements = path.join(home, 'entitlements.plist');
  fs.writeFileSync(entitlements, `<?xml version="1.0"?><plist version="1.0"><dict>
    <key>com.apple.security.automation.apple-events</key><true/>
    <key>com.apple.security.temporary-exception.apple-events</key><array><string>com.apple.Music</string></array>
    </dict></plist>`);
  const sign = () => execFileSync('/usr/bin/codesign', ['--force', ...signing(), '--entitlements', entitlements, app], { stdio: 'pipe' });
  sign();
  // Only identity/signature changed: the Mach-O linker UUID and release
  // compiler flags must still match, and test-input markers remain absent.
  const build = { ...check.assertRelease(binary), originalSha256: originalBuild.sha256, identifier,
    isolation: 'scratch home, BTM IPC denied, Music Apple Events entitlement' };
  fs.mkdirSync(path.join(home, 'Desktop'));
  fs.mkdirSync(path.join(home, 'Library', 'Application Support'), { recursive: true });
  const profile = `(version 1)(allow default)
    (allow appleevent-send (appleevent-destination "com.apple.Music"))
    (deny job-creation)
    (deny mach-lookup (global-name "com.apple.xpc.smd"))
    (deny mach-lookup (global-name-regex #"com\\.apple\\.backgroundtaskmanagement.*"))
    (deny file-write* (subpath ${JSON.stringify(os.homedir())}))`;
  const env = { ...process.env, HOME: home, CFFIXED_USER_HOME: home };
  delete env.NOTCH_ISLAND_TEST_INPUT;
  // A real test build attempts its normal registration under exactly the
  // same profile/identity. If macOS lets it through, fail and let the guardian
  // unregister it; never launch the release executable on that path.
  fs.copyFileSync(testBinary, binary);
  sign();
  const input = path.join(home, 'preflight.json');
  fs.writeFileSync(input, JSON.stringify({ dataDirectory: home, screenshotDirectory: path.join(home, 'Desktop'), chromeSocket: path.join(home, 'chrome.sock') }));
  fs.writeFileSync(path.join(fixture, 'registration-armed'), identifier);
  const preflight = procs.start('D79 test-build registration preflight', '/usr/bin/sandbox-exec', ['-p', profile, binary], {
    env: { ...env, NOTCH_ISLAND_TEST_INPUT: input },
  });
  w.defer(() => procs.stop(preflight));
  await island.until(async () => (await harness.windows(preflight.pid)).length > 0, 10000, 'registration preflight did not start');
  await procs.sleep(500);
  await procs.stop(preflight);
  await require('./login-service').assertUnregistered(app, identifier, { ...env, NOTCH_ISLAND_TEST_INPUT: input });
  fs.copyFileSync(releaseBinary, binary);
  sign();
  assert.equal(check.hash(binary), build.sha256, 'release bytes changed after registration preflight');
  console.log('D79 registration denial proved with the test build; release input remains compiled out');
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
    // The guardian restores the test executable and verifies native removal.
    // BTM enablement alone cannot establish that this identity is absent.
  });
  w.cost = { build, binary, adapter, home, logFile };
  w.defer(() => {
    const output = path.join(root, 'build', 'p6-cost');
    fs.mkdirSync(output, { recursive: true });
    fs.copyFileSync(logFile, path.join(output, `setup-${handle.pid}.log`));
  });
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
  // A cheap-looking process that cannot read Music is not a valid D79 Given.
  // Prove real release functionality through its drawn Accessibility content
  // before closing it. No AX reads run during the sampled minute.
  const point = await harness.notchCenter();
  await harness.glide(point.x, point.y, 10, 10);
  await island.waitFor(handle.pid, (v) => v.open && v.texts.includes('Wonderwall')
    && v.texts.includes('Oasis') && v.buttons.some((b) => b.label === 'Pause'), 10000,
    'release island cannot follow the real playing track');
  await scenes.plainNotch(w);
  const state = await music.state();
  assert.equal(state.name, 'Wonderwall');
  assert.equal(state.state, 'playing');
  assert.ok(fs.existsSync(path.join(home, 'Library', 'Application Support', 'notch-island')),
    'Foundation did not isolate the release home');
  assert.ok(!/the now-playing adapter is missing/.test(fs.readFileSync(logFile, 'utf8')));
  assert.equal(await registry.enabledApp(identifier), null, 'release startup registered a login item');
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
  const main = { pid, started: w.island.started.replace(/\s+/g, ' ') };
  const required = check.requiredAdapters(tables, main, w.cost.adapter);
  const minute = check.sumMinute(snapshots, pid, companions.filter((p) => p.args.startsWith(`${w.cost.binary} chrome-extension://`)).map((p) => p.pid), [required]);
  // The native host is the island binary launched by Chrome. None is expected
  // here: Wonderwall uses Music, and the release socket is in a scratch home.
  // If one exists for this exact executable, it is nevertheless included.
  const hosts = companions.filter((p) => p.args.startsWith(`${w.cost.binary} chrome-extension://`));
  w.cost.minute = { ...minute, elapsedMs, build: w.cost.build, top: `${stem}.top.txt`,
    ownership: `${stem}.processes.json`, requiredService: required, nativeHostPids: [...new Set(hosts.map((p) => p.pid))],
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
