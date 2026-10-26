'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execSync, execFileSync } = require('node:child_process');
const { scratch } = require('./sandbox');
const island = require('./island');
const procs = require('./procs');
const paths = require('./paths');

function scratchDesktop(w) {
  const dir = path.join(scratch(w), 'Desktop');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function scratchDocuments(w) {
  const dir = path.join(scratch(w), 'Documents');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function scratchArchive(w) {
  const dir = path.join(scratch(w), 'Archive');
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

module.exports = {
  scratchDesktop,
  scratchDocuments,
  scratchArchive,
  scratchBackup,
  scratchScreenshots,
  setupScreenshotLocation,
  restartIsland,
  launchDropStandIn,
};
