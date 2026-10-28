'use strict';
// Owns capture helpers independently of the scenario runner. Disconnect is
// authoritative even after SIGKILL; children exit before their files go away.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { once } = require('node:events');
const images = require('./scratch-images');
const dir = process.argv[2];
const base = fs.realpathSync(path.join(os.tmpdir(), 'notch-island-tests'));
assert.equal(path.dirname(fs.realpathSync(dir)), base);
assert.match(path.basename(dir), /^scenario-[A-Za-z0-9]+$/);
const identity = fs.statSync(dir);
const children = new Set();
let cleaning = false;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const send = (m) => { if (process.connected) process.send(m, () => {}); };

function output(file) {
  const parent = fs.realpathSync(path.dirname(file));
  assert.ok(parent === fs.realpathSync(dir) || parent.startsWith(`${fs.realpathSync(dir)}/`));
  return fs.openSync(file, 'a');
}
async function finish() {
  if (cleaning) return;
  cleaning = true;
  try {
    for (const child of children) child.kill('SIGTERM');
    await sleep(200);
    for (const child of children) child.kill('SIGKILL');
    await Promise.all([...children].map((child) => once(child, 'close')));
    const current = fs.statSync(dir);
    assert.ok(current.ino === identity.ino && current.dev === identity.dev, 'scratch directory identity changed');
    if (fs.existsSync(path.join(dir, 'ScratchVolume'))) {
      const run = (args, opts) => execFileSync('/usr/bin/hdiutil', args, opts);
      const mounted = images.images(run).filter((i) => {
        try { return fs.realpathSync(i.image).startsWith(`${fs.realpathSync(dir)}/`); } catch { return false; }
      });
      for (const i of mounted) assert.ok(images.detach(i.image, run), 'mounted scratch has no matching ownership record; retained');
    }
    fs.rmSync(dir, { recursive: true });
    process.exit(0);
  } catch (e) { console.error(e.stack); process.exit(1); }
}
process.on('disconnect', finish);
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, finish);
process.on('message', (m) => {
  if (m.op === 'cleanup') { finish(); return; }
  if (cleaning || m.op !== 'spawn') return;
  let out;
  let err;
  try {
    out = output(m.stdout);
    err = output(m.stderr);
    const child = spawn(m.file, m.args, { env: m.env, stdio: ['ignore', out, err] });
    children.add(child);
    child.once('error', (e) => send({ id: m.id, error: e.message }));
    child.once('close', (code, signal) => {
      children.delete(child);
      send({ id: m.id, exited: true, code, signal });
    });
    child.once('spawn', () => send({ id: m.id, pid: child.pid }));
  } catch (e) { send({ id: m.id, error: e.message }); }
  finally {
    if (out !== undefined) fs.closeSync(out);
    if (err !== undefined) fs.closeSync(err);
  }
});
if (!process.connected) finish(); else send({ ready: true });
