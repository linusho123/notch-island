'use strict';
// The companion extension's rules (app/chrome-extension/rules.js): only
// youtube.com and soundcloud.com count, only while playing sound (D88, D107);
// a muted preview counts from the moment it is unmuted (D88, D122); the
// source line's site name (D119); a closed tab reopens where it left off
// (D117). The scenarios that drive a real test Chrome stay unbound until the
// visionary rules on launching it (see the P2 report).
const test = require('node:test');
const assert = require('node:assert/strict');
const { siteOf, counts, reopenURL, pickMedia, silentSong } = require('../app/chrome-extension/rules');

const sounding = { paused: false, muted: false, volume: 1, ended: false };

test('only youtube.com and soundcloud.com are followed, named by site', () => {
  assert.equal(siteOf('https://www.youtube.com/watch?v=x'), 'YouTube');
  assert.equal(siteOf('https://m.youtube.com/'), 'YouTube');
  assert.equal(siteOf('https://soundcloud.com/a/late-night-mix'), 'SoundCloud');
  assert.equal(siteOf('https://news.example.com/clip'), null);
  assert.equal(siteOf('https://notyoutube.com/'), null);
  assert.equal(siteOf('https://youtube.com.evil.example/'), null);
  assert.equal(siteOf('not a url'), null);
});

test('a lecture playing with sound counts; a news clip with sound never does', () => {
  assert.equal(counts({ url: 'https://www.youtube.com/watch?v=l4', media: sounding }), true);
  assert.equal(counts({ url: 'https://news.example.com/', media: sounding }), false);
});

test('a muted preview does not count until it is unmuted', () => {
  const url = 'https://www.youtube.com/';
  assert.equal(counts({ url, media: { ...sounding, muted: true } }), false);
  assert.equal(counts({ url, media: { ...sounding, volume: 0 } }), false);
  assert.equal(counts({ url, tab: { mutedInfo: { muted: true } }, media: sounding }), false);
  assert.equal(counts({ url, media: sounding }), true);
});

test('a counted tab stays while paused, so its play works; a never-sounding paused one does not join', () => {
  const url = 'https://www.youtube.com/watch?v=l4';
  assert.equal(counts({ url, media: { ...sounding, paused: true }, wasCounted: true }), true);
  assert.equal(counts({ url, media: { ...sounding, paused: true }, wasCounted: false }), false);
  assert.equal(counts({ url, media: { ...sounding, paused: true, ended: true }, wasCounted: true }), false);
});

test('a closed tab reopens at the spot it left', () => {
  assert.equal(reopenURL('https://www.youtube.com/watch?v=l4', 754.6), 'https://www.youtube.com/watch?v=l4&t=754s');
  assert.equal(reopenURL('https://soundcloud.com/a/late-night-mix', 754), 'https://soundcloud.com/a/late-night-mix#t=12:34');
});

test('the page\'s main player is the one that sounds, not a muted hover preview (P2 fix S7)', () => {
  const preview = { paused: false, ended: false, muted: true, volume: 1, currentTime: 2 };
  const main = { paused: false, ended: false, muted: false, volume: 1, currentTime: 90 };
  assert.equal(pickMedia([preview, main]), main);
  assert.equal(pickMedia([main, preview]), main);
  // None sounds: a playing one still beats a paused one, then one that has played.
  const paused = { paused: true, ended: false, muted: false, volume: 1, currentTime: 0 };
  const played = { paused: true, ended: false, muted: false, volume: 1, currentTime: 30 };
  assert.equal(pickMedia([paused, preview]), preview);
  assert.equal(pickMedia([paused, played]), played);
  assert.equal(pickMedia([paused]), paused);
  assert.equal(pickMedia([]), null);
});

test('a song that played unheard before its tab counted joined mid-song, until the next song (D122)', () => {
  const playing = { paused: false, title: 'Lecture 5' };
  // Playing muted, not counted: the song is playing unheard.
  assert.equal(silentSong({ counted: false, media: playing, silentTitle: null }), 'Lecture 5');
  // Unmuted, it counts: the same song carries on as joined mid-song.
  assert.equal(silentSong({ counted: true, media: playing, silentTitle: 'Lecture 5' }), 'Lecture 5');
  // The next song in the tab started heard.
  assert.equal(silentSong({ counted: true, media: { paused: false, title: 'Lecture 6' }, silentTitle: 'Lecture 5' }), null);
  // A tab that counts from its first sound never played unheard.
  assert.equal(silentSong({ counted: true, media: playing, silentTitle: null }), null);
  assert.equal(silentSong({ counted: false, media: null, silentTitle: 'Lecture 5' }), null);
});
