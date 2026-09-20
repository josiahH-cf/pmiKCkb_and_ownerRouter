import { can, type Capability, type Role } from "@/lib/auth/roles";
import type {
  DeskGuidanceDestination,
  DeskLeaseGuidance,
  DeskLeaseSummaryBase,
} from "@/lib/lease-renewal/desk-model";

/**
 * S127 (F07): one action-specific issue model projected from the existing guidance, the shared
 * summary and the page-level read states. Every issue names its kind (a blocking prerequisite
 * for a named action, a waiting-on-person state, an advisory, unavailable source evidence, or an
 * intentional policy pause), the affected action, the business reason and who or what resolves
 * it, and points at an existing control. The primary next action is the guidance action the desk
 * already carries, so the desk and the workspace can never disagree; the only rewrite is the
 * S124 redirect of ordinary renewal outreach to the non-renewal handoff for a confirmed move-out.
 * Pure: no store, no send, no status column, no new prioritization.
 */
export const RENEWAL_ISSUE_KINDS = [
  "blocking",
  "waiting",
  "advisory",
  "source_unavailable",
  "policy_pause",
] as const;
export type RenewalIssueKind = (typeof RENEWAL_ISSUE_KINDS)[number];

export const RENEWAL_ISSUE_KIND_LABELS: Record<RenewalIssueKind, string> = {
  blocking: "Blocked",
  waiting: "Waiting on a person",
  advisory: "Advisory",
  source_unavailable: "Source unavailable",
  policy_pause: "Paused by policy",
};

export type RenewalIssueDestination =
  | DeskGuidanceDestination
  | { readonly kind: "workspace_anchor"; readonly targetId: string };

export interface RenewalIssue {
  readonly id: string;
  readonly kind: RenewalIssueKind;
  readonly kindLabel: string;
  /** The action this issue affects, in plain words; never a global lease block for an optional input. */
  readonly affectedAction: string;
  readonly reason: string;
  /** Who or what resolves it: a role, a person, a source or a policy owner. */
  readonly responsible: string;
  readonly destination: RenewalIssueDestination;
  readonly requiredCapability?: Capability;
}

export interface RenewalPrimaryAction {
  readonly kind: DeskLeaseGuidance["action"]["kind"];
  readonly label: string;
  readonly destination: RenewalIssueDestination;
  /** True when a confirmed move-out redirected ordinary outreach to the non-renewal handoff. */
  readonly redirected: boolean;
  readonly requiredCapability?: Capability;
}

export interface RenewalIssueInput {
  readonly guidance: DeskLeaseGuidance;
  readonly summary: Pick<
    DeskLeaseSummaryBase,
    "moveOut" | "moveOutTiming" | "cycleSourceDate" | "followUp" | "manualProgress"
  >;
  readonly readComplete: boolean;
  readonly currencyState: "fresh" | "stale" | "expired" | string;
  readonly progressStateAvailable: boolean;
  /** S128: operating-Sheet writes paused by owner policy; a pause is never a failure. */
  readonly sheetWritebackPaused: boolean;
}

export interface RenewalIssueProjection {
  readonly primary: RenewalPrimaryAction;
  readonly issues: readonly RenewalIssue[];
}

export const NON_RENEWAL_HANDOFF_TARGET_ID = "renewal-manual-cycle";

const STEP_ACTION: Record<string, string> = {
  "verify-renewal": "Verifying the renewal facts",
  "owner-decision": "Recording the owner decision",
  "tenant-decision": "Preparing the tenant offer",
  "document-packet": "Preparing the document packet",
  "signatures-follow-up": "Signatures and follow-up",
  "compliance-close": "Closing the renewal",
};

const OUTREACH_STEPS = new Set(["owner-decision", "tenant-decision"]);

const WAITING_PARTY: Record<string, string> = {
  owner: "the owner",
  tenant: "the tenant",
  team: "the PMI KC team",
  document_coordinator: "the document coordinator",
};

function responsibleFor(capability: Capability | undefined): string {
  if (capability === "approve") return "an Approver or Admin";
  if (capability === "manageAdmin") return "an Admin";
  return "an Editor";
}

function affectedActionFor(destination: DeskGuidanceDestination): string {
  return destination.kind === "workspace_phase"
    ? (STEP_ACTION[destination.stepId] ?? "The current phase")
    : "The current phase";
}

export function projectRenewalIssues(input: RenewalIssueInput): RenewalIssueProjection {
  const { guidance, summary } = input;
  const issues: RenewalIssue[] = [];

  // Blocking prerequisites: the guidance blockers, each tied to its phase and its role.
  for (const blocker of guidance.blockers) {
    issues.push({
      id: `blocking:${blocker.id}`,
      kind: "blocking",
      kindLabel: RENEWAL_ISSUE_KIND_LABELS.blocking,
      affectedAction: affectedActionFor(blocker.destination),
      reason: blocker.label,
      responsible: responsibleFor(blocker.requiredCapability),
      destination: blocker.destination,
      ...(blocker.requiredCapability
        ? { requiredCapability: blocker.requiredCapability }
        : {}),
    });
  }

  // Waiting on a person is not something staff can clear; it names the party.
  if (guidance.overallStatus === "waiting") {
    const party = summary.followUp?.waiting.party ?? null;
    const partyLabel = party ? (WAITING_PARTY[party] ?? party) : "an external party";
    issues.push({
      id: "waiting:external",
      kind: "waiting",
      kindLabel: RENEWAL_ISSUE_KIND_LABELS.waiting,
      affectedAction:
        "destination" in guidance.action
          ? affectedActionFor(guidance.action.destination)
          : "The current phase",
      reason: `Waiting on ${partyLabel}; no staff step is due until they respond.`,
      responsible: partyLabel,
      destination:
        "destination" in guidance.action ? guidance.action.destination : { kind: "none" },
    });
  }

  // Unavailable source evidence: the read, not the lease, is the problem.
  if (!input.readComplete)
    issues.push({
      id: "source:read_incomplete",
      kind: "source_unavailable",
      kindLabel: RENEWAL_ISSUE_KIND_LABELS.source_unavailable,
      affectedAction: "Every action that depends on the lease data",
      reason:
        "The portfolio read did not complete, so this lease's facts may be incomplete.",
      responsible: "RentVine read (refresh)",
      destination: { kind: "none" },
    });
  if (input.currencyState === "expired")
    issues.push({
      id: "source:expired",
      kind: "source_unavailable",
      kindLabel: RENEWAL_ISSUE_KIND_LABELS.source_unavailable,
      affectedAction: "Composing and recording",
      reason: "Lease data is past the freshness limit; refresh before acting.",
      responsible: "RentVine read (refresh)",
      destination: { kind: "none" },
    });
  if (!input.progressStateAvailable)
    issues.push({
      id: "source:progress_unreadable",
      kind: "source_unavailable",
      kindLabel: RENEWAL_ISSUE_KIND_LABELS.source_unavailable,
      affectedAction: "Every progress-dependent action",
      reason:
        "Saved renewal progress could not be read; refresh before relying on the phase.",
      responsible: "App records (refresh)",
      destination: { kind: "none" },
    });
  if (guidance.rentVerification.state === "unavailable" && input.readComplete)
    issues.push({
      id: "source:rent_unavailable",
      kind: "source_unavailable",
      kindLabel: RENEWAL_ISSUE_KIND_LABELS.source_unavailable,
      affectedAction: "Verifying the current rent",
      reason: "The current rent could not be verified from the sources read.",
      responsible: "RentVine and the operating Sheet",
      destination: guidance.rentVerification.destination,
    });
  const moveOut = summary.moveOut;
  if (moveOut?.state === "unknown" && moveOut.reason !== "lease_not_active") {
    const optionalSource =
      moveOut.reason === "status_table_unavailable" ||
      moveOut.reason === "detail_unavailable" ||
      moveOut.reason === "stale_source";
    issues.push({
      id: `move_out:${moveOut.reason}`,
      kind: optionalSource ? "source_unavailable" : "advisory",
      kindLabel: optionalSource
        ? RENEWAL_ISSUE_KIND_LABELS.source_unavailable
        : RENEWAL_ISSUE_KIND_LABELS.advisory,
      affectedAction: "Ordinary renewal outreach",
      reason: moveOut.label,
      responsible: optionalSource
        ? "RentVine status read (refresh)"
        : "Staff review of the RentVine record",
      destination: { kind: "none" },
    });
  }

  // Advisories: real facts to review that block nothing by themselves.
  const cycle = summary.cycleSourceDate;
  if (cycle?.state === "changed")
    issues.push({
      id: "advisory:cycle_source_date",
      kind: "advisory",
      kindLabel: RENEWAL_ISSUE_KIND_LABELS.advisory,
      affectedAction: "Offers, prepared documents and messages from the recorded terms",
      reason: cycle.label,
      responsible: "Staff review",
      destination: { kind: "workspace_anchor", targetId: NON_RENEWAL_HANDOFF_TARGET_ID },
    });
  const timing = summary.moveOutTiming;
  if (timing && (timing.state === "below" || timing.state === "cannot_determine"))
    issues.push({
      id: `advisory:notice_timing:${timing.state}`,
      kind: "advisory",
      kindLabel: RENEWAL_ISSUE_KIND_LABELS.advisory,
      affectedAction: "The non-renewal review",
      reason: `Notice timing: ${timing.label}.`,
      responsible:
        timing.reason === "basis_not_reviewed" || timing.reason === "basis_unreadable"
          ? "an Admin (record the reviewed timing basis)"
          : "Staff review",
      destination: { kind: "none" },
    });

  // An intentional policy pause is stated as policy, never as a failed write or a broken connection.
  if (input.sheetWritebackPaused)
    issues.push({
      id: "policy:sheet_writeback_paused",
      kind: "policy_pause",
      kindLabel: RENEWAL_ISSUE_KIND_LABELS.policy_pause,
      affectedAction: "Writing to the operating Sheet",
      reason:
        "Operating-Sheet writes are paused by owner policy. Proposals and app records still work as usual.",
      responsible: "Owner policy",
      destination: { kind: "none" },
    });

  // The primary action stays the shared guidance action; a confirmed move-out redirects outreach.
  const action = guidance.action;
  const base: RenewalPrimaryAction =
    "label" in action
      ? {
          kind: action.kind,
          label: action.label,
          destination: action.destination,
          redirected: false,
          ...("requiredCapability" in action && action.requiredCapability
            ? { requiredCapability: action.requiredCapability }
            : {}),
        }
      : {
          kind: action.kind,
          label: "Resolve the blocking prerequisites below before continuing.",
          destination: { kind: "none" },
          redirected: false,
        };
  const redirect =
    moveOut?.state === "initiated" &&
    base.kind === "act" &&
    base.destination.kind === "workspace_phase" &&
    OUTREACH_STEPS.has(base.destination.stepId);
  const primary: RenewalPrimaryAction = redirect
    ? {
        kind: "act",
        label:
          "RentVine shows a move-out notice for this lease. Use the non-renewal handoff instead of ordinary renewal outreach.",
        destination: {
          kind: "workspace_anchor",
          targetId: NON_RENEWAL_HANDOFF_TARGET_ID,
        },
        redirected: true,
      }
    : base;
  return { primary, issues };
}

export type RenewalIssueResolution =
  | "inspect"
  | "prepare"
  | "review"
  | "execute"
  | "request_access"
  | "wait"
  | "refresh";

/** What this role can do about an issue; never a grant, always the existing handoff. */
export function issueResolutionFor(
  issue: RenewalIssue,
  role: Role,
): RenewalIssueResolution {
  if (issue.kind === "waiting") return "wait";
  if (issue.kind === "source_unavailable") return "refresh";
  if (issue.kind === "policy_pause" || issue.kind === "advisory")
    return !can(role, "edit") ? "inspect" : "review";
  if (issue.requiredCapability) {
    if (!can(role, issue.requiredCapability)) return "request_access";
    return issue.requiredCapability === "approve" ? "review" : "execute";
  }
  return !can(role, "edit") ? "inspect" : "prepare";
}
