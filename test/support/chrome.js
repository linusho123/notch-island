'use strict';
// A test Chrome: its own instance with a scratch profile, never the
// visionary's own Chrome or profile. It is driven and read over the DevTools
// protocol (remote debugging on a pipe): the far side of a Chrome tab is the
// page's own media element (`paused`, `currentTime`, `muted`) and Chrome's
// own idea of which tab shows, never the companion extension. With
// `companion: true` it loads the companion extension unpacked, registers the
// island's native-messaging host in the scratch profile only, and maps
// youtube.com, soundcloud.com, a news site and Gmail onto the stand-in server.
const path = require('node:path');
const fs = require('node:fs');
const procs = require('./procs');
const harness = require('./harness');
const standIns = require('./stand-ins');
const island = require('./island');
const { scratch } = require('./sandbox');
const { root, testBinary } = require('./paths');

const BINARY = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const EXTENSION = path.join(root, 'app', 'chrome-extension');
const EXTENSION_ID = fs.readFileSync(path.join(EXTENSION, 'extension-id.txt'), 'utf8').trim();
const HOST_NAME = 'local.notch_island';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(pred, ms, message) {
  const end = Date.now() + ms;
  let last;
  for (;;) {
    last = await pred().catch(() => null);
    if (last) return last;
    if (Date.now() > end) throw new Error(message);
    await sleep(100);
  }
}

/** The DevTools protocol over Chrome's pipe: NUL-separated JSON messages. */
class CDP {
  constructor(child) {
    this.out = child.stdio[3];
    this.next = 1;
    this.waiting = new Map();
    let buf = '';
    child.stdio[4].on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let i;
      while ((i = buf.indexOf('\0')) >= 0) {
        const msg = JSON.parse(buf.slice(0, i));
        buf = buf.slice(i + 1);
        const w = msg.id && this.waiting.get(msg.id);
        if (w) {
          this.waiting.delete(msg.id);
          if (msg.error) w.reject(new Error(`${w.method}: ${msg.error.message}`));
          else w.resolve(msg.result);
        }
      }
    });
    child.stdio[4].on('error', () => {});
    this.out.on('error', () => {});
  }

  send(method, params = {}, sessionId) {
    const id = this.next++;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject, method });
      this.out.write(`${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`);
      setTimeout(() => {
        if (this.waiting.delete(id)) reject(new Error(`${method}: no answer from the test Chrome`));
      }, 15000);
    });
  }
}

/** One tab of the test Chrome, read and driven through the DevTools protocol. */
class Tab {
  constructor(browser, targetId, sessionId) {
    this.browser = browser;
    this.targetId = targetId;
    this.sessionId = sessionId;
  }

  async eval(expression) {
    const r = await this.browser.cdp.send('Runtime.evaluate',
      { expression, returnByValue: true, awaitPromise: true, userGesture: true }, this.sessionId);
    if (r.exceptionDetails) throw new Error(`in the tab: ${r.exceptionDetails.text}`);
    return r.result.value;
  }

  /** The page's own media element, as the page itself knows it. */
  media() {
    return this.eval(`(() => {
      const m = document.querySelector('video, audio');
      return m && { paused: m.paused, ended: m.ended, muted: m.muted, volume: m.volume,
        currentTime: m.currentTime, duration: m.duration, title: document.title,
        visibility: document.visibilityState, url: location.href };
    })()`);
  }

  /** Whether Chrome shows this tab: its page is visible. */
  async shown() {
    return (await this.eval('document.visibilityState')) === 'visible';
  }

  /** Wait until the tab's media element plays with sound, or as `pred` says. */
  async waitMedia(pred, ms, message) {
    let last;
    return until(async () => {
      last = await this.media();
      return last && pred(last) ? last : null;
    }, ms, message).catch((e) => {
      e.message += ` (the tab's media: ${JSON.stringify(last)})`;
      throw e;
    });
  }

  /** A real click on an element of the page, at its own place (a user gesture). */
  async click(selector) {
    const box = await this.eval(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    for (const type of ['mousePressed', 'mouseReleased']) {
      await this.browser.cdp.send('Input.dispatchMouseEvent',
        { type, x: box.x, y: box.y, button: 'left', clickCount: 1 }, this.sessionId);
    }
  }

  /** The visionary closes the tab. */
  close() {
    return this.browser.cdp.send('Target.closeTarget', { targetId: this.targetId });
  }
}

class Browser {
  constructor(handle, cdp) {
    this.handle = handle;
    this.pid = handle.pid;
    this.cdp = cdp;
  }

  /** Open `url` in a new tab in front, and attach to it. */
  async open(url) {
    const { targetId } = await this.cdp.send('Target.createTarget', { url });
    return this.attach(targetId);
  }

  async attach(targetId) {
    const { sessionId } = await this.cdp.send('Target.attachToTarget', { targetId, flatten: true });
    return new Tab(this, targetId, sessionId);
  }

  /** The tabs (pages) Chrome has open now. */
  async pages() {
    const { targetInfos } = await this.cdp.send('Target.getTargets');
    return targetInfos.filter((t) => t.type === 'page');
  }

  /** A tab whose page matches `pred` ({url, title}), attached; waits for it. */
  async find(pred, ms, message) {
    const t = await until(async () => (await this.pages()).find(pred), ms, message);
    return this.attach(t.targetId);
  }
}

/** The island's native-messaging host, registered in the scratch profile only. */
function registerHost(profile) {
  const dir = path.join(profile, 'NativeMessagingHosts');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${HOST_NAME}.json`), JSON.stringify({
    name: HOST_NAME,
    description: 'notch-island (test build)',
    path: testBinary,
    type: 'stdio',
    allowed_origins: [`chrome-extension://${EXTENSION_ID}/`],
  }));
}

/**
 * Start a test Chrome. With `companion`, the companion extension is loaded
 * and its host started by Chrome reaches the scenario's island (the host
 * finds it through the same test input as the island).
 */
async function launch(world, { companion = false } = {}) {
  const profile = path.join(scratch(world), 'chrome-profile');
  fs.mkdirSync(profile, { recursive: true });
  const args = [
    `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--disable-sync', '--remote-debugging-pipe',
  ];
  const disabled = ['Translate'];
  if (companion) {
    registerHost(profile);
    const port = await standIns.start();
    args.push(
      '--enable-unsafe-extension-debugging',
      `--host-resolver-rules=${standIns.resolverRules(port)}`,
      '--ignore-certificate-errors',
      '--autoplay-policy=no-user-gesture-required',
    );
    // The test Chrome stays off the system's shared now-playing channel and
    // the media keys, so it never takes them from the other players.
    disabled.push('HardwareMediaKeyHandling');
  }
  args.push(`--disable-features=${disabled.join(',')}`, 'about:blank');
  const handle = procs.start('test Chrome', BINARY, args, {
    stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'],
    // The host Chrome starts reads the scenario's test input, as the island does.
    env: { ...process.env, ...(companion ? { NOTCH_ISLAND_TEST_INPUT: island.inputFile(world) } : {}) },
  });
  world.defer(() => procs.stop(handle));
  const browser = new Browser(handle, new CDP(handle.child));
  const end = Date.now() + 20000;
  for (;;) {
    const items = await harness.menubar(handle.pid).catch(() => []);
    if ((await harness.windows(handle.pid).catch(() => [])).length && items.some((i) => i.title === 'Help')) break;
    if (Date.now() > end) throw new Error('the test Chrome never showed a window with a menu bar');
    await sleep(200);
  }
  if (companion) {
    const { id } = await browser.cdp.send('Extensions.loadUnpacked', { path: EXTENSION });
    if (id !== EXTENSION_ID) throw new Error(`the companion extension loaded as ${id}, not ${EXTENSION_ID}`);
  }
  return Object.assign(handle, { browser });
}

module.exports = { launch, EXTENSION_ID };

const SITE_PAGES = {
  'Lecture 4: Fourier Series': () => standIns.urls.watch('lecture-4'),
  'late night mix': () => standIns.urls.track('late-night-mix'),
};

/** The scenario's test Chrome with the companion extension (the island must be running). */
async function companion(world) {
  if (!world.chrome || world.chrome.exited) world.chrome = await launch(world, { companion: true });
  return world.chrome.browser;
}

/**
 * The visionary plays `title` in a new tab of the test Chrome (a youtube.com
 * video or a soundcloud.com track, from `at` seconds); resolves to the tab
 * once its own media element plays with sound.
 */
async function playInTab(world, title, at = 0) {
  const page = SITE_PAGES[title];
  if (!page) throw new Error(`no stand-in page plays ${title}`);
  const browser = await companion(world);
  let url = page();
  if (at > 0) url = url.includes('youtube') ? `${url}&t=${at}s` : `${url}#t=${Math.floor(at / 60)}:${String(at % 60).padStart(2, '0')}`;
  const tab = await browser.open(url);
  await tab.waitMedia((m) => !m.paused && !m.muted && m.currentTime >= at && m.currentTime < at + 30, 20000,
    `the test Chrome does not play ${title}`);
  return tab;
}

module.exports.companion = companion;
module.exports.playInTab = playInTab;
