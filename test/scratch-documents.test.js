'use strict';
// MF2 / FU6: scratch disk image management:
// - forced hdiutil failure fails with a plain message, never falls back to boot volume
// - leftover attached NotchIslandScratchDocs images from killed runs are detached before attach
// - detach cleanup (defer + onCleanup) is registered before attach
const test = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
process.env.NOTCH_ISLAND_POST_STAMP = process.env.NOTCH_ISLAND_POST_STAMP || '/tmp/screen-free-scratch-test';
const cleanup = require('./support/cleanup');
const { scratchDocuments } = require('./support/shelf');

const originalExecFileSync = cp.execFileSync;
const originalOnCleanup = cleanup.onCleanup;

function withHdiutilRunner(runner, fn) {
  const shelf = require('./support/shelf');
  if (typeof shelf._setHdiutilRunner === 'function') {
    shelf._setHdiutilRunner(runner);
    try {
      return fn(shelf);
    } finally {
      shelf._setHdiutilRunner(null);
    }
  }

  delete require.cache[require.resolve('./support/shelf')];
  cp.execFileSync = (bin, args, opts) => {
    if (bin === '/usr/bin/hdiutil' || bin === 'hdiutil') {
      return runner(args, opts);
    }
    return originalExecFileSync(bin, args, opts);
  };
  try {
    const freshShelf = require('./support/shelf');
    return fn(freshShelf);
  } finally {
    cp.execFileSync = originalExecFileSync;
    delete require.cache[require.resolve('./support/shelf')];
  }
}

test('forced hdiutil failure makes scratchDocuments fail with a plain message, never falls back to boot volume', () => {
  const world = { defer: () => {} };
  process.env.NOTCH_ISLAND_FORCE_HDIUTIL_FAIL = '1';
  try {
    assert.throws(
      () => scratchDocuments(world),
      /scratch disk image creation or attach failed/
    );
  } finally {
    delete process.env.NOTCH_ISLAND_FORCE_HDIUTIL_FAIL;
  }
});

test('FU6: leftover attached NotchIslandScratchDocs image from an earlier run is detached before attaching', () => {
  const calls = [];
  const fakeHdiutilInfo = `framework       : 683.160.3
driver          : 683.160.3
images          : 2
================================================
image-path      : /Users/someone/Downloads/Unrelated.dmg
/dev/disk2\tGUID_partition_scheme\t
/dev/disk2s1\t41504653-0000-11AA-AA11-00306543ECAC\t/Volumes/Unrelated
================================================
image-path      : /var/folders/8f/9sh8xvl57bxd4lyh200nfv2r0000gn/T/notch-island-tests/scenario-stale/documents.dmg
/dev/disk4\tGUID_partition_scheme\t
/dev/disk4s1\t7C3457EF-0000-11AA-AA11-00306543ECAC\t
/dev/disk5\tEF57347C-0000-11AA-AA11-00306543ECAC\t
/dev/disk5s1\t41504653-0000-11AA-AA11-00306543ECAC\t/Volumes/NotchIslandScratchDocs
`;

  withHdiutilRunner((args) => {
    calls.push(args);
    if (args[0] === 'info') return fakeHdiutilInfo;
    return '';
  }, (shelf) => {
    const world = { defer: () => {} };
    shelf.scratchDocuments(world);
  });

  const detachCalls = calls.filter((c) => c[0] === 'detach');
  const attachIndex = calls.findIndex((c) => c[0] === 'attach');

  const detachedStale = detachCalls.some((c) => c.includes('/dev/disk4'));
  assert.ok(detachedStale, 'expected stale scratch disk image /dev/disk4 to be detached before attaching');

  const detachStaleIndex = calls.findIndex((c) => c[0] === 'detach' && c.includes('/dev/disk4'));
  assert.ok(detachStaleIndex >= 0 && detachStaleIndex < attachIndex, 'stale image detach must happen before attach');

  const detachedUnrelated = detachCalls.some((c) => c.includes('/dev/disk2'));
  assert.ok(!detachedUnrelated, 'must never detach an unrelated disk image');
});

test('FU6: detach cleanup (defer and onCleanup) is registered BEFORE calling attach', () => {
  let detachDeferredBeforeAttach = false;
  let detachOnCleanupBeforeAttach = false;
  const defers = [];
  const world = { defer: (fn) => defers.push(fn) };

  let cleanupCount = 0;
  cleanup.onCleanup = (fn) => {
    cleanupCount++;
    return originalOnCleanup(fn);
  };

  try {
    withHdiutilRunner((args) => {
      if (args[0] === 'attach') {
        detachDeferredBeforeAttach = defers.length > 1;
        detachOnCleanupBeforeAttach = cleanupCount > 0;
      }
      return '';
    }, (shelf) => {
      shelf.scratchDocuments(world);
    });
  } finally {
    cleanup.onCleanup = originalOnCleanup;
  }

  assert.ok(detachDeferredBeforeAttach, 'expected detach cleanup to be registered with w.defer before attach');
  assert.ok(detachOnCleanupBeforeAttach, 'expected detach cleanup to be registered with onCleanup before attach');
});
