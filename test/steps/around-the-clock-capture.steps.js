'use strict';
// D108/D109: named shares retain R1 evidence; recordings use the native tool.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const share = require('../support/capture-share');
const harness = require('../support/harness');
const island = require('../support/island');
const music = require('../support/music');
const { helpers } = require('./music-panel.steps');
const notice = require('./new-song-notice.steps');
const files = require('./shelf-captures-and-files.steps');
const panel = require('./music-panel.steps');
const recording = require('../support/recording');
const scenes = require('../support/scenes');
const path = require('node:path');

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
const rawNote = 'idea: notch app shows lyrics';
const note = `✎ ${rawNote}`;
const visibleNote = (v) => v.open && v.page === 'shelf' && v.texts.includes(note);
const visibleWing = (v) => Boolean(v.wing?.art && v.wing.title === 'Champagne Su…');

async function prepare(w, service) {
  await share.start(w, service);
  await step(notice, 'the island is closed and the free gap left of the notch is wider than the cover art and the whole title', w);
  // P3's owned stand-in proves room exists; the existing input fixes the
  // D108 title example without depending on Chrome's changing menu width.
  island.feed(w, { leftGap: 135 });
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

function assertTarget(w, target) {
  if (target === 'the played-back recording') assert.ok(w.recording, 'no native recording');
  else assert.equal(target, `what the ${w.captureService?.name} viewers see`, 'capture service identity changed');
}

module.exports = (reg) => {
  reg.define(/^the visionary is sharing the screen in (Zoom|Meet)$/, prepare);
  reg.define(/^"Champagne Supernova" starts in Apple Music$/, async (w) => {
    await share.arm(w, 'wing');
    w.captureVisible = visibleWing;
    await step(notice, '"Champagne Supernova" starts', w);
  });
  reg.define(/^the visionary sees the wing out left of the notch with "Champagne Su…"$/, async (w) => {
    await step(notice, 'the visionary sees the cover art and "Champagne Su…" in a wing left of the notch', w);
  });
  reg.define(/^the visionary rests the pointer on the notch for 2 seconds$/, async (w) => {
    await share.arm(w, 'panel');
    await helpers.rest(w, 2000);
  });
  reg.define(/^the visionary drags "tax-return\.pdf" onto the notch and lets go$/, async (w) => {
    await share.arm(w, 'panel');
    await step(files, 'the visionary drags the file "tax-return.pdf" from Finder onto the notch and lets go', w);
  });
  reg.define(/^the visionary sees "tax-return\.pdf" parked on the shelf page$/, async (w) => {
    await island.waitFor(w.island.pid, visibleFile, 3000, 'the scratch PDF was not parked');
    w.captureKind = 'panel';
    w.captureVisible = visibleFile;
  });
  reg.define(/^the island is showing (the shelf page, holding the note "✎ idea: notch app shows lyrics"|the music page over "Wonderwall"|the wing left of the notch for "Champagne Supernova") on the visionary's screen$/, async (w, showing) => {
    await share.arm(w, showing.startsWith('the wing') ? 'wing' : 'panel');
    if (showing.startsWith('the shelf')) {
      const input = JSON.parse(fs.readFileSync(w.login.input, 'utf8'));
      fs.writeFileSync(w.login.input, JSON.stringify({ ...input, seedShelf: [{ kind: 'note', text: rawNote }] }));
      await openShelf(w);
      await island.waitFor(w.island.pid, visibleNote, 2000, 'the note is not visible');
      w.captureVisible = visibleNote;
      w.captureKind = 'panel';
    } else if (showing.startsWith('the wing')) {
      w.captureVisible = visibleWing;
      await step(notice, '"Champagne Supernova" starts', w);
      await step(notice, 'the visionary sees the cover art and "Champagne Su…" in a wing left of the notch', w);
    } else {
      await helpers.rest(w, 600);
      await assertMusic(w);
    }
  });
  reg.define(/^the visionary checks (what the (?:Zoom|Meet) viewers see|the played-back recording)$/, async (w, target) => {
    assertTarget(w, target);
    await share.capture(w);
    w.captureChecked = true;
  });
  reg.define(/^the visionary sees nothing of the island in (what the (?:Zoom|Meet) viewers see|the played-back recording)(?:, only the plain menu bar around the notch)?$/, async (w, target) => {
    assertTarget(w, target);
    if (!w.captureChecked) await share.capture(w);
  });
  reg.define(/^the visionary is recording the screen$/, async (w) => {
    await prepare(w, 'recording');
    await recording.start(w);
  });
  reg.define(/^the visionary clicks the notch$/, async (w) => {
    await share.arm(w, 'panel');
    await step(panel, 'the visionary clicks the notch the moment the pointer reaches it', w);
  });
  reg.define(/^the visionary sees the island open at once on the music page$/, async (w) => {
    await step(panel, 'the visionary sees the island open at once on the music page', w);
    await assertMusic(w);
  });
  reg.define(/^the visionary is recording the screen and the island is closed to the plain notch$/, async (w) => {
    await prepare(w, 'recording');
    await openShelf(w);
    const view = await island.look(w.island.pid);
    w.recordingBeforeItems = view.elements.filter((e) => e.identifier === 'shelf-item').length;
    assert.equal(w.recordingBeforeItems, 0, 'arrival Given needs an empty shelf');
    await scenes.plainNotch(w);
    await recording.start(w, recording.exactName);
  });
  reg.define(/^the visionary stops the recording and it saves as "(Screen Recording 2026-10-18 at 10\.16\.40\.mov)"$/, async (w, name) => {
    assert.equal(path.basename(w.recording.file), name, 'native tool must save directly under the example name');
    await recording.stop(w);
  });
  reg.define(/^the visionary sees "(Screen Recording 2026-10-18 at 10\.16\.40\.mov)" on the shelf page$/, async (w, name) => {
    await openShelf(w);
    const view = await island.waitFor(w.island.pid, (v) => v.texts.includes(name), 7000, 'native .mov never arrived through the watcher');
    recording.assertArrival({ beforeItems: w.recordingBeforeItems, file: w.recording.file,
      expectedFile: path.join(require('../support/shelf').scratchDesktop(w), name),
      started: w.recording.started, stat: fs.statSync(w.recording.file), view });
  });
  reg.define(/^the visionary was sharing the screen in Zoom and has just stopped sharing$/, async (w) => {
    await prepare(w, 'Zoom');
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
