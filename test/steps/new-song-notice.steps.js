'use strict';
// new-song-notice.feature (P3). Every Then reads the far side: the island's
// windows as the window server lists them and what is drawn in them through
// Accessibility; the frontmost app's menu bar items and the status icons
// through their own Accessibility frames; when a song started, from the
// playing app itself (Music's and QuickTime's AppleScript, the page's own
// media element in the test Chrome, IINA through the harness's own
// now-playing reader); the screens from macOS. The one test input here is a
// Given's exact gap width (`leftGap`), which no Then reads.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const harness = require('../support/harness');
const island = require('../support/island');
const music = require('../support/music');
const players = require('../support/players');
const procs = require('../support/procs');
const chrome = require('../support/chrome');
const standIns = require('../support/stand-ins');
const scenes = require('../support/scenes');
const paths = require('../support/paths');
const { helpers } = require('./music-panel.steps');

const { ensureIsland, playing, rest, openOnMusicPage, button, pointerAway, RULED_REST_MS } = helpers;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const JBL = { name: 'JBL Flip 5', builtIn: false };
/**
 * The island closed to the plain notch after the Given's own song started:
 * first the second in which that song's own wing may still come out, so it
 * is not taken for the When's.
 */
const plainNotch = async (w) => {
  await sleep(1200);
  await scenes.plainNotch(w);
};

// ------------------------------------------------------------ the far side

const notch = scenes.notch;
const area = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/** The island's windows as the window server itself lists them. */
async function islandWindows(w) {
  return (await harness.cgwindows()).filter((x) => x.pid === w.island.pid && x.frame);
}

/** The free gap left of the notch, from the frontmost app's own menu bar and the status icons. */
async function realGap() {
  const n = await notch();
  const { frame: screen } = await harness.builtIn();
  const front = await harness.frontmost();
  const items = (await harness.menubar(front.pid)).map((i) => i.frame).filter((f) => f && f.w > 0);
  const extras = (await harness.extras()).map((i) => i.frame).filter((f) => f && f.w > 0
    && f.y < n.y + n.h && f.y + f.h > screen.y && f.x >= screen.x && f.x < screen.x + screen.w);
  const left = [...items, ...extras].filter((f) => f.x < n.x);
  const edge = Math.max(screen.x, ...left.map((f) => f.x + f.w));
  return { gap: n.x - edge, front, items };
}

/** The wing is out: a window in the strip left of the notch, its art drawn. */
const wingOut = (v) => Boolean(v.wing && v.wing.art);

/** The wing hangs in the menu bar strip of the built-in screen, its right edge at the notch. */
async function assertWingPlaced(view) {
  const n = await notch();
  const { frame: screen } = await harness.builtIn();
  const f = view.wing.frame;
  assert.ok(Math.abs(f.x + f.w - n.x) <= 1.5, `the wing ends at x ${f.x + f.w}, not at the notch's left edge ${n.x}`);
  assert.ok(f.y >= n.y - 1 && f.y + f.h <= n.y + n.h + 1, `the wing (y ${f.y}, h ${f.h}) is not inside the menu bar strip`);
  assert.ok(f.x >= screen.x, 'the wing reaches off the built-in screen');
}

/** Look at the island until `pred` holds, or fail naming what it showed. */
const waitView = (w, pred, ms, message) => island.waitFor(w.island.pid, pred, ms, message);

/**
 * Sample the island back to back until stopped: each look is what
 * Accessibility shows at that moment, stamped with when it was taken.
 */
function sampler(w) {
  const samples = [];
  let running = true;
  const done = (async () => {
    const n = await notch();
    while (running) {
      const t0 = Date.now();
      try {
        const windows = await harness.windows(w.island.pid);
        samples.push({ t: (t0 + Date.now()) / 2, view: island.parse(windows, n) });
      } catch { /* a look that failed is no look */ }
    }
  })();
  const stop = async () => { running = false; await done; return samples; };
  w.defer(stop); // a Then that does not stop it: it ends with the scenario
  return { samples, stop };
}

// ------------------------------------------------- when a song starts, far side

/** Poll a player's own state until `pred`; the start is the read's midpoint less its position. */
async function startedPer(read, pred, ms, message) {
  const end = Date.now() + ms;
  let last;
  for (;;) {
    const t0 = Date.now();
    last = await read().catch(() => null);
    const t1 = Date.now();
    if (last && pred(last)) return { start: (t0 + t1) / 2 - 1000 * positionOf(last), state: last };
    if (t1 > end) throw new Error(`${message} (it says ${JSON.stringify(last)})`);
    await sleep(20);
  }
}

const positionOf = (s) => s.position ?? s.currentTime ?? s.elapsed ?? s.time ?? 0;

const musicStarted = (title, ms = 15000) => startedPer(music.state,
  (s) => s.state === 'playing' && s.name === title && s.position < 5, ms, `Music did not start "${title}"`);

/** Music near the end of the song it plays, so the next one starts by itself. */
async function nearEnd(lead = 1.5) {
  const s = await music.state();
  if (s.duration && s.position < s.duration - lead - 0.5) await music.seek(Math.max(0, s.duration - lead));
}

// -------------------------------------------------------- the menu bar's apps

/**
 * An app of the harness's own in front, whose menu bar shows the given
 * menus: a known, real menu bar beside the notch.
 */
async function standInInFront(w, menus) {
  if (w.standIn) await procs.stop(w.standIn);
  // Opened as the visionary opens an app (LaunchServices), so it comes to the
  // front; it prints its pid to the file `open` hands its output to.
  const out = path.join(os.tmpdir(), `notch-island-stand-in-${process.pid}-${Date.now()}.out`);
  fs.writeFileSync(out, '');
  w.defer(() => fs.rmSync(out, { force: true }));
  execFileSync('open', ['-n', '-a', paths.menuStandInApp, '--stdout', out,
    '--env', `NOTCH_ISLAND_OWNER_PID=${process.pid}`, '--args', 'menu-stand-in', '900', ...menus],
    { timeout: 20000 });
  const pid = await island.until(() => {
    const m = /"pid"\s*:\s*(\d+)/.exec(fs.readFileSync(out, 'utf8'));
    return m ? Number(m[1]) : null;
  }, 10000, 'the menu stand-in did not start');
  const handle = procs.adopt('menu stand-in', pid);
  w.defer(() => procs.stop(handle));
  w.standIn = handle;
  await island.until(async () => (await harness.menubar(handle.pid).catch(() => [])).length >= menus.length + 2,
    10000, 'the menu stand-in showed no menu bar');
  await island.until(async () => (await harness.frontmost()).pid === handle.pid, 5000,
    'the menu stand-in did not come to the front');
  await sleep(200);
  return handle;
}

/** Room for the whole of any test title: an app with one short menu in front. */
async function roomInFront(w) {
  await standInInFront(w, ['File']);
  const { gap } = await realGap();
  assert.ok(gap > 220, `with the stand-in in front the free gap is only ${gap} points`);
}

async function chromeInFront(w) {
  if (!w.chrome || w.chrome.exited) w.chrome = await chrome.launch(w);
  await harness.activate(w.chrome.pid);
  await island.until(async () => (await harness.frontmost()).pid === w.chrome.pid, 5000,
    'the test Chrome did not come to the front');
  await sleep(200);
}

// ----------------------------------------------------------------- the songs

/** Wonderwall plays and the island is closed (the wing of the Given's own songs folded). */
async function wonderwallClosed(w) {
  await ensureIsland(w);
  await playing(w, 'Wonderwall', 30);
  await plainNotch(w);
}

/**
 * Champagne Supernova starts: after Wonderwall ends when that plays, else
 * from Music's queue. The island is sampled from before the start; the start
 * is the one Music itself gives.
 */
async function champagneStarts(w) {
  const s = await music.state().catch(() => null);
  w.sampler = sampler(w);
  if (s && s.state === 'playing' && s.name === 'Wonderwall') {
    await nearEnd();
  } else {
    await music.play('Champagne Supernova');
    w.defer(() => music.pause().catch(() => {}));
  }
  const { start } = await musicStarted('Champagne Supernova');
  w.started = start;
  w.startedTitle = 'Champagne Supernova';
}

/** The wing is out for Champagne Supernova (with room for its whole title). */
async function wingOutForChampagne(w) {
  await roomInFront(w);
  await wonderwallClosed(w);
  await champagneStarts(w);
  await w.sampler.stop();
  await waitView(w, (v) => wingOut(v) && v.wing.title === 'Champagne Supernova', 1500,
    'the wing is not out for "Champagne Supernova"');
}

// ------------------------------------------------------------- the sources

const SOURCE_RE = '(Apple Music|Apple Music out through "JBL Flip 5"|a youtube\\.com playlist in Chrome|a soundcloud\\.com tab in Chrome|IINA|QuickTime Player|Music)';

/** IINA's two parts, alone in their own folder, so IINA plays on into the second. */
async function iinaParts() {
  const dir = path.join(players.MEDIA, 'iina-parts');
  fs.mkdirSync(dir, { recursive: true });
  const parts = [['part-1.mkv', 30], ['part-2.mkv', 120]];
  for (const [name, seconds] of parts) {
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) {
      const tmp = path.join(players.MEDIA, `.making-${process.pid}-${name}.mov`);
      await harness.h('make-movie', tmp, seconds, 'sound');
      fs.renameSync(tmp, file);
    }
  }
  return parts.map(([name, seconds]) => ({ file: path.join(dir, name), seconds }));
}

const SOURCES = {
  'Apple Music': {
    async given(w, first) {
      assert.equal(first, 'Wonderwall');
      await roomInFront(w);
      await wonderwallClosed(w);
    },
    async when(w, second) {
      assert.equal(second, 'Champagne Supernova');
      await champagneStarts(w);
    },
  },
  'Apple Music out through "JBL Flip 5"': {
    async given(w, first) {
      await ensureIsland(w);
      island.feed(w, { outputDevice: JBL }); // test input (Q2)
      await SOURCES['Apple Music'].given(w, first);
    },
    when: (w, second) => SOURCES['Apple Music'].when(w, second),
  },
  'a youtube.com playlist in Chrome': {
    async given(w, first) {
      assert.equal(first, 'Lecture 4: Fourier Series');
      await ensureIsland(w);
      await music.pause().catch(() => {});
      const browser = await chrome.companion(w);
      w.tab = await browser.open(standIns.urls.watch('lecture-4', 'PL-lectures'));
      await w.tab.waitMedia((m) => !m.paused && !m.muted && m.title.startsWith(first), 20000,
        `the test Chrome does not play ${first}`);
      await roomInFront(w);
      await plainNotch(w);
    },
    async when(w, second) {
      w.sampler = sampler(w);
      await w.tab.eval("(() => { const m = document.querySelector('video'); m.currentTime = m.duration - 1.5; })()");
      const { start } = await startedPer(() => w.tab.media(),
        (m) => m.title.startsWith(second) && !m.paused && m.currentTime < 5, 20000,
        `the playlist did not go on to "${second}"`);
      w.started = start;
    },
  },
  'a soundcloud.com tab in Chrome': {
    async given(w, first) {
      assert.equal(first, 'late night mix');
      await ensureIsland(w);
      await music.pause().catch(() => {});
      w.tab = await chrome.playInTab(w, first, 0);
      await roomInFront(w);
      await plainNotch(w);
    },
    async when(w, second) {
      w.sampler = sampler(w);
      await w.tab.eval("(() => { const m = document.querySelector('audio'); m.currentTime = m.duration - 1.5; })()");
      const { start } = await startedPer(() => w.tab.media(),
        (m) => m.title.startsWith(second) && !m.paused && m.currentTime < 5, 20000,
        `the tab did not go on to "${second}"`);
      w.started = start;
    },
  },
  IINA: {
    async given(w, first) {
      await ensureIsland(w);
      await music.pause().catch(() => {});
      const [one] = await iinaParts();
      assert.equal(path.basename(one.file), first);
      // From twenty seconds before its end: it plays on into the second part
      // after the rest of the Given.
      await players.playInIINA(w, one.file, one.seconds - 20);
      await roomInFront(w);
      await plainNotch(w);
    },
    async when(w, second) {
      w.sampler = sampler(w);
      const { start } = await startedPer(players.nowPlaying,
        (np) => np.bundleID === players.IINA_ID && np.title === second && np.playing && np.elapsed < 5, 30000,
        `IINA did not go on to "${second}"`);
      w.started = start;
    },
  },
  'QuickTime Player': {
    async given(w, first) {
      await ensureIsland(w);
      await music.pause().catch(() => {});
      await players.playInQuickTime(w, await players.movie(first, 120), 20);
      await plainNotch(w);
    },
    async when(w, second) {
      w.sampler = sampler(w);
      const file = await players.movie(second, 120);
      await players.playInQuickTime(w, file, 0);
      const { start } = await startedPer(players.quickTimeState,
        (q) => q.name === second && q.playing && q.time < 5, 10000, `QuickTime Player did not play "${second}"`);
      w.started = start;
    },
  },
  Music: {
    async given(w, first) {
      await ensureIsland(w);
      await music.pause().catch(() => {});
      await players.playFileInMusic(w, fileFor(first));
      await plainNotch(w);
    },
    async when(w, second) {
      w.sampler = sampler(w);
      const file = fileFor(second);
      const base = path.basename(file);
      // Music's own playhead dates the start, whenever it is read.
      await players.playFileInMusic(w, file);
      const { start } = await startedPer(async () => {
        const s = await music.state();
        return { ...s, file: path.basename(await players.musicFile()) };
      }, (s) => s.state === 'playing' && s.file === base && s.position < 5, 20000, `Music did not play "${second}"`);
      w.started = start;
    },
  },
};

function fileFor(name) {
  return name.endsWith('.mp3') ? players.mp3(name, 90) : players.wav(name, 90);
}

// ---------------------------------------------------------------- the Thens

/**
 * The wing as it was first seen out after the song started, from the
 * sampler, which keeps looking until the second after the start is over.
 */
async function firstWingAfterStart(w) {
  await sleep(Math.max(0, w.started + 1100 - Date.now()));
  const samples = await w.sampler.stop();
  return samples.find((s) => s.t >= w.started - 100 && wingOut(s.view)) || null;
}

/** The wing shows `title` as drawn: the very string, and not cut by its window. */
async function assertTitleDrawn(view, title) {
  assert.equal(view.wing.title, title, `the wing shows "${view.wing.title}", not "${title}"`);
  const tf = view.wing.titleFrame;
  const wf = view.wing.frame;
  assert.ok(tf.x >= wf.x - 0.5 && tf.x + tf.w <= wf.x + wf.w + 0.5, 'the title runs out of the wing');
  const { width } = await harness.h('text-width', 12, 'regular', title);
  assert.ok(tf.w >= width - 1, `the title is drawn ${tf.w} points wide where "${title}" needs ${width}: it is cut`);
}

async function assertNothingRightOfNotch(w) {
  const n = await notch();
  const right = n.x + n.w + 1;
  for (const f of (await islandWindows(w)).map((x) => x.frame)) {
    assert.ok(f.x + f.w <= right, `an island window reaches x ${f.x + f.w}, right of the notch (${n.x + n.w})`);
  }
  for (const win of await harness.windows(w.island.pid)) {
    for (const e of win.elements || []) {
      if (e.frame && e.frame.w > 0) {
        assert.ok(e.frame.x + e.frame.w <= right,
          `the island draws ${e.description || e.role} out to x ${e.frame.x + e.frame.w}, right of the notch`);
      }
    }
  }
}

async function assertMenusUncovered(w) {
  const n = await notch();
  const front = await harness.frontmost();
  const menus = (await harness.menubar(front.pid)).filter((i) => i.frame && i.frame.w > 0);
  const extras = (await harness.extras()).filter((i) => i.frame && i.frame.w > 0);
  assert.ok(menus.length > 0, `${front.name}'s menu bar could not be read`);
  const notchRect = { x: n.x, y: n.y, w: n.w, h: n.h };
  const shapes = (await islandWindows(w)).map((x) => x.frame).filter((f) => area(f, notchRect) < f.w * f.h - 1);
  for (const item of [...menus, ...extras]) {
    for (const f of shapes) {
      assert.ok(area(item.frame, f) < 0.5,
        `the island covers ${item.title || item.description || 'an item'} (${JSON.stringify(item.frame)}) with ${JSON.stringify(f)}`);
    }
  }
}

async function assertPlainNotchThrough(w, ms) {
  const n = await notch();
  const samples = await w.sampler.stop();
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await island.look(w.island.pid);
    samples.push({ t: Date.now(), view: v });
  }
  const after = samples.filter((s) => s.t >= w.started - 100);
  assert.ok(after.length > 10, 'too few looks at the island after the song started');
  const bad = after.find((s) => !island.isPlainNotch(s.view, n));
  assert.ok(!bad, `${Math.round(bad?.t - w.started)} ms after the song started the island showed more than the plain notch: ${JSON.stringify(bad?.view.frames)}`);
}

// ----------------------------------------------------------------- definer

module.exports = (reg) => {
  // Givens ---------------------------------------------------------------

  reg.define(/^the island is closed and Apple Music is near the end of "Wonderwall" with "Champagne Supernova" next$/, async (w) => {
    await wonderwallClosed(w);
  });

  reg.define(/^Chrome is in front, leaving 135 points free between its Help menu and the notch$/, async (w) => {
    await chromeInFront(w);
    const { gap, items } = await realGap();
    const help = items.length && (await harness.menubar(w.chrome.pid)).find((i) => i.title === 'Help');
    assert.ok(help, "Chrome's menu bar shows no Help menu");
    assert.ok(Math.abs(gap - 135) <= 0.5, `Chrome in front leaves ${gap} points free left of the notch, not 135`);
    await nearEnd(3);
  });

  reg.define(/^the island is closed and "Champagne Supernova" has just started after "Wonderwall"$/, async (w) => {
    await roomInFront(w);
    await wonderwallClosed(w);
    await champagneStarts(w);
    await w.sampler.stop();
  });

  reg.define(new RegExp(`^the island is closed and ${SOURCE_RE} is playing "([^"]+)"$`), async (w, source, first) => {
    await SOURCES[source].given(w, first);
  });

  reg.define(/^the island is closed and the wing is out for "Champagne Supernova"$/, async (w) => {
    await wingOutForChampagne(w);
  });

  reg.define(/^the wing is out for "Champagne Supernova"$/, async (w) => {
    await wingOutForChampagne(w);
  });

  reg.define(/^the island is closed and the free gap left of the notch (is wider than the cover art and the whole title|is 135 points wide, as with Chrome in front|holds the cover art but no letters of the title|is too narrow for the cover art|is full of menus up to the notch)$/, async (w, left) => {
    await ensureIsland(w);
    if (left.startsWith('is wider')) {
      await roomInFront(w);
    } else if (left.startsWith('is 135')) {
      await chromeInFront(w);
      const { gap } = await realGap();
      assert.ok(Math.abs(gap - 135) <= 0.5, `Chrome in front leaves ${gap} points free, not 135`);
    } else if (left.startsWith('holds')) {
      // An exact gap (test input): room for the art and less than one letter
      // and an ellipsis; the real menu bar in front leaves far more.
      await roomInFront(w);
      island.feed(w, { leftGap: 45 });
    } else if (left.startsWith('is too narrow')) {
      await roomInFront(w);
      island.feed(w, { leftGap: 25 });
    } else {
      // A real menu bar full of menus up to the notch.
      await standInInFront(w, Array.from({ length: 40 }, (_, i) => `Menu ${i + 1}`));
      const { gap } = await realGap();
      assert.ok(gap < 20, `the stand-in's menus leave ${gap} points free left of the notch`);
    }
    await wonderwallClosed(w);
  });

  reg.define(/^an external monitor is connected as an extended display and the visionary is working in Chrome on it$/, async (w) => {
    const { screens } = await harness.screens();
    const built = screens.find((s) => s.builtIn);
    const external = screens.find((s) => !s.builtIn);
    assert.ok(external, 'this scenario needs the external monitor (PM161Q J) connected as an extended display, '
      + `and none is: macOS lists only ${screens.map((s) => s.name).join(', ')}. Connect the monitor and run it again.`);
    assert.ok(JSON.stringify(external.frame) !== JSON.stringify(built.frame),
      'the external monitor mirrors the built-in screen; it must be an extended display');
    await ensureIsland(w);
    w.chrome = await chrome.launch(w);
    await harness.h('move-window', w.chrome.pid, external.frame.x + 80, external.frame.y + 80);
    await chromeInFront(w);
    const win = (await harness.windows(w.chrome.pid)).find((x) => x.frame && x.frame.w > 200);
    const c = { x: win.frame.x + win.frame.w / 2, y: win.frame.y + win.frame.h / 2 };
    const f = external.frame;
    assert.ok(c.x >= f.x && c.x <= f.x + f.w && c.y >= f.y && c.y <= f.y + f.h, 'the test Chrome window is not on the external monitor');
    w.external = external;
  });

  reg.define(/^the island is closed and "Wonderwall" is near its end with "Champagne Supernova" next$/, async (w) => {
    await wonderwallClosed(w);
    await nearEnd(3);
  });

  reg.define(/^IINA is playing a movie fullscreen, the menu bar is hidden and the notch area is black$/, async (w) => {
    await scenes.iinaFullscreen(w);
  });

  // Whens ----------------------------------------------------------------

  reg.define(/^"Wonderwall" ends and "Champagne Supernova" starts$/, async (w) => {
    await champagneStarts(w);
  });

  reg.define(/^"Champagne Supernova" starts$/, async (w) => {
    await champagneStarts(w);
  });

  reg.define(new RegExp(`^"([^"]+)" starts in ${SOURCE_RE}$`), async (w, second, source) => {
    // Apple Music's row and the fullscreen scenario share this step.
    w.startedTitle = second;
    await SOURCES[source].when(w, second);
  });

  reg.define(/^the visionary waits (1 second|3\.5 seconds|4\.5 seconds|1 minute) with the pointer away from the notch$/, async (w, after) => {
    await pointerAway();
    const ms = { '1 second': 1000, '3.5 seconds': 3500, '4.5 seconds': 4500, '1 minute': 60000 }[after];
    const wait = w.started + ms - Date.now();
    assert.ok(wait > 0, `the Given took until ${-wait} ms past ${after} after the song started`);
    await sleep(wait);
    w.lookAt = Date.now();
  });

  reg.define(/^(\d+) more songs start one after another, about 1 second apart$/, async (w, count) => {
    await music.osa('tell application "Music" to set song repeat to all'); // the keeper puts it back
    w.sampler = sampler(w);
    w.songs = [];
    let last = (await music.state()).name;
    for (let i = 0; i < Number(count); i++) {
      const since = w.songs.length ? Date.now() - w.songs[w.songs.length - 1].start : 1000;
      if (since < 1000) await sleep(1000 - since);
      await music.osa('tell application "Music" to next track');
      const prev = last;
      const { start, state } = await startedPer(music.state, (s) => s.state === 'playing' && s.name !== prev && s.position < 3,
        5000, 'Music did not go on to the next song');
      last = state.name;
      w.songs.push({ name: state.name, start });
    }
    await sleep(Math.max(0, w.songs[w.songs.length - 1].start + 5500 - Date.now()));
    w.samples = await w.sampler.stop();
  });

  reg.define(/^the visionary rests the pointer on the notch$/, async (w) => {
    w.restMs = RULED_REST_MS;
    await rest(w, RULED_REST_MS);
  });

  // Thens ----------------------------------------------------------------

  reg.define(/^the visionary sees the cover art and "(Champagne Su…|Champagne Supernova)" in a wing left of the notch$/, async (w, title) => {
    const view = await waitView(w, (v) => wingOut(v) && v.wing.title === title, Math.max(500, w.started + 1500 - Date.now()),
      `no wing with "${title}" by 1.5 s after the song started`);
    assert.equal(view.wing.art.label, 'Cover art', `the wing shows ${view.wing.art.label}, not the cover art`);
    await assertWingPlaced(view);
    await assertTitleDrawn(view, title);
    w.wingView = view;
  });

  reg.define(/^the visionary sees the cover art alone in a wing left of the notch, with no title$/, async (w) => {
    const view = await waitView(w, wingOut, Math.max(500, w.started + 1500 - Date.now()),
      'no wing by 1.5 s after the song started');
    assert.equal(view.wing.art.label, 'Cover art', `the wing shows ${view.wing.art.label}, not the cover art`);
    assert.equal(view.wing.title, null, `the wing shows a title, "${view.wing.title}"`);
    assert.deepEqual(view.wing.others.map((e) => e.role), [], 'the wing draws more than the art');
    await assertWingPlaced(view);
  });

  reg.define(/^the visionary sees the plain notch, with no wing and no card below it$/, async (w) => {
    await assertPlainNotchThrough(w, Math.max(0, w.started + 2500 - Date.now()));
  });

  reg.define(/^the visionary sees nothing of the island right of the notch, and no playing indicator$/, async (w) => {
    const view = w.wingView || await island.look(w.island.pid);
    assert.ok(view.wing, 'the wing is not out');
    assert.deepEqual(view.wing.others.map((e) => e.description || e.role), [],
      'the wing draws more than the cover art and the title');
    await assertNothingRightOfNotch(w);
  });

  reg.define(/^the visionary sees nothing of the island right of the notch$/, async (w) => {
    await assertNothingRightOfNotch(w);
  });

  reg.define(/^the visionary sees every app menu and status icon uncovered$/, async (w) => {
    await assertMenusUncovered(w);
  });

  reg.define(/^the visionary sees the wing still out left of the notch$/, async (w) => {
    const view = await island.look(w.island.pid);
    const late = Date.now() - w.lookAt;
    assert.ok(late < 400, `the look came ${late} ms late`);
    assert.ok(wingOut(view), `${Math.round(w.lookAt - w.started)} ms after the song started the wing is not out`);
    await assertWingPlaced(view);
  });

  reg.define(/^the visionary sees the wing folded back into the plain notch$/, async (w) => {
    const n = await notch();
    const view = await island.look(w.island.pid);
    assert.ok(island.isPlainNotch(view, n), `${Math.round(w.lookAt - w.started)} ms after the song started the island is not the plain notch: ${JSON.stringify(view.frames)}`);
  });

  reg.define(/^the visionary sees the plain notch, with no wing$/, async (w) => {
    const n = await notch();
    const view = await island.look(w.island.pid);
    assert.ok(island.isPlainNotch(view, n), `the island is not the plain notch: ${JSON.stringify(view.frames)}`);
  });

  reg.define(/^the visionary sees the wing out left of the notch within 1 second of "([^"]+)" starting$/, async (w, second) => {
    const first = await firstWingAfterStart(w);
    assert.ok(first, `the wing never came out after "${second}" started`);
    const late = first.t - w.started;
    assert.ok(late <= 1000, `the wing came out ${Math.round(late)} ms after "${second}" started`);
    const shown = first.view.wing.title;
    if (shown !== null) {
      const head = shown.replace(/…$/, '');
      assert.ok(second.startsWith(head) || second.replace(/\.[^.]+$/, '').startsWith(head),
        `the wing shows "${shown}", not "${second}"`);
    }
    await assertWingPlaced(first.view);
  });

  reg.define(/^the visionary sees the wing stay out the whole time, never folding in between$/, (w) => {
    const first = w.songs[0].start;
    const last = w.songs[w.songs.length - 1].start;
    const during = w.samples.filter((s) => s.t >= first && s.t <= last + 3500);
    assert.ok(during.length > 20, 'too few looks at the island');
    const folded = during.find((s) => !wingOut(s.view));
    assert.ok(!folded, `${Math.round(folded?.t - first)} ms after the first of the songs the wing was not out`);
  });

  reg.define(/^the visionary sees the title in the wing change with each new song$/, (w) => {
    w.songs.forEach((song, i) => {
      const until = i + 1 < w.songs.length ? w.songs[i + 1].start + 250 : song.start + 1000;
      const seen = w.samples.some((s) => s.t >= song.start && s.t <= until && s.view.wing?.title
        && song.name.startsWith(s.view.wing.title.replace(/…$/, '')));
      assert.ok(seen, `the wing never showed "${song.name}" (song ${i + 1} of ${w.songs.length})`);
    });
  });

  reg.define(/^the visionary sees the wing fold back 4 seconds after the last song started$/, async (w) => {
    const n = await notch();
    const last = w.songs[w.songs.length - 1].start;
    const out = w.samples.filter((s) => s.t >= last + 3300 && s.t <= last + 3500);
    assert.ok(out.length && out.every((s) => wingOut(s.view)), 'the wing was not out 3.5 s after the last song started');
    const after = w.samples.filter((s) => s.t >= last + 4500);
    assert.ok(after.length && after.every((s) => island.isPlainNotch(s.view, n)),
      'the wing was still out 4.5 s after the last song started');
  });

  reg.define(/^the visionary sees the island open downward into the full panel showing "Champagne Supernova"$/, async (w) => {
    const view = await openOnMusicPage(w);
    assert.ok(view.texts.includes('Champagne Supernova'), `the panel shows ${view.texts.join(', ')}`);
  });

  reg.define(/^the visionary sees the back, pause and skip buttons$/, async (w) => {
    const view = await island.look(w.island.pid);
    for (const label of ['Back', 'Pause', 'Skip']) {
      assert.ok(button(view, label).enabled, `the ${label} button is greyed`);
    }
  });

  reg.define(/^the visionary sees the wing come out left of the built-in screen's notch$/, async (w) => {
    const view = await waitView(w, wingOut, Math.max(500, w.started + 1500 - Date.now()),
      'no wing at the built-in notch by 1.5 s after the song started');
    await assertWingPlaced(view);
    w.wingView = view;
  });

  reg.define(/^the visionary sees nothing of the island on the external monitor$/, async (w) => {
    const f = w.external.frame;
    for (const x of await islandWindows(w)) {
      assert.ok(area(x.frame, f) === 0, `an island window ${JSON.stringify(x.frame)} lies on the external monitor`);
    }
    const { builtIn } = await harness.screens();
    for (const x of await islandWindows(w)) {
      const b = builtIn.frame;
      assert.ok(x.frame.x >= b.x - 1 && x.frame.x + x.frame.w <= b.x + b.w + 1, `an island window ${JSON.stringify(x.frame)} is off the built-in screen`);
    }
  });

  reg.define(/^the visionary sees the notch area stay black, with no wing beside it$/, async (w) => {
    await assertPlainNotchThrough(w, Math.max(0, w.started + 3000 - Date.now()));
    await scenes.assertStripBlack('the menu bar came back');
  });

  reg.define(/^the visionary sees the movie play on, uninterrupted$/, async (w) => {
    const iina = w.iinaFullscreen;
    const wins = await harness.windows(iina.pid);
    assert.ok(wins.some((x) => x.fullScreen), 'IINA is no longer fullscreen');
    assert.equal((await harness.frontmost()).pid, iina.pid, 'IINA is no longer in front');
    // IINA's own Playback menu offers Pause while the movie plays.
    const { items } = await harness.h('menu-items', iina.pid, 'Playback');
    const titles = items.map((i) => i.title);
    assert.ok(titles.includes('Pause'), `IINA's Playback menu offers ${titles.slice(0, 3).join(', ')}, not Pause: the movie is not playing`);
  });
};
