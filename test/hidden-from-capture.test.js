'use strict';
// D110, the named assumption the sharing rulings rest on, checked on this Mac
// from day one: while the island is visibly open (Accessibility shows it, the
// window server lists its window on screen), a `screencapture` shot and a
// ScreenCaptureKit capture both lack it. The around-the-clock scenarios that
// rest on it (D108) bind in P6; this guard turns red the day macOS stops
// letting an app keep its windows out of captures, which stops the build and
// takes the question back to the visionary.
const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./support/harness');
const island = require('./support/island');
const { captureVerdict } = require('./support/capture');

test('D110: the open island is kept out of screen captures on this Mac', async (t) => {
  const defers = [];
  const world = { defer: (fn) => defers.push(fn) };
  t.after(async () => { for (const fn of defers.reverse()) await fn(); });

  const { pid } = await island.launch(world);
  const c = await harness.notchCenter();
  await harness.move(c.x, 400);
  await harness.glide(c.x, c.y, 10, 10);
  const view = await island.waitFor(pid, (v) => v.open, 2000, 'the island did not open');
  const p = view.panel;
  const rect = { x: p.x + 30, y: p.y + 50, w: p.w - 60, h: p.h - 70 };

  const shots = await harness.h('capture-check', rect.x, rect.y, rect.w, rect.h, pid);
  const after = await island.look(pid);
  assert.ok(after.open, 'the island closed during the captures, so they proved nothing');
  const listed = (await harness.cgwindows()).filter((w) => w.pid === pid);
  assert.ok(listed.some((w) => w.frame.h > 100), 'the window server does not list the open island on screen');

  // A foreign window over the rect is an environment problem, not D110 false.
  const verdict = captureVerdict(shots);
  assert.ok(verdict.ok, verdict.message);
});
