import type { CreateProcessDefinitionInput } from "@/lib/firestore/schemas";

/**
 * Non-executable Move-Out + Deposit Disposition process-definition template (S13 Wave 2 /
 * space-teeth E1). Mirrors the maintenance/lease-renewal templates: seeds as a Draft, carries no
 * executable action references, and encodes the eleven Move-Out steps VERBATIM from
 * `docs/products/move-in-move-out-process.md` §4.
 *
 * Governance (v1-process-qa.md):
 * - Q1 narrows the trigger: a manual "Start move-out" button is the ONLY V1 trigger — no automatic
 *   Renewals→Move-Out handoff. Eviction/abandonment still branch for separate handling.
 * - Q3 override: the app DOES compute a SUGGESTED deposit deduction from operator-entered evidence —
 *   the desk surfaces it at step 8 (clearly labeled suggestion, owner-approval-required, transparent
 *   arithmetic, never posted to any ledger).
 * - Q2: the statutory deposit-disposition deadline and legal wording are NEVER invented — they render
 *   as literal `Needs Verification:` placeholders.
 * - "Deposit disposition sent" (step 8) and "everything finalized" (step 11) are ORDINARY checklist
 *   steps in the same uniform model — no hard block, no second state machine.
 */

const MOVE_OUT_STEPS: ReadonlyArray<{ title: string; description: string }> = [
  {
    title: "Notice / exit trigger",
    description:
      "Tab 2's `Have they put in their notice?` records the exit trigger, with values yes / a date / eviction / abandonment. In V1 the run starts from a manual 'Start move-out' button only (no Renewals handoff); eviction/abandonment branch separately. Tracked checklist flag.",
  },
  {
    title: "Scheduled vs actual vacate dates",
    description:
      "Tab 2 tracks scheduled and actual vacate dates (mixed formats). Tracked checklist flag.",
  },
  {
    title: "Move-out document set (Dotloop)",
    description:
      "Tab 2 carries Dotloop move-out instructions. The exact move-out document set is not enumerated in the sources — it renders as a `Needs Verification:` placeholder, never invented. Tracked checklist flag.",
  },
  {
    title: "Conditional 4265 coordination charge",
    description:
      "A conditional '4265 coordination charge' applies 'if they are in one of our lease docs'. The amount is a sheet token, never a hard-coded fee; when entered it feeds the evidence packet as an operator-entered line. Conditional checklist flag.",
  },
  {
    title: "Move-out inspection",
    description:
      "Tab 2 sends an inspection email via the portal, cc Dan. Tracked checklist flag.",
  },
  {
    title: "RentVine close-out / reporting changes",
    description:
      "Tab 2 records RentVine actions: `Turn off Auto Charges`, `Disable Credit reporting + close lease`, and stop the Second Nature filter program. These are recorded steps the team performs in RentVine — no RentVine write is proposed as executable by the app. Tracked checklist flag.",
  },
  {
    title: "Lock change + owner charge",
    description:
      "Tab 2 records a lock change with an owner charge (owner-billing, routed for owner approval); when entered it feeds the evidence packet as an operator-entered line. Exact vendor/cost flow is undocumented. Tracked checklist flag.",
  },
  {
    title: "Deposit disposition",
    description:
      "Tab 2's `Deposit disposition sent` marks the disposition — built as an ordinary checklist step (no hard block, no second state machine). The desk surfaces a clearly labeled SUGGESTED deposit deduction computed transparently from operator-entered evidence: owner approval required, never final, never posted to any ledger/bank/QuickBooks. The statutory deadline and legal wording stay literal `Needs Verification:` placeholders (v1-process-qa Move-Out Q2).",
  },
  {
    title: "Deposit-replacement claim (conditional)",
    description:
      "Tab 2's `Submit Rhino Claim` — if a deposit-replacement policy (Rhino / The Guarantors) was in force at move-in, file the claim. Conditional on the move-in deposit posture; a manual escalated step (portal/evidence/timeline undocumented). Tracked checklist flag.",
  },
  {
    title: "Collections",
    description:
      "Tab 2 records a collections step for unpaid balances. Vendor/process detail is undocumented. Tracked checklist flag.",
  },
  {
    title: "Final / relisting",
    description:
      "Tab 2's `everything finalized?` marks completion; the tab's stated purpose ends in relisting (a downstream handoff, out of scope for V1). Built as an ordinary checklist step (no hard block).",
  },
];

/** The Move-Out step titles, in order — the source-grounded §4 sequence. */
export const MOVE_OUT_STEP_TITLES: readonly string[] = MOVE_OUT_STEPS.map(
  (step) => step.title,
);

export interface MoveOutTemplateOptions {
  ownerUid: string;
  approverUid: string;
  sourceLinks?: Array<{ label: string; url: string }>;
}

export function buildMoveOutProcessTemplate(
  options: MoveOutTemplateOptions,
): CreateProcessDefinitionInput {
  return {
    name: "Move-Out + Deposit Disposition",
    short_outcome:
      "Track a move-out as a source-backed checklist — notice, vacate dates, Dotloop doc set, inspection, RentVine close-out, lock change, deposit disposition, claim, collections, and finalization — and assemble a transparent, owner-approval-required SUGGESTED deposit deduction. No app write to any ledger or system of record.",
    trigger:
      'A manual "Start move-out" button is the ONLY V1 trigger — no automatic Renewals→Move-Out handoff yet. Eviction/abandonment still branch for separate handling.',
    owner_uid: options.ownerUid,
    default_approver_uid: options.approverUid,
    source_links: options.sourceLinks ?? [],
    required_starting_inputs: [
      "Lease / tenant reference (content-keyed; Tab 2 `Name` is PII)",
      "Exit trigger (notice / date / eviction / abandonment)",
    ],
    steps: MOVE_OUT_STEPS.map((step) => ({
      title: step.title,
      description: step.description,
    })),
    action_references: [],
    success_condition:
      "Every move-out step is checked off; the SUGGESTED deposit deduction is owner-approved before use; the disposition and finalization steps are checked in the same uniform checklist model; no app write to any ledger or system of record.",
    stop_condition:
      "Missing evidence or a legal input surfaces as an unchecked or flagged step; the app never invents the statutory deposit-disposition deadline or legal wording (it stays a `Needs Verification:` placeholder — v1-process-qa Move-Out Q2).",
    escalation_condition:
      "Blocked or legal-gated items (deposit deadline, dispute) route to Dan/Josiah Admin and legal.",
  };
}
