'use strict';
// D70: real pointer clicks, live AX menu-bar targets, and the menu's owning
// process as the far side. No AXPress, stand-in status icon, or saved pixels.
const assert = require('node:assert/strict');
const { assertFixtureSession } = require('./fixture-preflight');
const { execFileSync } = require('node:child_process');
const harness = require('./harness');
const island = require('./island');
const procs = require('./procs');
const chrome = require('./chrome');
const login = require('./login');
const scenes = require('./scenes');
const { onCleanup } = require('./cleanup');
const { harness: binary } = require('./paths');

const center = (f) => ({ x: f.x + f.w / 2, y: f.y + f.h / 2 });
const finiteFrame = (f) => f && ['x', 'y', 'w', 'h'].every((k) => Number.isFinite(f[k])) && f.w > 0 && f.h > 0;
const contained = (f, outer) => finiteFrame(f) && f.x >= outer.x && f.y >= outer.y
  && f.x + f.w <= outer.x + outer.w && f.y + f.h <= outer.y + outer.h;
const menuStrip = (s) => ({ x: s.frame.x, y: s.frame.y, w: s.frame.w, h: s.notch.y + s.notch.h - s.frame.y });
// AX reports Chrome's menu items as 34 points tall in a 33-point strip.
// Permit that single border point in the item frame, never in the click.
const inStrip = (f, strip) => contained(f, { ...strip, h: strip.h + 1 });

// D70 needs a running fixture, not merely an absence of open content. Keep
// this stronger assertion local: isPlainNotch is also used for visibility
// observations elsewhere. Every AX read is bracketed by the process registry's
// PID/start-time check; a dead or reused PID cannot contribute a good sample.
function owned(w) {
  return Boolean(w.island?.started && !w.island.exited
    && procs.ownsPid(w.island.pid) && procs.alive(w.island));
}

async function closedSample(w) {
  const before = owned(w);
  const windows = await harness.windows(w.island.pid);
  return { t: Date.now(), windows, owned: before && owned(w) };
}

function assertClosed(sample, n, when) {
  assert.ok(sample.owned, `${when}: owned island process identity lost`);
  assert.ok(Array.isArray(sample.windows) && sample.windows.length > 0
    && sample.windows.every((w) => w.frame && ['x', 'y', 'w', 'h'].every((k) => Number.isFinite(w.frame[k]))),
  `${when}: missing or unreadable island AX window`);
  const view = island.parse(sample.windows, n);
  assert.ok(view.notchPart && ['x', 'y', 'w', 'h'].every((k) => Math.abs(view.notchPart[k] - n[k]) <= 1)
    && island.isPlainNotch(view, n), `${when}: the running island is not closed to its notch`);
}

async function watchClosed(w) {
  // At least 900 ms and more than ten looks: one look can take ~60 ms on
  // macOS 27, so the looks, not the clock, set the end (within 4 s).
  const start = Date.now();
  const samples = [];
  do {
    samples.push(await closedSample(w));
    await new Promise((resolve) => setTimeout(resolve, 25));
  } while ((Date.now() - start < 900 || samples.length <= 10) && Date.now() - start < 4000);
  return samples;
}

async function prepare(w) {
  assertFixtureSession({ allowInstalled: true });
  // V1 owns a signed scratch fixture and a detached cleanup guardian.
  // Its explicit P5 pause keeps the installed observer out of fixture Music.
  await login.prepare(w);
  await harness.captureIndicatorGone();
  w.chrome = await chrome.launch(w);
  const s = await harness.builtIn();
  const browser = w.chrome.browser;
  const [tab] = await browser.pages();
  assert.ok(tab, 'the test Chrome has no page to place on the built-in display');
  const { windowId } = await browser.cdp.send('Browser.getWindowForTarget', { targetId: tab.targetId });
  await browser.cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
  // Whole points: Chrome refuses fractions, and the notch can be 33.5 pt tall.
  await browser.cdp.send('Browser.setWindowBounds', { windowId, bounds: {
    left: Math.round(s.frame.x + 40), top: Math.round(s.frame.y + s.notch.h + 60),
    width: Math.round(Math.min(900, s.frame.w - 80)), height: Math.round(Math.min(650, s.frame.h - s.notch.h - 120)),
  } });
  await harness.activate(w.chrome.pid);
  await island.until(async () => (await harness.frontmost()).pid === w.chrome.pid, 5000,
    'the test Chrome did not come to the front');
  await island.until(async () => (await harness.windows(w.chrome.pid)).some((win) =>
    !win.minimized && contained(win.frame, s.frame)), 5000, 'the test Chrome is not on the built-in display');
  await scenes.plainNotch(w);
}

async function locate(w, target) {
  const screen = await harness.builtIn();
  const n = screen.notch;
  const strip = menuStrip(screen);
  let item;
  let kind;
  if (target.includes('Help menu')) {
    const menus = (await harness.menubar(w.chrome.pid)).filter((i) => inStrip(i.frame, strip));
    item = menus.find((i) => i.title === 'Help');
    assert.ok(item, "Chrome's Help menu is not in the built-in menu-bar strip");
    assert.ok(item.frame.x + item.frame.w <= n.x, "Chrome's Help menu is not left of the notch");
    assert.equal(menus.filter((i) => i.frame.x + i.frame.w <= n.x)
      .sort((a, b) => b.frame.x - a.frame.x)[0].title, 'Help', 'Help is not the nearest app menu left of the notch');
    item = { ...item, pid: w.chrome.pid, owner: 'test Chrome' };
    kind = 'help';
  } else {
    const extras = (await harness.labelledExtras()).filter((i) => inStrip(i.frame, strip));
    if (target === 'the Wi-Fi icon') {
      // macOS 26: Control Center's own item; macOS 27: MenuBarAgent's host
      // view around the labelled com.apple.menuextra.wifi item.
      item = extras.find((i) => (i.owner === 'Control Center'
        && /wi.?fi/i.test([i.identifier, i.description, i.title].join(' ')))
        || (i.owner === 'MenuBarAgent' && i.label?.identifier === 'com.apple.menuextra.wifi'));
      kind = 'wifi';
    } else {
      item = extras.filter((i) => i.frame.x >= n.x + n.w)
        .sort((a, b) => a.frame.x - b.frame.x)[0];
      kind = 'status';
    }
    assert.ok(item, `the built-in menu-bar strip shows no ${target}`);
    assert.ok(item.frame.x >= n.x + n.w, `${target} is not right of the notch`);
  }
  const point = center(item.frame);
  if (target.startsWith('the right-hand edge')) {
    // One logical point is inside the AX boundary and still exercises a dead
    // zone confined to the final two points. (On macOS 27 Chrome's own Help
    // does not open from its last half point, with or without the island:
    // probed 2026-10-30, so half a point would test Chrome, not the island.)
    const inset = 1;
    assert.ok(item.frame.w > inset, 'Help is too narrow for the inside-edge click');
    point.x = item.frame.x + item.frame.w - inset;
  }
  assert.ok(point.x >= item.frame.x && point.x < item.frame.x + item.frame.w
    && point.y >= item.frame.y && point.y < item.frame.y + item.frame.h, 'the click is outside its AX item');
  assert.ok(point.x >= strip.x && point.x < strip.x + strip.w
    && point.y >= strip.y && point.y < strip.y + strip.h, 'the click is outside the built-in menu-bar strip');
  return { item, point, kind, target };
}

const state = async (target) => {
  const s = await harness.h('menu-state', target.item.pid, target.point.x, target.point.y);
  // macOS 27 draws Wi-Fi's icon in MenuBarAgent but opens its pane in
  // Control Center, so that pane's windows count as the item's own.
  if (target.kind === 'wifi' && target.item.owner === 'MenuBarAgent') {
    const cc = execFileSync('pgrep', ['-x', 'ControlCenter'], { encoding: 'utf8' }).trim().split('\n')[0];
    s.windows = [...(s.windows || []), ...(await harness.windows(Number(cc)))];
  }
  return s;
};
const visibleMenu = (s) => s.elements.filter((e) => e.role === 'AXMenu' && e.depth > (s.elements[0]?.depth || 0)
  && e.frame?.w > 0 && e.frame?.h > 0
  && e.AXHidden !== true && e.AXVisible !== false);
const windowKey = (w) => JSON.stringify([w.title, w.frame]);
// Live status labels can widen between AX reads. Identity and the anchored
// left edge remain stable; never infer identity from a matching width.
const sameItem = (a, b) => a && b && a.role === b.role
  && (a.identifier ? a.identifier === b.identifier
    : !b.identifier && (a.subrole === 'AXMenuExtra' && b.subrole === 'AXMenuExtra'
      || ['title', 'description'].every((k) => a[k] === b[k])))
  && finiteFrame(a.frame) && finiteFrame(b.frame)
  && ['x', 'y', 'h'].every((k) => a.frame[k] === b.frame[k]);
const normalized = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function ownPane(target, window) {
  const f = window.frame;
  const item = target.item;
  const bottom = item.frame.y + item.frame.h;
  // Status popovers attach just below their own icon. An owner dialog on
  // another screen, or elsewhere on this screen, is not menu evidence.
  if (!finiteFrame(f) || f.h <= item.frame.h || target.point.x < f.x || target.point.x >= f.x + f.w) return false;
  // macOS 26's Wi-Fi pane is a tall AXSystemDialog starting at y=0.
  // Its dedicated static-text header identifies the expanded pane, unlike
  // the Wi-Fi tile inside the generic Control Center window.
  const elements = window.elements || [];
  // On macOS 27 the same pane starts just below the menu bar.
  if (target.kind === 'wifi' && ['Control Center', 'MenuBarAgent'].includes(item.owner)
    && elements.some((e) => e.role === 'AXWindow' && e.subrole === 'AXSystemDialog')
    && f.y <= bottom && f.y + f.h > bottom
    && elements.some((e) => e.role === 'AXStaticText' && e.identifier === 'wifi-header'
      && normalized(e.value) === 'wifi' && contained(e.frame, f)
      && e.frame.y >= bottom && e.frame.y <= bottom + 40)) return true;
  if (f.y < bottom - 2 || f.y > bottom + 16) return false;
  const names = [item.title, item.description, item.identifier?.split('.').at(-1)].map(normalized).filter(Boolean);
  if (target.kind === 'wifi') names.push('wifi');
  // Some status apps expose only a changing numeric label, but name their
  // own anchored pane. The state request is already scoped to that app's PID.
  if (target.kind === 'status' && !item.identifier && item.subrole === 'AXMenuExtra'
    && item.owner !== 'Control Center') names.push(normalized(item.owner));
  // Only the pane's own identity or its heading qualifies. A generic Control
  // Center window containing a Wi-Fi button/tile cannot prove Wi-Fi opened.
  const headings = (window.elements || []).filter((e) => e.role === 'AXWindow' || e.role === 'AXHeading');
  const titles = [window.title, ...headings.flatMap((e) => [e.title, e.description, e.identifier, e.value])];
  return titles.some((title) => title && names.includes(normalized(title)));
}

function opened(target, before, after) {
  const top = after.elements[0];
  if (!sameItem(target.item, before.elements[0]) || !sameItem(target.item, top)) return false;
  const selected = top?.AXSelected === true || top?.AXExpanded === true;
  const menus = visibleMenu(after);
  // A selected menu-bar item and an actual menu below it, or a menu subtree
  // that appeared only after this click. A closed command list is insufficient.
  const newMenu = menus.some((m) => !visibleMenu(before).some((b) => JSON.stringify(b) === JSON.stringify(m)));
  if (target.kind !== 'wifi' && menus.length && (selected || newMenu)) return true;
  // Some status apps use a named, anchored pane instead of an AXMenu child.
  // Help has no such fallback. All evidence comes from the clicked item's PID.
  return target.kind !== 'help' && after.windows.some((w) => ownPane(target, w)
    && !before.windows.some((b) => windowKey(b) === windowKey(w))
  );
}

async function click(w, name) {
  const target = await locate(w, name);
  const before = await state(target);
  const top = before.elements[0];
  assert.ok(sameItem(target.item, top), 'the clicked menu-bar item changed before the click');
  assert.ok(target.point.x >= top.frame.x && target.point.x < top.frame.x + top.frame.w,
    'the live item no longer contains the click point');
  assert.ok(top.AXSelected !== true && top.AXExpanded !== true
    && visibleMenu(before).length === 0 && !before.windows.some((win) => ownPane(target, win)),
  'the target menu is already open before the click');
  const n = (await harness.builtIn()).notch;
  assertClosed(await closedSample(w), n, 'before the menu click');
  // Arm Escape before the click, for assertion failures and signal exits too.
  // Only Escape is ever sent to a real status app; no command inside is clicked.
  let armed = true;
  const disarm = onCleanup(() => {
    if (armed) execFileSync(binary, ['key', '53'], { timeout: 5000, stdio: 'ignore' });
  });
  w.defer(async () => {
    try { if (armed) await harness.key(53); } finally { armed = false; disarm(); }
  });
  w.closedMenu = { target, before, n, disarm, clear: () => { armed = false; } };
  // Jump straight to the target; never sweep across the notch on the way.
  const results = await Promise.allSettled([watchClosed(w), (async () => {
    await harness.move(target.point.x, target.point.y);
    assert.ok(owned(w), 'before mouse-down: owned island process identity lost');
    await harness.click(target.point.x, target.point.y);
    assertClosed(await closedSample(w), n, 'after the menu click');
  })()]);
  for (const r of results) if (r.status === 'rejected') throw r.reason;
  w.closedMenu.samples = results[0].value;
}

async function assertOpen(w, result) {
  const evidence = w.closedMenu;
  assert.ok(evidence, 'no menu click was made');
  const { target, before, n } = evidence;
  assert.equal(result, target.kind === 'help' ? "Chrome's Help menu open"
    : target.kind === 'wifi' ? 'the Wi-Fi menu open' : "that status icon's own menu open, as before");
  let last;
  await island.until(async () => {
    last = await state(target);
    return opened(target, before, last);
  }, 2500, () => `${target.target}: its own menu did not open after the real click: ${JSON.stringify(last)}`);
  assert.ok(evidence.samples.length > 10, 'too few Accessibility looks around the click');
  for (const sample of evidence.samples) {
    assertClosed(sample, n, `${target.target} watch at ${sample.t} ms`);
  }
  assertClosed(await closedSample(w), n, 'final open-menu assertion');
  console.log(`D70 ${target.target}: owner=${target.item.owner} pid=${target.item.pid} AX=${JSON.stringify(target.item.frame)} click=${JSON.stringify(target.point)} menu open; island plain`);
  await harness.key(53);
  await island.until(async () => !opened(target, before, await state(target)), 2500,
    `${target.target}: Escape did not close the menu`);
  evidence.clear();
  evidence.disarm();
}

module.exports = { prepare, locate, opened, click, assertOpen };
