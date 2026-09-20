import { z } from "zod";

/**
 * S133 (F13): external maintenance-agent handoff assessment.
 *
 * A bounded discovery protocol, not an integration. Nothing here reads a vendor, opens a
 * connection, mints a key or changes Maintenance behavior. The module gives the decision packet
 * (`docs/evidence/s133-external-maintenance-agent-handoff-assessment-2026-09-20.md`) a typed shape
 * so tests can prove it stays honest: a transcript remark or marketing claim never becomes a
 * supported capability, a missing input is named rather than guessed, identity joins need stable
 * verified ids or an explicit human step, and an ambiguous create is never presented as retryable.
 */

/** The transcript label for the vendor's agent. Kept verbatim until owner material resolves it. */
export const EXTERNAL_AGENT_TRANSCRIPT_LABEL = "Rue";

export const EVIDENCE_SOURCE_KINDS = [
  "owner_material",
  "vendor_primary_documentation",
  "authorized_readonly_read",
  "repository_code",
  "transcript",
  "none",
] as const;
export type EvidenceSourceKind = (typeof EVIDENCE_SOURCE_KINDS)[number];

/** Sources that can support a conclusion. A transcript remark or an absent source cannot. */
export const SUPPORTING_SOURCE_KINDS: readonly EvidenceSourceKind[] = [
  "owner_material",
  "vendor_primary_documentation",
  "authorized_readonly_read",
  "repository_code",
];

export const EVIDENCE_CONCLUSIONS = [
  "supported",
  "unsupported",
  "inconclusive",
  "not_established",
] as const;
export type EvidenceConclusion = (typeof EVIDENCE_CONCLUSIONS)[number];

export const EVIDENCE_CONCLUSION_LABELS: Record<EvidenceConclusion, string> = {
  supported: "Supported",
  unsupported: "Unsupported",
  inconclusive: "Inconclusive",
  not_established: "Not established",
};

const bounded = (max: number) => z.string().trim().min(1).max(max);

/** One evidence row. A claim is supported only by a supporting source; a gap names its owner input. */
export const AssessmentEvidenceRowSchema = z
  .object({
    id: z.string().regex(/^E-[A-Z0-9-]{2,24}$/),
    claim: bounded(300),
    sourceKind: z.enum(EVIDENCE_SOURCE_KINDS),
    /** A repository path, a document title supplied by the owner, or "none". Never a guessed URL. */
    sourceRef: bounded(200),
    conclusion: z.enum(EVIDENCE_CONCLUSIONS),
    /** Required when not established: the exact input and who supplies it. */
    requestedInput: bounded(300).nullable(),
    requestedFrom: z
      .enum(["owner", "vendor_account_administrator", "maintenance_owner"])
      .nullable(),
  })
  .strict()
  .superRefine((row, ctx) => {
    if (
      row.conclusion === "supported" &&
      !SUPPORTING_SOURCE_KINDS.includes(row.sourceKind)
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${row.id}: a ${row.sourceKind} source cannot support a conclusion.`,
      });
    if (
      row.conclusion === "not_established" &&
      (!row.requestedInput || !row.requestedFrom)
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${row.id}: a not-established row names the exact requested input and who supplies it.`,
      });
    if (/https?:\/\//i.test(row.sourceRef))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${row.id}: cite owner-supplied material by title, never a guessed address.`,
      });
  });
export type AssessmentEvidenceRow = z.infer<typeof AssessmentEvidenceRowSchema>;

/* ------------------------------------------------------------------------------------------------
 * Capability matrix (R-F13-02)
 * ---------------------------------------------------------------------------------------------- */

export const INTERFACE_KINDS = [
  "api",
  "documented_webhook",
  "export_import",
  "verified_deep_link",
  "human_handoff",
] as const;
export type InterfaceKind = (typeof INTERFACE_KINDS)[number];

export const INTERFACE_KIND_LABELS: Record<InterfaceKind, string> = {
  api: "API",
  documented_webhook: "Documented webhook",
  export_import: "Export or import",
  verified_deep_link: "Verified deep link",
  human_handoff: "Human handoff",
};

export const CapabilityMatrixRowSchema = z
  .object({
    interfaceKind: z.enum(INTERFACE_KINDS),
    /** Which party the row describes. */
    system: z.enum(["pmi_kc", "external_agent"]),
    capability: bounded(200),
    direction: z.enum(["read", "write", "event", "link", "manual"]),
    /** True only when a supporting source demonstrated it; a claim never sets it. */
    demonstrated: z.boolean(),
    evidenceId: z.string().regex(/^E-[A-Z0-9-]{2,24}$/),
    /** Documented effect of the operation, including a consequential read. */
    effect: bounded(200),
    unknowns: z.array(bounded(160)).max(12),
  })
  .strict();
export type CapabilityMatrixRow = z.infer<typeof CapabilityMatrixRowSchema>;

/**
 * Validate the matrix against its evidence: a demonstrated capability needs a supported row from a
 * supporting source; an external write or event claim without primary documentation stays
 * undemonstrated with its unknowns listed.
 */
export function validateCapabilityMatrix(
  rows: readonly CapabilityMatrixRow[],
  evidence: readonly AssessmentEvidenceRow[],
): readonly string[] {
  const byId = new Map(evidence.map((row) => [row.id, row]));
  const problems: string[] = [];
  for (const row of rows) {
    const source = byId.get(row.evidenceId);
    if (!source) {
      problems.push(`${row.capability}: cites unknown evidence ${row.evidenceId}.`);
      continue;
    }
    if (row.demonstrated && source.conclusion !== "supported")
      problems.push(`${row.capability}: demonstrated without a supported evidence row.`);
    if (row.demonstrated && !SUPPORTING_SOURCE_KINDS.includes(source.sourceKind))
      problems.push(`${row.capability}: demonstrated on a ${source.sourceKind} source.`);
    if (
      row.system === "external_agent" &&
      (row.direction === "write" || row.direction === "event") &&
      source.sourceKind !== "vendor_primary_documentation" &&
      row.demonstrated
    )
      problems.push(
        `${row.capability}: an external write or event needs primary documentation.`,
      );
    if (!row.demonstrated && row.unknowns.length === 0)
      problems.push(
        `${row.capability}: an undemonstrated capability lists what is unknown.`,
      );
  }
  return problems;
}

/* ------------------------------------------------------------------------------------------------
 * Ownership map (R-F13-03)
 * ---------------------------------------------------------------------------------------------- */

export const WORKFLOW_BOUNDARIES = [
  "receive_request_or_call",
  "gather_facts",
  "troubleshoot",
  "create_work_order",
  "decide_escalation",
  "authorize_spend_or_vendor",
  "contact_resident",
  "resolve_or_reopen",
  "own_status_of_record",
] as const;
export type WorkflowBoundary = (typeof WORKFLOW_BOUNDARIES)[number];

export const WORKFLOW_BOUNDARY_LABELS: Record<WorkflowBoundary, string> = {
  receive_request_or_call: "Receive the request or call",
  gather_facts: "Gather facts",
  troubleshoot: "Troubleshoot",
  create_work_order: "Create the work order",
  decide_escalation: "Decide escalation",
  authorize_spend_or_vendor: "Authorize spend or vendor assignment",
  contact_resident: "Contact the resident",
  resolve_or_reopen: "Resolve or reopen",
  own_status_of_record: "Own the status of record",
};

export const OwnershipRowSchema = z
  .object({
    boundary: z.enum(WORKFLOW_BOUNDARIES),
    /** Who does it in PMI KC or RentVine today, with the owning code or contract. */
    pmiKcOwner: bounded(120),
    pmiKcEvidence: bounded(200),
    /** What the transcript or owner material says the external agent does; a claim until sourced. */
    externalAgentClaim: bounded(200).nullable(),
    externalAgentEvidence: z.enum(EVIDENCE_CONCLUSIONS),
    /** True when the PMI application may perform this boundary's effect only through an exact confirmed key. */
    pmiEffectGated: z.boolean(),
  })
  .strict();
export type OwnershipRow = z.infer<typeof OwnershipRowSchema>;

export interface OwnershipAssessment {
  readonly decisionItems: readonly string[];
  readonly duplicateRisks: readonly string[];
  readonly unownedFailures: readonly string[];
}

/** Derive decision items from the map. Missing or double ownership becomes a decision, never a default. */
export function assessOwnership(rows: readonly OwnershipRow[]): OwnershipAssessment {
  const decisionItems: string[] = [];
  const duplicateRisks: string[] = [];
  const unownedFailures: string[] = [];
  const seen = new Set<WorkflowBoundary>();
  for (const row of rows) {
    seen.add(row.boundary);
    const label = WORKFLOW_BOUNDARY_LABELS[row.boundary];
    if (row.externalAgentClaim && row.externalAgentEvidence !== "supported")
      decisionItems.push(
        `${label}: the external agent's role is a ${EVIDENCE_CONCLUSION_LABELS[row.externalAgentEvidence].toLowerCase()} claim; the owner decides who owns it before any handoff.`,
      );
    if (row.externalAgentClaim && row.externalAgentEvidence === "supported")
      duplicateRisks.push(
        `${label}: both PMI KC (${row.pmiKcOwner}) and the external agent act here; without a single owner this duplicates tickets or communications.`,
      );
    if (
      (row.boundary === "resolve_or_reopen" || row.boundary === "own_status_of_record") &&
      row.externalAgentClaim
    )
      unownedFailures.push(
        `${label}: a failure between two status owners has no reconciler until the owner names one.`,
      );
  }
  for (const boundary of WORKFLOW_BOUNDARIES)
    if (!seen.has(boundary))
      decisionItems.push(
        `${WORKFLOW_BOUNDARY_LABELS[boundary]}: no owner is mapped; decide before any handoff.`,
      );
  return { decisionItems, duplicateRisks, unownedFailures };
}

/** External autonomy never becomes PMI KC authority: these effects stay behind their exact keys. */
export const PMI_EFFECTS_NEVER_DELEGATED = [
  "send to a resident or owner",
  "approve cost",
  "assign a vendor",
  "create a work order",
  "close or reopen a ticket",
] as const;

/* ------------------------------------------------------------------------------------------------
 * Minimal data and identity join (R-F13-04)
 * ---------------------------------------------------------------------------------------------- */

/** The only fields a handoff record may carry; everything else is dropped before it leaves. */
export const MINIMAL_HANDOFF_FIELDS = [
  "property_id",
  "unit_id",
  "lease_id",
  "work_order_id",
  "issue_summary",
  "urgency",
  "reported_at",
  "contact_role",
  "contact_channel_ref",
  "provenance",
] as const;
export type MinimalHandoffField = (typeof MINIMAL_HANDOFF_FIELDS)[number];

const SECRET_OR_RAW_PATTERN =
  /token|secret|password|api[_-]?key|credential|message_body|transcript|recording|ssn|card/i;

export interface MinimizedHandoff {
  readonly record: Readonly<Partial<Record<MinimalHandoffField, string>>>;
  readonly dropped: readonly string[];
  readonly refused: readonly string[];
}

/** Keep only the allowlist; refuse secrets and raw communications by name rather than passing them. */
export function minimizeHandoffRecord(
  input: Readonly<Record<string, unknown>>,
): MinimizedHandoff {
  const record: Partial<Record<MinimalHandoffField, string>> = {};
  const dropped: string[] = [];
  const refused: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (SECRET_OR_RAW_PATTERN.test(key)) {
      refused.push(key);
      continue;
    }
    if (!MINIMAL_HANDOFF_FIELDS.includes(key as MinimalHandoffField)) {
      dropped.push(key);
      continue;
    }
    if (typeof value === "string" && value.trim())
      record[key as MinimalHandoffField] = value.trim();
  }
  return { record, dropped, refused };
}

export interface IdentityJoinCandidate {
  /** Stable ids from the system of record; null when the external side supplies none. */
  readonly propertyId: string | null;
  readonly unitId: string | null;
  readonly workOrderId: string | null;
  /** Free-text matches only; never sufficient on their own. */
  readonly nameMatches: number;
  readonly addressMatches: number;
  /** A person explicitly associated this record through the existing link preview and confirmation. */
  readonly humanAssociationConfirmed: boolean;
}

export type IdentityJoinResult =
  | { readonly state: "joined"; readonly basis: "stable_ids" | "human_association" }
  | { readonly state: "ambiguous"; readonly reason: string }
  | { readonly state: "unjoined"; readonly reason: string };

const STABLE_ID = /^[1-9][0-9]*$/;

/**
 * Join only on stable verified ids or an explicit human association. Two similar units or duplicate
 * resident names read ambiguous; a name or address alone never joins.
 */
export function joinIdentity(candidate: IdentityJoinCandidate): IdentityJoinResult {
  if (candidate.humanAssociationConfirmed)
    return { state: "joined", basis: "human_association" };
  const ids = [candidate.propertyId, candidate.unitId].filter(
    (id): id is string => typeof id === "string" && STABLE_ID.test(id),
  );
  if (ids.length === 2) return { state: "joined", basis: "stable_ids" };
  if (candidate.addressMatches > 1 || candidate.nameMatches > 1)
    return {
      state: "ambiguous",
      reason:
        "More than one unit or resident matches by text; a person must associate the record through the existing link preview.",
    };
  return {
    state: "unjoined",
    reason:
      "No stable property and unit ids; a name or address match alone never joins a maintenance record.",
  };
}

/** Reads whose documented behavior changes provider state; each is labeled wherever it appears. */
export const STATEFUL_READS: readonly {
  readonly key: string;
  readonly effect: string;
}[] = [
  {
    key: "rentvine.work_order.chat.sync",
    effect:
      "Retrieving work-order chat marks the retrieved messages read for managers; treated as a consequential read behind its exact key.",
  },
];

/* ------------------------------------------------------------------------------------------------
 * Failure and double-action risks (R-F13-05)
 * ---------------------------------------------------------------------------------------------- */

export const ASSESSMENT_SCENARIOS = [
  "ordinary_ticket",
  "escalation",
  "duplicate_delivery",
  "two_similar_units",
  "missing_resident_contact",
  "vendor_outage",
  "revoked_access",
  "uncertain_handoff",
] as const;
export type AssessmentScenario = (typeof ASSESSMENT_SCENARIOS)[number];

export const FailureScenarioRowSchema = z
  .object({
    scenario: z.enum(ASSESSMENT_SCENARIOS),
    /** What PMI KC does today, with its owning code; a known behavior, not a hope. */
    pmiKcBehavior: bounded(300),
    /** Either an exact known recovery or an explicit unresolved limit on the external side. */
    externalRecovery: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("known"),
          behavior: bounded(300),
          evidenceId: z.string(),
        })
        .strict(),
      z.object({ kind: z.literal("unresolved"), limit: bounded(300) }).strict(),
    ]),
    /** What would prove receipt of a handoff and who reconciles doubt. */
    receiptProof: bounded(200),
    reconciler: bounded(120),
  })
  .strict();
export type FailureScenarioRow = z.infer<typeof FailureScenarioRowSchema>;

export type RetryDisposition =
  | "reconcile_first"
  | "safe_to_retry"
  | "stop_and_name_input";

/** An ambiguous create is never a blind retry; only a refused, undispatched attempt is. */
export function retryDisposition(input: {
  readonly dispatched: "no" | "yes" | "unknown";
  readonly effectKind: "create" | "read" | "link" | "none";
}): RetryDisposition {
  if (input.dispatched === "no") return "safe_to_retry";
  if (input.effectKind === "read" || input.effectKind === "none") return "safe_to_retry";
  if (input.dispatched === "unknown") return "reconcile_first";
  return "stop_and_name_input";
}

/* ------------------------------------------------------------------------------------------------
 * Decision packet (R-F13-06)
 * ---------------------------------------------------------------------------------------------- */

export const HandoffOptionSchema = z
  .object({
    id: z.enum(["manual_link_only", "read_only_import", "governed_write_or_event"]),
    label: bounded(80),
    description: bounded(400),
    /** Evidence rows that must be supported before the option is anything but conditional. */
    conditionalOn: z
      .array(z.string().regex(/^E-[A-Z0-9-]{2,24}$/))
      .min(1)
      .max(12),
  })
  .strict();
export type HandoffOption = z.infer<typeof HandoffOptionSchema>;

export interface DecisionPacket {
  readonly identityEstablished: boolean;
  readonly feasibility: "not_established" | "established" | "ruled_out";
  readonly options: readonly {
    readonly id: HandoffOption["id"];
    readonly label: string;
    readonly status: "conditional" | "viable" | "ruled_out";
    readonly waitingOn: readonly string[];
  }[];
  /** The one decision the owner makes before a later integration spec. */
  readonly ownerDecision: string;
  readonly requestedInputs: readonly { readonly from: string; readonly input: string }[];
}

export const IDENTITY_EVIDENCE_IDS = [
  "E-ID-VENDOR",
  "E-ID-ACCOUNT",
  "E-ID-ACCESS",
] as const;

/** Build the packet from evidence and options. Unsupported evidence keeps every option conditional. */
export function buildDecisionPacket(
  evidence: readonly AssessmentEvidenceRow[],
  options: readonly HandoffOption[],
): DecisionPacket {
  const byId = new Map(evidence.map((row) => [row.id, row]));
  const identityRows = IDENTITY_EVIDENCE_IDS.map((id) => byId.get(id));
  const identityEstablished = identityRows.every(
    (row) => row?.conclusion === "supported",
  );
  const projected = options.map((option) => {
    const waitingOn = option.conditionalOn.filter(
      (id) => byId.get(id)?.conclusion !== "supported",
    );
    const ruledOut = option.conditionalOn.some(
      (id) => byId.get(id)?.conclusion === "unsupported",
    );
    return {
      id: option.id,
      label: option.label,
      status: ruledOut
        ? ("ruled_out" as const)
        : waitingOn.length
          ? ("conditional" as const)
          : ("viable" as const),
      waitingOn,
    };
  });
  const feasibility: DecisionPacket["feasibility"] = !identityEstablished
    ? "not_established"
    : projected.some((option) => option.status === "viable")
      ? "established"
      : projected.every((option) => option.status === "ruled_out")
        ? "ruled_out"
        : "not_established";
  const requestedInputs = evidence
    .filter(
      (row) =>
        row.conclusion === "not_established" && row.requestedInput && row.requestedFrom,
    )
    .map((row) => ({ from: row.requestedFrom!, input: row.requestedInput! }));
  return {
    identityEstablished,
    feasibility,
    options: projected,
    ownerDecision:
      "Confirm the vendor, product and account identity and supply the primary interface documentation and read-only access scope; then choose whether the handoff is manual and link-only, read-only, or an exact separately governed write or event interface.",
    requestedInputs,
  };
}

/** Existing checks the preservation gate (AC-S133-7) runs unchanged. */
export const PRESERVATION_EVIDENCE = [
  "tests/unit/maintenance-ai-boundary.test.ts",
  "tests/unit/maintenance-execution-authority.test.ts",
  "tests/unit/maintenance-execution-matrix.test.ts",
  "tests/unit/maintenance-match-unit-route.test.ts",
  "tests/firestore/s108-property-preapprovals.test.ts",
  "tests/firestore/s109-intake-triage-handoff.test.ts",
  "tests/firestore/maintenance-intake.rules.test.ts",
] as const;

/* ------------------------------------------------------------------------------------------------
 * Packet parsing: keeps the markdown honest against this contract
 * ---------------------------------------------------------------------------------------------- */

function parseTable(markdown: string, header: string): string[][] {
  const rows: string[][] = [];
  let inTable = false;
  for (const line of markdown.split("\n")) {
    const normalized = line.replace(/\s+/g, " ");
    if (normalized.startsWith(header)) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    if (!line.startsWith("|")) break;
    if (/^\|\s*-+/.test(line)) continue;
    rows.push(
      line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim().replace(/^`|`$/g, "")),
    );
  }
  if (rows.length === 0) throw new Error(`The packet has no table starting "${header}".`);
  return rows;
}

const CONCLUSION_BY_LABEL = new Map(
  EVIDENCE_CONCLUSIONS.map((conclusion) => [
    EVIDENCE_CONCLUSION_LABELS[conclusion],
    conclusion,
  ]),
);
const SOURCE_KIND_BY_LABEL = new Map<string, EvidenceSourceKind>([
  ["Owner material", "owner_material"],
  ["Vendor primary documentation", "vendor_primary_documentation"],
  ["Authorized read-only read", "authorized_readonly_read"],
  ["Repository code", "repository_code"],
  ["Transcript", "transcript"],
  ["None", "none"],
]);
const REQUESTED_FROM_BY_LABEL = new Map<string, AssessmentEvidenceRow["requestedFrom"]>([
  ["owner", "owner"],
  ["vendor account administrator", "vendor_account_administrator"],
  ["maintenance owner", "maintenance_owner"],
  ["-", null],
]);

/** Parse the packet's evidence table: `| Id | Claim | Source kind | Source | Conclusion | Requested input | From |`. */
export function parseEvidenceTable(markdown: string): readonly AssessmentEvidenceRow[] {
  return parseTable(markdown, "| Id | Claim |").map((cells) => {
    if (cells.length !== 7)
      throw new Error(`Evidence row ${cells[0] ?? "?"} needs seven columns.`);
    const [id, claim, sourceKindLabel, sourceRef, conclusionLabel, requestedInput, from] =
      cells;
    const sourceKind = SOURCE_KIND_BY_LABEL.get(sourceKindLabel);
    const conclusion = CONCLUSION_BY_LABEL.get(conclusionLabel);
    if (!sourceKind)
      throw new Error(`Evidence row ${id}: unknown source kind "${sourceKindLabel}".`);
    if (!conclusion)
      throw new Error(`Evidence row ${id}: unknown conclusion "${conclusionLabel}".`);
    if (!REQUESTED_FROM_BY_LABEL.has(from))
      throw new Error(`Evidence row ${id}: unknown requester "${from}".`);
    return AssessmentEvidenceRowSchema.parse({
      id,
      claim,
      sourceKind,
      sourceRef,
      conclusion,
      requestedInput: requestedInput === "-" ? null : requestedInput,
      requestedFrom: REQUESTED_FROM_BY_LABEL.get(from) ?? null,
    });
  });
}

/** Parse the options table: `| Option | Status | Conditional on | ... |`. */
export function parseOptionsTable(markdown: string): readonly {
  readonly id: HandoffOption["id"];
  readonly status: string;
  readonly conditionalOn: readonly string[];
}[] {
  const ids = new Map<string, HandoffOption["id"]>([
    ["A", "manual_link_only"],
    ["B", "read_only_import"],
    ["C", "governed_write_or_event"],
  ]);
  return parseTable(markdown, "| Option | Status |").map((cells) => {
    const id = ids.get(cells[0].charAt(0));
    if (!id) throw new Error(`Unknown option "${cells[0]}".`);
    return {
      id,
      status: cells[1],
      conditionalOn: cells[2]
        .split(",")
        .map((ref) => ref.trim())
        .filter(Boolean),
    };
  });
}
