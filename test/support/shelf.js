'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const { scratch } = require('./sandbox');
const island = require('./island');
const procs = require('./procs');

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

function scratchScreenshots(w) {
  return scratchDesktop(w);
}

let originalScreenshotLocation = null;
let screenshotLocationCleaned = true;

function setupScreenshotLocation(w, targetDir) {
  const dir = targetDir || scratchDesktop(w);
  fs.mkdirSync(dir, { recursive: true });

  let orig = null;
  try {
    orig = execSync('defaults read com.apple.screencapture location 2>/dev/null', {
      encoding: 'utf8',
    }).trim();
  } catch {
    orig = null;
  }

  try {
    execSync(`defaults write com.apple.screencapture location "${dir}"`);
  } catch (e) {
    // defaults write fallback
  }

  w.defer(() => {
    try {
      if (orig) {
        execSync(`defaults write com.apple.screencapture location "${orig}"`);
      } else {
        execSync('defaults delete com.apple.screencapture location 2>/dev/null || true');
      }
    } catch {
      // ignore
    }
  });

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
  scratchScreenshots,
  setupScreenshotLocation,
  restartIsland,
};
