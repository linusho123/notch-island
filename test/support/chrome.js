'use strict';
// A test Chrome: its own instance with a scratch profile, never the
// visionary's own Chrome or profile.
const path = require('node:path');
const fs = require('node:fs');
const procs = require('./procs');
const harness = require('./harness');
const { scratch } = require('./sandbox');

const BINARY = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch(world) {
  const profile = path.join(scratch(world), 'chrome-profile');
  fs.mkdirSync(profile, { recursive: true });
  const handle = procs.start('test Chrome', BINARY, [
    `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--disable-sync', '--disable-features=Translate', 'about:blank',
  ]);
  world.defer(() => procs.stop(handle));
  const end = Date.now() + 20000;
  for (;;) {
    const items = await harness.menubar(handle.pid).catch(() => []);
    if ((await harness.windows(handle.pid).catch(() => [])).length && items.some((i) => i.title === 'Help')) break;
    if (Date.now() > end) throw new Error('the test Chrome never showed a window with a menu bar');
    await sleep(200);
  }
  return handle;
}

module.exports = { launch };
