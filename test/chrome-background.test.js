'use strict';
// The companion extension's service worker (app/chrome-extension/background.js)
// run against stubbed Chrome APIs: what it tells the island about a counting
// tab must carry the page's url, so the last song can be reopened from it
// when its tab is gone (P2 fix M2, D117).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DIR = path.join(__dirname, '..', 'app', 'chrome-extension');

function load() {
  const sent = [];
  const listeners = {};
  const port = {
    onMessage: { addListener() {} },
    onDisconnect: { addListener() {} },
    postMessage: (m) => sent.push(m),
  };
  const evt = (name) => ({ addListener: (f) => { listeners[name] = f; } });
  const tab = { id: 7, url: 'https://www.youtube.com/watch?v=l4', windowId: 1, mutedInfo: { muted: false } };
  const chrome = {
    runtime: { connectNative: () => port, onMessage: evt('runtimeMessage') },
    tabs: { get: async () => tab, onUpdated: evt('updated'), onRemoved: evt('removed'), query: async () => [tab] },
    windows: {},
  };
  const sandbox = { chrome, setTimeout, console, URL };
  sandbox.self = sandbox;
  sandbox.importScripts = (f) => vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), sandbox);
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DIR, 'background.js'), 'utf8'), sandbox);
  return { sent, listeners, tab };
}

test('a counting tab is reported with its page url', async () => {
  const { sent, listeners } = load();
  const media = { title: 'Lecture 4', artist: null, paused: false, muted: false, volume: 1, position: 12, duration: 3000, at: Date.now() };
  listeners.runtimeMessage({ type: 'media', media }, { tab: { id: 7 } });
  await new Promise((r) => setTimeout(r, 50));
  const last = sent.filter((m) => m.tabs && m.tabs.length).pop();
  assert.ok(last, 'no tab was reported');
  assert.equal(last.tabs[0].url, 'https://www.youtube.com/watch?v=l4');
});

test('while the island is away the extension backs off its reconnects', () => {
  const delays = [];
  const listeners = [];
  const port = { onMessage: { addListener() {} }, onDisconnect: { addListener: (f) => listeners.push(f) }, postMessage() {} };
  const evt = () => ({ addListener() {} });
  const chrome = {
    runtime: { connectNative: () => { const p = { ...port }; return p; }, onMessage: evt() },
    tabs: { get: async () => ({}), onUpdated: evt(), onRemoved: evt(), query: async () => [] },
    windows: {},
  };
  let pending = null;
  const sandbox = {
    chrome, console, URL, Date,
    setTimeout: (fn, ms) => { delays.push(ms); pending = fn; return 1; },
  };
  sandbox.self = sandbox;
  sandbox.importScripts = (f) => vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), sandbox);
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DIR, 'background.js'), 'utf8'), sandbox);
  // The host ends at once, again and again (the island is quit).
  for (let i = 0; i < 6; i++) {
    listeners[listeners.length - 1]();
    pending();
  }
  assert.ok(delays.length >= 6);
  assert.ok(delays.every((d, i) => i === 0 || d >= delays[i - 1]), `delays ${delays}`);
  assert.ok(delays[5] > delays[0] * 2, `no back-off: ${delays}`);
  assert.ok(delays.every((d) => d <= 300000), `a reconnect waits too long: ${delays}`);
});

test('when the service worker starts it asks the open youtube.com and soundcloud.com tabs to report again', async () => {
  const asked = [];
  const evt = () => ({ addListener() {} });
  const port = { onMessage: { addListener() {} }, onDisconnect: { addListener() {} }, postMessage() {} };
  const chrome = {
    runtime: { connectNative: () => port, onMessage: evt() },
    tabs: {
      get: async () => ({}), onUpdated: evt(), onRemoved: evt(),
      query: async () => [
        { id: 3, url: 'https://www.youtube.com/watch?v=x' },
        { id: 4, url: 'https://news.example.com/' },
        { id: 5, url: 'https://soundcloud.com/a/b' },
      ],
      sendMessage: async (id, msg) => { asked.push([id, msg.command]); },
    },
    windows: {},
  };
  const sandbox = { chrome, setTimeout, console, URL, Date };
  sandbox.self = sandbox;
  sandbox.importScripts = (f) => vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), sandbox);
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DIR, 'background.js'), 'utf8'), sandbox);
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(asked, [[3, 'report'], [5, 'report']]);
});

test('when the host ends, the extension reads chrome.runtime.lastError so Chrome logs no unchecked error', () => {
  const listeners = [];
  let read = 0;
  const port = { onMessage: { addListener() {} }, onDisconnect: { addListener: (f) => listeners.push(f) }, postMessage() {} };
  const evt = () => ({ addListener() {} });
  const runtime = { connectNative: () => port, onMessage: evt() };
  // Chrome sets lastError while the onDisconnect listener runs; a listener
  // that never reads it makes Chrome log "Unchecked runtime.lastError:
  // Native host has exited".
  Object.defineProperty(runtime, 'lastError', { get: () => { read += 1; return { message: 'Native host has exited.' }; } });
  const chrome = {
    runtime,
    tabs: { get: async () => ({}), onUpdated: evt(), onRemoved: evt(), query: async () => [] },
    windows: {},
  };
  const sandbox = { chrome, console, URL, Date, setTimeout: () => 1 };
  sandbox.self = sandbox;
  sandbox.importScripts = (f) => vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), sandbox);
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DIR, 'background.js'), 'utf8'), sandbox);
  assert.equal(read, 0);
  listeners[listeners.length - 1]();
  assert.ok(read >= 1, 'onDisconnect never read chrome.runtime.lastError');
});

// MV3: Chrome suspends the service worker after ~30 s idle, and a setTimeout
// pending then is lost. A reconnect must not rest on one (P3 fix: the
// extension did not reconnect after the island restarted).
function loadSuspendable() {
  let now = 1000000;
  const ports = [];
  const disconnects = [];
  const listeners = {};
  const evt = (name) => ({ addListener: (f) => { listeners[name] = f; } });
  const created = [];
  const chrome = {
    runtime: {
      connectNative: () => {
        const p = { onMessage: { addListener() {} }, onDisconnect: { addListener: (f) => disconnects.push(f) }, postMessage() {} };
        ports.push(p);
        return p;
      },
      onMessage: evt('runtimeMessage'),
    },
    tabs: { get: async () => ({}), onUpdated: evt('updated'), onRemoved: evt('removed'), query: async () => [] },
    alarms: { create: (name, info) => { created.push([name, info]); }, onAlarm: evt('alarm') },
    windows: {},
  };
  const sandbox = { chrome, console, URL, Date: { now: () => now }, setTimeout: () => 1 }; // timers are lost
  sandbox.self = sandbox;
  sandbox.importScripts = (f) => vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), sandbox);
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DIR, 'background.js'), 'utf8'), sandbox);
  return { ports, disconnects, listeners, created, advance: (ms) => { now += ms; } };
}

test('a lost reconnect timer does not strand the extension: an alarm reconnects it', () => {
  const w = loadSuspendable();
  assert.equal(w.ports.length, 1);
  assert.ok(w.created.some(([, info]) => info && info.periodInMinutes && info.periodInMinutes <= 1), 'no repeating alarm is set');
  w.advance(60000);
  w.disconnects[0](); // the island restarted; the setTimeout dies with the worker
  w.advance(40000);
  assert.ok(w.listeners.alarm, 'no alarm listener');
  w.listeners.alarm({ name: 'reconnect' });
  assert.equal(w.ports.length, 2, 'the alarm did not reconnect');
  w.listeners.alarm({ name: 'reconnect' });
  assert.equal(w.ports.length, 2, 'an alarm reconnected while connected');
});

test('a tab event reconnects a disconnected extension, at most once every 5 s', () => {
  const w = loadSuspendable();
  w.advance(60000);
  w.disconnects[0]();
  w.advance(6000);
  w.listeners.updated(7, { audible: true });
  assert.equal(w.ports.length, 2, 'a tab event did not reconnect');
  w.disconnects[1]();
  w.advance(1000);
  w.listeners.updated(7, { audible: true });
  assert.equal(w.ports.length, 2, 'reconnected within 5 s of the last try');
});

// Bug 2026-10-30: with no YouTube tab open, the card kept showing a video, and
// covered paused music with it. The island hands a reconnecting Chrome's tabs
// to the new connection and closes the old one; the old port's disconnect
// then cleared the live port and started another reconnect, so the host was
// replaced every 1-3 s and the tab left and came back each time.
test('a reconnect timer that fires while connected opens no second connection', () => {
  const ports = [];
  const disconnects = [];
  const timers = [];
  let updated = null;
  const evt = () => ({ addListener() {} });
  const chrome = {
    runtime: {
      connectNative: () => {
        const p = { onMessage: { addListener() {} }, onDisconnect: { addListener: (f) => disconnects.push(f) }, postMessage() {} };
        ports.push(p);
        return p;
      },
      onMessage: evt(),
    },
    tabs: { get: async () => ({}), onUpdated: { addListener: (f) => { updated = f; } }, onRemoved: evt(), query: async () => [] },
    windows: {},
  };
  let now = 1000000;
  const sandbox = { chrome, console, URL, Date: { now: () => now }, setTimeout: (fn) => { timers.push(fn); return timers.length; } };
  sandbox.self = sandbox;
  sandbox.importScripts = (f) => vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), sandbox);
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DIR, 'background.js'), 'utf8'), sandbox);
  disconnects[0](); // the island restarted: a reconnect is pending
  now += 6000;
  updated(7, { audible: true }); // a tab event reconnects first
  assert.equal(ports.length, 2);
  // The pending timer fires, and the old port's handler runs late: still one.
  for (const t of timers.splice(0)) t();
  disconnects[0]();
  for (const t of timers.splice(0)) t();
  assert.equal(ports.length, 2, 'a stale disconnect or timer opened another connection');
});

function loadTabs({ live }) {
  const sent = [];
  const listeners = {};
  const evt = (name) => ({ addListener: (f) => { listeners[name] = f; } });
  const port = { onMessage: { addListener() {} }, onDisconnect: { addListener() {} }, postMessage: (m) => sent.push(m) };
  const tabOf = (id) => ({ id, url: `https://www.youtube.com/watch?v=t${id}`, windowId: 1, mutedInfo: { muted: false } });
  const chrome = {
    runtime: { connectNative: () => port, onMessage: evt('runtimeMessage') },
    tabs: {
      get: async (id) => { if (!live.has(id)) throw new Error(`No tab with id: ${id}.`); return tabOf(id); },
      query: async () => [...live].map(tabOf),
      sendMessage: async () => {},
      onUpdated: evt('updated'), onRemoved: evt('removed'), onReplaced: evt('replaced'),
    },
    alarms: { create() {}, onAlarm: evt('alarm') },
    windows: {},
  };
  const sandbox = { chrome, setTimeout, console, URL, Date };
  sandbox.self = sandbox;
  sandbox.importScripts = (f) => vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), sandbox);
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DIR, 'background.js'), 'utf8'), sandbox);
  const media = { title: 'Destiny', artist: null, paused: false, muted: false, volume: 1, position: 3, duration: 1700, at: Date.now() };
  const lastTabs = () => Array.from(sent.filter((m) => m.type === 'tabs').pop().tabs, (t) => t.tab);
  return { listeners, media, lastTabs };
}
const settle = () => new Promise((r) => setTimeout(r, 30));

test('a tab Chrome swapped for another (prerender, discard) stops counting', async () => {
  const live = new Set([1450318445]);
  const w = loadTabs({ live });
  w.listeners.runtimeMessage({ type: 'media', media: w.media }, { tab: { id: 1450318445 } });
  await settle();
  assert.deepEqual(w.lastTabs(), [1450318445]);
  live.delete(1450318445);
  live.add(12);
  w.listeners.replaced(12, 1450318445);
  await settle();
  assert.deepEqual(w.lastTabs(), [], 'the replaced tab is still reported');
});

test('a tab that is gone without a removed event is dropped on the next alarm', async () => {
  const live = new Set([9]);
  const w = loadTabs({ live });
  w.listeners.runtimeMessage({ type: 'media', media: { ...w.media, paused: true } }, { tab: { id: 9 } });
  w.listeners.runtimeMessage({ type: 'media', media: w.media }, { tab: { id: 9 } });
  await settle();
  assert.deepEqual(w.lastTabs(), [9]);
  live.delete(9); // closed while Chrome sent no onRemoved
  w.listeners.alarm({ name: 'reconnect' });
  await settle();
  assert.deepEqual(w.lastTabs(), [], 'a tab that no longer exists is still reported');
});

