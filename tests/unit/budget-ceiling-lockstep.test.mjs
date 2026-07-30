import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import {
  buildRunbook,
  main,
  renderRunbook,
  resolveConfig,
} from "../../scripts/setup-budget-killswitch.mjs";

const PROJECT = "fixture-kb-prod";
const PROJECT_NUMBER = "123456789012";
const ALERT_USD = 48;
const CEILING_USD = 120;
const PRODUCTION_PROJECT = "pmi-kc-kb-prod";
const PRODUCTION_PROJECT_NUMBER = "558870356522";
const BILLING_ACCOUNT = "01A5A3-65CA5A-614D45";
const EXACT_PAIR = [`--project=${PROJECT}`, `--project-number=${PROJECT_NUMBER}`];
const PLANNER_PATH = fileURLToPath(
  new URL("../../scripts/setup-budget-killswitch.mjs", import.meta.url),
);

function ceilingSource(overrides = {}) {
  return {
    PRODUCTION_MONTHLY_ALERT_USD: ALERT_USD,
    PRODUCTION_MONTHLY_CEILING_USD: CEILING_USD,
    COST_CEILING_PROJECTS: [
      {
        alertUsd: ALERT_USD,
        ceilingUsd: CEILING_USD,
        posture: "armed",
        projectId: PRODUCTION_PROJECT,
        projectNumber: PRODUCTION_PROJECT_NUMBER,
      },
      {
        alertUsd: ALERT_USD,
        ceilingUsd: CEILING_USD,
        posture: "armed",
        projectId: PROJECT,
        projectNumber: PROJECT_NUMBER,
      },
    ],
    ...overrides,
  };
}

function harness(source = ceilingSource()) {
  const stdout = vi.fn();
  const stderr = vi.fn();
  const setExitCode = vi.fn();
  return {
    dependencies: {
      ceilingSource: source,
      setExitCode,
      stderr,
      stdout,
    },
    setExitCode,
    stderr,
    stdout,
  };
}

async function expectRefusal(argv, source, env = {}) {
  const test = harness(source);
  const result = await main(argv, env, test.dependencies);
  expect(result.status).toBe("refused");
  expect(test.stdout).not.toHaveBeenCalled();
  expect(test.stderr).toHaveBeenCalledTimes(1);
  expect(test.stderr.mock.calls[0][0]).not.toMatch(/\bgcloud\b/);
  expect(test.setExitCode).toHaveBeenCalledWith(1);
  return { result, ...test };
}

describe("S52 print-only ceiling planner", () => {
  it("refuses with zero command output while the protected source is unavailable", async () => {
    const { result } = await expectRefusal([], null);
    expect(result.reason).toMatch(/source is unavailable/i);
  });

  it.each([
    ["no arguments", [], {}],
    ["half project pair", [`--project=${PROJECT}`], {}],
    ["JSON mode", ["--json"], {}],
    ["poisoned dollar environment", [], { AUTONOMOUS_BUDGET_CAP_USD: "999" }],
  ])("the actual CLI refuses %s atomically", (_label, argv, envOverrides) => {
    const result = spawnSync(process.execPath, [PLANNER_PATH, ...argv], {
      encoding: "utf8",
      env: { ...envOverrides },
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/plan refused/i);
    expect(result.stderr).not.toMatch(/\bgcloud\b/);
  });

  it("is side-effect free when imported as a module", () => {
    const moduleUrl = new URL(
      "../../scripts/setup-budget-killswitch.mjs",
      import.meta.url,
    ).href;
    const result = spawnSync(
      process.execPath,
      ["--input-type=module", "--eval", `await import(${JSON.stringify(moduleUrl)})`],
      { encoding: "utf8", env: {} },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });

  it.each([
    {
      label: "both named values unset",
      source: ceilingSource({
        PRODUCTION_MONTHLY_ALERT_USD: null,
        PRODUCTION_MONTHLY_CEILING_USD: null,
      }),
    },
    {
      label: "alert unset",
      source: ceilingSource({ PRODUCTION_MONTHLY_ALERT_USD: null }),
    },
    {
      label: "ceiling unset",
      source: ceilingSource({ PRODUCTION_MONTHLY_CEILING_USD: null }),
    },
    {
      label: "non-positive alert",
      source: ceilingSource({ PRODUCTION_MONTHLY_ALERT_USD: 0 }),
    },
    {
      label: "non-finite ceiling",
      source: ceilingSource({ PRODUCTION_MONTHLY_CEILING_USD: Number.NaN }),
    },
    {
      label: "alert equals ceiling",
      source: ceilingSource({
        PRODUCTION_MONTHLY_ALERT_USD: CEILING_USD,
      }),
    },
  ])("refuses $label before rendering", async ({ source }) => {
    await expectRefusal(EXACT_PAIR, source);
  });

  it.each([`--project=${PROJECT}`, `--project-number=${PROJECT_NUMBER}`])(
    "refuses a half-supplied project pair: %s",
    async (flag) => {
      const { result } = await expectRefusal([flag], ceilingSource());
      expect(result.reason).toMatch(/must be supplied together/i);
    },
  );

  it("refuses a project number that does not match the exact source row", async () => {
    const { result } = await expectRefusal(
      [`--project=${PROJECT}`, "--project-number=999999999999"],
      ceilingSource(),
    );
    expect(result.reason).toMatch(/do not match one source row/i);
  });

  it.each(["pending_verification", "unlinked"])(
    "refuses a %s project row even when its values are null",
    async (posture) => {
      const source = ceilingSource({
        COST_CEILING_PROJECTS: [
          ceilingSource().COST_CEILING_PROJECTS[0],
          {
            alertUsd: null,
            ceilingUsd: null,
            posture,
            projectId: PROJECT,
            projectNumber: PROJECT_NUMBER,
          },
        ],
      });
      const { result } = await expectRefusal(EXACT_PAIR, source);
      expect(result.reason).toContain(posture);
    },
  );

  it.each([
    ["--cap-usd=120", {}],
    ["--alert-usd=48", {}],
    ["--budget-amount=120", {}],
    ["--threshold=0.4", {}],
    [null, { AUTONOMOUS_BUDGET_CAP_USD: "120" }],
    [null, { KILL_SWITCH_ALERT_USD: "48" }],
    [null, { COST_CEILING_USD: "120" }],
    [null, { MONTHLY_ALERT_USD: "48" }],
  ])("refuses dollar override authority from argv/env", async (flag, env) => {
    const argv = flag ? [...EXACT_PAIR, flag] : EXACT_PAIR;
    const { result } = await expectRefusal(argv, ceilingSource(), env);
    expect(result.reason).toMatch(/cannot override|is forbidden/i);
  });

  it.each([
    ["unknown flag", [...EXACT_PAIR, "--mystery=value"]],
    ["duplicate flag", [...EXACT_PAIR, "--topic=one", "--topic=two"]],
    ["empty flag", [...EXACT_PAIR, "--topic="]],
    ["duplicate json", [...EXACT_PAIR, "--json", "--json"]],
    [
      "billing-account override",
      [...EXACT_PAIR, "--billing-account=FFFFFF-FFFFFF-FFFFFF"],
    ],
  ])("refuses %s before stdout", async (_label, argv) => {
    await expectRefusal(argv, ceilingSource());
  });

  it("ignores unrelated ambient project and location values", async () => {
    const test = harness();
    const result = await main(
      EXACT_PAIR,
      {
        BILLING_ACCOUNT_ID: "FFFFFF-FFFFFF-FFFFFF",
        GCP_PROJECT_ID: "ambient-project",
        GCP_PROJECT_NUMBER: "999999999999",
        VERTEX_AI_LOCATION: "europe-west1",
      },
      test.dependencies,
    );
    expect(result.status).toBe("rendered");
    expect(result.config.project).toBe(PROJECT);
    expect(result.config.projectNumber).toBe(PROJECT_NUMBER);
    expect(result.config.region).toBe("us-central1");
    expect(result.config.billingAccount).toBe(BILLING_ACCOUNT);
    expect(result.output).not.toContain("ambient-project");
    expect(result.output).not.toContain("999999999999");
    expect(result.output).not.toContain("europe-west1");
    expect(result.output).not.toContain("FFFFFF-FFFFFF-FFFFFF");
  });

  it("validates JSON mode before producing any stdout", async () => {
    await expectRefusal(["--json"], null);
    const test = harness();
    const result = await main([...EXACT_PAIR, "--json"], {}, test.dependencies);
    expect(result.status).toBe("rendered");
    expect(test.stdout).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(test.stdout.mock.calls[0][0]);
    expect(parsed.config.project).toBe(PROJECT);
    expect(parsed.config.alertUsd).toBe(ALERT_USD);
    expect(parsed.config.ceilingUsd).toBe(CEILING_USD);
  });

  it("renders fixture-only alert and ceiling values in exact lockstep", async () => {
    const test = harness();
    const result = await main(EXACT_PAIR, {}, test.dependencies);
    expect(result.status).toBe("rendered");
    expect(test.stderr).not.toHaveBeenCalled();
    expect(test.setExitCode).not.toHaveBeenCalled();
    expect(test.stdout).toHaveBeenCalledTimes(1);

    const output = test.stdout.mock.calls[0][0];
    expect(output).toContain(`KILL_SWITCH_ALERT_USD=${ALERT_USD}`);
    expect(output).toContain(`KILL_SWITCH_CAP_USD=${CEILING_USD}`);
    expect(output).toContain(`--budget-amount=${CEILING_USD}USD`);
    expect(output).toContain("--threshold-rule=percent=0.4");
    expect(output).toContain(`--filter-projects="projects/${PROJECT_NUMBER}"`);
    expect(output).toContain(`budget-guardrail@${PROJECT}.iam.gserviceaccount.com`);
    expect(output).not.toContain("pmi-kc-kb-prod");
    expect(output).not.toContain("558870356522");

    const capValues = [
      ...output.matchAll(/KILL_SWITCH_CAP_USD=([0-9.]+)/g),
      ...output.matchAll(/--budget-amount=([0-9.]+)USD/g),
    ].map((match) => match[1]);
    expect(capValues).toEqual([String(CEILING_USD), String(CEILING_USD)]);

    const config = result.config;
    expect(config.safeTestCostUsdText).toBe("24");
    expect(Number(config.safeTestCostUsdText)).toBeLessThan(config.alertUsd);
    expect(Number(config.safeTestCostUsdText)).toBeLessThan(config.ceilingUsd);
    expect(renderRunbook(config)).toBe(output);
    expect(
      buildRunbook(config)
        .flatMap((step) => step.commands)
        .join("\n"),
    ).toContain(`--project=${PROJECT}`);
  });

  it("selects one exact row without leaking another project's references", async () => {
    const source = ceilingSource({
      COST_CEILING_PROJECTS: [
        ...ceilingSource().COST_CEILING_PROJECTS,
        {
          alertUsd: 20,
          ceilingUsd: 80,
          posture: "armed",
          projectId: "fixture-other-prod",
          projectNumber: "777777777777",
        },
      ],
    });
    const test = harness(source);
    const result = await main(EXACT_PAIR, {}, test.dependencies);
    expect(result.status).toBe("rendered");
    expect(result.output).toContain(PROJECT);
    expect(result.output).toContain(PROJECT_NUMBER);
    expect(result.output).not.toContain("fixture-other-prod");
    expect(result.output).not.toContain("777777777777");
  });

  it("pins budgets-publisher IAM readback separately from manual topic publish", async () => {
    const test = harness();
    const result = await main(EXACT_PAIR, {}, test.dependencies);
    const steps = buildRunbook(result.config);
    const publisherProof = steps.find((step) => step.title.startsWith("4b."));
    const manualTrigger = steps.find((step) => step.title.startsWith("5."));
    expect(publisherProof.commands.join("\n")).toContain(
      "billing-budget-alert@system.gserviceaccount.com",
    );
    expect(publisherProof.commands.join("\n")).toContain("pubsub topics get-iam-policy");
    expect(publisherProof.commands.join("\n")).not.toContain("pubsub topics publish");
    expect(manualTrigger.commands.join("\n")).toContain("pubsub topics publish");
    expect(manualTrigger.title).toMatch(/does not prove/i);
  });

  it("refuses an armed row whose alert is not below its ceiling", async () => {
    const source = ceilingSource({
      COST_CEILING_PROJECTS: [
        ceilingSource().COST_CEILING_PROJECTS[0],
        {
          alertUsd: CEILING_USD,
          ceilingUsd: CEILING_USD,
          posture: "armed",
          projectId: PROJECT,
          projectNumber: PROJECT_NUMBER,
        },
      ],
    });
    await expectRefusal(EXACT_PAIR, source);
  });

  it("refuses an alert ratio that would round down to a zero threshold", async () => {
    const source = ceilingSource({
      PRODUCTION_MONTHLY_ALERT_USD: 0.000002,
      PRODUCTION_MONTHLY_CEILING_USD: 1_000_000_000_000,
      COST_CEILING_PROJECTS: [
        {
          alertUsd: 0.000002,
          ceilingUsd: 1_000_000_000_000,
          posture: "armed",
          projectId: PRODUCTION_PROJECT,
          projectNumber: PRODUCTION_PROJECT_NUMBER,
        },
        {
          alertUsd: 0.000002,
          ceilingUsd: 1_000_000_000_000,
          posture: "armed",
          projectId: PROJECT,
          projectNumber: PROJECT_NUMBER,
        },
      ],
    });
    const { result } = await expectRefusal(EXACT_PAIR, source);
    expect(result.reason).toMatch(/ratio cannot be rendered safely/i);
  });

  it("refuses an alert ratio that would round up to the hard-stop threshold", async () => {
    const source = ceilingSource({
      PRODUCTION_MONTHLY_ALERT_USD: 0.9999999999999,
      PRODUCTION_MONTHLY_CEILING_USD: 1,
      COST_CEILING_PROJECTS: [
        {
          alertUsd: 0.9999999999999,
          ceilingUsd: 1,
          posture: "armed",
          projectId: PRODUCTION_PROJECT,
          projectNumber: PRODUCTION_PROJECT_NUMBER,
        },
        {
          alertUsd: 0.9999999999999,
          ceilingUsd: 1,
          posture: "armed",
          projectId: PROJECT,
          projectNumber: PROJECT_NUMBER,
        },
      ],
    });
    const { result } = await expectRefusal(EXACT_PAIR, source);
    expect(result.reason).toMatch(/ratio cannot be rendered safely/i);
  });

  it("will not render a forged config that bypassed source validation", () => {
    expect(() => buildRunbook({ project: PROJECT })).toThrow(/validated S52/i);
    expect(() => renderRunbook({ project: PROJECT })).toThrow(/validated S52/i);
  });

  it.each([
    {
      label: "missing",
      rows: ceilingSource().COST_CEILING_PROJECTS.filter(
        (row) => row.projectId !== PRODUCTION_PROJECT,
      ),
    },
    {
      label: "mismatched",
      rows: ceilingSource().COST_CEILING_PROJECTS.map((row) =>
        row.projectId === PRODUCTION_PROJECT ? { ...row, alertUsd: 47 } : row,
      ),
    },
  ])(
    "refuses when the Production row is $label even while another row is selected",
    async ({ rows }) => {
      const source = ceilingSource({ COST_CEILING_PROJECTS: rows });
      const { result } = await expectRefusal(EXACT_PAIR, source);
      expect(result.reason).toMatch(/Production project row/i);
    },
  );

  it("constructs no cloud client or command runner", () => {
    const source = readFileSync(
      new URL("../../scripts/setup-budget-killswitch.mjs", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(/@google-cloud|child_process|execFile|spawn\s*\(/);
  });

  it("rejects malformed identifiers before any shell command exists", () => {
    expect(() =>
      resolveConfig(
        ["--project=fixture-kb-prod;echo-owned", `--project-number=${PROJECT_NUMBER}`],
        {},
        ceilingSource(),
      ),
    ).toThrow(/no exact COST_CEILING_PROJECTS source row/i);
  });
});
