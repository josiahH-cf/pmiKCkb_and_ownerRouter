import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildDemoDeployCommand } from "../../scripts/deploy-demo-cloud-run.mjs";

const GOLDEN_ENV = "tests/fixtures/cutover/golden-production.env.fixture";

// S106/S34: the Dotloop client secret is the one Dotloop credential that must never be inlined. The
// deploy wrapper already forwards the non-secret client id and redirect URI, and its own comment
// claimed the client secret travelled through Secret Manager "when their secret ids are configured",
// but no binding existed. An owner who registered the Dotloop application, stored the secret, and
// redeployed would have shipped a revision whose readiness reported the client secret missing with
// nothing naming this wrapper as the cause. These tests pin the delivery path in both directions.
describe("Dotloop OAuth client-secret Secret Manager binding", () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "dotloop-oauth-env-"));
  const golden = readFileSync(GOLDEN_ENV, "utf8");

  const withoutSignal = join(fixtureDir, "without-signal.env");
  writeFileSync(
    withoutSignal,
    `${golden}\nDOTLOOP_OAUTH_CLIENT_ID=fixture-client-id\nDOTLOOP_OAUTH_REDIRECT_URI=https://fixture.example.com/api/connections/dotloop/callback\n`,
  );

  const withSignal = join(fixtureDir, "with-signal.env");
  writeFileSync(
    withSignal,
    `${golden}\nDOTLOOP_OAUTH_CLIENT_ID=fixture-client-id\nDOTLOOP_OAUTH_REDIRECT_URI=https://fixture.example.com/api/connections/dotloop/callback\nDOTLOOP_OAUTH_CLIENT_SECRET_SECRET_ID=DOTLOOP_OAUTH_CLIENT_SECRET\n`,
  );

  const withPinnedVersion = join(fixtureDir, "with-pinned-version.env");
  writeFileSync(
    withPinnedVersion,
    `${golden}\nDOTLOOP_OAUTH_CLIENT_ID=fixture-client-id\nDOTLOOP_OAUTH_REDIRECT_URI=https://fixture.example.com/api/connections/dotloop/callback\nDOTLOOP_OAUTH_CLIENT_SECRET_SECRET_ID=DOTLOOP_OAUTH_CLIENT_SECRET\nDOTLOOP_OAUTH_CLIENT_SECRET_SECRET_VERSION=4\n`,
  );

  const withPlaintextSecret = join(fixtureDir, "with-plaintext-secret.env");
  writeFileSync(
    withPlaintextSecret,
    `${golden}\nDOTLOOP_OAUTH_CLIENT_ID=fixture-client-id\nDOTLOOP_OAUTH_REDIRECT_URI=https://fixture.example.com/api/connections/dotloop/callback\nDOTLOOP_OAUTH_CLIENT_SECRET=fixture-plaintext-value\n`,
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

  const flags = (deploy) => ({
    secrets: deploy.args.find((arg) => arg.startsWith("--set-secrets")) ?? "",
    envVars: deploy.args.find((arg) => arg.startsWith("--set-env-vars")) ?? "",
  });

  it("binds the client secret from its explicit reviewed secret-id signal", () => {
    const deploy = deployFor(withSignal);
    expect(deploy.ok).toBe(true);
    const { secrets, envVars } = flags(deploy);

    expect(secrets).toContain(
      "DOTLOOP_OAUTH_CLIENT_SECRET=DOTLOOP_OAUTH_CLIENT_SECRET:latest",
    );
    // The non-secret half still travels as ordinary configuration.
    expect(envVars).toContain("DOTLOOP_OAUTH_CLIENT_ID=fixture-client-id");
    expect(envVars).toContain("DOTLOOP_OAUTH_REDIRECT_URI=");
    // The secret value itself never appears in a plaintext env map.
    expect(envVars).not.toContain("DOTLOOP_OAUTH_CLIENT_SECRET=");
  });

  it("honors an explicitly pinned secret version", () => {
    const deploy = deployFor(withPinnedVersion);
    expect(deploy.ok).toBe(true);
    expect(flags(deploy).secrets).toContain(
      "DOTLOOP_OAUTH_CLIENT_SECRET=DOTLOOP_OAUTH_CLIENT_SECRET:4",
    );
  });

  it("binds nothing when the reviewed secret-id signal is absent", () => {
    const deploy = deployFor(withoutSignal);
    expect(deploy.ok).toBe(true);
    expect(flags(deploy).secrets).not.toContain("DOTLOOP_OAUTH_CLIENT_SECRET");
  });

  it("never promotes a plaintext client secret into the deployed revision", () => {
    const deploy = deployFor(withPlaintextSecret);
    expect(deploy.ok).toBe(true);
    const { secrets, envVars } = flags(deploy);

    expect(secrets).not.toContain("DOTLOOP_OAUTH_CLIENT_SECRET");
    expect(envVars).not.toContain("fixture-plaintext-value");
  });
});
