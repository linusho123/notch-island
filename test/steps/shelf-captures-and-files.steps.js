'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const harness = require('../support/harness');
const island = require('../support/island');
const scenes = require('../support/scenes');
const { helpers } = require('./music-panel.steps');
const {
  scratchDesktop,
  scratchDocuments,
  scratchScreenshots,
  setupScreenshotLocation,
  restartIsland,
} = require('../support/shelf');

const {
  ensureIsland,
  playing,
  rest,
  openOnMusicPage,
  pointerAway,
} = helpers;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const center = (f) => ({ x: f.x + f.w / 2, y: f.y + f.h / 2 });

async function scrollToShelf(w) {
  const view = await island.look(w.island.pid);
  assert.ok(view.panel, 'the island is not open');
  w.beforeScroll = view;
  const c = center(view.panel);
  await harness.glide(c.x, c.y, 4, 8);
  await sleep(60);
  await harness.scroll(-80, 'trackpad');
}

async function scrollToMusic(w) {
  const view = await island.look(w.island.pid);
  assert.ok(view.panel, 'the island is not open');
  w.beforeScroll = view;
  const c = center(view.panel);
  await harness.glide(c.x, c.y, 4, 8);
  await sleep(60);
  await harness.scroll(80, 'trackpad');
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
    view = await island.waitFor(w.island.pid, (v) => v.open && v.page === 'shelf', 2000, 'shelf page did not open');
  }
  return view;
}

module.exports = function (reg) {
  // ------------------------------------------------------------- Givens

  reg.define(/^the island is open on the music page over "Wonderwall"$/, async (w) => {
    await playing(w, 'Wonderwall', 0);
    await ensureIsland(w);
    await rest(w, 350);
    await openOnMusicPage(w);
  });

  reg.define(/^the island is open on the shelf page$/, async (w) => {
    await playing(w, 'Wonderwall', 0);
    await ensureIsland(w);
    await openOnShelfPage(w);
  });

  reg.define(/^the shelf is empty and screenshots save to the Desktop$/, async (w) => {
    setupScreenshotLocation(w, scratchDesktop(w));
    island.feed(w, { clearShelf: true, clockDate: null });
    await ensureIsland(w);
  });

  reg.define(/^the shelf is empty$/, async (w) => {
    setupScreenshotLocation(w, scratchDesktop(w));
    island.feed(w, { clearShelf: true, clockDate: null });
    await ensureIsland(w);
  });

  reg.define(/^the shelf holds one screenshot, taken at 10:15:00$/, async (w) => {
    setupScreenshotLocation(w, scratchDesktop(w));
    const desktop = scratchDesktop(w);
    const shot = path.join(desktop, 'Screenshot 2026-10-18 at 10.15.00.png');
    execSync(`/usr/sbin/screencapture -x "${shot}"`);
    const t0 = '2026-10-18T10:15:00Z';
    w.t0 = new Date(t0).getTime();
    island.feed(w, {
      clearShelf: true,
      clockDate: t0,
      seedShelf: [{ type: 'screenshot', path: shot, landedAt: t0 }],
    });
    await ensureIsland(w);
  });

  reg.define(/^the shelf holds no screenshots$/, async (w) => {
    setupScreenshotLocation(w, scratchDesktop(w));
    island.feed(w, { clearShelf: true, clockDate: null });
    await ensureIsland(w);
  });

  reg.define(/^the shelf holds a stack reading "30 screenshots", the last taken a few seconds ago$/, async (w) => {
    setupScreenshotLocation(w, scratchDesktop(w));
    const desktop = scratchDesktop(w);
    const base = new Date('2026-10-18T10:15:00Z').getTime();
    const seeds = [];
    for (let i = 1; i <= 30; i++) {
      const shot = path.join(desktop, `Screenshot-30stack-${i}.png`);
      execSync(`/usr/sbin/screencapture -x "${shot}"`);
      const date = new Date(base + i * 2000).toISOString();
      seeds.push({ type: 'screenshot', path: shot, landedAt: date });
    }
    const lastDate = new Date(base + 30 * 2000).toISOString();
    island.feed(w, {
      clearShelf: true,
      clockDate: lastDate,
      seedShelf: seeds,
    });
    await ensureIsland(w);
  });

  reg.define(/^the shelf holds a stack reading "3 screenshots, 1 recording"$/, async (w) => {
    setupScreenshotLocation(w, scratchDesktop(w));
    const desktop = scratchDesktop(w);
    const base = new Date('2026-10-18T10:15:00Z').getTime();
    const seeds = [];
    for (let i = 1; i <= 3; i++) {
      const shot = path.join(desktop, `Screenshot-exp-${i}.png`);
      execSync(`/usr/sbin/screencapture -x "${shot}"`);
      seeds.push({ type: 'screenshot', path: shot, landedAt: new Date(base + i * 2000).toISOString() });
    }
    const rec = path.join(desktop, 'Screen Recording 2026-10-18 at 10.16.40.mov');
    execSync(`/usr/sbin/screencapture -V 1 "${rec}"`);
    seeds.push({ type: 'screenRecording', path: rec, landedAt: new Date(base + 4 * 2000).toISOString() });
    island.feed(w, {
      clearShelf: true,
      clockDate: new Date(base + 4 * 2000).toISOString(),
      seedShelf: seeds,
    });
    await ensureIsland(w);
  });

  reg.define(/^the shelf holds a stack reading "3 screenshots, 1 recording" whose captures are on the Desktop$/, async (w) => {
    setupScreenshotLocation(w, scratchDesktop(w));
    const desktop = scratchDesktop(w);
    const base = new Date('2026-10-18T10:15:00Z').getTime();
    const seeds = [];
    for (let i = 1; i <= 3; i++) {
      const shot = path.join(desktop, `Screenshot-rem-${i}.png`);
      execSync(`/usr/sbin/screencapture -x "${shot}"`);
      seeds.push({ type: 'screenshot', path: shot, landedAt: new Date(base + i * 2000).toISOString() });
    }
    const rec = path.join(desktop, 'Screen Recording 2026-10-18 at 10.16.40.mov');
    execSync(`/usr/sbin/screencapture -V 1 "${rec}"`);
    seeds.push({ type: 'screenRecording', path: rec, landedAt: new Date(base + 4 * 2000).toISOString() });
    island.feed(w, {
      clearShelf: true,
      clockDate: new Date(base + 4 * 2000).toISOString(),
      seedShelf: seeds,
    });
    await ensureIsland(w);
  });

  reg.define(/^"tax-return\.pdf" is parked on the shelf from the Documents folder$/, async (w) => {
    const docs = scratchDocuments(w);
    const pdf = path.join(docs, 'tax-return.pdf');
    fs.writeFileSync(pdf, '%PDF-1.4 tax return content');
    island.feed(w, {
      clearShelf: true,
      seedShelf: [{ type: 'file', path: pdf, landedAt: new Date().toISOString() }],
    });
    await ensureIsland(w);
  });

  reg.define(/^"Screenshot 2026-10-18 at 23\.58\.00\.png" was parked on the shelf at 11:58 pm and has not been dragged out or removed$/, async (w) => {
    setupScreenshotLocation(w, scratchDesktop(w));
    const desktop = scratchDesktop(w);
    const shot = path.join(desktop, 'Screenshot 2026-10-18 at 23.58.00.png');
    execSync(`/usr/sbin/screencapture -x "${shot}"`);
    const landedAt = '2026-10-18T23:58:00Z';
    island.feed(w, {
      clearShelf: true,
      clockDate: landedAt,
      seedShelf: [{ type: 'screenshot', path: shot, landedAt }],
    });
    await ensureIsland(w);
  });

  reg.define(/^a link to "gov\.uk\/renew-adult-passport" was parked on the shelf 7 days ago and never removed$/, async (w) => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    island.feed(w, {
      clearShelf: true,
      seedShelf: [{
        type: 'link',
        url: 'https://gov.uk/renew-adult-passport',
        title: 'gov.uk/renew-adult-passport',
        landedAt: sevenDaysAgo,
      }],
    });
    await ensureIsland(w);
  });

  reg.define(/^the shelf holds 3 notes, 1 reminder and 2 parked files, one of them "tax-return\.pdf" parked at 9:00 am$/, async (w) => {
    const docs = scratchDocuments(w);
    const pdf = path.join(docs, 'tax-return.pdf');
    fs.writeFileSync(pdf, '%PDF-1.4 dummy pdf');
    const file2 = path.join(docs, 'notes.txt');
    fs.writeFileSync(file2, 'hello world');
    const t9am = '2026-10-18T09:00:00Z';
    island.feed(w, {
      clearShelf: true,
      clockDate: t9am,
      seedShelf: [
        { type: 'note', text: 'Note 1', isReminder: false, landedAt: t9am },
        { type: 'note', text: 'Note 2', isReminder: false, landedAt: t9am },
        { type: 'note', text: 'Note 3', isReminder: false, landedAt: t9am },
        { type: 'note', text: 'Reminder 1', isReminder: true, landedAt: t9am },
        { type: 'file', path: pdf, landedAt: t9am },
        { type: 'file', path: file2, landedAt: t9am },
      ],
    });
    await ensureIsland(w);
  });

  // ------------------------------------------------------------- Whens

  reg.define(/^the visionary scrolls down with two fingers$/, async (w) => {
    await scrollToShelf(w);
  });

  reg.define(/^the visionary scrolls up with two fingers$/, async (w) => {
    await scrollToMusic(w);
  });

  reg.define(/^the visionary takes a screenshot that saves as a file$/, async (w) => {
    const desktop = scratchDesktop(w);
    const file = path.join(desktop, 'Screenshot 2026-10-18 at 10.15.02.png');
    execSync(`/usr/sbin/screencapture -x "${file}"`);
    await sleep(200);
  });

  reg.define(/^the visionary makes a screen recording that saves as a "\.mov" file$/, async (w) => {
    const desktop = scratchDesktop(w);
    const file = path.join(desktop, 'Screen Recording 2026-10-18 at 10.16.40.mov');
    execSync(`/usr/sbin/screencapture -V 1 "${file}"`);
    await sleep(200);
  });

  reg.define(/^the visionary takes a screenshot copied only to the clipboard$/, async () => {
    execSync('/usr/sbin/screencapture -c');
    await sleep(100);
  });

  reg.define(/^the visionary takes a screenshot saved by another screenshot tool$/, async (w) => {
    const desktop = scratchDesktop(w);
    const file = path.join(desktop, 'Screenshot 2026-10-18 at 10.15.02.png');
    fs.writeFileSync(file, 'image-saved-by-third-party-tool');
    await sleep(100);
  });

  reg.define(/^the visionary (takes another screenshot|makes a screen recording) (\d+ seconds) after the first$/, async (w, action, gapStr) => {
    const gapSec = parseInt(gapStr, 10);
    const desktop = scratchDesktop(w);
    const base = w.t0 || new Date('2026-10-18T10:15:00Z').getTime();
    const secondTime = new Date(base + gapSec * 1000).toISOString();
    island.feed(w, { clockDate: secondTime });

    if (action.includes('screenshot')) {
      const shot2 = path.join(desktop, `Screenshot 2026-10-18 at 10.15.${gapSec < 10 ? '0' : ''}${gapSec}.png`);
      execSync(`/usr/sbin/screencapture -x "${shot2}"`);
    } else {
      const rec = path.join(desktop, `Screen Recording 2026-10-18 at 10.15.${gapSec < 10 ? '0' : ''}${gapSec}.mov`);
      execSync(`/usr/sbin/screencapture -V 1 "${rec}"`);
    }
    await sleep(200);
  });

  reg.define(/^the visionary takes 30 screenshots in a row, each within a few seconds of the last$/, async (w) => {
    const desktop = scratchDesktop(w);
    for (let i = 1; i <= 30; i++) {
      const file = path.join(desktop, `Screenshot-burst-${i}.png`);
      execSync(`/usr/sbin/screencapture -x "${file}"`);
    }
    await sleep(300);
  });

  reg.define(/^the visionary takes a 31st screenshot$/, async (w) => {
    const desktop = scratchDesktop(w);
    const file = path.join(desktop, 'Screenshot-burst-31.png');
    execSync(`/usr/sbin/screencapture -x "${file}"`);
    await sleep(200);
  });

  reg.define(/^the visionary expands the stack$/, async (w) => {
    await openOnShelfPage(w);
    const view = await island.look(w.island.pid);
    const btn = view.buttons.find((b) => b.label && b.label.startsWith('Expand'));
    assert.ok(btn, 'could not find Expand button on stack');
    const c = center(btn.frame);
    await harness.click(c.x, c.y);
    await sleep(200);
  });

  reg.define(/^the visionary removes it by clicking the small x that appears on hovering it$/, async (w) => {
    await openOnShelfPage(w);
    const view = await island.look(w.island.pid);
    const btn = view.buttons.find((b) => b.label && b.label.includes('tax-return.pdf'));
    assert.ok(btn, 'could not find Remove button for tax-return.pdf');
    const c = center(btn.frame);
    await harness.move(c.x, c.y);
    await sleep(50);
    await harness.click(c.x, c.y);
    await sleep(200);
  });

  reg.define(/^the visionary hovers the stack and clicks the small x that appears$/, async (w) => {
    await openOnShelfPage(w);
    const view = await island.look(w.island.pid);
    const btn = view.buttons.find((b) => b.label && b.label.startsWith('Remove'));
    assert.ok(btn, 'could not find Remove button on stack');
    const c = center(btn.frame);
    await harness.move(c.x, c.y);
    await sleep(50);
    await harness.click(c.x, c.y);
    await sleep(200);
  });

  reg.define(/^the visionary opens the shelf page at (12:01 am the next morning|11:57 pm the next night|11:59 pm the next night)$/, async (w, when) => {
    let clockStr = '2026-10-19T00:01:00Z';
    if (when.includes('11:57 pm')) clockStr = '2026-10-19T23:57:00Z';
    else if (when.includes('11:59 pm')) clockStr = '2026-10-19T23:59:00Z';
    island.feed(w, { clockDate: clockStr });
    await openOnShelfPage(w);
  });

  reg.define(/^the visionary opens the shelf page$/, async (w) => {
    await openOnShelfPage(w);
  });

  reg.define(/^the Mac restarts (for an update|after a crash) at 2:00 pm and the visionary logs back in$/, async (w, how) => {
    const t2pm = '2026-10-18T14:00:00Z';
    island.feed(w, { clockDate: t2pm });
    await restartIsland(w, how);
  });

  // ------------------------------------------------------------- Thens

  reg.define(/^the visionary sees the music page slide up and out and the shelf page come up from below$/, async (w) => {
    await island.waitFor(w.island.pid, (v) => v.open && v.page === 'shelf', 2000, 'the shelf page did not come up');
  });

  reg.define(/^the visionary sees the shelf page at the same size as the music page$/, async (w) => {
    const view = await island.look(w.island.pid);
    assert.ok(view.shelfFrame && view.musicFrame, 'frames not found');
    assert.equal(view.shelfFrame.w, view.musicFrame.w, 'shelf page width does not match music page');
    assert.equal(view.shelfFrame.h, view.musicFrame.h, 'shelf page height does not match music page');
  });

  reg.define(/^the visionary sees the small bar at the side mark the shelf page as showing$/, async (w) => {
    const view = await island.look(w.island.pid);
    const bar = view.elements.find((e) => e.identifier === 'page-bar');
    assert.ok(bar && bar.description && bar.description.includes('Shelf page showing'),
      `small bar does not mark shelf page showing: ${bar?.description}`);
  });

  reg.define(/^the visionary sees the music page come back over "Wonderwall"$/, async (w) => {
    await island.waitFor(
      w.island.pid,
      (v) => v.open && v.page === 'music' && v.texts.includes('Wonderwall'),
      3000,
      'music page did not come back over Wonderwall'
    );
  });

  reg.define(/^the visionary sees the small bar at the side mark the music page as showing$/, async (w) => {
    const view = await island.look(w.island.pid);
    const bar = view.elements.find((e) => e.identifier === 'page-bar');
    assert.ok(bar && bar.description && bar.description.includes('Music page showing'),
      `small bar does not mark music page showing: ${bar?.description}`);
  });

  reg.define(/^the visionary sees "([^"]+)" on the Desktop as before$/, async (w, file) => {
    const desktop = scratchDesktop(w);
    const filePath = path.join(desktop, file);
    assert.ok(fs.existsSync(filePath), `${file} is not on the Desktop at ${filePath}`);
  });

  reg.define(/^the visionary sees "([^"]+)" on the shelf page, ready to drag$/, async (w, file) => {
    await openOnShelfPage(w);
    await island.waitFor(
      w.island.pid,
      (v) => v.page === 'shelf' && v.texts.includes(file),
      2500,
      `the shelf page does not show ${file}`
    );
  });

  reg.define(/^the visionary sees the shelf page still empty$/, async (w) => {
    await openOnShelfPage(w);
    const view = await island.look(w.island.pid);
    const items = view.elements.filter((e) => e.identifier === 'shelf-item');
    assert.equal(items.length, 0, `the shelf is not empty, found ${items.length} items: ${view.texts.join(', ')}`);
  });

  reg.define(/^the visionary sees (one stack reading "2 screenshots"|one stack reading "1 screenshot, 1 recording"|two separate screenshots|a screenshot and a separate recording)$/, async (w, shelf) => {
    await openOnShelfPage(w);
    if (shelf === 'one stack reading "2 screenshots"') {
      await island.waitFor(w.island.pid, (v) => v.texts.includes('2 screenshots'), 2000, 'shelf does not show 2 screenshots stack');
    } else if (shelf === 'one stack reading "1 screenshot, 1 recording"') {
      await island.waitFor(w.island.pid, (v) => v.texts.includes('1 screenshot, 1 recording'), 2000, 'shelf does not show mixed stack');
    } else if (shelf === 'two separate screenshots') {
      const view = await island.waitFor(
        w.island.pid,
        (v) => v.elements.filter((e) => e.identifier === 'shelf-item').length === 2,
        2000,
        'shelf does not show 2 items'
      );
      assert.ok(!view.texts.includes('2 screenshots'), 'shelf stacked the screenshots instead of keeping them separate');
    } else if (shelf === 'a screenshot and a separate recording') {
      const view = await island.waitFor(
        w.island.pid,
        (v) => v.elements.filter((e) => e.identifier === 'shelf-item').length === 2,
        2000,
        'shelf does not show 2 items'
      );
      assert.ok(!view.texts.includes('1 screenshot, 1 recording'), 'shelf stacked instead of keeping them separate');
    }
  });

  reg.define(/^the visionary sees one stack on the shelf reading "(30 screenshots|31 screenshots)"$/, async (w, label) => {
    await openOnShelfPage(w);
    await island.waitFor(w.island.pid, (v) => v.texts.includes(label), 3000, `shelf does not show stack "${label}"`);
  });

  reg.define(/^the visionary sees no new item started beside it$/, async (w) => {
    const view = await island.look(w.island.pid);
    const items = view.elements.filter((e) => e.identifier === 'shelf-item');
    assert.equal(items.length, 1, `expected 1 stack item, found ${items.length}`);
  });

  reg.define(/^the visionary sees the 3 screenshots and the recording as separate items on the shelf page$/, async (w) => {
    await openOnShelfPage(w);
    const view = await island.waitFor(
      w.island.pid,
      (v) => v.elements.filter((e) => e.identifier === 'shelf-item').length === 4,
      2000,
      'shelf does not show 4 separate items'
    );
    assert.equal(view.elements.filter((e) => e.identifier === 'shelf-item').length, 4);
  });

  reg.define(/^the visionary sees "tax-return\.pdf" gone from the shelf page$/, async (w) => {
    await openOnShelfPage(w);
    const view = await island.look(w.island.pid);
    assert.ok(!view.texts.includes('tax-return.pdf'), 'tax-return.pdf is still on shelf');
  });

  reg.define(/^the visionary sees "tax-return\.pdf" still in the Documents folder$/, async (w) => {
    const docs = scratchDocuments(w);
    assert.ok(fs.existsSync(path.join(docs, 'tax-return.pdf')), 'tax-return.pdf is missing from Documents');
  });

  reg.define(/^the visionary sees the stack gone from the shelf page$/, async (w) => {
    await openOnShelfPage(w);
    const view = await island.look(w.island.pid);
    const items = view.elements.filter((e) => e.identifier === 'shelf-item');
    assert.equal(items.length, 0, `stack still on shelf: ${view.texts.join(', ')}`);
  });

  reg.define(/^the visionary sees the 3 screenshots and the recording still on the Desktop$/, async (w) => {
    const desktop = scratchDesktop(w);
    const files = fs.readdirSync(desktop);
    assert.ok(files.filter((f) => f.startsWith('Screenshot')).length >= 3, 'screenshots missing from Desktop');
    assert.ok(files.some((f) => f.endsWith('.mov')), 'recording missing from Desktop');
  });

  reg.define(/^the visionary sees (the screenshot still on the shelf|the screenshot gone from the shelf)$/, async (w, state) => {
    const view = await island.look(w.island.pid);
    const hasShot = view.texts.some((t) => t.includes('Screenshot'));
    if (state.includes('still on the shelf')) {
      assert.ok(hasShot, `screenshot is missing from shelf: ${view.texts.join(', ')}`);
    } else {
      assert.ok(!hasShot, `screenshot is still on shelf: ${view.texts.join(', ')}`);
    }
  });

  reg.define(/^the visionary sees its original still on the Desktop$/, async (w) => {
    const desktop = scratchDesktop(w);
    const files = fs.readdirSync(desktop);
    assert.ok(files.some((f) => f.startsWith('Screenshot')), 'screenshot missing from Desktop');
  });

  reg.define(/^the visionary sees the link to "gov\.uk\/renew-adult-passport" still there$/, async (w) => {
    const view = await island.look(w.island.pid);
    assert.ok(view.texts.includes('gov.uk/renew-adult-passport'), `link is missing from shelf: ${view.texts.join(', ')}`);
  });

  reg.define(/^the visionary sees the 3 notes, the reminder and both files on the shelf page$/, async (w) => {
    await openOnShelfPage(w);
    const view = await island.look(w.island.pid);
    assert.ok(view.texts.includes('Note 1') && view.texts.includes('Note 2') && view.texts.includes('Note 3'), 'notes missing from shelf');
    assert.ok(view.texts.includes('Reminder 1'), 'reminder missing from shelf');
    assert.ok(view.texts.includes('tax-return.pdf') && view.texts.includes('notes.txt'), 'files missing from shelf');
  });

  reg.define(/^the visionary sees "tax-return\.pdf" leave the shelf at 9:00 am the next day, 24 hours after it was parked$/, async (w) => {
    const t9amNext = '2026-10-19T09:00:00Z';
    island.feed(w, { clockDate: t9amNext });
    await openOnShelfPage(w);
    await island.waitFor(
      w.island.pid,
      (v) => !v.texts.includes('tax-return.pdf'),
      2000,
      'tax-return.pdf did not leave the shelf after 24 hours'
    );
  });
};
