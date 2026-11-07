'use strict';
// The scope skill's own validation script (scope 5.1.1, SKILL.md "Run the
// script, and trust the exit code"), kept verbatim but for reading its file
// arguments as a script: `node scripts/scope-check.js features/*.feature`.
// It refuses a clean report over a missing fence, ledger, design doc or
// docket, and runs the docket lint under --strict.
const { lintFeature, parseFeature } = require(process.env.GNT || "gherkin-node-test");
const fs = require("fs");
const probe = lintFeature(
  "Feature: p\n  @only\n  Scenario: s\n    Given g\n    Then the count is 1\n",
  "probe", { strict: true });
if (!probe.some((f) => f.rule === "strict-tag")) {
  console.error("linter too old: no strict-tag under {strict:true} — this contract needs gherkin-node-test >= 0.9.0");
  process.exit(1);
}
try {
  require.resolve("@bingh/docketry/package.json");
} catch (e) {
  console.error("docketry not installed — the docket is the fifth surface and its lint the fifth refusal: npm i -D @bingh/docketry@0.2.0");
  process.exit(1);
}
const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("no feature files passed — a clean report over nothing is vacuous");
  process.exit(1);
}
const missing = files.filter((f) => !fs.existsSync(f));
if (missing.length) {
  console.error(`not found (unexpanded glob? wrong directory?): ${missing.join(" ")}`);
  process.exit(1);
}
const path = require("path");
const dir = path.dirname(files[0]);
const fence = [path.join(dir, "OUT-OF-SCOPE.md"), path.join(dir, "..", "OUT-OF-SCOPE.md")]
  .find((p) => fs.existsSync(p) && fs.readFileSync(p, "utf8").trim().length > 0);
if (!fence) {
  console.error(`fence missing or empty (looked beside the files and one level up) — the fence is a fifth of the deliverable, and a clean report without it is vacuous`);
  process.exit(1);
}
const ledger = [path.join(dir, "USER-NEEDS.md"), path.join(dir, "..", "USER-NEEDS.md")]
  .find((p) => fs.existsSync(p) && fs.readFileSync(p, "utf8").trim().length > 0);
if (!ledger) {
  console.error(`needs ledger missing or empty (looked beside the files and one level up) — the ledger is a fifth of the deliverable, and a clean report without it is vacuous`);
  process.exit(1);
}
const design = [path.join(dir, "DESIGN.md"), path.join(dir, "..", "DESIGN.md")]
  .find((p) => fs.existsSync(p) && fs.readFileSync(p, "utf8").trim().length > 0);
if (!design) {
  console.error(`design doc missing or empty (looked beside the files and one level up) — DESIGN.md is a fifth of the deliverable, and a clean report without it is vacuous`);
  process.exit(1);
}
if (!/^#{1,6}\s*Changelog\b/im.test(fs.readFileSync(design, "utf8"))) {
  console.error(`design doc has no Changelog heading (${design}) — the edit doctrine hangs on the changelog, and a doc born without one starts life indistinguishable from drift`);
  process.exit(1);
}
const docket = [path.join(dir, "DOCKET.md"), path.join(dir, "..", "DOCKET.md")]
  .find((p) => fs.existsSync(p) && fs.readFileSync(p, "utf8").trim().length > 0);
if (!docket) {
  console.error(`docket missing or empty (looked beside the files and one level up) — the docket is a fifth of the deliverable, and a clean report without it is vacuous`);
  process.exit(1);
}
const docketLint = require("child_process").spawnSync(
  "npx", ["--no-install", "docketry", "lint", docket, "--corpus", dir, "--strict"],
  { encoding: "utf8" });
if (docketLint.status !== 0) {
  process.stdout.write(docketLint.stdout || "");
  process.stderr.write(docketLint.stderr || "");
  console.error(docketLint.status === 1
    ? "docket lint: findings under --strict (exit 1) — the docket is not handoff-clean"
    : `docket lint: could not run (exit ${docketLint.status}) — no verdict was produced, so none may be quoted`);
  process.exit(1);
}
let bad = 0, plain = 0, outlines = 0;
for (const f of files) {
  const text = fs.readFileSync(f, "utf8");
  for (const x of lintFeature(text, f, { strict: true })) {
    bad += 1;
    console.log(`${f}:${x.line}: [${x.rule}] ${x.severity}: ${x.message}`);
  }
  try {
    const parsed = parseFeature(text, f);
    plain += parsed.scenarios.length - parsed.outlines.reduce((n, o) => n + o.rows, 0);
    outlines += parsed.outlines.length;
  } catch (e) {
    bad += 1;
    console.log(`${f}: [parse] error: ${e.message}`);
  }
}
if (bad) process.exit(1);
console.log("scope-clean: zero strict findings");
console.log("corpus: " + files.map((f) => path.resolve(f)).join(" "));
console.log("fence: " + path.resolve(fence));
console.log("ledger: " + path.resolve(ledger));
console.log("design: " + path.resolve(design));
console.log("docket: " + path.resolve(docket));
console.log(`stats: ${files.length} feature files, ${plain} scenarios, ${outlines} scenario outlines`);
console.log("docket lint (strict, exit 0) — read these counted lines aloud at handoff:");
process.stdout.write(docketLint.stdout);
