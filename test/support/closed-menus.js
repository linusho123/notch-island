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
  const end = Date.now() + 900;
  const samples = [];
  do {
    samples.push(await closedSample(w));
    await new Promise((resolve) => setTimeout(resolve, 25));
  } while (Date.now() < end);
  return samples;
}

async function prepare(w) {
  assertFixtureSession({ allowInstalled: true });
  // V1 owns a signed scratch fixture and a detached cleanup guardian.
  // Its explicit P5 pause keeps the installed observer out of fixture Music.
  await login.prepare(w);
  w.chrome = await chrome.launch(w);
  await harness.activate(w.chrome.pid);
  await island.until(async () => (await harness.frontmost()).pid === w.chrome.pid, 5000,
    'the test Chrome did not come to the front');
  await scenes.plainNotch(w);
}

async function locate(w, target) {
  const { notch: n } = await harness.builtIn();
  let item;
  let kind;
  if (target.includes('Help menu')) {
    const menus = (await harness.menubar(w.chrome.pid)).filter((i) => i.frame?.w > 0);
    item = menus.find((i) => i.title === 'Help');
    assert.ok(item, "Chrome's menu bar shows no Help menu");
    assert.ok(item.frame.x + item.frame.w <= n.x, "Chrome's Help menu is not left of the notch");
    assert.equal(menus.filter((i) => i.frame.x + i.frame.w <= n.x)
      .sort((a, b) => b.frame.x - a.frame.x)[0].title, 'Help', 'Help is not the nearest app menu left of the notch');
    item = { ...item, pid: w.chrome.pid, owner: 'test Chrome' };
    kind = 'help';
  } else {
    const extras = (await harness.extras()).filter((i) => i.frame?.w > 0
      && i.frame.h > 0 && i.frame.y < n.y + n.h && i.frame.y + i.frame.h > n.y);
    if (target === 'the Wi-Fi icon') {
      item = extras.find((i) => i.owner === 'Control Center'
        && /wi.?fi/i.test([i.identifier, i.description, i.title].join(' ')));
      kind = 'wifi';
    } else {
      item = extras.filter((i) => i.frame.x >= n.x + n.w)
        .sort((a, b) => a.frame.x - b.frame.x)[0];
      kind = 'status';
    }
    assert.ok(item, `the menu bar shows no ${target}`);
    assert.ok(item.frame.x >= n.x + n.w, `${target} is not right of the notch`);
  }
  const point = center(item.frame);
  if (target.startsWith('the right-hand edge')) {
    assert.ok(item.frame.w > 6, 'Help is too narrow to click three points inside its right edge');
    point.x = item.frame.x + item.frame.w - 3;
  }
  return { item, point, kind, target };
}

const state = (target) => harness.h('menu-state', target.item.pid, target.point.x, target.point.y);
const visibleMenu = (s) => s.elements.filter((e) => e.role === 'AXMenu' && e.depth > (s.elements[0]?.depth || 0)
  && e.frame?.w > 0 && e.frame?.h > 0
  && e.AXHidden !== true && e.AXVisible !== false);
const windowKey = (w) => JSON.stringify([w.title, w.frame]);
const sameItem = (a, b) => a && b && ['role', 'title', 'description', 'identifier'].every((k) => a[k] === b[k])
  && ['x', 'y', 'w', 'h'].every((k) => a.frame?.[k] === b.frame?.[k]);
const normalized = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function ownPane(target, window) {
  const f = window.frame;
  const item = target.item;
  const bottom = item.frame.y + item.frame.h;
  // Status popovers attach just below their own icon. An owner dialog on
  // another screen, or elsewhere on this screen, is not menu evidence.
  if (!f || f.h <= item.frame.h || target.point.x < f.x || target.point.x >= f.x + f.w
    || f.y < bottom - 2 || f.y > bottom + 16) return false;
  const names = [item.title, item.description, item.identifier?.split('.').at(-1)].map(normalized).filter(Boolean);
  if (target.kind === 'wifi') names.push('wifi');
  // Only the pane's own identity or its heading qualifies. A generic Control
  // Center window containing a Wi-Fi button/tile cannot prove Wi-Fi opened.
  const headings = (window.elements || []).filter((e) => e.role === 'AXWindow'
    || e.role === 'AXHeading' || (e.role === 'AXStaticText' && e.frame?.y < f.y + 48));
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
