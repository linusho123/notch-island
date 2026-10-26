'use strict';
// The island's shape and motion, read from the far side (D136-D140): its
// window frames as Accessibility and the window server give them, sampled
// fast by the harness while it moves, against the menu bar items' own
// frames and macOS's own hit test. Nothing here reads the test input.
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
let harness;
function getHarness() {
  if (!harness) harness = require('./harness');
  return harness;
}
const procs = require('./procs');
const { harness: harnessBinary } = require('./paths');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The built-in screen's notch and the bottom of its menu bar strip (top-left based). */
async function geometry() {
  const b = await getHarness().builtIn();
  const n = b.notch;
  return { notch: n, screen: b.frame, stripBottom: b.frame.y + Math.max(n.h, b.menuBarHeight || 0) };
}

/** Frames of one sample: every island window both sources list. */
const framesOf = (s) => [...(s.ax || []), ...(s.cg || [])];

/**
 * The parts of the island in one sample's Accessibility frames (D140): the
 * plain notch's window over the camera housing, the card's window below the
 * menu bar strip, and the new-song wing's in the strip left of the notch.
 */
function parts(frames, g) {
  const { notch: n, stripBottom } = g;
  const notchPart = frames.find((f) => Math.abs(f.x - n.x) <= 1 && Math.abs(f.y - n.y) <= 1 && f.w <= n.w + 1) || null;
  const card = frames.find((f) => f !== notchPart && f.y >= stripBottom - 1) || null;
  const wing = frames.find((f) => f !== notchPart && f.x < n.x - 0.5 && f.y < stripBottom - 0.5) || null;
  return { notchPart, card, wing };
}

/** Whether a frame lies (partly) inside the menu bar strip. */
const inStrip = (f, g) => f.y < g.stripBottom - 0.5 && f.y + f.h > g.screen.y + 0.5;

const overlaps = (a, b, slack = 0.5) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > slack
  && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > slack;

const center = (f) => ({ x: f.x + f.w / 2, y: f.y + f.h / 2 });

/** Watch the island's frames while `act` runs (started together). */
async function watchWhile(pid, ms, opts, act) {
  const g = await geometry();
  const watching = getHarness().motionWatch(pid, ms, 8, { below: g.stripBottom, ...opts });
  await sleep(60); // the watcher is up before the pointer moves
  const acted = await act();
  const result = await watching;
  return { ...result, acted, g };
}

/** The sample nearest a moment, and how far from it. */
function nearest(samples, t) {
  let best = null;
  for (const s of samples) if (!best || Math.abs(s.t - t) < Math.abs(best.t - t)) best = s;
  return best;
}

/**
 * A status item of the harness's own, right of the notch where macOS puts a
 * new one: it counts its clicks. Returns its frame, from Accessibility.
 */
async function statusStandIn(world, title = 'NI') {
  // Asked for just right of the notch, where a panel wider than it would reach.
  const { notch: n, screen } = await geometry();
  const fromRight = screen.x + screen.w - (n.x + n.w + 6);
  const child = spawn(harnessBinary, ['status-stand-in', '900', title, String(fromRight)], {
    stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, NOTCH_ISLAND_OWNER_PID: String(process.pid) },
  });
  const lines = [];
  let buffer = '';
  child.stdout.on('data', (d) => {
    buffer += d;
    let i;
    while ((i = buffer.indexOf('\n')) >= 0) {
      try { lines.push(JSON.parse(buffer.slice(0, i))); } catch { /* not a line of ours */ }
      buffer = buffer.slice(i + 1);
    }
  });
  const handle = procs.adopt('status stand-in', child.pid);
  world.defer(() => procs.stop(handle));
  const end = Date.now() + 10000;
  let item = null;
  while (!item) {
    if (Date.now() > end) throw new Error('the status stand-in never showed in the menu bar');
    await sleep(150);
    item = (await getHarness().extras()).find((i) => i.pid === child.pid && i.frame && i.frame.w > 0) || null;
  }
  return { handle, frame: item.frame, clicks: () => lines.filter((l) => l.clicked).length };
}

/**
 * Asserts the status item is to the right of the notch.
 * A collision with Meter's width fails as plain environment (S4 carried).
 */
function assertStatusItemRightOfNotch(f, n) {
  assert.ok(f.x >= n.x + n.w - 0.5,
    `environment: the status item (x ${f.x}) is not right of the notch: Meter is too wide for this screen geometry (S4 carried)`);
}

module.exports = { geometry, framesOf, parts, inStrip, overlaps, center, watchWhile, nearest, statusStandIn, assertStatusItemRightOfNotch };
