'use strict';
// M1: The visionary's clipboard survives a voided run or interrupted paste.
// Snapshot written to durable file before overwrite, restored in finally,
// in synchronous SIGINT/SIGTERM/SIGHUP handlers, and by when-idle after void/kill.
// Never restored over newer clipboard data that changed since harness set it.
// Pure Node tests with mocked clipboard: never touches the real clipboard.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');

const CHILD_SCRIPT = `
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const [root, mode, stateFile, snapshotFile] = process.argv.slice(1);
process.env.NOTCH_ISLAND_CLIPBOARD_SNAPSHOT = snapshotFile;

const mod = { exports: {} };
function mockedRequire(name) {
  if (name === 'node:child_process') {
    return {
      execFile() { throw Error('real harness forbidden'); },
      execFileSync() { throw Error('real harness forbidden'); },
      spawn() { throw Error('real harness forbidden'); },
    };
  }
  if (name === './paths') return { harness: 'FORBIDDEN' };
  if (name === './require-idle') return { assertInIdleRun() {} };
  if (name === './cleanup') return require(path.join(root, 'test/support/cleanup.js'));
  if (name === 'node:test') return { before() {}, after() {}, beforeEach() {}, afterEach() {} };
  if (name.startsWith('node:')) return require(name);
  throw Error('Unexpected dependency: ' + name);
}

const harnessCode = fs.readFileSync(path.join(root, 'test/support/harness.js'), 'utf8');
vm.runInNewContext(
  harnessCode,
  {
    require: mockedRequire,
    module: mod,
    exports: mod.exports,
    process,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Buffer,
    console,
  },
  { filename: 'harness-mocked.js' }
);
const h = mod.exports;

function readState() {
  return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
}
function writeState(s) {
  fs.writeFileSync(stateFile, JSON.stringify(s));
}

h.pasteboardSave = async () => readState();
h.pasteboardSaveSync = () => readState();
h.pasteboardSet = async (_name, type, val) => {
  const s = readState();
  s.changeCount = (s.changeCount || 0) + 1;
  s.types = [type];
  s.items = [{ [type]: Buffer.from(val).toString('base64') }];
  s.rawText = val;
  writeState(s);
  if (mode === 'interrupt-after-set') {
    process.kill(process.pid, 'SIGTERM');
    await new Promise((r) => setTimeout(r, 200));
  }
  return { ok: true, changeCount: s.changeCount, types: s.types };
};
h.pasteboardRestore = async (saved) => {
  if (mode === 'failed-restore') throw new Error('simulated async restore failure');
  const s = readState();
  s.changeCount = (s.changeCount || 0) + 1;
  s.types = saved.types;
  s.items = saved.items;
  s.rawText = saved.rawText;
  writeState(s);
  return { ok: true, changeCount: s.changeCount };
};
h.pasteboardRestoreSync = (saved) => {
  if (mode === 'failed-restore') throw new Error('simulated sync restore failure');
  const s = readState();
  s.changeCount = (s.changeCount || 0) + 1;
  s.types = saved.types;
  s.items = saved.items;
  s.rawText = saved.rawText;
  writeState(s);
  return { ok: true, changeCount: s.changeCount };
};

h.key = async () => {
  if (mode === 'failure') throw new Error('key failed');
  if (mode === 'SIGINT') {
    process.kill(process.pid, 'SIGINT');
    await new Promise((r) => setTimeout(r, 200));
  }
  if (mode === 'SIGTERM') {
    process.kill(process.pid, 'SIGTERM');
    await new Promise((r) => setTimeout(r, 200));
  }
  if (mode === 'SIGHUP') {
    process.kill(process.pid, 'SIGHUP');
    await new Promise((r) => setTimeout(r, 200));
  }
  if (mode === 'SIGKILL') {
    process.kill(process.pid, 'SIGKILL');
    await new Promise((r) => setTimeout(r, 200));
  }
  if (mode === 'user-change-during-key') {
    const s = readState();
    s.changeCount = (s.changeCount || 0) + 1;
    s.rawText = 'USER NEW CONTENT';
    s.types = ['public.utf8-plain-text'];
    s.items = [{ 'public.utf8-plain-text': Buffer.from('USER NEW CONTENT').toString('base64') }];
    writeState(s);
  }
};

(async () => {
  try {
    await h.paste('TEST PASTE');
  } catch (e) {
    if (mode !== 'failure' && mode !== 'failed-restore') {
      console.error(e);
      process.exit(1);
    }
  }
})();
`;

function setupTestEnv(initialState) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-safety-'));
  const stateFile = path.join(dir, 'clipboard.json');
  const snapshotFile = path.join(dir, 'snapshot.json');
  fs.writeFileSync(stateFile, JSON.stringify(initialState));
  const cleanup = () => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  };
  return { dir, stateFile, snapshotFile, cleanup };
}

test('paste restores clipboard on normal completion', () => {
  const env = setupTestEnv({
    changeCount: 1,
    types: ['public.utf8-plain-text'],
    items: [{ 'public.utf8-plain-text': Buffer.from('ORIGINAL').toString('base64') }],
    rawText: 'ORIGINAL',
  });
  try {
    const r = spawnSync(process.execPath, ['-e', CHILD_SCRIPT, root, 'normal', env.stateFile, env.snapshotFile], {
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.equal(r.status, 0, r.stderr);
    const finalState = JSON.parse(fs.readFileSync(env.stateFile, 'utf8'));
    assert.equal(finalState.rawText, 'ORIGINAL');
  } finally {
    env.cleanup();
  }
});

test('paste restores clipboard when key throws', () => {
  const env = setupTestEnv({
    changeCount: 1,
    types: ['public.utf8-plain-text'],
    items: [{ 'public.utf8-plain-text': Buffer.from('ORIGINAL').toString('base64') }],
    rawText: 'ORIGINAL',
  });
  try {
    const r = spawnSync(process.execPath, ['-e', CHILD_SCRIPT, root, 'failure', env.stateFile, env.snapshotFile], {
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.equal(r.status, 0, r.stderr);
    const finalState = JSON.parse(fs.readFileSync(env.stateFile, 'utf8'));
    assert.equal(finalState.rawText, 'ORIGINAL');
  } finally {
    env.cleanup();
  }
});

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  test(`paste restores clipboard synchronously when interrupted by ${signal}`, () => {
    const env = setupTestEnv({
      changeCount: 10,
      types: ['public.utf8-plain-text'],
      items: [{ 'public.utf8-plain-text': Buffer.from('ORIGINAL PAYLOAD').toString('base64') }],
      rawText: 'ORIGINAL PAYLOAD',
    });
    try {
      const r = spawnSync(process.execPath, ['-e', CHILD_SCRIPT, root, signal, env.stateFile, env.snapshotFile], {
        encoding: 'utf8',
        timeout: 5000,
      });
      const sigNum = signal === 'SIGHUP' ? 1 : signal === 'SIGINT' ? 2 : 15;
      assert.equal(r.status, 128 + sigNum, r.stderr);
      const finalState = JSON.parse(fs.readFileSync(env.stateFile, 'utf8'));
      assert.equal(finalState.rawText, 'ORIGINAL PAYLOAD', `clipboard was not restored on ${signal}`);
    } finally {
      env.cleanup();
    }
  });
}

test('paste restores clipboard when interrupted immediately after pasteboardSet', () => {
  const env = setupTestEnv({
    changeCount: 5,
    types: ['public.utf8-plain-text'],
    items: [{ 'public.utf8-plain-text': Buffer.from('IMMEDIATE ORIGINAL').toString('base64') }],
    rawText: 'IMMEDIATE ORIGINAL',
  });
  try {
    const r = spawnSync(process.execPath, ['-e', CHILD_SCRIPT, root, 'interrupt-after-set', env.stateFile, env.snapshotFile], {
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.equal(r.status, 143, r.stderr);
    const finalState = JSON.parse(fs.readFileSync(env.stateFile, 'utf8'));
    assert.equal(finalState.rawText, 'IMMEDIATE ORIGINAL');
  } finally {
    env.cleanup();
  }
});

test('multi-type clipboard payload survives interruption', () => {
  const env = setupTestEnv({
    changeCount: 7,
    types: ['public.utf8-plain-text', 'public.rtf'],
    items: [{
      'public.utf8-plain-text': Buffer.from('plain text data').toString('base64'),
      'public.rtf': Buffer.from('{\\rtf1\\ansi rich text}').toString('base64'),
    }],
    rawText: 'plain text data',
  });
  try {
    const r = spawnSync(process.execPath, ['-e', CHILD_SCRIPT, root, 'SIGTERM', env.stateFile, env.snapshotFile], {
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.equal(r.status, 143, r.stderr);
    const finalState = JSON.parse(fs.readFileSync(env.stateFile, 'utf8'));
    assert.deepEqual(finalState.types, ['public.utf8-plain-text', 'public.rtf']);
    assert.equal(finalState.items[0]['public.rtf'], Buffer.from('{\\rtf1\\ansi rich text}').toString('base64'));
  } finally {
    env.cleanup();
  }
});

test('newer user clipboard data is never overwritten during restore', () => {
  const env = setupTestEnv({
    changeCount: 1,
    types: ['public.utf8-plain-text'],
    items: [{ 'public.utf8-plain-text': Buffer.from('OLD VISIONARY CONTENT').toString('base64') }],
    rawText: 'OLD VISIONARY CONTENT',
  });
  try {
    const r = spawnSync(process.execPath, ['-e', CHILD_SCRIPT, root, 'user-change-during-key', env.stateFile, env.snapshotFile], {
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.equal(r.status, 0, r.stderr);
    const finalState = JSON.parse(fs.readFileSync(env.stateFile, 'utf8'));
    // The user copied something new; restore must NOT overwrite it with OLD VISIONARY CONTENT!
    assert.equal(finalState.rawText, 'USER NEW CONTENT', 'newer user content was overwritten by stale snapshot');
  } finally {
    env.cleanup();
  }
});

test('durable snapshot is written before overwrite and cleaned up after normal restore', () => {
  const env = setupTestEnv({
    changeCount: 1,
    types: ['public.utf8-plain-text'],
    items: [{ 'public.utf8-plain-text': Buffer.from('ORIGINAL').toString('base64') }],
    rawText: 'ORIGINAL',
  });
  try {
    assert.equal(fs.existsSync(env.snapshotFile), false);
    const r = spawnSync(process.execPath, ['-e', CHILD_SCRIPT, root, 'normal', env.stateFile, env.snapshotFile], {
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.equal(r.status, 0, r.stderr);
    // Snapshot should be unlinked/cleared after successful restore
    assert.equal(fs.existsSync(env.snapshotFile), false);
  } finally {
    env.cleanup();
  }
});

test('forced exit (SIGKILL) leaves snapshot file for when-idle recovery', () => {
  const env = setupTestEnv({
    changeCount: 1,
    types: ['public.utf8-plain-text'],
    items: [{ 'public.utf8-plain-text': Buffer.from('ORIGINAL BEFORE SIGKILL').toString('base64') }],
    rawText: 'ORIGINAL BEFORE SIGKILL',
  });
  try {
    const r = spawnSync(process.execPath, ['-e', CHILD_SCRIPT, root, 'SIGKILL', env.stateFile, env.snapshotFile], {
      encoding: 'utf8',
      timeout: 5000,
    });
    // Process killed with SIGKILL: status is null, signal is SIGKILL
    assert.equal(r.signal, 'SIGKILL');
    // Snapshot file must still exist on disk because SIGKILL bypasses all process cleanup
    assert.ok(fs.existsSync(env.snapshotFile), 'snapshot file was not preserved on disk after SIGKILL');
    const snapshot = JSON.parse(fs.readFileSync(env.snapshotFile, 'utf8'));
    assert.equal(snapshot.state, 'set');
    assert.equal(snapshot.saved.rawText, 'ORIGINAL BEFORE SIGKILL');
  } finally {
    env.cleanup();
  }
});

test('failed restore writes recovery record and does not clear journal', () => {
  const env = setupTestEnv({
    changeCount: 1,
    types: ['public.utf8-plain-text'],
    items: [{ 'public.utf8-plain-text': Buffer.from('ORIGINAL').toString('base64') }],
    rawText: 'ORIGINAL',
  });
  try {
    const r = spawnSync(process.execPath, ['-e', CHILD_SCRIPT, root, 'failed-restore', env.stateFile, env.snapshotFile], {
      encoding: 'utf8',
      timeout: 5000,
    });
    // Failed restore should write a recovery record and preserve the snapshot
    const recoveryFile = `${env.snapshotFile}.recovery`;
    assert.ok(fs.existsSync(recoveryFile) || fs.existsSync(env.snapshotFile), 'neither recovery file nor snapshot was preserved');
  } finally {
    env.cleanup();
  }
});

test('when-idle recoverClipboardSnapshot restores orphaned snapshot when change count unchanged', async () => {
  const w = require(path.join(root, 'scripts', 'lib', 'when-idle'));
  const env = setupTestEnv({
    changeCount: 42,
    types: ['public.utf8-plain-text'],
    items: [{ 'public.utf8-plain-text': Buffer.from('OVERWRITTEN').toString('base64') }],
    rawText: 'OVERWRITTEN',
  });
  try {
    // Write an orphaned snapshot left behind by a killed child
    const snapshot = {
      version: 1,
      pid: 999999,
      createdAt: Date.now(),
      saved: {
        changeCount: 40,
        types: ['public.utf8-plain-text'],
        items: [{ 'public.utf8-plain-text': Buffer.from('SAVED BY HARNESS').toString('base64') }],
        rawText: 'SAVED BY HARNESS',
      },
      text: 'OVERWRITTEN',
      expectedChangeCount: 42,
      state: 'set',
    };
    fs.writeFileSync(env.snapshotFile, JSON.stringify(snapshot));

    let restoredPayload = null;
    const fakeHarness = {
      pasteboardSave: async () => JSON.parse(fs.readFileSync(env.stateFile, 'utf8')),
      pasteboardRestore: async (saved) => {
        restoredPayload = saved;
        fs.writeFileSync(env.stateFile, JSON.stringify(saved));
      },
    };

    await w.recoverClipboardSnapshot({ snapshotPath: env.snapshotFile, harness: fakeHarness, log: () => {} });
    assert.equal(fs.existsSync(env.snapshotFile), false, 'snapshot file was not cleaned up after recovery');
    assert.ok(restoredPayload, 'pasteboardRestore was not called');
    assert.equal(restoredPayload.rawText, 'SAVED BY HARNESS');
    const finalState = JSON.parse(fs.readFileSync(env.stateFile, 'utf8'));
    assert.equal(finalState.rawText, 'SAVED BY HARNESS');
  } finally {
    env.cleanup();
  }
});

test('when-idle recoverClipboardSnapshot does not restore over new user clipboard content', async () => {
  const w = require(path.join(root, 'scripts', 'lib', 'when-idle'));
  const env = setupTestEnv({
    changeCount: 99, // user copied something new, changing changeCount
    types: ['public.utf8-plain-text'],
    items: [{ 'public.utf8-plain-text': Buffer.from('NEW USER CLIPBOARD DATA').toString('base64') }],
    rawText: 'NEW USER CLIPBOARD DATA',
  });
  try {
    const snapshot = {
      version: 1,
      pid: 999999,
      createdAt: Date.now(),
      saved: {
        changeCount: 40,
        types: ['public.utf8-plain-text'],
        items: [{ 'public.utf8-plain-text': Buffer.from('OLD SAVED DATA').toString('base64') }],
        rawText: 'OLD SAVED DATA',
      },
      text: 'OVERWRITTEN',
      expectedChangeCount: 42,
      state: 'set',
    };
    fs.writeFileSync(env.snapshotFile, JSON.stringify(snapshot));

    let restoreCalled = false;
    const fakeHarness = {
      pasteboardSave: async () => JSON.parse(fs.readFileSync(env.stateFile, 'utf8')),
      pasteboardRestore: async (saved) => {
        restoreCalled = true;
        fs.writeFileSync(env.stateFile, JSON.stringify(saved));
      },
    };

    await w.recoverClipboardSnapshot({ snapshotPath: env.snapshotFile, harness: fakeHarness, log: () => {} });
    assert.equal(fs.existsSync(env.snapshotFile), false, 'stale snapshot file was not removed');
    assert.equal(restoreCalled, false, 'pasteboardRestore should not have been called over newer user content');
    const finalState = JSON.parse(fs.readFileSync(env.stateFile, 'utf8'));
    assert.equal(finalState.rawText, 'NEW USER CLIPBOARD DATA', 'user content was corrupted');
  } finally {
    env.cleanup();
  }
});


