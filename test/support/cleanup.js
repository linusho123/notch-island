'use strict';
// Clean-ups the harness owes the visionary's Mac (unregister the test build's
// login item, stop spawned processes, put Music's shuffle and repeat back).
// Node skips 'exit' handlers on SIGINT, SIGTERM and SIGHUP, so those signals
// run the same clean-ups here and then exit non-zero. Clean-ups are
// synchronous and run once, last registered first.
const cleanups = [];
let ran = false;
let installed = false;

function runAll() {
  if (ran) return;
  ran = true;
  for (const fn of cleanups.reverse()) {
    try { fn(); } catch { /* keep cleaning */ }
  }
}

const SIGNALS = { SIGINT: 2, SIGTERM: 15, SIGHUP: 1 };

function install() {
  if (installed) return;
  installed = true;
  process.on('exit', runAll);
  for (const [name, number] of Object.entries(SIGNALS)) {
    process.on(name, () => {
      runAll();
      process.exit(128 + number);
    });
  }
}

/** Register a synchronous clean-up for normal exit and for SIGINT/SIGTERM/SIGHUP. */
function onCleanup(fn) {
  install();
  cleanups.push(fn);
}

module.exports = { onCleanup };
