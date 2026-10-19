'use strict';
// macOS's own login-item registry (Background Task Management), read through
// `sfltool dumpbtm`: the far side for "starts at login" (D60, Q1).
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const run = promisify(execFile);

/**
 * The registry's own dump. `sfltool dumpbtm` now and then hangs for a minute
 * or more while the registry daemon is busy (seen right after a login item is
 * added); a hung dump is asked again rather than read as an answer.
 */
async function dump() {
  let last;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { stdout } = await run('sfltool', ['dumpbtm'], { encoding: 'utf8', maxBuffer: 32 << 20, timeout: 30000 });
      return stdout;
    } catch (e) {
      last = e;
      if (!e.killed) throw e;
    }
  }
  throw new Error(`sfltool dumpbtm hung three times: ${last.message}`);
}

/** The login items macOS keeps for this user. */
async function items() {
  const stdout = await dump();
  const uid = os.userInfo().uid;
  const sections = stdout.split(/^\s*Records for UID /m);
  const mine = sections.find((s) => s.startsWith(`${uid} `));
  if (!mine) throw new Error(`sfltool dumpbtm listed no records for uid ${uid}`);
  return mine.split(/^\s*#\d+:\s*$/m).slice(1).map((block) => {
    const field = (name) => {
      const m = new RegExp(`^\\s*${name}:\\s*(.*)$`, 'm').exec(block);
      return m ? m[1].trim() : null;
    };
    return {
      name: field('Name'),
      type: field('Type'),
      disposition: field('Disposition'),
      url: field('URL'),
      bundleID: field('Bundle Identifier'),
    };
  });
}

/** The app login item for this bundle id, if macOS lists it as enabled. */
async function enabledApp(bundleID) {
  return (await items()).find((i) => i.bundleID === bundleID && /^app\b/.test(i.type || '')
    && /\[\s*enabled\b/.test(i.disposition || '')) || null;
}

module.exports = { items, enabledApp };
