'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const harness = require('../support/harness');
const { onCleanup } = require('../support/cleanup');
const island = require('../support/island');
const scenes = require('../support/scenes');
const { helpers } = require('./music-panel.steps');
const {
  scratchDesktop,
  scratchDocuments,
  detachScratchDocuments,
  scratchArchive,
  scratchBackup,
  scratchScreenshots,
  setupScreenshotLocation,
  restartIsland,
  launchDropStandIn,
  assertShelfItem,
  assert24HourBoundary,
} = require('../support/shelf');

const {
  ensureIsland,
  playing,
  rest,
  openOnMusicPage,
  openByRest,
  pointerAway,
  shelfFromBelow,
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
    await sleep(350);
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

  reg.define(/^"Screenshot 2026-10-18 at 23\.58\.00\.png" was parked on the shelf at 11:58 pm and has not been dragged out or removed$/, async (w) => {
    setupScreenshotLocation(w, scratchDesktop(w));
    const desktop = scratchDesktop(w);
    w.exactOriginal = 'Screenshot 2026-10-18 at 23.58.00.png';
    const shot = path.join(desktop, w.exactOriginal);
    execSync(`/usr/sbin/screencapture -x "${shot}"`);
    const landedAt = '2026-10-18T23:58:00Z';
    island.feed(w, {
      clearShelf: true,
      clockDate: landedAt,
      seedShelf: [{ type: 'screenshot', path: shot, landedAt }],
    });
    await ensureIsland(w);
  });

  reg.define(/^a link to "gov\.uk\/renew-adult-passport" is parked on the shelf$/, async (w) => {
    island.feed(w, {
      clearShelf: true,
      seedShelf: [{
        type: 'link',
        url: 'https://gov.uk/renew-adult-passport',
        title: 'gov.uk/renew-adult-passport',
        landedAt: new Date().toISOString(),
      }],
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

  reg.define(/^the island is closed and "tax-return\.pdf" is in the Documents folder$/, async (w) => {
    const docs = scratchDocuments(w);
    const pdf = path.join(docs, 'tax-return.pdf');
    fs.writeFileSync(pdf, '%PDF-1.4 tax return content');
    island.feed(w, { clearShelf: true, seedShelf: null });
    await ensureIsland(w);
    await pointerAway();
    await island.waitFor(w.island.pid, (v) => !v.open, 3000, 'island did not close');
  });

  reg.define(/^the visionary is dragging "tax-return\.pdf" and the island has opened to the shelf page$/, async (w) => {
    const docs = scratchDocuments(w);
    const pdf = path.join(docs, 'tax-return.pdf');
    if (!fs.existsSync(pdf)) fs.writeFileSync(pdf, '%PDF-1.4 tax return content');
    island.feed(w, { clearShelf: true, seedShelf: null });
    await ensureIsland(w);
    await pointerAway();
    await island.waitFor(w.island.pid, (v) => !v.open, 3000, 'island did not close');
    const { notch } = await harness.builtIn();
    w.activeDrag = await harness.startDragObject('file', pdf, notch.x + notch.w / 2, notch.y + 200, notch.x + notch.w / 2, notch.y + 10);
    w.defer(async () => {
      if (w.activeDrag) {
        await w.activeDrag.release();
        w.activeDrag = null;
      }
      await harness.release();
    });
    await island.waitFor(w.island.pid, (v) => v.open && v.page === 'shelf', 3000, 'island did not open to shelf page');
  });

  reg.define(/^the shelf holds only "tax-return\.pdf"$/, async (w) => {
    const docs = scratchDocuments(w);
    const pdf = path.join(docs, 'tax-return.pdf');
    fs.writeFileSync(pdf, '%PDF-1.4 tax return content');
    island.feed(w, {
      clearShelf: true,
      seedShelf: [{ type: 'file', path: pdf, landedAt: new Date().toISOString() }],
    });
    await ensureIsland(w);
  });

  reg.define(/^the shelf holds one stack of three files dropped together from Finder$/, async (w) => {
    const docs = scratchDocuments(w);
    const f1 = path.join(docs, 'file1.txt');
    const f2 = path.join(docs, 'file2.txt');
    const f3 = path.join(docs, 'file3.txt');
    fs.writeFileSync(f1, 'content 1');
    fs.writeFileSync(f2, 'content 2');
    fs.writeFileSync(f3, 'content 3');
    island.feed(w, {
      clearShelf: true,
      seedShelf: [{ type: 'files', paths: [f1, f2, f3], landedAt: new Date().toISOString() }],
    });
    await ensureIsland(w);
  });

  reg.define(/^the folder "Taxes 2026", holding 4 files, is parked on the shelf from the Documents folder$/, async (w) => {
    const docs = scratchDocuments(w);
    const folder = path.join(docs, 'Taxes 2026');
    fs.mkdirSync(folder, { recursive: true });
    for (let i = 1; i <= 4; i++) {
      fs.writeFileSync(path.join(folder, `file${i}.pdf`), `%PDF tax doc ${i}`);
    }
    island.feed(w, {
      clearShelf: true,
      seedShelf: [{ type: 'folder', path: folder, landedAt: new Date().toISOString() }],
    });
    await ensureIsland(w);
  });

  reg.define(/^"tax-return\.pdf" sits in the Documents folder$/, async (w) => {
    const docs = scratchDocuments(w);
    const pdf = path.join(docs, 'tax-return.pdf');
    fs.writeFileSync(pdf, '%PDF-1.4 tax return content');
    island.feed(w, { clearShelf: true, seedShelf: null });
    await ensureIsland(w);
  });

  reg.define(/^"Screenshot 2026-10-18 at 10\.15\.02\.png" is parked on the shelf and its original is on the Desktop$/, async (w) => {
    setupScreenshotLocation(w, scratchDesktop(w));
    const desktop = scratchDesktop(w);
    w.exactOriginal = 'Screenshot 2026-10-18 at 10.15.02.png';
    const shot = path.join(desktop, w.exactOriginal);
    execSync(`/usr/sbin/screencapture -x "${shot}"`);
    island.feed(w, {
      clearShelf: true,
      seedShelf: [{ type: 'screenshot', path: shot, landedAt: new Date().toISOString() }],
    });
    await ensureIsland(w);
  });

  reg.define(/^(the 2 GB screen recording "bug-repro\.mov"|the screenshot "Screenshot 2026-10-18 at 10\.15\.02\.png") is parked on the shelf and its original is on the Desktop$/, async (w, item) => {
    setupScreenshotLocation(w, scratchDesktop(w));
    const desktop = scratchDesktop(w);
    w.exactOriginal = item.includes('bug-repro.mov') ? 'bug-repro.mov' : 'Screenshot 2026-10-18 at 10.15.02.png';
    if (item.includes('bug-repro.mov')) {
      const mov = path.join(desktop, w.exactOriginal);
      execSync(`/bin/dd if=/dev/zero of="${mov}" bs=1 count=0 seek=2147483648 2>/dev/null`);
      island.feed(w, {
        clearShelf: true,
        seedShelf: [{ type: 'screenRecording', path: mov, landedAt: new Date().toISOString() }],
      });
    } else {
      const shot = path.join(desktop, w.exactOriginal);
      execSync(`/usr/sbin/screencapture -x "${shot}"`);
      island.feed(w, {
        clearShelf: true,
        seedShelf: [{ type: 'screenshot', path: shot, landedAt: new Date().toISOString() }],
      });
    }
    await ensureIsland(w);
  });

  reg.define(/^(the file "tax-return\.pdf"|"tax-return\.pdf"|"Screenshot 2026-10-18 at 10\.15\.02\.png"|the folder "Taxes 2026") is parked on the shelf from (the Documents folder|the Desktop)$/, async (w, item, home) => {
    if (item.includes('tax-return.pdf')) {
      const docs = scratchDocuments(w);
      const pdf = path.join(docs, 'tax-return.pdf');
      fs.writeFileSync(pdf, '%PDF-1.4 tax return content');
      island.feed(w, {
        clearShelf: true,
        seedShelf: [{ type: 'file', path: pdf, landedAt: new Date().toISOString() }],
      });
    } else if (item.includes('Screenshot')) {
      setupScreenshotLocation(w, scratchDesktop(w));
      const desktop = scratchDesktop(w);
      const shot = path.join(desktop, 'Screenshot 2026-10-18 at 10.15.02.png');
      execSync(`/usr/sbin/screencapture -x "${shot}"`);
      island.feed(w, {
        clearShelf: true,
        seedShelf: [{ type: 'screenshot', path: shot, landedAt: new Date().toISOString() }],
      });
    } else if (item.includes('Taxes 2026')) {
      const docs = scratchDocuments(w);
      const folder = path.join(docs, 'Taxes 2026');
      fs.mkdirSync(folder, { recursive: true });
      for (let i = 1; i <= 4; i++) {
        fs.writeFileSync(path.join(folder, `file${i}.pdf`), `%PDF tax doc ${i}`);
      }
      island.feed(w, {
        clearShelf: true,
        seedShelf: [{ type: 'folder', path: folder, landedAt: new Date().toISOString() }],
      });
    }
    await ensureIsland(w);
  });

  reg.define(/^the island is open on the shelf page holding "tax-return\.pdf", with no remove area showing$/, async (w) => {
    const docs = scratchDocuments(w);
    const pdf = path.join(docs, 'tax-return.pdf');
    fs.writeFileSync(pdf, '%PDF-1.4 tax return content');
    island.feed(w, {
      clearShelf: true,
      seedShelf: [{ type: 'file', path: pdf, landedAt: new Date().toISOString() }],
    });
    await ensureIsland(w);
    await openOnShelfPage(w);
    const view = await island.look(w.island.pid);
    const rem = view.elements.find((e) => e.identifier === 'remove-area');
    assert.ok(!rem, 'remove area is showing when no drag is under way');
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

  reg.define(/^the visionary takes a screenshot copied only to the clipboard$/, async (w) => {
    const beforeSave = await harness.pasteboardSave();
    let restored = false;
    const restore = async () => {
      if (restored) return;
      restored = true;
      try { await harness.pasteboardRestore(beforeSave); } catch {}
    };
    const restoreSync = () => {
      if (restored) return;
      restored = true;
      try { harness.pasteboardRestoreSync(beforeSave); } catch {}
    };
    w.defer(restore);
    onCleanup(restoreSync);

    execSync('/usr/sbin/screencapture -c');
    await sleep(100);

    w.defer(async () => {
      await restore();
      const current = await harness.pasteboardSave();
      // The order of types is the pasteboard's own, not part of the content.
      assert.deepEqual(
        [...current.types].sort(),
        [...beforeSave.types].sort(),
        `general pasteboard types were not restored after screencapture -c (was ${beforeSave.types.join(', ')}, now ${current.types.join(', ')})`
      );
    });
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
    const view = await island.waitFor(
      w.island.pid,
      (v) => v.buttons.some((b) => b.label && b.label.includes('tax-return.pdf')),
      2000,
      'could not find Remove button for tax-return.pdf'
    );
    const btn = view.buttons.find((b) => b.label && b.label.includes('tax-return.pdf'));
    assert.ok(btn, 'could not find Remove button for tax-return.pdf');
    const c = center(btn.frame);
    await harness.glide(c.x, c.y, 4, 8);
    await sleep(100);
    await harness.click(c.x, c.y);
    await sleep(250);
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
    await shelfFromBelow(w);
  });

  reg.define(/^the visionary sees the shelf page at the same size as the music page$/, async (w) => {
    const musicFrame = w.beforeScroll?.musicFrame;
    const view = await island.waitFor(
      w.island.pid,
      (v) => {
        const mf = musicFrame || v.musicFrame;
        return v.shelfFrame && mf &&
          Math.abs(v.shelfFrame.w - mf.w) <= 1 &&
          Math.abs(v.shelfFrame.h - mf.h) <= 1;
      },
      2500,
      'shelf page not matching music page size'
    );
    const mf = musicFrame || view.musicFrame;
    assert.ok(view.shelfFrame && mf, 'frames not found');
    assert.ok(
      Math.abs(view.shelfFrame.w - mf.w) <= 1,
      `shelf page width (${view.shelfFrame?.w}) does not match music page (${mf?.w})`
    );
    assert.ok(
      Math.abs(view.shelfFrame.h - mf.h) <= 1,
      `shelf page height (${view.shelfFrame?.h}) does not match music page (${mf?.h})`
    );
  });

  reg.define(/^the visionary sees the small bar at the side mark the shelf page as showing$/, async (w) => {
    const view = await island.look(w.island.pid);
    const bar = view.elements.find((e) => e.identifier === 'page-bar');
    assert.ok(bar && bar.description && bar.description.includes('Shelf page showing'),
      `small bar does not mark shelf page showing: ${bar?.description}`);
  });

  reg.define(/^the visionary sees the music page come back over "Wonderwall"$/, async (w) => {
    const before = w.beforeScroll;
    assert.ok(before && before.musicFrame && before.shelfFrame, 'beforeScroll missing frames');
    const view = await island.waitFor(
      w.island.pid,
      (v) => v.open && v.page === 'music' && v.texts.includes('Wonderwall'),
      3000,
      'music page did not come back over Wonderwall'
    );
    assert.ok(view.musicFrame.y > before.musicFrame.y, 'the music page did not move down into place');
    assert.ok(view.shelfFrame.y > before.shelfFrame.y, 'the shelf page did not move down and out');
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
    // Hold the watch for longer than a real screenshot takes to land (the
    // landing Then allows 2.5 s), so a slow landing would be seen here.
    for (let i = 0; i < 6; i++) {
      const view = await island.look(w.island.pid);
      const items = view.elements.filter((e) => e.identifier === 'shelf-item');
      assert.equal(items.length, 0, `the shelf is not empty, found ${items.length} items: ${view.texts.join(', ')}`);
      await sleep(500);
    }
    // Control: a real saved screenshot, made as in "A new screenshot lands on
    // the shelf by itself" into the same watched folder, does land. So the
    // watcher was live, and the emptiness above was its refusal.
    const control = 'Screenshot 2026-10-18 at 10.15.30.png';
    execSync(`/usr/sbin/screencapture -x "${path.join(scratchDesktop(w), control)}"`);
    await island.waitFor(
      w.island.pid,
      (v) => v.page === 'shelf' && v.texts.includes(control),
      2500,
      `the watcher never landed a real saved screenshot (${control}): it was not live, so the empty shelf proves nothing`
    );
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
    await openOnShelfPage(w);
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

  reg.define(/^the visionary sees the stack gone from the shelf page$/, async (w) => {
    await openOnShelfPage(w);
    const view = await island.waitFor(
      w.island.pid,
      (v) => v.elements.filter((e) => e.identifier === 'shelf-item').length === 0,
      3000,
      'stack still on shelf'
    );
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
    await openOnShelfPage(w);
    const view = await island.look(w.island.pid);
    const hasShot = view.texts.some((t) => t.includes('Screenshot'));
    if (state.includes('still on the shelf')) {
      assert.ok(hasShot, `screenshot is missing from shelf: ${view.texts.join(', ')}`);
    } else {
      assert.ok(!hasShot, `screenshot is still on shelf: ${view.texts.join(', ')}`);
    }
  });

  reg.define(/^the visionary sees its original still on the Desktop$/, async (w) => {
    assert.ok(w.exactOriginal, 'scenario did not record exact original filename');
    const desktop = scratchDesktop(w);
    assert.ok(fs.existsSync(path.join(desktop, w.exactOriginal)), `exact original "${w.exactOriginal}" missing from Desktop`);
  });

  reg.define(/^the visionary sees the link to "gov\.uk\/renew-adult-passport" still there$/, async (w) => {
    const view = await island.look(w.island.pid);
    assert.ok(view.texts.includes('gov.uk/renew-adult-passport'), `link is missing from shelf: ${view.texts.join(', ')}`);
  });

  reg.define(/^the visionary sees the 3 notes, the reminder and both files on the shelf page$/, async (w) => {
    await openOnShelfPage(w);
    let view = await island.look(w.island.pid);
    const seenTexts = new Set(view.texts);

    const hasAll = () =>
      seenTexts.has('✎ Note 1') &&
      seenTexts.has('✎ Note 2') &&
      seenTexts.has('✎ Note 3') &&
      seenTexts.has('Reminder 1') &&
      seenTexts.has('tax-return.pdf') &&
      seenTexts.has('notes.txt');

    if (!hasAll()) {
      // Bring overflowing items into view with horizontal scroll (M9)
      await harness.scroll(0, 'trackpad', -250);
      await sleep(150);
      view = await island.look(w.island.pid);
      view.texts.forEach((t) => seenTexts.add(t));
    }

    assert.ok(
      seenTexts.has('✎ Note 1') && seenTexts.has('✎ Note 2') && seenTexts.has('✎ Note 3'),
      `notes missing from shelf: ${[...seenTexts].join(', ')}`
    );
    assert.ok(seenTexts.has('Reminder 1'), `reminder missing from shelf: ${[...seenTexts].join(', ')}`);
    assert.ok(
      seenTexts.has('tax-return.pdf') && seenTexts.has('notes.txt'),
      `files missing from shelf: ${[...seenTexts].join(', ')}`
    );
  });

  reg.define(/^the visionary sees "tax-return\.pdf" leave the shelf at 9:00 am the next day, 24 hours after it was parked$/, async (w) => {
    await assert24HourBoundary(w, 'tax-return.pdf', openOnShelfPage);
  });

  // U4 Whens and Thens

  reg.define(/^the visionary drags "tax-return\.pdf" from Finder onto the notch, still holding it$/, async (w) => {
    const docs = scratchDocuments(w);
    const pdf = path.join(docs, 'tax-return.pdf');
    const { notch } = await harness.builtIn();
    w.activeDrag = await harness.startDragObject('file', pdf, notch.x + notch.w / 2, notch.y + 200, notch.x + notch.w / 2, notch.y + 10);
    w.defer(async () => {
      if (w.activeDrag) {
        await w.activeDrag.release();
        w.activeDrag = null;
      }
      await harness.release();
    });
    await sleep(200);
  });

  reg.define(/^the visionary sees the island open straight to the shelf page, ready for the drop$/, async (w) => {
    await island.waitFor(w.island.pid, (v) => v.open && v.page === 'shelf', 3000, 'island did not open straight to shelf page');
  });

  reg.define(/^the visionary lets go over the shelf page$/, async (w) => {
    if (w.activeDrag) {
      await w.activeDrag.release();
      w.activeDrag = null;
    } else {
      await harness.release();
    }
    await sleep(300);
  });

  reg.define(/^the visionary sees "tax-return\.pdf" parked on the shelf$/, async (w) => {
    await island.waitFor(
      w.island.pid,
      (v) => v.open && v.page === 'shelf' && v.texts.includes('tax-return.pdf'),
      3000,
      'tax-return.pdf not parked on shelf'
    );
  });

  reg.define(/^the visionary drags (the file "tax-return\.pdf" from Finder|the file "boarding-pass\.pdf" from the Desktop|three files selected together in Finder|the folder "Taxes 2026"|a link from Chrome's address bar to "gov\.uk\/renew-adult-passport") onto the notch and lets go$/, async (w, dropped) => {
    const { notch } = await harness.builtIn();
    const nx = notch.x + notch.w / 2;
    const ny = notch.y + 10;
    if (dropped.includes('the file "tax-return.pdf"')) {
      const docs = scratchDocuments(w);
      const pdf = path.join(docs, 'tax-return.pdf');
      if (!fs.existsSync(pdf)) fs.writeFileSync(pdf, '%PDF-1.4 tax return content');
      await harness.dragObject('file', pdf, nx, ny + 200, nx, ny, false);
    } else if (dropped.includes('the file "boarding-pass.pdf"')) {
      const desktop = scratchDesktop(w);
      const pdf = path.join(desktop, 'boarding-pass.pdf');
      if (!fs.existsSync(pdf)) fs.writeFileSync(pdf, '%PDF-1.4 boarding pass content');
      await harness.dragObject('file', pdf, nx, ny + 200, nx, ny, false);
    } else if (dropped.includes('three files selected together')) {
      const docs = scratchDocuments(w);
      const f1 = path.join(docs, 'file1.txt');
      const f2 = path.join(docs, 'file2.txt');
      const f3 = path.join(docs, 'file3.txt');
      fs.writeFileSync(f1, 'file 1 content');
      fs.writeFileSync(f2, 'file 2 content');
      fs.writeFileSync(f3, 'file 3 content');
      await harness.dragObject('files', `${f1},${f2},${f3}`, nx, ny + 200, nx, ny, false);
    } else if (dropped.includes('the folder "Taxes 2026"')) {
      const docs = scratchDocuments(w);
      const folder = path.join(docs, 'Taxes 2026');
      fs.mkdirSync(folder, { recursive: true });
      fs.writeFileSync(path.join(folder, 'receipt.txt'), 'receipt data');
      await harness.dragObject('folder', folder, nx, ny + 200, nx, ny, false);
    } else if (dropped.includes('a link from Chrome')) {
      await harness.dragObject('link', 'https://gov.uk/renew-adult-passport', nx, ny + 200, nx, ny, false);
    }
    await sleep(300);
  });

  reg.define(/^the visionary sees ("tax-return\.pdf" as one item|"boarding-pass\.pdf" as one item|one stack holding the three files|the folder "Taxes 2026" as one item|a link to "gov\.uk\/renew-adult-passport") on the shelf page$/, async (w, parked) => {
    await openOnShelfPage(w);
    if (parked.includes('tax-return.pdf')) {
      await assertShelfItem(w, 'tax-return.pdf', 1);
    } else if (parked.includes('boarding-pass.pdf')) {
      await assertShelfItem(w, 'boarding-pass.pdf', 1);
    } else if (parked.includes('one stack holding the three files')) {
      await assertShelfItem(w, '3 files', 1);
    } else if (parked.includes('Taxes 2026')) {
      await assertShelfItem(w, 'Taxes 2026', 1);
    } else if (parked.includes('gov.uk/renew-adult-passport')) {
      await assertShelfItem(w, 'gov.uk/renew-adult-passport', 1);
    }
  });

  reg.define(/^the visionary drags the highlighted text "([^"]+)" from Chrome onto the notch and lets go$/, async (w, text) => {
    const { notch } = await harness.builtIn();
    await harness.dragObject('text', text, notch.x + notch.w / 2, notch.y + 200, notch.x + notch.w / 2, notch.y + 10, false);
    await sleep(300);
  });

  reg.define(/^the visionary sees the shelf still holding only "tax-return\.pdf", with no note made from the text$/, async (w) => {
    await openOnShelfPage(w);
    const view = await island.look(w.island.pid);
    const items = view.elements.filter((e) => e.identifier === 'shelf-item');
    assert.equal(items.length, 1, `expected 1 item on shelf, found ${items.length}: ${view.texts.join(', ')}`);
    assert.ok(view.texts.includes('tax-return.pdf'), 'tax-return.pdf missing from shelf');
    assert.ok(!view.texts.some((t) => t.includes('renew passport')), 'dropped text created a note');
    // Control: a file dragged onto the notch the same way right after does
    // land, so drops reach the island here and the text was refused by it.
    const docs = scratchDocuments(w);
    const control = path.join(docs, 'boarding-pass.pdf');
    fs.writeFileSync(control, '%PDF-1.4 boarding pass content');
    // Closed again first, as for the text: a drag that starts inside the open
    // panel would begin on the island itself, not on the file.
    await pointerAway();
    await island.waitFor(w.island.pid, (v) => !v.open, 3000, 'island did not close before the control drop');
    const { notch } = await harness.builtIn();
    const nx = notch.x + notch.w / 2;
    await harness.dragObject('file', control, nx, notch.y + 200, nx, notch.y + 10, false);
    const after = await island.waitFor(
      w.island.pid,
      (v) => v.page === 'shelf' && v.texts.includes('boarding-pass.pdf'),
      3000,
      'a file dropped on the notch right after the text did not land: drops do not reach the island, so the refusal proves nothing'
    );
    assert.equal(after.elements.filter((e) => e.identifier === 'shelf-item').length, 2, `expected tax-return.pdf and the control file only: ${after.texts.join(', ')}`);
    assert.ok(!after.texts.some((t) => t.includes('renew passport')), 'dropped text created a note');
  });

  reg.define(/^the visionary drags the stack into a Gmail draft in Chrome$/, async (w) => {
    w.standIn = await launchDropStandIn(w, { title: 'Gmail' });
    await openOnShelfPage(w);
    const view = await island.waitFor(
      w.island.pid,
      (v) => v.elements.some((e) => e.identifier === 'shelf-item'),
      2000,
      'no shelf item found'
    );
    const stackEl = view.elements.find((e) => e.identifier === 'shelf-item');
    const from = center(stackEl.frame);
    const to = { x: w.standIn.window.x + w.standIn.window.w / 2, y: w.standIn.window.y + w.standIn.window.h / 2 };
    await harness.drag(from.x, from.y, to.x, to.y, 20, 15, false);
    await sleep(300);
  });

  reg.define(/^the visionary sees all 3 screenshots and the recording attached to the draft$/, async (w) => {
    const log = await island.until(() => w.standIn.readLog(), 3000, 'stand-in did not receive drop');
    assert.ok(log && log.received, 'no received items in log');
    const names = log.received.map((r) => r.name);
    assert.equal(names.filter((n) => n.includes('Screenshot')).length, 3, 'screenshots missing in draft');
    assert.equal(names.filter((n) => n.endsWith('.mov')).length, 1, 'recording missing in draft');
  });

  reg.define(/^the visionary sees all three files attached to the draft$/, async (w) => {
    const log = await island.until(() => w.standIn.readLog(), 3000, 'stand-in did not receive files');
    assert.ok(log && log.received, 'no files received');
    assert.equal(log.received.length, 3, `expected 3 files attached, got ${log.received.length}`);
  });

  reg.define(/^the visionary drags it from the shelf into a Finder window of the drive "Backup"$/, async (w) => {
    const backupDir = scratchBackup(w);
    w.standIn = await launchDropStandIn(w, { title: 'Backup', copyTo: backupDir });
    await openOnShelfPage(w);
    const view = await island.waitFor(
      w.island.pid,
      (v) => v.elements.some((e) => e.identifier === 'shelf-item'),
      2000,
      'no folder item on shelf'
    );
    const itemEl = view.elements.find((e) => e.identifier === 'shelf-item');
    const from = center(itemEl.frame);
    const to = { x: w.standIn.window.x + w.standIn.window.w / 2, y: w.standIn.window.y + w.standIn.window.h / 2 };
    await harness.drag(from.x, from.y, to.x, to.y, 20, 15, false);
    await sleep(300);
  });

  reg.define(/^the visionary sees the folder "Taxes 2026" on "Backup" with all 4 files inside it$/, async (w) => {
    const backupDir = scratchBackup(w);
    const targetFolder = path.join(backupDir, 'Taxes 2026');
    await island.until(() => fs.existsSync(targetFolder), 3000, 'folder Taxes 2026 not copied to Backup');
    const files = fs.readdirSync(targetFolder);
    assert.equal(files.length, 4, `expected 4 files in Taxes 2026, found ${files.length}`);
  });

  reg.define(/^the visionary moves (the file "tax-return\.pdf"|the folder "Taxes 2026") to the folder "Archive" in Finder$/, async (w, item) => {
    const docs = scratchDocuments(w);
    const archive = scratchArchive(w);
    const name = item.includes('folder') ? 'Taxes 2026' : 'tax-return.pdf';
    fs.renameSync(path.join(docs, name), path.join(archive, name));
    await sleep(200);
  });

  reg.define(/^the visionary then drags it from the shelf onto the Desktop$/, async (w) => {
    const desktop = scratchDesktop(w);
    w.standIn = await launchDropStandIn(w, { title: 'Desktop', moveTo: desktop });
    await openOnShelfPage(w);
    const view = await island.waitFor(
      w.island.pid,
      (v) => v.elements.some((e) => e.identifier === 'shelf-item'),
      2000,
      'no item on shelf'
    );
    const itemEl = view.elements.find((e) => e.identifier === 'shelf-item');
    const from = center(itemEl.frame);
    const to = { x: w.standIn.window.x + w.standIn.window.w / 2, y: w.standIn.window.y + w.standIn.window.h / 2 };
    await harness.drag(from.x, from.y, to.x, to.y, 20, 15, false);
    await sleep(300);
  });

  reg.define(/^the visionary sees (the file "tax-return\.pdf"|the folder "Taxes 2026") on the Desktop and no longer in "Archive"$/, async (w, item) => {
    const desktop = scratchDesktop(w);
    const archive = scratchArchive(w);
    const name = item.includes('folder') ? 'Taxes 2026' : 'tax-return.pdf';
    await island.until(() => fs.existsSync(path.join(desktop, name)), 3000, `${name} missing from Desktop`);
    assert.ok(!fs.existsSync(path.join(archive, name)), `${name} still in Archive`);
  });

// Every name a scenario here parks and then trashes: the guard counts them all
// in the visionary's real Trash, before and after.
const TRASHED_NAME_PREFIXES = ['tax-return', 'Taxes 2026', 'Screenshot 2026-10-18', 'trash-control'];

function countFinderTrash() {
  let total = 0;
  for (const prefix of TRASHED_NAME_PREFIXES) {
    const out = execSync(`osascript -e 'tell application "Finder" to count (every item of trash whose name begins with "${prefix}")'`, {
      encoding: 'utf8',
      timeout: 5000,
    }).trim();
    const n = parseInt(out, 10);
    if (Number.isNaN(n)) {
      throw new Error(`countFinderTrash returned non-number for "${prefix}": ${out}`);
    }
    total += n;
  }
  return total;
}

// The scratch volume's own Trash, where macOS puts what is trashed on it;
// Finder's Trash leaves out a volume mounted out of sight.
/**
 * Mid-drag, before letting go: the remove area shows only while a shelf item
 * is being dragged (D66), so the drag really left the shelf and what follows
 * the release speaks for a delivered drop.
 */
async function assertShelfDragInFlight(w) {
  await island.waitFor(w.island.pid, (v) => v.elements.some((e) => e.identifier === 'remove-area'), 2000,
    'mid-drag, no remove area showed: the drag never left the shelf, so what follows proves nothing');
}

function volumeTrashDir(w) {
  return path.join(path.dirname(scratchDocuments(w)), '.Trashes', String(process.getuid()));
}

function volumeTrashNames(w) {
  const dir = volumeTrashDir(w);
  return fs.existsSync(dir) ? fs.readdirSync(dir) : [];
}

  reg.define(/^the visionary moves "tax-return\.pdf" to the Trash in Finder$/, async (w) => {
    const beforeCount = countFinderTrash();
    const docs = scratchDocuments(w);
    const pdf = path.join(docs, 'tax-return.pdf');
    // Control for the later absence: the shelf page shows the file now, so
    // its going is the island's doing and not a page that never held it.
    await openOnShelfPage(w);
    await island.waitFor(
      w.island.pid,
      (v) => v.page === 'shelf' && v.texts.includes('tax-return.pdf'),
      3000,
      'the shelf page never showed tax-return.pdf before it was trashed'
    );
    execSync(`osascript -e 'tell application "Finder" to delete POSIX file "${pdf}"'`);
    w.defer(() => {
      detachScratchDocuments(w);
      const afterCount = countFinderTrash();
      assert.equal(
        afterCount,
        beforeCount,
        `Finder's Trash count changed from ${beforeCount} to ${afterCount}: a test deleted into the visionary's real Trash`
      );
    });
    await sleep(300);
  });

  // D143: a folder, screenshot or stack parked from the scratch volume, so
  // what the Trash takes lands in that volume's Trash and not the visionary's.
  reg.define(/^(the folder "Taxes 2026", holding 4 files|the screenshot "Screenshot 2026-10-18 at 10\.15\.02\.png"|a stack reading "3 screenshots") is parked on the shelf, held in the Documents folder$/, async (w, item) => {
    const docs = scratchDocuments(w);
    let seed;
    if (item.startsWith('the folder')) {
      const folder = path.join(docs, 'Taxes 2026');
      fs.mkdirSync(folder, { recursive: true });
      for (let i = 1; i <= 4; i++) fs.writeFileSync(path.join(folder, `file${i}.pdf`), `%PDF tax doc ${i}`);
      seed = [{ type: 'folder', path: folder, landedAt: new Date().toISOString() }];
    } else if (item.startsWith('the screenshot')) {
      const shot = path.join(docs, 'Screenshot 2026-10-18 at 10.15.02.png');
      execSync(`/usr/sbin/screencapture -x "${shot}"`);
      seed = [{ type: 'screenshot', path: shot, landedAt: new Date().toISOString() }];
    } else {
      const now = Date.now();
      seed = [1, 2, 3].map((i) => {
        const shot = path.join(docs, `Screenshot 2026-10-18 at 10.15.0${i}.png`);
        execSync(`/usr/sbin/screencapture -x "${shot}"`);
        return { type: 'screenshot', path: shot, landedAt: new Date(now - (3 - i) * 2000).toISOString() };
      });
    }
    island.feed(w, { clearShelf: true, clockDate: null, seedShelf: seed });
    await ensureIsland(w);
  });

  reg.define(/^a note reading "([^"]+)" is parked on the shelf$/, async (w, text) => {
    island.feed(w, {
      clearShelf: true,
      clockDate: null,
      seedShelf: [{ type: 'note', text, isReminder: false, landedAt: new Date().toISOString() }],
    });
    await ensureIsland(w);
  });

  // D142: the real Dock's Trash, found through Accessibility. The file sits on
  // the scratch volume, so it lands in that volume's Trash, which goes when
  // the volume is detached: the visionary's own Trash is left as it was.
  reg.define(/^the visionary drags it out of the shelf and drops it on the Trash in the Dock$/, async (w) => {
    // The scratch volume is there before the drop (a link or note has no file
    // on it), so what its Trash holds afterwards speaks for the drop.
    scratchDocuments(w);
    w.trashBefore = countFinderTrash();
    w.defer(() => {
      detachScratchDocuments(w);
      const after = countFinderTrash();
      assert.equal(
        after,
        w.trashBefore,
        `Finder's Trash count changed from ${w.trashBefore} to ${after}: a test deleted into the visionary's real Trash`
      );
    });
    const dock = Number(execSync('/usr/bin/pgrep -x Dock', { encoding: 'utf8' }).trim().split('\n')[0]);
    const trash = (await harness.h('tree', dock)).elements.find((e) => e.subrole === 'AXTrashDockItem');
    assert.ok(trash && trash.frame, 'no Trash in the Dock');
    await openOnShelfPage(w);
    const view = await island.waitFor(
      w.island.pid,
      (v) => v.elements.some((e) => e.identifier === 'shelf-item'),
      2000,
      'no item on shelf'
    );
    const from = center(view.elements.find((e) => e.identifier === 'shelf-item').frame);
    const to = center(trash.frame);
    // Rest on the Trash before letting go, as a hand does: the Dock takes
    // the drop only once the drag has settled on it.
    w.defer(() => harness.releaseIfHeld());
    await harness.drag(from.x, from.y, to.x, to.y, 40, 20, true);
    await sleep(800);
    await assertShelfDragInFlight(w);
    await harness.release();
    // The island closes after its grace once the drag ends away from it.
    await island.waitFor(w.island.pid, (v) => !v.open, 3000, 'the island did not close after the drop');
  });

  reg.define(/^the visionary sees "tax-return\.pdf" in the Trash, no longer in Documents$/, async (w) => {
    const docs = scratchDocuments(w);
    // The volume's own Trash, where macOS puts a file trashed on it; Finder's
    // Trash leaves out a volume mounted out of sight, as the scratch one is.
    const trash = volumeTrashDir(w);
    const inTrash = () => volumeTrashNames(w).some((n) => n.startsWith('tax-return'));
    await island.until(inTrash, 3000, `tax-return.pdf is not in the volume's Trash (${trash})`);
    assert.ok(!fs.existsSync(path.join(docs, 'tax-return.pdf')), 'tax-return.pdf still in Documents');
  });

  reg.define(/^the visionary sees (the folder "Taxes 2026" with all 4 files inside it|the screenshot "Screenshot 2026-10-18 at 10\.15\.02\.png"|all 3 screenshots of the stack) in the Trash, no longer in Documents$/, async (w, item) => {
    const docs = scratchDocuments(w);
    const trash = volumeTrashDir(w);
    if (item.startsWith('the folder')) {
      const inTrash = () => volumeTrashNames(w).includes('Taxes 2026');
      await island.until(inTrash, 3000, `the folder is not in the volume's Trash (${trash})`);
      const inside = fs.readdirSync(path.join(trash, 'Taxes 2026')).sort();
      assert.deepEqual(inside, [1, 2, 3, 4].map((i) => `file${i}.pdf`), 'the folder did not move to the Trash with all 4 files inside it');
      assert.ok(!fs.existsSync(path.join(docs, 'Taxes 2026')), 'Taxes 2026 still in Documents');
    } else {
      const names = item.startsWith('the screenshot')
        ? ['Screenshot 2026-10-18 at 10.15.02.png']
        : [1, 2, 3].map((i) => `Screenshot 2026-10-18 at 10.15.0${i}.png`);
      await island.until(
        () => names.every((n) => volumeTrashNames(w).some((t) => t.startsWith(n.replace(/\.png$/, '')))),
        3000,
        `${names.join(', ')} not all in the volume's Trash (${trash}): ${volumeTrashNames(w).join(', ')}`
      );
      for (const n of names) assert.ok(!fs.existsSync(path.join(docs, n)), `${n} still in Documents`);
    }
  });

  reg.define(/^the visionary sees nothing moved to the Trash$/, async (w) => {
    const trash = volumeTrashDir(w);
    assert.deepEqual(volumeTrashNames(w), [], `the volume's Trash is not empty: ${volumeTrashNames(w).join(', ')}`);
    assert.equal(countFinderTrash(), w.trashBefore, "the visionary's Trash changed");
    // Control: Finder trashing a file on this same volume does show up where
    // the checks above look, so an empty Trash there means nothing was moved.
    const decoy = path.join(scratchDocuments(w), 'trash-control.txt');
    fs.writeFileSync(decoy, 'control');
    execSync(`osascript -e 'tell application "Finder" to delete POSIX file "${decoy}"'`);
    await island.until(
      () => volumeTrashNames(w).some((n) => n.startsWith('trash-control')),
      3000,
      `a file Finder trashed on the scratch volume never showed in ${trash}: the empty Trash proved nothing`
    );
  });

  reg.define(/^the visionary sees the note "([^"]+)" still on the shelf page, its text unchanged$/, async (w, text) => {
    await openOnShelfPage(w);
    const view = await island.waitFor(
      w.island.pid,
      // A note's title is shown with a ✎ in front (display only).
      (v) => v.elements.some((e) => e.identifier === 'shelf-item-title' && (e.value === text || e.value === `✎ ${text}`)),
      3000,
      `the note "${text}" is not on the shelf page`
    );
    assert.equal(view.elements.filter((e) => e.identifier === 'shelf-item').length, 1, `expected the one note: ${view.texts.join(', ')}`);
    assert.ok(!view.elements.some((e) => e.identifier === 'edit-note-field'), 'the note was opened for editing');
  });

  reg.define(/^the visionary drags it out of the shelf onto the Desktop and Finder moves it there$/, async (w) => {
    const desktop = scratchDesktop(w);
    w.standIn = await launchDropStandIn(w, { title: 'Desktop', moveTo: desktop });
    await openOnShelfPage(w);
    const view = await island.waitFor(
      w.island.pid,
      (v) => v.elements.some((e) => e.identifier === 'shelf-item'),
      2000,
      'no item on shelf'
    );
    const itemEl = view.elements.find((e) => e.identifier === 'shelf-item');
    const from = center(itemEl.frame);
    const to = { x: w.standIn.window.x + w.standIn.window.w / 2, y: w.standIn.window.y + w.standIn.window.h / 2 };
    await harness.drag(from.x, from.y, to.x, to.y, 20, 15, false);
    await sleep(300);
  });

  reg.define(/^the visionary sees "tax-return\.pdf" on the Desktop, no longer in Documents$/, async (w) => {
    const desktop = scratchDesktop(w);
    const docs = scratchDocuments(w);
    await island.until(() => fs.existsSync(path.join(desktop, 'tax-return.pdf')), 3000, 'tax-return.pdf not moved to Desktop');
    assert.ok(!fs.existsSync(path.join(docs, 'tax-return.pdf')), 'tax-return.pdf still in Documents');
  });

  reg.define(/^the visionary parks it on the shelf by dragging it onto the notch$/, async (w) => {
    const docs = scratchDocuments(w);
    const pdf = path.join(docs, 'tax-return.pdf');
    const { notch } = await harness.builtIn();
    await harness.dragObject('file', pdf, notch.x + notch.w / 2, notch.y + 200, notch.x + notch.w / 2, notch.y + 10, false);
    await sleep(300);
  });

  reg.define(/^the visionary sees "tax-return\.pdf" still in the Documents folder in Finder$/, async (w) => {
    const docs = scratchDocuments(w);
    assert.ok(fs.existsSync(path.join(docs, 'tax-return.pdf')), 'tax-return.pdf missing from Documents');
  });

  reg.define(/^the visionary sees "tax-return\.pdf" on the shelf page$/, async (w) => {
    await openOnShelfPage(w);
    await island.waitFor(
      w.island.pid,
      (v) => v.page === 'shelf' && v.texts.includes('tax-return.pdf'),
      3000,
      'tax-return.pdf not on shelf page'
    );
  });

  reg.define(/^the visionary drags it from the shelf into a Gmail draft in Chrome$/, async (w) => {
    w.standIn = await launchDropStandIn(w, { title: 'Gmail' });
    await openOnShelfPage(w);
    const view = await island.waitFor(
      w.island.pid,
      (v) => v.elements.some((e) => e.identifier === 'shelf-item'),
      2000,
      'no item on shelf'
    );
    const itemEl = view.elements.find((e) => e.identifier === 'shelf-item');
    const from = center(itemEl.frame);
    const to = { x: w.standIn.window.x + w.standIn.window.w / 2, y: w.standIn.window.y + w.standIn.window.h / 2 };
    await harness.drag(from.x, from.y, to.x, to.y, 20, 15, false);
    await sleep(300);
  });

  reg.define(/^the visionary sees the "tax-return\.pdf" from Documents attached to the draft$/, async (w) => {
    const log = await island.until(() => w.standIn.readLog(), 3000, 'stand-in did not receive draft attachment');
    assert.ok(log && log.received && log.received.length > 0, 'no attachment in draft');
    const item = log.received.find((r) => r.name === 'tax-return.pdf');
    assert.ok(item, 'tax-return.pdf was not attached to draft');
    assert.ok(item.path.includes(scratchDocuments(w)), `attachment did not come from Documents: ${item.path}`);
  });

  reg.define(/^the visionary opens the island, scrolls down to the shelf and drags the screenshot into (a Messages chat|a Gmail draft in Chrome)$/, async (w, target) => {
    const title = target.includes('Messages') ? 'Messages' : 'Gmail';
    w.standIn = await launchDropStandIn(w, { title });
    await openOnShelfPage(w);
    const view = await island.waitFor(
      w.island.pid,
      (v) => v.elements.some((e) => e.identifier === 'shelf-item'),
      2000,
      'no screenshot on shelf'
    );
    const itemEl = view.elements.find((e) => e.identifier === 'shelf-item');
    const from = center(itemEl.frame);
    const to = { x: w.standIn.window.x + w.standIn.window.w / 2, y: w.standIn.window.y + w.standIn.window.h / 2 };
    await harness.drag(from.x, from.y, to.x, to.y, 20, 15, false);
    await sleep(300);
  });

  reg.define(/^the visionary sees the screenshot attached in (a Messages chat|a Gmail draft in Chrome), as if dragged from the Desktop$/, async (w, target) => {
    const log = await island.until(() => w.standIn.readLog(), 3000, `screenshot not received in ${target}`);
    assert.ok(log && log.received && log.received.length > 0, 'no screenshot received');
    const shot = log.received.find((r) => r.name.includes('Screenshot'));
    assert.ok(shot, 'screenshot missing from target received list');
    assert.ok(shot.path.includes(scratchDesktop(w)), `screenshot did not come from Desktop: ${shot.path}`);
  });

  reg.define(/^the visionary drags it out of the shelf into a Messages chat that accepts it$/, async (w) => {
    w.standIn = await launchDropStandIn(w, { title: 'Messages' });
    await openOnShelfPage(w);
    const view = await island.waitFor(
      w.island.pid,
      (v) => v.elements.some((e) => e.identifier === 'shelf-item'),
      2000,
      'no item on shelf'
    );
    const itemEl = view.elements.find((e) => e.identifier === 'shelf-item');
    const from = center(itemEl.frame);
    const to = { x: w.standIn.window.x + w.standIn.window.w / 2, y: w.standIn.window.y + w.standIn.window.h / 2 };
    await harness.drag(from.x, from.y, to.x, to.y, 20, 15, false);
    await sleep(300);
  });

  reg.define(/^the visionary sees the screenshot gone from the shelf page$/, async (w) => {
    if (w.standIn) {
      await w.standIn.assertReceived('Screenshot 2026-10-18 at 10.15.02.png');
    }
    await openOnShelfPage(w);
    await island.waitFor(
      w.island.pid,
      (v) => !v.texts.some((t) => t.includes('Screenshot')),
      3000,
      'screenshot is still on the shelf'
    );
  });

  reg.define(/^the visionary drags it out of the shelf and lets go (in a Messages chat that refuses it as too large|over the menu bar, where nothing accepts it)$/, async (w, where) => {
    await openOnShelfPage(w);
    const view = await island.waitFor(
      w.island.pid,
      (v) => v.elements.some((e) => e.identifier === 'shelf-item'),
      2000,
      'no item on shelf'
    );
    const itemEl = view.elements.find((e) => e.identifier === 'shelf-item');
    const from = center(itemEl.frame);
    let to;
    if (where.includes('Messages')) {
      w.standIn = await launchDropStandIn(w, { title: 'Messages', maxSize: 1073741824 });
      to = { x: w.standIn.window.x + w.standIn.window.w / 2, y: w.standIn.window.y + w.standIn.window.h / 2 };
    } else {
      const { notch } = await harness.builtIn();
      to = { x: notch.x - 50, y: 10 };
    }
    w.defer(() => harness.releaseIfHeld());
    await harness.drag(from.x, from.y, to.x, to.y, 20, 15, true);
    await sleep(300);
    await assertShelfDragInFlight(w);
    await harness.release();
    await sleep(300);
  });

  reg.define(/^the visionary sees (the 2 GB screen recording "bug-repro\.mov"|the screenshot "Screenshot 2026-10-18 at 10\.15\.02\.png") on the shelf page as it was$/, async (w, item) => {
    await island.waitFor(
      w.island.pid,
      (v) => !v.elements.some((e) => e.identifier === 'remove-area'),
      3000,
      'remove-area did not disappear after refused drag ended'
    );
    await sleep(500);
    await openOnShelfPage(w);
    const targetText = item.includes('bug-repro.mov') ? 'bug-repro.mov' : 'Screenshot';
    for (let i = 0; i < 4; i++) {
      await sleep(300);
      const view = await island.look(w.island.pid);
      assert.ok(
        view.texts.some((t) => t.includes(targetText)),
        `${targetText} not on shelf page as it was during settle`
      );
    }
    if (w.standIn) {
      w.standIn.assertEmpty();
    }
  });

  reg.define(/^the visionary removes it by dropping it on the remove area at the panel's edge$/, async (w) => {
    await openOnShelfPage(w);
    const view = await island.waitFor(
      w.island.pid,
      (v) => v.elements.some((e) => e.identifier === 'shelf-item'),
      2000,
      'no item on shelf'
    );
    const itemEl = view.elements.find((e) => e.identifier === 'shelf-item');
    const from = center(itemEl.frame);
    // The remove area lies along the shelf page's bottom edge, inside it.
    const to = { x: view.shelfFrame.x + view.shelfFrame.w / 2, y: view.shelfFrame.y + view.shelfFrame.h - 18 };
    await harness.drag(from.x, from.y, to.x, to.y, 20, 15, false);
    await sleep(300);
  });

  reg.define(/^the visionary sees ("tax-return\.pdf"|"Screenshot 2026-10-18 at 10\.15\.02\.png"|the folder "Taxes 2026") gone from the shelf page$/, async (w, item) => {
    await openOnShelfPage(w);
    const name = item.replace(/"/g, '').replace('the folder ', '');
    await island.waitFor(
      w.island.pid,
      (v) => !v.texts.some((t) => t.includes(name)),
      3000,
      `${name} still on shelf`
    );
  });

  reg.define(/^the visionary sees ("tax-return\.pdf"|"Screenshot 2026-10-18 at 10\.15\.02\.png"|the folder "Taxes 2026") still in (the Documents folder|the Desktop)$/, async (w, item, home) => {
    const dir = home.includes('Documents') ? scratchDocuments(w) : scratchDesktop(w);
    const name = item.replace(/"/g, '').replace('the folder ', '');
    assert.ok(fs.existsSync(path.join(dir, name)), `${name} is missing from ${dir}`);
  });

  reg.define(/^the visionary drags the link onto the remove area at the panel's edge and lets go$/, async (w) => {
    await openOnShelfPage(w);
    const view = await island.waitFor(
      w.island.pid,
      (v) => v.elements.some((e) => e.identifier === 'shelf-item'),
      2000,
      'no link on shelf'
    );
    const itemEl = view.elements.find((e) => e.identifier === 'shelf-item');
    const from = center(itemEl.frame);
    // The remove area lies along the shelf page's bottom edge, inside it.
    const to = { x: view.shelfFrame.x + view.shelfFrame.w / 2, y: view.shelfFrame.y + view.shelfFrame.h - 18 };
    await harness.drag(from.x, from.y, to.x, to.y, 20, 15, false);
    await sleep(300);
  });

  reg.define(/^the visionary sees the link gone from the shelf page$/, async (w) => {
    await openOnShelfPage(w);
    await island.waitFor(
      w.island.pid,
      (v) => !v.texts.some((t) => t.includes('gov.uk')),
      3000,
      'link still on shelf'
    );
  });

  reg.define(/^the visionary starts dragging "tax-return\.pdf" out of the shelf$/, async (w) => {
    const view = await island.waitFor(
      w.island.pid,
      (v) => v.elements.some((e) => e.identifier === 'shelf-item'),
      2000,
      'no tax-return.pdf on shelf'
    );
    const itemEl = view.elements.find((e) => e.identifier === 'shelf-item');
    const from = center(itemEl.frame);
    w.defer(() => harness.release().catch(() => {}));
    await harness.drag(from.x, from.y, from.x, from.y + 30, 15, 15, true);
    await sleep(150);
  });

  reg.define(/^the visionary sees a small remove area appear at the panel's edge$/, async (w) => {
    const view = await island.waitFor(
      w.island.pid,
      (v) => v.elements.some((e) => e.identifier === 'remove-area'),
      2000,
      'remove area did not appear'
    );
    const rem = view.elements.find((e) => e.identifier === 'remove-area');
    assert.ok(rem, 'remove area not found');
    // Seen whole: the shelf page clips what lies past its edge.
    const page = view.shelfFrame;
    assert.ok(page, 'shelf page not found');
    const f = rem.frame;
    assert.ok(f.x >= page.x - 1 && f.y >= page.y - 1 && f.x + f.w <= page.x + page.w + 1
      && f.y + f.h <= page.y + page.h + 1,
      `remove area ${JSON.stringify(f)} is cut off by the shelf page ${JSON.stringify(page)}`);
  });

  reg.define(/^the visionary drags it out of the shelf and drops it on (the Desktop|a Chrome window)$/, async (w, where) => {
    if (where === 'the Desktop') {
      const desktop = scratchDesktop(w);
      w.standIn = await launchDropStandIn(w, { title: 'Desktop', moveTo: desktop });
    } else {
      w.standIn = await launchDropStandIn(w, { title: 'Google Chrome' });
    }
    await openOnShelfPage(w);
    const view = await island.waitFor(
      w.island.pid,
      (v) => v.elements.some((e) => e.identifier === 'shelf-item'),
      2000,
      'no item on shelf'
    );
    const itemEl = view.elements.find((e) => e.identifier === 'shelf-item');
    const from = center(itemEl.frame);
    const to = { x: w.standIn.window.x + w.standIn.window.w / 2, y: w.standIn.window.y + w.standIn.window.h / 2 };
    await harness.drag(from.x, from.y, to.x, to.y, 20, 15, false);
    await sleep(300);
  });

  reg.define(/^the visionary sees "tax-return\.pdf" moved to the Desktop as in Finder, no longer in Documents$/, async (w) => {
    const desktop = scratchDesktop(w);
    const docs = scratchDocuments(w);
    await island.until(() => fs.existsSync(path.join(desktop, 'tax-return.pdf')), 3000, 'tax-return.pdf not moved to Desktop');
    assert.ok(!fs.existsSync(path.join(docs, 'tax-return.pdf')), 'tax-return.pdf still in Documents');
  });

  reg.define(/^the visionary sees Chrome open "tax-return\.pdf"$/, async (w) => {
    const log = await island.until(() => w.standIn.readLog(), 3000, 'Chrome stand-in did not receive tax-return.pdf');
    assert.ok(log && log.received && log.received.some((r) => r.name === 'tax-return.pdf'), 'tax-return.pdf not opened by Chrome');
  });
};
