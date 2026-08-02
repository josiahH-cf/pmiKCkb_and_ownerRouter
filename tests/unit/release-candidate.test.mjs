import { describe, expect, it } from "vitest";

import {
  buildCandidateDeployPlan,
  buildPriorRevisionQueryPlan,
  buildPromotionPlan,
  buildReleasePlan,
  buildRollbackPlan,
  candidateTagFor,
  ENVIRONMENT_DESCRIPTORS,
  findLocalOnlyDeployConfig,
  LOCAL_ONLY_DEPLOY_VARIABLES,
  parseServingRevision,
  parseReleaseArgs,
} from "@/scripts/release-candidate.mjs";

/**
 * S40 AC-S40-6, AC-S40-11, AC-S40-12.
 *
 * The legacy wrapper deploys and promotes in one step, so a bad revision serves before anything
 * checks it. These tests pin the properties that make the replacement path D05-eligible: a candidate
 * gets zero traffic, promotion names an exact revision, the rollback target is captured first, and
 * local-only configuration is refused by name.
 */

const TARGET = {
  project: "pmi-kc-kb-prod",
  region: "us-central1",
  service: "pmi-kc-app",
};

function planArgs(overrides = {}) {
  return {
    environment: "production",
    errors: [],
    ...TARGET,
    ...overrides,
  };
}

describe("release argument contract", () => {
  it("requires a known environment", () => {
    expect(parseReleaseArgs([]).errors.join(" ")).toMatch(/--environment is required/);
    expect(parseReleaseArgs(["--environment=staging"]).errors.join(" ")).toMatch(
      /not one of/,
    );
    for (const name of ["production", "demo"]) {
      expect(parseReleaseArgs([`--environment=${name}`, "--plan-only"]).errors).toEqual(
        [],
      );
    }
  });

  it("requires exactly one mode, and never both execute and promote", () => {
    expect(parseReleaseArgs(["--environment=production"]).errors.join(" ")).toMatch(
      /exactly one of --plan-only, --execute, or --promote/,
    );
    // Deploying and promoting in one invocation is the legacy behaviour this path replaces.
    expect(
      parseReleaseArgs([
        "--environment=production",
        "--execute",
        "--promote",
        "--candidate-revision=svc-rev-9",
      ]).errors.join(" "),
    ).toMatch(/promote it in a separate invocation/);
  });

  it("refuses to combine a plan with an executing flag", () => {
    // A plan is a guarantee that nothing runs; a precedence rule would make that ambiguous.
    for (const flag of ["--execute", "--promote"]) {
      expect(
        parseReleaseArgs(["--environment=production", "--plan-only", flag]).errors.join(
          " ",
        ),
      ).toMatch(/--plan-only cannot be combined/);
    }
  });

  it("requires the exact candidate revision to promote one", () => {
    expect(
      parseReleaseArgs(["--environment=production", "--promote"]).errors.join(" "),
    ).toMatch(/--candidate-revision/);
  });
});

describe("local-only configuration refusal (AC-S40-12)", () => {
  it.each(LOCAL_ONLY_DEPLOY_VARIABLES.presentIsFatal)(
    "refuses %s by name from the resolved deploy map",
    (name) => {
      const { errors } = findLocalOnlyDeployConfig({ resolved: { [name]: "set" } });
      expect(errors.join(" ")).toContain(name);
    },
  );

  it.each(LOCAL_ONLY_DEPLOY_VARIABLES.presentIsFatal)(
    "refuses %s by name from the ambient shell, which has no override",
    (name) => {
      const { errors } = findLocalOnlyDeployConfig({ ambient: { [name]: "set" } });
      expect(errors.join(" ")).toContain(name);
    },
  );

  it("treats an enabled local-only flag in the RESOLVED map as fatal", () => {
    const { errors } = findLocalOnlyDeployConfig({
      resolved: { LOCAL_DEMO_AUTH: "true", ASK_DEMO_MODE: "true" },
    });
    expect(errors).toHaveLength(2);
    expect(errors.join(" ")).toContain("LOCAL_DEMO_AUTH");
    expect(errors.join(" ")).toContain("ASK_DEMO_MODE");
  });

  it("warns rather than refuses when only the shell is dirty and the map pins it false", () => {
    // The deploy env map hardcodes both to "false", so a dirty shell cannot reach the revision.
    // Refusing here would block a genuinely safe deploy and teach operators to bypass the check.
    const { errors, warnings } = findLocalOnlyDeployConfig({
      resolved: { LOCAL_DEMO_AUTH: "false", ASK_DEMO_MODE: "false" },
      ambient: { LOCAL_DEMO_AUTH: "true", ASK_DEMO_MODE: "true" },
    });
    expect(errors).toEqual([]);
    expect(warnings).toHaveLength(2);
    expect(warnings.join(" ")).toMatch(/will not reach the revision/);
  });

  it("passes a clean environment", () => {
    expect(
      findLocalOnlyDeployConfig({
        resolved: { NODE_ENV: "production", LOCAL_DEMO_AUTH: "false" },
        ambient: { PATH: "/usr/bin" },
      }),
    ).toEqual({ errors: [], warnings: [] });
  });
});

describe("zero-traffic candidate delivery (AC-S40-6)", () => {
  it("deploys the candidate with no traffic and its own tag", () => {
    const plan = buildCandidateDeployPlan({
      baseArgs: ["run", "deploy", TARGET.service],
      environment: "production",
      revisionSuffix: "abc123",
    });

    expect(plan.args).toContain("--no-traffic");
    expect(plan.args).toContain(`--tag=${plan.candidateTag}`);
    expect(plan.candidateTag).toBe(candidateTagFor("abc123"));
  });

  it("promotes the exact revision, never whatever is latest", () => {
    const { args } = buildPromotionPlan({ ...TARGET, revision: "svc-rev-9" });

    expect(args).toContain("--to-revisions=svc-rev-9=100");
    expect(args).not.toContain("--to-latest");
    expect(args.join(" ")).not.toMatch(/LATEST/i);
  });

  it("captures the prior serving revision read-only before anything changes", () => {
    const { args } = buildPriorRevisionQueryPlan(TARGET);

    expect(args.slice(0, 3)).toEqual(["run", "services", "describe"]);
    expect(args).toContain("--format=json(status.traffic)");
    // A describe must never carry a mutating flag.
    expect(args.join(" ")).not.toMatch(/--to-revisions|--no-traffic|deploy/);
  });

  it("selects only the exact 100-percent revision when a zero-traffic tag exists", () => {
    expect(
      parseServingRevision(
        JSON.stringify({
          status: {
            traffic: [
              { percent: 100, revisionName: "svc-safe-prior" },
              {
                percent: 0,
                revisionName: "svc-zero-traffic-candidate",
                tag: "cand-abc123",
                url: "https://cand.example.invalid",
              },
            ],
          },
        }),
      ),
    ).toBe("svc-safe-prior");
  });

  it("refuses malformed, split, or ambiguous serving traffic", () => {
    for (const value of [
      "not-json",
      JSON.stringify({ status: { traffic: [] } }),
      JSON.stringify({
        status: {
          traffic: [
            { percent: 50, revisionName: "svc-a" },
            { percent: 50, revisionName: "svc-b" },
          ],
        },
      }),
      JSON.stringify({
        status: {
          traffic: [
            { percent: 100, revisionName: "svc-a" },
            { percent: 100, revisionName: "svc-b" },
          ],
        },
      }),
    ]) {
      expect(() => parseServingRevision(value)).toThrow(/serving revision/i);
    }
  });

  it("restores exactly the captured prior revision on rollback", () => {
    const { args } = buildRollbackPlan({ ...TARGET, priorRevision: "svc-rev-8" });

    expect(args).toContain("--to-revisions=svc-rev-8=100");
  });

  it("refuses a rollback with no captured prior revision", () => {
    expect(() => buildRollbackPlan(TARGET)).toThrow(/prior serving revision/);
  });

  it("refuses a promotion missing any part of its exact target", () => {
    expect(() => buildPromotionPlan({ ...TARGET })).toThrow(/revision/);
    expect(() => buildPromotionPlan({ revision: "svc-rev-9" })).toThrow(/project/);
  });
});

describe("environment parameterisation (AC-S40-11)", () => {
  it.each(["production", "demo"])("carries the explicit %s descriptor pair", (name) => {
    const plan = buildReleasePlan({
      args: planArgs({ environment: name }),
      deployArgs: ["run", "deploy", TARGET.service],
      revisionName: "svc-rev-9",
      revisionSuffix: "abc123",
    });

    expect(plan.errors).toEqual([]);
    expect(plan.descriptor).toEqual(ENVIRONMENT_DESCRIPTORS[name]);
    // Both variables must be present so the deployed revision resolves source:"explicit" rather
    // than falling back to legacy-node-env, which the Production cutover preflight refuses.
    expect(Object.keys(plan.descriptor).sort()).toEqual([
      "DATA_CONTEXT",
      "ENVIRONMENT_KIND",
    ]);
  });

  it("refuses a resolved descriptor that contradicts the target environment", () => {
    const plan = buildReleasePlan({
      args: planArgs({ environment: "production" }),
      deployArgs: [],
      resolvedEnv: { ENVIRONMENT_KIND: "demo" },
      revisionName: "svc-rev-9",
      revisionSuffix: "abc123",
    });

    expect(plan.errors.join(" ")).toMatch(/contradicts the production descriptor/);
    expect(plan.steps).toEqual([]);
  });

  it("orders the plan capture, deploy, smoke, promote, rollback", () => {
    const plan = buildReleasePlan({
      args: planArgs(),
      deployArgs: ["run", "deploy", TARGET.service],
      revisionName: "svc-rev-9",
      revisionSuffix: "abc123",
    });

    expect(plan.steps.map((step) => step.name)).toEqual([
      "capture-prior-revision",
      "deploy-candidate",
      "smoke-candidate",
      "promote-exact-revision",
      "rollback",
    ]);
    // The smoke must come before the promotion, or the candidate check proves nothing.
    const names = plan.steps.map((step) => step.name);
    expect(names.indexOf("smoke-candidate")).toBeLessThan(
      names.indexOf("promote-exact-revision"),
    );
    const smoke = plan.steps.find((step) => step.name === "smoke-candidate");
    expect(smoke.command).toContain("smoke:release-candidate");
    expect(smoke.command).toContain(`--expected-tag=${plan.candidateTag}`);
    expect(smoke.command).toContain(`--expected-service=${TARGET.service}`);
    expect(smoke.command).not.toContain("smoke:demo-live");
  });

  it("emits no steps at all when the plan is refused", () => {
    const plan = buildReleasePlan({
      args: planArgs({ errors: ["synthetic refusal"] }),
      deployArgs: [],
      revisionName: "svc-rev-9",
      revisionSuffix: "abc123",
    });

    expect(plan.steps).toEqual([]);
  });
});
