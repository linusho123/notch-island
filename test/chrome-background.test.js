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
