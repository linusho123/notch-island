'use strict';
// macOS's own login-item registry (Background Task Management), read through
// `sfltool dumpbtm`: the far side for "starts at login" (D60, Q1).
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const exec = promisify(execFile);
const defaultRunner = (cmd, args) => exec(cmd, args, { encoding: 'utf8', maxBuffer: 32 << 20, timeout: 30000 });

const NEEDS_RULE = 'sfltool needs the sudoers rule /etc/sudoers.d/sfltool-dumpbtm (see docs or the phase report)';

/**
 * The registry's own dump, as root: `sudo -n /usr/bin/sfltool dumpbtm`. Plain
 * `sfltool dumpbtm` raises an administrator-password dialog, which is what
 * looked like a hang. `-n` never prompts, so a missing sudoers rule
 * (`linus ALL=(root) NOPASSWD: /usr/bin/sfltool dumpbtm`) fails fast. A call
 * that really hangs (the registry daemon busy) is asked once more, no more.
 * `runner(cmd, args)` is injectable for tests.
 */
async function dump({ runner = defaultRunner } = {}) {
  let last;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { stdout } = await runner('sudo', ['-n', '/usr/bin/sfltool', 'dumpbtm']);
      return stdout;
    } catch (e) {
      last = e;
      if (e.killed) continue;
      if (/password is required|a terminal is required|not allowed to execute|may not run sudo/i.test(`${e.stderr || ''}${e.message}`)) {
        throw new Error(NEEDS_RULE);
      }
      throw e;
    }
  }
  throw new Error(`sfltool dumpbtm hung twice: ${last.message}`);
}

/** The login items macOS keeps for this user. */
async function items(opts) {
  const stdout = await dump(opts);
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

/**
 * The path a login item's URL names. Older macOS lists a file:// URL; macOS 27
 * lists a plain path with the home folder written by uid (/Users/501/...).
 */
function itemPath(url) {
  const { fileURLToPath } = require('node:url');
  let p = /^file:/.test(url || '') ? fileURLToPath(url) : String(url || '');
  const byUid = `/Users/${os.userInfo().uid}/`;
  if (p.startsWith(byUid)) p = os.homedir() + '/' + p.slice(byUid.length);
  return p.replace(/\/$/, '');
}

/** The app login item for this bundle id, if macOS lists it as enabled. */
async function enabledApp(bundleID, opts) {
  return (await items(opts)).find((i) => i.bundleID === bundleID && /^app\b/.test(i.type || '')
    && /\[\s*enabled\b/.test(i.disposition || '')) || null;
}

module.exports = { items, enabledApp, itemPath };

/** Read-only M02 guard. Repair of the installed item belongs to main. */
function verifyInstalled(records) {
  const assert = require('node:assert/strict');
  const live = records.filter((i) => i.bundleID === 'local.notch-island'
    && /^app\b/.test(i.type || '') && /\[\s*enabled\b/.test(i.disposition || ''));
  assert.ok(live.length, 'installed login item has no enabled app record');
  for (const item of live) {
    assert.equal(itemPath(item.url), '/Applications/NotchIsland.app',
      'installed login item does not name its canonical /Applications bundle; repair belongs to main');
  }
  return live;
}
module.exports.verifyInstalled = verifyInstalled;
