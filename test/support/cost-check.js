'use strict';
// D79's screen-free checks. top POWER approximates Activity Monitor's Energy
// Impact (the P6 measurement ruling); neither column is watts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { root, releaseBinary, testBinary } = require('./paths');

const MARKERS = ['NOTCH_ISLAND_TEST_INPUT', '--test-unregister-login-and-exit'];
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function assertRelease(binary = releaseBinary) {
  const bytes = fs.readFileSync(binary);
  const control = fs.readFileSync(testBinary);
  for (const marker of MARKERS) {
    assert.ok(control.includes(marker), `test control lacks ${marker}`);
    assert.ok(!bytes.includes(marker), `measured binary carries test input: ${marker}`);
  }
  const dir = path.join(root, '.build', 'release-app', 'release');
  const description = JSON.parse(fs.readFileSync(path.join(dir, 'description.json')));
  const command = Object.values(description.swiftCommands).find((c) => c.moduleName === 'NotchIsland');
  assert.ok(command, 'missing release compiler command');
  const args = command.otherArguments;
  assert.ok(args.includes('-O') && args.includes('-whole-module-optimization'), 'measured build is not optimized release');
  assert.ok(!args.some((a) => /DEBUG|ISLAND_TEST_INPUT|^-Onone$/.test(a)), 'debug/test flags in measured build');
  // Bundling signs the executable again, changing its bytes. The linker's
  // Mach-O UUID survives signing and ties it to this release compiler output.
  const uuid = (file) => execFileSync('/usr/bin/dwarfdump', ['--uuid', file], { encoding: 'utf8' }).match(/UUID: ([0-9A-F-]+)/)?.[1];
  assert.ok(uuid(binary), 'measured executable has no linker UUID');
  assert.equal(uuid(binary), uuid(path.join(dir, 'NotchIsland')), 'measured binary differs from release compiler output');
  return { sha256: hash(binary), optimization: '-O -whole-module-optimization', absentMarkers: MARKERS };
}

function parseTop(raw) {
  const blocks = raw.split(/^Processes:/m).slice(1);
  assert.equal(blocks.length, 61, 'top must provide a baseline plus 60 one-second intervals');
  return blocks.map((block) => {
    const header = /^PID\s+PPID\s+%CPU\s+POWER\s+COMMAND[ \t]*$/m.exec(block);
    assert.ok(header, 'top lacks CPU/POWER columns');
    const rows = block.slice(header.index + header[0].length).split('\n').flatMap((line) => {
      const m = /^(\d+)\s+(\d+)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(.+?)\s*$/.exec(line);
      assert.ok(m || !/^\d/.test(line), `unreadable top process row: ${line}`);
      return m ? [{ pid: Number(m[1]), ppid: Number(m[2]), cpu: Number(m[3]), power: Number(m[4]), command: m[5] }] : [];
    });
    assert.ok(rows.length > 0, 'top supplied no process rows');
    return rows;
  });
}

function sumMinute(snapshots, pid, companionPids = []) {
  assert.equal(snapshots.length, 61);
  const known = new Set([pid, ...companionPids]);
  // Include all descendants, including short-lived AppleScript helpers. Keep
  // a discovered adapter even if reparented; never include the installed app.
  const processes = new Map();
  const samples = snapshots.map((rows) => {
    assert.ok(rows.some((r) => r.pid === pid), `measured island ${pid} vanished from top`);
    for (let changed = true; changed;) {
      changed = false;
      for (const r of rows) if (known.has(r.ppid) && !known.has(r.pid)) {
        known.add(r.pid); changed = true;
      }
    }
    const selected = rows.filter((r) => known.has(r.pid));
    for (const r of selected) processes.set(r.pid, { pid: r.pid, ppid: r.ppid, command: r.command });
    return { cpu: selected.reduce((s, r) => s + r.cpu, 0), power: selected.reduce((s, r) => s + r.power, 0) };
  }).slice(1); // top's first sample is since launch, not a one-second interval.
  return { samples, processes: [...processes.values()] };
}

function summary(samples, measure) {
  assert.equal(samples.length, 60, 'do not shorten the measured minute');
  const key = measure === 'CPU' ? 'cpu' : 'power';
  const ceiling = measure === 'CPU' ? 3 : 5;
  let streak = 0;
  let longestSpikeSeconds = 0;
  const values = samples.map((s) => {
    const v = s[key];
    assert.ok(Number.isFinite(v) && v >= 0, `invalid ${key} measurement`);
    streak = v > 3 * ceiling ? streak + 1 : 0;
    longestSpikeSeconds = Math.max(streak, longestSpikeSeconds);
    return v;
  });
  return { mean: values.reduce((s, v) => s + v, 0) / 60, max: Math.max(...values), ceiling,
    longestSpikeSeconds, finding: longestSpikeSeconds > 5 };
}

function assertCeiling(samples, measure, ceilingText) {
  assert.ok(['CPU', 'Energy Impact'].includes(measure));
  const result = summary(samples, measure);
  assert.equal(ceilingText, measure === 'CPU' ? '3%' : '5', 'D79 ceiling changed');
  assert.ok(result.mean <= result.ceiling,
    `${measure} mean ${result.mean.toFixed(3)} exceeds ${result.ceiling}; max ${result.max.toFixed(3)}`);
  return result;
}

module.exports = { assertRelease, parseTop, sumMinute, summary, assertCeiling, hash };
