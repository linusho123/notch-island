#!/usr/bin/env node
'use strict';
// F3's one waiter batch: physical click/death probes, then all four D70 rows.
// Parse only these rows; never write the phase's feature/register/manifest.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
require('../test/support/require-idle').assertInIdleRun();
const directory = '/tmp/ni-p6';

if (process.env.P6_F3_CHILD === '1') {
  if (process.env.P6_F3_APP) require('../test/support/paths').testApp = process.env.P6_F3_APP;
  const { parseFeature, StepRegistry, runFeature } = require('gherkin-node-test');
  const file = path.resolve('features/around-the-clock.feature');
  const feature = parseFeature(fs.readFileSync(file, 'utf8'), file);
  feature.scenarios = feature.scenarios.filter((s) => s.name.startsWith('Clicking ')
    && (!process.env.P6_F3_EDGE || s.name.includes('right-hand edge')));
  const menus = require('../test/support/closed-menus');
  if (process.env.P6_F3_DEAD) {
    const click = menus.click;
    menus.click = async (w, name) => {
      await click(w, name);
      await require('../test/support/procs').stop(w.island);
    };
  }
  const texts = feature.scenarios.flatMap((s) => s.steps.map((step) => step.text));
  const registry = new StepRegistry();
  require('../test/steps/around-the-clock.steps')({ define: (pattern, fn) => {
    if (texts.some((text) => pattern.test(text))) registry.define(pattern, fn);
  } });
  runFeature(feature, registry);
} else {
  fs.mkdirSync(directory, { recursive: true });
  const verification = spawnSync(process.execPath, ['scripts/verify-installed-login.js'], { stdio: 'inherit' });
  assert.equal(verification.status, 0, 'read-only installed login verification failed');
  require('../test/support/capture-preflight').preflight();
  const results = [];
  function run(label, extra, count, reason) {
    const output = `${directory}/f3-ui-${label}.txt`;
    const fd = fs.openSync(output, 'w');
    console.log(`RUN ${label}: ${output}`);
    const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-reporter=tap', __filename], {
      env: { ...process.env, P6_F3_CHILD: '1', ...extra }, stdio: ['ignore', fd, fd],
    });
    fs.closeSync(fd);
    fs.writeFileSync(`${directory}/f3-ui-${label}.exit`, `${r.status ?? r.signal}\n`);
    const text = fs.readFileSync(output, 'utf8');
    const passed = r.status === (reason ? 1 : 0) && new RegExp(`# ${reason ? 'fail' : 'pass'} ${count}\\b`).test(text)
      && (!reason || (text.match(reason) || []).length === count);
    results.push({ label, output, exit: r.status ?? r.signal, expectedResult: passed });
    fs.writeFileSync(`${directory}/f3-ui-results.json`, JSON.stringify(results, null, 2));
    console.log(`${label}: exit=${r.status ?? r.signal}; expected=${passed}`);
  }
  const app = path.resolve('build/apps.noindex/f3-swallow/NotchIsland.app');
  assert.ok(fs.existsSync(app), 'build the disposable swallow mutant before this batch');
  run('probe-swallow', { P6_F3_APP: app, P6_F3_SWALLOW: 'all' }, 4, /its own menu did not open after the real click/g);
  run('probe-edge', { P6_F3_APP: app, P6_F3_SWALLOW: 'edge', P6_F3_EDGE: '1' }, 1, /its own menu did not open after the real click/g);
  run('probe-dead', { P6_F3_DEAD: '1' }, 4, /final open-menu assertion: owned island process identity lost/g);
  run('green', {}, 4);
  process.exitCode = results.every((r) => r.expectedResult) ? 0 : 1;
}
