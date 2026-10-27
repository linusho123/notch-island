'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const harness = require('../support/harness');
const island = require('../support/island');
const { scratch } = require('../support/sandbox');
const { launchDropStandIn } = require('../support/shelf');
const { helpers } = require('./music-panel.steps');

const {
  ensureIsland,
  playing,
  openByRest,
  pointerAway,
} = helpers;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const center = (f) => ({ x: f.x + f.w / 2, y: f.y + f.h / 2 });

function framesIntersect(f1, f2) {
  if (!f1 || !f2) return false;
  return (
    f1.x < f2.x + f2.w &&
    f1.x + f1.w > f2.x &&
    f1.y < f2.y + f2.h &&
    f1.y + f1.h > f2.y
  );
}

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
    await sleep(100);
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
    await sleep(200);
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
    w.textToEnter = textToEnter;

    if (enters === 'types') {
      await harness.type(textToEnter);
    } else if (enters === 'pastes') {
      await harness.paste(textToEnter);
    } else {
      throw new Error(`unknown enters mode: ${enters}`);
    }
    await sleep(200);

    // M4: Check the field's live AX value BEFORE Return (exact string, grapheme count)
    const liveView = await island.look(w.island.pid);
    const fieldEl = liveView.elements.find((e) => e.identifier === 'new-note-field');
    assert.ok(fieldEl, 'new-note-field not found before pressing Return');
    const liveVal = String(fieldEl.value ?? '');
    const expectedCappedCount = Math.min(count, 140);
    const expectedCappedString = textToEnter.slice(0, 140);
    const graphemeCount = [...new Intl.Segmenter().segment(liveVal)].length;
    assert.equal(
      graphemeCount,
      expectedCappedCount,
      `live new-note-field before Return has ${graphemeCount} graphemes, expected ${expectedCappedCount} (D62, D104, M4)`
    );
    assert.equal(
      liveVal,
      expectedCappedString,
      `live new-note-field before Return value mismatch (D62, D104, M4)`
    );

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
    const editView = await island.waitFor(
      w.island.pid,
      (v) => v.elements.some((e) => e.identifier === 'edit-note-field'),
      2000,
      'edit-note-field did not appear'
    );
    const editField = editView.elements.find((e) => e.identifier === 'edit-note-field' && e.frame);
    const removeBtn = editView.buttons.find((b) => b.label && b.label.startsWith('Remove'));
    if (editField && editField.frame && removeBtn && removeBtn.frame) {
      assert.ok(
        !framesIntersect(removeBtn.frame, editField.frame),
        `Remove button frame ${JSON.stringify(removeBtn.frame)} must not intersect edit field frame ${JSON.stringify(editField.frame)} (M3)`
      );
    }
    // Select all (Cmd+A) and type replacement
    await harness.key(0, 'cmd');
    await sleep(50);
    await harness.type(newText);
    await sleep(200);
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
    const editView = await island.waitFor(
      w.island.pid,
      (v) => v.elements.some((e) => e.identifier === 'edit-note-field'),
      2000,
      'edit-note-field did not appear'
    );
    const editField = editView.elements.find((e) => e.identifier === 'edit-note-field' && e.frame);
    const removeBtn = editView.buttons.find((b) => b.label && b.label.startsWith('Remove'));
    if (editField && editField.frame && removeBtn && removeBtn.frame) {
      assert.ok(
        !framesIntersect(removeBtn.frame, editField.frame),
        `Remove button frame ${JSON.stringify(removeBtn.frame)} must not intersect edit field frame ${JSON.stringify(editField.frame)} (M3)`
      );
    }
    // Cursor is placed at the end by becomeFirstResponder in CustomNoteNSTextField
    const addedText = 'b'.repeat(added);
    await harness.type(addedText);
    await sleep(200);

    // M4: Live cap honesty - check field's live AX value BEFORE Return
    const liveView = await island.look(w.island.pid);
    const fieldEl = liveView.elements.find((e) => e.identifier === 'edit-note-field');
    assert.ok(fieldEl, 'edit-note-field not found before pressing Return');
    const liveVal = String(fieldEl.value ?? '');
    const expectedTotal = Math.min(130 + added, 140);
    const graphemeCount = [...new Intl.Segmenter().segment(liveVal)].length;
    assert.equal(
      graphemeCount,
      expectedTotal,
      `live edit field before Return has ${graphemeCount} graphemes, expected ${expectedTotal} (D123, M4)`
    );
    const expectedAddedKept = Math.min(added, 140 - 130);
    assert.ok(
      liveVal.endsWith('b'.repeat(expectedAddedKept)),
      `live edit field expected to end with ${expectedAddedKept} 'b's`
    );
    w.expectedEditedNoteText = liveVal;

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
    const editView = await island.waitFor(
      w.island.pid,
      (v) => v.elements.some((e) => e.identifier === 'edit-note-field'),
      2000,
      'edit-note-field did not appear'
    );
    const editField = editView.elements.find((e) => e.identifier === 'edit-note-field' && e.frame);
    const removeBtn = editView.buttons.find((b) => b.label && b.label.startsWith('Remove'));
    if (editField && editField.frame && removeBtn && removeBtn.frame) {
      assert.ok(
        !framesIntersect(removeBtn.frame, editField.frame),
        `Remove button frame ${JSON.stringify(removeBtn.frame)} must not intersect edit field frame ${JSON.stringify(editField.frame)} (M3)`
      );
    }
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

    // M3: The x never overlaps the note's text or editor: separate gutter, non-intersecting frames
    const textEl = updatedView.elements.find((e) => e.identifier === 'shelf-item-title' && e.frame);
    if (textEl && textEl.frame && removeBtn.frame) {
      assert.ok(
        !framesIntersect(removeBtn.frame, textEl.frame),
        `Remove button frame ${JSON.stringify(removeBtn.frame)} must not intersect text frame ${JSON.stringify(textEl.frame)} (M3)`
      );
    }

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
      `expected note "${label}" on shelf`
    );
    assert.ok(view.texts.includes(label), `expected note "${label}" on screen`);

    // Far-side check on disk (shelf.json)
    const shelfFile = path.join(scratch(w), 'island-data', 'shelf.json');
    assert.ok(fs.existsSync(shelfFile), 'shelf.json does not exist on disk');
    const diskItems = JSON.parse(fs.readFileSync(shelfFile, 'utf8'));
    const cleanText = label.startsWith('✎ ') ? label.slice(2) : label;
    const diskNote = diskItems.find((it) => it.kind && it.kind.note && it.kind.note.text === cleanText);
    assert.ok(diskNote, `expected note with text "${cleanText}" in shelf.json on disk`);
  });

  reg.define(/^the visionary sees the shelf unchanged, holding only "([^"]+)"$/, async (w, label) => {
    await openOnShelfPage(w);
    const view = await island.waitFor(
      w.island.pid,
      (v) => v.page === 'shelf' && v.texts.includes(label) &&
             v.elements.filter((e) => e.identifier === 'shelf-item').length === 1 &&
             !v.elements.some((e) => e.identifier === 'new-note-field'),
      2500,
      `shelf does not hold only ${label}`
    );
    const items = view.elements.filter((e) => e.identifier === 'shelf-item');
    assert.equal(items.length, 1, `expected exactly 1 item on shelf, found ${items.length}`);
    assert.ok(view.texts.includes(label), `expected note "${label}" on shelf`);

    const shelfFile = path.join(scratch(w), 'island-data', 'shelf.json');
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

    const expectedString = (w.textToEnter || 'a'.repeat(expectedCount)).slice(0, expectedCount);

    const view = await island.waitFor(
      w.island.pid,
      (v) => v.page === 'shelf' && v.texts.includes(`✎ ${expectedString}`),
      3000,
      `no note on shelf holding exact text of ${expectedCount} characters`
    );

    const noteText = view.texts.find((t) => t === `✎ ${expectedString}`);
    assert.ok(noteText, `note text starting with ✎ not found`);
    const actualCharCount = [...new Intl.Segmenter().segment(noteText.slice(2))].length;
    assert.equal(actualCharCount, expectedCount, `expected ${expectedCount} characters, got ${actualCharCount}`);

    // Far-side check on disk (shelf.json)
    const shelfFile = path.join(scratch(w), 'island-data', 'shelf.json');
    assert.ok(fs.existsSync(shelfFile), 'shelf.json does not exist on disk');
    const diskItems = JSON.parse(fs.readFileSync(shelfFile, 'utf8'));
    assert.ok(diskItems.length >= 1, 'no items in shelf.json on disk');
    const diskNote = diskItems[diskItems.length - 1];
    assert.ok(diskNote.kind && diskNote.kind.note, 'last disk item is not a note');
    assert.equal(diskNote.kind.note.text, expectedString);
    assert.equal([...new Intl.Segmenter().segment(diskNote.kind.note.text)].length, expectedCount);
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

    const shelfFile = path.join(scratch(w), 'island-data', 'shelf.json');
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

    const expectedString = w.expectedEditedNoteText;

    const view = await island.waitFor(
      w.island.pid,
      (v) => v.page === 'shelf' && (expectedString ? v.texts.includes(`✎ ${expectedString}`) : v.texts.some((t) => t.startsWith('✎ ') && (t.length - 2) === expectedCount)),
      3000,
      `note holding ${expectedCount} characters not found`
    );
    const noteText = expectedString
      ? view.texts.find((t) => t === `✎ ${expectedString}`)
      : view.texts.find((t) => t.startsWith('✎ '));
    assert.ok(noteText);
    const actualCharCount = [...new Intl.Segmenter().segment(noteText.slice(2))].length;
    assert.equal(actualCharCount, expectedCount, `expected ${expectedCount} characters, got ${actualCharCount}`);
    if (expectedString) {
      assert.equal(noteText, `✎ ${expectedString}`);
    }

    // Far-side check on disk (shelf.json)
    const shelfFile = path.join(scratch(w), 'island-data', 'shelf.json');
    assert.ok(fs.existsSync(shelfFile));
    const diskItems = JSON.parse(fs.readFileSync(shelfFile, 'utf8'));
    const diskNote = diskItems.find((it) => it.kind && it.kind.note);
    assert.ok(diskNote);
    assert.equal([...new Intl.Segmenter().segment(diskNote.kind.note.text)].length, expectedCount);
    if (expectedString) {
      assert.equal(diskNote.kind.note.text, expectedString);
    }
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

    const shelfFile = path.join(scratch(w), 'island-data', 'shelf.json');
    if (fs.existsSync(shelfFile)) {
      const diskItems = JSON.parse(fs.readFileSync(shelfFile, 'utf8'));
      assert.ok(!diskItems.some((it) => it.kind && it.kind.note && it.kind.note.text.includes('idea: notch app shows lyrics')));
    }
  });

  // ------------------------------------------------------------- U2: Notes & Reminders Toggle, Check-off, Drag & Week

  reg.define(/^the plain note "([^"]+)" is on the shelf$/, async (w, label) => {
    const raw = label.startsWith('✎ ') ? label.slice(2) : label;
    island.feed(w, {
      clearShelf: true,
      clockDate: null,
      seedShelf: [{ kind: 'note', text: raw, isReminder: false }],
    });
    await playing(w, 'Wonderwall', 0);
    await ensureIsland(w);
    await openOnShelfPage(w);
    await island.waitFor(
      w.island.pid,
      (v) => v.page === 'shelf' && v.texts.includes(label),
      2500,
      `shelf does not show plain note "${label}"`
    );
  });

  reg.define(/^the visionary clicks the small box beside it$/, async (w) => {
    await openOnShelfPage(w);
    const view = await island.waitFor(
      w.island.pid,
      (v) => v.buttons.some((b) => b.label === 'small box'),
      2000,
      'could not find small box button beside note'
    );
    const btn = view.buttons.find((b) => b.label === 'small box');
    assert.ok(btn, 'small box button not found');
    const c = center(btn.frame);
    await harness.click(c.x, c.y);
    await sleep(250);
  });

  reg.define(/^the visionary sees "([^"]+)" as a reminder with an empty box$/, async (w, label) => {
    await openOnShelfPage(w);
    const raw = label.startsWith('✎ ') ? label.slice(2) : label;
    const view = await island.waitFor(
      w.island.pid,
      (v) => v.page === 'shelf' &&
             v.texts.includes(raw) &&
             !v.texts.includes(`✎ ${raw}`) &&
             v.buttons.some((b) => b.label === 'box'),
      3000,
      `expected reminder "${raw}" with empty box on shelf`
    );
    assert.ok(view.texts.includes(raw), `reminder text "${raw}" missing`);
    assert.ok(!view.texts.includes(`✎ ${raw}`), `reminder still has ✎ prefix`);
    assert.ok(view.buttons.some((b) => b.label === 'box'), 'empty box button missing');

    const shelfFile = path.join(scratch(w), 'island-data', 'shelf.json');
    assert.ok(fs.existsSync(shelfFile), 'shelf.json missing');
    const diskItems = JSON.parse(fs.readFileSync(shelfFile, 'utf8'));
    const diskNote = diskItems.find((it) => it.kind && it.kind.note && it.kind.note.text === raw);
    assert.ok(diskNote, `reminder "${raw}" missing from shelf.json`);
    assert.equal(diskNote.kind.note.isReminder, true, 'isReminder not true on disk');
  });

  reg.define(/^the reminder "([^"]+)" is on the shelf with an empty box$/, async (w, label) => {
    const raw = label.startsWith('✎ ') ? label.slice(2) : label;
    island.feed(w, {
      clearShelf: true,
      clockDate: null,
      seedShelf: [{ kind: 'note', text: raw, isReminder: true }],
    });
    await playing(w, 'Wonderwall', 0);
    await ensureIsland(w);
    await openOnShelfPage(w);
    await island.waitFor(
      w.island.pid,
      (v) => v.page === 'shelf' && v.texts.includes(raw) && v.buttons.some((b) => b.label === 'box'),
      2500,
      `shelf does not show reminder "${raw}" with empty box`
    );
  });

  reg.define(/^the visionary clicks the pencil beside it$/, async (w) => {
    await openOnShelfPage(w);
    const view = await island.waitFor(
      w.island.pid,
      (v) => v.buttons.some((b) => b.label === 'pencil'),
      2000,
      'could not find pencil button beside reminder'
    );
    const btn = view.buttons.find((b) => b.label === 'pencil');
    assert.ok(btn, 'pencil button not found');
    const c = center(btn.frame);
    await harness.click(c.x, c.y);
    await sleep(250);
  });

  reg.define(/^the visionary sees "([^"]+)" as a plain note with no box$/, async (w, label) => {
    await openOnShelfPage(w);
    const raw = label.startsWith('✎ ') ? label.slice(2) : label;
    const view = await island.waitFor(
      w.island.pid,
      (v) => v.page === 'shelf' &&
             v.texts.includes(`✎ ${raw}`) &&
             !v.buttons.some((b) => b.label === 'box'),
      3000,
      `expected plain note "✎ ${raw}" with no reminder box`
    );
    assert.ok(view.texts.includes(`✎ ${raw}`), `plain note "✎ ${raw}" missing`);
    assert.ok(!view.buttons.some((b) => b.label === 'box'), 'reminder box should not be present');

    const shelfFile = path.join(scratch(w), 'island-data', 'shelf.json');
    assert.ok(fs.existsSync(shelfFile), 'shelf.json missing');
    const diskItems = JSON.parse(fs.readFileSync(shelfFile, 'utf8'));
    const diskNote = diskItems.find((it) => it.kind && it.kind.note && it.kind.note.text === raw);
    assert.ok(diskNote, `note "${raw}" missing on disk`);
    assert.equal(diskNote.kind.note.isReminder, false, 'isReminder should be false on disk');
  });

  reg.define(/^the visionary clicks its box$/, async (w) => {
    await openOnShelfPage(w);
    const view = await island.waitFor(
      w.island.pid,
      (v) => v.buttons.some((b) => b.label === 'box'),
      2000,
      'could not find reminder box'
    );
    const btn = view.buttons.find((b) => b.label === 'box');
    assert.ok(btn, 'reminder box not found');
    const c = center(btn.frame);
    await harness.click(c.x, c.y);
    await sleep(250);
  });

  reg.define(/^the visionary sees "([^"]+)" gone from the shelf at once, with no struck-through step$/, async (w, label) => {
    await openOnShelfPage(w);
    const raw = label.startsWith('✎ ') ? label.slice(2) : label;
    const view = await island.waitFor(
      w.island.pid,
      (v) => !v.texts.some((t) => t.includes(raw)),
      2500,
      `reminder "${raw}" still found on shelf`
    );
    assert.ok(!view.texts.some((t) => t.includes(raw)), `reminder "${raw}" still on screen`);

    const shelfFile = path.join(scratch(w), 'island-data', 'shelf.json');
    if (fs.existsSync(shelfFile)) {
      const diskItems = JSON.parse(fs.readFileSync(shelfFile, 'utf8'));
      assert.ok(!diskItems.some((it) => it.kind && it.kind.note && it.kind.note.text.includes(raw)), `reminder "${raw}" still in shelf.json`);
    }
  });

  reg.define(/^the note "([^"]+)" and the reminder "([^"]+)" are on the shelf$/, async (w, noteText, reminderText) => {
    const rawNote = noteText.startsWith('✎ ') ? noteText.slice(2) : noteText;
    const rawReminder = reminderText.startsWith('✎ ') ? reminderText.slice(2) : reminderText;
    island.feed(w, {
      clearShelf: true,
      clockDate: null,
      seedShelf: [
        { type: 'note', text: rawNote, isReminder: false },
        { type: 'note', text: rawReminder, isReminder: true },
      ],
    });
    await playing(w, 'Wonderwall', 0);
    await ensureIsland(w);
    await openOnShelfPage(w);
    await island.waitFor(
      w.island.pid,
      (v) => v.page === 'shelf' &&
             v.texts.includes(`✎ ${rawNote}`) &&
             v.texts.includes(rawReminder),
      3000,
      'shelf does not show both note and reminder'
    );
  });

  reg.define(/^the visionary drags the (note|reminder) "([^"]+)" into a Messages chat$/, async (w, kind, text) => {
    w.standIn = await launchDropStandIn(w, { title: 'Messages' });
    await openOnShelfPage(w);
    const view = await island.waitFor(
      w.island.pid,
      (v) => v.elements.some((e) => e.identifier === 'shelf-item'),
      2000,
      'no shelf items found'
    );
    const targetText = kind === 'note' ? (text.startsWith('✎ ') ? text : `✎ ${text}`) : text;
    const itemEl = view.elements.find(
      (e) => e.identifier === 'shelf-item' && (e.description === targetText || (e.value && e.value.includes(text)))
    ) || view.elements.find(
      (e) => e.identifier === 'shelf-item-title' && (e.value === targetText || (e.value && e.value.includes(text)))
    );
    assert.ok(itemEl, `could not find shelf-item for ${kind} "${text}"`);
    const from = center(itemEl.frame);
    const to = {
      x: w.standIn.window.x + w.standIn.window.w / 2,
      y: w.standIn.window.y + w.standIn.window.h / 2,
    };
    await harness.drag(from.x, from.y, to.x, to.y, 20, 15, false);
    await sleep(300);
  });

  reg.define(/^the visionary sees "([^"]+)" in the chat's message field, as if typed$/, async (w, expectedText) => {
    assert.ok(w.standIn, 'no standIn launched');
    await w.standIn.assertReceivedText(expectedText);
  });

  reg.define(/^the visionary sees the (note|reminder) still on the shelf, (.+)$/, async (w, kind, stateDesc) => {
    await openOnShelfPage(w);
    const view = await island.waitFor(
      w.island.pid,
      (v) => v.elements.some((e) => e.identifier === 'shelf-item'),
      2000,
      'no shelf items found'
    );
    if (kind === 'note') {
      assert.ok(view.texts.some((t) => t.includes('idea: notch app shows lyrics')), 'note missing from shelf');
      assert.ok(view.buttons.some((b) => b.label === 'small box'), 'small box toggle missing from note');
    } else {
      assert.ok(view.texts.includes('renew passport'), 'reminder missing from shelf');
      assert.ok(view.buttons.some((b) => b.label === 'box'), "reminder's box missing or not empty");
    }

    const shelfFile = path.join(scratch(w), 'island-data', 'shelf.json');
    assert.ok(fs.existsSync(shelfFile), 'shelf.json missing');
    const diskItems = JSON.parse(fs.readFileSync(shelfFile, 'utf8'));
    if (kind === 'note') {
      const diskNote = diskItems.find((it) => it.kind && it.kind.note && it.kind.note.text.includes('idea: notch app shows lyrics'));
      assert.ok(diskNote, 'note missing on disk');
      assert.equal(diskNote.kind.note.isReminder, false);
    } else {
      const diskReminder = diskItems.find((it) => it.kind && it.kind.note && it.kind.note.text.includes('renew passport'));
      assert.ok(diskReminder, 'reminder missing on disk');
      assert.equal(diskReminder.kind.note.isReminder, true);
    }
  });

  reg.define(/^the note "([^"]+)" and the reminder "([^"]+)", its box empty, were put on the shelf 7 days ago$/, async (w, noteText, reminderText) => {
    const rawNote = noteText.startsWith('✎ ') ? noteText.slice(2) : noteText;
    const rawReminder = reminderText.startsWith('✎ ') ? reminderText.slice(2) : reminderText;

    const baseTime = new Date('2026-10-18T10:00:00Z').getTime();
    const tMinus7Days = new Date(baseTime - 7 * 24 * 3600 * 1000).toISOString();
    w.weekBaseTime = baseTime;
    w.weekStartTime = tMinus7Days;

    island.feed(w, {
      clearShelf: true,
      clockDate: tMinus7Days,
      seedShelf: [
        { type: 'note', text: rawNote, isReminder: false, landedAt: tMinus7Days },
        { type: 'note', text: rawReminder, isReminder: true, landedAt: tMinus7Days },
      ],
    });
    await ensureIsland(w);
  });

  reg.define(/^the island has stayed closed since$/, async (w) => {
    const { notch } = await harness.builtIn();
    let initialView = await island.look(w.island.pid);
    assert.ok(!initialView.open, 'island is open initially');
    assert.ok(!initialView.wing, 'wing is showing initially');

    const baselineRegion = await harness.regionStats(
      Math.max(0, Math.floor(notch.x - 120)),
      0,
      Math.floor(notch.w + 140),
      Math.floor(notch.h + 40)
    );

    w.weekSamples = [];

    for (let day = 1; day <= 7; day++) {
      const stepDate = new Date(new Date(w.weekStartTime).getTime() + day * 24 * 3600 * 1000).toISOString();
      island.feed(w, { clockDate: stepDate });
      await sleep(60);

      const view = await island.look(w.island.pid);
      const region = await harness.regionStats(
        Math.max(0, Math.floor(notch.x - 120)),
        0,
        Math.floor(notch.w + 140),
        Math.floor(notch.h + 40)
      );

      w.weekSamples.push({ day, view, region });
      assert.ok(!view.open, `island opened on day ${day}`);
      assert.ok(!view.wing, `wing popped out on day ${day}`);
      assert.ok(
        Math.abs(region.mean - baselineRegion.mean) < 0.05,
        `pixel stats shifted significantly on day ${day}: was ${baselineRegion.mean}, now ${region.mean}`
      );
    }
  });

  reg.define(/^the visionary opens the shelf page$/, async (w) => {
    await openOnShelfPage(w);
  });

  reg.define(/^the visionary sees the note and the reminder still on the shelf, the reminder's box still empty$/, async (w) => {
    await openOnShelfPage(w);
    const view = await island.waitFor(
      w.island.pid,
      (v) => v.page === 'shelf' &&
             v.texts.includes('✎ idea: notch app shows lyrics') &&
             v.texts.includes('renew passport') &&
             v.buttons.some((b) => b.label === 'box'),
      3000,
      'shelf does not show both note and reminder with empty box'
    );
    assert.ok(view.texts.includes('✎ idea: notch app shows lyrics'), 'plain note missing from shelf');
    assert.ok(view.texts.includes('renew passport'), 'reminder missing from shelf');
    assert.ok(view.buttons.some((b) => b.label === 'box'), "reminder's empty box missing");

    const shelfFile = path.join(scratch(w), 'island-data', 'shelf.json');
    assert.ok(fs.existsSync(shelfFile), 'shelf.json missing');
    const diskItems = JSON.parse(fs.readFileSync(shelfFile, 'utf8'));
    const diskNote = diskItems.find((it) => it.kind && it.kind.note && it.kind.note.text.includes('idea: notch app shows lyrics'));
    assert.ok(diskNote, 'plain note missing from shelf.json');
    assert.equal(diskNote.kind.note.isReminder, false);
    const diskReminder = diskItems.find((it) => it.kind && it.kind.note && it.kind.note.text.includes('renew passport'));
    assert.ok(diskReminder, 'reminder missing from shelf.json');
    assert.equal(diskReminder.kind.note.isReminder, true);
  });

  reg.define(/^the visionary saw no wings and no pop-out for the reminder in those 7 days$/, async (w) => {
    assert.ok(w.weekSamples && w.weekSamples.length > 0, 'no week samples recorded');
    for (const sample of w.weekSamples) {
      assert.ok(!sample.view.open, `island opened on day ${sample.day}`);
      assert.ok(!sample.view.wing, `wing popped out on day ${sample.day}`);
    }
  });
};
