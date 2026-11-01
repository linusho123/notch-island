'use strict';
// Screen-free counterexamples. All Mac-facing dependencies are inert; these
// exercise the same click and final assertion as the four D70 examples.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./support/load-isolated');
const notch = { x: 763, y: 0, w: 185, h: 33 };
const screen = { frame: { x: 0, y: 0, w: 1710, h: 1107 }, notch };
const help = { role: 'AXMenuBarItem', title: 'Help', frame: { x: 580, y: 0, w: 48, h: 34 } };
const helpName = "Chrome's Help menu, the nearest menu left of the notch";
const result = "Chrome's Help menu open";
const windows = [{ frame: notch, elements: [] }];
const island = load('island.js', {
  './procs': {}, './cleanup': {}, './harness': {}, './sandbox': {}, './paths': {},
  './installed-island': {}, './island-procs': {},
});

function fixture({ bad = '', stage = 'before', menus = [help], extras = [], builtIn = screen } = {}) {
  let clicked = false;
  let phase = 'before';
  let clock = 0;
  const w = { island: { pid: 10, started: 'birth', exited: false }, chrome: { pid: 20 }, defer() {} };
  const active = () => phase === stage;
  const ax = () => active() && bad === 'empty' ? []
    : active() && bad === 'unreadable' ? [{ elements: [] }] : windows;
  const closed = { elements: [help], windows: [] };
  const opened = { elements: [{ ...help, AXSelected: true }, {
    role: 'AXMenu', depth: 1, AXVisible: true, frame: { x: 580, y: 34, w: 200, h: 220 },
  }], windows: [] };
  const harness = {
    builtIn: async () => builtIn, menubar: async () => menus, extras: async () => extras, labelledExtras: async () => extras,
    windows: async () => ax(),
    h: async () => clicked ? opened : closed,
    watch: async () => Array.from({ length: 20 }, (_, t) => ({ t, windows: stage === 'watch' ?
      bad === 'empty' ? [] : bad === 'unreadable' ? [{ elements: [] }] : windows : ax() })),
    move: async () => {}, click: async () => { clicked = true; phase = 'watch'; },
    key: async () => { clicked = false; },
  };
  const procs = {
    ownsPid: () => !(active() && bad === 'unowned'),
    alive: (h) => !(active() && ['dead', 'reused'].includes(bad)) && h.started === 'birth',
  };
  const driver = load('closed-menus.js', {
    './fixture-preflight': {}, './harness': harness, './procs': procs,
    './island': { ...island, look: async () => island.parse(ax(), notch),
      until: async (pred, ms, message) => {
        if (!(await pred())) throw new Error(typeof message === 'function' ? message() : message);
      } },
    './chrome': {}, './login': {}, './scenes': {}, './paths': {}, './cleanup': { onCleanup: () => () => {} },
  }, { Date: { now: () => (clock += 25) }, setTimeout: (fn) => { fn(); } });
  return { driver, w, finish: () => { phase = 'final'; }, harness };
}

for (const bad of ['empty', 'unreadable', 'dead', 'reused', 'unowned']) {
  for (const stage of ['before', 'watch', 'final']) test(`M13: ${bad} island at ${stage} cannot pass D70`, async () => {
    const { driver, w, finish } = fixture({ bad, stage });
    await assert.rejects(async () => {
      await driver.click(w, helpName);
      finish();
      await driver.assertOpen(w, result);
    }, /owned|identity|notch|closed|window/i);
  });
}

test('M13: the same owned live notch survives click, watch and final assertion', async () => {
  const { driver, w, finish } = fixture();
  await driver.click(w, helpName);
  finish();
  await driver.assertOpen(w, result);
});

const targetHelp = { kind: 'help', item: { ...help, pid: 20 }, point: { x: 604, y: 17 } };
const statusItem = { role: 'AXMenuBarItem', description: 'Wi-Fi', identifier: 'com.apple.menuextra.wifi',
  owner: 'Control Center', pid: 30, frame: { x: 1400, y: 6, w: 22, h: 22 } };
const wifi = { kind: 'wifi', item: statusItem, point: { x: 1411, y: 17 } };
const bare = (item) => ({ elements: [item], windows: [] });
const pane = (title, identifier) => ({ title, frame: { x: 1250, y: 34, w: 300, h: 400 }, elements: [
  { role: 'AXWindow', title, identifier, depth: 0 },
  { role: 'AXHeading', value: title, depth: 1 },
] });

test('M12: unrelated new and resized owner windows cannot prove Help opened', () => {
  const { driver } = fixture();
  for (const old of [[], [pane('Print')]]) {
    const before = { ...bare(help), windows: old };
    const dialog = { ...pane('Print'), frame: { x: 500, y: 50, w: 350, h: 250 } };
    assert.equal(driver.opened(targetHelp, before, { ...bare(help), windows: [dialog] }), false);
  }
});

test('M12: only the clicked Help item and its visible descendant menu qualify', () => {
  const { driver } = fixture();
  const menu = { role: 'AXMenu', depth: 1, AXVisible: true, frame: { x: 580, y: 34, w: 200, h: 200 } };
  const before = bare(help);
  assert.equal(driver.opened(targetHelp, before, { elements: [{ ...help, AXSelected: true }, menu], windows: [] }), true);
  for (const wrong of [
    { elements: [{ ...help, title: 'File', AXSelected: true }, menu], windows: [] },
    { elements: [{ ...help, AXSelected: true }, { ...menu, depth: 0 }], windows: [] },
    { elements: [{ ...help, AXSelected: true }, { ...menu, AXVisible: false }], windows: [] },
  ]) assert.equal(driver.opened(targetHelp, before, wrong), false);
});

test('M12: generic Control Center with a Wi-Fi tile is not the Wi-Fi pane', () => {
  const { driver } = fixture();
  const generic = pane('Control Center', 'ControlCenter');
  generic.elements.push({ role: 'AXButton', description: 'Wi-Fi', depth: 2 });
  generic.elements.push({ role: 'AXStaticText', value: 'Wi-Fi', depth: 3,
    frame: { x: 1270, y: 54, w: 100, h: 20 } });
  for (const kind of ['wifi', 'status']) {
    const target = { ...wifi, kind };
    assert.equal(driver.opened(target, bare(statusItem), { ...bare(statusItem), windows: [generic] }), false);
    assert.equal(driver.opened(target, bare(statusItem), { ...bare(statusItem), windows: [pane('Wi-Fi', 'WiFi')] }), true);
  }
});

test('M12: another icon or unanchored same-name pane cannot satisfy the clicked status item', () => {
  const { driver } = fixture();
  const sound = { ...statusItem, description: 'Sound', identifier: 'com.apple.menuextra.sound' };
  assert.equal(driver.opened(wifi, bare(statusItem), { ...bare(sound), windows: [pane('Wi-Fi', 'WiFi')] }), false);
  const elsewhere = { ...pane('Wi-Fi', 'WiFi'), frame: { x: -400, y: 400, w: 300, h: 400 } };
  assert.equal(driver.opened(wifi, bare(statusItem), { ...bare(statusItem), windows: [elsewhere] }), false);
});

for (const [name, item, external] of [
  ['external-left Help', help, { x: -300, y: 0, w: 48, h: 34 }],
  ['external-right status', statusItem, { x: 1900, y: 6, w: 22, h: 22 }],
  ['external-right Wi-Fi', statusItem, { x: 1900, y: 6, w: 22, h: 22 }],
  ['above-screen Help', help, { x: 580, y: -40, w: 48, h: 34 }],
  ['below-strip status', statusItem, { x: 1400, y: 30, w: 22, h: 22 }],
]) test(`M14: ${name} is rejected despite notch-relative ordering`, async () => {
  const target = name.includes('Help') ? helpName : name.includes('Wi-Fi') ? 'the Wi-Fi icon' : 'the leftmost status icon right of the notch';
  const { driver, w } = fixture({ menus: [{ ...item, frame: external }], extras: [{ ...item, frame: external }] });
  await assert.rejects(driver.locate(w, target), /built-in|screen|strip/);
});

test('M14: built-in targets and non-origin display coordinates remain valid', async () => {
  const offset = { x: 200, y: -300 };
  const shift = (f) => ({ ...f, x: f.x + offset.x, y: f.y + offset.y });
  for (const shifted of [false, true]) {
    const transform = (f) => shifted ? shift(f) : f;
    const { driver, w } = fixture({
      menus: [{ ...help, frame: transform(help.frame) }], extras: [{ ...statusItem, frame: transform(statusItem.frame) }],
      builtIn: { frame: transform(screen.frame), notch: transform(notch) },
    });
    for (const name of [helpName, 'the Wi-Fi icon', 'the leftmost status icon right of the notch']) {
      const target = await driver.locate(w, name);
      const f = transform(screen.frame);
      assert.ok(target.point.x >= f.x && target.point.x < f.x + f.w);
      assert.ok(target.point.y >= f.y && target.point.y < f.y + notch.h);
    }
  }
});

test('S01: Help edge is immediately inside the boundary and catches a final-two-point swallow', async () => {
  const { driver, w } = fixture();
  const edge = await driver.locate(w, "the right-hand edge of Chrome's Help menu");
  const right = help.frame.x + help.frame.w;
  assert.ok(edge.point.x < right && edge.point.x >= right - 1, 'edge click must be at most one point inside');
  const swallowed = (p) => p.x >= right - 2 && p.x < right;
  assert.equal(swallowed(edge.point), true, 'a dead zone in the final two points escapes the edge example');
  const centre = await driver.locate(w, helpName);
  assert.equal(centre.point.x, help.frame.x + help.frame.w / 2);
  assert.equal(swallowed(centre.point), false, 'the centre example must remain distinct');
});

test('M14: setup places the existing Chrome handle.browser on the built-in screen', async () => {
  const calls = [];
  let frame = { x: -900, y: 100, w: 800, h: 600 };
  const handle = { pid: 20, browser: {
    pages: async () => [{ targetId: 'fixture-tab' }],
    cdp: { send: async (method, args) => {
      calls.push({ method, args });
      if (method === 'Browser.getWindowForTarget') return { windowId: 41 };
      if (args.bounds.width) frame = { x: args.bounds.left, y: args.bounds.top, w: args.bounds.width, h: args.bounds.height };
      return {};
    } },
  } };
  const driver = load('closed-menus.js', {
    './fixture-preflight': { assertFixtureSession() {} }, './procs': {},
    './harness': { builtIn: async () => screen, captureIndicatorGone: async () => true, activate: async (pid) => assert.equal(pid, handle.pid),
      frontmost: async () => handle, windows: async () => [{ frame }] },
    './island': { until: async (pred) => assert.ok(await pred()) }, './chrome': { launch: async () => handle },
    './login': { prepare: async () => {} }, './scenes': { plainNotch: async () => calls.push('plain') },
    './cleanup': {}, './paths': {},
  });
  const w = {};
  await assert.doesNotReject(driver.prepare(w));
  assert.equal(w.chrome, handle);
  assert.equal(calls[0].args.targetId, 'fixture-tab');
  assert.equal(calls[1].args.windowId, 41);
  assert.equal(calls[1].args.bounds.windowState, 'normal');
  assert.ok(frame.x >= 0 && frame.x + frame.w <= screen.frame.w && frame.y > notch.h);
  assert.equal(calls[3], 'plain');
});

test('B2: run-7 Wi-Fi AXSystemDialog with wifi-header is the clicked pane', () => {
  const { driver } = fixture();
  const after = require('./fixtures/wifi-pane-run-7.json');
  const item = { ...after.elements[0], owner: 'Control Center', pid: 30 };
  const target = { kind: 'wifi', item, point: { x: 1380, y: 17 } };
  assert.equal(driver.opened(target, bare(item), after), true);
  const generic = structuredClone(after);
  generic.windows[0].elements = generic.windows[0].elements.filter((e) => e.identifier !== 'wifi-header');
  generic.windows[0].elements.push({ role: 'AXButton', description: 'Wi-Fi', identifier: 'wifi-tile' });
  assert.equal(driver.opened(target, bare(item), generic), false);
});

test('B3: live status width and label changes keep the same identified item', () => {
  const { driver } = fixture();
  const item = { ...statusItem, identifier: 'meter-status', description: '12%', frame: { x: 950, y: 0, w: 80, h: 33 } };
  const target = { kind: 'status', item, point: { x: 990, y: 16 } };
  const top = { ...item, description: '100%', frame: { ...item.frame, w: 86 } };
  const menu = { role: 'AXMenu', depth: 1, frame: { x: 950, y: 33, w: 200, h: 100 } };
  const after = { elements: [top, menu], windows: [] };
  assert.equal(driver.opened(target, bare(top), after), true);
  for (const wrong of [{ ...top, identifier: 'other-status' }, { ...top, role: 'AXButton' },
    { ...top, frame: { ...top.frame, x: 1036 } }]) {
    assert.equal(driver.opened(target, bare(wrong), { ...after, elements: [wrong, menu] }), false);
  }
});

test('B3: identifier-free Meter labels can update while its own anchored pane opens', () => {
  const { driver } = fixture();
  // FU live row: Meter exposes no AXIdentifier, a numeric title, and an
  // anchored AXSystemDialog named Meter. Its title is not the item's label.
  const item = { role: 'AXMenuBarItem', subrole: 'AXMenuExtra', owner: 'Meter', pid: 40,
    title: 'CPU  12%  GPU   2%  RAM  57%', frame: { x: 982, y: 5, w: 286, h: 24 } };
  const target = { kind: 'status', item, point: { x: 1125, y: 17 } };
  const top = { ...item, title: 'CPU  27%  GPU   2%  RAM  57%', frame: { ...item.frame, w: 296 } };
  const menu = { title: 'Meter', frame: { x: 983, y: 32, w: 384, h: 444 }, elements: [
    { role: 'AXWindow', subrole: 'AXSystemDialog', title: 'Meter' },
  ] };
  assert.equal(driver.opened(target, bare(item), { ...bare(top), windows: [menu] }), true);
  for (const wrong of [{ ...menu, title: 'Print', elements: [] }, { ...menu, frame: { ...menu.frame, x: -400 } }]) {
    assert.equal(driver.opened(target, bare(item), { ...bare(top), windows: [wrong] }), false);
  }
  const different = { ...top, frame: { ...top.frame, x: 1300 } };
  assert.equal(driver.opened(target, bare(item), { ...bare(different), windows: [menu] }), false);
});
