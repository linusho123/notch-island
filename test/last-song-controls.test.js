'use strict';
// D31: on the last-song page (nothing playing, Music quit) only play works.
// Back and Skip read as disabled in Accessibility, and clicking Back, Skip
// and the progress bar does nothing: Music is not started (any command the
// island sent would launch it), nothing plays, and the island is unchanged.
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const harness = require('./support/harness');
const island = require('./support/island');
const music = require('./support/music');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const center = (f) => ({ x: f.x + f.w / 2, y: f.y + f.h / 2 });

function musicRunning() {
  try { return execFileSync('pgrep', ['-x', 'Music'], { encoding: 'utf8' }).trim() !== ''; } catch { return false; }
}

const shape = (v) => JSON.stringify({ open: v.open, page: v.page, texts: v.texts,
  buttons: v.buttons.map((b) => [b.label, b.enabled]) });

test('D31: on the last-song page Back and Skip are disabled and inert, and so is the progress bar', async (t) => {
  const defers = [];
  const world = { defer: (fn) => defers.push(fn) };
  t.after(async () => {
    for (const fn of defers.reverse()) await fn();
  });

  // Wonderwall played with the island running, then Music is quit.
  await music.play('Wonderwall', 20);
  const { pid } = await island.launch(world);
  await sleep(1200); // the island sees it play
  await music.stop();
  execFileSync('osascript', ['-e', 'tell application "Music" to quit']);
  await island.until(async () => !musicRunning(), 10000, 'Music did not quit');

  const c = await harness.notchCenter();
  await harness.move(c.x, 400);
  await harness.glide(c.x, c.y, 10, 10);
  await sleep(500);
  const view = await island.waitFor(pid,
    (v) => v.open && v.page === 'music' && v.texts.includes('Wonderwall') && v.buttons.some((b) => b.label === 'Play'),
    3000, 'the island does not show Wonderwall paused and ready');

  const by = (label) => view.buttons.find((b) => b.label === label);
  assert.ok(by('Back') && by('Skip'), 'Back or Skip is not drawn');
  assert.equal(by('Back').enabled, false, 'Back reads as enabled on the last-song page');
  assert.equal(by('Skip').enabled, false, 'Skip reads as enabled on the last-song page');
  assert.equal(by('Play').enabled, true, 'Play reads as disabled on the last-song page');

  // Click the inert controls, with the pointer staying on the island.
  for (const label of ['Back', 'Skip']) {
    const p = center(by(label).frame);
    await harness.glide(p.x, p.y, 5, 10);
    await harness.click(p.x, p.y);
    await sleep(250);
  }
  if (view.bar) {
    const f = view.bar.frame;
    await harness.glide(f.x + f.w * 0.7, f.y + f.h / 2, 5, 10);
    await harness.click(f.x + f.w * 0.7, f.y + f.h / 2);
    await sleep(250);
    await harness.drag(f.x + f.w * 0.2, f.y + f.h / 2, f.x + f.w * 0.8, f.y + f.h / 2, 10, 15);
  }
  await sleep(1200); // an AppleScript command would have started Music by now

  assert.equal(musicRunning(), false, 'a click on Back, Skip or the bar started Music: the island sent it a command');
  const after = await island.look(pid);
  assert.equal(shape(after), shape(view), 'the island changed after clicking the inert controls');
});
