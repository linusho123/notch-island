'use strict';
// Scenes more than one feature's steps set up the same way: the island
// started, the pointer away, the island closed to the plain notch, IINA
// playing a movie fullscreen. Givens only: nothing here is a Then.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const harness = require('./harness');
const island = require('./island');
const procs = require('./procs');
const { osa } = require('./music');
const { root } = require('./paths');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * How long a Given waits for the closed island to be the plain notch: a
 * new song the Given itself started pops the wing for four seconds (D115).
 */
const PLAIN_NOTCH_MS = 7000;

async function notch() {
  return (await harness.builtIn()).notch;
}

/** A spot well away from the island, below the open panel. */
async function away() {
  const n = await notch();
  return { x: n.x + n.w / 2, y: 420 };
}

async function pointerAway() {
  const a = await away();
  await harness.move(a.x, a.y);
}

async function ensureIsland(w) {
  if (!w.island || w.island.exited) await island.launch(w);
  return w.island.pid;
}

async function plainNotch(w, ms = PLAIN_NOTCH_MS) {
  const pid = await ensureIsland(w);
  await pointerAway();
  const n = await notch();
  await island.waitFor(pid, (v) => island.isPlainNotch(v, n), ms,
    'the island is not closed to the plain notch');
}

/** IINA plays a silent stand-in movie fullscreen; the menu bar strip is black. */
async function iinaFullscreen(w) {
  await ensureIsland(w);
  const running = (await osa('tell application "System Events" to get name of every process whose bundle identifier is "com.colliderli.iina"')).trim();
  assert.equal(running, '', 'IINA is already running; quit it before the tests so they never touch it');
  const media = path.join(root, 'build', 'test-media');
  fs.mkdirSync(media, { recursive: true });
  const movie = path.join(media, 'test-movie.mov');
  if (!fs.existsSync(movie)) await harness.makeMovie(movie, 180);
  const iina = procs.start('IINA', '/Applications/IINA.app/Contents/MacOS/IINA', [movie]);
  w.defer(() => procs.stop(iina));
  w.iinaFullscreen = iina;
  await island.until(async () => (await harness.windows(iina.pid).catch(() => [])).some((x) => x.frame && x.frame.w > 300),
    15000, 'IINA never showed the movie');
  await harness.activate(iina.pid);
  await sleep(500);
  await harness.fullscreen(iina.pid);
  await island.until(async () => (await harness.windows(iina.pid)).some((x) => x.fullScreen), 10000,
    'IINA did not go fullscreen');
  await pointerAway();
  await sleep(1500); // the space animation
  await assertStripBlack('the menu bar shows');
}

/**
 * A real screenshot of the menu bar strip either side of the notch: black,
 * with no app menu drawn there. (macOS's own screen-capture indicator may
 * light a dot on the right while the shot is taken, so the right side is
 * held to its mean.)
 */
async function assertStripBlack(what) {
  const { notch: n, frame } = await harness.builtIn();
  const left = await harness.regionStats(frame.x, 0, n.x - frame.x, n.h);
  const right = await harness.regionStats(n.x + n.w, 0, frame.x + frame.w - n.x - n.w, n.h);
  assert.ok(left.max < 0.12 && right.mean < 0.06,
    `the menu bar strip is not black (brightest ${left.max.toFixed(2)} left, mean ${right.mean.toFixed(2)} right): ${what}`);
}

module.exports = { PLAIN_NOTCH_MS, notch, away, pointerAway, ensureIsland, plainNotch, iinaFullscreen, assertStripBlack };
