'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const motion = require('./support/motion');

test('SF11: status item colliding with Meter width fails as plain environment (S4 carried)', () => {
  const f = { x: 944, y: 0, w: 20, h: 24 };
  const n = { x: 672, y: 0, w: 276, h: 32 }; // n.x + n.w = 948 > 944
  assert.throws(
    () => motion.assertStatusItemRightOfNotch(f, n),
    (err) => {
      assert.match(err.message, /^environment: the status item \(x 944\) is not right of the notch/);
      assert.match(err.message, /Meter.*S4/);
      return true;
    }
  );
});

test('SF11: status item right of the notch passes', () => {
  const f = { x: 950, y: 0, w: 20, h: 24 };
  const n = { x: 672, y: 0, w: 276, h: 32 };
  assert.doesNotThrow(() => motion.assertStatusItemRightOfNotch(f, n));
});
