'use strict';
// Processes the harness itself spawns, identified by pid AND start time. A
// test only ever signals a process in this registry, and only after
// re-checking that the pid still names the process it started (so a reused
// pid can never be hit).
const { spawn, execFileSync } = require('node:child_process');
const { onCleanup } = require('./cleanup');

const spawned = new Map(); // pid -> handle

function startTimeOf(pid) {
  try {
    return execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8' }).trim() || null;
  } catch {
    return null; // no such process
  }
}

function alive(handle) {
  return Boolean(handle) && startTimeOf(handle.pid) === handle.started;
}

function isOurs(handle) {
  return spawned.get(handle.pid) === handle && alive(handle);
}

/** Spawn a process and record it as the harness's own. */
function start(name, file, args = [], opts = {}) {
  const child = spawn(file, args, { stdio: 'ignore', ...opts });
  if (!child.pid) throw new Error(`could not start ${name} (${file})`);
  const started = startTimeOf(child.pid);
  if (!started) throw new Error(`${name} exited at once (${file})`);
  const handle = { pid: child.pid, started, name, child, exited: false };
  child.on('exit', () => { handle.exited = true; });
  spawned.set(child.pid, handle);
  return handle;
}

/**
 * Take on a process the harness had LaunchServices start (`open`), so it is
 * stopped like one it spawned: only while it is that same process.
 */
function adopt(name, pid) {
  const started = startTimeOf(pid);
  if (!started) throw new Error(`${name} (pid ${pid}) is not running`);
  const handle = { pid, started, name, child: null, exited: false };
  spawned.set(pid, handle);
  return handle;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** End a process the harness started: terminate, then kill if it lingers. */
async function stop(handle) {
  if (!handle || !spawned.has(handle.pid)) return;
  try {
    for (const signal of ['SIGTERM', 'SIGKILL']) {
      if (!isOurs(handle)) return;
      process.kill(handle.pid, signal);
      for (let i = 0; i < 60 && alive(handle); i++) await sleep(50);
      if (!alive(handle)) return;
    }
    throw new Error(`${handle.name} (pid ${handle.pid}) did not exit`);
  } finally {
    if (!alive(handle)) spawned.delete(handle.pid);
  }
}

// Last resort if the test process itself is torn down mid-scenario.
onCleanup(() => {
  for (const h of spawned.values()) {
    if (isOurs(h)) { try { process.kill(h.pid, 'SIGKILL'); } catch { /* gone */ } }
  }
});

module.exports = { start, adopt, stop, alive, sleep, ownsPid: (pid) => isOurs(spawned.get(pid) || {}) };
