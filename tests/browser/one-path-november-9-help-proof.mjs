import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

const PRELOAD = "tests/browser/renewal-novdec-journey-network.mjs";

/**
 * The served commit's own Help inventory: its version, its scene manifest and the controls its
 * manual names (the same collectHelpControls the rendered gate checks), read from the served
 * worktree. A later Help release changes these numbers with its own content, never this proof.
 */
export function servedHelpInventory(cwd = process.cwd()) {
  const version = /export const HELP_VERSION = "(V[1-9]\d*\.\d+)";/.exec(
    readFileSync(join(cwd, "lib/help/version.ts"), "utf8"),
  )?.[1];
  assert.ok(version, "Read the served Help version");
  const manifest = JSON.parse(
    readFileSync(join(cwd, "lib/help/content/scenes.json"), "utf8"),
  );
  assert.equal(
    manifest.version,
    version,
    "The scene manifest is the served Help version",
  );
  assert.ok(Array.isArray(manifest.scenes) && manifest.scenes.length > 0);
  const dir = mkdtempSync(join(tmpdir(), "s260-help-controls-"));
  const file = join(dir, "controls.json");
  try {
    try {
      // The source gate's own problems are reported by that gate; the emitted list is the count.
      execFileSync(
        process.execPath,
        [
          join(cwd, "node_modules/tsx/dist/cli.mjs"),
          "scripts/check-help-controls.mjs",
          "--emit",
          file,
        ],
        {
          cwd,
          stdio: ["ignore", "ignore", "ignore"],
          env: {
            PATH: process.env.PATH,
            HOME: process.env.HOME,
            TMPDIR: process.env.TMPDIR ?? "/tmp",
            LANG: "en_US.UTF-8",
            NODE_OPTIONS: `--import ${join(cwd, PRELOAD)}`,
            ...(process.env.NOVDEC_JOURNEY_NETWORK_LOG
              ? { NOVDEC_JOURNEY_NETWORK_LOG: process.env.NOVDEC_JOURNEY_NETWORK_LOG }
              : {}),
          },
        },
      );
    } catch {
      // A failed source gate still emitted its list before it reported.
    }
    const { controls } = JSON.parse(readFileSync(file, "utf8"));
    assert.ok(
      Array.isArray(controls) && controls.length > 0,
      "Read the served Help controls",
    );
    return { version, scenes: manifest.scenes.length, controls: controls.length };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function readExactHelpProof(argv, source, inventory = servedHelpInventory) {
  const positiveAt = argv.indexOf("--rendered-help");
  const negativeAt = argv.indexOf("--rendered-help-drift");
  if (positiveAt === -1 && negativeAt === -1) return null;
  assert.ok(
    positiveAt >= 0 && negativeAt >= 0,
    "Both rendered Help records are required",
  );
  const served = typeof inventory === "function" ? inventory() : inventory;
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
  // The served commit's own Help: its version, every scene and every control its manual names.
  assert.equal(sceneReport.helpVersion, served.version);
  assert.equal(sceneReport.scenes.length, served.scenes);
  assert.deepEqual(sceneReport.drift, []);
  assert.deepEqual(sceneReport.uncaptured, []);
  assert.equal(checks.length, served.controls);
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
    helpVersion: served.version,
    matchedScenes: sceneReport.scenes.length,
    checkedControls: checks.length,
    missingRequiredControls: 0,
    rejectedDrift: drift[0].label,
    canonicalRun: basename(positive),
    driftRun: basename(negative),
  };
}
