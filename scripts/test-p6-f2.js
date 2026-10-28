#!/usr/bin/env node
'use strict';
// F2's single waiter batch. No feature/register/manifest writes. The named
// service prerequisite blocks only its own rows; every other selected row and
// measurement/arrival probe is attempted under the same idle-run lock.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseFeature, StepRegistry, runFeature } = require('gherkin-node-test');
const { root } = require('../test/support/paths');
const dir = '/tmp/ni-p6';
const file = path.join(root, 'features/around-the-clock.feature');
const feature = parseFeature(fs.readFileSync(file, 'utf8'), file);
feature.scenarios = feature.scenarios.filter((s) => !s.tags.includes('@D70') && !s.name.startsWith('Clicking '));

if (process.env.P6_F2_CHILD === '1') {
  require('../test/support/require-idle').assertInIdleRun();
  if (process.env.P6_F2_APP) require('../test/support/paths').testApp = process.env.P6_F2_APP;
  const registry = new StepRegistry();
  require('../test/steps/around-the-clock.steps')(registry);
  const pattern = new RegExp(process.env.P6_F2_ROWS || '.');
  feature.scenarios = feature.scenarios.filter((s) => pattern.test(s.name));
  runFeature(feature, registry);
} else {
  require('../test/support/require-idle').assertInIdleRun();
  fs.mkdirSync(dir, { recursive: true });
  const rows = feature.scenarios.map((s) => ({ line: s.line, row: s.name, status: 'bound, not run' }));
  rows.push({ row: 'D110 open-island capture', status: 'bound, not run' });
  fs.writeFileSync(`${dir}/f2-ui-rows.json`, JSON.stringify(rows, null, 2));
  const verification = spawnSync(process.execPath, ['scripts/verify-installed-login.js'], { stdio: 'inherit' });
  if (verification.status !== 0) process.exit(1);
  try { require('../test/support/capture-preflight').preflight(); }
  catch (e) { console.error(e.message); process.exit(1); }
  let failed = false;
  function run(label, pattern, extra = {}, files = [__filename]) {
    const output = `${dir}/f2-ui-${label}.txt`;
    const fd = fs.openSync(output, 'w');
    const env = { ...process.env, P6_F2_CHILD: '1', P6_F2_ROWS: pattern, ...extra };
    const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-reporter=tap', ...files],
      { env, stdio: ['ignore', fd, fd] });
    fs.closeSync(fd);
    fs.writeFileSync(`${dir}/f2-ui-${label}.exit`, `${result.status ?? result.signal}\n`);
    console.log(`${label}: exit=${result.status ?? result.signal} ${output}`);
    return { code: result.status, text: fs.readFileSync(output, 'utf8'), output };
  }
  const playback = '(While recording the screen|With the wing.*recording the screen)';
  for (const [probe, reason] of [
    ['stale-frame', /stale, unordered or missing capture frames/],
    ['visible-island', /island rect differs from the plain reference/],
    ['playback-leak', /island rect differs from the plain reference/],
    ['playback-control', /control window is absent/],
  ]) {
    const r = run(`probe-${probe}`, playback, { P6_CAPTURE_PROBE: probe });
    if (r.code !== 1 || !reason.test(r.text) || (r.text.match(/not ok \d+ - Around the clock ::/g) || []).length !== 2) failed = true;
  }
  const ignored = run('probe-ignore-mov', '^A screen recording', {
    P6_F2_APP: path.join(root, 'build/apps.noindex/f2-ignore-mov/NotchIsland.app'),
  });
  if (ignored.code !== 1 || !/native \.mov never arrived through the watcher/.test(ignored.text)) failed = true;
  const green = run('green', '.', {}, [__filename, path.join(root, 'test/hidden-from-capture.test.js')]);
  for (const row of rows) {
    const name = row.row.startsWith('D110') ? 'D110:' : `Around the clock :: ${row.row}`;
    const result = green.text.split('\n').find((line) => /^(not )?ok \d+ - /.test(line) && line.includes(name));
    row.status = result?.startsWith('ok ') ? 'ran green' : result ? 'ran red' : 'bound, not run';
    row.run = green.output;
    // A required R1 spike is a missing Given, never an executed viewer check.
    if (/sharing the screen in (Zoom|Meet)|When the share ends/.test(row.row)
      && !process.env.P6_SERVICE_EVIDENCE) row.status = 'bound, not run';
  }
  fs.writeFileSync(`${dir}/f2-ui-rows.json`, JSON.stringify(rows, null, 2));
  if (green.code !== 0) failed = true;
  process.exitCode = failed ? 1 : 0;
}
