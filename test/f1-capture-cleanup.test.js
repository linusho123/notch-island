'use strict';
// A delayed capture stand-in writes only into a private test directory.
// No display access, pointer events, app launch or registry calls occur here.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const sandbox = require('./support/sandbox');
const procs = require('./support/procs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (process.argv.includes('--owner')) {
  (async () => {
    const w = { defer() {} };
    const dir = sandbox.scratch(w);
    const args = ['-e', '$SIG{TERM}="IGNORE"; select(undef,undef,undef,2); open(my $f,">",$ARGV[0]) or die $!; print $f "late"; close $f; select(undef,undef,undef,10);', path.join(dir, 'shot.png')];
    const handle = sandbox.startOwned ? await sandbox.startOwned(w, '/usr/bin/perl', args)
      : procs.start('delayed capture', '/usr/bin/perl', args);
    process.send({ dir, pid: handle.pid, started: handle.started });
    setInterval(() => {}, 1000);
  })().catch((e) => { console.error(e); process.exit(1); });
} else {
  test('M04: owner death stops delayed capture before removing exact artifacts; unrelated file survives', async (t) => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-unrelated-'));
    const unrelated = path.join(other, 'shot.png');
    fs.writeFileSync(unrelated, 'keep');
    t.after(() => fs.rmSync(other, { recursive: true, force: true }));
    const owner = spawn(process.execPath, [__filename, '--owner'], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
    const fixture = await Promise.race([once(owner, 'message').then(([m]) => m), once(owner, 'exit').then(() => { throw new Error('owner setup failed'); })]);
    try {
      owner.kill('SIGKILL');
      await once(owner, 'exit');
      await sleep(1000);
      assert.equal(procs.alive(fixture), false, 'owned screenshot child survived disconnect');
      assert.equal(fs.existsSync(fixture.dir), false, 'scratch artifacts survived disconnect');
      await sleep(1400);
      assert.equal(fs.existsSync(path.join(fixture.dir, 'shot.png')), false, 'capture wrote after cleanup');
      assert.equal(fs.readFileSync(unrelated, 'utf8'), 'keep');
    } finally {
      if (procs.alive(fixture)) process.kill(fixture.pid, 'SIGKILL');
      fs.rmSync(fixture.dir, { recursive: true, force: true });
    }
  });
}

if (!process.argv.includes('--owner')) {
  test('M04: setup failure removes scratch after the guardian is armed', async () => {
    const defers = [];
    const w = { defer: (fn) => defers.push(fn) };
    const dir = sandbox.scratch(w);
    await assert.rejects(sandbox.startOwned(w, '/no-such-capture-tool', []));
    for (const fn of defers.reverse()) await fn();
    assert.equal(fs.existsSync(dir), false);
  });
  test('M04: shared D110 command lifecycle waits for output and removes its artifact directory', async () => {
    const result = await sandbox.runOwned('/usr/bin/perl', ['-e', 'print "capture result";']);
    assert.equal(result.stdout, 'capture result');
  });
}
