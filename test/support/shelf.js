'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execSync, execFileSync } = require('node:child_process');
const cleanup = require('./cleanup');
const { scratch } = require('./sandbox');
const island = require('./island');
const procs = require('./procs');
const paths = require('./paths');

let customHdiutilRunner = null;
function _setHdiutilRunner(runner) {
  customHdiutilRunner = runner;
}

function runHdiutil(args, opts = {}) {
  if (customHdiutilRunner) {
    return customHdiutilRunner(args, opts);
  }
  return execFileSync('/usr/bin/hdiutil', args, opts);
}

function detachStaleScratchImages() {
  try {
    const out = runHdiutil(['info'], { encoding: 'utf8' });
    const blocks = String(out || '').split(/^={40,}$/m);
    const scratchBase = path.join(os.tmpdir(), 'notch-island-tests');
    for (const block of blocks) {
      if (!block.trim()) continue;
      const imagePathMatch = block.match(/image-path\s*:\s*(.+)$/m);
      const imagePath = imagePathMatch ? imagePathMatch[1].trim() : '';
      const isUnderScratch = imagePath && (imagePath.includes('/notch-island-tests/') || imagePath.startsWith(scratchBase));
      const hasExactVolumeName = block.includes('NotchIslandScratchDocs');
      if (isUnderScratch || hasExactVolumeName) {
        const devMatches = [...block.matchAll(/\/dev\/disk\d+(?![a-z0-9])/g)].map((m) => m[0]);
        for (const dev of devMatches) {
          try {
            runHdiutil(['detach', dev, '-force', '-quiet']);
          } catch {}
        }
      }
    }
  } catch {}
}

function scratchDesktop(w) {
  const dir = path.join(scratch(w), 'Desktop');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function scratchVolume(w) {
  if (w && w._scratchVolumeDir) return w._scratchVolumeDir;
  detachStaleScratchImages();
  const mountDir = path.join(scratch(w), 'ScratchVolume');
  fs.mkdirSync(mountDir, { recursive: true });
  if (process.env.NOTCH_ISLAND_FORCE_HDIUTIL_FAIL === '1') {
    throw new Error('scratch disk image creation or attach failed: forced failure');
  }
  if (w) {
    const dmg = path.join(scratch(w), 'documents.dmg');
    w._scratchVolumeDir = mountDir;
    let mounted = false;
    const detach = () => {
      if (!mounted && !w._scratchDocsMounted) return;
      mounted = false;
      w._scratchDocsMounted = false;
      try {
        runHdiutil(['detach', mountDir, '-force', '-quiet']);
      } catch {}
      detachStaleScratchImages();
    };
    w.defer(detach);
    cleanup.onCleanup(detach);

    try {
      runHdiutil(['create', '-size', '20m', '-fs', 'APFS', '-volname', 'NotchIslandScratchDocs', dmg, '-quiet']);
      mounted = true;
      w._scratchDocsMounted = true;
      runHdiutil(['attach', dmg, '-mountpoint', mountDir, '-nobrowse', '-quiet']);
    } catch (err) {
      mounted = false;
      w._scratchDocsMounted = false;
      delete w._scratchVolumeDir;
      try {
        runHdiutil(['detach', mountDir, '-force', '-quiet']);
      } catch {}
      detachStaleScratchImages();
      throw new Error(`scratch disk image creation or attach failed: ${err.message}`);
    }
  }
  return mountDir;
}

function scratchDocuments(w) {
  if (w && w._scratchDocsDir) return w._scratchDocsDir;
  const vol = scratchVolume(w);
  const dir = path.join(vol, 'Documents');
  fs.mkdirSync(dir, { recursive: true });
  if (w) w._scratchDocsDir = dir;
  return dir;
}

function detachScratchDocuments(w) {
  if (w && w._scratchDocsMounted) {
    w._scratchDocsMounted = false;
    const target = w._scratchVolumeDir || w._scratchDocsDir;
    if (target) {
      try {
        runHdiutil(['detach', target, '-force', '-quiet']);
      } catch {}
    }
    detachStaleScratchImages();
  }
}

function scratchArchive(w) {
  const vol = scratchVolume(w);
  const dir = path.join(vol, 'Archive');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function scratchBackup(w) {
  const dir = path.join(scratch(w), 'Backup');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function launchDropStandIn(world, options = {}) {
  const out = path.join(os.tmpdir(), `notch-island-drop-out-${process.pid}-${Date.now()}.out`);
  const log = path.join(os.tmpdir(), `notch-island-drop-log-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(out, '');
  fs.writeFileSync(log, '');
  world.defer(() => {
    fs.rmSync(out, { force: true });
    fs.rmSync(log, { force: true });
  });

  const args = ['drop-stand-in', String(options.seconds || 900), log];
  if (options.title) args.push('--title', options.title);
  if (options.x !== undefined) args.push('--x', String(options.x));
  if (options.y !== undefined) args.push('--y', String(options.y));
  if (options.w !== undefined) args.push('--w', String(options.w));
  if (options.h !== undefined) args.push('--h', String(options.h));
  if (options.refuse) args.push('--refuse');
  if (options.maxSize) args.push('--max-size', String(options.maxSize));
  if (options.moveTo) args.push('--move-to', options.moveTo);
  if (options.copyTo) args.push('--copy-to', options.copyTo);

  execFileSync('open', ['-n', '-a', paths.dropStandInApp, '--stdout', out,
    '--env', `NOTCH_ISLAND_OWNER_PID=${process.pid}`, '--args', ...args],
    { timeout: 20000 });

  const pid = await island.until(() => {
    const m = /"pid"\s*:\s*(\d+)/.exec(fs.readFileSync(out, 'utf8'));
    return m ? Number(m[1]) : null;
  }, 10000, 'the drop stand-in did not start');

  const winMatch = await island.until(() => {
    const m = /"window"\s*:\s*(\{[^}]+\})/.exec(fs.readFileSync(out, 'utf8'));
    return m ? JSON.parse(m[1]) : null;
  }, 10000, 'the drop stand-in window was not reported');

  const handle = procs.adopt('drop stand-in', pid);
  world.defer(() => procs.stop(handle));

  return {
    handle,
    pid,
    window: winMatch,
    logFile: log,
    readLog: () => {
      try {
        const content = fs.readFileSync(log, 'utf8').trim();
        return content ? JSON.parse(content) : null;
      } catch {
        return null;
      }
    },
    assertReceived: async (filename) => {
      const data = await island.until(() => {
        try {
          const content = fs.readFileSync(log, 'utf8').trim();
          return content ? JSON.parse(content) : null;
        } catch {
          return null;
        }
      }, 3000, `drop-stand-in never logged receipt of ${filename}`);
      assert.ok(
        data && data.received && data.received.some((r) => r.name.includes(filename)),
        `expected drop-stand-in to receive ${filename}, but received: ${JSON.stringify(data)}`
      );
    },
    assertEmpty: () => {
      try {
        const content = fs.readFileSync(log, 'utf8').trim();
        const data = content ? JSON.parse(content) : null;
        assert.ok(
          !data || !data.received || data.received.length === 0,
          `expected drop-stand-in to be empty, but received: ${JSON.stringify(data)}`
        );
      } catch (err) {
        if (err.code === 'ERR_ASSERTION') throw err;
      }
    },
  };
}

function scratchScreenshots(w) {
  return scratchDesktop(w);
}

function setupScreenshotLocation(w, targetDir) {
  const dir = targetDir || scratchDesktop(w);
  fs.mkdirSync(dir, { recursive: true });
  island.feed(w, { screenshotDirectory: dir });
  return dir;
}

async function restartIsland(w, how) {
  island.feed(w, { clearShelf: false, seedShelf: null });
  const old = w.island;
  if (old && !old.exited) {
    if (how === 'after a crash') {
      try {
        process.kill(old.pid, 'SIGKILL');
      } catch {}
      while (procs.alive(old)) {
        await procs.sleep(40);
      }
    } else {
      await procs.stop(old);
    }
  }
  w.island = null;
  await procs.sleep(100);
  return await island.launch(w);
}

async function assertShelfItem(w, label, expectedCount = 1) {
  const view = await island.waitFor(
    w.island.pid,
    (v) => v.elements.filter((e) => e.identifier === 'shelf-item').length === expectedCount &&
           v.texts.includes(label),
    3000,
    `expected ${expectedCount} shelf item(s) showing "${label}"`
  );
  const items = view.elements.filter((e) => e.identifier === 'shelf-item');
  assert.equal(items.length, expectedCount, `expected ${expectedCount} item(s) on shelf, found ${items.length}`);
  assert.ok(view.texts.includes(label), `expected exact label "${label}" on shelf, found: ${view.texts.join(', ')}`);
}

async function assert24HourBoundary(w, filename, openShelfFn) {
  const t859 = '2026-10-19T08:59:00Z';
  island.feed(w, { clockDate: t859 });
  if (openShelfFn) {
    await openShelfFn(w);
  }
  const view = await island.waitFor(
    w.island.pid,
    (v) => v.open && v.page === 'shelf' && v.texts.includes(filename),
    3000,
    `${filename} aged off early at 8:59 am (before 24 hours)`
  );
  assert.ok(view.texts.includes(filename), `${filename} aged off early at 8:59 am (before 24 hours)`);

  const t900 = '2026-10-19T09:00:00Z';
  island.feed(w, { clockDate: t900 });
  await island.waitFor(
    w.island.pid,
    (v) => !v.texts.includes(filename),
    3000,
    `${filename} did not leave the shelf at 9:00 am (after 24 hours)`
  );
}

module.exports = {
  scratchDesktop,
  scratchDocuments,
  detachScratchDocuments,
  scratchArchive,
  scratchBackup,
  scratchScreenshots,
  setupScreenshotLocation,
  restartIsland,
  launchDropStandIn,
  assertShelfItem,
  assert24HourBoundary,
  _setHdiutilRunner,
};
