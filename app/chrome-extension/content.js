// Runs in youtube.com and soundcloud.com pages: reports the page's own media
// element (the one that plays) to the extension, on its events only, and
// carries the island's commands to it.
(function () {
  'use strict';

  function mainMedia() {
    const all = [...document.querySelectorAll('video, audio')];
    return all.find((m) => !m.paused && !m.ended) || all.find((m) => m.currentTime > 0) || all[0] || null;
  }

  function title() {
    const meta = navigator.mediaSession && navigator.mediaSession.metadata;
    if (meta && meta.title) return meta.title;
    return document.title.replace(/ - YouTube$/, '').replace(/ \| .*SoundCloud.*$/, '').trim();
  }

  function artist() {
    const meta = navigator.mediaSession && navigator.mediaSession.metadata;
    return (meta && meta.artist) || null;
  }

  function report() {
    const m = mainMedia();
    chrome.runtime.sendMessage({
      type: 'media',
      media: m && {
        title: title(), artist: artist(), paused: m.paused, ended: m.ended, muted: m.muted,
        volume: m.volume, position: m.currentTime, duration: Number.isFinite(m.duration) ? m.duration : null,
        at: Date.now(),
      },
    }).catch(() => {});
  }

  for (const e of ['play', 'playing', 'pause', 'seeked', 'volumechange', 'loadedmetadata', 'ended', 'ratechange']) {
    document.addEventListener(e, report, true);
  }
  new MutationObserver(report).observe(document.querySelector('title') || document.head, { childList: true, subtree: true, characterData: true });

  function clickFirst(selectors) {
    for (const s of selectors) {
      const el = document.querySelector(s);
      if (el) { el.click(); return true; }
    }
    return false;
  }

  chrome.runtime.onMessage.addListener((msg) => {
    const m = mainMedia();
    if (msg.type !== 'command') return;
    switch (msg.command) {
      case 'play': if (m) m.play(); break;
      case 'pause': if (m) m.pause(); break;
      case 'seek': if (m) m.currentTime = Math.max(0, Number(msg.position) || 0); break;
      case 'next': clickFirst(['.ytp-next-button', '.skipControl__next']); break;
      case 'previous':
        if (!clickFirst(['.ytp-prev-button', '.skipControl__previous']) && m) m.currentTime = 0;
        break;
      case 'report': report(); break;
      default: break;
    }
  });

  report();
})();
