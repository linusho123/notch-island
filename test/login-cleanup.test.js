'use strict';
// Real registry/launch cleanup, including a test runner killed outright.
const { assertInIdleRun } = require('./support/require-idle');
assertInIdleRun();
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { StepRegistry, executeSteps } = require('gherkin-node-test');
const login = require('./support/login');
const registry = require('./support/registry');
const { cleanup, pids } = require('./support/login-guardian');
const { sleep } = require('./support/procs');

if (process.argv.includes('--owner')) {
  const w = { defer() {} }; // imitate a runner whose after hooks cannot run
  login.prepare(w).then(() => {
    process.send(w.login);
    setInterval(() => {}, 1000);
  }, (e) => { console.error(e.stack); process.exit(1); });
} else {
  const test = require('node:test');

  test('login fixture unregisters after a failing acceptance step', async () => {
    const reg = new StepRegistry();
    const w = {};
    reg.define(/^start$/, async (world) => { await login.prepare(world); });
    reg.define(/^fail$/, (world) => { throw new Error('deliberate step failure'); });
    await assert.rejects(executeSteps([{ text: 'start' }, { text: 'fail' }], reg, w), /deliberate step failure/);
    assert.equal(fs.existsSync(w.login.dir), false, 'failing step leaked a login fixture');
    assert.equal(pids(w.login.binary).length, 0);
    assert.equal(await registry.enabledApp(w.login.identifier), null);
  });

  test('login fixture unregisters even after its runner receives SIGKILL', async () => {
    const child = spawn(process.execPath, [__filename, '--owner'], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    const fixture = await new Promise((resolve, reject) => {
      child.once('message', resolve);
      child.once('error', reject);
      child.once('exit', (code) => reject(new Error(`login owner exited before setup: ${code}`)));
    });
    try {
      assert.ok(pids(fixture.binary).length > 0, 'no test instance existed before the kill');
      assert.ok(await registry.enabledApp(fixture.identifier), 'login item was not enabled before the kill');
      child.kill('SIGKILL');
      const end = Date.now() + 30000;
      while (fs.existsSync(fixture.dir) && Date.now() < end) await sleep(100);
      assert.equal(fs.existsSync(fixture.dir), false, 'SIGKILL leaked a login fixture');
      assert.equal(pids(fixture.binary).length, 0);
      assert.equal(await registry.enabledApp(fixture.identifier), null);
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
      // Recovery also makes a deliberately broken guardian probe safe.
      if (fs.existsSync(fixture.dir)) {
        await cleanup(fixture.dir);
        fs.rmSync(fixture.dir, { recursive: true, force: true });
      }
    }
  });
}
