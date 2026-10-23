'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { showsFaceWithCount } = require('./support/looks');

const view = (title, count) => ({ title: { value: title }, count: count && { value: count } });

test('a look shows the face with the count only when it shows both at once', () => {
  assert.equal(showsFaceWithCount(view('Lecture 4: Fourier Series', '1 of 3'), 'Lecture 4: Fourier Series', '1 of 3'), true);
  // The count is right but another face is in front: the card was never so.
  assert.equal(showsFaceWithCount(view('holiday.mov', '1 of 3'), 'Lecture 4: Fourier Series', '1 of 3'), false);
  assert.equal(showsFaceWithCount(view('Lecture 4: Fourier Series', '2 of 3'), 'Lecture 4: Fourier Series', '1 of 3'), false);
  assert.equal(showsFaceWithCount(view('Lecture 4: Fourier Series', null), 'Lecture 4: Fourier Series', '1 of 3'), false);
});

test('with no face seen before, the count alone is looked for', () => {
  assert.equal(showsFaceWithCount(view('anything', '2 of 2'), null, '2 of 2'), true);
  assert.equal(showsFaceWithCount(view('anything', '1 of 2'), null, '2 of 2'), false);
});
