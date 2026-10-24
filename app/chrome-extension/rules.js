// The companion extension's rules, kept apart so node can test them.
// D88/D107: in Chrome only youtube.com and soundcloud.com count, and only
// while playing sound; a muted preview counts from the moment it is unmuted.
// D119: the source line names the site.
(function (root) {
  'use strict';

  const SITES = [
    { host: /(^|\.)youtube\.com$/, name: 'YouTube' },
    { host: /(^|\.)soundcloud\.com$/, name: 'SoundCloud' },
  ];

  /** The followed site of a page URL ("YouTube", "SoundCloud"), or null. */
  function siteOf(url) {
    let host;
    try { host = new URL(url).hostname; } catch { return null; }
    const site = SITES.find((s) => s.host.test(host));
    return site ? site.name : null;
  }

  /**
   * Whether a tab's media counts as a source now. `media` is what the page's
   * own media element says; `tab` what Chrome says of the tab. A tab joins
   * only while it plays sound; once in, it stays while paused, so its own
   * play button keeps working, until the tab closes or leaves the site.
   */
  function counts({ url, tab, media, wasCounted }) {
    if (!siteOf(url) || !media) return false;
    const sounding = !media.paused && !media.muted && media.volume > 0 && !(tab && tab.mutedInfo && tab.mutedInfo.muted);
    if (sounding) return true;
    return Boolean(wasCounted) && media.paused && !media.ended;
  }

  /** The place to reopen a closed tab at: the same page, from `position`. */
  function reopenURL(url, position) {
    const s = Math.max(0, Math.floor(position || 0));
    const u = new URL(url);
    if (siteOf(url) === 'YouTube') {
      u.searchParams.set('t', `${s}s`);
      return u.toString();
    }
    const m = Math.floor(s / 60);
    u.hash = `t=${m}:${String(s % 60).padStart(2, '0')}`;
    return u.toString();
  }

  /**
   * Which of a page's media elements is the one that plays. A muted hover
   * preview must not mask the real player: the one that sounds wins, then one
   * that plays, then one that has played, then the first.
   */
  function pickMedia(list) {
    const playing = (m) => !m.paused && !m.ended;
    const sounding = (m) => playing(m) && !m.muted && m.volume > 0;
    return list.find(sounding) || list.find(playing) || list.find((m) => m.currentTime > 0) || list[0] || null;
  }

  /**
   * The song a tab plays unheard, kept while it carries on once the tab
   * counts: a muted preview unmuted joins the card mid-song, and that is no
   * new song, so no wing pops (D122). Null once another song plays.
   */
  function silentSong({ counted, media, silentTitle }) {
    if (!media) return null;
    if (!counted) return media.paused ? silentTitle : media.title;
    return media.title === silentTitle ? silentTitle : null;
  }

  const api = { siteOf, counts, reopenURL, pickMedia, silentSong };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.notchIslandRules = api;
})(typeof self !== 'undefined' ? self : globalThis);
