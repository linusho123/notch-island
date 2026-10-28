'use strict';
// Scenario artifacts have a separate owner so SIGKILL cannot skip cleanup.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const base = path.join(os.tmpdir(), 'notch-island-tests');

function scratch(world) {
  if (!world.scratch) {
    fs.mkdirSync(base, { recursive: true });
    const dir = fs.mkdtempSync(path.join(base, 'scenario-'));
    world.scratch = dir;
    const log = fs.openSync(path.join(dir, 'scratch-guardian.log'), 'a');
    const guardian = spawn(process.execPath, [path.join(__dirname, 'scratch-guardian.js'), dir], {
      detached: true, stdio: ['ignore', log, log, 'ipc'],
    });
    fs.closeSync(log);
    const pending = new Map();
    let next = 0;
    let readyResolve;
    let readyReject;
    const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
    ready.catch(() => {});
    guardian.on('message', (m) => {
      if (m.ready) { readyResolve(); return; }
      const call = pending.get(m.id);
      if (!call) return;
      if (m.error) { call.reject(new Error(m.error)); call.doneReject(new Error(m.error)); pending.delete(m.id); }
      else if (m.exited) { call.doneResolve(m); pending.delete(m.id); }
      else if (m.pid) call.resolve({ pid: m.pid, finished: call.finished });
    });
    const finished = new Promise((resolve, reject) => {
      guardian.once('error', reject);
      guardian.once('exit', (code, signal) => code === 0 ? resolve()
        : reject(new Error(`scratch cleanup failed (${code ?? signal}); retained ${dir}`)));
    });
    finished.catch((e) => {
      readyReject(e);
      for (const call of pending.values()) { call.reject(e); call.doneReject(e); }
    });
    world.scratchOwner = {
      async spawn(file, args, options) {
        await ready;
        return new Promise((resolve, reject) => {
          const id = ++next;
          let doneResolve;
          let doneReject;
          const done = new Promise((r, j) => { doneResolve = r; doneReject = j; });
          done.catch(() => {});
          pending.set(id, { resolve, reject, doneResolve, doneReject, finished: done });
          guardian.send({ op: 'spawn', id, file, args: args.map(String), ...options });
        });
      },
    };
    world.defer(async () => {
      if (guardian.connected) guardian.send({ op: 'cleanup' });
      await finished;
    });
  }
  return world.scratch;
}
async function startOwned(world, file, args, { env = process.env, stdout, stderr } = {}) {
  const dir = scratch(world);
  const child = await world.scratchOwner.spawn(file, args, {
    env, stdout: stdout || path.join(dir, 'child.stdout'), stderr: stderr || path.join(dir, 'child.stderr'),
  });
  const procs = require('./procs');
  const handle = procs.adopt('owned capture helper', child.pid);
  return Object.assign(handle, { finished: child.finished });
}
async function runOwned(file, args, options = {}) {
  const defers = [];
  const w = { defer: (fn) => defers.push(fn) };
  const dir = scratch(w);
  const stdout = path.join(dir, 'command.stdout');
  const stderr = path.join(dir, 'command.stderr');
  try {
    const child = await w.scratchOwner.spawn(file, args, { env: options.env || process.env, stdout, stderr });
    const result = await child.finished;
    if (result.code !== 0) throw new Error(`owned capture failed (${result.code ?? result.signal}): ${fs.readFileSync(stderr, 'utf8')}`);
    return { stdout: fs.readFileSync(stdout, 'utf8') };
  } finally { for (const fn of defers.reverse()) await fn(); }
}
module.exports = { scratch, startOwned, runOwned };
