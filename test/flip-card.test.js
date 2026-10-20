'use strict';
// The flip card (D48, D111, D121, D117) with two sources the tests can drive
// without the companion Chrome extension: Apple Music, then QuickTime Player
// started after it. The newest takes the card with "1 of 2"; a flip turns to
// Apple Music as "2 of 2" and the card's pause then pauses Apple Music while
// QuickTime keeps playing; when QuickTime quits, it leaves the card. Every
// check reads the far side: the island through Accessibility, Music and
// QuickTime Player through their own AppleScript dictionaries.
const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./support/harness');
const island = require('./support/island');
const music = require('./support/music');
const players = require('./support/players');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const center = (f) => ({ x: f.x + f.w / 2, y: f.y + f.h / 2 });

async function click(pid, label) {
  const view = await island.look(pid);
  const b = view.buttons.find((x) => x.label === label);
  assert.ok(b, `the island shows no ${label} button (${view.buttons.map((x) => x.label).join(', ')})`);
  const c = center(b.frame);
  await harness.glide(c.x, c.y, 4, 8);
  await harness.click(c.x, c.y);
}

test('the flip card: newest in front as 1 of 2, a flip to Apple Music as 2 of 2 whose pause pauses only Music, and a quit source leaves', async (t) => {
  const defers = [];
  const world = { defer: (fn) => defers.push(fn) };
  t.after(async () => {
    for (const fn of defers.reverse()) await fn();
    await music.pause().catch(() => {});
  });

  await music.play('Wonderwall', 30);
  const { pid } = await island.launch(world);
  await sleep(1000);
  await players.playInQuickTime(world, await players.movie('holiday.mov', 120), 10);

  const c = await harness.notchCenter();
  await harness.move(c.x, 400);
  await harness.glide(c.x, c.y, 10, 10);
  let view = await island.waitFor(pid, (v) => v.open && v.texts.includes('holiday.mov'), 4000,
    'the newest source, QuickTime Player, does not take the card');
  assert.ok(view.buttons.some((b) => b.label === 'Flip'), 'the card has no flip control');
  assert.equal(view.count?.value, '1 of 2');
  assert.equal(view.sourceLine?.value.split(' · ')[0], 'QuickTime Player');

  await click(pid, 'Flip');
  view = await island.waitFor(pid, (v) => v.texts.includes('Wonderwall') && v.count?.value === '2 of 2', 2000,
    'a flip does not turn the card to Wonderwall as 2 of 2');
  assert.ok(!view.texts.includes('holiday.mov'), 'the other face still shows');

  await click(pid, 'Pause');
  await island.until(async () => (await music.state()).state === 'paused', 3000, 'Music did not pause from the flipped card');
  const qt = await players.quickTimeState();
  assert.equal(qt.playing, true, 'QuickTime Player stopped too: the pause went to the wrong source');

  await click(pid, 'Flip');
  await island.waitFor(pid, (v) => v.texts.includes('holiday.mov') && v.count?.value === '1 of 2', 2000,
    'a second flip does not turn back to the newest');

  await players.quitQuickTime();
  view = await island.waitFor(pid, (v) => v.texts.includes('Wonderwall') && !v.buttons.some((b) => b.label === 'Flip'), 4000,
    'QuickTime Player quit but the card still offers it');
  assert.equal(view.count, null, 'a count still shows with one source');
});
