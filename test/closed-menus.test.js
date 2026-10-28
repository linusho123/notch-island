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
    builtIn: async () => builtIn, menubar: async () => menus, extras: async () => extras,
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
