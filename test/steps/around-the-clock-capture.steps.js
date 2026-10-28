'use strict';
// V2a only. Recording rows remain unbound for V2b.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const share = require('../support/capture-share');
const harness = require('../support/harness');
const island = require('../support/island');
const music = require('../support/music');
const { helpers } = require('./music-panel.steps');
const notice = require('./new-song-notice.steps');
const files = require('./shelf-captures-and-files.steps');

// Reuse P3's scene/wing checks and P4's actual stand-in drag unchanged.
async function step(definer, text, w) {
  const matches = [];
  definer({ define: (pattern, fn) => {
    const match = pattern.exec(text);
    if (match) matches.push(() => fn(w, ...match.slice(1)));
  } });
  assert.equal(matches.length, 1, `expected one existing step for ${text}`);
  return matches[0]();
}

const visibleMusic = (v) => v.open && v.page === 'music' && v.texts.includes('Wonderwall')
  && v.buttons.some((b) => b.label === 'Pause');
const visibleFile = (v) => v.open && v.page === 'shelf' && v.texts.includes('tax-return.pdf');
const note = '✎ idea: notch app shows lyrics';
const visibleNote = (v) => v.open && v.page === 'shelf' && v.texts.includes(note);
const visibleWing = (v) => Boolean(v.wing?.art && v.wing.title === 'Champagne Su…');

async function prepare(w) {
  await share.start(w);
  await step(notice, 'the island is closed and the free gap left of the notch is 135 points wide, as with Chrome in front', w);
  await share.baseline(w);
}

async function assertMusic(w) {
  await helpers.openOnMusicPage(w);
  await island.waitFor(w.island.pid, visibleMusic, 2000, 'Wonderwall is not visible on the music page');
  w.captureVisible = visibleMusic;
  w.captureKind = 'panel';
}

async function openShelf(w) {
  await helpers.rest(w, 600);
  const view = await island.waitFor(w.island.pid, (v) => v.open, 2000, 'no open card');
  const p = view.panel;
  await harness.glide(p.x + p.w / 2, p.y + p.h / 2, 4, 8);
  await harness.scroll(-80, 'trackpad');
  await island.waitFor(w.island.pid, (v) => v.open && v.page === 'shelf', 2000, 'no shelf page');
}

module.exports = (reg) => {
  reg.define(/^the visionary is sharing the screen in (Zoom|Meet)$/, prepare);
  reg.define(/^"Champagne Supernova" starts in Apple Music$/, async (w) => {
    w.captureKind = 'wing';
    w.captureVisible = visibleWing;
    await step(notice, '"Champagne Supernova" starts', w);
  });
  reg.define(/^the visionary sees the wing out left of the notch with "Champagne Su…"$/, async (w) => {
    await step(notice, 'the visionary sees the cover art and "Champagne Su…" in a wing left of the notch', w);
  });
  reg.define(/^the visionary rests the pointer on the notch for 2 seconds$/, async (w) => {
    await helpers.rest(w, 2000);
  });
  reg.define(/^the visionary drags "tax-return\.pdf" onto the notch and lets go$/, async (w) => {
    await step(files, 'the visionary drags the file "tax-return.pdf" from Finder onto the notch and lets go', w);
  });
  reg.define(/^the visionary sees "tax-return\.pdf" parked on the shelf page$/, async (w) => {
    await island.waitFor(w.island.pid, visibleFile, 3000, 'the scratch PDF was not parked');
    w.captureKind = 'panel';
    w.captureVisible = visibleFile;
  });
  reg.define(/^the island is showing (the shelf page, holding the note "✎ idea: notch app shows lyrics"|the music page over "Wonderwall") on the visionary's screen$/, async (w, showing) => {
    if (showing.startsWith('the shelf')) {
      const input = JSON.parse(fs.readFileSync(w.login.input, 'utf8'));
      fs.writeFileSync(w.login.input, JSON.stringify({ ...input, seedShelf: [{ kind: 'note', text: note }] }));
      await openShelf(w);
      await island.waitFor(w.island.pid, visibleNote, 2000, 'the note is not visible');
      w.captureVisible = visibleNote;
      w.captureKind = 'panel';
    } else {
      await helpers.rest(w, 600);
      await assertMusic(w);
    }
  });
  reg.define(/^the visionary checks what the (Zoom|Meet) viewers see$/, async (w) => {
    await share.capture(w);
    w.captureChecked = true;
  });
  reg.define(/^the visionary sees nothing of the island in what the (Zoom|Meet) viewers see(, only the plain menu bar around the notch)?$/, async (w) => {
    if (!w.captureChecked) await share.capture(w);
  });
  reg.define(/^the visionary was sharing the screen in Zoom and has just stopped sharing$/, async (w) => {
    await prepare(w);
    await w.captureShare.stop();
    w.shareEnded = true;
  });
  reg.define(/^the visionary rests the pointer on the notch while "Wonderwall" plays$/, async (w) => {
    assert.ok(w.shareEnded, 'no share was stopped');
    await helpers.playing(w, 'Wonderwall', 30);
    assert.equal((await music.state()).name, 'Wonderwall');
    await helpers.rest(w, 600);
  });
};
module.exports.assertMusic = assertMusic;
