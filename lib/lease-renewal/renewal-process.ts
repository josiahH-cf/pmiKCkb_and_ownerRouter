// S72: the one versioned renewal-process contract used by progress, desk, workspace, and tests.
//
// This module is deliberately pure and provider-free. It describes evidence REFERENCES and derives
// visible process state; it cannot read a provider, send a message, write a system of record, or grant
// an action. External services may contribute a verified reference through their own governed seam.

export const RENEWAL_PROCESS_VERSION = "renewal-v1" as const;
export const LEGACY_RENEWAL_PROCESS_VERSION = "legacy-four-step-v0" as const;

export const RENEWAL_PROCESS_STEP_IDS = [
  "verify-renewal",
  "owner-decision",
  "tenant-decision",
  "document-packet",
  "signatures-follow-up",
  "compliance-close",
] as const;

export type RenewalProcessStepId = (typeof RENEWAL_PROCESS_STEP_IDS)[number];

export const RENEWAL_EVIDENCE_KEYS = [
  "lease-tracked",
  "lease-identity",
  "lease-end-date",
  "base-rent",
  "recurring-charges-separated",
  "source-conflicts-resolved",
  "source-snapshot-current",
  "renewal-recipients",
  "market-evidence",
  "market-evidence-reviewed",
  "owner-copy-version",
  "owner-draft-receipt",
  "owner-message-sent",
  "owner-response",
  "owner-decision",
  "tenant-offer-fact-lock",
  "tenant-recipients",
  "tenant-copy-version",
  "tenant-draft-receipt",
  "tenant-message-sent",
  "tenant-contact-state",
  "tenant-outcome",
  "non-renewal-handoff",
  "packet-catalog-version",
  "packet-facts",
  "packet-snapshot",
  "dotloop-packet-readback",
  "source-write-receipt",
  "signer-roster",
  "signature-state",
  "timing-policy-version",
  "current-packet-version",
  "signatures-complete",
  "final-documents",
  "animal-compliance",
  "deposit-compliance",
  "insurance-and-charges",
  "inspection-compliance",
  "term-dates",
  "compliance-exceptions",
  "app-completion",
] as const;

export type RenewalEvidenceKey = (typeof RENEWAL_EVIDENCE_KEYS)[number];

export const RENEWAL_EVIDENCE_SOURCES = [
  "rentvine_snapshot",
  "sheet_snapshot",
  "reconciliation_receipt",
  "rentcast_receipt",
  "gmail_receipt",
  "app_record",
  "policy_version",
  "packet_snapshot",
  "dotloop_receipt",
  "signed_artifact",
  "compliance_record",
] as const;

export type RenewalEvidenceSource = (typeof RENEWAL_EVIDENCE_SOURCES)[number];
export type RenewalEvidenceDisposition = "verified" | "not_applicable";

/** A value-free pointer to evidence. Customer values and message bodies do not belong here. */
export interface RenewalEvidenceReference {
  ref: string;
  source: RenewalEvidenceSource;
  disposition: RenewalEvidenceDisposition;
  observedAt?: string;
  fingerprint?: string;
  /** Required when disposition is not_applicable; it explains the exact source/rule. */
  reason?: string;
}

export type RenewalEvidenceMap = Partial<
  Record<RenewalEvidenceKey, RenewalEvidenceReference>
>;

export const RENEWAL_EXTERNAL_DEPENDENCY_IDS = [
  "approved-owner-copy",
  "approved-tenant-copy",
  "document-catalog",
  "dotloop-provider-mapping",
  "confirmed-timing-policy",
  "source-write-authority",
] as const;

export type RenewalExternalDependencyId =
  (typeof RENEWAL_EXTERNAL_DEPENDENCY_IDS)[number];

export interface RenewalExternalDependencyState {
  state: "available" | "missing";
  reason: string;
  nextAction: string;
}

export type RenewalExternalDependencies = Partial<
  Record<RenewalExternalDependencyId, RenewalExternalDependencyState>
>;

export type RenewalTenantOutcomeState =
  | "awaiting_response"
  | "accepted"
  | "counter_change_requested"
  | "declined_nonrenewing"
  | "needs_verification";

export interface RenewalTenantOutcome {
  state: RenewalTenantOutcomeState;
  evidence: RenewalEvidenceReference;
}

export type RenewalSubstepState = "not_started" | "blocked" | "ready" | "complete";

type RenewalBranchApplicability = "always" | "accepted_only" | "declined_only";

export interface RenewalSubstepDefinition {
  id: string;
  label: string;
  responsibleRole: string;
  completionRule: string;
  requiredEvidence: readonly RenewalEvidenceKey[];
  prerequisiteEvidence?: readonly RenewalEvidenceKey[];
  externalDependencies?: readonly RenewalExternalDependencyId[];
  branch?: RenewalBranchApplicability;
  allowNotApplicable?: boolean;
  /** A separately governed source write is visible but cannot block app completion. */
  requiredForStep?: boolean;
  nextAction: string;
}

export interface RenewalStepDefinition {
  id: RenewalProcessStepId;
  title: string;
  shortLabel: string;
  responsibleRole: string;
  completionRule: string;
  substeps: readonly RenewalSubstepDefinition[];
}

export interface RenewalProcessDefinition {
  version: typeof RENEWAL_PROCESS_VERSION;
  steps: readonly RenewalStepDefinition[];
}

function substep(definition: RenewalSubstepDefinition): RenewalSubstepDefinition {
  return definition;
}

const PROCESS_DEFINITION: RenewalProcessDefinition = {
  version: RENEWAL_PROCESS_VERSION,
  steps: [
    {
      id: "verify-renewal",
      title: "Find and verify the renewal",
      shortLabel: "Verify renewal",
      responsibleRole: "Renewal operator",
      completionRule:
        "The exact lease and current sources agree or carry an exact resolution; base rent is verified and recurring charges remain separate.",
      substeps: [
        substep({
          id: "identify-work",
          label: "Identify current, upcoming, or tracked-incomplete renewal work",
          responsibleRole: "Renewal operator",
          completionRule: "A stable lease id is present in the actionable work source.",
          requiredEvidence: ["lease-tracked"],
          nextAction: "Open the exact lease from the renewal worklist.",
        }),
        substep({
          id: "verify-lease-identity",
          label: "Verify lease, property, unit, tenant, and owner identity",
          responsibleRole: "Renewal operator",
          completionRule:
            "Current source evidence resolves the exact lease and related parties.",
          requiredEvidence: ["lease-identity"],
          prerequisiteEvidence: ["lease-tracked"],
          nextAction:
            "Resolve the exact lease and party identities from current sources.",
        }),
        substep({
          id: "verify-end-date",
          label: "Verify the lease end date",
          responsibleRole: "Renewal operator",
          completionRule: "A current source or exact resolution proves the end date.",
          requiredEvidence: ["lease-end-date"],
          prerequisiteEvidence: ["lease-identity"],
          nextAction: "Verify the lease end date from the current source snapshot.",
        }),
        substep({
          id: "verify-base-rent",
          label: "Verify contractual base rent",
          responsibleRole: "Renewal operator",
          completionRule:
            "Fresh agreement or an exact resolution proves contractual base rent.",
          requiredEvidence: ["base-rent"],
          prerequisiteEvidence: ["lease-identity"],
          nextAction: "Resolve contractual base rent before using market evidence.",
        }),
        substep({
          id: "separate-recurring-charges",
          label: "Keep recurring charges separate from base rent",
          responsibleRole: "Renewal operator",
          completionRule:
            "The app contract preserves separate base-rent and charge fields.",
          requiredEvidence: ["recurring-charges-separated"],
          prerequisiteEvidence: ["base-rent"],
          nextAction:
            "Label every recurring charge separately from contractual base rent.",
        }),
        substep({
          id: "resolve-source-conflicts",
          label: "Resolve or explicitly hold every blocking source conflict",
          responsibleRole: "Renewal operator / Approver",
          completionRule:
            "No blocking conflict remains without an exact disposition receipt.",
          requiredEvidence: ["source-conflicts-resolved"],
          prerequisiteEvidence: ["lease-identity"],
          nextAction:
            "Record an exact source disposition or leave the conflict visibly held.",
        }),
        substep({
          id: "confirm-source-currency",
          label: "Confirm source completeness and currency",
          responsibleRole: "Renewal operator",
          completionRule:
            "The source snapshot is complete enough and inside the action age limit.",
          requiredEvidence: ["source-snapshot-current"],
          prerequisiteEvidence: ["lease-identity"],
          nextAction: "Refresh the exact source snapshot and resolve an incomplete read.",
        }),
        substep({
          id: "confirm-renewal-recipients",
          label: "Confirm required owner and tenant recipient identities are available",
          responsibleRole: "Renewal operator",
          completionRule: "All required recipients resolve from authoritative records.",
          requiredEvidence: ["renewal-recipients"],
          prerequisiteEvidence: ["lease-identity"],
          nextAction:
            "Resolve every owner and tenant of record without guessing an address.",
        }),
      ],
    },
    {
      id: "owner-decision",
      title: "Analyze market evidence and record the owner decision",
      shortLabel: "Owner decision",
      responsibleRole: "Renewal operator; human property owner supplies the decision",
      completionRule:
        "The human owner's response and exact rent/terms are recorded with evidence; a draft or provider estimate alone is insufficient.",
      substeps: [
        substep({
          id: "retrieve-market-evidence",
          label: "Retrieve reference market evidence under the approved query policy",
          responsibleRole: "Renewal operator",
          completionRule:
            "A current S59/RentCast receipt identifies the query and returned evidence.",
          requiredEvidence: ["market-evidence"],
          prerequisiteEvidence: ["base-rent", "source-snapshot-current"],
          nextAction: "Run the governed reference-comp lookup for this exact lease.",
        }),
        substep({
          id: "review-market-evidence",
          label:
            "Review query basis, range, comparables, and available screenshot evidence",
          responsibleRole: "Renewal operator",
          completionRule: "An app audit record identifies the reviewed market receipt.",
          requiredEvidence: ["market-evidence-reviewed"],
          prerequisiteEvidence: ["market-evidence"],
          nextAction: "Review the source, query, returned comparables, and omissions.",
        }),
        substep({
          id: "prepare-owner-copy",
          label: "Prepare approved owner copy",
          responsibleRole: "Renewal operator / Admin template owner",
          completionRule: "An approved versioned owner template is selected.",
          requiredEvidence: ["owner-copy-version"],
          prerequisiteEvidence: ["market-evidence-reviewed"],
          externalDependencies: ["approved-owner-copy"],
          nextAction:
            "Select approved owner wording; do not invent legal or policy copy.",
        }),
        substep({
          id: "create-owner-draft",
          label: "Exact-preview and create one unsent owner Gmail draft",
          responsibleRole: "Renewal operator",
          completionRule: "The exact unsent-draft receipt matches the reviewed inputs.",
          requiredEvidence: ["owner-draft-receipt"],
          prerequisiteEvidence: ["owner-copy-version", "renewal-recipients"],
          nextAction: "Review and exact-confirm one unsent owner Gmail draft.",
        }),
        substep({
          id: "observe-owner-send",
          label: "Observe the human-sent owner message from Gmail",
          responsibleRole: "Human sender / Renewal operator",
          completionRule:
            "Linked Gmail evidence proves a person sent the reviewed message.",
          requiredEvidence: ["owner-message-sent"],
          prerequisiteEvidence: ["owner-draft-receipt"],
          nextAction:
            "A person sends from Gmail; then deliberately refresh the linked thread.",
        }),
        substep({
          id: "record-owner-response",
          label: "Record the actual owner response and its evidence source",
          responsibleRole: "Renewal operator",
          completionRule:
            "A linked response or exact app record identifies the human response.",
          requiredEvidence: ["owner-response"],
          prerequisiteEvidence: ["owner-message-sent"],
          nextAction:
            "Refresh the linked thread or record the exact verified response source.",
        }),
        substep({
          id: "record-owner-decision",
          label: "Record owner-approved base rent, separate charges, terms, and evidence",
          responsibleRole: "Renewal operator; human property owner supplies the decision",
          completionRule:
            "The current app decision record binds exact values to the owner response.",
          requiredEvidence: ["owner-decision"],
          prerequisiteEvidence: ["owner-response", "base-rent"],
          nextAction:
            "Record the human owner's exact decision; never use the provider result as it.",
        }),
      ],
    },
    {
      id: "tenant-decision",
      title: "Prepare the tenant offer and track the decision",
      shortLabel: "Tenant decision",
      responsibleRole: "Renewal operator",
      completionRule:
        "A source-backed accepted or declined outcome is recorded; counter/change reopens owner work and unknown/no response remains incomplete.",
      substeps: [
        substep({
          id: "bind-offer-to-owner-decision",
          label: "Bind the offer to the current owner decision",
          responsibleRole: "Renewal operator",
          completionRule:
            "A fact-lock reference binds the offer to the current decision revision.",
          requiredEvidence: ["tenant-offer-fact-lock"],
          prerequisiteEvidence: ["owner-decision"],
          nextAction: "Build the offer only from the current recorded owner decision.",
        }),
        substep({
          id: "resolve-tenant-recipients",
          label: "Resolve every authoritative tenant and co-tenant recipient",
          responsibleRole: "Renewal operator",
          completionRule:
            "Authoritative recipient evidence covers every required tenant.",
          requiredEvidence: ["tenant-recipients"],
          prerequisiteEvidence: ["lease-identity"],
          nextAction: "Resolve every tenant of record without guessing contact data.",
        }),
        substep({
          id: "render-tenant-copy",
          label: "Render approved tenant copy with facts locked",
          responsibleRole: "Renewal operator / Admin template owner",
          completionRule:
            "An approved tenant template version is bound to the fact lock.",
          requiredEvidence: ["tenant-copy-version"],
          prerequisiteEvidence: ["tenant-offer-fact-lock"],
          externalDependencies: ["approved-tenant-copy"],
          nextAction:
            "Select approved tenant wording; optional assistance may change phrasing only.",
        }),
        substep({
          id: "create-tenant-draft",
          label: "Exact-preview and create one unsent tenant Gmail draft",
          responsibleRole: "Renewal operator",
          completionRule:
            "The exact unsent-draft receipt matches current recipients, facts, and copy.",
          requiredEvidence: ["tenant-draft-receipt"],
          prerequisiteEvidence: ["tenant-copy-version", "tenant-recipients"],
          nextAction: "Review and exact-confirm one unsent tenant Gmail draft.",
        }),
        substep({
          id: "observe-tenant-send",
          label: "Observe the human-sent tenant message from Gmail",
          responsibleRole: "Human sender / Renewal operator",
          completionRule:
            "Linked Gmail evidence proves a person sent the reviewed message.",
          requiredEvidence: ["tenant-message-sent"],
          prerequisiteEvidence: ["tenant-draft-receipt"],
          nextAction:
            "A person sends from Gmail; then deliberately refresh the linked thread.",
        }),
        substep({
          id: "refresh-contact-truth",
          label: "Refresh waiting, last-contact, and follow-up truth",
          responsibleRole: "Renewal operator",
          completionRule:
            "A targeted linked-thread refresh records the current contact state.",
          requiredEvidence: ["tenant-contact-state"],
          prerequisiteEvidence: ["tenant-message-sent"],
          nextAction:
            "Deliberately refresh the linked thread; do not start continuous polling.",
        }),
        substep({
          id: "record-tenant-outcome",
          label:
            "Record accepted, counter/change, declined/non-renewing, waiting, or Needs Verification",
          responsibleRole: "Renewal operator",
          completionRule: "A current response reference binds the named tenant outcome.",
          requiredEvidence: ["tenant-outcome"],
          prerequisiteEvidence: ["tenant-contact-state"],
          nextAction:
            "Record only the outcome supported by the current response evidence.",
        }),
        substep({
          id: "record-non-renewal-handoff",
          label: "Record the non-renewal handoff when the tenant declines",
          responsibleRole: "Renewal operator",
          completionRule: "A value-free handoff receipt identifies the owning process.",
          requiredEvidence: ["non-renewal-handoff"],
          prerequisiteEvidence: ["tenant-outcome"],
          branch: "declined_only",
          nextAction:
            "Create the documented non-renewal handoff instead of building documents.",
        }),
      ],
    },
    {
      id: "document-packet",
      title: "Build the required document packet",
      shortLabel: "Document packet",
      responsibleRole: "Document coordinator",
      completionRule:
        "A current immutable packet snapshot and required provider/artifact readback exist; source writeback is separate evidence.",
      substeps: [
        substep({
          id: "load-packet-catalog",
          label:
            "Load the approved artifact, participant, field, signature, and form catalog",
          responsibleRole: "Document coordinator / Admin catalog owner",
          completionRule: "A current approved catalog version is referenced.",
          requiredEvidence: ["packet-catalog-version"],
          prerequisiteEvidence: ["tenant-outcome"],
          externalDependencies: ["document-catalog"],
          branch: "accepted_only",
          nextAction:
            "Publish or select the approved document catalog; do not guess artifacts.",
        }),
        substep({
          id: "verify-packet-facts",
          label: "Verify exact parties, property, terms, and required fields",
          responsibleRole: "Document coordinator",
          completionRule:
            "Every required packet fact is verified or source-reasoned not applicable.",
          requiredEvidence: ["packet-facts"],
          prerequisiteEvidence: ["packet-catalog-version", "owner-decision"],
          branch: "accepted_only",
          nextAction: "Resolve the exact facts and blockers shown by packet truth.",
        }),
        substep({
          id: "freeze-packet-snapshot",
          label: "Assemble an immutable hash-bound packet snapshot",
          responsibleRole: "Document coordinator",
          completionRule:
            "A current packet hash binds catalog, facts, parties, and terms.",
          requiredEvidence: ["packet-snapshot"],
          prerequisiteEvidence: ["packet-facts"],
          branch: "accepted_only",
          nextAction: "Evaluate and freeze the current exact packet snapshot.",
        }),
        substep({
          id: "read-back-document-packet",
          label:
            "Create and read back the Dotloop packet only through the governed S34 seam",
          responsibleRole: "Document coordinator",
          completionRule:
            "Official provider or signed-artifact evidence matches the current packet hash.",
          requiredEvidence: ["dotloop-packet-readback"],
          prerequisiteEvidence: ["packet-snapshot"],
          externalDependencies: ["dotloop-provider-mapping"],
          branch: "accepted_only",
          nextAction:
            "Supply official mappings/authority or leave this substep visibly blocked.",
        }),
        substep({
          id: "keep-source-write-separate",
          label: "Keep any RentVine or Sheet write in its separate exact lifecycle",
          responsibleRole: "Admin when separately authorized",
          completionRule:
            "A separately governed write receipt may be shown but never proves packet completion.",
          requiredEvidence: ["source-write-receipt"],
          externalDependencies: ["source-write-authority"],
          branch: "accepted_only",
          requiredForStep: false,
          nextAction:
            "Use only a separately approved exact write flow; app completion does not require it.",
        }),
      ],
    },
    {
      id: "signatures-follow-up",
      title: "Obtain signatures and perform follow-up",
      shortLabel: "Signatures",
      responsibleRole: "Document coordinator / Renewal operator",
      completionRule:
        "Every required signature has current provider or artifact evidence; timing follows only confirmed policy.",
      substeps: [
        substep({
          id: "track-signers",
          label: "Track every required signer and artifact",
          responsibleRole: "Document coordinator",
          completionRule: "A current signer roster is bound to the packet version.",
          requiredEvidence: ["signer-roster"],
          prerequisiteEvidence: ["packet-snapshot"],
          branch: "accepted_only",
          nextAction:
            "Resolve every signer from the current packet catalog and source identities.",
        }),
        substep({
          id: "refresh-signature-state",
          label: "Refresh provider or authoritative signed-artifact state",
          responsibleRole: "Document coordinator / Renewal operator",
          completionRule:
            "A current signature-state receipt identifies the packet version.",
          requiredEvidence: ["signature-state"],
          prerequisiteEvidence: ["signer-roster", "dotloop-packet-readback"],
          branch: "accepted_only",
          nextAction:
            "Refresh the exact provider packet or inspect authoritative signed artifacts.",
        }),
        substep({
          id: "apply-confirmed-follow-up-policy",
          label: "Apply only client-confirmed follow-up timing",
          responsibleRole: "Renewal operator / Admin policy owner",
          completionRule: "A confirmed policy version governs any due-state display.",
          requiredEvidence: ["timing-policy-version"],
          externalDependencies: ["confirmed-timing-policy"],
          branch: "accepted_only",
          nextAction: "Confirm timing policy or leave due timing visibly unset.",
        }),
        substep({
          id: "handle-correction-reissue",
          label: "Handle correction or reissue through a new exact packet snapshot",
          responsibleRole: "Document coordinator",
          completionRule:
            "The current packet version is verified, or no correction is applicable with source/reason.",
          requiredEvidence: ["current-packet-version"],
          prerequisiteEvidence: ["packet-snapshot"],
          branch: "accepted_only",
          allowNotApplicable: true,
          nextAction:
            "Create a successor snapshot for any correction; never overwrite prior receipts.",
        }),
        substep({
          id: "verify-required-signatures",
          label: "Verify every required signature on the current packet",
          responsibleRole: "Document coordinator / Renewal operator",
          completionRule:
            "Every required signature has evidence tied to the current packet version.",
          requiredEvidence: ["signatures-complete"],
          prerequisiteEvidence: ["signature-state", "current-packet-version"],
          branch: "accepted_only",
          nextAction: "Resolve every missing, partial, stale, or ambiguous signature.",
        }),
      ],
    },
    {
      id: "compliance-close",
      title: "Complete final compliance checks and close the renewal",
      shortLabel: "Compliance",
      responsibleRole: "Renewal reviewer / Renewal operator",
      completionRule:
        "Every required check is verified or source-reasoned not applicable; app completion is distinct from source writeback.",
      substeps: [
        substep({
          id: "verify-final-documents",
          label: "Verify all required documents and signatures",
          responsibleRole: "Renewal reviewer",
          completionRule: "Current document and signature evidence is complete.",
          requiredEvidence: ["final-documents"],
          prerequisiteEvidence: ["signatures-complete"],
          branch: "accepted_only",
          nextAction:
            "Verify the final packet and every signature against current evidence.",
        }),
        ...[
          [
            "verify-animal-terms",
            "Verify pet and animal terms",
            "animal-compliance",
            true,
          ],
          [
            "verify-deposit",
            "Verify Rhino or security-deposit applicability",
            "deposit-compliance",
            true,
          ],
          [
            "verify-insurance-charges",
            "Verify insurance and separately labeled charges",
            "insurance-and-charges",
            true,
          ],
          [
            "verify-inspection",
            "Verify owner-inspection applicability and evidence",
            "inspection-compliance",
            true,
          ],
          [
            "verify-term-dates",
            "Verify effective lease dates and terms",
            "term-dates",
            false,
          ],
          [
            "resolve-compliance-exceptions",
            "Resolve every remaining compliance exception",
            "compliance-exceptions",
            true,
          ],
        ].map(([id, label, evidence, allowNotApplicable]) =>
          substep({
            id: String(id),
            label: String(label),
            responsibleRole: "Renewal reviewer / Renewal operator",
            completionRule: allowNotApplicable
              ? "Verified evidence or an exact Not Applicable source/reason is recorded."
              : "Verified evidence is recorded.",
            requiredEvidence: [evidence as RenewalEvidenceKey],
            prerequisiteEvidence: ["final-documents"],
            branch: "accepted_only",
            allowNotApplicable: Boolean(allowNotApplicable),
            nextAction: `Resolve ${String(label).toLowerCase()} from an approved source.`,
          }),
        ),
        substep({
          id: "record-app-completion",
          label: "Record app completion with exact audit evidence",
          responsibleRole: "Renewal reviewer / Renewal operator",
          completionRule:
            "The app completion receipt follows every required verified/N/A check.",
          requiredEvidence: ["app-completion"],
          prerequisiteEvidence: [
            "final-documents",
            "animal-compliance",
            "deposit-compliance",
            "insurance-and-charges",
            "inspection-compliance",
            "term-dates",
            "compliance-exceptions",
          ],
          branch: "accepted_only",
          nextAction: "Record app completion only after every final check is proven.",
        }),
      ],
    },
  ],
};

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

export const RENEWAL_PROCESS_DEFINITION = deepFreeze(
  PROCESS_DEFINITION,
) as RenewalProcessDefinition;

export const RENEWAL_STEPPER_STEPS = Object.freeze(
  RENEWAL_PROCESS_DEFINITION.steps.map((step) =>
    Object.freeze({ id: step.id, label: step.shortLabel }),
  ),
);

export const RENEWAL_STAGE_NEXT_ACTIONS = Object.freeze(
  RENEWAL_PROCESS_DEFINITION.steps.map(
    (step) =>
      step.substeps.find((candidate) => candidate.requiredForStep !== false)
        ?.nextAction ?? "Open the renewal workspace.",
  ),
);

const DEPENDENCY_LABELS: Record<RenewalExternalDependencyId, string> = {
  "approved-owner-copy": "Approved owner wording is not configured.",
  "approved-tenant-copy": "Approved tenant wording is not configured.",
  "document-catalog": "The approved document catalog is not configured.",
  "dotloop-provider-mapping": "Official Dotloop mapping or authority is unavailable.",
  "confirmed-timing-policy": "Client-confirmed follow-up timing is unset.",
  "source-write-authority": "The exact RentVine/Sheet write action remains closed.",
};

const DEPENDENCY_NEXT_ACTIONS: Record<RenewalExternalDependencyId, string> = {
  "approved-owner-copy":
    "Ask the Admin template owner to publish approved owner wording.",
  "approved-tenant-copy":
    "Ask the Admin template owner to publish approved tenant wording.",
  "document-catalog": "Supply the approved artifact/form catalog through S66.",
  "dotloop-provider-mapping":
    "Supply official OAuth, template, participant, and field mappings.",
  "confirmed-timing-policy": "Ask an Admin to confirm and version the timing policy.",
  "source-write-authority":
    "Keep app completion separate; use a reviewed exact write flow only if opened.",
};

const DEPENDENCY_EVIDENCE: Partial<
  Record<RenewalExternalDependencyId, RenewalEvidenceKey>
> = {
  "approved-owner-copy": "owner-copy-version",
  "approved-tenant-copy": "tenant-copy-version",
  "document-catalog": "packet-catalog-version",
  "dotloop-provider-mapping": "dotloop-packet-readback",
  "confirmed-timing-policy": "timing-policy-version",
  "source-write-authority": "source-write-receipt",
};

export interface RenewalEvidenceBlocker {
  reason: string;
  nextAction: string;
}

export interface RenewalProcessProjectionInput {
  processVersion: string;
  evidence?: RenewalEvidenceMap;
  evidenceBlockers?: Partial<Record<RenewalEvidenceKey, RenewalEvidenceBlocker>>;
  externalDependencies?: RenewalExternalDependencies;
  tenantOutcome?: RenewalTenantOutcome | null;
  complete?: boolean;
}

export interface RenewalSubstepProjection {
  id: string;
  label: string;
  responsibleRole: string;
  state: RenewalSubstepState;
  applicable: boolean;
  requiredForStep: boolean;
  completionRule: string;
  missingEvidence: RenewalEvidenceKey[];
  blockers: string[];
  nextAction: string;
}

export interface RenewalStepProjection {
  id: RenewalProcessStepId;
  title: string;
  shortLabel: string;
  responsibleRole: string;
  completionRule: string;
  state: RenewalSubstepState;
  substeps: RenewalSubstepProjection[];
}

export type RenewalProcessStatus =
  | "active"
  | "waiting"
  | "counter_reopened"
  | "needs_verification"
  | "non_renewal_handoff_required"
  | "non_renewal_handoff"
  | "complete"
  | "migration_required";

export interface RenewalProcessProjection {
  version: string;
  definitionVersion: typeof RENEWAL_PROCESS_VERSION;
  status: RenewalProcessStatus;
  currentStepIndex: number;
  migrationRequired: boolean;
  migrationReason?: string;
  steps: RenewalStepProjection[];
}

export interface RenewalProcessMigrationAssessment {
  status: "current" | "needs_review" | "unsupported";
  fromVersion: string;
  toVersion: typeof RENEWAL_PROCESS_VERSION;
  safeNextAction: string;
  carriedFields: readonly string[];
  invalidatedFields: readonly string[];
}

export function assessRenewalProcessMigration(
  processVersion: string | null | undefined,
): RenewalProcessMigrationAssessment {
  if (processVersion === RENEWAL_PROCESS_VERSION) {
    return {
      status: "current",
      fromVersion: RENEWAL_PROCESS_VERSION,
      toVersion: RENEWAL_PROCESS_VERSION,
      safeNextAction: "Continue with the pinned renewal-v1 evidence graph.",
      carriedFields: ["owner decision", "tenant draft receipt", "audit history"],
      invalidatedFields: [],
    };
  }
  const fromVersion = processVersion?.trim() || LEGACY_RENEWAL_PROCESS_VERSION;
  const knownLegacy = fromVersion === LEGACY_RENEWAL_PROCESS_VERSION;
  return {
    status: knownLegacy ? "needs_review" : "unsupported",
    fromVersion,
    toVersion: RENEWAL_PROCESS_VERSION,
    safeNextAction: knownLegacy
      ? "Review the lease and re-record the current owner decision to pin renewal-v1; no legacy stage is reinterpreted automatically."
      : "Stop and add an explicit reviewed migration for this process version.",
    carriedFields: ["last recorded owner decision for review", "audit history"],
    invalidatedFields: [
      "legacy stage index",
      "legacy draft-as-advance meaning",
      "legacy coarse completion",
    ],
  };
}

export function buildRenewalEvidenceReference(
  input: RenewalEvidenceReference,
): RenewalEvidenceReference {
  const ref = typeof input.ref === "string" ? input.ref.trim() : "";
  if (ref === "" || ref.length > 240 || !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(ref)) {
    throw new Error("Renewal evidence needs a bounded value-free reference.");
  }
  if (!RENEWAL_EVIDENCE_SOURCES.includes(input.source)) {
    throw new Error("Renewal evidence source is not recognized.");
  }
  if (!(["verified", "not_applicable"] as const).includes(input.disposition)) {
    throw new Error("Renewal evidence disposition is not recognized.");
  }
  const normalized: RenewalEvidenceReference = {
    ref,
    source: input.source,
    disposition: input.disposition,
  };
  if (input.observedAt !== undefined) {
    const observedAt = input.observedAt.trim();
    if (
      !/^\d{4}-\d{2}-\d{2}T/.test(observedAt) ||
      observedAt.length > 40 ||
      !Number.isFinite(Date.parse(observedAt))
    ) {
      throw new Error("Renewal evidence observation time must be ISO-like.");
    }
    normalized.observedAt = observedAt;
  }
  if (input.fingerprint !== undefined) {
    const fingerprint = input.fingerprint.trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(fingerprint)) {
      throw new Error("Renewal evidence fingerprint must be a SHA-256 hex value.");
    }
    normalized.fingerprint = fingerprint;
  }
  if (input.disposition === "not_applicable") {
    const reason = input.reason?.trim() ?? "";
    if (reason === "" || reason.length > 240) {
      throw new Error("Not-applicable renewal evidence needs a bounded source reason.");
    }
    normalized.reason = reason;
  } else if (input.reason?.trim()) {
    normalized.reason = input.reason.trim().slice(0, 240);
  }
  return normalized;
}

export function normalizeRenewalEvidenceMap(value: unknown): RenewalEvidenceMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const normalized: RenewalEvidenceMap = {};
  for (const key of RENEWAL_EVIDENCE_KEYS) {
    const candidate = (value as Record<string, unknown>)[key];
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    try {
      normalized[key] = buildRenewalEvidenceReference(
        candidate as RenewalEvidenceReference,
      );
    } catch {
      // A malformed historical reference never becomes completion evidence.
    }
  }
  return normalized;
}

function hasEvidence(
  evidence: RenewalEvidenceMap,
  key: RenewalEvidenceKey,
  allowNotApplicable: boolean,
): boolean {
  const reference = evidence[key];
  if (!reference) return false;
  if (reference.disposition === "verified") return true;
  return allowNotApplicable && Boolean(reference.reason?.trim());
}

function evidenceAllowsNotApplicable(key: RenewalEvidenceKey): boolean {
  return RENEWAL_PROCESS_DEFINITION.steps.some((step) =>
    step.substeps.some(
      (candidate) =>
        candidate.requiredEvidence.includes(key) && candidate.allowNotApplicable === true,
    ),
  );
}

function branchApplicable(
  branch: RenewalBranchApplicability | undefined,
  outcome: RenewalTenantOutcome | null | undefined,
): boolean {
  if (!branch || branch === "always") return true;
  if (branch === "accepted_only") return outcome?.state === "accepted";
  return outcome?.state === "declined_nonrenewing";
}

function effectiveDependency(
  id: RenewalExternalDependencyId,
  input: RenewalProcessProjectionInput,
  evidence: RenewalEvidenceMap,
): RenewalExternalDependencyState {
  const explicit = input.externalDependencies?.[id];
  if (explicit) return explicit;
  const evidenceKey = DEPENDENCY_EVIDENCE[id];
  if (
    evidenceKey &&
    hasEvidence(evidence, evidenceKey, evidenceAllowsNotApplicable(evidenceKey))
  ) {
    return {
      state: "available",
      reason: "The current evidence references this dependency.",
      nextAction: "Continue with the current exact evidence.",
    };
  }
  return {
    state: "missing",
    reason: DEPENDENCY_LABELS[id],
    nextAction: DEPENDENCY_NEXT_ACTIONS[id],
  };
}

function outcomeStateForSubstep(
  substepDefinition: RenewalSubstepDefinition,
  outcome: RenewalTenantOutcome | null | undefined,
): { state?: RenewalSubstepState; blocker?: string } {
  if (substepDefinition.id !== "record-tenant-outcome") return {};
  if (!outcome) return {};
  if (outcome.state === "accepted" || outcome.state === "declined_nonrenewing") {
    return {};
  }
  if (outcome.state === "counter_change_requested") {
    return {
      state: "blocked",
      blocker:
        "The tenant requested a change; owner-decision evidence must be refreshed.",
    };
  }
  if (outcome.state === "awaiting_response") {
    return { state: "blocked", blocker: "The tenant response is still pending." };
  }
  return {
    state: "blocked",
    blocker: "The current tenant outcome needs verification.",
  };
}

export function projectRenewalProcess(
  input: RenewalProcessProjectionInput,
): RenewalProcessProjection {
  const evidence = normalizeRenewalEvidenceMap(input.evidence ?? {});
  const migration = assessRenewalProcessMigration(input.processVersion);
  const migrationRequired = migration.status !== "current";

  const steps: RenewalStepProjection[] = RENEWAL_PROCESS_DEFINITION.steps.map(
    (stepDefinition) => {
      const substeps = stepDefinition.substeps.map((substepDefinition) => {
        const applicable = branchApplicable(
          substepDefinition.branch,
          input.tenantOutcome,
        );
        const requiredForStep = substepDefinition.requiredForStep !== false;
        const missingEvidence = substepDefinition.requiredEvidence.filter(
          (key) =>
            !hasEvidence(evidence, key, substepDefinition.allowNotApplicable === true),
        );
        const blockers: string[] = [];

        if (migrationRequired) {
          blockers.push(migration.safeNextAction);
        }
        if (applicable && !migrationRequired) {
          for (const dependency of substepDefinition.externalDependencies ?? []) {
            const state = effectiveDependency(dependency, input, evidence);
            if (state.state === "missing") blockers.push(state.reason);
          }
          for (const key of missingEvidence) {
            const blocker = input.evidenceBlockers?.[key];
            if (blocker) blockers.push(blocker.reason);
          }
        }

        const outcomeOverride = outcomeStateForSubstep(
          substepDefinition,
          input.tenantOutcome,
        );
        if (outcomeOverride.blocker) blockers.push(outcomeOverride.blocker);

        const prerequisitesMet = (substepDefinition.prerequisiteEvidence ?? []).every(
          (key) => hasEvidence(evidence, key, evidenceAllowsNotApplicable(key)),
        );

        let state: RenewalSubstepState;
        if (!applicable) state = "not_started";
        else if (migrationRequired || blockers.length > 0) state = "blocked";
        else if (!prerequisitesMet) state = "not_started";
        else if (missingEvidence.length === 0) state = "complete";
        else state = "ready";
        if (outcomeOverride.state) state = outcomeOverride.state;

        const dependencyNext = (substepDefinition.externalDependencies ?? [])
          .map((dependency) => effectiveDependency(dependency, input, evidence))
          .find((dependency) => dependency.state === "missing")?.nextAction;
        const evidenceNext = missingEvidence
          .map((key) => input.evidenceBlockers?.[key]?.nextAction)
          .find(Boolean);

        return {
          id: substepDefinition.id,
          label: substepDefinition.label,
          responsibleRole: substepDefinition.responsibleRole,
          state,
          applicable,
          requiredForStep,
          completionRule: substepDefinition.completionRule,
          missingEvidence,
          blockers: [...new Set(blockers)],
          nextAction: dependencyNext ?? evidenceNext ?? substepDefinition.nextAction,
        } satisfies RenewalSubstepProjection;
      });

      const required = substeps.filter(
        (substepProjection) =>
          substepProjection.applicable && substepProjection.requiredForStep,
      );
      let state: RenewalSubstepState;
      if (required.length > 0 && required.every((item) => item.state === "complete")) {
        state = "complete";
      } else if (required.some((item) => item.state === "blocked")) {
        state = "blocked";
      } else if (required.some((item) => item.state === "ready")) {
        state = "ready";
      } else {
        state = "not_started";
      }
      return {
        id: stepDefinition.id,
        title: stepDefinition.title,
        shortLabel: stepDefinition.shortLabel,
        responsibleRole: stepDefinition.responsibleRole,
        completionRule: stepDefinition.completionRule,
        state,
        substeps,
      } satisfies RenewalStepProjection;
    },
  );

  let status: RenewalProcessStatus = "active";
  if (migrationRequired) status = "migration_required";
  else if (input.tenantOutcome?.state === "counter_change_requested") {
    status = "counter_reopened";
  } else if (input.tenantOutcome?.state === "awaiting_response") {
    status = "waiting";
  } else if (input.tenantOutcome?.state === "needs_verification") {
    status = "needs_verification";
  } else if (input.tenantOutcome?.state === "declined_nonrenewing") {
    status = hasEvidence(evidence, "non-renewal-handoff", false)
      ? "non_renewal_handoff"
      : "non_renewal_handoff_required";
  } else if (
    input.tenantOutcome?.state === "accepted" &&
    input.complete === true &&
    hasEvidence(evidence, "app-completion", false) &&
    steps.every((step) => step.state === "complete")
  ) {
    status = "complete";
  }

  let currentStepIndex = steps.findIndex((step) => step.state !== "complete");
  if (currentStepIndex < 0) currentStepIndex = steps.length - 1;
  if (status === "counter_reopened") currentStepIndex = 1;
  if (
    status === "non_renewal_handoff" ||
    status === "non_renewal_handoff_required" ||
    status === "waiting" ||
    status === "needs_verification"
  ) {
    currentStepIndex = 2;
  }

  return {
    version: input.processVersion,
    definitionVersion: RENEWAL_PROCESS_VERSION,
    status,
    currentStepIndex,
    migrationRequired,
    ...(migrationRequired ? { migrationReason: migration.safeNextAction } : {}),
    steps,
  };
}

/** Required accepted-path evidence before the app may create its own completion receipt. */
export const RENEWAL_COMPLETION_REQUIREMENTS = Object.freeze(
  RENEWAL_PROCESS_DEFINITION.steps.flatMap((step) =>
    step.substeps
      .filter(
        (candidate) =>
          candidate.requiredForStep !== false &&
          candidate.branch !== "declined_only" &&
          !candidate.requiredEvidence.includes("app-completion"),
      )
      .flatMap((candidate) =>
        candidate.requiredEvidence.map((key) =>
          Object.freeze({
            key,
            allowNotApplicable: candidate.allowNotApplicable === true,
          }),
        ),
      ),
  ),
);

/** Compatibility view used by callers that need only the stable ordered evidence keys. */
export const RENEWAL_COMPLETION_PREREQUISITES = Object.freeze(
  RENEWAL_COMPLETION_REQUIREMENTS.map((requirement) => requirement.key),
);

export function missingRenewalCompletionEvidence(
  evidenceInput: RenewalEvidenceMap,
  tenantOutcome: RenewalTenantOutcome | null,
): RenewalEvidenceKey[] {
  if (tenantOutcome?.state !== "accepted") return ["tenant-outcome"];
  const evidence = normalizeRenewalEvidenceMap(evidenceInput);
  const missing = new Set<RenewalEvidenceKey>();
  for (const requirement of RENEWAL_COMPLETION_REQUIREMENTS) {
    if (!hasEvidence(evidence, requirement.key, requirement.allowNotApplicable)) {
      missing.add(requirement.key);
    }
  }
  return [...missing];
}

const INVALIDATION_EDGES: Partial<
  Record<RenewalEvidenceKey, readonly RenewalEvidenceKey[]>
> = {
  "lease-identity": [
    "lease-end-date",
    "base-rent",
    "renewal-recipients",
    "market-evidence",
    "owner-decision",
    "tenant-offer-fact-lock",
    "packet-facts",
  ],
  "lease-end-date": [
    "owner-draft-receipt",
    "tenant-offer-fact-lock",
    "tenant-draft-receipt",
    "packet-facts",
    "term-dates",
  ],
  "base-rent": [
    "market-evidence-reviewed",
    "owner-decision",
    "tenant-offer-fact-lock",
    "tenant-draft-receipt",
    "packet-facts",
    "packet-snapshot",
  ],
  "source-conflicts-resolved": [
    "market-evidence-reviewed",
    "owner-draft-receipt",
    "owner-response",
    "owner-decision",
  ],
  "source-snapshot-current": [
    "market-evidence",
    "market-evidence-reviewed",
    "owner-draft-receipt",
    "owner-response",
    "owner-decision",
  ],
  "renewal-recipients": [
    "owner-draft-receipt",
    "owner-message-sent",
    "tenant-draft-receipt",
    "tenant-message-sent",
  ],
  "market-evidence": ["market-evidence-reviewed", "owner-draft-receipt"],
  "market-evidence-reviewed": ["owner-draft-receipt", "owner-message-sent"],
  // A human response is a new authoritative boundary. Copy/draft/send drift invalidates the
  // corresponding communication evidence, but cannot erase a separately recorded human response.
  "owner-copy-version": ["owner-draft-receipt", "owner-message-sent"],
  "owner-draft-receipt": ["owner-message-sent"],
  "owner-response": ["owner-decision"],
  "owner-decision": [
    "tenant-offer-fact-lock",
    "tenant-copy-version",
    "tenant-draft-receipt",
    "tenant-message-sent",
    "tenant-contact-state",
    "tenant-outcome",
    "packet-facts",
    "packet-snapshot",
  ],
  "tenant-offer-fact-lock": [
    "tenant-copy-version",
    "tenant-draft-receipt",
    "tenant-message-sent",
    "tenant-contact-state",
    "tenant-outcome",
    "packet-facts",
    "packet-snapshot",
  ],
  "tenant-recipients": [
    "tenant-draft-receipt",
    "tenant-message-sent",
    "tenant-contact-state",
    "tenant-outcome",
  ],
  "tenant-copy-version": [
    "tenant-draft-receipt",
    "tenant-message-sent",
    "tenant-contact-state",
    "tenant-outcome",
  ],
  "tenant-draft-receipt": [
    "tenant-message-sent",
    "tenant-contact-state",
    "tenant-outcome",
  ],
  "tenant-message-sent": ["tenant-contact-state", "tenant-outcome"],
  "tenant-contact-state": ["tenant-outcome"],
  "tenant-outcome": [
    "packet-facts",
    "packet-snapshot",
    "dotloop-packet-readback",
    "signer-roster",
    "signature-state",
    "signatures-complete",
    "final-documents",
    "app-completion",
  ],
  "packet-catalog-version": [
    "packet-facts",
    "packet-snapshot",
    "dotloop-packet-readback",
    "signer-roster",
    "signature-state",
    "signatures-complete",
    "final-documents",
    "app-completion",
  ],
  "packet-facts": [
    "packet-snapshot",
    "dotloop-packet-readback",
    "signer-roster",
    "signature-state",
    "signatures-complete",
    "final-documents",
    "app-completion",
  ],
  "packet-snapshot": [
    "dotloop-packet-readback",
    "signer-roster",
    "signature-state",
    "current-packet-version",
    "signatures-complete",
    "final-documents",
    "app-completion",
  ],
  "dotloop-packet-readback": [
    "signature-state",
    "signatures-complete",
    "final-documents",
    "app-completion",
  ],
  "signer-roster": [
    "signature-state",
    "signatures-complete",
    "final-documents",
    "app-completion",
  ],
  "signature-state": ["signatures-complete", "final-documents", "app-completion"],
  "current-packet-version": ["signatures-complete", "final-documents", "app-completion"],
  "signatures-complete": ["final-documents", "app-completion"],
  "final-documents": [
    "animal-compliance",
    "deposit-compliance",
    "insurance-and-charges",
    "inspection-compliance",
    "term-dates",
    "compliance-exceptions",
    "app-completion",
  ],
  "animal-compliance": ["app-completion"],
  "deposit-compliance": ["app-completion"],
  "insurance-and-charges": ["app-completion"],
  "inspection-compliance": ["app-completion"],
  "term-dates": ["app-completion"],
  "compliance-exceptions": ["app-completion"],
};

export function renewalEvidenceInvalidatedBy(
  changedKey: RenewalEvidenceKey,
): RenewalEvidenceKey[] {
  const invalidated = new Set<RenewalEvidenceKey>();
  const queue = [...(INVALIDATION_EDGES[changedKey] ?? [])];
  while (queue.length > 0) {
    const key = queue.shift()!;
    if (key === changedKey || invalidated.has(key)) continue;
    invalidated.add(key);
    queue.push(...(INVALIDATION_EDGES[key] ?? []));
  }
  return [...invalidated];
}

export function replaceRenewalEvidence(
  currentInput: RenewalEvidenceMap,
  key: RenewalEvidenceKey,
  referenceInput: RenewalEvidenceReference,
): { evidence: RenewalEvidenceMap; invalidated: RenewalEvidenceKey[] } {
  const current = normalizeRenewalEvidenceMap(currentInput);
  const reference = buildRenewalEvidenceReference(referenceInput);
  const previous = current[key];
  if (previous && sameEvidenceIdentity(previous, reference)) {
    return {
      evidence: { ...current, [key]: reference },
      invalidated: [],
    };
  }
  const invalidated = renewalEvidenceInvalidatedBy(key);
  const next = { ...current, [key]: reference };
  for (const invalidatedKey of invalidated) delete next[invalidatedKey];
  return { evidence: next, invalidated };
}

/**
 * Remove current evidence and every exact transitive dependent. This is used when a live read proves
 * that formerly recorded evidence is now missing or unusable; absence cannot preserve stale progress.
 */
export function removeRenewalEvidence(
  currentInput: RenewalEvidenceMap,
  key: RenewalEvidenceKey,
): { evidence: RenewalEvidenceMap; invalidated: RenewalEvidenceKey[] } {
  const current = normalizeRenewalEvidenceMap(currentInput);
  const invalidated = renewalEvidenceInvalidatedBy(key);
  const next = { ...current };
  delete next[key];
  for (const invalidatedKey of invalidated) delete next[invalidatedKey];
  return { evidence: next, invalidated };
}

function sameEvidenceIdentity(
  left: RenewalEvidenceReference,
  right: RenewalEvidenceReference,
): boolean {
  return (
    left.ref === right.ref &&
    left.source === right.source &&
    left.disposition === right.disposition &&
    left.fingerprint === right.fingerprint &&
    left.reason === right.reason
  );
}
