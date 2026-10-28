'use strict';
// R1: a proxy result cannot establish a Zoom/Meet viewer claim. The verifier
// supplies the reviewed prerequisite spike and its explicit mapping, with
// hashes tying it to real viewer artifacts. Never synthesize this evidence.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function validate(service, evidence) {
  assert.ok(['Zoom', 'Meet'].includes(service), 'unknown named capture service');
  assert.equal(evidence?.service, service, `R1: missing ${service} prerequisite spike`);
  assert.equal(evidence.source, `${service} viewer`, `R1: ${service} evidence is only a proxy`);
  assert.ok(evidence.version && evidence.macos && evidence.observedAt && evidence.reviewedBy,
    `R1: ${service} prerequisite lacks provenance/review`);
  assert.deepEqual(evidence.mapping?.checks, ['ScreenCaptureKit', 'screencapture']);
  assert.ok(evidence.mapping?.reason, `R1: no explicit ${service} mapping to proxy checks`);
  for (const kind of ['panel', 'wing']) {
    const row = evidence.observations?.[kind];
    assert.ok(row?.visibleLocally && row?.viewerControl && row?.islandAbsent && row?.artifact && row?.sha256,
      `R1: ${service} ${kind} lacks reviewed viewer evidence`);
  }
  return evidence;
}
function load(service, file = process.env.P6_SERVICE_EVIDENCE) {
  assert.ok(file, `BLOCKED: R1 requires real ${service} viewer spike evidence (P6_SERVICE_EVIDENCE); SCK/screencapture alone is insufficient`);
  const evidence = validate(service, JSON.parse(fs.readFileSync(file, 'utf8'))[service]);
  for (const row of Object.values(evidence.observations)) {
    assert.equal(hash(fs.readFileSync(path.resolve(path.dirname(file), row.artifact))), row.sha256,
      `R1: ${service} viewer artifact changed`);
  }
  return evidence;
}
module.exports = { validate, load };
