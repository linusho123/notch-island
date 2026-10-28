'use strict';
// Reading a D110 capture-check result. The island draws black over a white
// backdrop; a capture that holds it is dark there. A dark capture is only
// evidence against D110 when no window of anyone else sits over the rect.

function describeForeign(list) {
  return list.map((w) => `${w.owner || 'unknown'} (pid ${w.pid})`).join(', ');
}

/** { ok, kind: 'ok' | 'environment' | 'd110' | 'no-shot', message } */
function captureVerdict(shots) {
  if (!shots.screencapture) {
    return { ok: false, kind: 'no-shot', message: 'screencapture took no shot (Screen Recording permission?)' };
  }
  if (!shots.screenCaptureKit) {
    return { ok: false, kind: 'no-shot', message: `ScreenCaptureKit took no capture: ${shots.screenCaptureKitError}` };
  }
  const bright = shots.screencapture.mean > 0.9 && shots.screenCaptureKit.mean > 0.9;
  if (bright) return { ok: true, kind: 'ok', message: '' };
  const foreign = shots.foreignWindows || [];
  if (foreign.length) {
    return {
      ok: false,
      kind: 'environment',
      message: `the check cannot tell: another window sits over the measured area (${describeForeign(foreign)}). `
        + 'Close it and run again; this does not say D110 is false.',
    };
  }
  const parts = [];
  if (shots.screencapture.mean <= 0.9) parts.push(`screencapture shows the island (mean ${shots.screencapture.mean.toFixed(2)})`);
  if (shots.screenCaptureKit.mean <= 0.9) parts.push(`ScreenCaptureKit shows the island (mean ${shots.screenCaptureKit.mean.toFixed(2)})`);
  return { ok: false, kind: 'd110', message: parts.join('; ') };
}

module.exports = { captureVerdict };

// V2a: both capture paths must contain the normally shared two-colour
// control in the measured island rect, and match the same rect with the
// island closed. Measurements come from captured pixels, never app input.
function sharedCaptureVerdict(shots) {
  if (shots.service) {
    try { require('./service-evidence').validate(shots.service.name, shots.service.evidence); }
    catch (e) { return { ok: false, kind: 'prerequisite', message: e.message }; }
  }
  if (shots.timeline) {
    const temporal = intervalVerdict(shots.timeline);
    if (!temporal.ok) return temporal;
  }
  if (shots.playback) {
    const playback = intervalVerdict({ ...shots.timeline, ...shots.playback });
    if (!playback.ok) return playback;
  }
  for (const name of ['screencapture', 'screenCaptureKit']) {
    const s = shots[name];
    if (!s) return { ok: false, kind: 'no-shot', message: `${name}: no capture` };
    if (!(s.control >= 0.9) || !(s.baselineControl >= 0.9)) {
      return { ok: false, kind: 'no-control', message: `${name}: nothing on screen — the control window is absent` };
    }
    if (!Number.isFinite(s.changedFraction) || s.changedFraction > 0.015) {
      return { ok: false, kind: 'd110', message: `${name}: island rect differs from the plain reference (${s.changedFraction})` };
    }
  }
  return { ok: true, kind: 'ok', message: '' };
}
module.exports.sharedCaptureVerdict = sharedCaptureVerdict;

// Every delivered frame in the bounded action interval is checked. Delivery
// time is deliberately irrelevant: these are window-server capture times (or
// the control clock decoded from the movie). A clean last frame cannot erase
// an earlier leak. Gaps/overflows invalidate evidence instead of dropping it.
function intervalVerdict(t) {
  const bad = (message) => ({ ok: false, kind: 'interval', message });
  if (!(Number.isFinite(t.start) && Number.isFinite(t.end) && t.end > t.start && t.end - t.start <= 30)
    || !Array.isArray(t.frames) || !t.frames.length || t.frames.length > 1800 || t.overflow) return bad('no bounded capture interval');
  if (!Array.isArray(t.visible) || t.visible.length !== 2 || t.visible[0] < t.start
    || t.visible[1] > t.end || t.visible[1] <= t.visible[0]) return bad('no contemporaneous visible-island interval');
  let previous = t.start;
  let id = -1;
  for (const f of t.frames) {
    if (!Number.isFinite(f.captured) || f.captured < previous || f.id <= id
      || f.captured - previous > 0.3) return bad('stale, unordered or missing capture frames');
    if (!(f.control >= 0.9) || !(f.baselineControl >= 0.9)) return bad('nothing on screen — the control window is absent');
    if (!Number.isFinite(f.changedFraction) || f.changedFraction > 0.015) return bad('island rect differs from the plain reference during the action');
    previous = f.captured;
    id = f.id;
  }
  if (previous < t.end) return bad('capture does not span the action');
  return { ok: true, kind: 'ok', message: '' };
}
module.exports.intervalVerdict = intervalVerdict;
