import { describe, expect, it } from "vitest";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { readServerConfig } from "@/lib/config/server";
import {
  buildMigrationReadinessReport,
  classifyOwnerActions,
  type MigrationReadinessDeps,
} from "@/lib/admin/migration-readiness";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";

const admin: AuthenticatedUser = {
  uid: "test-admin",
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};

const config = readServerConfig({ ASK_DEMO_MODE: "true" });

function passingDeps(): Partial<MigrationReadinessDeps> {
  return {
    buildGcpSetupPlan: () => ({
      project: { id: "test-project" },
      apis: {},
      firebase: {},
      firestore: {},
      budget: {},
      blockers: [],
      warnings: [],
    }),
    validateProductionCutoverConfig: () => ({ ok: true, errors: [], warnings: [] }),
    validateSourceManifest: () => [
      {
        space_id: "lease-renewals",
        source_path: "docs/source.md",
        gcs_uri: "gs://bucket/source.txt",
        data_store_id: "store-1",
        approval_status: "Approved",
        sensitivity: "Low",
      },
    ],
    buildSourceCorpusReadiness: () => ({
      ok: true,
      blockers: [],
      warnings: [],
      counts: {},
    }),
    readBudgetGuardConfig: () => ({
      askDemoMode: true,
      notificationsEnabled: false,
      geminiAnswerModel: "gemini-flash",
      liveSpaceIds: [],
      budgetCapUsd: 10,
    }),
    evaluateBudgetGuard: () => ({
      ok: true,
      errors: [],
      warnings: [],
      budgetCapUsd: 10,
      posture: "demo",
      awayModeActive: true,
    }),
    readAwayModeStatus: () => "ACTIVE",
    listActionRegistry: async () => [
      {
        key: "rentvine.work_order.create",
        readiness: "Needs Connection",
        evidence_status: "Documented",
        production_allowed: false,
      },
      {
        key: "rentvine.lease.renewal_writeback",
        readiness: "Planned",
        evidence_status: "Undocumented",
        production_allowed: false,
      },
    ],
    readApprovalQueueNotificationHealth: async () => ({
      status: "Healthy",
      disabled_event_types: ["closed"],
    }),
    listApprovalQueueEmailSettings: async () => [
      { event_type: "created", email_enabled: false },
    ],
  };
}

describe("buildMigrationReadinessReport", () => {
  it("composes all sections with an ok rollup when every check passes", async () => {
    const report = await buildMigrationReadinessReport(
      { actor: admin, config },
      passingDeps(),
    );

    expect(report.away_mode_active).toBe(true);
    expect(report.gcp).toMatchObject({ available: true, project_id: "test-project" });
    expect(report.production_env).toMatchObject({ available: true, ok: true });
    expect(report.corpus).toMatchObject({ available: true, ok: true, entry_count: 1 });
    expect(report.budget).toMatchObject({
      available: true,
      posture: "demo",
      cap_usd: 10,
    });
    expect(report.action_registry).toMatchObject({ source: "firestore", total: 2 });
    expect(report.notifications).toMatchObject({ available: true, status: "Healthy" });
    expect(report.rollup).toEqual({ ok: true, blockers: [], warnings: [] });
    expect(report.owner_actions).toEqual([]);
  });

  it("prefixes section blockers and reports a non-ok rollup", async () => {
    const report = await buildMigrationReadinessReport(
      { actor: admin, config },
      {
        ...passingDeps(),
        buildGcpSetupPlan: () => ({
          project: { id: null },
          apis: {},
          firebase: {},
          firestore: {},
          budget: {},
          blockers: ["No target project id."],
          warnings: [],
        }),
        validateProductionCutoverConfig: () => ({
          ok: false,
          errors: ["GCP_PROJECT_ID must be set."],
          warnings: ["CLOUD_RUN_SERVICE_ACCOUNT is not set."],
        }),
      },
    );

    expect(report.rollup.ok).toBe(false);
    expect(report.rollup.blockers).toEqual([
      "gcp: No target project id.",
      "env: GCP_PROJECT_ID must be set.",
    ]);
    expect(report.rollup.warnings).toContain(
      "env: CLOUD_RUN_SERVICE_ACCOUNT is not set.",
    );
  });

  it("degrades a throwing section gracefully while others still compute", async () => {
    const report = await buildMigrationReadinessReport(
      { actor: admin, config },
      {
        ...passingDeps(),
        buildGcpSetupPlan: () => {
          throw new Error("boom");
        },
      },
    );

    expect(report.gcp.available).toBe(false);
    expect(report.gcp.note).toMatch(/could not be computed/);
    expect(report.rollup.warnings).toContain("gcp: setup plan unavailable.");
    expect(report.production_env.available).toBe(true);
    expect(report.budget.available).toBe(true);
  });

  it("falls back to the seed catalog when the registry read fails", async () => {
    const report = await buildMigrationReadinessReport(
      { actor: admin, config },
      {
        ...passingDeps(),
        listActionRegistry: async () => {
          throw new Error("no firestore");
        },
      },
    );

    expect(report.action_registry.source).toBe("seed-catalog");
    expect(report.action_registry.total).toBe(ACTION_REGISTRY_SEED.length);
    expect(report.action_registry.note).toMatch(/static seed catalog/);
    expect(report.action_registry.production_allowed_keys).toEqual([
      "gmail.mailbox.read",
      "gmail.thread.reply",
      "gmail.label.apply",
      "gmail.renewal_notice.draft_create",
    ]);
    expect(report.rollup.blockers.join(" ")).not.toMatch(/governance violation/);
    expect(
      report.action_registry.gated.find(
        (entry) => entry.key === "rentvine.lease.renewal_writeback",
      )?.reason,
    ).toMatch(/Undocumented/);
  });

  it("counts records by readiness and evidence", async () => {
    const report = await buildMigrationReadinessReport(
      { actor: admin, config },
      passingDeps(),
    );

    expect(report.action_registry.by_readiness).toEqual({
      "Needs Connection": 1,
      Planned: 1,
    });
    expect(report.action_registry.by_evidence).toEqual({
      Documented: 1,
      Undocumented: 1,
    });
  });

  it("raises a governance blocker when any record is production_allowed", async () => {
    const report = await buildMigrationReadinessReport(
      { actor: admin, config },
      {
        ...passingDeps(),
        listActionRegistry: async () => [
          {
            key: "rentvine.work_order.create",
            readiness: "Approved for Execution",
            evidence_status: "Documented",
            production_allowed: true,
          },
        ],
      },
    );

    expect(report.action_registry.production_allowed_keys).toEqual([
      "rentvine.work_order.create",
    ]);
    expect(report.rollup.ok).toBe(false);
    expect(report.rollup.blockers.join(" ")).toMatch(/governance violation/);
  });

  it("maps notification health states to blockers and warnings", async () => {
    const actionRequired = await buildMigrationReadinessReport(
      { actor: admin, config },
      {
        ...passingDeps(),
        readApprovalQueueNotificationHealth: async () => ({
          status: "Action Required",
          disabled_event_types: [],
        }),
      },
    );
    expect(actionRequired.rollup.blockers).toContain(
      "notifications: approval-queue notification health is Action Required.",
    );

    const needsAttention = await buildMigrationReadinessReport(
      { actor: admin, config },
      {
        ...passingDeps(),
        readApprovalQueueNotificationHealth: async () => ({
          status: "Needs Attention",
          disabled_event_types: [],
        }),
      },
    );
    expect(needsAttention.rollup.warnings).toContain(
      "notifications: approval-queue notification health is Needs Attention.",
    );
  });

  it("marks the corpus section unavailable when the manifest template is missing", async () => {
    const report = await buildMigrationReadinessReport(
      { actor: admin, config, rootDir: "/nonexistent-root" },
      passingDeps(),
    );

    expect(report.corpus.available).toBe(false);
    expect(report.corpus.note).toMatch(/not readable/);
    expect(report.rollup.warnings).toContain("corpus: manifest template unavailable.");
  });

  it("computes real plan/preflight/corpus/budget sections with the default deps", async () => {
    // Smoke test against the real .mjs modules (gcp/env/corpus/budget) to catch declaration
    // drift. The Firestore-backed reads are forced unavailable so the registry
    // deterministically falls back to the seed catalog and notifications degrade with a
    // note. Without this, a developer machine carrying Application Default Credentials lets
    // the real listActionRegistry reach an empty prod `action_registry` collection (0 docs,
    // returned without throwing), which silently defeats the seed-fallback assertion below.
    const firestoreUnavailable = async () => {
      throw new Error("Firestore is not available in this smoke test.");
    };
    const report = await buildMigrationReadinessReport(
      {
        actor: admin,
        config,
        env: { ASK_DEMO_MODE: "true" } as unknown as NodeJS.ProcessEnv,
      },
      {
        listActionRegistry: firestoreUnavailable,
        readApprovalQueueNotificationHealth: firestoreUnavailable,
        listApprovalQueueEmailSettings: firestoreUnavailable,
      },
    );

    expect(report.gcp.available).toBe(true);
    expect(report.production_env.available).toBe(true);
    expect(report.production_env.ok).toBe(false);
    expect(report.corpus.available).toBe(true);
    expect(report.corpus.entry_count).toBeGreaterThan(0);
    expect(report.budget.available).toBe(true);
    expect(report.budget.cap_usd).toBe(10);
    expect(report.action_registry.total).toBeGreaterThanOrEqual(14);
    expect(report.action_registry.production_allowed_keys).toEqual([
      "gmail.mailbox.read",
      "gmail.thread.reply",
      "gmail.label.apply",
      "gmail.renewal_notice.draft_create",
    ]);
    expect(report.rollup.ok).toBe(false);
    expect(report.owner_actions.length).toBeGreaterThan(0);
    // Cold-importing the real .mjs module graph (firebase-admin, google libs) can exceed the
    // 5s default on slow/CI runners; allow this real-deps smoke test a generous timeout.
  }, 30_000);
});

describe("classifyOwnerActions", () => {
  it("labels gcp, env, and corpus blockers as owner-side and ignores the rest", () => {
    const ownerActions = classifyOwnerActions({
      ok: false,
      blockers: [
        "gcp: No target project id.",
        "env: GCP_PROJECT_ID must be set.",
        "corpus: Manifest entry 0 space_id must be replaced with a real production value.",
        "registry: 1 entry is production_allowed=true — governance violation, investigate before any cutover step.",
        "notifications: approval-queue notification health is Action Required.",
      ],
      warnings: [],
    });

    expect(ownerActions).toEqual([
      "gcp: No target project id.",
      "env: GCP_PROJECT_ID must be set.",
      "corpus: Manifest entry 0 space_id must be replaced with a real production value.",
    ]);
  });
});
