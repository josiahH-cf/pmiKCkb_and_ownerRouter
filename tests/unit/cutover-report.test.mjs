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
  it("parses manifest, env-file, project, location, service, and json", () => {
    expect(
      parseCutoverReportArgs([
        "--manifest=temp/manifest.json",
        "--env-file=.env.production.local",
        "--project=pmikc-prod",
        "--location=us",
        "--service=pmi-kc-kb",
        "--json",
      ]),
    ).toEqual({
      envFile: ".env.production.local",
      json: true,
      location: "us",
      manifest: "temp/manifest.json",
      project: "pmikc-prod",
      service: "pmi-kc-kb",
    });
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
      dataStoreIds: ["kb-lease-renewals-txt"],
      uploadedUris: ["gs://bucket/lease-renewals/sop.txt"],
      seededSpaceIds: ["lease-renewals"],
    });

    expect(plan.map((step) => step.step)).toEqual([1, 2, 3, 4, 5]);
    expect(plan[0].commands[0]).toContain("gcloud run services delete");
    expect(plan[1].commands[0]).toContain("--dry-run");
    expect(plan[1].commands[1]).toContain("--confirm-delete=kb-lease-renewals-txt");
    expect(plan[2].commands[0]).toBe(
      'gcloud storage rm "gs://bucket/lease-renewals/sop.txt"',
    );
    expect(plan[3].note).toContain("spaces/lease-renewals");
    expect(plan[4].commands[0]).toContain("firestore:rules");
  });

  it("uses placeholders when concrete identifiers are unknown", () => {
    const plan = buildRollbackPlan();

    expect(plan[1].commands[0]).toContain("<data-store-id>");
    expect(plan[2].commands[0]).toContain("gs://<client-source-bucket>");
  });
});

describe("cutover report composition", () => {
  it("aggregates blockers across sections with prefixes", () => {
    const report = buildCutoverReport({
      argv: [],
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
      report.readiness.warnings.some((warning) => warning.startsWith("corpus:")),
    ).toBe(true);
    expect(report.smoke_checklist).toEqual(PRODUCTION_SMOKE_CHECKLIST);
    expect(report.rollback.length).toBe(5);
    expect(report.deploy.command_preview).toContain("run deploy");
    expect(report.mode).toBe("dry-run");
  });

  it("evaluates the production manifest template and reports corpus blockers", () => {
    const report = buildCutoverReport({
      argv: [
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
    expect(report.corpus.upload_commands.length).toBeGreaterThan(0);
    expect(report.rollback[1].commands[0]).toContain("--data-store=");
  });

  it("treats a missing manifest path as a warning, not a crash", () => {
    const report = buildCutoverReport({
      argv: ["--manifest=temp/does-not-exist.json", "--project=pmikc-prod"],
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
