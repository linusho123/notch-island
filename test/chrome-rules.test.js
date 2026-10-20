'use strict';
// The companion extension's rules (app/chrome-extension/rules.js): only
// youtube.com and soundcloud.com count, only while playing sound (D88, D107);
// a muted preview counts from the moment it is unmuted (D88, D122); the
// source line's site name (D119); a closed tab reopens where it left off
// (D117). The scenarios that drive a real test Chrome stay unbound until the
// visionary rules on launching it (see the P2 report).
const test = require('node:test');
const assert = require('node:assert/strict');
const { siteOf, counts, reopenURL } = require('../app/chrome-extension/rules');

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
