#!/usr/bin/env node
'use strict';
// One waiter lock contains the five capture measurement probes and the final
// targeted regression run. Refuse foreign windows/installed islands before
// loading any suite with installed-app recovery side effects.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { preflight } = require('../test/support/capture-preflight');
try { preflight(); } catch (e) { console.error(e.message); process.exit(1); }
require('../test/support/require-idle').assertInIdleRun();
const directory = '/tmp/ni-p6';
fs.mkdirSync(directory, { recursive: true });
const captures = 'Around the clock :: (While sharing the screen in (Zoom|Meet).*\\[(1|2|4)\\]|With .*sharing the screen in (Zoom|Meet).*\\[(1|2)\\])';

function run(label, pattern, files, probe) {
  const file = `${directory}/v2a-${label}.txt`;
  const log = fs.openSync(file, 'w');
  const env = { ...process.env };
  delete env.P6_CAPTURE_PROBE;
  if (probe) env.P6_CAPTURE_PROBE = probe;
  const result = spawnSync(process.execPath,
    ['--test', '--test-concurrency=1', '--test-reporter=tap', `--test-name-pattern=${pattern}`, ...files],
    { env, stdio: ['ignore', log, log] });
  fs.closeSync(log);
  console.log(`${label}: exit=${result.status} signal=${result.signal} ${file}`);
  fs.writeFileSync(`${directory}/v2a-${label}.exit`, `${result.status}\n`);
  assert.equal(result.signal, null, 'run was killed; this is not a probe result');
  return { code: result.status, text: fs.readFileSync(file, 'utf8') };
}

for (const [probe, reason] of [
  ['visible-island', /island rect differs from the plain reference/g],
  ['missing-control', /nothing on screen — the control window is absent/g],
]) {
  const result = run(`probe-${probe}`, captures, ['test/features.test.js'], probe);
  assert.equal(result.code, 1, `${probe} did not turn the rows red`);
  assert.equal((result.text.match(/not ok \d+ - Around the clock ::/g) || []).length, 5,
    `${probe} did not turn all five capture rows red`);
  assert.equal((result.text.match(reason) || []).length, 5,
    `${probe} failed for a reason other than the measurement mutation`);
}
const regression = `${captures}|Around the clock :: (When the share ends|Logging in)|D110:`;
const result = run('green', regression, ['test/features.test.js', 'test/hidden-from-capture.test.js']);
process.exitCode = result.code;
