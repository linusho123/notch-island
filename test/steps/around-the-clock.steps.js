'use strict';
// P6 V1 and V4. Q1 binds login to the system registry and a background launch;
// the visionary's one real logout/login check remains deferred to phase end.
const assert = require('node:assert/strict');
const login = require('../support/login');
const music = require('../support/music');
const island = require('../support/island');
const closedMenus = require('../support/closed-menus');
const { playing, pointerAway, rest, openOnMusicPage, RULED_REST_MS } = require('./music-panel.steps').helpers;

module.exports = (reg) => {
  reg.define(/^Chrome is in front and the island is closed to the plain notch$/, closedMenus.prepare);
  reg.define(/^the visionary clicks (Chrome's Help menu, the nearest menu left of the notch|the right-hand edge of Chrome's Help menu|the Wi-Fi icon|the leftmost status icon right of the notch)$/, closedMenus.click);
  reg.define(/^the visionary sees (Chrome's Help menu open|the Wi-Fi menu open|that status icon's own menu open, as before)$/, closedMenus.assertOpen);

  reg.define(/^the visionary has not opened the island themselves$/, async (w) => {
    await login.prepare(w);
  });

  reg.define(/^the visionary logs in to the Mac (after a restart for an update|after a restart following a crash|after logging out)$/, async (w, reason) => {
    await login.login(w, reason);
  });

  reg.define(/^the visionary rests the pointer on the notch while "Wonderwall" plays in Apple Music$/, async (w) => {
    await playing(w, 'Wonderwall', 30);
    const s = await music.state();
    assert.equal(s.state, 'playing');
    assert.equal(s.name, 'Wonderwall');
    await pointerAway();
    await rest(w, RULED_REST_MS);
    w.loginRested = true;
  });

  reg.define(/^the visionary sees the island open on the music page$/, async (w) => {
    assert.ok(w.loginRested, 'no login and music rest was observed');
    // D60 has no opening-latency measurement. P1's reader still checks the
    // card, music page and focus through Accessibility of this exact PID.
    await openOnMusicPage(w);
    await island.waitFor(w.island.pid, (v) => v.texts.includes('Wonderwall') && v.texts.includes('Oasis')
      && v.buttons.some((b) => b.label === 'Pause'), 2000, 'login app did not show the playing Wonderwall');
  });
};
