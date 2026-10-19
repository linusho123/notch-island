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
const registry = require('../support/registry');
const procs = require('../support/procs');
const { root, testBundleID } = require('../support/paths');
const { osa } = music;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mmss = (t) => {
  const [m, s] = t.split(':').map(Number);
  return m * 60 + s;
};
const center = (f) => ({ x: f.x + f.w / 2, y: f.y + f.h / 2 });

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

async function plainNotch(w) {
  const pid = await ensureIsland(w);
  await pointerAway();
  const n = await notch();
  await island.waitFor(pid, (v) => island.isPlainNotch(v, n), 3000,
    'the island is not closed to the plain notch');
}

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
  assert.ok(Math.abs(p.y - screen.y) <= 1, `the panel's top is at y ${p.y}, not at the top of the built-in screen`);
  assert.ok(p.y + p.h > n.y + n.h + 20, 'the panel does not reach down below the notch');
  assert.ok(p.x <= n.x + n.w / 2 && p.x + p.w >= n.x + n.w / 2, 'the panel is not under the notch');
  assert.ok(p.x >= screen.x && p.x + p.w <= screen.x + screen.w, 'the panel is not inside the built-in screen');
}

/** Opening never takes the focus from the app in front. */
async function assertFocusKept(w) {
  if (!w.frontBefore) return;
  const now = await harness.frontmost();
  assert.equal(now.pid, w.frontBefore.pid,
    `the island took the focus: ${now.name} is in front instead of ${w.frontBefore.name}`);
}

async function openOnMusicPage(w, ms = 1500) {
  const pid = w.island.pid;
  const view = await island.waitFor(pid, (v) => v.open && v.page === 'music', ms,
    'the island did not open on the music page');
  await assertHangsFromNotch(view);
  await assertFocusKept(w);
  return view;
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
    await harness.arriveAndClick(pid, c.x, c.y, 50);
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
    await ensureIsland(w);
    const running = (await osa('tell application "System Events" to get name of every process whose bundle identifier is "com.colliderli.iina"')).trim();
    assert.equal(running, '', 'IINA is already running; quit it before the tests so they never touch it');
    const media = path.join(root, 'build', 'test-media');
    fs.mkdirSync(media, { recursive: true });
    const movie = path.join(media, 'test-movie.mov');
    if (!fs.existsSync(movie)) await harness.makeMovie(movie, 180);
    const iina = procs.start('IINA', '/Applications/IINA.app/Contents/MacOS/IINA', [movie]);
    w.defer(() => procs.stop(iina));
    await island.until(async () => (await harness.windows(iina.pid).catch(() => [])).some((x) => x.frame && x.frame.w > 300),
      15000, 'IINA never showed the movie');
    await harness.activate(iina.pid);
    await sleep(500);
    await harness.fullscreen(iina.pid);
    await island.until(async () => (await harness.windows(iina.pid)).some((x) => x.fullScreen), 10000,
      'IINA did not go fullscreen');
    await pointerAway();
    await sleep(1500); // the space animation
    const { notch: n, frame } = await harness.builtIn();
    // A real screenshot of the menu bar strip either side of the notch: black,
    // with no app menu drawn there. (macOS's own screen-capture indicator may
    // light a dot on the right while the shot is taken, so the right side is
    // held to its mean.)
    const left = await harness.regionStats(frame.x, 0, n.x - frame.x, n.h);
    const right = await harness.regionStats(n.x + n.w, 0, frame.x + frame.w - n.x - n.w, n.h);
    assert.ok(left.max < 0.12 && right.mean < 0.06,
      `the menu bar strip is not black (brightest ${left.max.toFixed(2)} left, mean ${right.mean.toFixed(2)} right): the menu bar shows`);
  });

  reg.define(/^Apple Music is playing "Wonderwall"$/, async (w) => {
    await playing(w, 'Wonderwall', 30);
  });

  // Whens ----------------------------------------------------------------

  reg.define(/^the visionary rests the (trackpad |mouse |)pointer on the notch for (about 0\.3 seconds|2 seconds)$/, async (w, _kind, howLong) => {
    w.restMs = howLong === '2 seconds' ? 2000 : 300;
    await rest(w, w.restMs);
  });

  reg.define(/^the visionary rests the pointer on the notch$/, async (w) => {
    w.restMs = 300;
    await rest(w, 300);
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
    const list = await harness.sweep(w.island.pid, a, b, 40, 12, 800);
    w.sweep = list.map((s) => ({ t: s.t, pointer: s.pointer, view: island.parse(s.windows, n) }));
    w.sweepNotch = n;
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
    w.afterRelease = (await harness.watch(w.island.pid, 1200, 30))
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
      const line = view.textElements.find((e) => e.value === 'Apple Music');
      assert.ok(line, `the island shows no source line naming Apple Music (it shows ${view.texts.join(', ')})`);
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
    w.restMs = 300;
    await rest(w, 300);
  });

  // Thens ----------------------------------------------------------------

  reg.define(/^the visionary sees the island open downward showing "([^"]+)" and "([^"]+)"$/, async (w, title, artist) => {
    const view = await openOnMusicPage(w, Math.max(0, w.arrivedAt + w.restMs + 300 - Date.now()));
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

  reg.define(/^the visionary sees the island open at once on the music page, without waiting for a rest$/, async (w) => {
    const first = w.afterClick.find((s) => s.view.open && s.view.page === 'music');
    assert.ok(first, 'the island did not open on the click');
    const ms = first.t - w.clickedAt;
    assert.ok(ms < 200, `the island took ${Math.round(ms)} ms to open after the click, as long as a rest`);
    await openOnMusicPage(w);
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
      await openOnMusicPage(w, 200);
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
    // From soon after the release on, the dot never stood at the dragged-to spot.
    const settled = w.afterRelease.filter((x) => x.t - w.afterRelease[0].t > 400);
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

  reg.define(/^the visionary sees the Apple Music window come to the front over Messages$/, async () => {
    await island.until(async () => (await harness.frontmost()).bundleID === 'com.apple.Music', 4000,
      'Apple Music did not come to the front');
    const front = await harness.frontmost();
    await island.until(async () => (await harness.windows(front.pid)).some((x) => !x.minimized && x.frame && x.frame.w > 200),
      4000, 'Apple Music came forward without a window');
  });

  reg.define(/^the visionary sees (the island open on the music page|the island open at once on the music page|the shelf page come up from below, as with a two-finger scroll)$/, async (w, result) => {
    if (result === 'the island open on the music page') {
      const deadline = w.arrivedAt + (w.restMs ?? 300) + 300;
      await openOnMusicPage(w, Math.max(0, deadline - Date.now()));
    } else if (result.startsWith('the island open at once')) {
      const first = w.afterClick.find((s) => s.view.open && s.view.page === 'music');
      assert.ok(first, 'the island did not open on the click');
      assert.ok(first.t - w.clickedAt < 200, `the island took ${Math.round(first.t - w.clickedAt)} ms to open`);
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
};
