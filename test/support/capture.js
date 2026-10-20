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
