'use strict';
// risk-1: Node skips 'exit' handlers on SIGINT, SIGTERM and SIGHUP, so a Ctrl-C
// of `npm test` left the test build registered as a login item, the island
// child running, and Music's shuffle and repeat changed. Every clean-up the
// harness owes must run on those signals too, then the process exits non-zero.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const support = path.join(__dirname, 'support');

function runUntilReady(script, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.on('data', (d) => {
      out += d;
      if (out.includes('READY') && !child.killed) child.kill(signal);
    });
    child.on('exit', (code, sig) => resolve({ code, sig, out }));
    child.on('error', reject);
    setTimeout(() => { child.kill('SIGKILL'); reject(new Error('child did not finish')); }, 15000).unref();
  });
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  test(`risk-1: ${signal} runs the registered clean-ups and exits non-zero`, async () => {
    const mark = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-')), 'ran');
    const r = await runUntilReady(`
      const { onCleanup } = require(${JSON.stringify(path.join(support, 'cleanup'))});
      onCleanup(() => require('fs').writeFileSync(${JSON.stringify(mark)}, 'x'));
      console.log('READY');
      setInterval(() => {}, 1000);
    `, signal);
    assert.ok(fs.existsSync(mark), 'the clean-up did not run');
    assert.ok(r.code !== 0 || r.sig, `exited cleanly (code ${r.code})`);
    assert.notEqual(r.code, 0);
  });
}

test('risk-1: a clean exit runs the clean-ups once', async () => {
  const mark = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-')), 'count');
  await runUntilReady(`
    const { onCleanup } = require(${JSON.stringify(path.join(support, 'cleanup'))});
    onCleanup(() => require('fs').appendFileSync(${JSON.stringify(mark)}, 'x'));
    console.log('READY'); process.exit(0);
  `, 'SIGTERM');
  assert.equal(fs.readFileSync(mark, 'utf8'), 'x');
});

test('risk-1: a spawned island child does not outlive an interrupted run', async () => {
  const r = await runUntilReady(`
    const procs = require(${JSON.stringify(path.join(support, 'procs'))});
    const h = procs.start('sleeper', '/bin/sleep', ['300']);
    console.log('PID ' + h.pid);
    console.log('READY');
    setInterval(() => {}, 1000);
  `, 'SIGINT');
  const pid = Number(/PID (\d+)/.exec(r.out)[1]);
  await new Promise((res) => setTimeout(res, 300));
  let alive = true;
  try { process.kill(pid, 0); } catch { alive = false; }
  if (alive) process.kill(pid, 'SIGKILL');
  assert.equal(alive, false, 'the spawned child survived the interrupt');
});

test('risk-1: nothing under test/ hooks only process exit for clean-up', () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const offenders = walk(__dirname)
    .filter((f) => f.endsWith('.js') && !f.endsWith('cleanup.js') && !f.endsWith('interrupt-cleanup.test.js'))
    .filter((f) => /process\.on\(\s*['"]exit['"]/.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(offenders, []);
});
