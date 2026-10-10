import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it, expect } from "vitest";
import { buildDemoDeployCommand } from "../../scripts/deploy-demo-cloud-run.mjs";
const golden = readFileSync(
  "tests/fixtures/cutover/golden-production.env.fixture",
  "utf8",
);
const audience = "https://fixture.example.invalid/api/gmail-hub/sequences/worker",
  account = "fixture-runtime@pmi-kc-kb-prod.iam.gserviceaccount.com";
function plan(extra, ambient = {}) {
  const root = mkdtempSync(join(tmpdir(), "pmi-kc-worker-runtime-"));
  try {
    const file = join(root, "reviewed.env");
    writeFileSync(file, golden + "\n" + extra);
    return buildDemoDeployCommand({
      argv: ["--allow-multiple-spaces", `--env-file=${file}`],
      env: ambient,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
it("preserves the reviewed managed-worker audience and identity in the replacing runtime map", () => {
  const p = plan(
    `WORKFLOW_COMMUNICATION_WORKER_AUDIENCE=${audience}\nWORKFLOW_COMMUNICATION_WORKER_SERVICE_ACCOUNT=${account}\n`,
  );
  expect(p.ok).toBe(true);
  const flag = p.args.find((v) => v.startsWith("--set-env-vars="));
  expect(flag).toContain(`WORKFLOW_COMMUNICATION_WORKER_AUDIENCE=${audience}`);
  expect(flag).toContain(`WORKFLOW_COMMUNICATION_WORKER_SERVICE_ACCOUNT=${account}`);
  expect(p.args.join(" ")).not.toContain("gmail.message.send");
});
it("an absent reviewed worker configuration cannot be supplied by ambient credentials or account overrides", () => {
  const p = plan("", {
    WORKFLOW_COMMUNICATION_WORKER_AUDIENCE: audience,
    WORKFLOW_COMMUNICATION_WORKER_SERVICE_ACCOUNT: account,
  });
  expect(p.ok).toBe(true);
  const flag = p.args.find((v) => v.startsWith("--set-env-vars="));
  expect(flag).not.toContain("WORKFLOW_COMMUNICATION_WORKER_");
});
