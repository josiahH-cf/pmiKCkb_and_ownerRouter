import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  applyLiveState,
  buildEnableApisCommand,
  buildGcpSetupPlan,
  buildReadiness,
  evaluateEnabledApis,
  evaluateFirestoreDatabase,
  fetchLiveState,
  parseGcpSetupArgs,
  readDefinedIndexCount,
  REQUIRED_GCP_APIS,
} from "../../scripts/preflight-gcp-setup.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("gcp setup preflight args", () => {
  it("parses project, env-file, live, and json flags", () => {
    expect(
      parseGcpSetupArgs([
        "--project=pmikc-prod",
        "--env-file=.env.production.local",
        "--live",
        "--json",
      ]),
    ).toEqual({
      envFile: ".env.production.local",
      json: true,
      live: true,
      project: "pmikc-prod",
    });

    expect(parseGcpSetupArgs([])).toEqual({
      envFile: undefined,
      json: false,
      live: false,
      project: undefined,
    });
  });
});

describe("required API doc sync", () => {
  it("matches the gcloud services enable block in the cutover runbook", () => {
    const runbook = readFileSync(
      join(root, "docs", "client-production-cutover.md"),
      "utf8",
    );
    const match = /gcloud services enable ([^\n]+) --project=/.exec(runbook);

    expect(match, "runbook enable command not found").toBeTruthy();
    const documented = match[1].trim().split(/\s+/);

    expect(REQUIRED_GCP_APIS).toEqual(documented);
  });

  it("builds the enable command for a project", () => {
    const command = buildEnableApisCommand("pmikc-prod");

    expect(command.startsWith("gcloud services enable aiplatform.googleapis.com")).toBe(
      true,
    );
    expect(command.endsWith("--project=pmikc-prod")).toBe(true);
  });
});

describe("plan mode", () => {
  it("blocks when no project id is available", () => {
    const plan = buildGcpSetupPlan({ env: {} });
    const readiness = buildReadiness(plan);

    expect(readiness.ok).toBe(false);
    expect(
      readiness.blockers.some((blocker) => blocker.includes("No target project id")),
    ).toBe(true);
  });

  it("produces a complete converge plan for a named project", () => {
    const plan = buildGcpSetupPlan({
      projectId: "pmikc-prod",
      env: { ASK_DEMO_MODE: "true" },
      awayModeActive: true,
      rulesFileExists: true,
      definedIndexCount: 0,
    });

    expect(plan.project.id).toBe("pmikc-prod");
    expect(plan.apis.enable_command).toContain("--project=pmikc-prod");
    expect(plan.firebase.setup_commands[0]).toContain("firebase:setup");
    expect(plan.firestore.create_command).toContain("firestore-native");
    expect(plan.firestore.deploy_rules_command).toContain("firestore:rules");
    expect(plan.budget.posture).toBe("demo");
    expect(plan.budget.ok).toBe(true);
    expect(buildReadiness(plan).ok).toBe(true);
  });

  it("blocks when the rules file is missing", () => {
    const plan = buildGcpSetupPlan({
      projectId: "pmikc-prod",
      env: {},
      rulesFileExists: false,
      definedIndexCount: 0,
    });

    expect(buildReadiness(plan).blockers).toContain(
      "firestore.rules is missing from the repository.",
    );
  });

  it("surfaces budget-guard errors as blockers", () => {
    const plan = buildGcpSetupPlan({
      projectId: "pmikc-prod",
      env: {
        ASK_DEMO_MODE: "false",
        GEMINI_MODEL_ANSWER: "gemini-2.5-pro",
        SPACE_VERTEX_DATA_STORE_IDS: '{"lease-renewals":"store"}',
      },
      rulesFileExists: true,
      definedIndexCount: 0,
    });

    expect(plan.budget.ok).toBe(false);
    expect(buildReadiness(plan).ok).toBe(false);
  });

  it("counts defined indexes from the checked-in index file", () => {
    expect(typeof readDefinedIndexCount()).toBe("number");
  });
});

describe("live state evaluation", () => {
  it("splits enabled and missing APIs", () => {
    const result = evaluateEnabledApis(["run.googleapis.com", "iam.googleapis.com"]);

    expect(result.enabled).toEqual(["run.googleapis.com", "iam.googleapis.com"]);
    expect(result.missing).toContain("firestore.googleapis.com");
    expect(result.missing.length).toBe(REQUIRED_GCP_APIS.length - 2);
  });

  it("evaluates Firestore database state", () => {
    expect(evaluateFirestoreDatabase(undefined)).toEqual({ exists: false });
    expect(
      evaluateFirestoreDatabase({ locationId: "us-central1", type: "FIRESTORE_NATIVE" }),
    ).toEqual({
      exists: true,
      location: "us-central1",
      type: "FIRESTORE_NATIVE",
      native_mode: true,
    });
  });

  it("degrades to a structured blocker when credentials are unavailable", async () => {
    const state = await fetchLiveState("pmikc-prod", {
      authFactory: () => {
        throw new Error("no ADC in this environment");
      },
    });

    expect(state.credentials_available).toBe(false);
    expect(state.errors[0]).toContain("Application Default Credentials unavailable");

    const plan = buildGcpSetupPlan({
      projectId: "pmikc-prod",
      env: {},
      rulesFileExists: true,
      definedIndexCount: 0,
    });
    const report = applyLiveState(plan, state);

    expect(buildReadiness(report).ok).toBe(false);
    expect(report.live.credentials_available).toBe(false);
  });

  it("reads live state through an injected auth client", async () => {
    const responses = {
      "serviceusage.googleapis.com": {
        services: REQUIRED_GCP_APIS.map((api) => ({
          name: `projects/123/services/${api}`,
        })),
      },
      "firestore.googleapis.com": {
        locationId: "us-central1",
        type: "FIRESTORE_NATIVE",
      },
      "firebase.googleapis.com": {
        projectId: "pmikc-prod",
        displayName: "PMI KC KB",
        state: "ACTIVE",
      },
    };

    const state = await fetchLiveState("pmikc-prod", {
      authFactory: () => ({
        getClient: async () => ({
          request: async ({ url }) => {
            const host = new URL(url).host;
            return { data: responses[host] };
          },
        }),
      }),
    });

    expect(state.credentials_available).toBe(true);
    expect(state.enabled_services.length).toBe(REQUIRED_GCP_APIS.length);

    const plan = buildGcpSetupPlan({
      projectId: "pmikc-prod",
      env: { ASK_DEMO_MODE: "true" },
      rulesFileExists: true,
      definedIndexCount: 0,
    });
    const report = applyLiveState(plan, state);
    const readiness = buildReadiness(report);

    expect(report.live.apis.missing).toEqual([]);
    expect(report.live.firestore.native_mode).toBe(true);
    expect(report.live.firebase.state).toBe("ACTIVE");
    expect(readiness.ok).toBe(true);
  });

  it("blocks on missing APIs and non-native Firestore", async () => {
    const state = await fetchLiveState("pmikc-prod", {
      authFactory: () => ({
        getClient: async () => ({
          request: async ({ url }) => {
            const host = new URL(url).host;

            if (host === "serviceusage.googleapis.com") {
              return { data: { services: [] } };
            }

            if (host === "firestore.googleapis.com") {
              return { data: { locationId: "us-central1", type: "DATASTORE_MODE" } };
            }

            return { data: {} };
          },
        }),
      }),
    });

    const plan = buildGcpSetupPlan({
      projectId: "pmikc-prod",
      env: { ASK_DEMO_MODE: "true" },
      rulesFileExists: true,
      definedIndexCount: 0,
    });
    const report = applyLiveState(plan, state);
    const readiness = buildReadiness(report);

    expect(readiness.ok).toBe(false);
    expect(
      readiness.blockers.some((blocker) => blocker.includes("Missing required APIs")),
    ).toBe(true);
    expect(readiness.blockers).toContain(
      "Firestore database exists but is not in Native mode.",
    );
  });
});
