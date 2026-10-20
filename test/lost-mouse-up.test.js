'use strict';
// A mouse-up that never reaches the island must not hold it open for good.
// IslandController polls the left button while open and, when a press began
// on the island but the button reads released, tells the hover machine
// (HoverMachine.leftButton). HoverMachineTests cover the machine; this covers
// the controller's wiring: the press starts on the open island, the button
// then reads released (the test input says so; no mouse-up is delivered and
// the real button stays down), and the island must close after the grace.
const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./support/harness');
const island = require('./support/island');
const music = require('./support/music');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('D52: a press that began on the open island and whose mouse-up was lost does not keep it open', async (t) => {
  const defers = [];
  const world = { defer: (fn) => defers.push(fn) };
  t.after(async () => {
    await harness.release();
    for (const fn of defers.reverse()) await fn();
    try { await music.pause(); } catch { /* gone */ }
  });

  await music.play('Wonderwall', 30);
  const { pid } = await island.launch(world);
  const c = await harness.notchCenter();
  await harness.move(c.x, 400);
  await harness.glide(c.x, c.y, 10, 10);
  const view = await island.waitFor(pid, (v) => v.open && v.page === 'music' && v.dot, 2000, 'the island did not open');
  const d = { x: view.dot.frame.x + view.dot.frame.w / 2, y: view.dot.frame.y + view.dot.frame.h / 2 };

  await harness.drag(d.x, d.y, d.x, 700, 20, 15, true);
  await sleep(1500);
  assert.ok((await island.look(pid)).open, 'the island closed while the dot was still held');

  // The mouse-up is lost: the button now reads released, nothing was delivered.
  island.feed(world, { leftButton: 'released' });
  await island.waitFor(pid, (v) => !v.open, 4500,
    'the island stayed open although the left button reads released (the lost mouse-up was not noticed)');
});
