import assert from "node:assert/strict";
import { readFileSync, realpathSync } from "node:fs";
import { basename, join } from "node:path";

export function readExactHelpProof(argv, source) {
  const positiveAt = argv.indexOf("--rendered-help");
  const negativeAt = argv.indexOf("--rendered-help-drift");
  if (positiveAt === -1 && negativeAt === -1) return null;
  assert.ok(
    positiveAt >= 0 && negativeAt >= 0,
    "Both rendered Help records are required",
  );
  const root = realpathSync(join(process.env.HOME, ".local/state/pmi-kc-help-rehearsal"));
  const evidenceDir = (arg) => {
    const path = realpathSync(arg);
    assert.equal(
      path,
      join(root, basename(path)),
      "Use one private native Help run directory",
    );
    return path;
  };
  const load = (dir, file) => JSON.parse(readFileSync(join(dir, file), "utf8"));
  const positive = evidenceDir(argv[positiveAt + 1]);
  const negative = evidenceDir(argv[negativeAt + 1]);
  const canonical = join(positive, "runtime/npm-run-verify-help-rendered/help-rendered");
  const sceneReport = load(canonical, "scenes.json");
  const checks = load(canonical, "controls.json");
  const receipt = load(positive, "evidence/npm-run-verify-help-rendered/result.json");
  assert.equal(receipt.exitCode, 0);
  assert.equal(receipt.namespaceMonitoringEstablished, true);
  assert.deepEqual(receipt.remainingOwnedProcesses, []);
  assert.match(receipt.sourceManifestSha256, /^[a-f0-9]{64}$/);
  assert.equal(sceneReport.sourceSha, source);
  assert.equal(sceneReport.servedCommit, source);
  assert.equal(sceneReport.overlay, false);
  assert.equal(sceneReport.helpVersion, "V3.0");
  assert.equal(sceneReport.scenes.length, 27);
  assert.deepEqual(sceneReport.drift, []);
  assert.deepEqual(sceneReport.uncaptured, []);
  assert.equal(checks.length, 831);
  assert.ok(
    checks.every(
      ({ state, availability }) =>
        state === "visible" ||
        (state === "unavailable" && availability === "conditional"),
    ),
  );
  assert.ok(
    checks.some(({ label, state }) => label === "Work status" && state === "visible"),
  );
  const driftRun = load(negative, "run.json");
  const drift = load(negative, "controls.json");
  assert.equal(driftRun.source_sha, source);
  assert.equal(driftRun.overlay, true);
  assert.equal(drift.length, 1);
  assert.equal(drift[0].label, "Work status");
  assert.equal(drift[0].availability, "required");
  assert.equal(drift[0].state, "missing");
  return {
    helpSource: source,
    helpSourceManifest: receipt.sourceManifestSha256,
    matchedScenes: sceneReport.scenes.length,
    checkedControls: checks.length,
    missingRequiredControls: 0,
    rejectedDrift: drift[0].label,
    canonicalRun: basename(positive),
    driftRun: basename(negative),
  };
}
