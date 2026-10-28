'use strict';
// ServiceManagement status is authoritative: BTM may retain disabled history
// after unregister. Query only the exact signed, owned TEST executable.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { root } = require('./paths');

// The only identities a test may register or unregister. The fixtures' are
// fixed rather than one per run, so macOS keeps their Automation consent.
const TEST_IDENTIFIER = 'local.notch-island.test';
const LOGIN_IDENTIFIER = 'local.notch-island.test.login-fixture';
const COST_IDENTIFIER = 'local.notch-island.cost.fixture';

function invoke(app, identifier, flag, env = process.env) {
  const parent = fs.realpathSync(path.join(root, 'build', 'apps.noindex'));
  const canonical = fs.realpathSync(app);
  assert.ok(canonical.startsWith(`${parent}${path.sep}`), 'login service must belong to a test fixture');
  assert.ok([TEST_IDENTIFIER, LOGIN_IDENTIFIER, COST_IDENTIFIER].includes(identifier));
  const plist = path.join(app, 'Contents', 'Info.plist');
  assert.equal(execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', plist], { encoding: 'utf8' }).trim(), identifier);
  const result = spawnSync(path.join(app, 'Contents', 'MacOS', 'NotchIsland'), [flag], {
    env, encoding: 'utf8', timeout: 20000,
  });
  assert.equal(result.status, 0, `login service ${flag} failed: ${result.stderr || result.error}`);
  const value = JSON.parse(result.stdout.trim());
  assert.equal(value.bundleID, identifier, 'login service answered for another identity');
  assert.ok(['notRegistered', 'enabled', 'requiresApproval', 'notFound'].includes(value.status));
  return value.status;
}
function status(app, identifier, env) {
  return invoke(app, identifier, '--test-login-status-and-exit', env);
}
function assertUnregistered(app, identifier, env) {
  assert.equal(status(app, identifier, env), 'notRegistered', 'live registration: fixture must be retained and release must not launch');
}
function unregister(app, identifier, env) {
  assert.equal(invoke(app, identifier, '--test-unregister-login-and-exit', env), 'notRegistered', 'unregister did not remove the owned service');
  assertUnregistered(app, identifier, env);
}
module.exports = { status, assertUnregistered, unregister, TEST_IDENTIFIER, LOGIN_IDENTIFIER, COST_IDENTIFIER };
