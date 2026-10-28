#!/usr/bin/env node
'use strict';
// FU's one guarded batch. Select affected rows without touching the wip
// register or manifest; retain every result, including blocked prerequisites.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseFeature, StepRegistry, runFeature } = require('gherkin-node-test');
require('../test/support/require-idle').assertInIdleRun();
const dir = '/tmp/ni-p6';
const selections = {
  'around-the-clock': '*',
  'music-panel': [11, 18, 29, 35, 41, 203, 209, 216],
  'music-sources': [118, 165, 184],
  'new-song-notice': '*',
  'shelf-captures-and-files': [29, 41, 52, 92, 98, 266],
  'shelf-notes-and-reminders': [11, 37, 62, 74, 98],
};
function selected() {
  return Object.entries(selections).map(([name, lines]) => {
    const file = path.resolve('features', `${name}.feature`);
    const feature = parseFeature(fs.readFileSync(file, 'utf8'), file);
    feature.scenarios = feature.scenarios.filter((s) => lines === '*' || lines.includes(s.line));
    if (process.env.P6_FU_PROBE) feature.scenarios = name === 'around-the-clock'
      ? feature.scenarios.filter((s) => s.name.startsWith('Clicking ') && s.name.includes(
        process.env.P6_FU_PROBE === 'wifi' ? 'Wi-Fi icon' : 'leftmost status icon')) : [];
    return { name, feature };
  });
}
if (process.env.P6_FU_CHILD) {
  if (process.env.P6_FU_PROBE) {
    // Reversible in-memory test-driver mutations; no source or app edits.
    const Module = require('node:module');
    const file = require.resolve('../test/support/closed-menus');
    let source = fs.readFileSync(file, 'utf8');
    if (process.env.P6_FU_PROBE === 'wifi') source = source.replace("if (target.kind === 'wifi' && item.owner", "if (false && target.kind === 'wifi' && item.owner");
    else source = source.replace('const sameItem = (a, b) => a && b', 'const sameItem = (a, b) => false && a && b');
    const mutated = new Module(file, module);
    mutated.filename = file;
    mutated.paths = Module._nodeModulePaths(path.dirname(file));
    require.cache[file] = mutated;
    mutated._compile(source, file);
  }
  for (const { name, feature } of selected()) {
    if (!feature.scenarios.length) continue;
    const texts = feature.scenarios.flatMap((s) => s.steps.map((step) => step.text));
    const registry = new StepRegistry();
    require(`../test/steps/${name}.steps`)({ define: (pattern, fn) => {
      if (texts.some((text) => pattern.test(text))) registry.define(pattern, fn);
    } });
    runFeature(feature, registry);
  }
} else {
  fs.mkdirSync(dir, { recursive: true });
  const results = [];
  function run(label, files, extra = {}) {
    const output = `${dir}/fu-ui-${label}.txt`;
    console.log(`RUN ${label}: ${output}`);
    const fd = fs.openSync(output, 'w');
    const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-reporter=tap', ...files], {
      env: { ...process.env, P6_FU_CHILD: '1', ...extra }, stdio: ['ignore', fd, fd],
    });
    fs.closeSync(fd);
    const code = r.status ?? r.signal;
    fs.writeFileSync(`${dir}/fu-ui-${label}.exit`, `${code}\n`);
    console.log(`${label}: exit=${code}`);
    const text = fs.readFileSync(output, 'utf8');
    results.push({ label, output, code });
    fs.writeFileSync(`${dir}/fu-ui-results.json`, JSON.stringify(results, null, 2));
    return { code, text, output };
  }
  const verified = spawnSync(process.execPath, ['scripts/verify-installed-login.js'], { stdio: 'inherit' });
  if (verified.status !== 0) process.exit(1);
  // A failed FU interruption probe can be continued with its exact recorded
  // lease. No discovery or recovery of another run's state is allowed here.
  if (process.env.P6_FU_RECOVERY) {
    const recorded = fs.readFileSync(process.env.P6_FU_RECOVERY, 'utf8');
    const journal = path.join(require('node:os').tmpdir(), 'notch-island-installed-island.json');
    require('node:assert/strict').equal(fs.readFileSync(journal, 'utf8'), recorded);
    require('../test/support/installed-island').resumeInstalledRun(JSON.parse(recorded).stamp);
    console.log('Restored the exact FU interruption pause before retry');
  }
  // This child owns its own explicit pause; assert restoration before the
  // rest of the batch acquires a shared pause lease in the parent.
  const voided = run('void-d60', ['test/fu-void-login.test.js']);
  if (voided.code !== 0) process.exit(1);
  require('../test/support/capture-preflight').preflight();
  const wifi = run('probe-wifi', [__filename], { P6_FU_PROBE: 'wifi' });
  const status = run('probe-status', [__filename], { P6_FU_PROBE: 'status' });
  const green = run('rows', [__filename, 'test/hidden-from-capture.test.js', 'test/login-cleanup.test.js']);
  const rows = selected().flatMap(({ name, feature }) => feature.scenarios.map((s) => {
    const result = green.text.split('\n').find((line) => /^(not )?ok \d+ - /.test(line) && line.includes(`${feature.name} :: ${s.name}`));
    let state = result?.startsWith('ok ') ? 'ran green' : result ? 'ran red' : 'bound, not run';
    if (name === 'around-the-clock' && /sharing the screen in (Zoom|Meet)|When the share ends/.test(s.name)
      && !process.env.P6_SERVICE_EVIDENCE) state = 'bound, not run';
    return { feature: name, line: s.line, name: s.name, status: state, run: green.output };
  }));
  fs.writeFileSync(`${dir}/fu-ui-rows.json`, JSON.stringify(rows, null, 2));
  process.exitCode = green.code === 0 && wifi.code === 1 && /its own menu did not open/.test(wifi.text)
    && status.code === 1 && /item changed before the click/.test(status.text) ? 0 : 1;
}
