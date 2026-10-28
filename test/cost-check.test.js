'use strict';
// Screen-free D79 measurement rules; UI rows separately use real top output.
const test = require('node:test');
const assert = require('node:assert/strict');
const check = require('./support/cost-check');
const { testBinary } = require('./support/paths');
const rows = (cpu = 1, power = 2) => Array.from({ length: 61 }, () => [
  { pid: 10, ppid: 1, cpu, power, command: 'NotchIsland' },
  { pid: 20, ppid: 10, cpu: 0.25, power: 0.5, command: 'perl' },
  { pid: 30, ppid: 999, cpu: 0.5, power: 0.5, command: 'NotchIsland' }, // own host, Chrome parent
  { pid: 40, ppid: 1, cpu: 100, power: 100, command: 'NotchIsland' }, // installed, excluded
]);

test('D79 requires optimized release provenance and test-marker positive controls', () => {
  assert.equal(check.assertRelease().optimization, '-O -whole-module-optimization');
  assert.throws(() => check.assertRelease(testBinary), /measured binary carries test input/);
});

test('D79 parses all 61 top snapshots, refusing missing samples or POWER', () => {
  const raw = rows().map((rs) => `Processes: 4 total\n2026/10/27 18:15:17\nLoad Avg: 1.69, 2.11, 2.30\nPID PPID %CPU POWER COMMAND\n${rs.map((r) =>
    `${r.pid} ${r.ppid} ${r.cpu} ${r.power} ${r.command}`).join('\n')}\n`).join('');
  assert.deepEqual(check.parseTop(raw), rows());
  assert.throws(() => check.parseTop(raw.replace('Processes:', 'Missing:')), /baseline plus 60/);
  assert.throws(() => check.parseTop(raw.replaceAll('POWER', 'MEM')), /CPU\/POWER/);
  assert.throws(() => check.parseTop(raw.replace('10 1 1 2', '10 1 1 -')), /unreadable top/);
});

test('D79 sums the island, descendants and its exact native host; discards only the baseline', () => {
  const data = rows();
  data[0][0].cpu = 100;
  const result = check.sumMinute(data, 10, [30]);
  assert.equal(result.samples.length, 60);
  assert.deepEqual(result.samples[0], { cpu: 1.75, power: 3 });
  assert.deepEqual(result.processes.map((p) => p.pid), [10, 20, 30]);
  const reparented = rows();
  reparented[10][1].ppid = 1;
  assert.equal(check.sumMinute(reparented, 10).samples[9].cpu, 1.25);
  assert.throws(() => check.sumMinute(data, 9999), /vanished/);
});

test('D79 uses the inclusive mean ceilings; reports max and >5s spikes without failing on max', () => {
  const samples = Array.from({ length: 60 }, () => ({ cpu: 3, power: 5 }));
  assert.equal(check.assertCeiling(samples, 'CPU', '3%').mean, 3);
  assert.equal(check.assertCeiling(samples, 'Energy Impact', '5').mean, 5);
  assert.throws(() => check.assertCeiling(samples.map(() => ({ cpu: 3.01 })), 'CPU', '3%'), /CPU mean .* exceeds 3/);
  assert.throws(() => check.assertCeiling(samples.map(() => ({ power: 5.01 })), 'Energy Impact', '5'), /Energy Impact mean .* exceeds 5/);
  const spiky = Array.from({ length: 60 }, (_, i) => ({ cpu: i < 6 ? 10 : 0, power: i < 6 ? 16 : 0 }));
  for (const [measure, ceiling] of [['CPU', '3%'], ['Energy Impact', '5']]) {
    const result = check.assertCeiling(spiky, measure, ceiling);
    assert.equal(result.longestSpikeSeconds, 6);
    assert.equal(result.finding, true);
  }
  assert.equal(check.summary(spiky, 'CPU').max, 10);
  assert.equal(check.summary(spiky, 'Energy Impact').max, 16);
  spiky[5] = { cpu: 0, power: 0 };
  assert.equal(check.summary(spiky, 'CPU').finding, false);
  assert.throws(() => check.assertCeiling(samples.slice(1), 'CPU', '3%'), /shorten/);
  assert.throws(() => check.assertCeiling(samples.map(() => ({ cpu: NaN })), 'CPU', '3%'), /invalid/);
});

test('M11: a required adapter cannot disappear after the baseline', () => {
  const data = rows();
  for (let i = 1; i < data.length; i++) data[i] = data[i].filter((r) => r.pid !== 20);
  assert.throws(() => check.sumMinute(data, 10, [], [{ name: 'adapter', pids: [20] }]), /required.*adapter/);
});

test('M11: an owned replacement counts; foreign substitutes and gaps invalidate the minute', () => {
  const data = rows();
  for (let i = 20; i < data.length; i++) data[i][1] = { ...data[i][1], pid: 21, cpu: 2, power: 3 };
  const required = [{ name: 'adapter', pids: [20, 21] }];
  assert.equal(check.sumMinute(data, 10, [], required).samples[30].cpu, 3);
  data[30][1].ppid = 999;
  // A first sighting must belong to the measured island, not merely match a name.
  for (let i = 20; i < data.length; i++) data[i][1].ppid = 999;
  assert.throws(() => check.sumMinute(data, 10, [], required), /required.*adapter/);
});

test('M11: optional transient descendants are counted only while present', () => {
  const data = rows();
  data[1].push({ pid: 50, ppid: 10, cpu: 2, power: 3, command: 'osascript' });
  const result = check.sumMinute(data, 10, [], [{ name: 'adapter', pids: [20] }]);
  assert.equal(result.samples[0].cpu, 3.25);
  assert.equal(result.samples[1].cpu, 1.25);
});

test('M11: ownership snapshots require a live exact adapter identity throughout', () => {
  const adapter = '/owned/NotchIsland.app/Contents/Resources/now-playing-adapter.dylib';
  const main = { pid: 10, ppid: 1, started: 'main-start', state: 'S', args: '/owned/NotchIsland' };
  const helper = { pid: 20, ppid: 10, started: 'adapter-start', state: 'S', args: `/usr/bin/perl -e script ${adapter}` };
  const tables = [{ processes: [main, helper] }, { processes: [main, { ...helper, pid: 21, started: 'replacement' }] }];
  assert.deepEqual(check.requiredAdapters(tables, main, adapter).pids, [20, 21]);
  for (const broken of [[], [{ ...helper, state: 'Z' }], [{ ...helper, state: 'T' }],
    [{ ...helper, args: `${helper.args}.foreign` }], [{ ...helper, ppid: 99, pid: 21 }],
    [{ ...helper, started: 'reused' }]]) {
    assert.throws(() => check.requiredAdapters([tables[0], { processes: [main, ...broken] }], main, adapter), /required|identity/);
  }
});
