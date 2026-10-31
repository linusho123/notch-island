'use strict';
// The far side's reader and the pointer's driver: build/island-harness, which
// asks macOS itself (Accessibility, the screens, the frontmost app) and posts
// real pointer events. Coordinates are global and top-left based.
const { execFile, execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');
const { harness } = require('./paths');
const { assertInIdleRun } = require('./require-idle');
const cleanup = require('./cleanup');

assertInIdleRun();

const run = promisify(execFile);

async function h(...args) {
  try {
    const capture = args[0] === 'capture-check';
    const execute = capture ? require('./sandbox').runOwned : run;
    const { stdout } = await execute(harness, args.map(String), { encoding: 'utf8', maxBuffer: 64 << 20 });
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
  // macOS 27 lists its own status icons as unlabelled hosting views; the
  // labelled AXMenuExtra (identifier com.apple.menuextra.wifi and so on) sits
  // inside, in that process's windows. Each such item gets it as `label`.
  labelledExtras: async () => {
    const items = (await h('extras')).items;
    const hosts = [...new Set(items.filter((i) => i.subrole === 'AXHostingView').map((i) => i.pid))];
    const inner = [];
    for (const pid of hosts) {
      for (const win of (await h('windows', pid)).windows) {
        inner.push(...(win.elements || []).filter((e) => e.subrole === 'AXMenuExtra' && e.frame));
      }
    }
    return items.map((i) => {
      if (i.subrole !== 'AXHostingView' || !i.frame) return i;
      const e = inner.find((x) => x.frame.x >= i.frame.x - 1 && x.frame.x + x.frame.w <= i.frame.x + i.frame.w + 1);
      return e ? { ...i, label: { identifier: e.identifier, description: e.description } } : i;
    });
  },
  frontmost: () => h('frontmost'),
  keyboardFocus: () => h('keyboardfocus'),
  // A just-launched app is not yet registered with macOS for a moment.
  activate: async (pid) => {
    for (let i = 0; ; i++) {
      try {
        return await h('activate', pid);
      } catch (e) {
        if (i >= 20 || !/no such app/.test(e.message)) throw e;
        await new Promise((r) => setTimeout(r, 250));
      }
    }
  },
  fullscreen: (pid) => h('fullscreen', pid),
  pointer: () => h('pointer'),
  move: (x, y) => h('move', x, y),
  glide: (x, y, steps = 10, stepMs = 10) => h('glide', x, y, steps, stepMs),
  click: (x, y, button = 'left') => h('click', x, y, button),
  arriveAndClick: (pid, x, y, sampleMs, steps = 10, stepMs = 10) =>
    h('arrive-and-click', pid, x, y, steps, stepMs, sampleMs),
  key: (code, ...flags) => h('key', code, ...flags),
  type: (text) => h('type', text),
  pasteboardSet: (pbName, type, val) => h('pasteboard-set', pbName, type, val),
  paste: async (text) => {
    const snapshotPath = process.env.NOTCH_ISLAND_CLIPBOARD_SNAPSHOT
      || path.join(os.tmpdir(), `notch-island-clipboard-${process.pid}.json`);
    const saved = await module.exports.pasteboardSave();
    const journal = {
      version: 1,
      pid: process.pid,
      createdAt: Date.now(),
      saved,
      text,
      expectedChangeCount: null,
      state: 'saved',
    };
    fs.writeFileSync(snapshotPath, JSON.stringify(journal));

    function isHarnessText(current, targetText) {
      if (!current || targetText == null) return false;
      if (typeof current.rawText === 'string') return current.rawText === targetText;
      if (Array.isArray(current.items)) {
        for (const it of current.items) {
          const b64 = it['public.utf8-plain-text'];
          if (b64) {
            try {
              if (Buffer.from(b64, 'base64').toString('utf8') === targetText) return true;
            } catch {}
          }
        }
      }
      return false;
    }

    let restored = false;
    const performRestoreSync = () => {
      if (restored) return;
      restored = true;
      try {
        if (!fs.existsSync(snapshotPath)) return;
        const record = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
        let shouldRestore = false;
        let current = null;
        if (typeof module.exports.pasteboardSaveSync === 'function') {
          try { current = module.exports.pasteboardSaveSync(); } catch {}
        }
        if (record.expectedChangeCount != null) {
          if (current && typeof current.changeCount === 'number') {
            shouldRestore = (current.changeCount === record.expectedChangeCount);
          } else {
            shouldRestore = true;
          }
        } else if (record.state === 'set' || isHarnessText(current, record.text)) {
          shouldRestore = true;
        }

        if (shouldRestore) {
          if (typeof module.exports.pasteboardRestoreSync === 'function') {
            module.exports.pasteboardRestoreSync(record.saved);
          } else if (typeof module.exports.pasteboardRestore === 'function') {
            module.exports.pasteboardRestore(record.saved);
          }
        }
        fs.rmSync(snapshotPath, { force: true });
      } catch (err) {
        try {
          fs.writeFileSync(`${snapshotPath}.recovery`, JSON.stringify({
            error: err.message,
            time: Date.now(),
            journal,
          }));
        } catch {}
      }
    };

    const unregister = cleanup.onCleanup(performRestoreSync);

    try {
      const setRes = await module.exports.pasteboardSet('general', 'public.utf8-plain-text', text);
      journal.state = 'set';
      if (setRes && typeof setRes.changeCount === 'number') {
        journal.expectedChangeCount = setRes.changeCount;
      }
      fs.writeFileSync(snapshotPath, JSON.stringify(journal));

      await module.exports.key(9, 'cmd');
      await new Promise((r) => setTimeout(r, 200));
    } finally {
      if (!restored) {
        restored = true;
        try {
          if (fs.existsSync(snapshotPath)) {
            const record = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
            let shouldRestore = false;
            let current = null;
            if (typeof module.exports.pasteboardSave === 'function') {
              try { current = await module.exports.pasteboardSave(); } catch {}
            }
            if (record.expectedChangeCount != null) {
              if (current && typeof current.changeCount === 'number') {
                shouldRestore = (current.changeCount === record.expectedChangeCount);
              } else {
                shouldRestore = true;
              }
            } else if (record.state === 'set' || isHarnessText(current, record.text)) {
              shouldRestore = true;
            }

            if (shouldRestore) {
              await module.exports.pasteboardRestore(record.saved);
            }
            fs.rmSync(snapshotPath, { force: true });
          }
        } catch (err) {
          try {
            fs.writeFileSync(`${snapshotPath}.recovery`, JSON.stringify({
              error: err.message,
              time: Date.now(),
              journal,
            }));
          } catch {}
          throw err;
        } finally {
          if (typeof unregister === 'function') unregister();
        }
      }
    }
  },
  cgwindows: async () => (await h('cgwindows')).windows,
  regionStats: (x, y, w, hh) => h('region-stats', x, y, w, hh),
  drag: (x1, y1, x2, y2, steps = 20, stepMs = 15, hold = false) =>
    h('drag', x1, y1, x2, y2, steps, stepMs, ...(hold ? ['hold'] : [])),
  dragObject: (type, payload, x1, y1, x2, y2, hold = false) =>
    h('drag-object', type, payload, x1, y1, x2, y2, ...(hold ? ['hold'] : [])),
  startDragObject: (type, payload, x1, y1, x2, y2) => {
    return new Promise((resolve, reject) => {
      const child = spawn(harness, ['drag-object', type, payload, String(x1), String(y1), String(x2), String(y2), 'hold'], {
        stdio: ['pipe', 'pipe', 'inherit'],
        env: { ...process.env, NOTCH_ISLAND_OWNER_PID: String(process.pid) },
      });
      let out = '';
      child.stdout.on('data', (d) => {
        out += d.toString('utf8');
        if (out.includes('\n')) {
          try {
            const parsed = JSON.parse(out.trim());
            resolve({
              child,
              pid: parsed.pid,
              release: async () => {
                if (child.stdin.writable) {
                  child.stdin.write('release\n');
                }
                await new Promise((r) => child.on('exit', r));
              },
            });
          } catch (e) {
            reject(e);
          }
        }
      });
      child.on('error', reject);
    });
  },
  releaseIfHeld,
  release: () => h('release'),
  leftHeld: async () => (await h('button')).left,
  scroll: (dy, kind, dx = 0) => (dx ? h('scroll', dy, kind, dx) : h('scroll', dy, kind)),
  watch: async (pid, ms, everyMs = 40) => (await h('watch', pid, ms, everyMs)).samples,
  sweep: async (pid, a, b, steps, stepMs, settleMs) =>
    (await h('sweep', pid, a.x, a.y, b.x, b.y, steps, stepMs, settleMs)).samples,
  makeMovie: (file, seconds) => h('make-movie', file, seconds),
  pasteboardSave: (name) => h('pasteboard-save', ...(name ? [name] : [])),
  pasteboardSaveSync: (name) => {
    const args = ['pasteboard-save', ...(name ? [name] : [])];
    return JSON.parse(execFileSync(harness, args, { encoding: 'utf8', timeout: 5000 }));
  },
  pasteboardRestore: async (saved, name) => {
    let payload = saved;
    let tmpFile = null;
    if (typeof saved === 'object') {
      tmpFile = path.join(os.tmpdir(), `pb-save-${process.pid}-${Date.now()}.json`);
      fs.writeFileSync(tmpFile, JSON.stringify(saved));
      payload = tmpFile;
    }
    try {
      return await h('pasteboard-restore', payload, ...(name ? [name] : []));
    } finally {
      if (tmpFile) {
        try { fs.rmSync(tmpFile, { force: true }); } catch {}
      }
    }
  },
  pasteboardRestoreSync: (saved, name) => {
    let payload = saved;
    let tmpFile = null;
    if (typeof saved === 'object') {
      tmpFile = path.join(os.tmpdir(), `pb-sync-${process.pid}-${Date.now()}.json`);
      fs.writeFileSync(tmpFile, JSON.stringify(saved));
      payload = tmpFile;
    }
    try {
      const args = ['pasteboard-restore', payload, ...(name ? [name] : [])];
      return JSON.parse(execFileSync(harness, args, { encoding: 'utf8', timeout: 5000 }));
    } finally {
      if (tmpFile) {
        try { fs.rmSync(tmpFile, { force: true }); } catch {}
      }
    }
  },
  /**
   * The island's window frames sampled every `everyMs` for `ms`, from
   * Accessibility and the window server; options: `below` (the strip's
   * bottom), `start` ('open' | 'close'), `looks` (ms after the start for a
   * full look), `hits` (points macOS's own hit test is asked about).
   */
  motionWatch: (pid, ms, everyMs, { below, start, looks, hits } = {}) => h('motion-watch', pid, ms, everyMs,
    ...(below !== undefined ? [`below=${below}`] : []),
    ...(start ? [`start=${start}`] : []),
    ...(looks ? [`looks=${looks.join(',')}`] : []),
    ...(hits ? [`hits=${hits.map((p) => `${p.x}:${p.y}`).join(',')}`] : [])),
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
