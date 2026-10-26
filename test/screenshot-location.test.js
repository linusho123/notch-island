'use strict';
// MF1: test that no test touches com.apple.screencapture defaults (leaks state
// onto the visionary's Mac) and that island.launch always feeds a scratch
// screenshotDirectory.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function findJsFiles(dir) {
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(findJsFiles(full));
    } else if (entry.name.endsWith('.js')) {
      results.push(full);
    }
  }
  return results;
}

test('no test file writes com.apple.screencapture defaults', () => {
  const testDir = __dirname;
  const jsFiles = findJsFiles(testDir);
  for (const file of jsFiles) {
    if (path.resolve(file) === path.resolve(__filename)) continue;
    const content = fs.readFileSync(file, 'utf8');
    assert.ok(
      !content.includes('defaults write com.apple.screencapture'),
      `${path.relative(testDir, file)} writes com.apple.screencapture defaults`
    );
  }
});

test('setupScreenshotLocation does not use global defaults or leaked state variables', () => {
  const shelfSrc = fs.readFileSync(path.join(__dirname, 'support', 'shelf.js'), 'utf8');
  assert.ok(!shelfSrc.includes('originalScreenshotLocation'), 'shelf.js still defines originalScreenshotLocation');
  assert.ok(!shelfSrc.includes('screenshotLocationCleaned'), 'shelf.js still defines screenshotLocationCleaned');
  assert.ok(!shelfSrc.includes('defaults write com.apple.screencapture'), 'shelf.js still writes screencapture defaults');
});

test('island.launch always feeds a scratch screenshotDirectory', () => {
  const islandSrc = fs.readFileSync(path.join(__dirname, 'support', 'island.js'), 'utf8');
  assert.match(islandSrc, /feed\([^)]*screenshotDirectory/s, 'island.launch does not feed screenshotDirectory');
});
