import type { CreateProcessDefinitionInput } from "@/lib/firestore/schemas";

/**
 * Non-executable Move-In process-definition template (S13 Wave 2 / space-teeth E1). Mirrors the
 * maintenance/lease-renewal templates: the resulting definition seeds as a Draft, carries no
 * executable action references, and encodes the ten Move-In steps VERBATIM from
 * `docs/products/move-in-move-out-process.md` §3.
 *
 * Governance (v1-process-qa.md Move-In Q2 OVERRIDE): there are NO hard blocking gates in V1 — EVERY
 * move-in step is a tracked checklist flag, including e-signature (step 5) and certified funds
 * (step 6); the operator judges readiness. The sheet's "gate" columns are reframed here as flags.
 * Fees are never hard-coded (they render as "see RentVine" on the desk); the Missouri deposit = 2×
 * monthly rent policy is a documented fact (discovery-ref §2), cited as text, never a computed figure.
 */

const MOVE_IN_STEPS: ReadonlyArray<{ title: string; description: string }> = [
  {
    title: "Intake form / tenant info",
    description:
      "A move-in Google Form gathers tenant info (occupancy, contacts); this feeds lease fields. Tab 1 carries a `form` yes-flag. Content-key Tab 1 — never trust its headers (the `Move in date` column holds tenant emails). Tracked checklist flag.",
  },
  {
    title: "Collect onboarding documents & screening",
    description:
      "Tab 1 tracks yes-flags for processing fee, driver's license (DL), paystub, PetScreening, and utility proof. PetScreening is the third-party pet/service-animal verification. Tracked checklist flag.",
  },
  {
    title: "Build the lease document set",
    description:
      "Shared with renewal. The lease package is built in Dotloop by the build-out admin; a named loop is created, tenant parties added (name/email/phone, role = tenant), the lease-agreement template selected, and the document set assembled per the 'it-depends' logic. Tracked checklist flag.",
  },
  {
    title: "Deposit / deposit-replacement posture",
    description:
      "Tab 1 records a `Guarantors Policy locking them in?` flag — whether a deposit-replacement policy (The Guarantors / Rhino) covers the tenant rather than a cash deposit (Missouri security deposit = 2× monthly rent is the documented policy fact — discovery-ref §2, cited as text, never a computed amount). Conditional flag; drives the Dotloop doc set.",
  },
  {
    title: "E-signature",
    description:
      "Tab 1's `Have all documents been signed electronically?` records e-signature via Dotloop (e-signature only). V1 tracks this as a checklist flag — NOT a hard blocking gate (v1-process-qa Move-In Q2 override); the operator judges readiness.",
  },
  {
    title: "Certified funds",
    description:
      "Tab 1's `Have we received certified funds…` records receipt of certified funds. V1 tracks this as a checklist flag — NOT a hard blocking gate (v1-process-qa Move-In Q2 override); the operator judges readiness.",
  },
  {
    title: "Inspection setup",
    description:
      "Tab 1 adds the unit to the Inspection Tracker (Tab 17) and records a zInspector link. V1 records the link and the tracker add — it does not invent an inspection SLA. Tracked checklist flag.",
  },
  {
    title: "Key handoff",
    description:
      "Tab 1 records a key handoff step; per-property key location/copies/Kwikset status live in the Key Tracker (Tab 13), keyed by address. Smart-lock provisioning is undocumented and is never inferred from the excluded credential tabs. Manual checklist step pointing at the Key Tracker.",
  },
  {
    title: "Welcome communication",
    description:
      "Tab 1 sends a welcome letter by email and by Portal Chat. Draft only — a human sends (no autonomous send; SMS stays off unless confirmed). Fees render as 'see RentVine' placeholders, never a hard-coded amount. Tracked checklist flag.",
  },
  {
    title: "Disable the listing",
    description:
      "Tab 1 ends move-in with a listing-disable step: turn off the active listing once the unit is filled. Tracked checklist flag.",
  },
];

/** The Move-In step titles, in order — the source-grounded §3 sequence. */
export const MOVE_IN_STEP_TITLES: readonly string[] = MOVE_IN_STEPS.map(
  (step) => step.title,
);

export interface MoveInTemplateOptions {
  ownerUid: string;
  approverUid: string;
  sourceLinks?: Array<{ label: string; url: string }>;
}

export function buildMoveInProcessTemplate(
  options: MoveInTemplateOptions,
): CreateProcessDefinitionInput {
  return {
    name: "Move-In",
    short_outcome:
      "Track a tenant move-in as a source-backed checklist — intake, documents, lease build-out, deposit posture, e-signature, certified funds, inspection, keys, welcome, and listing — with a DRAFT welcome a human sends. No app write to any system of record.",
    trigger:
      "Manual start by a team member when a tenant is approved/onboarding (owner and default approver come from the process config, plus a settable secondary approver). Auto-detect from RentVine is a later phase.",
    owner_uid: options.ownerUid,
    default_approver_uid: options.approverUid,
    source_links: options.sourceLinks ?? [],
    required_starting_inputs: [
      "Tenant (from the move-in Google Form)",
      "Property / unit reference (content-keyed; never trust Tab 1 headers)",
      "Approved / onboarding status",
    ],
    steps: MOVE_IN_STEPS.map((step) => ({
      title: step.title,
      description: step.description,
    })),
    action_references: [],
    success_condition:
      "Every move-in step is reviewed and checked off by the operator; the welcome is sent by a human; no external write or send occurs from the app.",
    stop_condition:
      "The operator judges readiness; missing prerequisites surface as unchecked or flagged steps, never a hard block (v1-process-qa Move-In Q2 override — no hard gates in V1).",
    escalation_condition: "Blocked or unclear items route to Admin triage.",
  };
}
