'use strict';
// music-panel.feature, the parts that need only Apple Music and the island
// (P1). Every Then reads the far side: what the island draws, through the
// Accessibility tree macOS keeps of its windows; what Music is really doing,
// through Music's own AppleScript dictionary; which app is in front, from the
// system; the login item, from macOS's own registry. No Then reads the test
// input the Givens feed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const harness = require('../support/harness');
const island = require('../support/island');
const music = require('../support/music');
const chrome = require('../support/chrome');
const standIns = require('../support/stand-ins');
const registry = require('../support/registry');
const players = require('../support/players');
const procs = require('../support/procs');
const scenes = require('../support/scenes');
const motion = require('../support/motion');
const { root, testBundleID } = require('../support/paths');
const { osa } = music;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mmss = (t) => {
  const [m, s] = t.split(':').map(Number);
  return m * 60 + s;
};
const center = (f) => ({ x: f.x + f.w / 2, y: f.y + f.h / 2 });
/** The open card's width (D140: a card of its own below the menu bar strip). */
const OPEN_PANEL_WIDTH = 460;
/**
 * "About 8 points below the notch" (D140). The island places the card's top
 * exactly 8 points below the notch's bottom edge; Accessibility reports a
 * window's frame in whole points, so a top off by more than a point is the
 * island's doing, not rounding.
 */
const CARD_GAP = 8;
const CARD_GAP_SLACK = 1;

// ---------------------------------------------------------------- helpers

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

async function playing(w, title, position = 0) {
  await music.play(title, position);
  w.defer(() => music.pause().catch(() => {}));
}

// The new-song wing a Given's own song pops folds within four seconds (D115).
const plainNotch = (w) => scenes.plainNotch(w);

/** Rest the pointer on the notch: glide onto it and hold still. */
async function rest(w, ms) {
  const pid = await ensureIsland(w);
  w.frontBefore = await harness.frontmost();
  const n = await notch();
  const c = await harness.notchCenter();
  await harness.move(c.x, n.y + n.h + 150);
  await sleep(80);
  await harness.glide(c.x, c.y, 10, 10);
  w.arrivedAt = Date.now();
  if (ms) await sleep(ms);
  return pid;
}

/** The open panel hangs down from the notch on the built-in screen. */
async function assertHangsFromNotch(view) {
  const { frame: screen, notch: n } = await harness.builtIn();
  const p = view.panel;
  assert.ok(p, 'the island is not open');
  // The open panel is the card just below the notch (D140); its exact place
  // is the shape scenario's to check.
  assert.ok(p.y >= n.y + n.h - 0.5 && p.y <= n.y + n.h + CARD_GAP + CARD_GAP_SLACK,
    `the card's top is at y ${p.y}, not just below the notch (bottom ${n.y + n.h})`);
  assert.ok(p.y + p.h > n.y + n.h + 20, 'the panel does not reach down below the notch');
  assert.ok(p.x <= n.x + n.w / 2 && p.x + p.w >= n.x + n.w / 2, 'the panel is not under the notch');
  assert.ok(p.x >= screen.x && p.x + p.w <= screen.x + screen.w, 'the panel is not inside the built-in screen');
}

/**
 * "About 0.15 seconds" (D128, amending D51): the island opens at 0.15 s of
 * rest. Measured on this Mac with no load, it shows open to Accessibility
 * about 120-135 ms after the pointer arrives, and a look takes 30-40 ms. The rest-to-open Thens allow
 * REST_SLACK_MS beyond the rest, so the last look starts by about 40 ms after
 * that and a clearly slow rest (0.3 s, the old value) is seen as too slow.
 */
const RULED_REST_MS = 150;
const REST_SLACK_MS = 100;
function restDeadline(w) {
  // A long rest (2 seconds) has been open long before the Then looks.
  if ((w.restMs ?? 0) >= 1000) return null;
  return w.arrivedAt + (w.restMs ?? RULED_REST_MS) + REST_SLACK_MS;
}

/** Opening never takes the focus from the app in front. */
async function assertFocusKept(w) {
  if (!w.frontBefore) return;
  const now = await harness.frontmost();
  assert.equal(now.pid, w.frontBefore.pid,
    `the island took the focus: ${now.name} is in front instead of ${w.frontBefore.name}`);
  // From the far side, the keyboard too: macOS's own idea of who has the
  // focus (Accessibility, system-wide) is still the app in front, and none of
  // the island's windows is the focused or main one. A panel that becomes key
  // without activating its app passes the check above and fails these.
  const keys = await harness.keyboardFocus();
  const islandPid = w.island.pid;
  assert.notEqual(keys.element, islandPid, 'the island holds the keyboard focus (its panel became key)');
  assert.notEqual(keys.app, islandPid, 'the island is the app holding the keyboard focus');
  // Some apps (Chrome until its accessibility is switched on) give no answer;
  // when macOS does name the focused app, it must be the one in front.
  if (keys.app) {
    assert.equal(keys.app, w.frontBefore.pid,
      `the keyboard focus is with process ${keys.app}, not with ${w.frontBefore.name} in front`);
  }
  const panels = await harness.windows(islandPid);
  const keyed = panels.filter((p) => p.focused || p.main);
  assert.equal(keyed.length, 0, 'an island window is the focused or main window of its app');
}

/**
 * The island opens on the music page. With a deadline, the opening must have
 * STARTED by then (D137: the rest's timing is met by the opening starting,
 * the part below the menu bar strip seen growing); it then settles on the
 * music page.
 */
async function openOnMusicPage(w, deadline = null) {
  const pid = w.island.pid;
  let view;
  if (deadline !== null) {
    // Looks back to back; the opening must have been seen by the deadline
    // (the rest plus REST_SLACK_MS), not merely sometime after it.
    for (;;) {
      view = await island.look(pid);
      const late = Date.now() - deadline;
      if (view.open) {
        assert.ok(late <= 0, `the island started opening ${Math.round(late)} ms after the allowed time for a rest of ${w.restMs ?? RULED_REST_MS} ms`);
        break;
      }
      assert.ok(late <= 0, `the island has not started opening ${Math.round(late)} ms after the allowed time for a rest of ${w.restMs ?? RULED_REST_MS} ms`);
    }
  }
  view = await island.waitFor(pid, (v) => v.open && v.page === 'music', 1500,
    'the island did not settle on the music page');
  await assertHangsFromNotch(view);
  await assertFocusKept(w);
  return view;
}

/**
 * "At once" on a click (D74, D137): the opening starts within 200 ms of the
 * click, well before a rest would have, the part below the strip growing.
 */
function assertOpeningStartedOnClick(w) {
  const first = w.afterClick.find((s) => s.view.open);
  assert.ok(first, 'the island did not start opening on the click');
  const ms = first.t - w.clickedAt;
  assert.ok(ms < 200, `the island took ${Math.round(ms)} ms to start opening after the click, as long as a rest`);
}

/** Rest on the notch and wait for the island to open, as a Given. */
async function openByRest(w) {
  await rest(w, 350);
  return openOnMusicPage(w);
}

function button(view, label) {
  const b = view.buttons.find((x) => x.label === label);
  assert.ok(b, `the island shows no ${label} button (it shows ${view.buttons.map((x) => x.label).join(', ') || 'none'})`);
  return b;
}

async function clickButton(w, label) {
  const view = await island.look(w.island.pid);
  const b = button(view, label);
  w.before = view;
  const c = center(b.frame);
  w.clickedAt = Date.now();
  await harness.click(c.x, c.y);
}

async function showsSong(w, title, ms = 3000) {
  return island.waitFor(w.island.pid, (v) => v.open && v.texts.includes(title), ms,
    `the island does not show "${title}"`);
}

async function musicSays(pred, ms, message) {
  let last;
  try {
    await island.until(async () => {
      last = await music.state();
      return pred(last);
    }, ms, message);
  } catch (e) {
    e.message += `\n  Music says: ${JSON.stringify(last)}`;
    throw e;
  }
  return last;
}

/** The time the progress dot stands at, from where it is drawn on the bar. */
function dotTime(view, duration) {
  assert.ok(view.dot && view.bar, 'the island shows no progress bar with a dot');
  const x = view.dot.frame.x + view.dot.frame.w / 2;
  return ((x - view.bar.frame.x) / view.bar.frame.w) * duration;
}

/** Playing history: Wonderwall played with the island running, then nothing. */
async function lastSongWonderwall(w) {
  await ensureIsland(w);
  await playing(w, 'Wonderwall', 20);
  await sleep(1200); // the island sees it play
  await music.stop();
  await musicSays((s) => s.state === 'stopped', 5000, 'Music did not stop');
}

async function neverPlayed(w) {
  await music.stop().catch(() => {});
  await musicSays((s) => s.state === 'stopped', 5000, 'Music did not stop');
  await ensureIsland(w); // a fresh island: its scratch data folder is empty
}

async function rightClickNotch(w) {
  const pid = await ensureIsland(w);
  const c = await harness.notchCenter();
  await harness.move(c.x, c.y + 400);
  await harness.click(c.x, c.y, 'right');
  w.defer(() => harness.key(53).catch(() => {})); // Escape, should a menu still be up
  const menus = await island.until(async () => {
    const m = await harness.menus(pid);
    return m.length ? m : null;
  }, 3000, 'no menu appeared on the right-click');
  return menus;
}

async function pickQuit(w) {
  const menus = await harness.menus(w.island.pid);
  const quit = menus.flatMap((m) => m.items).find((i) => i.title === 'Quit');
  assert.ok(quit, 'the menu has no Quit');
  const c = center(quit.frame);
  await harness.glide(c.x, c.y, 5, 10);
  await harness.click(c.x, c.y);
  await island.until(async () => !procs.alive(w.island), 5000, 'the island is still running after Quit');
}

async function islandWindowsOnScreen() {
  return (await harness.cgwindows()).filter((x) => /^notch-island/i.test(x.owner));
}

const CONCERT = 'concert_2019_final_v2.mkv';
const CONCERT_SECONDS = 7420; // 2:03:40

/** IINA plays the concert stand-in (2:03:40 long) from 1:12:05. */
async function concert(w) {
  await ensureIsland(w);
  await music.pause().catch(() => {});
  const file = await players.movie(CONCERT, CONCERT_SECONDS - 1); // frames 0...n: n + 1 seconds
  await players.playInIINA(w, file, 4325);
  w.concertAt = Date.now();
}

// --------------------------------------------------------------- definer

module.exports = (reg) => {
  // Givens ---------------------------------------------------------------

  reg.define(/^Apple Music is playing "Wonderwall" by Oasis and the island is closed to the plain notch$/, async (w) => {
    await ensureIsland(w);
    await playing(w, 'Wonderwall', 30);
    const s = await music.state();
    assert.equal(s.artist, 'Oasis');
    await plainNotch(w);
  });

  reg.define(/^Apple Music is playing "Wonderwall" and the island is closed to the plain notch$/, async (w) => {
    await ensureIsland(w);
    await playing(w, 'Wonderwall', 30);
    await plainNotch(w);
  });

  reg.define(/^Chrome is in front and the island is closed to the plain notch$/, async (w) => {
    await ensureIsland(w);
    w.chrome = await chrome.launch(w);
    await harness.activate(w.chrome.pid);
    await island.until(async () => (await harness.frontmost()).pid === w.chrome.pid, 5000,
      'the test Chrome did not come to the front');
    await plainNotch(w);
  });

  reg.define(/^the visionary opened the island by clicking the notch$/, async (w) => {
    const pid = await ensureIsland(w);
    await playing(w, 'Wonderwall', 30);
    await plainNotch(w);
    const c = await harness.notchCenter();
    const n = await notch();
    const r = await harness.arriveAndClick(pid, c.x, c.y, 250);
    const first = r.samples.find((s) => island.parse(s.windows, n).open);
    assert.ok(first && first.t - r.clickedAt < 200, 'the click did not open the island');
    await openOnMusicPage(w);
  });

  reg.define(/^the island is open over "Wonderwall" playing at (\d+:\d\d)$/, async (w, at) => {
    await ensureIsland(w);
    await playing(w, 'Wonderwall', mmss(at));
    await openByRest(w);
    await showsSong(w, 'Wonderwall');
    await music.seek(mmss(at));
  });

  reg.define(/^the island is open over "Wonderwall" playing in Apple Music at (\d+:\d\d)$/, async (w, at) => {
    await ensureIsland(w);
    await playing(w, 'Wonderwall', mmss(at));
    await openByRest(w);
    await showsSong(w, 'Wonderwall');
    await music.seek(mmss(at));
    w.duration = (await music.state()).duration;
  });

  reg.define(/^"Wonderwall" was paused at (\d+:\d\d) from the island and the island is open showing play$/, async (w, at) => {
    await ensureIsland(w);
    await playing(w, 'Wonderwall', mmss(at));
    await openByRest(w);
    await showsSong(w, 'Wonderwall');
    await music.seek(mmss(at));
    await clickButton(w, 'Pause');
    await musicSays((s) => s.state === 'paused', 3000, 'Music did not pause from the island');
    await island.waitFor(w.island.pid, (v) => v.buttons.some((b) => b.label === 'Play'), 2000,
      'the island does not show play');
    w.pausedAt = (await music.state()).position;
  });

  reg.define(/^Apple Music ignores the (pause|seek) the island sends it$/, (w, what) => {
    island.feed(w, { musicIgnores: [what] }); // test input: Music not acting on it
  });

  reg.define(/^the island is open over "Wonderwall" with "Champagne Supernova" next in the Apple Music queue$/, async (w) => {
    await ensureIsland(w);
    await playing(w, 'Wonderwall', 30); // the test playlist's order: Champagne Supernova next
    await openByRest(w);
    await showsSong(w, 'Wonderwall');
  });

  reg.define(/^the Apple Music queue has "Don't Look Back in Anger" just before "Wonderwall"$/, async (w) => {
    await ensureIsland(w);
    await playing(w, 'Wonderwall', 30); // the test playlist's order: Don't Look Back in Anger first
  });

  reg.define(/^"Wonderwall" in Apple Music is playing while Messages is in front$/, async (w) => {
    await ensureIsland(w);
    await playing(w, 'Wonderwall', 30);
    await osa('tell application "Messages" to activate');
    await island.until(async () => (await harness.frontmost()).bundleID === 'com.apple.MobileSMS', 5000,
      'Messages did not come to the front');
    await plainNotch(w);
  });

  reg.define(/^a (youtube\.com video|soundcloud\.com track) in a Chrome tab behind a Gmail tab is playing while Messages is in front$/, async (w, what) => {
    await ensureIsland(w);
    await music.pause().catch(() => {});
    const youtube = what.startsWith('youtube');
    w.tab = await chrome.playInTab(w, youtube ? 'Lecture 4: Fourier Series' : 'late night mix', 30);
    w.lineName = youtube ? 'YouTube' : 'SoundCloud';
    w.gmail = await w.chrome.browser.open(standIns.urls.gmail());
    await island.until(async () => (await w.gmail.shown()) && !(await w.tab.shown()), 5000,
      'the Gmail tab is not in front of the playing tab');
    await osa('tell application "Messages" to activate');
    await island.until(async () => (await harness.frontmost()).bundleID === 'com.apple.MobileSMS', 5000,
      'Messages did not come to the front');
    await plainNotch(w);
  });

  reg.define(/^the island is open over "Wonderwall" because the pointer is on it$/, async (w) => {
    await ensureIsland(w);
    await playing(w, 'Wonderwall', 30);
    await openByRest(w);
    await showsSong(w, 'Wonderwall');
  });

  reg.define(/^an external mouse is connected and Apple Music is playing "Wonderwall"$/, async (w) => {
    // The harness posts mouse events: plain clicks and a wheel that turns in
    // notches, as an external mouse sends them (never a continuous scroll).
    w.mouse = true;
    await ensureIsland(w);
    await playing(w, 'Wonderwall', 30);
  });

  reg.define(/^the island is closed to the plain notch$/, async (w) => {
    await plainNotch(w);
  });

  reg.define(/^the island is open on the music page$/, async (w) => {
    await ensureIsland(w);
    await openByRest(w);
  });

  reg.define(/^nothing is playing or paused, and the last song the visionary played was "Wonderwall" in Apple Music$/, async (w) => {
    await lastSongWonderwall(w);
    await plainNotch(w);
  });

  reg.define(/^nothing is playing and the island is open over "Wonderwall", paused and ready$/, async (w) => {
    await lastSongWonderwall(w);
    await plainNotch(w);
    await openByRest(w);
    await island.waitFor(w.island.pid, (v) => v.texts.includes('Wonderwall') && v.buttons.some((b) => b.label === 'Play'),
      2000, 'the island does not show Wonderwall paused and ready');
  });

  reg.define(/^no song has played since the island was installed$/, async (w) => {
    await neverPlayed(w);
    await plainNotch(w);
  });

  reg.define(/^(the last song played was "Wonderwall"|no song has played since the island was installed) and nothing is playing$/, async (w, history) => {
    if (history.startsWith('the last song')) await lastSongWonderwall(w);
    else await neverPlayed(w);
    await plainNotch(w);
  });

  reg.define(/^the island is running$/, async (w) => {
    await ensureIsland(w);
    await plainNotch(w);
  });

  reg.define(/^the visionary has right-clicked the notch$/, async (w) => {
    await rightClickNotch(w);
  });

  reg.define(/^the visionary quit the island from the notch's menu$/, async (w) => {
    await rightClickNotch(w);
    await pickQuit(w);
  });

  reg.define(/^IINA is playing a movie fullscreen, the menu bar is hidden and the notch area is black$/, async (w) => {
    await scenes.iinaFullscreen(w);
  });

  reg.define(/^Apple Music is playing "Wonderwall"$/, async (w) => {
    await playing(w, 'Wonderwall', 30);
  });

  // Whens ----------------------------------------------------------------

  reg.define(/^the visionary rests the (trackpad |mouse |)pointer on the notch for (about 0\.15 seconds|2 seconds)$/, async (w, _kind, howLong) => {
    w.restMs = howLong === '2 seconds' ? 2000 : RULED_REST_MS;
    await rest(w, w.restMs);
  });

  reg.define(/^the visionary rests the pointer on the notch$/, async (w) => {
    w.restMs = RULED_REST_MS;
    const pid = await ensureIsland(w);
    // The opening is watched frame by frame meanwhile, for the Thens that
    // look at its motion (D137, D138).
    w.opening = motion.watchWhile(pid, 1500, { start: 'open' }, async () => {});
    w.defer(() => Promise.resolve(w.opening).catch(() => {}));
    await sleep(80);
    await rest(w, RULED_REST_MS);
  });

  reg.define(/^the visionary sweeps the pointer from Chrome's Help menu across the notch to the Wi-Fi icon without resting$/, async (w) => {
    const help = (await harness.menubar(w.chrome.pid)).find((i) => i.title === 'Help');
    assert.ok(help, "Chrome's menu bar shows no Help menu");
    const wifi = (await harness.extras()).find((i) => /^Wi.?Fi/i.test(i.description || i.title || ''));
    assert.ok(wifi, 'the menu bar shows no Wi-Fi icon');
    const a = center(help.frame);
    const b = center(wifi.frame);
    const n = await notch();
    assert.ok(a.x < n.x && b.x > n.x + n.w, 'the Help menu and the Wi-Fi icon are not either side of the notch');
    // An unhurried sweep, about a second end to end: the pointer is over the
    // notch for a good part of the rest time, never still on it.
    const list = await harness.sweep(w.island.pid, a, b, 80, 15, 800);
    w.sweep = list.map((s) => ({ t: s.t, pointer: s.pointer, view: island.parse(s.windows, n) }));
    w.sweepNotch = n;
    const over = w.sweep.filter((s) => s.pointer && s.pointer.x >= n.x && s.pointer.x <= n.x + n.w);
    assert.ok(over.length > 1 && over[over.length - 1].t - over[0].t >= 200,
      'the sweep crossed the notch too fast to show anything');
    // Honest at the ruled rest (D128): the pointer is never still on the notch
    // for anywhere near a rest. The longest stretch it stays within 8 points
    // of where the stretch began, over the notch, is under half of it.
    let longest = 0;
    for (let i = 0; i < over.length; i++) {
      let j = i;
      while (j + 1 < over.length && Math.hypot(over[j + 1].pointer.x - over[i].pointer.x, over[j + 1].pointer.y - over[i].pointer.y) <= 8) j++;
      longest = Math.max(longest, over[j].t - over[i].t);
    }
    assert.ok(longest < RULED_REST_MS / 2,
      `the sweep lingered ${longest} ms in one spot on the notch, close to a rest`);
  });

  reg.define(/^the visionary clicks the notch the moment the pointer reaches it$/, async (w) => {
    const pid = await ensureIsland(w);
    w.frontBefore = await harness.frontmost();
    const c = await harness.notchCenter();
    const n = await notch();
    await harness.move(c.x, n.y + n.h + 150);
    await sleep(80);
    const r = await harness.arriveAndClick(pid, c.x, c.y, 400);
    w.clickedAt = r.clickedAt;
    w.afterClick = r.samples.map((s) => ({ t: s.t, view: island.parse(s.windows, n) }));
  });

  reg.define(/^the visionary moves the pointer off the island for (2 seconds|0\.2 seconds and back onto it)$/, async (w, how) => {
    const pid = w.island.pid;
    const view = await island.look(pid);
    const p = view.panel;
    assert.ok(p, 'the island is not open');
    const off = { x: p.x + p.w / 2, y: p.y + p.h + 120 };
    const back = { x: p.x + p.w / 2, y: p.y + p.h - 30 };
    await harness.glide(off.x, off.y, 4, 8);
    const start = Date.now();
    const ms = how === '2 seconds' ? 2000 : 200;
    w.offSamples = [];
    while (Date.now() - start < ms) {
      w.offSamples.push(await island.look(pid));
      await sleep(15);
    }
    if (how !== '2 seconds') {
      await harness.glide(back.x, back.y, 4, 8);
      await sleep(700); // longer than any grace: closing now would show
      w.offSamples.push(await island.look(pid));
    }
  });

  reg.define(/^the visionary clicks (pause|play|skip|back)$/, async (w, which) => {
    const label = { pause: 'Pause', play: 'Play', skip: 'Skip', back: 'Back' }[which];
    await clickButton(w, label);
    if (label === 'Pause' || label === 'Play') {
      // Watch the island from the click on, so nothing it shows is missed.
      const n = await notch();
      w.afterClick = (await harness.watch(w.island.pid, 1500, 30))
        .map((s) => ({ t: s.t, view: island.parse(s.windows, n) }));
    }
  });

  reg.define(/^the visionary drags the progress dot to (\d+:\d\d) and lets go$/, async (w, to) => {
    const view = await island.look(w.island.pid);
    assert.ok(view.dot && view.bar, 'the island shows no progress dot');
    const duration = w.duration || (await music.state()).duration;
    const from = center(view.dot.frame);
    const x = view.bar.frame.x + (mmss(to) / duration) * view.bar.frame.w;
    w.seekTarget = mmss(to);
    w.releasedAt = Date.now();
    await harness.drag(from.x, from.y, x, from.y, 20, 15);
    const n = await notch();
    w.afterRelease = (await harness.watch(w.island.pid, 2200, 30))
      .map((s) => ({ t: s.t, view: island.parse(s.windows, n) }));
  });

  reg.define(/^the visionary opens the island and clicks its (source line|cover art)$/, async (w, part) => {
    await rest(w, 350);
    const view = await openOnMusicPage(w);
    let target;
    if (part === 'cover art') {
      assert.ok(view.art, 'the island shows no cover art');
      target = view.art.frame;
    } else {
      // The source line names the app, and the speaker when it is not the
      // built-in one (D119): "Apple Music" or "Apple Music · <speaker>".
      const name = w.lineName || 'Apple Music';
      const line = view.sourceLine;
      assert.ok(line && (line.value === name || line.value.startsWith(`${name} · `)),
        `the island shows no source line naming ${name} (it shows ${view.texts.join(', ')})`);
      target = line.frame;
    }
    const c = center(target);
    await harness.glide(c.x, c.y, 5, 10);
    await harness.click(c.x, c.y);
  });

  reg.define(/^the visionary clicks the notch with the mouse$/, async (w) => {
    const pid = await ensureIsland(w);
    w.frontBefore = await harness.frontmost();
    const c = await harness.notchCenter();
    const n = await notch();
    await harness.move(c.x, n.y + n.h + 150);
    await sleep(80);
    const r = await harness.arriveAndClick(pid, c.x, c.y, 400);
    w.clickedAt = r.clickedAt;
    w.afterClick = r.samples.map((s) => ({ t: s.t, view: island.parse(s.windows, n) }));
  });

  reg.define(/^the visionary (turns the mouse wheel down on the island|scrolls down with two fingers)$/, async (w, how) => {
    const view = await island.look(w.island.pid);
    assert.ok(view.panel, 'the island is not open');
    w.beforeScroll = view;
    const c = center(view.panel);
    await harness.glide(c.x, c.y, 4, 8);
    await sleep(60);
    if (how.startsWith('turns')) await harness.scroll(-1, 'wheel');
    else await harness.scroll(-80, 'trackpad');
  });

  reg.define(/^the visionary right-clicks the notch$/, async (w) => {
    w.menus = await rightClickNotch(w);
  });

  reg.define(/^the visionary picks "Quit"$/, async (w) => {
    await pickQuit(w);
  });

  reg.define(/^the visionary then rests the pointer on the notch for 2 seconds while "Wonderwall" plays$/, async (w) => {
    await playing(w, 'Wonderwall', 30);
    const c = await harness.notchCenter();
    await harness.glide(c.x, c.y, 10, 10);
    const start = Date.now();
    w.afterQuit = [];
    while (Date.now() - start < 2000) {
      w.afterQuit.push({ windows: await islandWindowsOnScreen(), running: island.runningIslands() });
      await sleep(150);
    }
  });

  reg.define(/^the visionary logs out and logs back in$/, async (w) => {
    // Q1: the login is macOS's own login-item registry listing the island as
    // enabled; the registered app is then started as the login starts it.
    const item = await registry.enabledApp(testBundleID);
    assert.ok(item, 'macOS does not list the island as an enabled login item');
    const app = decodeURIComponent(new URL(item.url).pathname);
    const binary = path.join(app, 'Contents', 'MacOS', 'NotchIsland');
    assert.ok(fs.existsSync(binary), `the registered login item points at ${app}, which holds no island`);
    await island.launch(w, binary);
  });

  reg.define(/^the visionary rests the pointer on the notch while "Wonderwall" plays$/, async (w) => {
    await playing(w, 'Wonderwall', 30);
    await pointerAway();
    await sleep(200);
    w.restMs = RULED_REST_MS;
    await rest(w, RULED_REST_MS);
  });

  // Thens ----------------------------------------------------------------

  reg.define(/^the visionary sees the island start opening downward by the end of the rest, then showing "([^"]+)" and "([^"]+)" once it has settled$/, async (w, title, artist) => {
    const view = await openOnMusicPage(w, restDeadline(w));
    await island.waitFor(w.island.pid, (v) => v.texts.includes(title) && v.texts.includes(artist), 1000,
      `the island does not show "${title}" and "${artist}"`);
    assert.ok(view.panel.h > (await notch()).h * 2, 'the island did not open downward');
  });

  reg.define(/^the visionary sees three buttons on it: back, pause and skip$/, async (w) => {
    const view = await island.look(w.island.pid);
    const shown = [...view.buttons].sort((a, b) => a.frame.x - b.frame.x);
    assert.deepEqual(shown.map((b) => b.label), ['Back', 'Pause', 'Skip']);
    assert.ok(shown.every((b) => b.enabled), 'a button is greyed out');
  });

  reg.define(/^the visionary sees the notch stay plain the whole way across, with nothing opening$/, (w) => {
    assert.ok(w.sweep.length > 20, 'the sweep was not watched');
    const opened = w.sweep.filter((s) => !island.isPlainNotch(s.view, w.sweepNotch));
    assert.equal(opened.length, 0,
      `the island drew something during the sweep, first with the pointer at x ${opened[0]?.pointer.x}: ${JSON.stringify(opened[0]?.view.frames)}`);
  });

  reg.define(/^the visionary sees the island start opening at once, without waiting for a rest, then settle on the music page$/, async (w) => {
    await assertOpeningStartedOnClick(w);
    await openOnMusicPage(w);
  });

  reg.define(/^the visionary sees the island start opening by the end of the rest, then settle on the music page$/, async (w) => {
    await openOnMusicPage(w, restDeadline(w));
  });

  reg.define(/^the visionary sees the island close back to the plain notch$/, async (w) => {
    const n = await notch();
    await island.waitFor(w.island.pid, (v) => island.isPlainNotch(v, n), 500, 'the island did not close');
  });

  reg.define(/^the visionary sees the island (still open on the music page|closed back to the plain notch)$/, async (w, state) => {
    const n = await notch();
    if (state.startsWith('still')) {
      const closed = w.offSamples.filter((v) => !(v.open && v.page === 'music'));
      assert.equal(closed.length, 0, 'the island closed while the pointer was off it for a moment');
      await openOnMusicPage(w);
    } else {
      assert.ok(w.offSamples.some((v) => v.open), 'the island was never open while the pointer left it');
      const view = await island.look(w.island.pid);
      assert.ok(island.isPlainNotch(view, n), 'the island is still open 2 seconds after the pointer left it');
    }
  });

  reg.define(/^the visionary hears "Wonderwall" stop at (\d+:\d\d)$/, async (w, at) => {
    const s = await musicSays((x) => x.state === 'paused', 2000, 'Music did not pause');
    assert.equal(s.name, 'Wonderwall');
    assert.ok(s.position >= mmss(at) && s.position < mmss(at) + 3, `Music stopped at ${s.position.toFixed(1)} s, not at ${at}`);
    await sleep(600);
    const later = await music.state();
    assert.equal(later.state, 'paused', 'Music started again');
  });

  reg.define(/^the visionary sees the pause button turned into a play button$/, async (w) => {
    const view = await island.waitFor(w.island.pid, (v) => v.buttons.some((b) => b.label === 'Play'), 1000,
      'the pause button did not turn into play');
    assert.ok(!view.buttons.some((b) => b.label === 'Pause'), 'the island still shows pause');
  });

  reg.define(/^the visionary hears "Wonderwall" carry on from (\d+:\d\d), not from the start$/, async (w, at) => {
    const s = await musicSays((x) => x.state === 'playing', 2000, 'Music did not play');
    assert.equal(s.name, 'Wonderwall');
    assert.ok(s.position >= mmss(at) && s.position < mmss(at) + 4,
      `Music plays from ${s.position.toFixed(1)} s, not from ${at}`);
  });

  reg.define(/^the visionary hears "Wonderwall" keep playing$/, async (w) => {
    const a = await music.state();
    await sleep(800);
    const b = await music.state();
    for (const s of [a, b]) {
      assert.equal(s.state, 'playing', 'Music stopped playing');
      assert.equal(s.name, 'Wonderwall');
    }
    assert.ok(b.position > a.position, 'Music is not moving on through the song');
  });

  reg.define(/^the visionary sees the pause button still showing, never turned into play$/, (w) => {
    assert.ok(w.afterClick.length > 10, 'the island was not watched after the click');
    for (const s of w.afterClick) {
      const labels = s.view.buttons.map((b) => b.label);
      assert.ok(labels.includes('Pause') && !labels.includes('Play'),
        `the island showed ${labels.join(', ')} ${Math.round(s.t - w.clickedAt)} ms after the click`);
    }
  });

  reg.define(/^the visionary sees no shake and no message on the island$/, (w) => {
    const before = w.before;
    const key = (b) => `${b.label}@${Math.round(b.frame.x)},${Math.round(b.frame.y)}`;
    const texts = (v) => v.texts.filter((t) => !/^\d+:\d\d$/.test(t)).sort();
    for (const s of w.afterClick) {
      assert.deepEqual(s.view.panel, before.panel, 'the island moved');
      assert.deepEqual(s.view.buttons.map(key), before.buttons.map(key), 'the buttons moved');
      assert.deepEqual(texts(s.view), texts(before), 'the island showed a message');
    }
  });

  reg.define(/^the visionary hears "Wonderwall" carry on from about (\d+:\d\d), not from (\d+:\d\d)$/, async (w, about, not) => {
    const s = await music.state();
    assert.equal(s.state, 'playing');
    assert.equal(s.name, 'Wonderwall');
    const elapsed = (Date.now() - w.releasedAt) / 1000;
    assert.ok(s.position >= mmss(about) && s.position < mmss(about) + elapsed + 6,
      `Music is at ${s.position.toFixed(1)} s, not about ${about}`);
    assert.ok(Math.abs(s.position - mmss(not)) > 20, `Music jumped to ${not}`);
  });

  reg.define(/^the visionary sees the progress dot at the position Apple Music is really playing, not at (\d+:\d\d)$/, async (w, not) => {
    const view = await island.look(w.island.pid);
    const s = await music.state();
    const shown = dotTime(view, s.duration);
    assert.ok(Math.abs(shown - s.position) < 3,
      `the dot stands at ${shown.toFixed(1)} s while Music plays at ${s.position.toFixed(1)} s`);
    // The island holds a clicked spot for at most 1 s while Music applies the
    // seek (SeekHold, D124); from 1.3 s after the release on, the dot never
    // stood at the dragged-to spot.
    const settled = w.afterRelease.filter((x) => x.t - w.afterRelease[0].t > 1300);
    for (const x of settled) {
      assert.ok(Math.abs(dotTime(x.view, s.duration) - mmss(not)) > 20, `the dot stayed at ${not}`);
    }
  });

  reg.define(/^the visionary hears "Champagne Supernova" start$/, async () => {
    const s = await musicSays((x) => x.state === 'playing' && x.name === 'Champagne Supernova', 3000,
      'Music did not start Champagne Supernova');
    assert.ok(s.position < 5, `Champagne Supernova is at ${s.position} s, not at its start`);
  });

  reg.define(/^the visionary sees "Champagne Supernova" on the island in place of "Wonderwall"$/, async (w) => {
    const view = await showsSong(w, 'Champagne Supernova');
    assert.ok(!view.texts.includes('Wonderwall'), 'the island still shows Wonderwall');
  });

  reg.define(/^the visionary hears "(Wonderwall|Don't Look Back in Anger)" playing from 0:00$/, async (w, song) => {
    const s = await musicSays((x) => x.state === 'playing' && x.name === song, 3000, `Music did not play ${song}`);
    const since = (Date.now() - w.clickedAt) / 1000;
    assert.ok(s.position < since + 1, `${song} plays from ${s.position.toFixed(1)} s, ${since.toFixed(1)} s after the click: not from 0:00`);
  });

  reg.define(/^the visionary sees "(Wonderwall|Don't Look Back in Anger)" on the island$/, async (w, song) => {
    await showsSong(w, song);
  });

  reg.define(/^the visionary sees Chrome showing that (?:youtube\.com|soundcloud\.com) tab, not the Gmail tab come to the front over Messages$/, async (w) => {
    // The test Chrome is the frontmost app, and Chrome itself shows the
    // playing tab, the Gmail tab now hidden behind it.
    await island.until(async () => (await harness.frontmost()).pid === w.chrome.pid, 4000,
      'Chrome did not come to the front');
    await island.until(async () => (await w.tab.shown()) && !(await w.gmail.shown()), 4000,
      'Chrome came forward on the Gmail tab, not the playing one');
    const m = await w.tab.media();
    assert.ok(!m.paused, 'the playing tab stopped');
  });

  reg.define(/^the visionary sees the Apple Music window come to the front over Messages$/, async () => {
    await island.until(async () => (await harness.frontmost()).bundleID === 'com.apple.Music', 4000,
      'Apple Music did not come to the front');
    const front = await harness.frontmost();
    await island.until(async () => (await harness.windows(front.pid)).some((x) => !x.minimized && x.frame && x.frame.w > 200),
      4000, 'Apple Music came forward without a window');
  });

  reg.define(/^the visionary sees (the island open on the music page|the island open at once on the music page|the shelf page come up from below, as with a two-finger scroll)$/, async (w, result) => {
    if (result === 'the island open on the music page') {
      await openOnMusicPage(w, restDeadline(w));
    } else if (result.startsWith('the island open at once')) {
      await assertOpeningStartedOnClick(w);
      await openOnMusicPage(w);
    } else {
      await shelfFromBelow(w);
    }
  });

  async function shelfFromBelow(w) {
    const before = w.beforeScroll;
    assert.ok(before.shelfFrame && before.shelfFrame.y >= before.panel.y + before.panel.h - 1,
      'the shelf page was not waiting below the music page');
    const view = await island.waitFor(w.island.pid, (v) => v.open && v.page === 'shelf', 1500,
      'the shelf page did not come up');
    assert.ok(view.musicFrame.y < before.musicFrame.y, 'the music page did not move up out of the way');
  }

  reg.define(/^the visionary sees the shelf page come up from below$/, async (w) => {
    await shelfFromBelow(w);
  });

  reg.define(/^the visionary sees the island open on the music page showing "Wonderwall" paused, with a play button$/, async (w) => {
    await openOnMusicPage(w);
    const view = await island.waitFor(w.island.pid, (v) => v.texts.includes('Wonderwall'), 1000,
      'the island does not show Wonderwall');
    const labels = view.buttons.map((b) => b.label);
    assert.ok(labels.includes('Play') && !labels.includes('Pause'), `the island shows ${labels.join(', ')}`);
    assert.ok(button(view, 'Play').enabled, 'play is greyed out');
    assert.notEqual((await music.state()).state, 'playing', 'Music is playing');
  });

  reg.define(/^the visionary hears "Wonderwall" start playing in Apple Music$/, async () => {
    const s = await musicSays((x) => x.state === 'playing' && x.name === 'Wonderwall', 5000,
      'Music did not start Wonderwall');
    assert.ok(s.position < 5, `Wonderwall plays from ${s.position.toFixed(1)} s, not from its start`);
  });

  reg.define(/^the visionary sees the music page read "Nothing played yet"$/, async (w) => {
    await openOnMusicPage(w);
    await island.waitFor(w.island.pid, (v) => v.texts.includes('Nothing played yet'), 1000,
      'the music page does not read "Nothing played yet"');
  });

  reg.define(/^the visionary sees back, play and skip greyed out$/, async (w) => {
    const view = await island.look(w.island.pid);
    for (const label of ['Back', 'Play', 'Skip']) {
      assert.equal(button(view, label).enabled, false, `${label} is not greyed out`);
    }
  });

  reg.define(/^the visionary sees a menu whose single item is "Quit"$/, (w) => {
    assert.equal(w.menus.length, 1, `${w.menus.length} menus are open`);
    const [menu] = w.menus;
    const titled = menu.items.filter((i) => i.title);
    assert.deepEqual(titled.map((i) => i.title), ['Quit']);
    const quit = titled[0];
    // Anything else the menu lists is no row of its own: untitled, greyed and
    // drawn in the Quit row's own place.
    for (const other of menu.items.filter((i) => !i.title)) {
      assert.equal(other.enabled, false, 'the menu has a second item that can be picked');
      assert.ok(island.inside(other.frame, quit.frame), 'the menu has a second row');
    }
    assert.ok(menu.frame.h < quit.frame.h * 2, 'the menu is taller than one item');
  });

  reg.define(/^the visionary sees the plain notch, with nothing opening$/, (w) => {
    assert.ok(w.afterQuit.length > 5, 'the notch was not watched');
    for (const s of w.afterQuit) {
      assert.deepEqual(s.running, [], 'the island is running again');
      assert.deepEqual(s.windows, [], 'the island drew a window');
    }
  });

  reg.define(/^the visionary sees the music panel open showing "Wonderwall"$/, async (w) => {
    await openOnMusicPage(w);
    await showsSong(w, 'Wonderwall', 1500);
  });

  // IINA and the concert file (P2): D24, D25, and the progress-dot row of
  // the drag outline (D52). IINA is read from the system now-playing service
  // by the harness's own reader.

  reg.define(/^IINA is playing the downloaded file "concert_2019_final_v2\.mkv", with no cover art and no artist, at 1:12:05 of 2:03:40$/, async (w) => {
    await concert(w);
  });

  reg.define(/^its sound goes out through the Bluetooth speaker "JBL Flip 5"$/, (w) => {
    island.feed(w, { outputDevice: { name: 'JBL Flip 5', builtIn: false } }); // test input (Q2)
  });

  reg.define(/^the island is open over "concert_2019_final_v2\.mkv" playing in IINA at 1:12:05 of 2:03:40$/, async (w) => {
    await concert(w);
    await openByRest(w);
    await showsSong(w, CONCERT);
  });

  reg.define(/^the island is open on the music page over "concert_2019_final_v2\.mkv"$/, async (w) => {
    await concert(w);
    await openByRest(w);
    await showsSong(w, CONCERT);
  });

  reg.define(/^the visionary rests the pointer on the notch and the island opens$/, async (w) => {
    w.restMs = RULED_REST_MS;
    await rest(w, RULED_REST_MS);
    await openOnMusicPage(w, restDeadline(w));
  });

  reg.define(/^the visionary moves playback by (dragging the dot|clicking the bar|dragging the dot back|clicking the bar's start) to ([\d:]+)$/, async (w, how, target) => {
    const view = await island.waitFor(w.island.pid, (v) => v.dot && v.bar, 2000, 'the island shows no progress bar');
    const bar = view.bar.frame;
    const to = players.seconds(target);
    const x = bar.x + (to / CONCERT_SECONDS) * bar.w;
    const y = bar.y + bar.h / 2;
    w.seekTarget = to;
    w.releasedAt = Date.now();
    if (how.startsWith('dragging')) {
      const from = center(view.dot.frame);
      await harness.drag(from.x, from.y, x, y, 20, 15);
    } else {
      await harness.glide(x, y, 5, 10);
      await harness.click(x, y);
    }
  });

  reg.define(/^the visionary drags the progress dot with the pointer down to the Dock, without letting go$/, async (w) => {
    const view = await island.waitFor(w.island.pid, (v) => v.dot, 2000, 'the island shows no progress dot');
    const d = center(view.dot.frame);
    const { frame } = await harness.builtIn();
    w.defer(() => harness.release().catch(() => {}));
    await harness.drag(d.x, d.y, d.x, frame.y + frame.h - 20, 20, 15, true);
    const n = await notch();
    w.held = (await harness.watch(w.island.pid, 1500, 40)).map((s) => island.parse(s.windows, n));
    w.stillHeld = await harness.leftHeld();
  });

  reg.define(/^the visionary sees a music-note placeholder where the cover art would be$/, async (w) => {
    const view = await island.look(w.island.pid);
    assert.ok(view.art, 'the island shows nothing where the cover art would be');
    const placeholder = view.elements.find((e) => e.description === 'Music note');
    assert.ok(placeholder, `the island shows ${view.art.description}, not a music-note placeholder`);
  });

  reg.define(/^the visionary sees the filename cut short with an ellipsis$/, async (w) => {
    const view = await island.look(w.island.pid);
    assert.ok(view.title, 'the island shows no title');
    assert.equal(view.title.value, CONCERT, 'the title is not the file\'s name');
    // The name as drawn is narrower than the whole name needs on one line, so
    // it is cut short (SwiftUI cuts with an ellipsis).
    const { width } = await harness.h('text-width', 14, 'semibold', CONCERT);
    assert.ok(view.title.frame.w < width - 4,
      `the title is drawn ${view.title.frame.w} points wide, the whole name needs ${width.toFixed(0)}: it is not cut short`);
  });

  reg.define(/^the visionary sees the source line "IINA · JBL Flip 5"$/, async (w) => {
    await island.waitFor(w.island.pid, (v) => v.sourceLine?.value === 'IINA · JBL Flip 5', 2000,
      'the source line does not read "IINA · JBL Flip 5"');
  });

  reg.define(/^the visionary sees a progress bar reading 1:12:05 elapsed of 2:03:40$/, async (w) => {
    const view = await island.look(w.island.pid);
    assert.ok(view.bar && view.dot, 'the island shows no progress bar');
    assert.ok(view.texts.includes('2:03:40'), `the bar does not read a length of 2:03:40 (${view.texts.join(', ')})`);
    const since = (Date.now() - w.concertAt) / 1000;
    const shown = view.texts.filter((t) => /^\d+:\d\d:\d\d$/.test(t) && t !== '2:03:40').map(players.seconds);
    assert.ok(shown.some((t) => t >= 4325 && t <= 4325 + since + 1),
      `the bar reads ${shown.join(', ')} s elapsed, not 1:12:05 (${since.toFixed(1)} s after the file was at 1:12:05)`);
    const real = await players.iinaState();
    assert.ok(real, 'the system no longer shows IINA as now playing');
    assert.ok(shown.some((t) => Math.abs(t - real.elapsed) <= 2), `the bar reads ${shown.join(', ')}, IINA is at ${real.elapsed.toFixed(1)}`);
  });

  reg.define(/^the visionary sees the back, pause and skip buttons$/, async (w) => {
    const view = await island.look(w.island.pid);
    const shown = [...view.buttons].filter((b) => ['Back', 'Pause', 'Play', 'Skip'].includes(b.label))
      .sort((a, b) => a.frame.x - b.frame.x);
    assert.deepEqual(shown.map((b) => b.label), ['Back', 'Pause', 'Skip']);
    assert.ok(shown.every((b) => b.enabled), 'a button is greyed out');
  });

  reg.define(/^the visionary hears the concert carry on from ([\d:]+)$/, async (w, target) => {
    const to = players.seconds(target);
    let last;
    await players.until(async () => {
      last = await players.iinaState();
      const since = (Date.now() - w.releasedAt) / 1000;
      return last && last.playing && last.elapsed >= to - 3 && last.elapsed <= to + since + 3;
    }, 4000, `IINA does not play the concert from ${target}`).catch((e) => {
      e.message += ` (IINA is at ${last && last.elapsed})`;
      throw e;
    });
  });

  reg.define(/^the visionary sees the elapsed time read ([\d:]+) of 2:03:40$/, async (w, target) => {
    const to = players.seconds(target);
    const view = await island.waitFor(w.island.pid, (v) => {
      const since = (Date.now() - w.releasedAt) / 1000;
      return v.texts.includes('2:03:40') && v.texts.some((t) => /^\d+:\d\d(:\d\d)?$/.test(t) && t !== '2:03:40'
        && players.seconds(t) >= to - 3 && players.seconds(t) <= to + since + 3);
    }, 3000, `the island does not read ${target} of 2:03:40`);
    assert.ok(view.texts.includes('2:03:40'));
  });

  reg.define(/^the visionary sees the island stay open for as long as the drag is under way$/, async (w) => {
    assert.ok(w.stillHeld, 'the drag was not under way: the button is up');
    assert.ok(w.held.length > 10, 'the island was not watched during the drag');
    const closed = w.held.filter((v) => !v.open);
    assert.equal(closed.length, 0, 'the island closed while the dot was still held far away');
    await harness.release();
  });
  // The island's shape and motion (P3.5, D136-D140) --------------------------
  // Every Then reads the island's window frames as Accessibility and the
  // window server give them, sampled fast by the harness while it moves,
  // against the menu bar items' own frames and macOS's own hit test.

  reg.define(/^Chrome is in front with its Help menu left of the notch, and a status item sits right of the notch as Meter's readings do$/, async (w) => {
    await ensureIsland(w);
    if (!w.chrome || w.chrome.exited) w.chrome = await chrome.launch(w);
    await harness.activate(w.chrome.pid);
    await island.until(async () => (await harness.frontmost()).pid === w.chrome.pid, 5000,
      'the test Chrome did not come to the front');
    const g = await motion.geometry();
    const n = g.notch;
    const help = (await harness.menubar(w.chrome.pid)).find((i) => i.title === 'Help');
    assert.ok(help && help.frame, "Chrome's menu bar shows no Help menu");
    assert.ok(help.frame.x + help.frame.w <= n.x, "Chrome's Help menu is not left of the notch");
    w.help = help.frame;
    // A status item of the harness's own right of the notch (macOS places it;
    // never Meter's, which is only read), asked about by macOS's hit test.
    w.status = await motion.statusStandIn(w);
    const f = w.status.frame;
    assert.ok(f.x >= n.x + n.w - 0.5, `the status item (x ${f.x}) is not right of the notch`);
    // Every status item where a card as wide as the open one would reach if it
    // were in the strip (Meter's readings among them): their frames read once,
    // never clicked, never asked about again.
    const reach = (OPEN_PANEL_WIDTH - n.w) / 2;
    w.beside = (await harness.extras()).map((i) => i.frame)
      .filter((r) => r && r.w > 0 && r.y < g.stripBottom && r.x < n.x + n.w + reach && r.x + r.w > n.x - reach);
    assert.ok(w.beside.some((r) => r.x >= n.x + n.w - 0.5),
      'no status item sits right of the notch where a card as wide as the open one would reach, so the scenario proves nothing');
    await plainNotch(w);
  });

  reg.define(/^the visionary rests the pointer on the notch, the island opens, and later the pointer leaves it$/, async (w) => {
    const pid = await ensureIsland(w);
    // macOS's hit test at the Help menu, the status item, a point in the gap
    // between the notch and the open card, and a point inside the open card.
    const n = (await motion.geometry()).notch;
    const below = n.y + n.h;
    w.gapPoint = { x: n.x + n.w / 2, y: below + CARD_GAP / 2 };
    w.cardPoint = { x: n.x + n.w / 2, y: below + CARD_GAP + 60 };
    const hits = [motion.center(w.help), motion.center(w.status.frame), w.gapPoint, w.cardPoint];
    w.watch = await motion.watchWhile(pid, 3400, { start: 'open', hits }, async () => {
      w.restMs = RULED_REST_MS;
      await rest(w, RULED_REST_MS);
      await island.waitFor(pid, (v) => v.open && v.page === 'music', 2000, 'the island did not open');
      await sleep(500); // the open time
      await pointerAway();
    });
    w.watch.hitOwners = [w.chrome.pid, w.status.handle.pid];
    w.watch.islandPid = pid;
  });

  reg.define(/^the visionary rests the pointer on the notch and the island starts opening$/, async (w) => {
    const pid = await ensureIsland(w);
    w.restMs = RULED_REST_MS;
    w.opening = await motion.watchWhile(pid, 1400, { start: 'open', looks: [100, 600] }, () => rest(w, RULED_REST_MS));
    assert.ok(w.opening.start, 'the island never started opening');
  });

  reg.define(/^the visionary moves the pointer off the island and its grace runs out$/, async (w) => {
    const pid = await ensureIsland(w);
    w.closing = await motion.watchWhile(pid, 1900, { start: 'close', looks: [100, 500] }, () => pointerAway());
    assert.ok(w.closing.start, 'the island never started closing');
  });

  reg.define(/^the visionary sees the island no wider than the notch inside the menu bar strip at every moment while it opens, stays open and closes$/, (w) => {
    const { samples, g } = w.watch;
    const n = g.notch;
    assert.ok(samples.length > 100, `only ${samples.length} looks at the island`);
    // Positive control: it opened to the full panel and closed again while watched.
    const bodies = samples.map((s) => motion.parts(s.ax, g).card);
    assert.ok(bodies.some((b) => b && b.w >= OPEN_PANEL_WIDTH - 5), 'the island never opened to the full panel while watched');
    assert.ok(!bodies[bodies.length - 1], 'the island had not closed again by the end of the watch');
    for (const s of samples) {
      for (const f of motion.framesOf(s)) {
        // A wing lies wholly left of the notch; nothing else may be in the strip beside it.
        if (!motion.inStrip(f, g) || f.x + f.w <= n.x + 0.5) continue;
        assert.ok(f.x >= n.x - 0.5 && f.x + f.w <= n.x + n.w + 0.5,
          `${Math.round(s.t - w.watch.start)} ms after the opening started the island spans x ${f.x}-${f.x + f.w} inside the menu bar strip, wider than the notch (${n.x}-${n.x + n.w})`);
      }
    }
  });

  reg.define(/^the visionary sees Chrome's Help menu and the status item right of the notch uncovered the whole time$/, (w) => {
    const { samples, hitOwners } = w.watch;
    const items = [['Help menu', w.help], ['status item', w.status.frame], ...w.beside.map((f) => ['status item', f])];
    for (const s of samples) {
      const t = Math.round(s.t - w.watch.start);
      for (const f of motion.framesOf(s)) {
        for (const [name, item] of items) {
          assert.ok(!motion.overlaps(f, item), `${t} ms after the opening started the island ${JSON.stringify(f)} covers the ${name} at ${JSON.stringify(item)}`);
        }
      }
      // What macOS itself finds there: still Chrome's menu and the status item.
      s.hits.slice(0, 2).forEach((owner, i) => {
        assert.equal(owner, hitOwners[i], `${t} ms after the opening started macOS finds process ${owner} at the ${i ? 'status item' : 'Help menu'}, not its own app`);
      });
    }
  });

  reg.define(/^the visionary sees the open panel as a card below the menu bar strip, its top about 8 points below the notch, with the plain notch above it and nothing joining them$/, (w) => {
    const { samples, g, islandPid } = w.watch;
    const n = g.notch;
    const below = n.y + n.h;
    const near = (a, b, d = 0.5) => Math.abs(a - b) <= d;
    const key = (f) => [f.x, f.y, f.w, f.h].map(Math.round).join(',');
    // The card where it rests: the frame it holds longest while open.
    const counts = new Map();
    for (const s of samples) {
      const { card } = motion.parts(s.ax, g);
      if (card) counts.set(key(card), (counts.get(key(card)) || 0) + 1);
    }
    const [restKey, restCount] = [...counts].sort((a, b) => b[1] - a[1])[0] || [];
    assert.ok(restKey && restCount > 10, 'the open card was never seen at rest');
    let resting = 0;
    for (const s of samples) {
      const t = Math.round(s.t - w.watch.start);
      const { notchPart, card } = motion.parts(s.ax, g);
      // The plain notch above, the same at every moment: its window exactly
      // over the camera housing, reaching no lower than the notch.
      assert.ok(notchPart && near(notchPart.x, n.x) && near(notchPart.w, n.w) && near(notchPart.y, n.y) && near(notchPart.h, n.h),
        `${t} ms after the opening started the notch was not plain: ${JSON.stringify(notchPart)} against the notch ${JSON.stringify(n)}`);
      if (!card) continue;
      assert.ok(card.y >= g.stripBottom - 0.5, `${t} ms after the opening started the card's top is at y ${card.y}, inside the menu bar strip`);
      assert.ok(near(card.x + card.w / 2, n.x + n.w / 2, 1), `${t} ms after the opening started the card ${JSON.stringify(card)} is not centred under the notch (centre ${n.x + n.w / 2})`);
      // Nothing joining them: no window of the island's, by Accessibility or
      // by the window server, anywhere between the notch and the card.
      if (card.y > below + 1) {
        const gap = { x: card.x, y: below + 0.5, w: card.w, h: card.y - below - 1 };
        for (const f of motion.framesOf(s)) {
          assert.ok(!motion.overlaps(f, gap, 0.25), `${t} ms after the opening started the island ${JSON.stringify(f)} lies in the gap ${JSON.stringify(gap)} between the notch and the card`);
        }
      }
      if (key(card) !== restKey) continue;
      resting++;
      assert.ok(card.w >= OPEN_PANEL_WIDTH - 1, `the resting card is ${card.w} wide, not the open size`);
      assert.ok(Math.abs(card.y - (below + CARD_GAP)) <= CARD_GAP_SLACK,
        `${t} ms after the opening started the open card's top is ${card.y - below} points below the notch, not about ${CARD_GAP}`);
      // What macOS itself finds there: in the gap, not the island (what is
      // under it); inside the card, the island (so the hit test sees it).
      const [, , inGap, inCard] = s.hits;
      assert.ok(typeof inGap === 'number' && inGap !== islandPid,
        `${t} ms after the opening started macOS finds ${inGap === islandPid ? 'the island' : 'nothing'} in the gap at ${JSON.stringify(w.gapPoint)}`);
      assert.equal(inCard, islandPid, `${t} ms after the opening started macOS finds process ${inCard}, not the island, inside the open card at ${JSON.stringify(w.cardPoint)}`);
    }
    assert.ok(resting > 10, `the open card was seen at rest only ${resting} times`);
  });

  /** The opening's samples from its start, with the shape's parts. */
  function sinceStart(watch) {
    return watch.samples.filter((s) => s.t >= watch.start - 1)
      .map((s) => ({ t: s.t - watch.start, ...motion.parts(s.ax, watch.g) }));
  }

  /** The open size the motion came to rest at: the card at the watch's end. */
  function restingBody(seq) {
    const b = seq[seq.length - 1].card;
    assert.ok(b && b.w >= OPEN_PANEL_WIDTH - 5 && b.h > 100, `the island did not end the watch open: ${JSON.stringify(b)}`);
    return b;
  }

  reg.define(/^the visionary sees the island grow out of the notch's own shape over about 0\.4 seconds rather than appear at once$/, async (w) => {
    const watch = await w.opening;
    assert.ok(watch.start, 'the island never started opening');
    const n = watch.g.notch;
    const seq = sinceStart(watch);
    const final = restingBody(seq);
    const first = seq.find((s) => s.card);
    assert.ok(first.card.w <= n.w + 0.2 * (final.w - n.w) && first.card.h <= 0.2 * final.h,
      `the island appeared at once: ${JSON.stringify(first.card)} at its first look, against ${JSON.stringify(final)} open`);
    // Out of the notch's own shape: the plain notch there, and the card's
    // first look starting right under it, not already down at its open place.
    assert.ok(first.notchPart && first.notchPart.x === n.x && first.notchPart.w === n.w, 'the opening did not start from the notch itself');
    assert.ok(first.card.y < final.y - 0.5 || final.y - (n.y + n.h) < 1,
      `the card first appeared at y ${first.card.y}, already at its open place ${final.y}, not out of the notch`);
    const partway = seq.filter((s) => s.card && s.card.h < final.h - 2 && s.card.w < final.w - 2);
    assert.ok(partway.length >= 5, `only ${partway.length} looks saw the island partway grown`);
    const near = (s) => s.card && Math.abs(s.card.w - final.w) <= 1 && Math.abs(s.card.h - final.h) <= 1
      && Math.abs(s.card.x - final.x) <= 1 && Math.abs(s.card.y - final.y) <= 1;
    let settledAt = null;
    for (let i = seq.length - 1; i >= 0 && near(seq[i]); i--) settledAt = seq[i].t;
    assert.ok(settledAt !== null && settledAt >= 200 && settledAt <= 650,
      `the island came to its open size ${Math.round(settledAt)} ms after the opening started, not in about 0.4 s`);
  });

  reg.define(/^the visionary sees its edges pass their resting places by at most 4 points before settling$/, async (w) => {
    const watch = await w.opening;
    const seq = sinceStart(watch);
    const final = restingBody(seq);
    let worst = 0;
    for (const s of seq) {
      if (!s.card) continue;
      const b = s.card;
      // All four edges: sideways, the foot, and the top dipping past its place.
      worst = Math.max(worst, final.x - b.x, b.x + b.w - (final.x + final.w), b.y + b.h - (final.y + final.h), b.y - final.y);
    }
    assert.ok(worst <= 4, `an edge passed its resting place by ${worst} points`);
  });

  /** The full look the harness took `ms` after the motion started, parsed. */
  function lookAt(watch, ms) {
    const l = watch.looks.find((x) => x.at === ms);
    assert.ok(l, `the island was not looked at ${ms} ms after the motion started`);
    const late = l.look.t - watch.start - ms;
    assert.ok(Math.abs(late) <= 40, `the look came ${Math.round(late)} ms off ${ms} ms`);
    return island.parse(l.look.windows, watch.g.notch);
  }

  reg.define(/^the visionary sees (the island partway grown, larger than the notch and smaller than the open panel|the island at its full open size showing "Wonderwall" and "Oasis") (0\.1|0\.6) seconds after the opening started$/, (w, state, after) => {
    const watch = w.opening;
    const final = restingBody(sinceStart(watch));
    const v = lookAt(watch, Math.round(Number(after) * 1000));
    if (state.includes('partway')) {
      assert.ok(v.card, 'the island was the plain notch, not growing');
      assert.ok(v.card.w > watch.g.notch.w + 1 && v.card.h > 1, `the island was no larger than the notch: ${JSON.stringify(v.card)}`);
      assert.ok(v.card.w < final.w - 1 && v.card.h < final.h - 1, `the island was already at its open size: ${JSON.stringify(v.card)}`);
    } else {
      assert.ok(v.card && Math.abs(v.card.w - final.w) <= 1 && Math.abs(v.card.h - final.h) <= 1,
        `the island was not at its open size: ${JSON.stringify(v.card)} against ${JSON.stringify(final)}`);
      for (const text of ['Wonderwall', 'Oasis']) {
        assert.ok(v.texts.includes(text), `the island did not show "${text}" (it showed ${v.texts.join(', ') || 'nothing'})`);
      }
    }
  });

  reg.define(/^the visionary sees (the island partway shrunk, smaller than the open panel and larger than the notch|the plain notch) (0\.1|0\.5) seconds after the closing started$/, (w, state, after) => {
    const watch = w.closing;
    const n = watch.g.notch;
    const before = watch.samples.filter((s) => s.t < watch.start).map((s) => motion.parts(s.ax, watch.g).card).filter(Boolean);
    const open = before[before.length - 1];
    assert.ok(open && open.w >= OPEN_PANEL_WIDTH - 5, 'the island was not open before the closing');
    const v = lookAt(watch, Math.round(Number(after) * 1000));
    if (state.includes('partway')) {
      assert.ok(v.card, 'the island was already the plain notch');
      assert.ok(v.card.w < open.w - 1 && v.card.h < open.h - 1, `the island had not shrunk: ${JSON.stringify(v.card)}`);
      assert.ok(v.card.w > n.w + 1 && v.card.h > 1, `the island was no larger than the notch: ${JSON.stringify(v.card)}`);
    } else {
      assert.ok(island.isPlainNotch(v, n), `the island was not the plain notch: ${JSON.stringify(v.frames)}`);
    }
  });

  reg.define(/^the visionary sees the island never smaller than the notch, and never larger than the open panel, on its way back$/, (w) => {
    const watch = w.closing;
    const n = watch.g.notch;
    const before = watch.samples.filter((s) => s.t < watch.start).map((s) => motion.parts(s.ax, watch.g).card).filter(Boolean);
    const open = before[before.length - 1];
    const after = watch.samples.filter((s) => s.t >= watch.start);
    assert.ok(after.length > 50, 'too few looks while the island closed');
    for (const s of after) {
      const t = Math.round(s.t - watch.start);
      const { notchPart, card } = motion.parts(s.ax, watch.g);
      assert.ok(notchPart && notchPart.x <= n.x + 0.5 && notchPart.x + notchPart.w >= n.x + n.w - 0.5 && notchPart.h >= n.h - 0.5,
        `${t} ms after the closing started the island was smaller than the notch: ${JSON.stringify(notchPart)}`);
      if (!card) continue;
      assert.ok(card.w >= n.w - 0.5, `${t} ms after the closing started the island was narrower than the notch: ${JSON.stringify(card)}`);
      assert.ok(card.w <= open.w + 0.5 && card.h <= open.h + 0.5 && card.x >= open.x - 0.5 && card.y + card.h <= open.y + open.h + 0.5,
        `${t} ms after the closing started the island was larger than the open panel: ${JSON.stringify(card)}`);
    }
  });

};

// Shared with the other features' steps (each feature keeps its own registry).
module.exports.helpers = {
  notch, away, pointerAway, ensureIsland, playing, plainNotch, rest, openOnMusicPage, openByRest,
  button, clickButton, showsSong, musicSays, dotTime, restDeadline, assertFocusKept, RULED_REST_MS,
};
