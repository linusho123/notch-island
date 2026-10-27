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
    await island.until(async () => {
      const now = await harness.frontmost();
      if (now.pid !== frontBefore.pid) return false;
      const keys = await harness.keyboardFocus();
      if (keys.element === pid || keys.app === pid) return false;
      if (keys.app && keys.app !== frontBefore.pid) return false;
      const panels = await harness.windows(pid);
      const keyed = panels.filter((p) => p.focused || p.main);
      return keyed.length === 0;
    }, 2500, 'focus was not fully restored to prior app');

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

  // Move far away to close the island
  await harness.move(notch.x + notch.w / 2, notch.y + 400);
  await island.waitFor(pid, (v) => !v.open, 2500, 'island did not close');
  await assertFocusRestored();
});
