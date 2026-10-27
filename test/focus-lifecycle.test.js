'use strict';
// M10 / Ruling R4: Keyboard focus only while a note editor is open.
// When editing ends (Return, Escape, page change, island closes) focus goes
// back to the app that had it, and ordinary music opening stays non-activating
// as P1 ruled.
const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./support/harness');
const island = require('./support/island');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('M10 / R4: keyboard focus released when editing ends, page changes, or island closes', async (t) => {
  const defers = [];
  const world = { defer: (fn) => defers.push(fn) };
  t.after(async () => {
    try { await harness.release(); } catch {}
    for (const fn of defers.reverse()) {
      try { await fn(); } catch {}
    }
  });

  const { pid } = await island.launch(world);
  const { notch } = await harness.builtIn();

  // Ensure a known stand-in app is frontmost before testing
  const standIn = await harness.startDropStandIn();
  world.defer(async () => {
    try { await harness.stopDropStandIn(standIn.pid); } catch {}
  });
  await harness.activate(standIn.pid);
  await sleep(100);

  const frontBefore = await harness.frontmost();
  assert.equal(frontBefore.pid, standIn.pid, 'DropStandIn should be frontmost initially');

  // Helper to assert focus is with frontBefore and island holds no focus
  async function assertFocusRestored() {
    const now = await harness.frontmost();
    assert.equal(now.pid, frontBefore.pid, `focus was not restored to ${frontBefore.name}; current is ${now.name}`);
    const keys = await harness.keyboardFocus();
    assert.notEqual(keys.element, pid, 'the island panel holds keyboard focus');
    assert.notEqual(keys.app, pid, 'the island app holds keyboard focus');
    const panels = await harness.windows(pid);
    const keyed = panels.filter((p) => p.focused || p.main);
    assert.equal(keyed.length, 0, 'an island window is still focused or main');
  }

  // 1. Ordinary music opening stays non-activating (P1 rule)
  await harness.click(notch.x + notch.w / 2, notch.y + 10);
  await island.waitFor(pid, (v) => v.open && v.page === 'music', 2500, 'island did not open on music');
  await assertFocusRestored();

  // 2. Open shelf page and click "+ note" to start editing
  await harness.scroll(-80, 'trackpad');
  await island.waitFor(pid, (v) => v.open && v.page === 'shelf', 2500, 'shelf page did not show');

  const addNoteBtn = await island.waitFor(
    pid,
    (v) => v.buttons.find((b) => b.label === '+ note'),
    2000,
    '+ note button not found'
  );
  const btn = addNoteBtn.buttons.find((b) => b.label === '+ note');
  assert.ok(btn, '+ note button missing');
  await harness.click(btn.frame.x + btn.frame.w / 2, btn.frame.y + btn.frame.h / 2);

  // Field editor opens: island takes focus
  await island.waitFor(
    pid,
    (v) => v.elements.some((e) => e.identifier === 'new-note-field'),
    2000,
    'new note field did not appear'
  );

  // 3. Ending editing with Escape releases focus back to prior app
  await harness.key('escape');
  await island.waitFor(
    pid,
    (v) => !v.elements.some((e) => e.identifier === 'new-note-field'),
    2000,
    'new note field did not dismiss'
  );
  await assertFocusRestored();

  // 4. Start editing again, then switch to music page: focus must be released
  const addNoteBtn2 = await island.waitFor(
    pid,
    (v) => v.buttons.find((b) => b.label === '+ note'),
    2000,
    '+ note button not found'
  );
  const btn2 = addNoteBtn2.buttons.find((b) => b.label === '+ note');
  await harness.click(btn2.frame.x + btn2.frame.w / 2, btn2.frame.y + btn2.frame.h / 2);
  await island.waitFor(
    pid,
    (v) => v.elements.some((e) => e.identifier === 'new-note-field'),
    2000,
    'new note field did not appear'
  );

  // Switch to music page via vertical scroll
  await harness.scroll(80, 'trackpad');
  await island.waitFor(pid, (v) => v.open && v.page === 'music', 2500, 'did not return to music page');
  await assertFocusRestored();

  // 5. Switch to shelf, start editing, then close island: focus must be released
  await harness.scroll(-80, 'trackpad');
  await island.waitFor(pid, (v) => v.open && v.page === 'shelf', 2500, 'shelf page did not show');
  const addNoteBtn3 = await island.waitFor(
    pid,
    (v) => v.buttons.find((b) => b.label === '+ note'),
    2000,
    '+ note button not found'
  );
  const btn3 = addNoteBtn3.buttons.find((b) => b.label === '+ note');
  await harness.click(btn3.frame.x + btn3.frame.w / 2, btn3.frame.y + btn3.frame.h / 2);
  await island.waitFor(
    pid,
    (v) => v.elements.some((e) => e.identifier === 'new-note-field'),
    2000,
    'new note field did not appear'
  );

  // Move far away to close the island
  await harness.move(notch.x + notch.w / 2, notch.y + 400);
  await island.waitFor(pid, (v) => !v.open, 2500, 'island did not close');
  await assertFocusRestored();
});
