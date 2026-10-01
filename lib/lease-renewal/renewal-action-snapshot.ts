import type { Role } from "@/lib/auth/roles";
import {
  DESK_EVIDENCE_CAPABILITY,
  deskBlockedSubsteps,
  deskReadySubstep,
  deskWaitingPartyLabel,
} from "@/lib/lease-renewal/desk-guidance";
import type { RenewalLeaseWorkspace } from "@/lib/lease-renewal/desk-model";
import type { RentChargeOutcomeRow } from "@/lib/lease-renewal/rent-charge-outcomes";
import type { RenewalActionSnapshot } from "@/lib/lease-renewal/renewal-actions";
import type { RenewalIssueProjection } from "@/lib/lease-renewal/renewal-issues";
import {
  RENEWAL_PROCESS_DEFINITION,
  type RenewalEvidenceKey,
} from "@/lib/lease-renewal/renewal-process";
import type { RenewalWorkspaceState } from "@/lib/lease-renewal/workspace-state";

/**
 * S142: reduce the server's lease workspace to the serializable facts the action projection reads.
 * Every value comes from a projection the page already rendered (the shared S82/S127 guidance, the
 * S72 process, the staff-record read, the S117 source-update outcomes); nothing is recomputed from a
 * different input and no source value beyond a label leaves the server here.
 */

const VERIFY_STEP = RENEWAL_PROCESS_DEFINITION.steps.find(
  (step) => step.id === "verify-renewal",
)!;

/** The verification substep that produces each evidence key. */
const VERIFY_PRODUCER = new Map<RenewalEvidenceKey, string>(
  VERIFY_STEP.substeps.flatMap((substep) =>
    substep.requiredEvidence.map((key) => [key, substep.id] as const),
  ),
);

export interface RenewalActionSnapshotInput {
  readonly workspace: RenewalLeaseWorkspace;
  readonly role: Role;
  readonly issues: RenewalIssueProjection;
  /** True when the consolidated dashboard mounts the staff-recorded lane. */
  readonly manualLaneMounted: boolean;
  readonly manualState: RenewalWorkspaceState | null | undefined;
  readonly manualReadUnavailable: boolean;
  /** Symbolic keys of the supporting reads that failed on this page. */
  readonly unavailableSources: ReadonlySet<string>;
  readonly rentChargeStatus: readonly RentChargeOutcomeRow[] | null;
  readonly correctionPanel: boolean;
}

export function buildRenewalActionSnapshot(
  input: RenewalActionSnapshotInput,
): RenewalActionSnapshot {
  const { workspace, issues } = input;
  const { summary, guidance } = workspace;
  const process = workspace.workflowAvailable ? workspace.process : null;
  const action = guidance.action;
  const destinationStep =
    "destination" in action && action.destination.kind === "workspace_phase"
      ? action.destination.stepId
      : null;
  const currentStep = process?.steps[process.currentStepIndex] ?? null;
  // The one substep the process-lane guidance names, chosen by the guidance's own helpers.
  const substepId =
    process && !summary.manualProgress
      ? guidance.overallStatus === "blocked"
        ? (deskBlockedSubsteps(process)[0]?.id ?? null)
        : action.kind === "act"
          ? (deskReadySubstep(process)?.id ?? null)
          : null
      : null;
  const verify = process?.steps.find((step) => step.id === "verify-renewal");
  const term = summary.leaseTerm;
  const rentvineReadable =
    !input.unavailableSources.has("writeback_proposal") &&
    !input.unavailableSources.has("attempt_summary");
  return {
    leaseId: summary.id,
    role: input.role,
    workflowAvailable: workspace.workflowAvailable,
    manualLaneMounted: input.manualLaneMounted,
    manual: input.manualReadUnavailable
      ? { readable: false }
      : { readable: true, state: input.manualState ?? null },
    guidance: {
      status: guidance.overallStatus,
      kind: action.kind,
      label: "label" in action ? action.label : issues.primary.label,
      stepId: destinationStep ?? currentStep?.id ?? null,
      verificationCause:
        guidance.overallStatus === "needs_verification"
          ? (workspace.verificationCause ?? null)
          : null,
      substepId,
      redirectLabel: issues.primary.redirected ? issues.primary.label : null,
      waitingOn:
        guidance.overallStatus === "waiting"
          ? deskWaitingPartyLabel(summary.followUp?.waiting.party)
          : null,
    },
    progressStateAvailable: !input.unavailableSources.has("progress"),
    process: process
      ? {
          status: process.status,
          migrationReason: process.migrationReason ?? null,
          currentStepId: currentStep?.id ?? null,
          verify: (verify?.substeps ?? []).map((substep) => {
            const definition = VERIFY_STEP.substeps.find(
              (candidate) => candidate.id === substep.id,
            );
            return {
              id: substep.id,
              label: substep.label,
              state: substep.state,
              completionRule: substep.completionRule,
              blockers: substep.blockers,
              nextAction: substep.nextAction,
              prerequisites: (definition?.prerequisiteEvidence ?? [])
                .map((key) => VERIFY_PRODUCER.get(key))
                .filter((id): id is string => Boolean(id)),
              capability:
                substep.missingEvidence
                  .map((key) => DESK_EVIDENCE_CAPABILITY[key])
                  .find(Boolean) ?? "edit",
            };
          }),
        }
      : null,
    termReview: input.unavailableSources.has("term_review")
      ? "unavailable"
      : term.term === "needs_review" ||
          term.reviewState === "needs_anchor" ||
          term.recordedReviewStale
        ? "needed"
        : "not_needed",
    rentvineUpdates: rentvineReadable
      ? {
          available: true,
          rows: (input.rentChargeStatus ?? [])
            .filter((row) => row.destination === "rentvine")
            .map((row) => ({
              id: row.id,
              label: row.label,
              state: row.state,
              stateLabel: row.stateLabel,
              detail: row.detail,
            })),
        }
      : { available: false },
    regions: {
      followUp: Boolean(workspace.followUp),
      correction: input.correctionPanel,
      documentPacket: workspace.workflowAvailable,
    },
  };
}
