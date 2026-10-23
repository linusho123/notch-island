'use strict';
// The extension's native-messaging host, end to end, as Chrome starts it: the
// island's own binary with the caller's origin as its first argument, framed
// JSON on standard input, the island's socket behind it. It answers only the
// companion extension; a foreign origin ends it with nothing sent on, and an
// oversized or malformed frame never reaches the island (P2 fix S5, D126).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { testBinary } = require('./support/paths');

const ID = fs.readFileSync(path.join(__dirname, '..', 'app', 'chrome-extension', 'extension-id.txt'), 'utf8').trim();
const OWN = `chrome-extension://${ID}/`;
const frame = (buf) => { const h = Buffer.alloc(4); h.writeUInt32LE(buf.length); return Buffer.concat([h, buf]); };

/** An island's socket stand-in that records what reaches it, and a host started against it. */
async function rig(origin) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'host-'));
  const sock = path.join(dir, 's.sock');
  const received = [];
  let connections = 0;
  const server = net.createServer((c) => {
    connections += 1;
    let data = '';
    c.on('data', (d) => { data += d; received.splice(0, received.length, ...data.split('\n').filter(Boolean)); });
  });
  await new Promise((r) => server.listen(sock, r));
  const input = path.join(dir, 'input.json');
  fs.writeFileSync(input, JSON.stringify({ dataDirectory: dir, chromeSocket: sock }));
  assert.ok(fs.existsSync(testBinary), 'the test build is missing: run npm run build:app');
  const host = spawn(testBinary, [origin], { env: { ...process.env, NOTCH_ISLAND_TEST_INPUT: input }, stdio: ['pipe', 'pipe', 'ignore'] });
  const exited = Promise.race([
    new Promise((r) => host.on('exit', (code) => r(code))),
    new Promise((r) => setTimeout(() => r('still running after 5 s'), 5000)),
  ]);
  const finish = async () => { host.kill('SIGKILL'); server.close(); fs.rmSync(dir, { recursive: true, force: true }); };
  return { host, exited, received, connections: () => connections, finish };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('a foreign origin ends the host with exit 1 and nothing reaches the island', async () => {
  const r = await rig('chrome-extension://abcdefghijklmnopabcdefghijklmnop/');
  try {
    r.host.stdin.write(frame(Buffer.from(JSON.stringify({ type: 'tabs', tabs: [], closed: [] }))));
    assert.equal(await r.exited, 1);
    assert.equal(r.connections(), 0, 'the host reached the island socket');
    assert.deepEqual(r.received, []);
  } finally { await r.finish(); }
});

test('the companion extension is relayed, a malformed frame is not', async () => {
  const r = await rig(OWN);
  try {
    r.host.stdin.write(frame(Buffer.from('this is not json')));
    r.host.stdin.write(frame(Buffer.from(JSON.stringify({ type: 'tabs', tabs: [], closed: [] }))));
    await sleep(800);
    const types = r.received.map((l) => JSON.parse(l).type);
    assert.deepEqual(types, ['hello', 'tabs'], `the island received ${r.received}`);
  } finally { await r.finish(); }
});

test('an oversized frame ends the host and nothing of it reaches the island', async () => {
  const r = await rig(OWN);
  try {
    const header = Buffer.alloc(4);
    header.writeUInt32LE((1 << 20) + 1);
    r.host.stdin.write(Buffer.concat([header, Buffer.alloc(64, 0x41)]));
    assert.equal(await r.exited, 1);
    assert.deepEqual(r.received.map((l) => JSON.parse(l).type), ['hello']);
  } finally { await r.finish(); }
});
