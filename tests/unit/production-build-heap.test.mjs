import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { it, expect } from "vitest";
import {
  buildDemoDeployCommand,
  parseGcloudMapFlag,
} from "../../scripts/deploy-demo-cloud-run.mjs";

it("gives the production type checker a bounded build-only heap while keeping runtime limits and checks", () => {
  const reviewed = parseEnv(
    readFileSync("tests/fixtures/cutover/golden-production.env.fixture", "utf8"),
  );
  const plan = buildDemoDeployCommand({
    argv: ["--allow-multiple-spaces"],
    localEnv: { ...reviewed, NODE_OPTIONS: "--max-old-space-size=1" },
    env: { NODE_OPTIONS: "--require=unreviewed-module" },
  });
  expect(plan.ok).toBe(true);
  const build = parseGcloudMapFlag(
    plan.args.find((v) => v.startsWith("--set-build-env-vars=")),
  );
  const runtime = parseGcloudMapFlag(
    plan.args.find((v) => v.startsWith("--set-env-vars=")),
  );
  expect(build.NODE_OPTIONS).toBe("--max-old-space-size=4096");
  expect(build).not.toHaveProperty("GOOGLE_NODE_RUN_SCRIPTS");
  expect(runtime).not.toHaveProperty("NODE_OPTIONS");
  expect(plan.args).toContain("--memory=512Mi");
  expect(plan.args).toContain("--cpu=1");
  expect(plan.args.some((v) => v.startsWith("--build-machine-type"))).toBe(false);
});
