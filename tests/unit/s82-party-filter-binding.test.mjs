import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildDemoDeployCommand } from "../../scripts/deploy-demo-cloud-run.mjs";

const GOLDEN_ENV = "tests/fixtures/cutover/golden-production.env.fixture";

// S82: the renewal-desk party-filter derivation key reaches Cloud Run only through Secret Manager.
// File-backed deploys deliberately ignore ambient shell env, so the activation signal must live in
// the reviewed env file; these fixtures extend the golden file rather than passing env vars.
describe("S82 party-filter Secret Manager binding", () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "s82-party-filter-env-"));
  const golden = readFileSync(GOLDEN_ENV, "utf8");
  const withSignal = join(fixtureDir, "with-signal.env");
  writeFileSync(
    withSignal,
    `${golden}\nRENEWAL_DESK_PARTY_FILTER_KEY_SECRET_ID=RENEWAL_DESK_PARTY_FILTER_KEY\n`,
  );
  const withRotation = join(fixtureDir, "with-rotation.env");
  writeFileSync(
    withRotation,
    `${golden}\nRENEWAL_DESK_PARTY_FILTER_KEY_SECRET_ID=RENEWAL_DESK_PARTY_FILTER_KEY\nRENEWAL_DESK_PARTY_FILTER_PREVIOUS_KEY_SECRET_ID=RENEWAL_DESK_PARTY_FILTER_KEY_PREVIOUS\n`,
  );

  const deployFor = (envFile) =>
    buildDemoDeployCommand({
      argv: [
        "--allow-multiple-spaces",
        `--env-file=${envFile}`,
        "--project=sample-kb-fixture-prod",
      ],
      env: {},
    });

  it("binds the key only from its explicit reviewed secret-id signal, never as a plain env value", () => {
    const deploy = deployFor(withSignal);
    expect(deploy.ok).toBe(true);
    const secretsFlag = deploy.args.find((arg) => arg.startsWith("--set-secrets"));
    expect(secretsFlag).toContain(
      "RENEWAL_DESK_PARTY_FILTER_KEY=RENEWAL_DESK_PARTY_FILTER_KEY:latest",
    );
    expect(secretsFlag).not.toContain("PREVIOUS");
    const envFlag = deploy.args.find((arg) => arg.startsWith("--set-env-vars"));
    expect(envFlag).not.toContain("RENEWAL_DESK_PARTY_FILTER_KEY");
  });

  it("omits the binding entirely when the signal is absent, failing the shortcuts closed", () => {
    const deploy = deployFor(GOLDEN_ENV);
    expect(deploy.ok).toBe(true);
    const secretsFlag = deploy.args.find((arg) => arg.startsWith("--set-secrets"));
    expect(secretsFlag).not.toContain("RENEWAL_DESK_PARTY_FILTER_KEY");
  });

  it("adds the rotation-only previous binding beside the active one", () => {
    const deploy = deployFor(withRotation);
    const secretsFlag = deploy.args.find((arg) => arg.startsWith("--set-secrets"));
    expect(secretsFlag).toContain(
      "RENEWAL_DESK_PARTY_FILTER_PREVIOUS_KEY=RENEWAL_DESK_PARTY_FILTER_KEY_PREVIOUS:latest",
    );
  });
});
