'use strict';
// Read-only. A live pause lease is shared only by processes in the same
// guarded UI run. Stale state and unrelated islands always refuse.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { listIslands } = require('./island-procs');
const keeperFile = path.join(os.tmpdir(), 'notch-island-installed-island.json');
const installedBinary = '/Applications/NotchIsland.app/Contents/MacOS/NotchIsland';
function activePause() {
  try {
    const saved = JSON.parse(fs.readFileSync(keeperFile, 'utf8'));
    return Boolean(saved.stamp && saved.stamp === process.env.NOTCH_ISLAND_POST_STAMP
      && saved.started && Number.isInteger(saved.pid)
      && execFileSync('ps', ['-o', 'lstart=', '-p', String(saved.pid)], { encoding: 'utf8' }).trim() === saved.started);
  } catch { return false; }
}
function installed(pid) {
  try { return execFileSync('ps', ['-o', 'comm=', '-p', String(pid)], { encoding: 'utf8' }).trim() === installedBinary; }
  catch { return false; }
}
function testBinary(pid) {
  try {
    const binary = execFileSync('ps', ['-o', 'comm=', '-p', String(pid)], { encoding: 'utf8' }).trim();
    const paths = require('./paths');
    if (binary === paths.testBinary) return true;
    const parent = path.join(paths.root, 'build', 'apps.noindex');
    const relative = path.relative(parent, binary);
    return /^p6-(login|cost)-[A-Za-z0-9]+\/NotchIsland\.app\/Contents\/MacOS\/NotchIsland$/.test(relative)
      && fs.realpathSync(binary) === binary;
  }
  catch { return false; }
}
function describeProcess(pid) {
  const fields = ['comm', 'ppid', 'lstart', 'args'].map((field) => {
    let value;
    try { value = execFileSync('ps', ['-ww', '-o', `${field}=`, '-p', String(pid)], { encoding: 'utf8' }).trim() || '<exited>'; }
    catch { value = '<unavailable or exited>'; }
    return `${field}=${JSON.stringify(value)}`;
  });
  return `pid=${pid} ${fields.join(' ')}`;
}
function assertFixtureSession({ islands = listIslands, exists = fs.existsSync,
  owned = () => false, allowInstalled = false, paused = activePause, isInstalled = installed,
  isTest = testBinary, graceMs = 3000, now = Date.now,
  sleep = (ms) => execFileSync('sleep', [String(ms / 1000)]) } = {}) {
  if (exists(keeperFile) && !paused()) throw new Error(`BLOCKED: installed-island keeper state needs human recovery: ${keeperFile}`);
  const read = () => islands().filter((pid) => !owned(pid) && !(allowInstalled && isInstalled(pid)));
  let foreign = read();
  const end = now() + graceMs;
  // Previous scenarios may have sent TERM but not reaped the exact test
  // binary yet. Wait without signaling it; unrelated or persistent apps block.
  while (foreign.length && foreign.every(isTest) && now() < end) {
    sleep(100);
    foreign = read();
  }
  if (foreign.length) throw new Error(`BLOCKED: an unowned island is running (${foreign.join(', ')}); prepare a fixture-only session\n${foreign.map(describeProcess).join('\n')}`);
}
module.exports = { assertFixtureSession, activePause };
