import type { Capability, Role } from "@/lib/auth/roles";
import { NON_RENEWAL_HANDOFF_TARGET_ID } from "@/lib/lease-renewal/renewal-issues";
import {
  resolveActionGraph,
  type ActionGraphDiagnostic,
  type ActionGraphNode,
  type ActionGraphReason,
  type ActionGraphRequirement,
  type ActionGraphStatus,
} from "@/lib/lease-renewal/action-graph";
import type { DeskVerificationCause } from "@/lib/lease-renewal/desk-guidance";
import type { DeskLeaseAction } from "@/lib/lease-renewal/desk-model";
import type { RenewalOverallStatus } from "@/lib/lease-renewal/desk-query-v2";
import type {
  RenewalProcessStatus,
  RenewalProcessStepId,
  RenewalSubstepState,
} from "@/lib/lease-renewal/renewal-process";
import {
  hasRenewalRoleAuthority,
  type RenewalCapabilityKey,
} from "@/lib/lease-renewal/role-action-governance";
import {
  MANUAL_ACTIVITIES,
  MANUAL_REQUIRED_RENEWAL,
  currentManualTenantOutcome,
  manualActionLabel,
  manualActivitySatisfied,
  manualNonRenewal,
  manualRenewalSummary,
  type ManualActivity,
  type RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";

/**
 * S142: the dependency-aware renewal next-action projection for one lease and its current cycle.
 *
 * Every action maps to an existing Full view control and an existing completion predicate: the
 * S113 staff-recorded lane (`manualRenewalSummary` and its extracted predicates), the S72 evidence
 * graph's verification substeps, the S127 guidance cause, the S124 move-out redirect and the S117
 * source-update outcomes. Nothing here stores progress, counts completions, adds a stage or grants
 * authority; the backend action routes stay authoritative for every submission. An action with no
 * mapped control is reported as unresolved instead of guessed, and lease completion comes only from
 * the owning completion record, never from an empty list.
 *
 * Pure and client-safe: the server builds the serializable snapshot, and the Focus view recomputes
 * this projection from the snapshot plus its current staff-record readback.
 */

export const RENEWAL_ACTIONS_VERSION = "renewal-actions/v1" as const;

export type RenewalActionStatus = ActionGraphStatus;
export type RenewalActionRequirement = "required" | "optional" | "advisory";
export type RenewalActionGroup =
  | "recovery"
  | "verification"
  | "staff_work"
  | "process"
  | "source_update"
  | "issue";
export type RenewalActionLane = "manual" | "process";

/** One S72 verification substep, reduced to the facts the projection reads. */
export interface RenewalActionSubstep {
  readonly id: string;
  readonly label: string;
  readonly state: RenewalSubstepState;
  readonly completionRule: string;
  readonly blockers: readonly string[];
  readonly nextAction: string;
  /** Substeps whose evidence this one needs, from the S72 prerequisite evidence. */
  readonly prerequisites: readonly string[];
  /** The role capability that clears it, from the desk guidance's grounded gates. */
  readonly capability: Capability;
}

export interface RenewalActionSourceUpdate {
  readonly id: string;
  readonly label: string;
  readonly state:
    | "recorded"
    | "pending"
    | "prepared"
    | "expired"
    | "running"
    | "succeeded"
    | "verified"
    | "ambiguous"
    | "failed"
    | "unavailable"
    | "mismatch";
  readonly stateLabel: string;
  readonly detail: string;
}

export type RenewalActionManualInput =
  | { readonly readable: false }
  | { readonly readable: true; readonly state: RenewalWorkspaceState | null };

/** The serializable server facts the projection consumes; labels only, no customer values. */
export interface RenewalActionSnapshot {
  readonly leaseId: string;
  readonly role: Role;
  /** The consolidated dashboard mounts the staff-recorded lane (every live lease page). */
  readonly manualLaneMounted: boolean;
  readonly manual: RenewalActionManualInput;
  /** S194: separately evidenced authority, bound to the current staff-record revision. */
  readonly standingOwnerAuthority?: {
    covered: boolean;
    manualRevision: number;
    reason: string;
  };
  /** The shared S82/S127 guidance for this lease, as the desk row carries it. */
  readonly guidance: {
    readonly status: RenewalOverallStatus;
    readonly kind: DeskLeaseAction["kind"];
    readonly label: string | null;
    readonly stepId: RenewalProcessStepId | null;
    readonly verificationCause: DeskVerificationCause | null;
    /** The one process substep the guidance names when no staff-recorded lane exists. */
    readonly substepId: string | null;
    readonly redirectLabel: string | null;
    readonly waitingOn: string | null;
  };
  /** False when saved S72 progress could not be read; the Full view then leads with a refresh. */
  readonly progressStateAvailable: boolean;
  readonly process: {
    readonly status: RenewalProcessStatus;
    readonly migrationReason: string | null;
    readonly currentStepId: RenewalProcessStepId | null;
    readonly verify: readonly RenewalActionSubstep[];
  } | null;
  readonly termReview: "not_needed" | "needed" | "unavailable";
  readonly rentvineUpdates:
    | { readonly available: true; readonly rows: readonly RenewalActionSourceUpdate[] }
    | { readonly available: false };
  /** Supporting Full view regions present on this page. */
  readonly regions: {
    readonly followUp: boolean;
    readonly correction: boolean;
    readonly documentPacket: boolean;
  };
}

export interface RenewalActionControl {
  /** Existing Full view regions holding the usable controls, in page order. */
  readonly targets: readonly string[];
  /** True when the action is the existing source refresh. */
  readonly refresh: boolean;
  /** The existing server routes; their checks decide every submission. */
  readonly routes: readonly string[];
  readonly capability: RenewalCapabilityKey;
  /** A genuine provider handoff stays external; app-owned work stays in the app. */
  readonly handoff: "in_app" | "external";
}

export interface RenewalActionPrerequisite {
  readonly id: string;
  readonly label: string;
  readonly met: boolean;
}

export interface RenewalAction {
  readonly id: string;
  /** Stable lease, cycle and action reference. */
  readonly ref: {
    readonly leaseId: string;
    readonly cycleId: string | null;
    readonly key: string;
  };
  readonly label: string;
  /** The owning rule's current explanation, when it has one. */
  readonly detail: string | null;
  readonly group: RenewalActionGroup;
  readonly requirement: RenewalActionRequirement;
  readonly status: RenewalActionStatus;
  readonly reason: ActionGraphReason;
  readonly prerequisites: readonly RenewalActionPrerequisite[];
  readonly unmetConditions: readonly string[];
  readonly blockedBy: readonly string[];
  readonly resolvableVia: readonly string[];
  readonly unlocks: readonly string[];
  /** The existing completion predicate, in words. */
  readonly evidence: string;
  /** Who completes it. */
  readonly responsible: string;
  readonly waitingOn: string | null;
  readonly control: RenewalActionControl | null;
}

export interface RenewalActionProjection {
  readonly version: typeof RENEWAL_ACTIONS_VERSION;
  readonly leaseId: string;
  readonly cycleId: string | null;
  readonly manualRevision: number | null;
  readonly termsRevision: number | null;
  readonly lane: RenewalActionLane;
  /** Every action in resolved dependency order. */
  readonly actions: readonly RenewalAction[];
  /** The first outstanding action in the lane the S127 guidance reads. */
  readonly headlineActionId: string | null;
  /** The first leading action ready for this actor; null when none is. */
  readonly primaryActionId: string | null;
  readonly outcome: {
    readonly state:
      | "in_progress"
      | "complete_recorded_by_staff"
      | "complete_verified"
      | "unknown";
    readonly label: string;
  };
  readonly diagnostics: readonly ActionGraphDiagnostic[];
}

// Existing business priority: the guidance's verification cause, the S124 redirect, the working
// lane, other verification work, then optional support.
const RANK = { cause: 0, redirect: 1, working: 2, verification: 3, optional: 4 } as const;

const MANUAL_WORKSPACE_ROUTE = "/api/lease-renewal/workspace";

// The Full view's existing wording when saved S72 progress could not be read.
const PROGRESS_REFRESH_LABEL =
  "Saved renewal progress could not be read. Refresh this page before relying on the current phase or taking a progress-dependent action.";

const TERMS_DEPENDENT: ReadonlySet<string> = new Set([
  "tenant_offer",
  "documents",
  "document_delivery",
  "signatures",
  "charges",
  "assisted_housing",
]);

const VERIFY_TARGETS: Readonly<Record<string, readonly string[]>> = {
  "identify-work": ["renewal-card-data-check"],
  "verify-lease-identity": ["renewal-card-data-check"],
  "verify-end-date": ["renewal-correct-a-fact", "renewal-card-data-check"],
  "verify-base-rent": ["renewal-rent-and-charges", "renewal-field-current_rent"],
  "separate-recurring-charges": ["renewal-rent-and-charges"],
  "resolve-source-conflicts": ["renewal-correct-a-fact", "renewal-card-data-check"],
  "confirm-renewal-recipients": ["renewal-card-data-check"],
};

/** Verification work leaves the app only when the fix belongs in the provider record. */
const VERIFY_EXTERNAL: ReadonlySet<string> = new Set([
  "identify-work",
  "verify-lease-identity",
  "confirm-renewal-recipients",
]);

/** The same wording S127 uses for who resolves a gated item. */
export function renewalResponsibleFor(capability: Capability): string {
  if (capability === "approve") return "an Approver or Admin";
  if (capability === "manageAdmin") return "an Admin";
  return "an Editor";
}

type Draft = {
  readonly node: ActionGraphNode;
  /** True for the lane the S127 guidance reads: its cause, redirect and working actions. */
  readonly anchor: boolean;
  readonly key: string;
  readonly label: string;
  readonly detail: string | null;
  readonly group: RenewalActionGroup;
  readonly requirement: RenewalActionRequirement;
  readonly evidence: string;
  readonly responsible: string;
  readonly control: RenewalActionControl | null;
};

const on = (id: string): ActionGraphRequirement => ({ kind: "node", id });
const all = (...of: ActionGraphRequirement[]): ActionGraphRequirement => ({
  kind: "all",
  of,
});

function actorFor(key: RenewalCapabilityKey, role: Role): "actor" | "other_actor" {
  return hasRenewalRoleAuthority(key, role) ? "actor" : "other_actor";
}

function control(
  targets: readonly string[],
  routes: readonly string[],
  capability: RenewalCapabilityKey,
  extra: Partial<Pick<RenewalActionControl, "refresh" | "handoff">> = {},
): RenewalActionControl {
  return {
    targets,
    refresh: extra.refresh ?? false,
    routes,
    capability,
    handoff: extra.handoff ?? "in_app",
  };
}

function manualCompletionText(key: ManualActivity): string {
  const base = MANUAL_ACTIVITIES[key].conditional
    ? "Done, or Not applicable with its source reason and approved policy, recorded by staff for this cycle."
    : "Done, recorded by staff for this cycle.";
  return TERMS_DEPENDENT.has(key)
    ? `${base} It applies to the current approved terms.`
    : base;
}

function verificationDrafts(
  snapshot: RenewalActionSnapshot,
  lane: RenewalActionLane,
): Draft[] {
  const process = snapshot.process;
  if (!process) return [];
  const rentCause =
    snapshot.guidance.status === "needs_verification" &&
    snapshot.guidance.verificationCause === "rent_unverified";
  return process.verify.map((substep, index): Draft => {
    const refresh = substep.id === "confirm-source-currency";
    const capability: RenewalCapabilityKey = refresh
      ? "refresh_source_facts"
      : substep.capability === "approve"
        ? "resolve_reconciliation"
        : "record_discrepancy_disposition";
    // Within the phase the desk's existing precedence puts a blocked item before a ready one.
    const stateRank = substep.state === "blocked" ? 0 : 1;
    const promoted = substep.id === "verify-base-rent" && rentCause;
    return {
      key: substep.id,
      anchor: lane === "process" || promoted,
      label: substep.label,
      detail: substep.blockers[0] ?? substep.nextAction,
      group: refresh ? "recovery" : "verification",
      requirement: "required",
      evidence: substep.completionRule,
      responsible: renewalResponsibleFor(substep.capability),
      control: control(
        refresh
          ? []
          : (VERIFY_TARGETS[substep.id] ?? []).filter(
              (target) =>
                target !== "renewal-correct-a-fact" || snapshot.regions.correction,
            ),
        refresh
          ? ["/api/lease-renewal/refresh"]
          : [
              "/api/lease-renewal/correction-review",
              "/api/lease-renewal/resolve",
              "/api/lease-renewal/rentvine-writeback",
            ],
        capability,
        { refresh, handoff: VERIFY_EXTERNAL.has(substep.id) ? "external" : "in_app" },
      ),
      node: {
        id: refresh ? "source.refresh" : `evidence.${substep.id}`,
        priority: promoted
          ? [RANK.cause]
          : [lane === "process" ? RANK.working : RANK.verification, stateRank, index],
        applicability: "applicable",
        completion: substep.state === "complete" && !promoted ? "complete" : "incomplete",
        requires: all(
          ...substep.prerequisites.map((id) =>
            on(id === "confirm-source-currency" ? "source.refresh" : `evidence.${id}`),
          ),
        ),
        // Without a readable S72 record the process phase cannot be relied on.
        sourceUnavailable:
          lane === "process" && !snapshot.progressStateAvailable && !refresh,
        actor: actorFor(capability, snapshot.role),
      },
    };
  });
}

function refreshDraft(snapshot: RenewalActionSnapshot, label: string): Draft {
  return {
    key: "confirm-source-currency",
    anchor: true,
    label,
    detail: null,
    group: "recovery",
    requirement: "required",
    evidence: "A complete, current source read.",
    responsible: renewalResponsibleFor("edit"),
    control: control([], ["/api/lease-renewal/refresh"], "refresh_source_facts", {
      refresh: true,
    }),
    node: {
      id: "source.refresh",
      priority: [RANK.cause],
      applicability: "applicable",
      completion: "incomplete",
      actor: actorFor("refresh_source_facts", snapshot.role),
    },
  };
}

function manualDrafts(
  snapshot: RenewalActionSnapshot,
  manual: RenewalActionManualInput,
  lane: RenewalActionLane,
): Draft[] {
  const role = snapshot.role;
  const actor = actorFor("save_renewal_progress", role);
  const readable = manual.readable;
  const state = manual.readable ? manual.state : null;
  const unknown = !readable;
  // S156: a recorded completion leads; the other staff items stay available as optional work.
  const recordedComplete = Boolean(state?.completion);
  const drafts: Draft[] = [];
  let position = 0;
  const staff = (
    key: string,
    label: string,
    evidence: string,
    targets: readonly string[],
    node: Omit<ActionGraphNode, "id" | "actor" | "priority"> & {
      priority?: readonly number[];
    },
    extra: Partial<Pick<Draft, "detail" | "requirement" | "anchor">> = {},
  ) =>
    drafts.push({
      key,
      anchor: recordedComplete ? false : (extra.anchor ?? lane === "manual"),
      label,
      detail: extra.detail ?? null,
      group: "staff_work",
      requirement: recordedComplete ? "optional" : (extra.requirement ?? "required"),
      evidence,
      responsible: renewalResponsibleFor("edit"),
      control: control(targets, [MANUAL_WORKSPACE_ROUTE], "save_renewal_progress"),
      node: {
        ...node,
        id: `manual.${key}`,
        priority: node.priority ?? [RANK.working, 3, (position += 1)],
        actor,
        ...(unknown ? { sourceUnavailable: true } : {}),
      },
    });

  if (!readable)
    drafts.push({
      key: "records",
      anchor: true,
      label: "Reload records and history",
      detail: "Current staff records could not be read. Reload before recording work.",
      group: "recovery",
      requirement: "required",
      evidence: "A current read of this lease's staff records.",
      responsible: renewalResponsibleFor("edit"),
      control: control(
        ["renewal-card-manual-records"],
        [MANUAL_WORKSPACE_ROUTE],
        "read_workspace",
      ),
      node: {
        id: "source.staff_records",
        priority: [RANK.working, 1],
        applicability: "applicable",
        completion: "incomplete",
        actor: actorFor("read_workspace", role),
      },
    });

  // S154/S156: no cycle step and no required order. Staff choose the work; the listed order is a
  // suggestion. Only an unreadable record holds the staff actions, until it is read again.
  const records = readable ? {} : { requires: on("source.staff_records") };
  staff(
    "preparation",
    "Market rent comparison",
    "A saved comp preparation for this cycle.",
    ["renewal-section-comps"],
    {
      priority: [RANK.optional, 0],
      applicability: "applicable",
      completion: unknown ? "unknown" : state?.preparation ? "complete" : "incomplete",
      ...records,
    },
    { requirement: "optional", anchor: false },
  );

  const standing =
    snapshot.standingOwnerAuthority?.covered === true &&
    snapshot.standingOwnerAuthority.manualRevision === (state?.revision ?? 0);
  const summary =
    state || standing
      ? manualRenewalSummary(state, { standingOwnerAuthority: standing })
      : null;
  const nonRenewal = manualNonRenewal(state);
  const ownerDeclined = state?.ownerResponse?.outcome === "declined_non_renewal";
  const satisfied = (key: ManualActivity) =>
    state ? manualActivitySatisfied(state, key) : false;
  const tenantOutcome = state ? currentManualTenantOutcome(state) : null;
  const approved = state?.ownerResponse?.outcome === "approved_terms";
  // As in the summary, a current tenant counter reopens the owner response only once the offer is
  // on record; before that the offer is the next step.
  const counterReopen =
    satisfied("tenant_offer") && tenantOutcome === "counter_change_requested";
  const completion = (done: boolean) =>
    unknown
      ? ("unknown" as const)
      : done
        ? ("complete" as const)
        : ("incomplete" as const);
  // Renewal-branch work that was not done before a decline no longer applies.
  const branch = (done: boolean) =>
    done || !nonRenewal ? ("applicable" as const) : ("not_applicable" as const);
  const followUp = snapshot.regions.followUp ? ["renewal-card-follow-up"] : [];

  const outreachDone = satisfied("owner_outreach");
  staff(
    "owner_outreach",
    manualActionLabel("owner_outreach"),
    manualCompletionText("owner_outreach"),
    ["renewal-card-message-owner", "renewal-manual-owner_outreach"],
    {
      applicability: standing && !outreachDone ? "not_applicable" : branch(outreachDone),
      completion: completion(outreachDone),
      ...records,
    },
  );
  const ownerDone = (approved && !counterReopen) || ownerDeclined;
  staff(
    "owner_response",
    manualActionLabel("owner_response"),
    "The owner's explicit approval of exact terms, recorded by staff. A current tenant counter reopens it.",
    ["renewal-manual-owner_response", ...followUp],
    {
      applicability:
        standing && !counterReopen && !ownerDone ? "not_applicable" : branch(ownerDone),
      completion: completion(ownerDone),
      ...records,
      waitingOn:
        summary?.nextActivity === "owner_response" && summary.waitingParty === "owner"
          ? "the owner"
          : null,
    },
    {
      detail:
        standing && !counterReopen
          ? snapshot.standingOwnerAuthority!.reason
          : state?.ownerResponse?.outcome === "revision_requested"
            ? "The owner requested a revision."
            : counterReopen
              ? "The tenant requested a change to the current terms."
              : null,
    },
  );
  const offerDone = satisfied("tenant_offer");
  staff(
    "tenant_offer",
    manualActionLabel("tenant_offer"),
    manualCompletionText("tenant_offer"),
    ["renewal-card-message-tenant", "renewal-manual-tenant_offer"],
    {
      applicability: branch(offerDone),
      completion: completion(offerDone),
      ...records,
    },
  );
  const tenantDecided =
    tenantOutcome === "accepted" || tenantOutcome === "declined_nonrenewing";
  staff(
    "tenant_response",
    manualActionLabel("tenant_response"),
    "The tenant's answer to the current approved terms, recorded by staff.",
    ["renewal-manual-tenant_response", ...followUp],
    {
      applicability: tenantDecided || !ownerDeclined ? "applicable" : "not_applicable",
      completion: completion(tenantDecided),
      ...records,
      waitingOn:
        summary?.nextActivity === "tenant_response" && summary.waitingParty === "tenant"
          ? "the tenant"
          : null,
    },
    {
      detail:
        tenantOutcome === "needs_verification"
          ? "The recorded tenant answer needs verification."
          : null,
    },
  );
  const afterAcceptance = MANUAL_REQUIRED_RENEWAL.slice(2);
  for (const key of afterAcceptance) {
    const done = satisfied(key);
    staff(
      key,
      manualActionLabel(key),
      manualCompletionText(key),
      [
        `renewal-manual-${key}`,
        ...(key === "documents" && snapshot.regions.documentPacket
          ? ["renewal-step-document-packet"]
          : []),
      ],
      {
        applicability: branch(done),
        completion: completion(done),
        ...records,
      },
    );
  }
  staff(
    "non_renewal_handoff",
    manualActionLabel("non_renewal_handoff"),
    manualCompletionText("non_renewal_handoff"),
    ["renewal-manual-non_renewal_handoff"],
    {
      applicability: nonRenewal ? "applicable" : "not_applicable",
      completion: completion(satisfied("non_renewal_handoff")),
      ...records,
    },
  );
  staff(
    "complete",
    manualActionLabel("complete"),
    "A staff completion record. Staff decide when the renewal work is complete.",
    ["renewal-manual-complete"],
    {
      applicability: "applicable",
      completion: completion(summary?.complete === true),
      ...records,
    },
  );
  // An owner decline and a current tenant acceptance satisfy two exclusive branches at once.
  if (state && ownerDeclined && tenantOutcome === "accepted")
    drafts.push({
      key: "branch_conflict",
      anchor: false,
      label: "Recorded owner and tenant responses conflict",
      detail:
        "The owner decline and the tenant acceptance are both recorded for this cycle.",
      group: "staff_work",
      requirement: "advisory",
      evidence: "One consistent owner and tenant outcome for this cycle.",
      responsible: renewalResponsibleFor("edit"),
      control: control(
        ["renewal-manual-owner_response", "renewal-manual-tenant_response"],
        [MANUAL_WORKSPACE_ROUTE],
        "save_renewal_progress",
      ),
      node: {
        id: "manual.branch_conflict",
        priority: [RANK.verification, 0],
        applicability: "applicable",
        completion: "incomplete",
        requires: {
          kind: "condition",
          id: "consistent_branch",
          label: "One consistent owner and tenant outcome",
          holds: "contradiction",
        },
        actor,
      },
    });
  return drafts;
}

function sourceUpdateDrafts(snapshot: RenewalActionSnapshot): Draft[] {
  const role = snapshot.role;
  const shared = {
    anchor: false,
    group: "source_update" as const,
    requirement: "optional" as const,
    evidence: "A confirmed update with its receipt and readback.",
  };
  if (!snapshot.rentvineUpdates.available)
    return [
      {
        ...shared,
        key: "rentvine",
        label: "RentVine updates",
        detail: "RentVine update status could not be read.",
        responsible: renewalResponsibleFor("edit"),
        control: control(
          ["renewal-rent-and-charges"],
          ["/api/lease-renewal/rentvine-writeback"],
          "execute_source_write",
        ),
        node: {
          id: "support.rentvine",
          priority: [RANK.optional, 1, 0],
          applicability: "applicable",
          completion: "incomplete",
          sourceUnavailable: true,
          actor: actorFor("execute_source_write", role),
        },
      },
    ];
  return snapshot.rentvineUpdates.rows.map((row, index): Draft => {
    // S160: a prepared update waits for staff's exact confirmation; any other open state is
    // prepared again. A running or ambiguous effect is never retried from here.
    const execute = row.state === "prepared";
    const capability: RenewalCapabilityKey = execute
      ? "execute_source_write"
      : "propose_source_write";
    return {
      ...shared,
      key: row.id,
      label: row.label,
      detail: `${row.stateLabel}. ${row.detail}`,
      responsible: renewalResponsibleFor("edit"),
      control: control(
        ["renewal-rent-and-charges"],
        ["/api/lease-renewal/rentvine-writeback"],
        capability,
      ),
      node: {
        id: `support.${row.id}`,
        priority: [RANK.optional, 1, index],
        applicability: "applicable",
        completion:
          row.state === "verified" ||
          row.state === "succeeded" ||
          row.state === "recorded"
            ? "complete"
            : row.state === "ambiguous" ||
                row.state === "mismatch" ||
                row.state === "unavailable"
              ? "unknown"
              : "incomplete",
        waitingOn: row.state === "running" ? "the provider's outcome" : null,
        actor: actorFor(capability, role),
      },
    };
  });
}

/**
 * Without a staff-recorded cycle the guidance reads the S72 evidence graph. A named verification
 * substep is already an action; a later substep has no control on the consolidated dashboard, so
 * it appears once, exactly as the guidance names it, and is reported as unresolved.
 */
function processGuidanceDrafts(
  snapshot: RenewalActionSnapshot,
  cause: DeskVerificationCause | null,
): Draft[] {
  const guidance = snapshot.guidance;
  if (cause || guidance.kind === "complete" || guidance.redirectLabel) return [];
  const verifyIds = new Set(snapshot.process?.verify.map((substep) => substep.id) ?? []);
  if (guidance.substepId && verifyIds.has(guidance.substepId)) return [];
  const verifyStep = guidance.stepId === "verify-renewal";
  return [
    {
      key: guidance.substepId ?? guidance.stepId ?? "guidance",
      anchor: true,
      label: guidance.label ?? "Resolve the blocking prerequisites before continuing.",
      detail: null,
      group: "process",
      requirement: "required",
      evidence: "Process evidence recorded by the earlier stepwise controls.",
      responsible: renewalResponsibleFor("edit"),
      control: verifyStep
        ? control(
            ["renewal-step-verify-renewal"],
            ["/api/lease-renewal/correction-review"],
            "record_discrepancy_disposition",
          )
        : null,
      node: {
        id: "process.guidance",
        priority: [RANK.working, 0],
        applicability: "applicable",
        completion: "incomplete",
        waitingOn:
          guidance.kind === "waiting"
            ? (guidance.waitingOn ?? "an external response")
            : null,
        sourceUnavailable: !snapshot.progressStateAvailable,
        actor: verifyStep
          ? actorFor("record_discrepancy_disposition", snapshot.role)
          : "none",
      },
    },
  ];
}

function laneFor(
  snapshot: RenewalActionSnapshot,
  manual: RenewalActionManualInput,
): RenewalActionLane {
  // S154/S156: the staff lane leads on every lease, including one with nothing recorded yet.
  return snapshot.manualLaneMounted && manual.readable ? "manual" : "process";
}

function referencedNodes(requirement: ActionGraphRequirement | undefined): string[] {
  if (!requirement) return [];
  if (requirement.kind === "node") return [requirement.id];
  if (requirement.kind === "condition") return [];
  return requirement.of.flatMap(referencedNodes);
}

/** Build the projection for this lease, cycle and actor. Pure; never persists anything. */
export function projectRenewalActions(
  snapshot: RenewalActionSnapshot,
  manual: RenewalActionManualInput = snapshot.manual,
): RenewalActionProjection {
  const lane = laneFor(snapshot, manual);
  const state = manual.readable ? manual.state : null;
  const guidance = snapshot.guidance;
  const cause =
    guidance.status === "needs_verification" ? guidance.verificationCause : null;
  const refreshCause =
    cause === "progress_unreadable" ||
    cause === "read_incomplete" ||
    cause === "data_expired";
  // The Full view leads with a refresh when saved S72 progress is unreadable and no staff lane exists.
  const progressRefresh = lane === "process" && !snapshot.progressStateAvailable;
  const refreshLabel = refreshCause
    ? (guidance.label ?? PROGRESS_REFRESH_LABEL)
    : progressRefresh
      ? PROGRESS_REFRESH_LABEL
      : null;

  const drafts: Draft[] = [];
  {
    drafts.push(...verificationDrafts(snapshot, lane));
    if (cause === "disposition_review")
      drafts.push({
        key: "disposition_review",
        anchor: true,
        label:
          guidance.label ??
          "Resolve the flagged lease fact from an authoritative source.",
        detail: null,
        group: "verification",
        requirement: "required",
        evidence: "An authoritative source resolves the flagged lease fact.",
        responsible: renewalResponsibleFor("edit"),
        control: control(
          ["renewal-step-verify-renewal"],
          ["/api/lease-renewal/correction-review", "/api/lease-renewal/resolve"],
          "record_discrepancy_disposition",
        ),
        node: {
          id: "source.disposition_review",
          priority: [RANK.cause],
          applicability: "applicable",
          completion: "incomplete",
          actor: actorFor("record_discrepancy_disposition", snapshot.role),
        },
      });
    if (cause === "process_needs_verification")
      drafts.push({
        key: "process_verification",
        anchor: true,
        label: guidance.label ?? "Current process state needs verification.",
        detail: snapshot.process?.migrationReason ?? null,
        group: "process",
        requirement: "required",
        evidence: "Process evidence recorded by the earlier stepwise controls.",
        responsible: renewalResponsibleFor("edit"),
        control: null,
        node: {
          id: "source.process_verification",
          priority: [RANK.cause],
          applicability: "applicable",
          completion: "incomplete",
          actor: "none",
        },
      });
    if (guidance.redirectLabel)
      drafts.push({
        key: "move_out_redirect",
        anchor: true,
        label: guidance.redirectLabel,
        detail: null,
        group: "issue",
        requirement: "advisory",
        evidence: "The non-renewal branch recorded for this cycle.",
        responsible: renewalResponsibleFor("edit"),
        control: control(
          [NON_RENEWAL_HANDOFF_TARGET_ID],
          [MANUAL_WORKSPACE_ROUTE],
          "save_renewal_progress",
        ),
        node: {
          id: "issue.move_out_redirect",
          priority: [RANK.redirect],
          applicability: "applicable",
          completion: "incomplete",
          actor: actorFor("save_renewal_progress", snapshot.role),
        },
      });
    if (lane === "process" && !snapshot.manualLaneMounted)
      drafts.push(...processGuidanceDrafts(snapshot, cause));
    if (snapshot.manualLaneMounted) drafts.push(...manualDrafts(snapshot, manual, lane));
    drafts.push(...sourceUpdateDrafts(snapshot));
  }
  // The source refresh is one action: the S72 currency substep when present, led by the guidance
  // cause (or the unreadable progress) that names it.
  const refreshIndex = drafts.findIndex((draft) => draft.node.id === "source.refresh");
  if (refreshLabel !== null && refreshIndex >= 0) {
    // Rereading the sources is always available; it needs no other work first.
    const current = drafts[refreshIndex]!;
    drafts[refreshIndex] = {
      ...current,
      anchor: true,
      label: refreshLabel,
      node: {
        id: current.node.id,
        priority: [RANK.cause],
        applicability: "applicable",
        completion: "incomplete",
        actor: current.node.actor,
      },
    };
  } else if (refreshLabel !== null) drafts.push(refreshDraft(snapshot, refreshLabel));

  if (snapshot.termReview !== "not_needed")
    drafts.push({
      key: "term_review",
      anchor: false,
      label: "Lease term",
      detail:
        snapshot.termReview === "unavailable"
          ? "The recorded lease term review could not be read."
          : "Record the lease term against the current lease facts.",
      group: "verification",
      requirement: "advisory",
      evidence: "A term review recorded for the current lease facts.",
      responsible: renewalResponsibleFor("edit"),
      control: control(
        ["renewal-card-lease-term"],
        ["/api/lease-renewal/term-review"],
        "record_term_review",
      ),
      node: {
        id: "source.term_review",
        priority: [RANK.verification, 1],
        applicability: "applicable",
        completion: "incomplete",
        sourceUnavailable: snapshot.termReview === "unavailable",
        actor: actorFor("record_term_review", snapshot.role),
      },
    });

  const resolution = resolveActionGraph(drafts.map((draft) => draft.node));
  const byId = new Map(drafts.map((draft) => [draft.node.id, draft]));
  const cycleId = state?.cycleId ?? null;
  const settled = (id: string) =>
    ["complete", "not_applicable"].includes(resolution.results[id]?.status ?? "");
  const actions: RenewalAction[] = resolution.order.map((id) => {
    const draft = byId.get(id)!;
    const result = resolution.results[id]!;
    return {
      id,
      ref: { leaseId: snapshot.leaseId, cycleId, key: draft.key },
      label: draft.label,
      detail: draft.detail,
      group: draft.group,
      requirement: draft.requirement,
      status: result.status,
      reason: result.reason,
      prerequisites: [...new Set(referencedNodes(draft.node.requires))].map(
        (prerequisite) => ({
          id: prerequisite,
          label: byId.get(prerequisite)?.label ?? prerequisite,
          met: settled(prerequisite),
        }),
      ),
      unmetConditions: result.unmetConditions,
      blockedBy: result.blockedBy,
      resolvableVia: result.resolvableVia,
      unlocks: result.unlocks,
      evidence: draft.evidence,
      responsible: draft.responsible,
      waitingOn: result.status === "waiting" ? (draft.node.waitingOn ?? null) : null,
      control: draft.control,
    };
  });

  const leading = (action: RenewalAction) =>
    (byId.get(action.id)!.node.priority[0] ?? RANK.optional) <= RANK.working &&
    action.requirement !== "optional";
  const headline = actions.find(
    (action) =>
      byId.get(action.id)!.anchor &&
      action.status !== "complete" &&
      action.status !== "not_applicable",
  );
  const primary = actions.find(
    (action) => leading(action) && action.status === "ready_for_actor",
  );
  const standing =
    snapshot.standingOwnerAuthority?.covered === true &&
    snapshot.standingOwnerAuthority.manualRevision === (state?.revision ?? 0);
  const summary =
    state || standing
      ? manualRenewalSummary(state, { standingOwnerAuthority: standing })
      : null;
  const outcome: RenewalActionProjection["outcome"] =
    lane === "manual" && summary
      ? summary.complete
        ? { state: "complete_recorded_by_staff", label: summary.label }
        : { state: "in_progress", label: summary.label }
      : snapshot.manualLaneMounted && !manual.readable
        ? { state: "unknown", label: "Current staff records could not be read" }
        : snapshot.process?.status === "complete"
          ? { state: "complete_verified", label: "Verified complete" }
          : { state: "in_progress", label: manualRenewalSummary(null).label };
  return {
    version: RENEWAL_ACTIONS_VERSION,
    leaseId: snapshot.leaseId,
    cycleId,
    manualRevision: state?.revision ?? null,
    termsRevision: state?.termsRevision ?? null,
    lane,
    actions,
    headlineActionId: headline?.id ?? null,
    primaryActionId: primary?.id ?? null,
    outcome,
    diagnostics: resolution.diagnostics,
  };
}

/** The action the S127 guidance names for this lease, as an S142 action id; null when complete. */
export function renewalGuidanceActionId(
  snapshot: RenewalActionSnapshot,
  manual: RenewalActionManualInput = snapshot.manual,
): string | null {
  const guidance = snapshot.guidance;
  const lane = laneFor(snapshot, manual);
  const state = manual.readable ? manual.state : null;
  if (lane === "process" && !snapshot.progressStateAvailable) return "source.refresh";
  if (guidance.status === "needs_verification") {
    const cause = guidance.verificationCause;
    if (cause === "disposition_review") return "source.disposition_review";
    if (cause === "process_needs_verification") return "source.process_verification";
    if (cause === "rent_unverified") return "evidence.verify-base-rent";
    return "source.refresh";
  }
  if (guidance.redirectLabel) return "issue.move_out_redirect";
  if (guidance.kind === "complete") return null;
  if (lane === "manual")
    return `manual.${manualRenewalSummary(state, { standingOwnerAuthority: snapshot.standingOwnerAuthority?.covered === true && snapshot.standingOwnerAuthority.manualRevision === (state?.revision ?? 0) }).nextActivity}`;
  // Staff records that could not be read: the reload leads until they can.
  if (snapshot.manualLaneMounted && !manual.readable) return "source.staff_records";
  const verifyIds = new Set(snapshot.process?.verify.map((substep) => substep.id) ?? []);
  if (guidance.substepId && verifyIds.has(guidance.substepId))
    return guidance.substepId === "confirm-source-currency"
      ? "source.refresh"
      : `evidence.${guidance.substepId}`;
  return "process.guidance";
}

/**
 * Keep the actor's current selection while it is still outstanding; otherwise the primary action,
 * the headline, then (before completion) any other action ready for this actor. Selection is
 * presentation only.
 */
export function selectRenewalAction(
  projection: RenewalActionProjection,
  selectedActionId: string | null,
): string | null {
  const selected = selectedActionId
    ? projection.actions.find((action) => action.id === selectedActionId)
    : undefined;
  if (selected && selected.status !== "complete" && selected.status !== "not_applicable")
    return selected.id;
  const leading = projection.primaryActionId ?? projection.headlineActionId;
  if (leading) return leading;
  // A completed renewal leads with its outcome; optional work stays one choice away.
  if (
    projection.outcome.state === "complete_recorded_by_staff" ||
    projection.outcome.state === "complete_verified"
  )
    return null;
  return (
    projection.actions.find((action) => action.status === "ready_for_actor")?.id ?? null
  );
}
