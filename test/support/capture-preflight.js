'use strict';
// Read-only: usable before importing any UI helper (including its keepers).
const { execFileSync } = require('node:child_process');
const { harness } = require('./paths');

const overlaps = (a, b) => a && b && a.x < b.x + b.w && b.x < a.x + a.w
  && a.y < b.y + b.h && b.y < a.y + a.h;

function ruledSystemLayer(w, screen) {
  return screen && ['x', 'y', 'w', 'h'].every((k) => w.frame?.[k] === screen[k])
    && ((w.owner === 'Dock' && w.layer === 20) || (w.owner === 'Notification Center' && w.layer === 21));
}

function foreignOverNotch(windows, notch, screen) {
  // Normal menu-bar windows are the reference itself. Layers above that are
  // foreign; so are floating system popovers below the menu-bar layer. The
  // camera housing's own island is reported separately as a launch blocker.
  return windows.filter((w) => !ruledSystemLayer(w, screen) && w.layer > 0 && w.owner !== 'Window Server'
    && w.owner !== 'notch-island' && overlaps(w.frame, notch));
}

const CLOSE_LOGIN_BANNERS = `tell application "System Events" to tell process "NotificationCenter"
  if (count windows) is 0 then return 0
  set closed to 0
  set lvl to {UI element 1 of window 1}
  repeat 6 times
    set nxt to {}
    repeat with e in lvl
      try
        repeat with k in (UI elements of e)
          if (subrole of k as text) is "AXNotificationCenterAlert" then
            set t to (value of static texts of k) as text
            if t contains "Login Item Added" and t contains "NotchIsland" then
              repeat with act in (actions of k)
                if name of act starts with "Name:Close" then
                  perform act
                  set closed to closed + 1
                  exit repeat
                end if
              end repeat
            end if
          else
            set end of nxt to k
          end if
        end repeat
      end try
    end repeat
    set lvl to nxt
  end repeat
  return closed
end tell`;

function closeOwnLoginBanners() {
  try {
    execFileSync('osascript', ['-e', CLOSE_LOGIN_BANNERS], { encoding: 'utf8', timeout: 15000 });
  } catch {}
}

function preflight() {
  require('./fixture-preflight').assertFixtureSession({ allowInstalled: true });
  const read = (...args) => JSON.parse(execFileSync(harness, args, { encoding: 'utf8' }));
  const { builtIn } = read('screen');
  if (!builtIn?.notch) throw new Error('BLOCKED: no built-in notch');
  // A Notification Center banner lifts its full-screen host above the ruled
  // layer. macOS's "Login Item Added" for NotchIsland stays until closed, and
  // the suite itself causes it (each test island registers to start at
  // login; cleanup unregisters it), so that one is closed; any other banner
  // is waited out, up to 15 s, before it blocks.
  let foreign = foreignOverNotch(read('cgwindows').windows, builtIn.notch, builtIn.frame);
  if (foreign.length && foreign.every((w) => w.owner === 'Notification Center')) closeOwnLoginBanners();
  for (let waited = 0; foreign.length && waited < 15000 && foreign.every((w) => w.owner === 'Notification Center'); waited += 500) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
    foreign = foreignOverNotch(read('cgwindows').windows, builtIn.notch, builtIn.frame);
  }
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

module.exports = { preflight, foreignOverNotch, ruledSystemLayer };
