'use strict';
// The island under test: the test build, started the way the login item
// starts it (its own executable), with the test input pointing it at the
// scenario's scratch folder. What it shows is read only from the far side:
// the Accessibility tree macOS keeps of its windows.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const procs = require('./procs');
const { onCleanup } = require('./cleanup');
const harness = require('./harness');
const { scratch } = require('./sandbox');
const { testBinary } = require('./paths');
const { pauseInstalled } = require('./installed-island');
const { listIslands } = require('./island-procs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function inputFile(world) {
  return path.join(scratch(world), 'test-input.json');
}

/** Givens only: write the test input the island reads (never read by a Then). */
function feed(world, patch) {
  const file = inputFile(world);
  const current = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  fs.writeFileSync(file, JSON.stringify({ ...current, ...patch }));
}

/** Every running island process, test build or not (the Chrome host is not one). */
const runningIslands = () => listIslands();

// The test build registers itself to start at login, as the real island
// does. When the test process ends, the test build unregisters itself again,
// so the visionary's next login never starts a test build.
let cleanupArmed = false;
function armLoginCleanup() {
  if (cleanupArmed) return;
  cleanupArmed = true;
  onCleanup(() => {
    spawnSync(testBinary, ['--test-unregister-login-and-exit'], { timeout: 20000, stdio: 'ignore' });
  });
}

let sockets = 0;

/** Start the island (a binary given, or the test build) and wait for it. */
async function launch(world, binary = testBinary) {
  armLoginCleanup();
  // The visionary's installed island steps aside for the run and comes back
  // when it ends (installed-island.js).
  pauseInstalled();
  if (runningIslands().length) {
    throw new Error(`another island is already running (pid ${runningIslands().join(', ')}); quit it before the tests`);
  }
  // Start with the pointer away from the notch, as it is at a login.
  const { notch } = await harness.builtIn();
  await harness.move(notch.x + notch.w / 2, 420);
  const data = path.join(scratch(world), 'island-data');
  fs.mkdirSync(data, { recursive: true });
  const screenshotDir = path.join(scratch(world), 'Desktop');
  fs.mkdirSync(screenshotDir, { recursive: true });
  // The island's socket for its Chrome host: a short path (a socket path is
  // limited to 104 bytes), removed with the scenario.
  const sock = `/tmp/notch-island-${process.pid}-${++sockets}.sock`;
  world.defer(() => fs.rmSync(sock, { force: true }));
  feed(world, { dataDirectory: data, chromeSocket: sock, screenshotDirectory: screenshotDir });
  const log = fs.openSync(path.join(scratch(world), 'island.log'), 'a');
  const handle = procs.start('notch-island', binary, [], {
    env: { ...process.env, NOTCH_ISLAND_TEST_INPUT: inputFile(world) },
    stdio: ['ignore', log, log],
  });
  // ISLAND_LOG=1 prints the island's own log after each scenario.
  if (process.env.ISLAND_LOG) {
    world.defer(() => process.stderr.write(fs.readFileSync(path.join(scratch(world), 'island.log'), 'utf8')));
  }
  world.island = handle;
  world.defer(() => procs.stop(handle));
  await until(async () => (await harness.windows(handle.pid)).length > 0, 10000,
    'the island never showed a window');
  await sleep(300); // its first read of Music
  return handle;
}

function inside(frame, outer, slack = 1) {
  const cx = frame.x + frame.w / 2;
  const cy = frame.y + frame.h / 2;
  return cx >= outer.x - slack && cx <= outer.x + outer.w + slack
    && cy >= outer.y - slack && cy <= outer.y + outer.h + slack;
}

/**
 * What the island shows now, from Accessibility: its window frames, the open
 * panel's frame, which page is up, and the texts and buttons drawn on it.
 */
function parse(windows, notch) {
  const frames = windows.map((w) => w.frame).filter(Boolean);
  // The island is drawn in two windows (D140): the plain notch, over the
  // camera housing, and the card below the menu bar strip, apart from it.
  // The open panel is the card.
  const notchPart = frames.find((f) => Math.abs(f.x - notch.x) <= 1 && Math.abs(f.y - notch.y) <= 1
    && f.w <= notch.w + 1) || null;
  const card = frames.find((f) => f !== notchPart && f.y >= notch.y + notch.h - 1 && f.w >= notch.w - 1) || null;
  const panel = card;
  const all = windows.flatMap((w) => w.elements || []);
  const visible = (e) => e.frame && frames.some((f) => inside(e.frame, f));
  const groups = all.filter((e) => e.role === 'AXGroup' && e.description);
  const pageOf = (name) => groups.find((g) => g.description === name) || null;
  const music = pageOf('Music page');
  const shelf = pageOf('Shelf page');
  let page = null;
  if (panel && music && inside(music.frame, panel)) page = 'music';
  else if (panel && shelf && inside(shelf.frame, panel)) page = 'shelf';
  const labelled = (name) => all.find((e) => e.description === name && visible(e)) || null;
  // The new-song wing: a window of the island's that lies in the menu bar
  // strip and ends at the notch's left edge, with what is drawn in it.
  const wingWindow = windows.find((w) => w.frame && w.frame.x < notch.x - 1
    && w.frame.x + w.frame.w <= notch.x + 1 && w.frame.y >= notch.y - 1
    && w.frame.y + w.frame.h <= notch.y + notch.h + 1) || null;
  let wing = null;
  if (wingWindow) {
    const own = (wingWindow.elements || []).filter((e) => e.frame && inside(e.frame, wingWindow.frame));
    const title = own.find((e) => e.identifier === 'wing-title') || null;
    const art = own.find((e) => e.identifier === 'wing-art') || null;
    wing = {
      frame: wingWindow.frame,
      title: title ? String(title.value ?? '') : null,
      titleFrame: title && title.frame,
      art: art && { label: art.description, frame: art.frame },
      // Everything drawn in the wing that is neither the art nor the title.
      others: own.filter((e) => e !== title && e !== art && e.role !== 'AXWindow' && e.role !== 'AXGroup'),
    };
  }
  return {
    wing,
    frames,
    notchPart,
    card,
    panel,
    open: Boolean(panel),
    page,
    musicFrame: music && music.frame,
    shelfFrame: shelf && shelf.frame,
    texts: all.filter((e) => e.role === 'AXStaticText' && visible(e)).map((e) => String(e.value ?? '')),
    textElements: all.filter((e) => e.role === 'AXStaticText' && visible(e)),
    buttons: all.filter((e) => e.role === 'AXButton' && visible(e))
      .map((e) => ({ label: e.description, enabled: e.enabled !== false, frame: e.frame })),
    dot: labelled('Progress dot'),
    bar: labelled('Progress bar'),
    art: labelled('Cover art') || labelled('Music note'),
    // The card's own parts, by the identifiers the island gives them.
    title: all.find((e) => e.identifier === 'song-title' && visible(e)) || null,
    sourceLine: all.find((e) => e.identifier === 'source-line' && visible(e)) || null,
    count: all.find((e) => e.identifier === 'flip-count' && visible(e)) || null,
    elements: all,
  };
}

async function look(pid) {
  const { notch } = await harness.builtIn();
  return parse(await harness.windows(pid), notch);
}

/** The closed island draws nothing beyond the camera housing itself. */
function isPlainNotch(view, notch) {
  return !view.open
    && view.frames.every((f) => f.x >= notch.x - 1 && f.y >= notch.y - 1
      && f.x + f.w <= notch.x + notch.w + 1 && f.y + f.h <= notch.y + notch.h + 1)
    && view.texts.length === 0 && view.buttons.length === 0;
}

async function until(pred, ms, message) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await pred();
    if (v) return v;
    if (Date.now() > end) throw new Error(message);
    await sleep(40);
  }
}

/** Poll the island until `pred(view)` holds; returns that view. */
async function waitFor(pid, pred, ms, message) {
  let last;
  try {
    return await until(async () => {
      last = await look(pid);
      return pred(last) ? last : null;
    }, ms, message);
  } catch (e) {
    e.message += `\n  island last showed: ${JSON.stringify({ open: last?.open, page: last?.page, texts: last?.texts, buttons: last?.buttons?.map((b) => `${b.label}${b.enabled ? '' : '(greyed)'}`), frames: last?.frames, wing: last?.wing })}`;
    throw e;
  }
}

module.exports = { launch, feed, inputFile, look, parse, waitFor, isPlainNotch, runningIslands, until, inside };
