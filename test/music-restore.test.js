'use strict';
// The harness puts Music back as the visionary had it: whether it was
// running, its player state, the current track and position, shuffle and
// repeat; also after a killed run (the saved state lives in a file, and the
// next run's first touch restores from it). A fake Music driver stands in.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createKeeper } = require('./support/music-keeper');

function fakeMusic(initial) {
  const m = { running: initial.running, shuffle: initial.shuffle ?? 'false', repeat: initial.repeat ?? 'off',
    state: initial.state ?? 'stopped', track: initial.track ?? null, position: initial.position ?? 0, log: [] };
  const driver = {
    isRunning: () => m.running,
    // Reading launches Music, as `tell application "Music"` does.
    snapshot: () => {
      m.running = true;
      return { shuffle: m.shuffle, repeat: m.repeat, state: m.state, track: m.track, position: m.position };
    },
    apply: (s) => {
      m.log.push(['apply', s.state, s.track, s.position]);
      m.shuffle = s.shuffle; m.repeat = s.repeat; m.state = s.state; m.track = s.track; m.position = s.position;
    },
    quit: () => { m.log.push(['quit']); m.running = false; },
  };
  return { m, driver };
}

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'music-keeper-')), 'state.json');

test('Music was playing a song of the visionary: state, track, position, shuffle and repeat come back, Music stays', () => {
  const { m, driver } = fakeMusic({ running: true, state: 'playing', track: 'ABC123', position: 91.5, shuffle: 'true', repeat: 'all' });
  const keeper = createKeeper({ driver, file: tmpFile() });
  keeper.save();
  // the suite runs: test playlist, queue order
  m.shuffle = 'false'; m.repeat = 'off'; m.state = 'paused'; m.track = 'TEST1'; m.position = 5;
  keeper.restore();
  assert.deepEqual([m.running, m.state, m.track, m.position, m.shuffle, m.repeat], [true, 'playing', 'ABC123', 91.5, 'true', 'all']);
  assert.ok(!m.log.some((e) => e[0] === 'quit'));
});

test('Music was paused: it comes back paused on the same track', () => {
  const { m, driver } = fakeMusic({ running: true, state: 'paused', track: 'ABC123', position: 40 });
  const keeper = createKeeper({ driver, file: tmpFile() });
  keeper.save();
  m.state = 'playing'; m.track = 'TEST2'; m.position = 1;
  keeper.restore();
  assert.deepEqual([m.state, m.track, m.position], ['paused', 'ABC123', 40]);
});

test('Music was not running: it is quit at the end', () => {
  const { m, driver } = fakeMusic({ running: false, shuffle: 'true', repeat: 'one' });
  const keeper = createKeeper({ driver, file: tmpFile() });
  keeper.save();
  assert.equal(m.running, true); // reading it started it
  m.shuffle = 'false'; m.repeat = 'off'; m.state = 'playing'; m.track = 'TEST1';
  keeper.restore();
  assert.equal(m.running, false);
  assert.equal(m.log.at(-1)[0], 'quit');
  assert.deepEqual([m.shuffle, m.repeat], ['true', 'one']); // put back before quitting
});

test('saving twice keeps the first state; restoring twice acts once', () => {
  const { m, driver } = fakeMusic({ running: true, state: 'playing', track: 'ABC123', position: 10 });
  const keeper = createKeeper({ driver, file: tmpFile() });
  keeper.save();
  m.track = 'TEST1';
  keeper.save();
  keeper.restore();
  keeper.restore();
  assert.equal(m.track, 'ABC123');
  assert.equal(m.log.filter((e) => e[0] === 'apply').length, 1);
});

test('after a killed run the next run restores the stale state before saving its own', () => {
  const file = tmpFile();
  const first = fakeMusic({ running: false, shuffle: 'true', repeat: 'all' });
  createKeeper({ driver: first.driver, file }).save();
  first.m.shuffle = 'false'; first.m.state = 'playing'; first.m.track = 'TEST1';
  // SIGKILL: no restore ran, the file is all that is left. A new process:
  assert.ok(fs.existsSync(file), 'the saved state was not persisted');
  const second = new (class {})();
  const next = createKeeper({ driver: first.driver, file });
  next.sweep();
  assert.equal(first.m.running, false, 'the sweep did not quit the Music this run started');
  assert.equal(first.m.shuffle, 'true');
  assert.ok(!fs.existsSync(file), 'the stale file was left behind');
});

test('a normal restore removes the state file', () => {
  const file = tmpFile();
  const { driver } = fakeMusic({ running: true, state: 'stopped' });
  const keeper = createKeeper({ driver, file });
  keeper.save();
  assert.ok(fs.existsSync(file));
  keeper.restore();
  assert.ok(!fs.existsSync(file));
});
