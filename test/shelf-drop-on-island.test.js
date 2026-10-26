'use strict';
// MF5 / Ruling Q2: A shelf item dropped back onto the island itself (the shelf
// page or the notch, not the remove area) is a refused drop and stays as it was.
// D66: only the remove area removes.
// D92: a refused or empty drop leaves the item.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const harness = require('./support/harness');
const island = require('./support/island');
const { scratchDocuments, detachScratchDocuments } = require('./support/shelf');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const center = (f) => ({ x: f.x + f.w / 2, y: f.y + f.h / 2 });

test('MF5 / Q2: dropping a shelf item on the island is a refused drop and stays on the shelf', async (t) => {
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
  fs.writeFileSync(pdf, '%PDF-1.4 tax return content');

  const { pid } = await island.launch(world);

  // Seed a file and a link on the shelf
  const now = new Date().toISOString();
  const seed = [
    { type: 'file', path: pdf, landedAt: now },
    { type: 'link', url: 'https://gov.uk/renew-adult-passport', landedAt: now },
  ];
  island.feed(world, { clearShelf: true, seedShelf: seed });

  // Open the island on the shelf page
  const notch = await harness.notchCenter();
  await harness.move(notch.x, 400);
  await harness.glide(notch.x, notch.y, 10, 10);
  let view = await island.waitFor(pid, (v) => v.open, 2000, 'island did not open');

  if (view.page !== 'shelf') {
    const pc = center(view.panel);
    await harness.glide(pc.x, pc.y, 4, 8);
    await sleep(60);
    await harness.scroll(-80, 'trackpad');
    view = await island.waitFor(pid, (v) => v.open && v.page === 'shelf', 2000, 'shelf page did not open');
  }

  // 1. Drag the file onto the shelf page centre and release
  let items = view.elements.filter((e) => e.identifier === 'shelf-item');
  assert.equal(items.length, 2, 'expected 2 items parked on shelf');

  const fileItem = items[0];
  const fromFile = center(fileItem.frame);
  const shelfCenter = center(view.panel);

  await harness.drag(fromFile.x, fromFile.y, shelfCenter.x, shelfCenter.y, 20, 15, false);
  await sleep(1000);

  view = await island.look(pid);
  assert.ok(view.texts.includes('tax-return.pdf'), 'file was removed after dropping on shelf page center');
  assert.ok(view.texts.some((t) => t.includes('gov.uk/renew-adult-passport')), 'link was removed after dropping file');

  // 2. Drag the link onto the shelf page centre and release
  items = view.elements.filter((e) => e.identifier === 'shelf-item');
  const linkItem = items.find((e) => view.texts.some((t) => t.includes('gov.uk/renew-adult-passport')));
  assert.ok(linkItem, 'link item element not found');
  const fromLink = center(linkItem.frame);

  await harness.drag(fromLink.x, fromLink.y, shelfCenter.x, shelfCenter.y, 20, 15, false);
  await sleep(1000);

  view = await island.look(pid);
  assert.ok(view.texts.includes('tax-return.pdf'), 'file missing after link drop');
  assert.ok(view.texts.some((t) => t.includes('gov.uk/renew-adult-passport')), 'link was removed after dropping on shelf page center');
});
