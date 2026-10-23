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
