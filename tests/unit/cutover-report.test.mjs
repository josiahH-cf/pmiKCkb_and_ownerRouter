import { describe, expect, it } from "vitest";
import {
  buildCutoverReport,
  buildRollbackPlan,
  parseCutoverReportArgs,
  PRODUCTION_SMOKE_CHECKLIST,
  readRunbookSmokeChecklist,
} from "../../scripts/build-cutover-report.mjs";

const normalize = (text) => text.replace(/\s+/g, " ").trim();

describe("cutover report args", () => {
  it("parses manifest, env-file, project, location, prior revision, and json", () => {
    expect(
      parseCutoverReportArgs([
        "--manifest=temp/manifest.json",
        "--env-file=.env.production.local",
        "--project=pmikc-prod",
        "--location=us",
        "--prior-revision=pmi-kc-kb-demo-00041-prior",
        "--json",
      ]),
    ).toEqual({
      envFile: ".env.production.local",
      help: false,
      json: true,
      location: "us",
      manifest: "temp/manifest.json",
      priorRevision: "pmi-kc-kb-demo-00041-prior",
      project: "pmikc-prod",
    });
  });

  it("rejects unknown, duplicate, and empty arguments", () => {
    expect(() => parseCutoverReportArgs(["--manfest=temp/manifest.json"])).toThrow(
      "Unknown cutover report argument",
    );
    expect(() =>
      parseCutoverReportArgs(["--manifest=one.json", "--manifest=two.json"]),
    ).toThrow("Duplicate cutover report argument");
    expect(() => parseCutoverReportArgs(["--manifest="])).toThrow("requires a value");
    expect(() => parseCutoverReportArgs(["--service=pmi-kc-kb"])).toThrow(
      "Unknown cutover report argument",
    );
    expect(() => parseCutoverReportArgs(["--region=europe-west1"])).toThrow(
      "Unknown cutover report argument",
    );
  });
});

describe("smoke checklist doc sync", () => {
  it("matches the runbook §7 checklist bullets", () => {
    const documented = readRunbookSmokeChecklist();

    expect(documented.length).toBe(PRODUCTION_SMOKE_CHECKLIST.length);
    expect(PRODUCTION_SMOKE_CHECKLIST.map((item) => normalize(item.description))).toEqual(
      documented.map(normalize),
    );
  });

  it("gives every checklist item a unique id", () => {
    const ids = PRODUCTION_SMOKE_CHECKLIST.map((item) => item.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("rollback plan", () => {
  it("orders rollback steps from deploy back to rules", () => {
    const plan = buildRollbackPlan({
      project: "pmikc-prod",
      priorRevision: "pmi-kc-kb-demo-00041-prior",
      dataStoreIds: ["kb-lease-renewals-txt"],
      uploadedUris: ["gs://bucket/lease-renewals/sop.txt"],
      seededSpaceIds: ["lease-renewals"],
    });

    expect(plan.map((step) => step.step)).toEqual([1, 2, 3, 4, 5]);
    expect(plan[0].commands[0]).toContain("gcloud run services update-traffic");
    expect(plan[0].commands[0]).toContain(
      "--to-revisions=pmi-kc-kb-demo-00041-prior=100",
    );
    expect(plan.slice(1).every((step) => step.commands.length === 0)).toBe(true);
    expect(plan[1].note).toContain("kb-lease-renewals-txt");
    expect(plan[2].note).toContain("gs://bucket/lease-renewals/sop.txt");
    expect(plan[3].note).toContain("spaces/lease-renewals");
    expect(plan[4].note).toContain("immutable pre-deploy configuration reference");
    expect(JSON.stringify(plan)).not.toContain("confirm-delete");
    expect(JSON.stringify(plan)).not.toContain("gcloud storage rm");
    expect(JSON.stringify(plan)).not.toContain("firebase -- deploy");
    expect(JSON.stringify(plan)).not.toContain("gcloud run services delete");
  });

  it("uses placeholders when concrete identifiers are unknown", () => {
    const plan = buildRollbackPlan();

    expect(plan[0].commands).toEqual([]);
    expect(plan[0].note).toContain("Capture the currently serving");
    expect(plan.slice(1).every((step) => step.commands.length === 0)).toBe(true);
    expect(plan[1].note).toContain("<data-store-id>");
    expect(plan[2].note).toContain("gs://<client-source-bucket>");
  });
});

// Point every composition case at an empty env fixture so readProductionPreflightEnv does not
// read the host's on-disk `.env.local`. Otherwise a developer machine that carries a real
// GCP_PROJECT_ID (e.g. pmi-kc-kb-prod) suppresses the expected "no target project id" gcp:
// blocker and the first case fails only locally — the same env-coupling class as the
// migration-readiness smoke test.
const HERMETIC_ENV_FILE = "--env-file=tests/fixtures/empty-env.fixture";

describe("cutover report composition", () => {
  it("aggregates blockers across sections with prefixes", () => {
    const report = buildCutoverReport({
      argv: [HERMETIC_ENV_FILE],
      env: { ASK_DEMO_MODE: "true" },
      awayModeActive: true,
    });

    expect(report.readiness.ok).toBe(false);
    expect(report.readiness.blockers.some((blocker) => blocker.startsWith("gcp:"))).toBe(
      true,
    );
    expect(report.readiness.blockers.some((blocker) => blocker.startsWith("env:"))).toBe(
      true,
    );
    expect(
      report.readiness.blockers.some((blocker) => blocker.startsWith("corpus:")),
    ).toBe(true);
    expect(report.smoke_checklist).toEqual(PRODUCTION_SMOKE_CHECKLIST);
    expect(report.rollback.length).toBe(5);
    expect(report.rollback_ready).toBe(false);
    expect(
      report.readiness.blockers.some((blocker) => blocker.startsWith("rollback:")),
    ).toBe(true);
    expect(JSON.stringify(report.rollback)).not.toContain("services delete");
    expect(report.deploy.command_preview).toBe("");
    expect(report.mode).toBe("dry-run");
  });

  it("evaluates the production manifest template and reports corpus blockers", () => {
    const report = buildCutoverReport({
      argv: [
        HERMETIC_ENV_FILE,
        "--manifest=docs/source-corpus/client-production-source-manifest.template.json",
        "--project=pmikc-kb-production",
        "--location=us",
      ],
      env: { ASK_DEMO_MODE: "true" },
      awayModeActive: true,
    });

    expect(report.corpus.evaluated).toBe(true);
    expect(report.corpus.readiness.ok).toBe(false);
    expect(
      report.readiness.blockers.some((blocker) => blocker.startsWith("corpus:")),
    ).toBe(true);
    expect(report.corpus.upload_commands).toEqual([]);
    expect(report.rollback[1].commands).toEqual([]);
    expect(report.rollback[1].note).toContain("Candidate data stores");
  });

  it("treats a missing manifest path as a blocker, not a crash", () => {
    const report = buildCutoverReport({
      argv: [
        HERMETIC_ENV_FILE,
        "--manifest=temp/does-not-exist.json",
        "--project=pmikc-prod",
      ],
      env: { ASK_DEMO_MODE: "true" },
      awayModeActive: true,
    });

    expect(report.corpus.evaluated).toBe(false);
    expect(
      report.readiness.blockers.some((blocker) =>
        blocker.includes("manifest could not be evaluated"),
      ),
    ).toBe(true);
  });
});
