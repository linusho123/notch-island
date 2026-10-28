'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const base = path.join(os.tmpdir(), 'notch-island-tests');

function images(run) {
  return String(run(['info'], { encoding: 'utf8' }) || '').split(/^={40,}$/m).flatMap((block) => {
    const image = block.match(/^image-path\s*:\s*(.+)$/m)?.[1].trim();
    const devices = [...block.matchAll(/^(\/dev\/disk\d+)\s/gm)].map((m) => m[1]);
    return image ? [{ image, devices }] : [];
  });
}
function ownership(image) {
  try {
    const canonical = fs.realpathSync(image);
    const dir = path.dirname(canonical);
    if (canonical !== path.join(dir, 'documents.dmg') || path.dirname(dir) !== fs.realpathSync(base)
      || !/^scenario-[A-Za-z0-9]+$/.test(path.basename(dir))) return null;
    const record = path.join(dir, 'documents.mount.json');
    if (fs.lstatSync(record).isSymbolicLink()) return null;
    const saved = JSON.parse(fs.readFileSync(record, 'utf8'));
    const stat = fs.statSync(canonical);
    if (saved.image !== canonical || saved.ino !== stat.ino || saved.dev !== stat.dev
      || !/^\/dev\/disk\d+$/.test(saved.device)) return null;
    return { ...saved, record };
  } catch { return null; }
}
function record(image, device) {
  assert.match(device, /^\/dev\/disk\d+$/);
  const canonical = fs.realpathSync(image);
  const { ino, dev } = fs.statSync(canonical);
  fs.writeFileSync(path.join(path.dirname(image), 'documents.mount.json'),
    JSON.stringify({ image: canonical, device, ino, dev }), { flag: 'wx' });
  assert.ok(ownership(image), 'scratch image ownership was not recorded');
}
function detach(image, run, listed = images(run)) {
  const saved = ownership(image);
  if (!saved) return false;
  const mounted = listed.find((i) => {
    try { return fs.realpathSync(i.image) === saved.image && i.devices.includes(saved.device); } catch { return false; }
  });
  if (!mounted) return false;
  run(['detach', saved.device, '-force', '-quiet']);
  fs.rmSync(saved.record);
  return true;
}
function detachStale(run) {
  const listed = images(run);
  for (const { image } of listed) detach(image, run, listed);
}
module.exports = { record, detach, detachStale, images, ownership };
