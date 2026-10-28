'use strict';
// Which processes are islands. The companion extension's native-messaging
// host is the same binary, started by Chrome with the caller's origin as its
// first argument; it is not an island, and neither the harness nor the
// installed-island keeper may count, quit or wait for it.
const { execFileSync } = require('node:child_process');

/** Whether a process's argument line is the binary in host mode. */
function isHostMode(args) {
  return /\schrome-extension:\/\//.test(args);
}

/** The pids of every running island (by executable name), hosts left out. */
function listIslands({ exec = execFileSync } = {}) {
  let out;
  try { out = exec('pgrep', ['-x', 'NotchIsland'], { encoding: 'utf8' }); } catch { return []; }
  return out.split('\n').filter(Boolean).map(Number).filter((pid) => {
    try {
      const args = exec('ps', ['-ww', '-o', 'args=', '-p', String(pid)], { encoding: 'utf8' }).trim();
      return Boolean(args) && !isHostMode(args);
    } catch { return false; }
  });
}

module.exports = { listIslands, isHostMode };
