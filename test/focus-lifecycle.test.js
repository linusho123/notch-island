'use strict';
// M10 / Ruling R4: Keyboard focus only while a note editor is open.
// When editing ends (Return, Escape, page change, island closes) focus goes
// back to the app that had it, and ordinary music opening stays non-activating
// as P1 ruled.
const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./support/harness');
const island = require('./support/island');
const { launchDropStandIn } = require('./support/shelf');
const { scratch } = require('./support/sandbox');
const fs = require('node:fs');
const path = require('node:path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function center(rect) {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

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
  const standIn = await launchDropStandIn(world, { title: 'Messages' });
  await harness.activate(standIn.pid);
  await sleep(100);

  const frontBefore = await harness.frontmost();
  assert.equal(frontBefore.pid, standIn.pid, 'DropStandIn should be frontmost initially');

  // Helper to assert focus is with frontBefore and island holds no focus
  async function assertFocusRestored() {
    let last = '';
    await island.until(async () => {
      const now = await harness.frontmost();
      last = JSON.stringify({ front: now, keys: await harness.keyboardFocus(), panels: await harness.windows(pid) });
      if (now.pid !== frontBefore.pid) return false;
      const keys = await harness.keyboardFocus();
      if (keys.element === pid || keys.app === pid) return false;
      if (keys.app && keys.app !== frontBefore.pid) return false;
      const panels = await harness.windows(pid);
      const keyed = panels.filter((p) => p.focused || p.main);
      return keyed.length === 0;
    }, 2500, () => `focus was not fully restored to prior app; want ${frontBefore.pid}, island ${pid}, last ${last}`);

    const now = await harness.frontmost();
    assert.equal(now.pid, frontBefore.pid, `focus was not restored to ${frontBefore.name}; current is ${now.name}`);
    const keys = await harness.keyboardFocus();
    assert.notEqual(keys.element, pid, 'the island panel holds keyboard focus');
    assert.notEqual(keys.app, pid, 'the island app holds keyboard focus');
    if (keys.app) {
      assert.equal(keys.app, frontBefore.pid, `the keyboard focus is with process ${keys.app}, not with ${frontBefore.name}`);
    }
    const panels = await harness.windows(pid);
    const keyed = panels.filter((p) => p.focused || p.main);
    assert.equal(keyed.length, 0, 'an island window is still focused or main');
  }

  // 1. Ordinary music opening stays non-activating (P1 rule)
  await harness.click(notch.x + notch.w / 2, notch.y + 10);
  const view1 = await island.waitFor(pid, (v) => v.open && v.page === 'music', 2500, 'island did not open on music');
  await assertFocusRestored();

  async function clickAddNote() {
    await sleep(250);
    const view = await island.waitFor(
      pid,
      (v) => v.buttons.some((b) => b.label === '+ note'),
      2000,
      '+ note button not found'
    );
    const btn = view.buttons.find((b) => b.label === '+ note');
    assert.ok(btn, '+ note button missing');
    const c = center(btn.frame);
    await harness.click(c.x, c.y);
    try {
      await island.waitFor(
        pid,
        (v) => v.elements.some((e) => e.identifier === 'new-note-field'),
        1500
      );
    } catch {
      // Settle and retry click once if spring transition shifted frame
      await sleep(150);
      const v2 = await island.look(pid);
      const b2 = v2.buttons.find((b) => b.label === '+ note');
      if (b2) {
        const c2 = center(b2.frame);
        await harness.click(c2.x, c2.y);
      }
      await island.waitFor(
        pid,
        (v) => v.elements.some((e) => e.identifier === 'new-note-field'),
        2000,
        'new note field did not appear'
      );
    }
  }

  // 2. Open shelf page and click "+ note" to start editing
  const c1 = center(view1.panel);
  await harness.glide(c1.x, c1.y, 4, 8);
  await sleep(60);
  await harness.scroll(-80, 'trackpad');
  await island.waitFor(pid, (v) => v.open && v.page === 'shelf', 2500, 'shelf page did not show');
  await clickAddNote();

  // 3. Ending editing with Escape releases focus back to prior app
  await harness.key(53); // Escape
  await island.waitFor(
    pid,
    (v) => !v.elements.some((e) => e.identifier === 'new-note-field'),
    2000,
    'new note field did not dismiss'
  );
  await assertFocusRestored();

  // 4. Start editing again, then switch to music page: focus must be released
  await clickAddNote();

  // Switch to music page via vertical scroll
  await harness.scroll(80, 'trackpad');
  const viewMusic2 = await island.waitFor(pid, (v) => v.open && v.page === 'music', 2500, 'did not return to music page');
  await assertFocusRestored();

  // 5. Switch to shelf, start editing, then close island: focus must be released
  const c2 = center(viewMusic2.panel);
  await harness.glide(c2.x, c2.y, 4, 8);
  await sleep(60);
  await harness.scroll(-80, 'trackpad');
  await island.waitFor(pid, (v) => v.open && v.page === 'shelf', 2500, 'shelf page did not show');
  await clickAddNote();

  // A note being typed holds the island open with the pointer off it: the
  // keys keep landing in the note, never in the app behind.
  await harness.type('away');
  const standInCenter = center(standIn.window);
  await harness.move(standInCenter.x, standInCenter.y);
  await sleep(1500); // three times the grace
  const held = await island.look(pid);
  assert.ok(held.open, 'the island closed while a note was being typed');
  assert.ok(held.elements.some((e) => e.identifier === 'new-note-field'), 'the note field went away');
  await harness.type('less');

  // A click outside ends the typing and keeps the note; the island closes
  // after its grace and the focus is back with the app behind.
  await harness.click(standInCenter.x, standInCenter.y);
  await island.waitFor(pid, (v) => !v.open, 2500, 'island did not close after the click outside');
  await assertFocusRestored();
  await harness.click(notch.x + notch.w / 2, notch.y + 10);
  // Settled open, not a frame of the spring: the scroll aims at its middle.
  const reopened = await island.waitFor(pid, (v) => v.open && v.panel && v.panel.w >= 455 && v.panel.h > 100, 2500,
    'island did not reopen');
  await harness.glide(center(reopened.panel).x, center(reopened.panel).y, 4, 8);
  await sleep(60);
  await harness.scroll(-80, 'trackpad');
  await island.waitFor(pid, (v) => v.page === 'shelf' && v.texts.some((t) => t.includes('awayless')), 2500,
    'the note typed with the pointer off the island was not kept as "awayless"');
});

test('closing and turning back to music with no note open never re-orders the card', async (t) => {
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
  await harness.click(notch.x + notch.w / 2, notch.y + 10);
  const view = await island.waitFor(pid, (v) => v.open && v.page === 'music', 2500, 'island did not open on music');
  const c = center(view.panel);
  await harness.glide(c.x, c.y, 4, 8);
  await sleep(60);
  await harness.scroll(-80, 'trackpad');
  await island.waitFor(pid, (v) => v.open && v.page === 'shelf', 2500, 'shelf page did not show');
  await sleep(400);

  // The test build logs each re-order of the card (the step that gives a
  // note's keyboard focus back); with no note open there must be none, not
  // on turning back to music and not on closing.
  const logFile = path.join(scratch(world), 'island.log');
  const reorders = () => (fs.readFileSync(logFile, 'utf8').match(/card re-ordered/g) || []).length;
  await harness.scroll(80, 'trackpad');
  await island.waitFor(pid, (v) => v.open && v.page === 'music', 2500, 'did not return to music page');
  await sleep(300);
  assert.equal(reorders(), 0, 'the card was re-ordered (hidden and shown) turning back to music');
  await harness.move(notch.x + notch.w / 2, notch.y + 400);
  await island.waitFor(pid, (v) => !v.open, 2500, 'island did not close');
  await sleep(300);
  assert.equal(reorders(), 0, 'the card was re-ordered (hidden and shown) on closing');
});
