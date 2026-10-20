// The companion extension's service worker (D126): it follows youtube.com and
// soundcloud.com tabs and tells the island, over native messaging, which of
// them count (rules.js) and what each plays; it carries the island's commands
// to the exact tab, focuses that tab (D26), and reopens a closed tab where it
// left off (D117).
importScripts('rules.js');
const { siteOf, counts, reopenURL } = self.notchIslandRules;

const HOST = 'local.notch_island';
const tabs = new Map(); // tab id -> { url, site, media, counted, windowId }
const closed = new Map(); // tab id -> { url, position, title }
let port = null;

function connect() {
  try {
    port = chrome.runtime.connectNative(HOST);
  } catch {
    port = null;
    return;
  }
  port.onMessage.addListener(onCommand);
  port.onDisconnect.addListener(() => {
    port = null;
    setTimeout(connect, 5000);
  });
  send();
}

function send() {
  if (!port) return;
  const list = [];
  for (const [id, t] of tabs) {
    if (!t.counted || !t.media) continue;
    list.push({
      tab: id, site: t.site, title: t.media.title, artist: t.media.artist, duration: t.media.duration,
      position: t.media.position, playing: !t.media.paused, at: t.media.at,
    });
  }
  const gone = [...closed].map(([id, c]) => ({ tab: id, ...c }));
  port.postMessage({ type: 'tabs', tabs: list, closed: gone });
}

async function update(tabId, patch) {
  const t = tabs.get(tabId) || {};
  Object.assign(t, patch);
  let tab = null;
  try { tab = await chrome.tabs.get(tabId); } catch { /* closed */ }
  t.url = (tab && tab.url) || t.url;
  t.site = siteOf(t.url || '');
  t.windowId = tab && tab.windowId;
  t.counted = counts({ url: t.url || '', tab, media: t.media, wasCounted: t.counted });
  if (!t.site) tabs.delete(tabId); else tabs.set(tabId, t);
  send();
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'media' && sender.tab) update(sender.tab.id, { media: msg.media });
});

chrome.tabs.onUpdated.addListener((tabId, change) => {
  if ('mutedInfo' in change || 'audible' in change || 'url' in change) update(tabId, {});
});

chrome.tabs.onRemoved.addListener((tabId) => {
  const t = tabs.get(tabId);
  tabs.delete(tabId);
  if (t && t.counted && t.media) {
    const position = t.media.paused ? t.media.position : t.media.position + (Date.now() - t.media.at) / 1000;
    closed.set(tabId, { url: t.url, position, title: t.media.title, site: t.site });
  }
  send();
});

async function onCommand(msg) {
  if (!msg || typeof msg !== 'object') return;
  const tabId = Number(msg.tab);
  if (msg.command === 'focus' && tabs.has(tabId)) {
    const tab = await chrome.tabs.update(tabId, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } else if (msg.command === 'reopen' && closed.has(tabId)) {
    const c = closed.get(tabId);
    closed.delete(tabId);
    const tab = await chrome.tabs.create({ url: reopenURL(c.url, msg.position ?? c.position), active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } else if (tabs.has(tabId) && ['play', 'pause', 'seek', 'next', 'previous'].includes(msg.command)) {
    chrome.tabs.sendMessage(tabId, { type: 'command', command: msg.command, position: msg.position }).catch(() => {});
  }
}

connect();
