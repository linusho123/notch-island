'use strict';
// The far side's reader and the pointer's driver: build/island-harness, which
// asks macOS itself (Accessibility, the screens, the frontmost app) and posts
// real pointer events. Coordinates are global and top-left based.
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { harness } = require('./paths');

const run = promisify(execFile);

async function h(...args) {
  try {
    const { stdout } = await run(harness, args.map(String), { encoding: 'utf8', maxBuffer: 64 << 20 });
    return JSON.parse(stdout);
  } catch (e) {
    if (e.code === 3) {
      throw new Error('Accessibility permission is needed: System Settings → Privacy & Security → Accessibility, for the terminal running the tests');
    }
    throw new Error(`island-harness ${args.join(' ')} failed: ${e.stderr || e.message}`);
  }
}

let screenCache = null;
/** The built-in screen and its notch, as macOS reports them. */
async function builtIn() {
  if (!screenCache) {
    const s = await h('screen');
    if (!s.builtIn || !s.builtIn.notch) throw new Error('no built-in screen with a notch is attached');
    screenCache = s;
  }
  return screenCache.builtIn;
}

async function notchCenter() {
  const { notch } = await builtIn();
  return { x: notch.x + notch.w / 2, y: notch.y + Math.min(10, notch.h / 2) };
}

/**
 * Safety net: a left button left held down system-wide (a drag whose mouse-up
 * was dropped) wrecks every later test and the visionary's Mac. Before and
 * after every test and suite that loads the harness, release it if it reads
 * held. `release` retries until it reads released and fails loudly otherwise.
 */
async function releaseIfHeld() {
  let held;
  try { held = await module.exports.leftHeld(); } catch { return; } // harness not built: nothing to guard
  if (held) await module.exports.release();
}

module.exports = {
  h,
  builtIn,
  notchCenter,
  screens: () => h('screen'),
  windows: async (pid) => (await h('windows', pid)).windows,
  menus: async (pid) => (await h('menus', pid)).menus,
  menubar: async (pid) => (await h('menubar', pid)).items,
  extras: async () => (await h('extras')).items,
  frontmost: () => h('frontmost'),
  keyboardFocus: () => h('keyboardfocus'),
  activate: (pid) => h('activate', pid),
  fullscreen: (pid) => h('fullscreen', pid),
  pointer: () => h('pointer'),
  move: (x, y) => h('move', x, y),
  glide: (x, y, steps = 10, stepMs = 10) => h('glide', x, y, steps, stepMs),
  click: (x, y, button = 'left') => h('click', x, y, button),
  arriveAndClick: (pid, x, y, sampleMs, steps = 10, stepMs = 10) =>
    h('arrive-and-click', pid, x, y, steps, stepMs, sampleMs),
  key: (code) => h('key', code),
  cgwindows: async () => (await h('cgwindows')).windows,
  regionStats: (x, y, w, hh) => h('region-stats', x, y, w, hh),
  drag: (x1, y1, x2, y2, steps = 20, stepMs = 15, hold = false) =>
    h('drag', x1, y1, x2, y2, steps, stepMs, ...(hold ? ['hold'] : [])),
  releaseIfHeld,
  release: () => h('release'),
  leftHeld: async () => (await h('button')).left,
  scroll: (dy, kind) => h('scroll', dy, kind),
  watch: async (pid, ms, everyMs = 40) => (await h('watch', pid, ms, everyMs)).samples,
  sweep: async (pid, a, b, steps, stepMs, settleMs) =>
    (await h('sweep', pid, a.x, a.y, b.x, b.y, steps, stepMs, settleMs)).samples,
  makeMovie: (file, seconds) => h('make-movie', file, seconds),
};

// The hooks register on the test file that loads the harness (node:test root).
try {
  const { before, after, beforeEach, afterEach } = require('node:test');
  for (const hook of [before, after, beforeEach, afterEach]) hook(releaseIfHeld);
} catch { /* not under the test runner */ }
// A last resort: the process is ending with the button still down.
require('./cleanup').onCleanup(() => {
  try {
    const { execFileSync } = require('node:child_process');
    const out = JSON.parse(execFileSync(harness, ['button'], { encoding: 'utf8', timeout: 5000 }));
    if (out.left) execFileSync(harness, ['release'], { timeout: 5000 });
  } catch { /* nothing more to do */ }
});
