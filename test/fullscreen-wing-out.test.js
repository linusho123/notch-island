'use strict';
// P3 fix M1: a wing already out when the app in front goes fullscreen folds
// at once (D125, "a fullscreen movie is never interrupted"). The scenario
// lives in test/fixtures (the contract's own fullscreen scenario starts with
// the movie already fullscreen). A UI run: only through scripts/when-idle.sh.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { runFeatures } = require('gherkin-node-test');
const harness = require('./support/harness');
const island = require('./support/island');
const procs = require('./support/procs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wingOut = (v) => Boolean(v.wing && v.wing.art);
const root = path.join(__dirname, '..');

runFeatures(path.join(__dirname, 'fixtures', 'fullscreen-wing-out'), {
  'new-song-notice': (reg) => {
    // The contract's own steps this fixture uses (the runner refuses unused ones).
    const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'fullscreen-wing-out', 'new-song-notice.feature'), 'utf8');
    const used = fixture.split('\n').map((l) => l.trim().replace(/^(Given|When|Then|And) /, ''));
    require('./steps/new-song-notice.steps')(new Proxy(reg, {
      get: (target, key) => (key === 'define'
        ? (re, fn) => { if (used.some((u) => re.test(u))) target.define(re, fn); }
        : target[key]),
    }));
    reg.define(/^IINA is in front playing a movie in a window$/, async (w) => {
      const movie = path.join(root, 'build', 'test-media', 'test-movie.mov');
      if (!fs.existsSync(movie)) await harness.makeMovie(movie, 180);
      const iina = procs.start('IINA', '/Applications/IINA.app/Contents/MacOS/IINA', [movie]);
      w.defer(() => procs.stop(iina));
      w.windowedIina = iina;
      await island.until(async () => (await harness.windows(iina.pid).catch(() => [])).some((x) => x.frame && x.frame.w > 300), 15000, 'IINA never showed the movie');
      await harness.activate(iina.pid);
      await sleep(500);
    });
    reg.define(/^the wing comes out$/, async (w) => {
      assert.equal((await harness.frontmost()).pid, w.windowedIina.pid, 'IINA is not in front');
      await island.waitFor(w.island.pid, wingOut, Math.max(500, w.started + 1500 - Date.now()), 'no wing by 1.5 s (with IINA in front)');
    });
    reg.define(/^IINA goes fullscreen$/, async (w) => {
      await harness.fullscreen(w.windowedIina.pid);
      await island.until(async () => (await harness.windows(w.windowedIina.pid)).some((x) => x.fullScreen), 10000, 'IINA did not go fullscreen');
      w.fullscreenAt = Date.now();
    });
    reg.define(/^the wing is gone once IINA is fullscreen$/, async (w) => {
      const seen = [];
      while (Date.now() < w.started + 3700) {
        seen.push({ t: Date.now() - w.started, wing: wingOut(await island.look(w.island.pid)) });
        await sleep(80);
      }
      const since = w.fullscreenAt - w.started;
      const bad = seen.find((s) => s.wing && s.t > since + 2000);
      assert.ok(!bad, `the wing is still out at +${bad && bad.t} ms, ${bad && bad.t - since} ms after IINA went fullscreen`);
    });
  },
}, {});
