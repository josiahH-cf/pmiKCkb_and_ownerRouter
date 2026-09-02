import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AuthenticatedUser } from "@/lib/auth/session";
import type { ServerConfig } from "@/lib/config/server";
import {
  buildActionRegistryRecord,
  listActionRegistry,
} from "@/lib/firestore/action-registry";
import {
  listApprovalQueueEmailSettings,
  readApprovalQueueNotificationHealth,
} from "@/lib/firestore/approval-queue-notifications";
import {
  ACTION_REGISTRY_SEED,
  OWNER_PROOF_WINDOW_OPEN_KEYS,
} from "@/lib/integrations/action-registry-seed";
import {
  evaluateBudgetGuard,
  readAwayModeStatus,
  readBudgetGuardConfig,
} from "@/scripts/check-budget-guard.mjs";
import { buildGcpSetupPlan } from "@/scripts/preflight-gcp-setup.mjs";
import { validateProductionCutoverConfig } from "@/scripts/preflight-production-cutover.mjs";
import {
  buildSourceCorpusReadiness,
  validateSourceManifest,
} from "@/scripts/source-corpus-readiness.mjs";
import { projectActionRuntimeRequirements } from "@/scripts/action-runtime-requirements.mjs";

/**
 * Read-only aggregation behind the Admin migration console (/admin/migration). It mirrors
 * `npm run cutover:report` in-app by composing the same pure readiness functions the
 * cutover tooling uses. Nothing here mutates state or calls a cloud API: GCP/Firebase
 * inspection stays plan-mode (no live fetch), the corpus check reads the tracked manifest
 * template, and the Action Registry/notification reads go through the existing read-only
 * Firestore boundaries with graceful degradation when Firestore is unavailable.
 *
 * Important: the underlying scripts derive default paths from import.meta.url, which
 * mis-resolves once Next.js bundles them, so every call below passes explicit arguments
 * rooted at the caller-supplied root directory (default process.cwd()).
 */

export const PRODUCTION_MANIFEST_TEMPLATE = join(
  "docs",
  "source-corpus",
  "client-production-source-manifest.template.json",
);

export interface ReadinessRollup {
  ok: boolean;
  blockers: string[];
  warnings: string[];
}

export interface MigrationReadinessReport {
  generated_at: string;
  away_mode_active: boolean;
  gcp: {
    available: boolean;
    note?: string;
    project_id: string | null;
    blockers: string[];
    warnings: string[];
  };
  production_env: {
    available: boolean;
    note?: string;
    ok: boolean;
    errors: string[];
    warnings: string[];
  };
  corpus: {
    available: boolean;
    note?: string;
    manifest_path: string;
    ok: boolean;
    blockers: string[];
    warnings: string[];
    entry_count: number;
  };
  budget: {
    available: boolean;
    note?: string;
    posture: "demo" | "live";
    cap_usd: number;
    ok: boolean;
    errors: string[];
    warnings: string[];
  };
  action_registry: {
    available: boolean;
    note?: string;
    source: "firestore" | "seed-catalog";
    total: number;
    by_readiness: Record<string, number>;
    by_evidence: Record<string, number>;
    gated: Array<{ key: string; reason: string }>;
    committed_executable_keys: string[];
    production_allowed_keys: string[];
    gate_drift: Array<{
      key: string;
      committed_production_allowed: boolean | null;
      registry_production_allowed: boolean | null;
    }>;
    runtime_active_keys: string[];
    runtime_inert: Array<{
      key: string;
      missing_runtime_variables: string[];
    }>;
    // production_allowed keys NOT on the executable allow-list — a surprise flip; empty is healthy.
    unexpected_production_allowed_keys: string[];
  };
  notifications: {
    available: boolean;
    note?: string;
    status?: string;
    disabled_event_types: string[];
    settings_count: number;
  };
  rollup: ReadinessRollup;
  owner_actions: string[];
}

interface RegistrySummaryRecord {
  key: string;
  readiness: string;
  evidence_status: string;
  production_allowed: boolean;
}

export interface MigrationReadinessDeps {
  buildGcpSetupPlan: typeof buildGcpSetupPlan;
  validateProductionCutoverConfig: typeof validateProductionCutoverConfig;
  validateSourceManifest: typeof validateSourceManifest;
  buildSourceCorpusReadiness: typeof buildSourceCorpusReadiness;
  readBudgetGuardConfig: typeof readBudgetGuardConfig;
  evaluateBudgetGuard: typeof evaluateBudgetGuard;
  readAwayModeStatus: typeof readAwayModeStatus;
  listActionRegistry: (actor: AuthenticatedUser) => Promise<RegistrySummaryRecord[]>;
  readApprovalQueueNotificationHealth: (input: {
    actor: AuthenticatedUser;
  }) => Promise<{ status: string; disabled_event_types: string[] }>;
  listApprovalQueueEmailSettings: (
    actor: AuthenticatedUser,
  ) => Promise<Array<{ event_type: string; email_enabled: boolean }>>;
}

const defaultDeps: MigrationReadinessDeps = {
  buildGcpSetupPlan,
  validateProductionCutoverConfig,
  validateSourceManifest,
  buildSourceCorpusReadiness,
  readBudgetGuardConfig,
  evaluateBudgetGuard,
  readAwayModeStatus,
  listActionRegistry,
  readApprovalQueueNotificationHealth,
  listApprovalQueueEmailSettings,
};

// Blockers in these sections need owner-side action (credentials, billing, real project
// ids, a reviewed production manifest); they cannot be cleared from the remote container.
const OWNER_SIDE_SECTIONS = ["gcp:", "env:", "corpus:"];

// Action Registry keys intentionally allowed by the workflow product. Transport proof alone does not
// authorize generic send or sample-backed workflow drafts. A production_allowed key NOT in this set is
// a surprise flip the cutover must flag. The renewal-notice draft was authorized by the 2026-07-19
// owner grant (F-SEND-AUTHORIZED): draft-into-Gmail, human sends, sample data still preview-only. The
// maintenance owner-notice DRAFT was authorized 2026-07-22 (Slice 6) once the owner email was confirmed
// at portfolio.owners[].email (25/25); draft-only, its paired .send stays gated.
const EXECUTABLE_ALLOWLIST = new Set<string>([
  "gmail.mailbox.read",
  "gmail.thread.reply",
  "gmail.label.apply",
  "gmail.renewal_notice.draft_create",
  // S59 activation (2026-08-26): read-only reference comps; no offered-rent or system-of-record write.
  "rentcast.rental_listings.search",
  "gmail.maintenance_owner_notice.draft_create",
  // S39.3 (2026-07-23): internal-staff transactional notice flipped live (D-AUTOMATION-LINE). Internal-only
  // auto-send, metadata-only, internal-domain-locked; every client-facing send stays human-confirmed.
  "internal.transactional_notice.send",
]);

export function classifyOwnerActions(rollup: ReadinessRollup): string[] {
  return rollup.blockers.filter((blocker) =>
    OWNER_SIDE_SECTIONS.some((prefix) => blocker.startsWith(prefix)),
  );
}

export async function buildMigrationReadinessReport(
  options: {
    actor: AuthenticatedUser;
    config: ServerConfig;
    env?: NodeJS.ProcessEnv;
    rootDir?: string;
  },
  deps: Partial<MigrationReadinessDeps> = {},
): Promise<MigrationReadinessReport> {
  const { actor } = options;
  const env = options.env ?? process.env;
  const rootDir = options.rootDir ?? process.cwd();
  const resolved = { ...defaultDeps, ...deps };
  const blockers: string[] = [];
  const warnings: string[] = [];

  let awayModeActive = false;
  try {
    awayModeActive =
      resolved.readAwayModeStatus(join(rootDir, "docs/away-mode.md")) === "ACTIVE";
  } catch {
    warnings.push("away-mode: status could not be read; treating away mode as inactive.");
  }

  // GCP/Firebase/Firestore converge plan (plan mode only; never a live fetch).
  let gcp: MigrationReadinessReport["gcp"];
  try {
    const plan = resolved.buildGcpSetupPlan({
      projectId: env.GCP_PROJECT_ID ?? env.FIREBASE_PROJECT_ID,
      env: env as Record<string, string | undefined>,
      awayModeActive,
      rulesFileExists: existsSync(join(rootDir, "firestore.rules")),
      definedIndexCount: readDefinedIndexCount(rootDir),
    });
    gcp = {
      available: true,
      project_id: plan.project.id,
      blockers: plan.blockers,
      warnings: plan.warnings,
    };
    blockers.push(...plan.blockers.map((item) => `gcp: ${item}`));
    warnings.push(...plan.warnings.map((item) => `gcp: ${item}`));
  } catch {
    gcp = {
      available: false,
      note: "GCP setup plan could not be computed in this session.",
      project_id: null,
      blockers: [],
      warnings: [],
    };
    warnings.push("gcp: setup plan unavailable.");
  }

  // Production env preflight against the current process env. In dev/demo this honestly
  // reports the missing production values; that is the preview-first intent.
  let productionEnv: MigrationReadinessReport["production_env"];
  try {
    const result = resolved.validateProductionCutoverConfig(
      env as Record<string, string | undefined>,
      { maintenanceIntakeSource: "runtime" },
    );
    productionEnv = {
      available: true,
      ok: result.ok,
      errors: result.errors,
      warnings: result.warnings,
    };
    blockers.push(...result.errors.map((item) => `env: ${item}`));
    warnings.push(...result.warnings.map((item) => `env: ${item}`));
  } catch {
    productionEnv = {
      available: false,
      note: "Production env preflight could not be computed in this session.",
      ok: false,
      errors: [],
      warnings: [],
    };
    warnings.push("env: production preflight unavailable.");
  }

  // Source corpus readiness from the tracked production manifest template.
  const manifestPath = join(rootDir, PRODUCTION_MANIFEST_TEMPLATE);
  let corpus: MigrationReadinessReport["corpus"];
  try {
    if (!existsSync(manifestPath)) {
      throw new Error("manifest template missing");
    }

    const entries = resolved.validateSourceManifest(
      JSON.parse(readFileSync(manifestPath, "utf8")),
    );
    const readiness = resolved.buildSourceCorpusReadiness(entries);
    corpus = {
      available: true,
      manifest_path: PRODUCTION_MANIFEST_TEMPLATE,
      ok: readiness.ok,
      blockers: readiness.blockers,
      warnings: readiness.warnings,
      entry_count: entries.length,
    };
    blockers.push(...readiness.blockers.map((item) => `corpus: ${item}`));
    warnings.push(...readiness.warnings.map((item) => `corpus: ${item}`));
  } catch {
    corpus = {
      available: false,
      note: "Source corpus manifest template is not readable in this session.",
      manifest_path: PRODUCTION_MANIFEST_TEMPLATE,
      ok: false,
      blockers: [],
      warnings: [],
      entry_count: 0,
    };
    warnings.push("corpus: manifest template unavailable.");
  }

  // Budget and away-mode posture via the budget guard (pure evaluation, no overrides).
  let budget: MigrationReadinessReport["budget"];
  try {
    const guardConfig = resolved.readBudgetGuardConfig(
      env as Record<string, string | undefined>,
      {},
    );
    const result = resolved.evaluateBudgetGuard(guardConfig, { awayModeActive });
    budget = {
      available: true,
      posture: result.posture,
      cap_usd: result.budgetCapUsd,
      ok: result.ok,
      errors: result.errors,
      warnings: result.warnings,
    };
    blockers.push(...result.errors.map((item) => `budget: ${item}`));
    warnings.push(...result.warnings.map((item) => `budget: ${item}`));
  } catch {
    budget = {
      available: false,
      note: "Budget guard posture could not be computed in this session.",
      posture: "demo",
      cap_usd: 0,
      ok: false,
      errors: [],
      warnings: [],
    };
    warnings.push("budget: posture unavailable.");
  }

  // Action Registry readiness, falling back to the static seed catalog when Firestore is
  // not reachable so the console still shows the governed catalog shape.
  let actionRegistry: MigrationReadinessReport["action_registry"];
  try {
    const records = await resolved.listActionRegistry(actor);
    actionRegistry = summarizeRegistry(records, "firestore", env);
  } catch {
    const records = ACTION_REGISTRY_SEED.map((entry) => buildActionRegistryRecord(entry));
    actionRegistry = summarizeRegistry(records, "seed-catalog", env);
    actionRegistry.note =
      "Showing the static seed catalog because Firestore is not available in this session.";
    blockers.push(
      "registry: Firestore gate metadata is unavailable; committed seed fallback cannot verify production gate parity.",
    );
  }

  // Executable keys on the allow-list are backed by committed grant artifacts (Section 3) — not
  // violations. Any OTHER production_allowed key is a surprise flip the cutover must catch.
  if (actionRegistry.unexpected_production_allowed_keys.length > 0) {
    const unexpected = actionRegistry.unexpected_production_allowed_keys;
    blockers.push(
      `registry: ${unexpected.length} entr${
        unexpected.length === 1 ? "y is" : "ies are"
      } production_allowed=true (${unexpected.join(", ")}) — governance violation, investigate before any cutover step.`,
    );
  }

  for (const drift of actionRegistry.gate_drift) {
    const returned =
      drift.registry_production_allowed === null
        ? "missing"
        : String(drift.registry_production_allowed);
    const committed =
      drift.committed_production_allowed === null
        ? "missing"
        : String(drift.committed_production_allowed);
    blockers.push(
      `registry drift: ${drift.key} is production_allowed=${returned} in Firestore but committed execution authority is ${committed}.`,
    );
  }

  for (const inert of actionRegistry.runtime_inert) {
    blockers.push(
      `registry runtime: ${inert.key} is production_allowed=true but runtime-inert; missing or invalid runtime variables: ${inert.missing_runtime_variables.join(", ")}.`,
    );
  }

  // Notification posture (health + per-event email settings).
  let notifications: MigrationReadinessReport["notifications"];
  try {
    const [health, settings] = await Promise.all([
      resolved.readApprovalQueueNotificationHealth({ actor }),
      resolved.listApprovalQueueEmailSettings(actor),
    ]);
    notifications = {
      available: true,
      status: health.status,
      disabled_event_types: health.disabled_event_types,
      settings_count: settings.length,
    };

    if (health.status === "Action Required") {
      blockers.push(
        "notifications: approval-queue notification health is Action Required.",
      );
    } else if (health.status === "Needs Attention") {
      warnings.push(
        "notifications: approval-queue notification health is Needs Attention.",
      );
    }
  } catch {
    notifications = {
      available: false,
      note: "Approval Queue notification health is not available in this session.",
      disabled_event_types: [],
      settings_count: 0,
    };
    warnings.push("notifications: health unavailable.");
  }

  const rollup: ReadinessRollup = {
    ok: blockers.length === 0,
    blockers,
    warnings,
  };

  return {
    generated_at: new Date().toISOString(),
    away_mode_active: awayModeActive,
    gcp,
    production_env: productionEnv,
    corpus,
    budget,
    action_registry: actionRegistry,
    notifications,
    rollup,
    owner_actions: classifyOwnerActions(rollup),
  };
}

function summarizeRegistry(
  records: RegistrySummaryRecord[],
  source: "firestore" | "seed-catalog",
  runtimeValues: Record<string, string | undefined>,
): MigrationReadinessReport["action_registry"] {
  const byReadiness: Record<string, number> = {};
  const byEvidence: Record<string, number> = {};
  const gated: Array<{ key: string; reason: string }> = [];
  const productionAllowedKeys: string[] = [];

  for (const record of records) {
    byReadiness[record.readiness] = (byReadiness[record.readiness] ?? 0) + 1;
    byEvidence[record.evidence_status] = (byEvidence[record.evidence_status] ?? 0) + 1;

    const reasons: string[] = [];

    if (record.evidence_status !== "Documented") {
      reasons.push(`evidence is ${record.evidence_status}`);
    }

    if (record.readiness === "Planned" || record.readiness === "Disabled") {
      reasons.push(`readiness is ${record.readiness}`);
    }

    if (reasons.length > 0) {
      gated.push({ key: record.key, reason: reasons.join("; ") });
    }

    if (record.production_allowed) {
      productionAllowedKeys.push(record.key);
    }
  }

  const runtime = projectActionRuntimeRequirements(
    runtimeValues,
    Object.fromEntries(
      ACTION_REGISTRY_SEED.map((entry) => [entry.key, entry.production_allowed]),
    ),
  );
  const committedByKey = new Map(
    ACTION_REGISTRY_SEED.map((entry) => [entry.key, entry.production_allowed]),
  );
  const returnedByKey = new Map(
    records.map((record) => [record.key, record.production_allowed]),
  );
  const gateDrift =
    source === "firestore"
      ? [...new Set([...committedByKey.keys(), ...returnedByKey.keys()])]
          .sort()
          .flatMap((key) => {
            const committed = committedByKey.get(key);
            const returned = returnedByKey.get(key);
            return committed !== returned
              ? [
                  {
                    key,
                    committed_production_allowed: committed ?? null,
                    registry_production_allowed: returned ?? null,
                  },
                ]
              : [];
          })
      : [];
  const committedExecutableKeys = ACTION_REGISTRY_SEED.filter(
    (entry) => entry.production_allowed,
  ).map((entry) => entry.key);

  return {
    available: true,
    source,
    total: records.length,
    by_readiness: byReadiness,
    by_evidence: byEvidence,
    gated,
    committed_executable_keys: committedExecutableKeys,
    production_allowed_keys: productionAllowedKeys,
    gate_drift: gateDrift,
    runtime_active_keys: runtime.runtime_active_keys,
    runtime_inert: runtime.runtime_inert,
    unexpected_production_allowed_keys: productionAllowedKeys.filter(
      // A key inside its S97-S100 owner-authorized bounded proof window is expected, not a
      // surprise flip; the window list is committed and reviewed beside the seed.
      (key) =>
        !EXECUTABLE_ALLOWLIST.has(key) && !OWNER_PROOF_WINDOW_OPEN_KEYS.includes(key),
    ),
  };
}

function readDefinedIndexCount(rootDir: string): number {
  try {
    const parsed = JSON.parse(
      readFileSync(join(rootDir, "firestore.indexes.json"), "utf8"),
    ) as { indexes?: unknown[] };
    return Array.isArray(parsed.indexes) ? parsed.indexes.length : 0;
  } catch {
    return 0;
  }
}
