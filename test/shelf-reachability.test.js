'use strict';
// M9: Reachability of every shelf item and two-finger horizontal scroll routing.
// D30 eight items (3 screenshots, 2 files, 2 notes, 1 reminder) plus 3 long notes
// and 1 reminder: all items must fit within the shelf vertical bounds and be visible
// or brought into view by a two-finger horizontal scroll.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const harness = require('./support/harness');
const island = require('./support/island');
const { scratchDocuments } = require('./support/shelf');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function center(rect) {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

test('M9 / S1: every shelf item is reachable via horizontal scroll on overflow', async (t) => {
  const defers = [];
  const world = { defer: (fn) => defers.push(fn) };
  t.after(async () => {
    try { await harness.release(); } catch {}
    for (const fn of defers.reverse()) {
      try { await fn(); } catch {}
    }
  });

  const docs = scratchDocuments(world);
  const pdf = path.join(docs, 'tax-return.pdf');
  const txt = path.join(docs, 'notes.txt');
  fs.writeFileSync(pdf, '%PDF-1.4 tax return');
  fs.writeFileSync(txt, 'plain notes');

  const { pid } = await island.launch(world);

  const now = new Date().toISOString();
  const long1 = 'A'.repeat(140);
  const long2 = 'B'.repeat(140);
  const long3 = 'C'.repeat(140);

  // Seed 12 items: 3 screenshots, 2 files, 2 notes, 1 reminder, 3 long notes, 1 reminder
  const seed = [
    { type: 'screenshot', path: path.join(docs, 'shot1.png'), landedAt: now },
    { type: 'screenshot', path: path.join(docs, 'shot2.png'), landedAt: now },
    { type: 'screenshot', path: path.join(docs, 'shot3.png'), landedAt: now },
    { type: 'file', path: pdf, landedAt: now },
    { type: 'file', path: txt, landedAt: now },
    { kind: 'note', text: 'First note', isReminder: false, landedAt: now },
    { kind: 'note', text: 'Second note', isReminder: false, landedAt: now },
    { kind: 'note', text: 'First reminder', isReminder: true, landedAt: now },
    { kind: 'note', text: long1, isReminder: false, landedAt: now },
    { kind: 'note', text: long2, isReminder: false, landedAt: now },
    { kind: 'note', text: long3, isReminder: false, landedAt: now },
    { kind: 'note', text: 'Tail reminder', isReminder: true, landedAt: now },
  ];
  island.feed(world, { clearShelf: true, seedShelf: seed });

  // Open island on shelf page
  const { notch } = await harness.builtIn();
  await harness.click(notch.x + notch.w / 2, notch.y + 10);
  await island.waitFor(pid, (v) => v.open, 2500, 'island did not open');

  // Turn to shelf page
  await harness.scroll(-80, 'trackpad');
  const view1 = await island.waitFor(pid, (v) => v.page === 'shelf', 2500, 'shelf page did not show');
  assert.equal(view1.page, 'shelf');

  // Initially, first items are visible
  assert.ok(view1.texts.includes('tax-return.pdf'), 'initial files should be visible');
  assert.ok(view1.texts.includes('✎ First note'), 'first note should be visible');

  // The shelf overflows: the tail must not be in view until the scroll.
  assert.ok(
    !view1.texts.includes('Tail reminder'),
    `the tail reminder is already in view, so nothing needs scrolling: ${view1.texts.join(', ')}`
  );

  // Only a real scroll moves the items: record where the first one sits now.
  const itemXs = (v) =>
    v.elements
      .filter((e) => e.identifier === 'shelf-item' && e.frame)
      .map((e) => e.frame.x)
      .sort((a, b) => a - b);
  // Let the page-turn animation finish first, so the baseline is at rest and a
  // later shift cannot come from the animation.
  await sleep(900);
  const viewRest = await island.look(pid);
  const xsBefore = itemXs(viewRest);
  assert.ok(xsBefore.length > 0, 'no shelf items with a frame before the scroll');

  // Scroll horizontally to the end with two fingers
  const c = center(view1.panel);
  await harness.glide(c.x, c.y, 4, 8);
  await sleep(60);
  await harness.scroll(0, 'trackpad', -500);
  await sleep(150);

  const view2 = await island.look(pid);
  assert.equal(view2.page, 'shelf', 'horizontal scroll must not change the page');

  // The shelf really scrolled: the items moved left by a real distance.
  const xsAfter = itemXs(view2);
  assert.ok(xsAfter.length > 0, 'no shelf items with a frame after the scroll');
  assert.ok(
    xsBefore[0] - xsAfter[0] >= 100,
    `the shelf did not scroll: first item x ${xsBefore[0]} -> ${xsAfter[0]} (all ${xsBefore} -> ${xsAfter})`
  );

  // After horizontal scroll, the tail items at the end must be reachable/visible
  assert.ok(
    view2.texts.includes('Tail reminder') || view2.texts.includes(`✎ ${long3}`),
    `tail items should be visible after horizontal scroll: ${view2.texts.join(', ')}`
  );

  // Scroll back horizontally
  await harness.scroll(0, 'trackpad', 500);
  await sleep(150);

  const view3 = await island.look(pid);
  assert.equal(view3.page, 'shelf', 'horizontal scroll back must not change the page');
  assert.ok(view3.texts.includes('tax-return.pdf'), 'first items should be visible again after scrolling back');

  // Vertical scroll up returns to music page
  await harness.scroll(80, 'trackpad');
  const view4 = await island.waitFor(pid, (v) => v.page === 'music', 2500, 'vertical scroll up must return to music page');
  assert.equal(view4.page, 'music');
});
