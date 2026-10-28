'use strict';
// D70: real pointer clicks, live AX menu-bar targets, and the menu's owning
// process as the far side. No AXPress, stand-in status icon, or saved pixels.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const harness = require('./harness');
const island = require('./island');
const chrome = require('./chrome');
const login = require('./login');
const scenes = require('./scenes');
const { onCleanup } = require('./cleanup');
const { harness: binary } = require('./paths');

const center = (f) => ({ x: f.x + f.w / 2, y: f.y + f.h / 2 });

async function prepare(w) {
  // V1's signed scratch fixture has a detached unregister-on-disconnect
  // guardian. The older island.launch keeper quits the installed app; D70
  // must leave that app running, so use the safe existing fixture instead.
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
const label = (e) => [e.title, e.description, e.identifier, e.value].filter(Boolean).join(' ');
const visibleMenu = (s) => s.elements.filter((e) => e.role === 'AXMenu' && e.frame?.h > 0
  && e.AXHidden !== true && e.AXVisible !== false);
const windowKey = (w) => JSON.stringify([w.title, w.frame]);

function opened(target, before, after) {
  const top = after.elements[0];
  const selected = top?.AXSelected === true || top?.AXExpanded === true;
  const menus = visibleMenu(after);
  // A selected menu-bar item and an actual menu below it, or a menu subtree
  // that appeared only after this click. A closed command list is insufficient.
  const newMenu = menus.some((m) => !visibleMenu(before).some((b) => JSON.stringify(b) === JSON.stringify(m)));
  if (target.kind !== 'wifi' && menus.length && (selected || newMenu)) return true;
  // Control Center uses a popover window rather than AXMenu. It must be new,
  // belong to this exact status item's PID, and (for Wi-Fi) show Wi-Fi itself.
  return after.windows.some((w) => w.frame?.h > target.item.frame.h
    && !before.windows.some((b) => windowKey(b) === windowKey(w))
    && (target.kind !== 'wifi' || (w.elements || []).some((e) => /wi.?fi/i.test(label(e)))));
}

async function click(w, name) {
  const target = await locate(w, name);
  const before = await state(target);
  const top = before.elements[0];
  assert.ok(top && top.AXSelected !== true && top.AXExpanded !== true, 'the target menu is already open before the click');
  const n = (await harness.builtIn()).notch;
  assert.ok(island.isPlainNotch(await island.look(w.island.pid), n), 'the island is not plain before the menu click');
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
  const watch = harness.watch(w.island.pid, 900, 25);
  await harness.move(target.point.x, target.point.y);
  await harness.click(target.point.x, target.point.y);
  w.closedMenu.samples = await watch;
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
    assert.ok(island.isPlainNotch(island.parse(sample.windows, n), n),
      `${target.target}: the island opened a panel or wing during the click at ${sample.t} ms`);
  }
  assert.ok(island.isPlainNotch(await island.look(w.island.pid), n), 'the island did not stay closed while the menu was open');
  console.log(`D70 ${target.target}: owner=${target.item.owner} pid=${target.item.pid} AX=${JSON.stringify(target.item.frame)} click=${JSON.stringify(target.point)} menu open; island plain`);
  await harness.key(53);
  await island.until(async () => !opened(target, before, await state(target)), 2500,
    `${target.target}: Escape did not close the menu`);
  evidence.clear();
  evidence.disarm();
}

module.exports = { prepare, click, assertOpen };
