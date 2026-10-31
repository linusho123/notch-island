'use strict';
// music-sources.feature, the parts that need no companion Chrome extension
// (P2): Apple Music, IINA, QuickTime Player and Music playing a downloaded
// file; the output device on the source line (injected `JBL Flip 5`, BUILD-
// PLAN Q2; the MacBook speakers from the real system); a source quitting and
// play reopening it where it was; Control Center and the media keys. Every
// Then reads the far side: the island through Accessibility; Apple Music,
// Music and QuickTime Player through their own AppleScript dictionaries; IINA
// through the system now-playing service, read by the harness's own reader.
// No Then reads the test input the Givens feed.
const assert = require('node:assert/strict');
const harness = require('../support/harness');
const { showsFaceWithCount } = require('../support/looks');
const { planMacBookSpeakers } = require('../support/speakers');
const island = require('../support/island');
const music = require('../support/music');
const players = require('../support/players');
const procs = require('../support/procs');
const chrome = require('../support/chrome');
const standIns = require('../support/stand-ins');
const paths = require('../support/paths');
const path = require('node:path');
const { helpers } = require('./music-panel.steps');

const {
  ensureIsland, playing, plainNotch, rest, openOnMusicPage, button, clickButton, musicSays,
  pointerAway, RULED_REST_MS,
} = helpers;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const JBL = { name: 'JBL Flip 5', builtIn: false };

// ---------------------------------------------------------------- helpers

/** "the file "x"", "the video "x"", "the track "x"" or "x": what the island shows as the title. */
const titleOf = (text) => (/^the (?:file|video|track) "(.+)"$/.exec(text) || /^"(.+)"$/.exec(text) || [])[1];

/** The Chrome sources, by the site the source line names. */
const CHROME_SOURCES = { 'a youtube.com tab in Chrome': 'YouTube', 'a soundcloud.com tab in Chrome': 'SoundCloud' };
const SOURCE_RE = '(Apple Music|IINA|QuickTime Player|Music|a youtube\\.com tab in Chrome|a soundcloud\\.com tab in Chrome)';
const TITLE_RE = '("[^"]+"|the (?:file|video|track) "[^"]+")';

/**
 * The sound goes out through `speaker`. A Bluetooth speaker is the injected
 * output device (BUILD-PLAN Q2); the MacBook speakers are the real system's
 * default output, which must then be the built-in one.
 */
async function soundThrough(w, speaker) {
  if (speaker === 'the MacBook speakers') {
    // The real system's output when that is the built-in speakers. With
    // other output connected (headphones) the run fails with the reason,
    // unless injecting the built-in speakers was asked for (and then says so).
    const plan = planMacBookSpeakers(await harness.h('output-device'), process.env);
    if (plan.inject) {
      process.stderr.write(`  note: ${plan.note} for this scenario\n`);
      island.feed(w, { outputDevice: { name: 'MacBook Air Speakers', builtIn: true } }); // test input (Q2)
    }
    return;
  }
  const m = /^(?:the Bluetooth speaker )?"(.+)"$/.exec(speaker);
  assert.ok(m, `unknown speaker ${speaker}`);
  island.feed(w, { outputDevice: { name: m[1], builtIn: false } }); // test input (Q2)
}

/** Start `title` playing from `source`, with no other source of the tests playing. */
async function startSource(w, source, title, at = 30) {
  const name = titleOf(title);
  assert.ok(name, `cannot read the title ${title}`);
  if (source === 'Apple Music') {
    await playing(w, name, at);
  } else if (source === 'IINA') {
    await music.pause().catch(() => {});
    await players.playInIINA(w, await players.movie(name, 600), at);
  } else if (source === 'QuickTime Player') {
    await music.pause().catch(() => {});
    await players.playInQuickTime(w, await players.movie(name, 120), at);
  } else if (CHROME_SOURCES[source]) {
    await music.pause().catch(() => {});
    w.tab = await chrome.playInTab(w, name, at);
  } else if (source === 'Music') {
    const file = name.endsWith('.mp3') ? players.mp3(name, 180) : players.wav(name, 180);
    await players.playFileInMusic(w, file);
    w.defer(() => music.pause().catch(() => {}));
  } else {
    throw new Error(`unknown source ${source}`);
  }
  w.title = name;
}

async function openIsland(w) {
  await rest(w, 350);
  return openOnMusicPage(w);
}

async function sourceLineReads(w, line, ms = 2000) {
  let last;
  try {
    return await island.waitFor(w.island.pid, (v) => {
      last = v.sourceLine?.value;
      return v.open && last === line;
    }, ms, `the source line does not read "${line}"`);
  } catch (e) {
    e.message += ` (it reads "${last}")`;
    throw e;
  }
}

/** Watch the island for `ms`: every look must show the plain notch. */
async function staysPlain(w, ms) {
  const n = (await harness.builtIn()).notch;
  const samples = await harness.watch(w.island.pid, ms, 40);
  assert.ok(samples.length > ms / 100, 'the island was not watched');
  for (const s of samples) {
    const v = island.parse(s.windows, n);
    assert.ok(island.isPlainNotch(v, n), `the island drew something: ${JSON.stringify({ frames: v.frames, texts: v.texts })}`);
  }
}

/** The play or pause button the island shows matches whether Music plays. */
async function buttonMatchesMusic(w) {
  const s = await music.state();
  const want = s.state === 'playing' ? 'Pause' : 'Play';
  await island.waitFor(w.island.pid, (v) => v.buttons.some((b) => b.label === want), 2000,
    `the island does not show ${want} while Music is ${s.state}`);
}

async function controlCenterPid() {
  const pid = Number(require('node:child_process').execFileSync('pgrep', ['-x', 'ControlCenter'], { encoding: 'utf8' }).trim().split('\n')[0]);
  assert.ok(pid, 'Control Center is not running');
  return pid;
}

/** Use the Now Playing tile in Control Center, as the visionary would. */
async function controlCenter(w, action) {
  const pid = await controlCenterPid();
  await harness.h('press', pid, 'com.apple.menuextra.controlcenter');
  w.defer(() => harness.key(53).catch(() => {}));
  const label = action === 'pauses' ? 'pause' : 'next';
  // The tile shows Wonderwall playing (its pause button up), as the
  // visionary would see it before clicking.
  let seen = [];
  await island.until(async () => {
    const els = (await harness.h('tree', pid)).elements;
    seen = els.filter((e) => e.role === 'AXStaticText' || e.role === 'AXButton').map((e) => e.value || e.description);
    return els.some((e) => e.role === 'AXStaticText' && /Wonderwall/.test(String(e.value || '')))
      && els.some((e) => e.role === 'AXButton' && e.description === 'pause')
      && els.some((e) => e.role === 'AXButton' && e.description === label);
  }, 6000, 'Control Center shows no Now Playing tile with "Wonderwall" playing').catch((e) => {
    e.message += ` (it shows ${seen.join(', ')})`;
    throw e;
  });
  await harness.h('press', pid, label);
  await sleep(300);
  await harness.key(53); // close Control Center
}

/** The media keys go to the app the system shows as now playing: Music here. */
async function musicHoldsTheMediaKeys() {
  await players.until(async () => (await players.nowPlaying()).bundleID === 'com.apple.Music', 5000,
    'the system does not show Music as now playing, so a media key would reach another app');
}

const center = (f) => ({ x: f.x + f.w / 2, y: f.y + f.h / 2 });

/** The card's faces, as the examples name them. */
const FACES = {
  'the IINA file': 'rehearsal.mkv',
  'the Apple Music song': 'Wonderwall',
  'the YouTube video': 'Lecture 4: Fourier Series',
};

/** Apple Music plays Wonderwall, then the lecture starts in a youtube.com tab. */
async function musicThenLecture(w) {
  await ensureIsland(w);
  await playing(w, 'Wonderwall', 30);
  await sleep(1200);
  w.tab = await chrome.playInTab(w, 'Lecture 4: Fourier Series', 30);
}

/** The YouTube home feed's muted hover preview plays in the test Chrome. */
async function mutedPreview(w) {
  const browser = await chrome.companion(w);
  const tab = await browser.open(standIns.urls.home());
  await tab.waitMedia((m) => !m.paused && m.muted && m.currentTime > 0, 15000, 'the muted preview does not play');
  return tab;
}

/** The visionary clicks the preview's own unmute control. */
async function unmute(tab) {
  await tab.click('#unmute');
  await tab.waitMedia((m) => !m.muted && !m.paused, 3000, 'the preview did not unmute');
}

/** Click the flip control once and wait for the count to move on. */
async function flipOnce(w) {
  w.faceSeen = null; // the card turns: the face seen before no longer holds
  const view = await island.look(w.island.pid);
  const before = view.count?.value;
  const c = center(button(view, 'Flip').frame);
  await harness.glide(c.x, c.y, 4, 8);
  await harness.click(c.x, c.y);
  await island.waitFor(w.island.pid, (v) => v.count?.value !== before, 1500, 'the flip control did nothing');
  await sleep(500); // the turn plays out
}

// --------------------------------------------------------------- definer

module.exports = (reg) => {
  // Givens ---------------------------------------------------------------

  reg.define(new RegExp(`^${SOURCE_RE} is playing ${TITLE_RE} and nothing else is playing$`), async (w, source, title) => {
    await ensureIsland(w);
    await startSource(w, source, title);
  });

  reg.define(new RegExp(`^${SOURCE_RE} is playing ${TITLE_RE} out through (the MacBook speakers|the Bluetooth speaker "[^"]+") and nothing else is playing$`), async (w, source, title, speaker) => {
    await ensureIsland(w);
    await soundThrough(w, speaker);
    await startSource(w, source, title);
  });

  reg.define(/^Apple Music is playing "Wonderwall" out through the Bluetooth speaker "JBL Flip 5"$/, async (w) => {
    await ensureIsland(w);
    island.feed(w, { outputDevice: JBL }); // test input (Q2)
    await playing(w, 'Wonderwall', 30);
  });

  reg.define(/^"Wonderwall" is playing out through "JBL Flip 5" and the island is closed to the plain notch$/, async (w) => {
    await ensureIsland(w);
    island.feed(w, { outputDevice: JBL }); // test input (Q2)
    await playing(w, 'Wonderwall', 30);
    await plainNotch(w);
  });

  reg.define(/^the island is open over "Wonderwall" playing in Apple Music out through "JBL Flip 5", the source line reading "Apple Music · JBL Flip 5"$/, async (w) => {
    await ensureIsland(w);
    island.feed(w, { outputDevice: JBL }); // test input (Q2)
    await playing(w, 'Wonderwall', 30);
    await openIsland(w);
    await sourceLineReads(w, 'Apple Music · JBL Flip 5');
  });

  reg.define(/^the visionary (quit Apple Music|quit IINA|quit QuickTime Player|quit Music) while it played ("Wonderwall"|the file "[^"]+") at ([\d:]+), and nothing else is playing$/, async (w, closed, title, spot) => {
    await ensureIsland(w);
    const at = players.seconds(spot);
    const name = titleOf(title);
    if (closed === 'quit Apple Music') {
      // Music announces state changes, not a move of its playhead: the
      // visionary moves to the spot while paused and plays on from there, so
      // Music itself tells the island it plays from that spot.
      await playing(w, name, 5);
      await music.pause();
      await music.seek(at);
      await music.osa('tell application "Music" to play');
      await musicSays((s) => s.state === 'playing' && s.position >= at, 3000, `Music does not play on from ${spot}`);
      await sleep(1200); // the island sees it play
      await quitMusic();
    } else if (closed === 'quit QuickTime Player') {
      await music.pause().catch(() => {});
      await players.playInQuickTime(w, await players.movie(name, 600), at);
      await sleep(1200); // the island sees it play
      await players.quitQuickTime();
    } else if (closed === 'quit Music') {
      // A downloaded file, played by Music itself: moved to the spot while
      // paused and played on from there, as for a song.
      const file = name.endsWith('.mp3') ? players.mp3(name, 600) : players.wav(name, 600);
      await players.playFileInMusic(w, file);
      await music.pause();
      await music.seek(at);
      await music.osa('tell application "Music" to play');
      await musicSays((s) => s.state === 'playing' && s.position >= at, 3000, `Music does not play on from ${spot}`);
      await sleep(1200); // the island sees it play
      await quitMusic();
    } else {
      await music.pause().catch(() => {});
      const file = await players.movie(name, 3600);
      await players.playInIINA(w, file, at);
      await sleep(1200);
      await players.quitIINA(w);
      players.forgetIINAResume(file); // only the island may know where it was
    }
    w.closedApp = closed.replace(/^quit /, '');
    w.spot = at;
    w.title = name;
    w.closedAt = Date.now();
  });

  reg.define(/^QuickTime Player is playing the lone file "holiday\.mov" with nothing next after it$/, async (w) => {
    await ensureIsland(w);
    await music.pause().catch(() => {});
    await players.playInQuickTime(w, await players.movie('holiday.mov', 120), 20);
    w.app = 'QuickTime Player';
  });

  reg.define(/^Apple Music is playing "Wonderwall" as the first song in the queue with nothing before it$/, async (w) => {
    await ensureIsland(w);
    await music.playFirstInQueue('Wonderwall');
    w.defer(() => music.pause().catch(() => {}));
    w.app = 'Apple Music';
  });

  reg.define(/^the island is running and Apple Music is playing "Wonderwall" with "Champagne Supernova" next$/, async (w) => {
    await ensureIsland(w);
    await playing(w, 'Wonderwall', 30); // the test playlist's order: Champagne Supernova next
    await plainNotch(w);
  });

  // Whens ----------------------------------------------------------------

  reg.define(/^the visionary rests the pointer on the notch$/, async (w) => {
    w.restMs = RULED_REST_MS;
    await rest(w, RULED_REST_MS);
  });

  reg.define(/^the speaker disconnects mid-song$/, async (w) => {
    // The injected Bluetooth speaker goes away: the default output falls
    // back to the built-in speakers (BUILD-PLAN Q2).
    w.musicBefore = await music.state();
    island.feed(w, { outputDevice: { name: 'MacBook Air Speakers', builtIn: true } });
  });

  reg.define(/^the visionary quits Apple Music$/, async (w) => {
    await sleep(1000); // the island has seen it play
    await quitMusic();
  });

  reg.define(/^the visionary opens the island and clicks play$/, async (w) => {
    await openIsland(w);
    await island.waitFor(w.island.pid, (v) => v.texts.includes(w.title) && v.buttons.some((b) => b.label === 'Play'),
      2000, `the island does not offer "${w.title}" paused and ready`);
    await clickButton(w, 'Play');
  });

  reg.define(/^the visionary clicks (skip|back twice within the first 3 seconds) on the island$/, async (w, what) => {
    await openIsland(w);
    // The visionary can click it: the button is there and not greyed out.
    const view = await island.look(w.island.pid);
    const label = what === 'skip' ? 'Skip' : 'Back';
    assert.ok(button(view, label).enabled, `${label.toLowerCase()} is greyed out on the island`);
    if (what === 'skip') {
      w.appBefore = await players.quickTimeState();
      await clickButton(w, 'Skip');
      await sleep(1500);
      w.appAfter = await players.quickTimeState();
    } else {
      await music.seek(1);
      await clickButton(w, 'Back');
      await sleep(300);
      await clickButton(w, 'Back');
      await sleep(1500);
      w.appAfter = await music.state();
    }
  });

  reg.define(/^the visionary (pauses|skips) from the Now Playing tile in Control Center$/, async (w, action) => {
    await controlCenter(w, action);
  });

  reg.define(/^the visionary presses the keyboard's (play or pause|skip) key$/, async (w, key) => {
    await musicHoldsTheMediaKeys();
    await harness.h('media-key', key === 'skip' ? 'next' : 'play');
  });

  // Thens ----------------------------------------------------------------

  reg.define(/^the visionary sees ("[^"]+"|the file "[^"]+"|the video "[^"]+"|the track "[^"]+") on the music page with back, pause and skip$/, async (w, title) => {
    const name = titleOf(title.replace(/^the (video|track) /, 'the file '));
    const view = await island.waitFor(w.island.pid, (v) => v.open && v.page === 'music' && v.texts.includes(name), 3000,
      `the music page does not show "${name}"`);
    const shown = [...view.buttons].filter((b) => ['Back', 'Pause', 'Play', 'Skip'].includes(b.label))
      .sort((a, b) => a.frame.x - b.frame.x);
    assert.deepEqual(shown.map((b) => b.label), ['Back', 'Pause', 'Skip']);
    assert.ok(shown.every((b) => b.enabled), 'a button is greyed out');
  });

  reg.define(/^the visionary sees "Wonderwall" on the music page$/, async (w) => {
    await island.waitFor(w.island.pid, (v) => v.open && v.page === 'music' && v.texts.includes('Wonderwall'), 3000,
      'the music page does not show "Wonderwall"');
    assert.equal((await music.state()).name, 'Wonderwall');
  });

  reg.define(/^the visionary sees "JBL Flip 5" on its source line$/, async (w) => {
    const view = await island.look(w.island.pid);
    assert.ok(view.sourceLine, 'the music page has no source line');
    assert.match(view.sourceLine.value, / · JBL Flip 5$/, `the source line reads "${view.sourceLine.value}"`);
  });

  reg.define(/^the visionary sees the source line read "([^"]+)"$/, async (w, line) => {
    await openOnMusicPage(w);
    await sourceLineReads(w, line);
  });

  reg.define(/^the visionary sees the notch stay plain, with no wing and no notice$/, async (w) => {
    await staysPlain(w, 2500);
    // The control: the drop did reach the island. Opened afterwards, its
    // source line names the app alone.
    await pointerAway();
    await sleep(200);
    await openIsland(w);
    await openOnMusicPage(w);
    await sourceLineReads(w, 'Apple Music');
  });

  reg.define(/^the visionary sees the source line read "Apple Music", the speaker part gone$/, async (w) => {
    await sourceLineReads(w, 'Apple Music');
  });

  reg.define(/^the visionary sees the pause or play button match whether Apple Music kept playing$/, async (w) => {
    await buttonMatchesMusic(w);
  });

  reg.define(/^the visionary, resting the pointer on the notch, sees "Wonderwall" paused and ready on the music page$/, async (w) => {
    await pointerAway();
    await sleep(200);
    await openIsland(w);
    const view = await island.waitFor(w.island.pid, (v) => v.texts.includes('Wonderwall') && v.buttons.some((b) => b.label === 'Play'),
      2000, 'the island does not show Wonderwall paused and ready');
    assert.ok(button(view, 'Play').enabled, 'play is greyed out');
    assert.ok(!view.buttons.some((b) => b.label === 'Pause'), 'the island shows pause');
    assert.equal(players.running('com.apple.Music'), false, 'Music is running again: the island started it');
  });

  reg.define(/^the visionary sees (Apple Music|IINA|Chrome|QuickTime Player|Music) open ("Wonderwall"|"Lecture 4: Fourier Series"|the track "late night mix"|the file "[^"]+") again$/, async (w, app, title) => {
    const name = titleOf(title);
    if (app === 'Chrome') {
      // The test Chrome itself has a tab of that page playing again.
      w.reopened = await w.chrome.browser.find((t) => t.title.startsWith(name), 8000,
        `Chrome did not open "${name}" again`);
      await w.reopened.waitMedia((m) => !m.paused && !m.muted, 8000, `Chrome does not play "${name}" again`);
    } else if (app === 'Apple Music') {
      await musicSays((s) => s.state === 'playing' && s.name === name, 8000, `Music did not open "${name}" again`);
    } else if (app === 'QuickTime Player') {
      await players.until(async () => {
        const s = await players.quickTimeState();
        return s && s.name.startsWith(name.replace(/\.[^.]+$/, '')) && s.playing;
      }, 15000, `QuickTime Player did not open "${name}" again`);
    } else if (app === 'Music') {
      await players.until(async () => path.basename(await players.musicFile()) === name, 15000,
        `Music did not open "${name}" again`);
    } else {
      await players.until(async () => {
        const s = await players.iinaState();
        return s && s.title === name && s.playing;
      }, 15000, `IINA did not open "${name}" again`);
    }
  });

  reg.define(/^the visionary hears ("Wonderwall"|"Lecture 4: Fourier Series"|the track "late night mix"|the file "[^"]+") playing from ([\d:]+), not from the start$/, async (w, title, spot) => {
    const at = players.seconds(spot);
    const since = (Date.now() - w.closedAt) / 1000;
    const check = (pos) => pos >= at - 1 && pos <= at + since + 3;
    if (titleOf(title) === 'Lecture 4: Fourier Series' || titleOf(title) === 'late night mix') {
      const m = await w.reopened.media();
      assert.ok(!m.paused && check(m.currentTime), `the lecture plays from ${m.currentTime.toFixed(1)} s, not from ${spot}`);
    } else if (titleOf(title) === 'Wonderwall') {
      const s = await musicSays((x) => x.state === 'playing' && check(x.position), 6000,
        `Music does not play Wonderwall from ${spot}`);
      assert.equal(s.name, 'Wonderwall');
    } else if (w.closedApp === 'QuickTime Player') {
      let last;
      await players.until(async () => {
        last = await players.quickTimeState();
        return last && last.playing && check(last.time);
      }, 10000, `QuickTime Player does not play from ${spot}`).catch((e) => {
        e.message += ` (QuickTime Player is at ${last && last.time})`;
        throw e;
      });
    } else if (w.closedApp === 'Music') {
      const file = titleOf(title);
      const s = await musicSays((x) => x.state === 'playing' && check(x.position), 6000,
        `Music does not play ${file} from ${spot}`);
      assert.equal(path.basename(await players.musicFile()), file, `Music plays ${s.name}, not ${file}`);
    } else {
      let last;
      await players.until(async () => {
        last = await players.iinaState();
        return last && last.playing && check(last.elapsed);
      }, 10000, `IINA does not play from ${spot}`).catch((e) => {
        e.message += ` (IINA is at ${last && last.elapsed})`;
        throw e;
      });
    }
  });

  reg.define(/^the visionary sees (QuickTime Player|Apple Music) handle it as a press of its own (skip|back) control$/, async (w, app, control) => {
    // The app's own control, pressed by the harness as the keyboard's media
    // key, from the same place, must leave the app where the island's click did.
    if (app === 'QuickTime Player') {
      const after = w.appAfter;
      assert.ok(after && w.appBefore, 'QuickTime Player shows no document');
      await players.until(async () => (await players.nowPlaying()).bundleID === players.QUICKTIME_ID, 3000,
        'the system does not show QuickTime Player as now playing, so its own skip cannot be pressed');
      await harness.h('media-key', 'next');
      await sleep(1500);
      const own = await players.quickTimeState();
      assert.equal(after.name, own.name, 'the island\'s skip left QuickTime on another document than its own skip does');
      assert.equal(after.playing, own.playing, `after the island's skip QuickTime is ${after.playing ? '' : 'not '}playing; after its own skip it is ${own.playing ? '' : 'not '}playing`);
      const step = own.time - after.time;
      assert.ok(step > 0 && step < 5, `QuickTime's own skip moved it from ${after.time.toFixed(1)} s to ${own.time.toFixed(1)} s, unlike the island's skip`);
    } else {
      const after = w.appAfter;
      await music.seek(1);
      await musicHoldsTheMediaKeys();
      await harness.h('media-key', 'previous');
      await sleep(300);
      await harness.h('media-key', 'previous');
      await sleep(1500);
      const own = await music.state();
      assert.equal(after.name, own.name, `the island's back left Music on "${after.name}", its own back on "${own.name}"`);
      assert.equal(after.state, own.state, `the island's back left Music ${after.state}, its own back ${own.state}`);
      assert.ok(after.position < 5 && own.position < 5, `Music is at ${after.position} s after the island's back, ${own.position} s after its own`);
    }
    w.ownControl = control;
  });

  reg.define(/^the visionary sees the island show what (QuickTime Player|Apple Music) then shows$/, async (w, app) => {
    if (app === 'QuickTime Player') {
      const s = await players.quickTimeState();
      const want = s.playing ? 'Pause' : 'Play';
      await island.waitFor(w.island.pid, (v) => v.texts.includes(s.name) && v.buttons.some((b) => b.label === want), 3000,
        `the island does not show "${s.name}" with ${want}`);
    } else {
      const s = await music.state();
      const want = s.state === 'playing' ? 'Pause' : 'Play';
      await island.waitFor(w.island.pid, (v) => v.texts.includes(s.name) && v.buttons.some((b) => b.label === want), 3000,
        `the island does not show "${s.name}" with ${want}`);
    }
  });

  reg.define(/^the visionary hears "Wonderwall" stop$/, async () => {
    const s = await musicSays((x) => x.state === 'paused', 3000, 'Music did not pause');
    assert.equal(s.name, 'Wonderwall');
  });

  reg.define(/^the visionary hears "Champagne Supernova" start$/, async () => {
    const s = await musicSays((x) => x.state === 'playing' && x.name === 'Champagne Supernova', 4000,
      'Music did not start Champagne Supernova');
    assert.ok(s.position < 6, `Champagne Supernova is at ${s.position} s, not at its start`);
  });

  reg.define(/^the visionary, resting the pointer on the notch, sees ("Wonderwall" with a play button|"Champagne Supernova" on the music page)$/, async (w, shown) => {
    await pointerAway();
    await sleep(200);
    await openIsland(w);
    if (shown.startsWith('"Wonderwall"')) {
      await island.waitFor(w.island.pid, (v) => v.texts.includes('Wonderwall') && v.buttons.some((b) => b.label === 'Play')
        && !v.buttons.some((b) => b.label === 'Pause'), 3000, 'the island does not show Wonderwall with a play button');
    } else {
      const view = await island.waitFor(w.island.pid, (v) => v.texts.includes('Champagne Supernova'), 3000,
        'the island does not show Champagne Supernova');
      assert.ok(!view.texts.includes('Wonderwall'), 'the island still shows Wonderwall');
    }
  });

  // ------------------------------------------------------- Chrome and the flip card

  reg.define(/^a youtube\.com tab in Chrome is playing "(Lecture 4: Fourier Series)" with sound$/, async (w, title) => {
    await ensureIsland(w);
    w.tab = await chrome.playInTab(w, title, 30);
  });

  reg.define(/^a muted hover preview of "Lecture 5: Laplace Transforms" is playing on the YouTube home feed in Chrome(, and nothing else is playing)?$/, async (w, alone) => {
    await ensureIsland(w);
    if (alone) await music.pause().catch(() => {});
    w.preview = await mutedPreview(w);
  });

  reg.define(/^the visionary has just unmuted it$/, async (w) => {
    await unmute(w.preview);
  });

  reg.define(/^the island is closed and Apple Music is playing "Wonderwall"$/, async (w) => {
    await ensureIsland(w);
    await playing(w, 'Wonderwall', 30);
    await plainNotch(w);
  });

  reg.define(/^"Wonderwall" was the last song played, now paused, and nothing else is playing$/, async (w) => {
    await ensureIsland(w);
    await playing(w, 'Wonderwall', 30);
    await sleep(1200); // the island sees it play
    await music.pause();
    await musicSays((s) => s.state === 'paused' && s.name === 'Wonderwall', 3000, 'Music did not pause Wonderwall');
    await chrome.companion(w);
    await plainNotch(w);
  });

  reg.define(/^Apple Music is playing "Wonderwall"$/, async (w) => {
    await ensureIsland(w);
    await playing(w, 'Wonderwall', 30);
  });

  reg.define(/^the visionary then started "(Lecture 4: Fourier Series)" in a youtube\.com tab in Chrome$/, async (w, title) => {
    await sleep(1200); // Wonderwall has been playing a while
    w.tab = await chrome.playInTab(w, title, 30);
  });

  reg.define(/^the music page shows "Lecture 4: Fourier Series" while "Wonderwall" also plays in Apple Music$/, async (w) => {
    await musicThenLecture(w);
    await openIsland(w);
    await island.waitFor(w.island.pid, (v) => v.title?.value === 'Lecture 4: Fourier Series', 3000,
      'the music page does not show the lecture');
  });

  reg.define(/^(Apple Music and a youtube\.com tab in Chrome|Apple Music, QuickTime Player and a youtube\.com tab in Chrome) are playing, the youtube\.com tab in Chrome started last$/, async (w, sources) => {
    await ensureIsland(w);
    await playing(w, 'Wonderwall', 30);
    if (sources.includes('QuickTime Player')) {
      await sleep(1200);
      await players.playInQuickTime(w, await players.movie('holiday.mov', 120), 10);
    }
    await sleep(1200);
    w.tab = await chrome.playInTab(w, 'Lecture 4: Fourier Series', 30);
  });

  reg.define(/^the card has been flipped to "Wonderwall" while "Lecture 4: Fourier Series" also plays$/, async (w) => {
    await musicThenLecture(w);
    await openIsland(w);
    await island.waitFor(w.island.pid, (v) => v.title?.value === 'Lecture 4: Fourier Series', 3000,
      'the card does not show the lecture first');
    await flipOnce(w);
    await island.waitFor(w.island.pid, (v) => v.title?.value === 'Wonderwall', 2000, 'the card did not flip to Wonderwall');
  });

  reg.define(/^(?:Apple Music, IINA and a youtube\.com tab in Chrome are all playing, the YouTube tab started last|Apple Music started "Wonderwall" first, then IINA started "rehearsal\.mkv", then a youtube\.com tab started "Lecture 4: Fourier Series")$/, async (w) => {
    await ensureIsland(w);
    await playing(w, 'Wonderwall', 30);
    await sleep(1200);
    await players.playInIINA(w, await players.movie('rehearsal.mkv', 600), 30);
    await sleep(1200);
    w.tab = await chrome.playInTab(w, 'Lecture 4: Fourier Series', 30);
    await sleep(800);
  });

  reg.define(/^the island can see IINA separately$/, async () => {
    // The shared now-playing channel shows IINA (the harness's own reader).
    await players.until(async () => (await players.nowPlaying()).bundleID === players.IINA_ID, 3000,
      'the shared now-playing channel does not show IINA');
  });

  reg.define(/^the shared now-playing channel shows another app than IINA, so the island cannot see IINA separately$/, async (w) => {
    // Another app, none the island follows, takes the channel.
    const tone = players.wav('channel-stand-in.wav', 600);
    const helper = procs.start('now-playing stand-in', paths.harness, ['now-playing-stand-in', tone, 600]);
    w.defer(() => procs.stop(helper));
    await players.until(async () => (await players.nowPlaying()).pid === helper.pid, 5000,
      'the stand-in app did not take the shared now-playing channel');
    await sleep(800);
  });

  reg.define(/^the visionary unmutes the preview$/, async (w) => {
    await unmute(w.preview);
  });

  reg.define(/^(a muted hover preview on the YouTube home feed, left muted|a muted autoplay clip on a news site|an autoplay clip with sound on a news site) starts playing in Chrome$/, async (w, clip) => {
    const browser = await chrome.companion(w);
    if (clip.startsWith('a muted hover preview')) {
      w.clip = await mutedPreview(w);
    } else {
      const sound = clip.includes('with sound');
      w.clip = await browser.open(standIns.urls.news(sound));
      await w.clip.waitMedia((m) => !m.paused && m.currentTime > 0 && m.muted === !sound, 15000,
        `the news clip does not play ${sound ? 'with sound' : 'muted'}`);
    }
  });

  reg.define(/^the visionary clicks the flip control$/, async (w) => {
    // Watch the card while it turns.
    const flip = button(await island.look(w.island.pid), 'Flip');
    const c = center(flip.frame);
    await harness.glide(c.x, c.y, 4, 8);
    const watching = harness.watch(w.island.pid, 1200, 15);
    await sleep(120);
    await harness.click(c.x, c.y);
    w.flipSamples = await watching;
  });

  reg.define(/^the visionary opens the island and clicks the flip control (\d+) times$/, async (w, n) => {
    await openIsland(w);
    await island.waitFor(w.island.pid, (v) => v.title?.value === 'Lecture 4: Fourier Series', 3000,
      'the card does not show the YouTube video, the newest, first');
    for (let i = 0; i < Number(n); i++) await flipOnce(w);
  });

  reg.define(/^the visionary clicks pause$/, async (w) => {
    w.tabBefore = await w.tab.media();
    await clickButton(w, 'Pause');
  });

  reg.define(/^the visionary closes the YouTube tab$/, async (w) => {
    await w.tab.close();
  });

  reg.define(/^the visionary quits IINA$/, async (w) => {
    await players.quitIINA(w);
  });

  reg.define(/^the visionary closed the (?:youtube|soundcloud)\.com tab while it played ("Lecture 4: Fourier Series"|the track "late night mix") at ([\d:]+), and nothing else is playing$/, async (w, titleText, spot) => {
    await ensureIsland(w);
    await music.pause().catch(() => {});
    const at = players.seconds(spot);
    const title = titleOf(titleText);
    w.tab = await chrome.playInTab(w, title, at);
    await sleep(1200); // the island sees it play
    await w.tab.close();
    w.spot = at;
    w.title = title;
    w.closedAt = Date.now();
  });

  // Thens ------------------------------------------------------------

  reg.define(/^the visionary sees "(Lecture 4: Fourier Series|Lecture 5: Laplace Transforms)" on the music page$/, async (w, title) => {
    await island.waitFor(w.island.pid, (v) => v.open && v.page === 'music' && v.title?.value === title, 3000,
      `the music page does not show "${title}"`);
    // The tab itself plays it, with sound.
    const tab = title.startsWith('Lecture 5') ? w.preview : w.tab;
    const m = await tab.media();
    assert.ok(!m.paused && !m.muted, `the tab is ${m.paused ? 'paused' : 'muted'}`);
  });

  reg.define(/^the visionary sees the plain notch, with no wing popping out$/, async (w) => {
    await staysPlain(w, 2500);
    const m = await w.preview.media();
    assert.ok(!m.paused && !m.muted, 'the preview does not play with sound');
  });

  reg.define(/^the visionary, resting the pointer on the notch, sees a flip control on the card between "(Wonderwall)" and "(Lecture 5: Laplace Transforms)"$/, async (w, a, b) => {
    await openIsland(w);
    const view = await island.waitFor(w.island.pid, (v) => v.buttons.some((x) => x.label === 'Flip'), 3000,
      'the card has no flip control');
    assert.equal(view.count?.value, '1 of 2', `the count reads ${view.count?.value}`);
    const faces = [view.title?.value];
    await flipOnce(w);
    faces.push((await island.look(w.island.pid)).title?.value);
    assert.deepEqual([...faces].sort(), [a, b].sort(), `the card's faces are ${faces.join(' and ')}`);
  });

  reg.define(/^the visionary sees no wings beside the notch$/, async (w) => {
    await staysPlain(w, 2500);
  });

  reg.define(/^the visionary, resting the pointer on the notch, sees "Wonderwall" still paused and ready on the music page$/, async (w) => {
    await openIsland(w);
    const view = await island.waitFor(w.island.pid, (v) => v.title?.value === 'Wonderwall' && v.buttons.some((b) => b.label === 'Play'),
      2000, 'the island does not show Wonderwall paused and ready');
    assert.ok(button(view, 'Play').enabled, 'play is greyed out');
    assert.ok(!view.buttons.some((b) => b.label === 'Flip'), 'the card has a flip control: the clip counts');
    assert.equal(view.count, null, 'the card shows a count: the clip counts');
    const s = await music.state();
    assert.ok(s.state === 'paused' && s.name === 'Wonderwall', `Music is ${s.state} on ${s.name}`);
    const m = await w.clip.media();
    assert.ok(!m.paused, 'the clip is not playing');
    // The control, in this world: with the clip still playing, a youtube.com
    // stand-in tab with sound, started in the same test Chrome, does reach
    // the island, which shows it on the card. So the Chrome, extension and
    // island pipeline was live while the clip stayed off, and the clip
    // alone, still playing, adds no second face.
    // The clip and the control side by side, each in its own window: Chrome
    // pauses a muted video whose tab is hidden and will not start one in a
    // hidden tab, so neither may cover the other.
    const browser = await chrome.companion(w);
    await browser.place(w.clip, { left: 0, top: 60, width: 840, height: 640 });
    assert.ok(!(await w.clip.media()).paused, 'the clip stopped playing when its window moved');
    w.control = await chrome.playInTab(w, 'Lecture 4: Fourier Series', 30,
      { bounds: { left: 860, top: 60, width: 840, height: 640 } });
    const after = await island.waitFor(w.island.pid, (v) => v.title?.value === 'Lecture 4: Fourier Series', 5000,
      'the control tab, a youtube.com video with sound, never reached the card: the pipeline was not live');
    // Paused Music and the control are two sources; the clip would make three.
    assert.ok(after.count === null || after.count.value === '1 of 2',
      `the card's count reads ${after.count?.value}: the clip counts beside Music and the control`);
    assert.ok(!(await w.clip.media()).paused, 'the clip stopped playing');
  });

  reg.define(/^the visionary sees a small flip control on the card$/, async (w) => {
    const view = await island.look(w.island.pid);
    const flip = button(view, 'Flip');
    assert.ok(flip.frame.w <= 40 && flip.frame.h <= 40, `the flip control is ${flip.frame.w}×${flip.frame.h}`);
    assert.ok(island.inside(flip.frame, view.musicFrame), 'the flip control is not on the card');
  });

  reg.define(/^the visionary sees the card flip over like a mirror to show "Wonderwall"$/, async (w) => {
    const final = await island.waitFor(w.island.pid, (v) => v.title?.value === 'Wonderwall', 2000,
      'the card does not show Wonderwall after the flip');
    // Turning like a mirror about its upright axis, the face narrows towards
    // edge-on and opens out again while its height holds.
    const full = final.title.frame;
    const turning = w.flipSamples.map((s) => (s.windows || []).flatMap((x) => x.elements || [])
      .find((e) => e.identifier === 'song-title')?.frame).filter(Boolean);
    const edgeOn = turning.filter((f) => f.w < full.w * 0.5 && f.h > full.h * 0.85);
    assert.ok(edgeOn.length > 0, `the card never turned: its title stayed ${[...new Set(turning.map((f) => Math.round(f.w)))].join(', ')} wide`);
    const i = turning.indexOf(edgeOn[0]);
    assert.ok(turning.slice(i).some((f) => f.w > full.w * 0.9), 'the turned face never opened out again');
    const s = await music.state();
    assert.ok(s.state === 'playing' && s.name === 'Wonderwall', `Music is ${s.state} on ${s.name}`);
  });

  reg.define(/^the visionary sees the count "(\d of \d)"$/, async (w, count) => {
    await island.waitFor(w.island.pid, (v) => showsFaceWithCount(v, w.faceSeen, count), 2000,
      `the card does not show ${w.faceSeen ? `"${w.faceSeen}" with ` : ''}the count "${count}" in one look`);
  });

  reg.define(/^the visionary sees the count "(\d of \d)" beside the flip control$/, async (w, count) => {
    const view = await island.waitFor(w.island.pid, (v) => showsFaceWithCount(v, w.faceSeen, count), 2000,
      `the card does not show ${w.faceSeen ? `"${w.faceSeen}" with ` : ''}the count "${count}" in one look`);
    const flip = button(view, 'Flip').frame;
    const c = view.count.frame;
    const gap = Math.hypot((c.x + c.w / 2) - (flip.x + flip.w / 2), (c.y + c.h / 2) - (flip.y + flip.h / 2));
    assert.ok(gap < 40, `the count is ${Math.round(gap)} pt from the flip control`);
  });

  reg.define(/^the visionary hears "Wonderwall" stop in Apple Music while the lecture keeps playing$/, async (w) => {
    await musicSays((s) => s.state === 'paused' && s.name === 'Wonderwall', 3000, 'Music did not pause Wonderwall');
    const a = await w.tab.media();
    await sleep(1000);
    const b = await w.tab.media();
    assert.ok(!b.paused && b.currentTime > a.currentTime + 0.5, `the lecture stopped (at ${a.currentTime} then ${b.currentTime})`);
  });

  reg.define(/^the visionary sees (the IINA file|the Apple Music song|the YouTube video|"Lecture 4: Fourier Series"|"rehearsal\.mkv") on the card$/, async (w, face) => {
    const want = FACES[face] || titleOf(face);
    // The visionary looks at the card: open the island if it is closed.
    if (!(await island.look(w.island.pid)).open) {
      await pointerAway();
      await sleep(200);
      await openIsland(w);
    }
    await openOnMusicPage(w);
    await island.waitFor(w.island.pid, (v) => v.title?.value === want, 3000, `the card does not show "${want}"`);
    w.faceSeen = want; // the count is read in the same look as this face
  });

  reg.define(/^the visionary never sees ("Wonderwall"|"Lecture 4: Fourier Series"|"rehearsal\.mkv") again when flipping the card$/, async (w, left) => {
    const gone = titleOf(left);
    const view = await island.look(w.island.pid);
    const seen = [view.title?.value];
    const n = view.count ? Number(view.count.value.split(' of ')[1]) : 1;
    for (let i = 0; i < n + 1 && view.count; i++) {
      await flipOnce(w);
      seen.push((await island.look(w.island.pid)).title?.value);
    }
    assert.ok(!seen.includes(gone), `flipping shows "${gone}" again (${seen.join(', ')})`);
    assert.equal(n, 2, `the card has ${n} faces, not the two remaining sources`);
  });
};

/** The visionary quits Music (its own Quit, the quit Apple event). */
async function quitMusic() {
  await music.osa('tell application "Music" to quit');
  await players.until(async () => !players.running('com.apple.Music'), 10000, 'Music did not quit');
}

module.exports.quitMusic = quitMusic;
module.exports.titleOf = titleOf;
