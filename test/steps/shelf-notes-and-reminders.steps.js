'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const harness = require('../support/harness');
const island = require('../support/island');
const { scratch } = require('../support/sandbox');
const { helpers } = require('./music-panel.steps');

const {
  ensureIsland,
  playing,
  openByRest,
  pointerAway,
} = helpers;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const center = (f) => ({ x: f.x + f.w / 2, y: f.y + f.h / 2 });

async function scrollToShelf(w) {
  const view = await island.look(w.island.pid);
  assert.ok(view.panel, 'the island is not open');
  const c = center(view.panel);
  await harness.glide(c.x, c.y, 4, 8);
  await sleep(60);
  await harness.scroll(-80, 'trackpad');
}

async function openOnShelfPage(w) {
  await ensureIsland(w);
  let view = await island.look(w.island.pid);
  if (!view.open) {
    await pointerAway();
    await sleep(50);
    await openByRest(w);
    view = await island.waitFor(w.island.pid, (v) => v.open, 2000, 'island did not open');
  }
  if (view.page !== 'shelf') {
    await scrollToShelf(w);
    view = await island.waitFor(
      w.island.pid,
      (v) => v.open && v.page === 'shelf',
      2000,
      'shelf page did not open'
    );
    await sleep(350);
  }
  return view;
}

module.exports = function (reg) {
  // ------------------------------------------------------------- Givens

  reg.define(/^the island is open on the shelf page$/, async (w) => {
    island.feed(w, { clearShelf: true, clockDate: null });
    await playing(w, 'Wonderwall', 0);
    await ensureIsland(w);
    await openOnShelfPage(w);
  });

  reg.define(/^the island is open on the shelf page holding only "([^"]+)"$/, async (w, label) => {
    const raw = label.startsWith('✎ ') ? label.slice(2) : label;
    island.feed(w, {
      clearShelf: true,
      clockDate: null,
      seedShelf: [{ kind: 'note', text: raw }],
    });
    await playing(w, 'Wonderwall', 0);
    await ensureIsland(w);
    await openOnShelfPage(w);
    const view = await island.waitFor(
      w.island.pid,
      (v) => v.page === 'shelf' && v.texts.includes(label) &&
             v.elements.filter((e) => e.identifier === 'shelf-item').length === 1,
      2500,
      `shelf does not hold only ${label}`
    );
    assert.equal(view.elements.filter((e) => e.identifier === 'shelf-item').length, 1);
  });

  reg.define(/^the island is open on the shelf page with a new note being typed$/, async (w) => {
    island.feed(w, { clearShelf: true, clockDate: null });
    await playing(w, 'Wonderwall', 0);
    await ensureIsland(w);
    await openOnShelfPage(w);
    const view = await island.waitFor(
      w.island.pid,
      (v) => v.buttons.some((b) => b.label === '+ note'),
      2000,
      'could not find "+ note" button'
    );
    const btn = view.buttons.find((b) => b.label === '+ note');
    const c = center(btn.frame);
    await harness.click(c.x, c.y);
    await sleep(150);
    await island.waitFor(
      w.island.pid,
      (v) => v.elements.some((e) => e.identifier === 'new-note-field'),
      2000,
      'new-note-field did not appear'
    );
  });

  reg.define(/^the note "([^"]+)" is on the shelf$/, async (w, label) => {
    const raw = label.startsWith('✎ ') ? label.slice(2) : label;
    island.feed(w, {
      clearShelf: true,
      clockDate: null,
      seedShelf: [{ kind: 'note', text: raw }],
    });
    await playing(w, 'Wonderwall', 0);
    await ensureIsland(w);
    await openOnShelfPage(w);
    await island.waitFor(
      w.island.pid,
      (v) => v.page === 'shelf' && v.texts.includes(label),
      2500,
      `shelf does not show note "${label}"`
    );
  });

  reg.define(/^a note of 130 characters is on the shelf$/, async (w) => {
    const text130 = 'x'.repeat(130);
    w.baseNoteText = text130;
    island.feed(w, {
      clearShelf: true,
      clockDate: null,
      seedShelf: [{ kind: 'note', text: text130 }],
    });
    await playing(w, 'Wonderwall', 0);
    await ensureIsland(w);
    await openOnShelfPage(w);
    await island.waitFor(
      w.island.pid,
      (v) => v.page === 'shelf' && v.texts.includes(`✎ ${text130}`),
      2500,
      'note of 130 characters not found on shelf'
    );
  });

  // ------------------------------------------------------------- Whens

  reg.define(/^the visionary clicks "\+ note", types "([^"]+)" and presses Return$/, async (w, text) => {
    await openOnShelfPage(w);
    const view = await island.waitFor(
      w.island.pid,
      (v) => v.buttons.some((b) => b.label === '+ note'),
      2000,
      'could not find "+ note" button on shelf'
    );
    const btn = view.buttons.find((b) => b.label === '+ note');
    assert.ok(btn, '"+ note" button not found');
    const c = center(btn.frame);
    await harness.click(c.x, c.y);
    await sleep(150);
    await island.waitFor(
      w.island.pid,
      (v) => v.elements.some((e) => e.identifier === 'new-note-field'),
      2000,
      'new-note-field did not appear'
    );
    await harness.type(text);
    await sleep(100);
    await harness.key(36); // Return
    await sleep(250);
  });

  reg.define(/^the visionary clicks "\+ note" and presses Return on the empty line$/, async (w) => {
    await openOnShelfPage(w);
    const view = await island.waitFor(
      w.island.pid,
      (v) => v.buttons.some((b) => b.label === '+ note'),
      2000,
      'could not find "+ note" button'
    );
    const btn = view.buttons.find((b) => b.label === '+ note');
    const c = center(btn.frame);
    await harness.click(c.x, c.y);
    await sleep(150);
    await island.waitFor(
      w.island.pid,
      (v) => v.elements.some((e) => e.identifier === 'new-note-field'),
      2000,
      'new-note-field did not appear'
    );
    await harness.key(36); // Return
    await sleep(250);
  });

  reg.define(/^the visionary (types|pastes) a text of (.+) and presses Return$/, async (w, enters, lengthStr) => {
    const match = lengthStr.match(/^(\d+)\s*character/);
    assert.ok(match, `could not parse character length from ${lengthStr}`);
    const count = parseInt(match[1], 10);
    const textToEnter = 'a'.repeat(count);

    if (enters === 'types') {
      await harness.type(textToEnter);
    } else if (enters === 'pastes') {
      await harness.paste(textToEnter);
    } else {
      throw new Error(`unknown enters mode: ${enters}`);
    }
    await sleep(100);
    await harness.key(36); // Return
    await sleep(250);
  });

  reg.define(/^the visionary clicks its text, corrects it to "([^"]+)" and presses Return$/, async (w, newText) => {
    await openOnShelfPage(w);
    const view = await island.look(w.island.pid);
    const titleEl = view.elements.find((e) => e.identifier === 'shelf-item-title' && e.value && (e.value.includes('shwos') || e.value.includes('idea:')));
    assert.ok(titleEl, 'could not find note title element');
    w.notePositionBefore = { x: titleEl.frame.x, y: titleEl.frame.y };
    const c = center(titleEl.frame);
    await harness.click(c.x, c.y);
    await sleep(150);
    await island.waitFor(
      w.island.pid,
      (v) => v.elements.some((e) => e.identifier === 'edit-note-field'),
      2000,
      'edit-note-field did not appear'
    );
    // Select all (Cmd+A) and type replacement
    await harness.key(0, 'cmd');
    await sleep(50);
    await harness.type(newText);
    await sleep(100);
    await harness.key(36); // Return
    await sleep(250);
  });

  reg.define(/^the visionary clicks its text, types (\d+) more characters at its end and presses Return$/, async (w, addedStr) => {
    const added = parseInt(addedStr, 10);
    await openOnShelfPage(w);
    const view = await island.look(w.island.pid);
    const titleEl = view.elements.find((e) => e.identifier === 'shelf-item-title');
    assert.ok(titleEl, 'could not find shelf-item-title');
    const c = center(titleEl.frame);
    await harness.click(c.x, c.y);
    await sleep(150);
    await island.waitFor(
      w.island.pid,
      (v) => v.elements.some((e) => e.identifier === 'edit-note-field'),
      2000,
      'edit-note-field did not appear'
    );
    // Cursor is placed at the end by becomeFirstResponder in CustomNoteNSTextField
    await harness.type('b'.repeat(added));
    await sleep(100);
    await harness.key(36); // Return
    await sleep(250);
  });

  reg.define(/^the visionary clicks its text, deletes all of it and presses Return$/, async (w) => {
    await openOnShelfPage(w);
    const view = await island.look(w.island.pid);
    const titleEl = view.elements.find((e) => e.identifier === 'shelf-item-title');
    assert.ok(titleEl, 'could not find shelf-item-title');
    const c = center(titleEl.frame);
    await harness.click(c.x, c.y);
    await sleep(150);
    await island.waitFor(
      w.island.pid,
      (v) => v.elements.some((e) => e.identifier === 'edit-note-field'),
      2000,
      'edit-note-field did not appear'
    );
    // Cmd+A then Delete
    await harness.key(0, 'cmd');
    await sleep(50);
    await harness.key(51);
    await sleep(50);
    await harness.key(36); // Return
    await sleep(250);
  });

  reg.define(/^the visionary hovers the note and clicks the small x that appears$/, async (w) => {
    await openOnShelfPage(w);
    const view = await island.look(w.island.pid);
    const itemEl = view.elements.find((e) => e.identifier === 'shelf-item');
    assert.ok(itemEl, 'could not find shelf-item to hover');
    const c = center(itemEl.frame);
    await harness.glide(c.x, c.y, 4, 8);
    await sleep(150);
    const updatedView = await island.waitFor(
      w.island.pid,
      (v) => v.buttons.some((b) => b.label && b.label.startsWith('Remove')),
      2000,
      'small x remove button did not appear on hover'
    );
    const removeBtn = updatedView.buttons.find((b) => b.label && b.label.startsWith('Remove'));
    assert.ok(removeBtn, 'could not find Remove button');
    const btnC = center(removeBtn.frame);
    await harness.click(btnC.x, btnC.y);
    await sleep(250);
  });

  // ------------------------------------------------------------- Thens

  reg.define(/^the visionary sees "([^"]+)" on the shelf$/, async (w, label) => {
    await openOnShelfPage(w);
    const view = await island.waitFor(
      w.island.pid,
      (v) => v.page === 'shelf' && v.texts.includes(label),
      3000,
      `expected note "${label}" on shelf, but found: ${view?.texts?.join(', ')}`
    );
    assert.ok(view.texts.includes(label), `expected note "${label}" on screen`);

    // Far-side check on disk (shelf.json)
    const shelfFile = path.join(scratch(w), 'island-data', 'notch-island', 'shelf.json');
    assert.ok(fs.existsSync(shelfFile), 'shelf.json does not exist on disk');
    const diskItems = JSON.parse(fs.readFileSync(shelfFile, 'utf8'));
    const cleanText = label.startsWith('✎ ') ? label.slice(2) : label;
    const diskNote = diskItems.find((it) => it.kind && it.kind.note && it.kind.note.text === cleanText);
    assert.ok(diskNote, `expected note with text "${cleanText}" in shelf.json on disk`);
  });

  reg.define(/^the visionary sees the shelf unchanged, holding only "([^"]+)"$/, async (w, label) => {
    await openOnShelfPage(w);
    const view = await island.look(w.island.pid);
    const items = view.elements.filter((e) => e.identifier === 'shelf-item');
    assert.equal(items.length, 1, `expected exactly 1 item on shelf, found ${items.length}`);
    assert.ok(view.texts.includes(label), `expected note "${label}" on shelf`);

    const shelfFile = path.join(scratch(w), 'island-data', 'notch-island', 'shelf.json');
    if (fs.existsSync(shelfFile)) {
      const diskItems = JSON.parse(fs.readFileSync(shelfFile, 'utf8'));
      assert.equal(diskItems.length, 1, `expected 1 item in shelf.json, found ${diskItems.length}`);
    }
  });

  reg.define(/^the visionary sees a note on the shelf holding (.+)$/, async (w, keptDesc) => {
    await openOnShelfPage(w);
    let expectedCount;
    if (keptDesc === 'that 1 character') expectedCount = 1;
    else if (keptDesc === 'all 139 characters') expectedCount = 139;
    else if (keptDesc === 'all 140 characters') expectedCount = 140;
    else if (keptDesc === 'only the first 140 characters') expectedCount = 140;
    else throw new Error(`unrecognized kept description: ${keptDesc}`);

    const view = await island.waitFor(
      w.island.pid,
      (v) => v.page === 'shelf' && v.texts.some((t) => t.startsWith('✎ ') && (t.length - 2) === expectedCount),
      3000,
      `no note on shelf holding ${expectedCount} characters`
    );

    const noteText = view.texts.find((t) => t.startsWith('✎ '));
    assert.ok(noteText, 'note text starting with ✎ not found');
    const actualCharCount = noteText.length - 2;
    assert.equal(actualCharCount, expectedCount, `expected ${expectedCount} characters, got ${actualCharCount}`);

    // Far-side check on disk (shelf.json)
    const shelfFile = path.join(scratch(w), 'island-data', 'notch-island', 'shelf.json');
    assert.ok(fs.existsSync(shelfFile), 'shelf.json does not exist on disk');
    const diskItems = JSON.parse(fs.readFileSync(shelfFile, 'utf8'));
    assert.ok(diskItems.length >= 1, 'no items in shelf.json on disk');
    const diskNote = diskItems[diskItems.length - 1];
    assert.ok(diskNote.kind && diskNote.kind.note, 'last disk item is not a note');
    assert.equal(diskNote.kind.note.text.length, expectedCount);
  });

  reg.define(/^the visionary sees "([^"]+)" in the same place on the shelf$/, async (w, label) => {
    await openOnShelfPage(w);
    const view = await island.waitFor(
      w.island.pid,
      (v) => v.texts.includes(label),
      2500,
      `note "${label}" not found on shelf`
    );
    assert.ok(view.texts.includes(label));
    const titleEl = view.elements.find((e) => e.identifier === 'shelf-item-title' && e.value && e.value.includes(label));
    assert.ok(titleEl, 'could not find shelf-item-title on screen');
    if (w.notePositionBefore) {
      assert.ok(
        Math.abs(titleEl.frame.x - w.notePositionBefore.x) <= 2,
        `expected note at x=${w.notePositionBefore.x}, got x=${titleEl.frame.x}`
      );
    }
    const items = view.elements.filter((e) => e.identifier === 'shelf-item');
    assert.ok(items.length >= 1, 'no shelf-items found');

    const shelfFile = path.join(scratch(w), 'island-data', 'notch-island', 'shelf.json');
    assert.ok(fs.existsSync(shelfFile));
    const diskItems = JSON.parse(fs.readFileSync(shelfFile, 'utf8'));
    const clean = label.startsWith('✎ ') ? label.slice(2) : label;
    assert.ok(diskItems.some((it) => it.kind && it.kind.note && it.kind.note.text === clean));
  });

  reg.define(/^the visionary sees the note holding (.+)$/, async (w, keptDesc) => {
    await openOnShelfPage(w);
    let expectedCount;
    if (keptDesc === 'all 131 characters') expectedCount = 131;
    else if (keptDesc === 'all 140 characters') expectedCount = 140;
    else if (keptDesc.includes('140 characters')) expectedCount = 140;
    else throw new Error(`unrecognized kept description: ${keptDesc}`);

    const view = await island.waitFor(
      w.island.pid,
      (v) => v.page === 'shelf' && v.texts.some((t) => t.startsWith('✎ ') && (t.length - 2) === expectedCount),
      3000,
      `note holding ${expectedCount} characters not found`
    );
    const noteText = view.texts.find((t) => t.startsWith('✎ '));
    assert.ok(noteText);
    const actualCharCount = noteText.length - 2;
    assert.equal(actualCharCount, expectedCount, `expected ${expectedCount} characters, got ${actualCharCount}`);

    // Far-side check on disk (shelf.json)
    const shelfFile = path.join(scratch(w), 'island-data', 'notch-island', 'shelf.json');
    assert.ok(fs.existsSync(shelfFile));
    const diskItems = JSON.parse(fs.readFileSync(shelfFile, 'utf8'));
    const diskNote = diskItems.find((it) => it.kind && it.kind.note);
    assert.ok(diskNote);
    assert.equal(diskNote.kind.note.text.length, expectedCount);
  });

  reg.define(/^the visionary sees the note gone from the shelf$/, async (w) => {
    await openOnShelfPage(w);
    const view = await island.waitFor(
      w.island.pid,
      (v) => !v.texts.some((t) => t.includes('idea: notch app shows lyrics')),
      2500,
      'note still found on shelf'
    );
    assert.ok(!view.texts.some((t) => t.includes('idea: notch app shows lyrics')));

    const shelfFile = path.join(scratch(w), 'island-data', 'notch-island', 'shelf.json');
    if (fs.existsSync(shelfFile)) {
      const diskItems = JSON.parse(fs.readFileSync(shelfFile, 'utf8'));
      assert.ok(!diskItems.some((it) => it.kind && it.kind.note && it.kind.note.text.includes('idea: notch app shows lyrics')));
    }
  });
};
