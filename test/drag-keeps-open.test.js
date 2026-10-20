'use strict';
// contract-1: the controller must tell the hover machine a press began on the
// island, so an open island stays open while the progress dot is held far
// from it (D52). The feature's drag outline is bound in P2 (IINA source); this
// guards the controller wiring in P1 (HoverMachineTests cover the machine).
const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./support/harness');
const island = require('./support/island');
const music = require('./support/music');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('D52: the open island stays open while the dot is held far away, and closes after the release', async (t) => {
  const defers = [];
  const world = { defer: (fn) => defers.push(fn) };
  t.after(async () => {
    try { await harness.release(); } catch { /* none held */ }
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
  await sleep(1500); // well past the rest and the grace
  const held = await island.look(pid);
  assert.ok(held.open, 'the island closed while the dot was still held');

  await harness.release();
  await island.waitFor(pid, (v) => !v.open, 4500, 'the island stayed open after the release far away');
});
