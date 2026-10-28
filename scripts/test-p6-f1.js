#!/usr/bin/env node
'use strict';
// One UI batch. Safety helpers are shared by every bound feature row; D110
// and login interruption checks also exercise the changed capture/guardian paths.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseFeature } = require('gherkin-node-test');
const { root } = require('../test/support/paths');
const features = ['music-panel', 'music-sources', 'new-song-notice', 'shelf-captures-and-files', 'shelf-notes-and-reminders', 'around-the-clock'];
function selected() {
  return features.map((name) => {
    const file = path.join(root, 'features', `${name}.feature`);
    const parsed = parseFeature(fs.readFileSync(file, 'utf8'), file);
    // These three unbound recording rows belong to F2, not F1.
    parsed.scenarios = parsed.scenarios.filter((s) => name !== 'around-the-clock'
      || !(s.line === 58 || /recording the screen/.test(s.name)));
    return { name, parsed };
  });
}

if (process.env.P6_F1_FEATURE_CHILD === '1') {
  require('../test/support/require-idle').assertInIdleRun();
  require('../test/support/fixture-preflight').assertFixtureSession();
  const { StepRegistry, runFeature } = require('gherkin-node-test');
  for (const { name, parsed } of selected()) {
    const registry = new StepRegistry();
    require(`../test/steps/${name}.steps`)(registry);
    runFeature(parsed, registry);
  }
} else {
  require('../test/support/require-idle').assertInIdleRun();
  const rows = selected().flatMap(({ name, parsed }) => parsed.scenarios.map((s) => ({
    feature: name, line: s.line, row: s.name, status: 'bound, not run',
  })));
  rows.push({ row: 'D110 open island capture', status: 'bound, not run' },
    { row: 'login cleanup after step failure', status: 'bound, not run' },
    { row: 'login cleanup after runner SIGKILL', status: 'bound, not run' });
  fs.writeFileSync('/tmp/ni-p6/f1-ui-rows.json', JSON.stringify(rows, null, 2));
  console.log(`F1 selected ${rows.length} rows, listed in /tmp/ni-p6/f1-ui-rows.json`);
  try { require('../test/support/fixture-preflight').assertFixtureSession(); }
  catch (e) { console.error(e.message); process.exit(1); }
  const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-reporter=tap',
    __filename, 'test/hidden-from-capture.test.js', 'test/login-cleanup.test.js'], {
    env: { ...process.env, P6_F1_FEATURE_CHILD: '1' }, stdio: 'inherit',
  });
  process.exitCode = result.status ?? 1;
}
