// S82 desk guidance — one pure, serializable projection of current base rent, rent verification,
// deterministic overall status, blockers, and the single safe next action for every table row.
//
// This is display state only. It never persists a second workflow, substitutes a Sheet/offer value
// for the displayed RentVine amount, coerces a missing rent to zero, or turns missing evidence into
// `Ready`. Status precedence is exact: needs_verification, blocked, complete, waiting, ready, then
// needs_review; `isBlocked` is true only for Blocked and for a fail-closed Needs-verification state
// that prevents progress — never for a merely non-actionable or out-of-window row.

import type { Capability } from "@/lib/auth/roles";
import type {
  DeskBlockerType,
  DeskDataCurrency,
  DeskGuidanceDestination,
  DeskLeaseAction,
  DeskLeaseBlocker,
  DeskLeaseGuidance,
  DeskLeaseSummaryBase,
  DeskRentVerification,
  DeskReconItem,
} from "@/lib/lease-renewal/desk-model";
import {
  OVERALL_STATUS_URGENCY_RANK,
  type RenewalOverallStatus,
} from "@/lib/lease-renewal/desk-query-v2";
import type {
  RenewalProcessProjection,
  RenewalSubstepProjection,
} from "@/lib/lease-renewal/renewal-process";
import type { LiveOwnerCurrentRentDecision } from "@/lib/lease-renewal/live-desk";

export type {
  DeskBlockerType,
  DeskGuidanceDestination,
  DeskLeaseAction,
  DeskLeaseBlocker,
  DeskLeaseGuidance,
  DeskRentVerification,
} from "@/lib/lease-renewal/desk-model";

/** Grounded control gates only; every other blocker link is plain phase navigation. */
const EVIDENCE_CAPABILITY: Partial<Record<string, Capability>> = {
  "source-conflicts-resolved": "approve",
  "owner-decision": "edit",
};

export interface DeskGuidanceInput {
  readonly summary: Pick<
    DeskLeaseSummaryBase,
    "id" | "disposition" | "reason" | "reasonLabel" | "retention" | "followUp"
  >;
  readonly process: RenewalProcessProjection | null;
  readonly dataCheck: readonly DeskReconItem[] | null;
  /** Raw canonical RentVine current rent from the export mapper; never a substituted value. */
  readonly rentvineCurrentRent: number | null;
  /** The shared workspace/draft rent decision, when the lease was reconciled. */
  readonly rentDecision: LiveOwnerCurrentRentDecision | null;
  readonly currencyState: DeskDataCurrency["state"];
  readonly readComplete: boolean;
}

const WAITING_PARTY_LABEL: Record<string, string> = {
  owner: "the owner",
  tenant: "the tenant",
  team: "the PMI KC team",
  document_coordinator: "the document coordinator",
};

function rentVerification(input: DeskGuidanceInput): DeskRentVerification {
  const destination: DeskGuidanceDestination = {
    kind: "workspace_phase",
    stepId: "verify-renewal",
  };
  if (!input.readComplete || input.currencyState === "expired") {
    return { state: "unavailable", verifiedByResolutionDiffers: false, destination };
  }
  const decision = input.rentDecision;
  if (!decision) {
    return {
      state: "needs_verification",
      verifiedByResolutionDiffers: false,
      destination,
    };
  }
  const agreement = decision.currentRentEvidence.agreement;
  const fresh = decision.currentRentEvidence.currencyState === "fresh";
  if (fresh && (agreement === "agree" || agreement === "resolved")) {
    const differs =
      agreement === "resolved" &&
      input.rentvineCurrentRent !== null &&
      decision.currentRent !== input.rentvineCurrentRent;
    return {
      state: "verified",
      verifiedByResolutionDiffers:
        differs || (agreement === "resolved" && input.rentvineCurrentRent === null),
      destination,
    };
  }
  return { state: "needs_verification", verifiedByResolutionDiffers: false, destination };
}

function blockedSubsteps(
  process: RenewalProcessProjection,
): readonly RenewalSubstepProjection[] {
  const step = process.steps[process.currentStepIndex];
  if (!step) return [];
  return step.substeps.filter(
    (substep) =>
      substep.applicable && substep.requiredForStep && substep.state === "blocked",
  );
}

function blockersFrom(process: RenewalProcessProjection): DeskLeaseBlocker[] {
  const step = process.steps[process.currentStepIndex];
  if (!step) return [];
  const entries: DeskLeaseBlocker[] = [];
  const seenLabels = new Set<string>();
  for (const substep of blockedSubsteps(process)) {
    const capability = substep.missingEvidence
      .map((key) => EVIDENCE_CAPABILITY[key])
      .find((value): value is Capability => Boolean(value));
    const type: DeskBlockerType =
      substep.missingEvidence.length > 0 ? "evidence" : "dependency";
    substep.blockers.forEach((label, index) => {
      if (seenLabels.has(label)) return;
      seenLabels.add(label);
      entries.push({
        id: `${substep.id}:${index}`,
        label,
        type,
        phaseId: step.id,
        destination: { kind: "workspace_phase", stepId: step.id },
        ...(capability ? { requiredCapability: capability } : {}),
      });
    });
  }
  return entries;
}

function overallStatus(input: DeskGuidanceInput): RenewalOverallStatus {
  const process = input.process;
  if (
    !input.readComplete ||
    input.currencyState === "expired" ||
    input.summary.disposition === "review" ||
    process?.status === "needs_verification" ||
    process?.migrationRequired === true
  ) {
    return "needs_verification";
  }
  if (!process) return "needs_review";
  const currentStep = process.steps[process.currentStepIndex];
  // An awaited tenant response marks its outcome substep blocked, but that marker is dependence on
  // the tenant — rule 4's Waiting — not an operator-clearable causal blocker under rule 2.
  if (currentStep?.state === "blocked" && process.status !== "waiting") return "blocked";
  if (process.status === "complete") return "complete";
  if (process.status === "waiting") return "waiting";
  if (
    currentStep?.state === "ready" ||
    process.status === "counter_reopened" ||
    process.status === "non_renewal_handoff_required"
  ) {
    return "ready";
  }
  if (currentStep?.state === "not_started" && input.summary.followUp) {
    const party = input.summary.followUp.waiting.party;
    if (party && party in WAITING_PARTY_LABEL) return "waiting";
  }
  return "needs_review";
}

function readyAction(process: RenewalProcessProjection): DeskLeaseAction {
  const step = process.steps[process.currentStepIndex];
  const substep = step?.substeps.find(
    (candidate) =>
      candidate.applicable && candidate.requiredForStep && candidate.state === "ready",
  );
  if (!step || !substep) {
    return {
      kind: "act",
      label: "Open the current phase.",
      destination: process.steps[process.currentStepIndex]
        ? {
            kind: "workspace_phase",
            stepId: process.steps[process.currentStepIndex].id,
          }
        : { kind: "none" },
    };
  }
  const capability = substep.missingEvidence
    .map((key) => EVIDENCE_CAPABILITY[key])
    .find((value): value is Capability => Boolean(value));
  return {
    kind: "act",
    label: substep.nextAction,
    destination: { kind: "workspace_phase", stepId: step.id },
    ...(capability ? { requiredCapability: capability } : {}),
  };
}

function action(input: DeskGuidanceInput, status: RenewalOverallStatus): DeskLeaseAction {
  const process = input.process;
  switch (status) {
    case "blocked":
      return { kind: "blocked" };
    case "complete":
      return {
        kind: "complete",
        label: "Review completion evidence.",
        destination: { kind: "workspace_phase", stepId: "compliance-close" },
      };
    case "waiting": {
      const party = input.summary.followUp?.waiting.party;
      const partyLabel = party ? WAITING_PARTY_LABEL[party] : undefined;
      const stepId = process?.steps[process.currentStepIndex]?.id;
      return {
        kind: "waiting",
        label: partyLabel
          ? `Waiting on ${partyLabel}. Review the current phase.`
          : "Waiting on an external response. Review the current phase.",
        destination: stepId ? { kind: "workspace_phase", stepId } : { kind: "none" },
      };
    }
    case "ready":
      if (process) return readyAction(process);
      return {
        kind: "review",
        label: input.summary.reasonLabel,
        destination: { kind: "none" },
      };
    case "needs_verification": {
      if (!input.readComplete) {
        return {
          kind: "needs_verification",
          label: "The portfolio read did not complete. Refresh before acting.",
          destination: { kind: "none" },
        };
      }
      if (input.currencyState === "expired") {
        return {
          kind: "needs_verification",
          label: "Lease data is too old to act on. Refresh before acting.",
          destination: { kind: "none" },
        };
      }
      if (input.summary.disposition === "review") {
        return {
          kind: "needs_verification",
          label: `${input.summary.reasonLabel}. Resolve it from an authoritative source.`,
          destination: { kind: "none" },
        };
      }
      return {
        kind: "needs_verification",
        label: "Current process state needs verification.",
        destination: process?.steps[process.currentStepIndex]
          ? {
              kind: "workspace_phase",
              stepId: process.steps[process.currentStepIndex].id,
            }
          : { kind: "none" },
      };
    }
    case "needs_review":
      return {
        kind: "review",
        label: input.summary.reasonLabel,
        destination: { kind: "none" },
      };
  }
}

/** Build one lease's guidance projection. Pure; every fact comes from the passed evidence. */
export function buildDeskLeaseGuidance(input: DeskGuidanceInput): DeskLeaseGuidance {
  const status = overallStatus(input);
  const blockers =
    status === "blocked" && input.process ? blockersFrom(input.process) : [];
  return {
    currentBaseRent:
      typeof input.rentvineCurrentRent === "number" &&
      Number.isFinite(input.rentvineCurrentRent)
        ? input.rentvineCurrentRent
        : null,
    currentBaseRentSource: "RentVine",
    rentVerification: rentVerification(input),
    overallStatus: status,
    urgencyRank: OVERALL_STATUS_URGENCY_RANK[status],
    isBlocked: status === "blocked" || status === "needs_verification",
    blockers,
    action: action(input, status),
  };
}
