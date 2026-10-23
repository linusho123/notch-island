'use strict';
// "One real-system binding per injected outline" (BUILD-PLAN, acceptance
// bars): the MacBook-speakers rows use the real system's output. With
// headphones connected they used to inject the built-in speakers with only a
// note on stderr, so the real-system binding vanished unseen (P2 fix S6). Now
// the run fails with the reason unless injecting is asked for.
const test = require('node:test');
const assert = require('node:assert/strict');
const { planMacBookSpeakers } = require('./support/speakers');

test('with the built-in speakers as the real output, the real system is used', () => {
  assert.deepEqual(planMacBookSpeakers({ name: 'MacBook Air Speakers', builtIn: true }, {}), { inject: false });
});

test('with headphones connected the run fails and says why', () => {
  assert.throws(() => planMacBookSpeakers({ name: 'AirPods', builtIn: false }, {}), /AirPods.*ISLAND_ALLOW_INJECTED_SPEAKERS/s);
});

test('injecting is allowed only when asked for, and is reported', () => {
  const plan = planMacBookSpeakers({ name: 'AirPods', builtIn: false }, { ISLAND_ALLOW_INJECTED_SPEAKERS: '1' });
  assert.equal(plan.inject, true);
  assert.match(plan.note, /AirPods/);
});
