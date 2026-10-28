'use strict';
// Screen-free: register real definitions with inert UI dependencies.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function bindings(overrides = {}) {
  const file = path.join(__dirname, 'steps/around-the-clock-capture.steps.js');
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, require: (name) => {
    if (name in overrides) return overrides[name];
    if (name.startsWith('node:')) return require(name);
    return name === './music-panel.steps' ? { helpers: {} } : {};
  } }, { filename: file });
  const rows = [];
  module.exports({ define: (pattern, fn) => rows.push({ pattern, fn }) });
  return (text) => {
    const matches = rows.filter((r) => r.pattern.test(text));
    assert.equal(matches.length, 1, `binding missing or ambiguous: ${text}`);
    const { pattern, fn } = matches[0];
    assert.equal(fn.length - 1, pattern.exec(text).slice(1).length, `binding drops sentence parameters: ${text}`);
    return (w) => fn(w, ...pattern.exec(text).slice(1));
  };
}

test('M07: recording click, wing playback and native arrival are all bound', () => {
  const find = bindings();
  for (const step of [
    'the visionary is recording the screen', 'the visionary clicks the notch',
    'the visionary sees the island open at once on the music page',
    'the island is showing the wing left of the notch for "Champagne Supernova" on the visionary\'s screen',
    'the visionary checks the played-back recording',
    'the visionary sees nothing of the island in the played-back recording',
    'the visionary sees nothing of the island in the played-back recording, only the plain menu bar around the notch',
    'the visionary is recording the screen and the island is closed to the plain notch',
    'the visionary stops the recording and it saves as "Screen Recording 2026-10-18 at 10.16.40.mov"',
    'the visionary sees "Screen Recording 2026-10-18 at 10.16.40.mov" on the shelf page',
  ]) find(step);
});

test('M09: the seeded raw note renders the exact single-prefix AX title', async () => {
  let seed;
  const stop = new Error('fixture recorded');
  const find = bindings({
    '../support/capture-share': { arm: async () => {} },
    'node:fs': { readFileSync: () => '{}', writeFileSync: (_, value) => { seed = JSON.parse(value).seedShelf[0].text; throw stop; } },
  });
  await assert.rejects(find('the island is showing the shelf page, holding the note "✎ idea: notch app shows lyrics" on the visionary\'s screen')({ login: { input: 'inert' } }), stop);
  assert.equal(`✎ ${seed}`, '✎ idea: notch app shows lyrics');
});

test('M06: each named service survives the Given binding', async () => {
  for (const service of ['Zoom', 'Meet']) {
    let identity;
    const stop = new Error('before UI');
    const find = bindings({ '../support/capture-share': { start: async (_, name) => { identity = name; throw stop; } } });
    await assert.rejects(find(`the visionary is sharing the screen in ${service}`)({}), stop);
    assert.equal(identity, service);
  }
});
