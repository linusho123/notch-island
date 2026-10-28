'use strict';
// Read-only: usable before importing any UI helper (including its keepers).
const { execFileSync } = require('node:child_process');
const { harness } = require('./paths');

const overlaps = (a, b) => a && b && a.x < b.x + b.w && b.x < a.x + a.w
  && a.y < b.y + b.h && b.y < a.y + a.h;

function foreignOverNotch(windows, notch, screen) {
  const systemLayer = (w) => screen && ['x', 'y', 'w', 'h'].every((k) => w.frame?.[k] === screen[k])
    && ((w.owner === 'Dock' && w.layer === 20) || (w.owner === 'Notification Center' && w.layer === 21));
  // Normal menu-bar windows are the reference itself. Layers above that are
  // foreign; so are floating system popovers below the menu-bar layer. The
  // camera housing's own island is reported separately as a launch blocker.
  return windows.filter((w) => !systemLayer(w) && w.layer > 0 && w.owner !== 'Window Server'
    && w.owner !== 'notch-island' && overlaps(w.frame, notch));
}

function preflight() {
  require('./fixture-preflight').assertFixtureSession({ allowInstalled: true });
  const read = (...args) => JSON.parse(execFileSync(harness, args, { encoding: 'utf8' }));
  const { builtIn } = read('screen');
  if (!builtIn?.notch) throw new Error('BLOCKED: no built-in notch');
  const windows = read('cgwindows').windows;
  const foreign = foreignOverNotch(windows, builtIn.notch, builtIn.frame);
  if (foreign.length) {
    const details = foreign.map((w) => `${w.owner}, pid ${w.pid}, ${JSON.stringify(w.frame)}`).join('; ');
    throw new Error(`BLOCKED: foreign window over the notch (${details})`);
  }
  const { listIslands } = require('./island-procs');
  require('./installed-island').pauseInstalled();
  const pids = listIslands();
  if (pids.length) throw new Error(`BLOCKED: an island is already running (${pids.join(', ')}); V2a never quits the installed app`);
  return builtIn;
}

module.exports = { preflight, foreignOverNotch };
