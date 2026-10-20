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
const island = require('../support/island');
const music = require('../support/music');
const players = require('../support/players');
const { helpers } = require('./music-panel.steps');

const {
  ensureIsland, playing, plainNotch, rest, openOnMusicPage, button, clickButton, musicSays,
  pointerAway, RULED_REST_MS,
} = helpers;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const JBL = { name: 'JBL Flip 5', builtIn: false };

// ---------------------------------------------------------------- helpers

/** "the file "x"" or "x": what the island shows as the title. */
const titleOf = (text) => (/^the file "(.+)"$/.exec(text) || /^"(.+)"$/.exec(text) || [])[1];

/**
 * The sound goes out through `speaker`. A Bluetooth speaker is the injected
 * output device (BUILD-PLAN Q2); the MacBook speakers are the real system's
 * default output, which must then be the built-in one.
 */
async function soundThrough(w, speaker) {
  if (speaker === 'the MacBook speakers') {
    // The real system's output when that is the built-in speakers. When the
    // visionary's own headphones are connected the harness does not reroute
    // their sound: it stands in the built-in speakers instead, and says so.
    const out = await harness.h('output-device');
    if (!out.builtIn) {
      process.stderr.write(`  note: the Mac's output is "${out.name}"; the MacBook speakers are injected for this scenario\n`);
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
  const tile = await island.until(async () => {
    const els = (await harness.h('tree', pid)).elements;
    const text = els.find((e) => e.role === 'AXStaticText' && /Wonderwall/.test(String(e.value || '')));
    return text ? els : null;
  }, 5000, 'Control Center shows no Now Playing tile with "Wonderwall"');
  const label = action === 'pauses' ? 'pause' : 'next';
  assert.ok(tile.some((e) => e.role === 'AXButton' && e.description === label), `the Now Playing tile has no ${label} button`);
  await harness.h('press', pid, label);
  await sleep(300);
  await harness.key(53); // close Control Center
}

/** The media keys go to the app the system shows as now playing: Music here. */
async function musicHoldsTheMediaKeys() {
  await players.until(async () => (await players.nowPlaying()).bundleID === 'com.apple.Music', 5000,
    'the system does not show Music as now playing, so a media key would reach another app');
}

// --------------------------------------------------------------- definer

module.exports = (reg) => {
  // Givens ---------------------------------------------------------------

  reg.define(/^(Apple Music|IINA|QuickTime Player|Music) is playing ("[^"]+"|the file "[^"]+") and nothing else is playing$/, async (w, source, title) => {
    await ensureIsland(w);
    await startSource(w, source, title);
  });

  reg.define(/^(Apple Music|IINA|QuickTime Player|Music) is playing ("[^"]+"|the file "[^"]+") out through (the MacBook speakers|the Bluetooth speaker "[^"]+") and nothing else is playing$/, async (w, source, title, speaker) => {
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

  reg.define(/^the visionary (quit Apple Music|quit IINA) while it played ("Wonderwall"|the file "[^"]+") at ([\d:]+), and nothing else is playing$/, async (w, closed, title, spot) => {
    await ensureIsland(w);
    const at = players.seconds(spot);
    const name = titleOf(title);
    if (closed === 'quit Apple Music') {
      await playing(w, name, at);
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

  reg.define(/^the visionary sees (Apple Music|IINA) open ("Wonderwall"|the file "[^"]+") again$/, async (w, app, title) => {
    const name = titleOf(title);
    if (app === 'Apple Music') {
      await musicSays((s) => s.state === 'playing' && s.name === name, 8000, `Music did not open "${name}" again`);
    } else {
      await players.until(async () => {
        const s = await players.iinaState();
        return s && s.title === name && s.playing;
      }, 15000, `IINA did not open "${name}" again`);
    }
  });

  reg.define(/^the visionary hears ("Wonderwall"|the file "[^"]+") playing from ([\d:]+), not from the start$/, async (w, title, spot) => {
    const at = players.seconds(spot);
    const since = (Date.now() - w.closedAt) / 1000;
    const check = (pos) => pos >= at - 1 && pos <= at + since + 3;
    if (titleOf(title) === 'Wonderwall') {
      const s = await musicSays((x) => x.state === 'playing' && check(x.position), 6000,
        `Music does not play Wonderwall from ${spot}`);
      assert.equal(s.name, 'Wonderwall');
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
};

/** The visionary quits Music (its own Quit, the quit Apple event). */
async function quitMusic() {
  await music.osa('tell application "Music" to quit');
  await players.until(async () => !players.running('com.apple.Music'), 10000, 'Music did not quit');
}

module.exports.quitMusic = quitMusic;
module.exports.titleOf = titleOf;
