'use strict';
// Contract: the input guard tells the harness's own events from the
// visionary's by the tag the harness puts on every event it posts. Any event
// the helper posts untagged would void every UI run (or, worse, a guard that
// learned to ignore it would miss real input), so every post in the helper
// goes through the one tagging function. And no UI run starts except through
// the waiter. No screen is touched.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const helper = fs.readFileSync(path.join(root, 'Sources', 'island-harness', 'main.swift'), 'utf8');
const core = fs.readFileSync(path.join(root, 'Sources', 'HarnessCore', 'InputGuard.swift'), 'utf8');

test('every event the harness helper posts goes through the one tagging function', () => {
  const posts = helper.split('\n').filter((l) => /\.post\(\s*tap:/.test(l));
  assert.ok(posts.length >= 1, 'no post found at all');
  const outside = posts.filter((l) => !/\/\/ tagged-post\b/.test(l));
  assert.deepEqual(outside, [], 'a post outside postTagged');
  assert.equal(posts.length, 1, `posts: ${posts.join('\n')}`);
  assert.match(helper, /func postTagged\(_ e: CGEvent\)\s*\{\s*e\.setIntegerValueField\(\.eventSourceUserData, value: InputGuard\.tag\)/);
});

test('the helper makes no event it does not post through postTagged', () => {
  // Every CGEvent the helper creates for posting is handed to postTagged.
  const made = (helper.match(/CGEvent\(\s*(mouseEventSource|keyboardEventSource|scrollWheelEvent2Source):/g) || []).length;
  const tagged = (helper.match(/postTagged\(/g) || []).length - 1; // minus the definition
  assert.ok(made > 0);
  assert.ok(tagged >= made, `${made} events made, ${tagged} tagged posts`);
});

test('the tag the guard looks for is the tag the helper puts on', () => {
  assert.match(core, /public static let tag: Int64 = 0x4E4F_5443_4849_53/);
  assert.match(helper, /InputGuard\.origin\(/);
});

test('scripts/when-idle.sh starts the node waiter with the command', () => {
  const sh = fs.readFileSync(path.join(root, 'scripts', 'when-idle.sh'), 'utf8');
  assert.match(sh, /exec node .*when-idle\.js" "\$@"/);
  assert.ok(fs.statSync(path.join(root, 'scripts', 'when-idle.sh')).mode & 0o111, 'not executable');
});
