'use strict';
// A click on the time line seeks; the dot and the elapsed time go to the
// clicked spot and stay there. They never flash back to where the song was
// while Music is still applying the seek (a stale position poll), and they
// end at the clicked spot (D25, D124). Far side: the island's drawn dot and
// elapsed time through Accessibility, and Music's own position.
const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./support/harness');
const island = require('./support/island');
const music = require('./support/music');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const center = (f) => ({ x: f.x + f.w / 2, y: f.y + f.h / 2 });
const secs = (t) => { const m = /^(\d+):(\d\d)$/.exec(t); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

test('a click on the time line shows the clicked spot at once and never flashes back', async (t) => {
  const defers = [];
  const world = { defer: (fn) => defers.push(fn) };
  t.after(async () => { for (const fn of defers.reverse()) await fn(); });

  await music.play('Wonderwall', 20);
  defers.push(() => music.pause().catch(() => {}));
  const { pid } = await island.launch(world);
  const n = (await harness.builtIn()).notch;
  const c = await harness.notchCenter();
  await harness.move(c.x, n.y + n.h + 150);
  await harness.glide(c.x, c.y, 10, 10);
  const view = await island.waitFor(pid, (v) => v.open && v.page === 'music' && v.bar && v.dot, 3000,
    'the island did not open with a progress bar');
  const f = view.bar.frame;
  const duration = (await music.state()).duration;
  const target = duration * 0.7;
  const x = f.x + f.w * 0.7;
  await harness.glide(x, f.y + f.h / 2, 5, 10);
  await sleep(300);

  await harness.click(x, f.y + f.h / 2);
  const samples = (await harness.watch(pid, 1500, 25)).map((s) => island.parse(s.windows, n));
  const elapsed = samples.map((v) => v.texts.map(secs).find((s) => s !== null && s !== Math.round(duration)));
  const known = elapsed.filter((s) => s !== undefined);
  assert.ok(known.length > 20, 'the island was not watched');
  // The only pre-seek spot is about 0:20 to 0:25; nothing near it may show after the click.
  const back = known.findIndex((s) => s < target * 0.5);
  assert.equal(back, -1, `the elapsed time fell back to ${known[back]} s after the click (target ${Math.round(target)} s): ${known.join(' ')}`);
  const dots = samples.filter((v) => v.dot && v.bar).map((v) => (center(v.dot.frame).x - v.bar.frame.x) / v.bar.frame.w);
  assert.ok(dots.every((d) => d > 0.5), `the dot flashed back along the bar: ${dots.map((d) => d.toFixed(2)).join(' ')}`);
  const end = known[known.length - 1];
  assert.ok(Math.abs(end - (await music.state()).position) <= 3, `the island ends at ${end} s, Music is at ${(await music.state()).position} s`);
});
