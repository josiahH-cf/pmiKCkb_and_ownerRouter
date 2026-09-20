import { z } from "zod";

/**
 * S132 (F12): end-to-end walkthrough preparation and meeting evidence.
 *
 * Everything here is preparation and observation bookkeeping for a human meeting. Nothing in this
 * module reads a provider, writes app state, schedules anything or grades a step on the person's
 * behalf. The runbook (`docs/products/renewal-meeting-walkthrough-runbook.md`) is the human-facing
 * artifact; this module gives it a typed shape so tests can prove the artifact stays honest:
 * unrun steps stay Not run, missing inputs stay named, and a technical pass never becomes a human
 * verdict.
 */

export const MEETING_CHECK_STATES = [
  "verified",
  "failed",
  "pending_external_input",
  "not_run",
] as const;
export type MeetingCheckState = (typeof MEETING_CHECK_STATES)[number];

export const MEETING_CHECK_STATE_LABELS: Record<MeetingCheckState, string> = {
  verified: "Verified",
  failed: "Failed",
  pending_external_input: "Pending external input",
  not_run: "Not run",
};

export const MEETING_PREFLIGHT_CHECK_IDS = [
  "code_identity",
  "operator_access",
  "source_availability",
  "all_lease_discoverability",
  "sheet_writeback_pause",
  "approved_templates_resources",
  "managed_mailbox",
  "dotloop_selection_keys",
] as const;
export type MeetingPreflightCheckId = (typeof MEETING_PREFLIGHT_CHECK_IDS)[number];

/** Live steps of the walkthrough that a preflight check can hold back. Preparation steps never depend on one. */
export const LIVE_WALKTHROUGH_STEPS = [
  "record_owner_terms",
  "record_tenant_response",
  "unsent_owner_draft",
  "unsent_tenant_draft",
  "dotloop_packet_preview",
  "exact_source_update",
] as const;
export type LiveWalkthroughStep = (typeof LIVE_WALKTHROUGH_STEPS)[number];

export interface MeetingPreflightCheckDefinition {
  readonly id: MeetingPreflightCheckId;
  readonly label: string;
  /** How the facilitator gathers the evidence without an effect. */
  readonly effectFreeSource: string;
  /** Live steps that stay unavailable until this check is verified. */
  readonly holds: readonly LiveWalkthroughStep[];
}

export const MEETING_PREFLIGHT_CHECKS: readonly MeetingPreflightCheckDefinition[] = [
  {
    id: "code_identity",
    label: "Current code and release identity",
    effectFreeSource:
      "git rev-parse HEAD in the checkout and the serving revision named in docs/status.md; no deploy or readback is performed.",
    holds: [],
  },
  {
    id: "operator_access",
    label: "Operator access for the demonstrating staff",
    effectFreeSource:
      "Sign-in on the served origin with the assigned role; the Renewals heading or an honest source-unavailable state must render.",
    holds: ["record_owner_terms", "record_tenant_response"],
  },
  {
    id: "source_availability",
    label: "Data-source availability and freshness",
    effectFreeSource:
      "The desk's returned source freshness after Refresh source facts; a read-only refresh with no write.",
    holds: ["record_owner_terms", "record_tenant_response", "exact_source_update"],
  },
  {
    id: "all_lease_discoverability",
    label: "Every current lease discoverable on the desk",
    effectFreeSource:
      "The renewal table with the date, owner and tenant filters cleared, compared against the source lease count.",
    holds: [],
  },
  {
    id: "sheet_writeback_pause",
    label: "Operating Sheet write-back paused (F08)",
    effectFreeSource:
      "LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED reads false on the served revision; Sheet updates stay preview-only.",
    holds: ["exact_source_update"],
  },
  {
    id: "approved_templates_resources",
    label: "Approved templates and resource links",
    effectFreeSource:
      "Connections page: each Renewal resource link is a reviewed location or a labeled blank; Admin intake manifest for the seven families.",
    holds: ["dotloop_packet_preview"],
  },
  {
    id: "managed_mailbox",
    label: "Managed mailbox connected for the signed-in sender",
    effectFreeSource:
      "Connections page mailbox state and the message preparation preflight; no draft is created to check it.",
    holds: ["unsent_owner_draft", "unsent_tenant_draft"],
  },
  {
    id: "dotloop_selection_keys",
    label: "Dotloop selection and action keys",
    effectFreeSource:
      "Connections page Dotloop readiness (profile, template, transaction type, initial status) and the action registry; keys are expected closed.",
    holds: ["dotloop_packet_preview"],
  },
];

export interface MeetingCheckEvidence {
  readonly state: Exclude<MeetingCheckState, "not_run">;
  /** Where the evidence lives, never the evidence bytes themselves. */
  readonly evidence: string;
  readonly observedAtIso: string;
}

export type MeetingPreflightEvidence = Partial<
  Record<MeetingPreflightCheckId, MeetingCheckEvidence | null>
>;

export interface MeetingPreflightItem {
  readonly id: MeetingPreflightCheckId;
  readonly label: string;
  readonly state: MeetingCheckState;
  readonly stateLabel: string;
  readonly evidence: string | null;
  readonly observedAtIso: string | null;
  readonly effectFreeSource: string;
}

export interface MeetingPreflight {
  readonly generatedAtIso: string;
  readonly items: readonly MeetingPreflightItem[];
  readonly counts: Readonly<Record<MeetingCheckState, number>>;
  /** Live steps that cannot run yet, each with the checks holding it. */
  readonly heldLiveSteps: readonly {
    readonly step: LiveWalkthroughStep;
    readonly heldBy: readonly MeetingPreflightCheckId[];
  }[];
  /** Always true: inspection, navigation and preparation never depend on a live check. */
  readonly preparationWalkthroughSupported: true;
  readonly summary: string;
}

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

/**
 * Project the preflight from supplied evidence. Missing evidence is Not run, never assumed. The
 * projection performs no read of its own, so calling it can never refresh a provider.
 */
export function projectMeetingPreflight(
  evidence: MeetingPreflightEvidence,
  generatedAtIso: string,
): MeetingPreflight {
  if (!ISO_TIMESTAMP.test(generatedAtIso))
    throw new Error("The preflight needs an exact UTC timestamp.");
  const items = MEETING_PREFLIGHT_CHECKS.map((check): MeetingPreflightItem => {
    const supplied = evidence[check.id] ?? null;
    if (!supplied)
      return {
        id: check.id,
        label: check.label,
        state: "not_run",
        stateLabel: MEETING_CHECK_STATE_LABELS.not_run,
        evidence: null,
        observedAtIso: null,
        effectFreeSource: check.effectFreeSource,
      };
    const suppliedState: string = supplied.state;
    if (
      !MEETING_CHECK_STATES.includes(suppliedState as MeetingCheckState) ||
      suppliedState === "not_run"
    )
      throw new Error(`Check ${check.id} carries an unknown state.`);
    if (!ISO_TIMESTAMP.test(supplied.observedAtIso))
      throw new Error(`Check ${check.id} needs the time its evidence was observed.`);
    if (!supplied.evidence.trim())
      throw new Error(`Check ${check.id} needs an evidence location.`);
    return {
      id: check.id,
      label: check.label,
      state: supplied.state,
      stateLabel: MEETING_CHECK_STATE_LABELS[supplied.state],
      evidence: supplied.evidence.trim(),
      observedAtIso: supplied.observedAtIso,
      effectFreeSource: check.effectFreeSource,
    };
  });
  const counts = Object.fromEntries(
    MEETING_CHECK_STATES.map((state) => [
      state,
      items.filter((item) => item.state === state).length,
    ]),
  ) as Record<MeetingCheckState, number>;
  const heldLiveSteps = LIVE_WALKTHROUGH_STEPS.map((step) => ({
    step,
    heldBy: MEETING_PREFLIGHT_CHECKS.filter(
      (check) =>
        check.holds.includes(step) &&
        items.find((item) => item.id === check.id)?.state !== "verified",
    ).map((check) => check.id),
  })).filter((entry) => entry.heldBy.length > 0);
  const summary =
    heldLiveSteps.length === 0
      ? "Every live step has verified inputs. Each still needs the person's exact confirmation at the meeting."
      : `Preparation and inspection proceed. ${heldLiveSteps.length} live step${
          heldLiveSteps.length === 1 ? "" : "s"
        } cannot run yet: ${heldLiveSteps.map((entry) => entry.step.replace(/_/g, " ")).join(", ")}.`;
  return {
    generatedAtIso,
    items,
    counts,
    heldLiveSteps,
    preparationWalkthroughSupported: true,
    summary,
  };
}

/* ------------------------------------------------------------------------------------------------
 * Case matrix (R-F12-01)
 * ---------------------------------------------------------------------------------------------- */

export const PENDING_SELECTION = "Pending selection";

/** A private reference is a pointer into approved private storage, never a customer value. */
const PRIVATE_REFERENCE = /^private:[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/;

const CUSTOMER_IDENTIFIER_PATTERNS: readonly {
  readonly name: string;
  readonly test: RegExp;
}[] = [
  { name: "email address", test: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
  { name: "phone number", test: /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/ },
  {
    name: "lease or unit number",
    test: /\b(?:lease|unit|tenant|owner|account)\s*(?:#|id|no\.?|number)?\s*[:#]?\s*\d{3,}\b/i,
  },
  {
    name: "street address",
    test: /\b\d{2,6}\s+(?:[A-Z][a-z]+\s+){1,3}(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Blvd|Ct|Court|Way|Pl|Place|Ter|Terrace)\b\.?/,
  },
  { name: "dollar amount", test: /\$\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?\b/ },
];

/** Names every customer-identifier pattern the text carries; empty when it reads as generic. */
export function findCustomerIdentifiers(text: string): readonly string[] {
  return CUSTOMER_IDENTIFIER_PATTERNS.filter((pattern) => pattern.test.test(text)).map(
    (pattern) => pattern.name,
  );
}

export const WalkthroughCaseSchema = z
  .object({
    slot: z.enum(["ordinary_renewal", "policy_related"]),
    /** Pointer to approved private storage, or null while the team has not selected the lease. */
    privateReference: z.string().regex(PRIVATE_REFERENCE).nullable(),
    sourceReadNeeds: z.array(z.string().trim().min(1).max(200)).max(12),
    currentCycle: z.enum(["unknown", "fresh", "underway", "advanced_date", "next_cycle"]),
    missingInputs: z.array(z.string().trim().min(1).max(200)).max(20),
    participantRole: z.enum(["Editor", "Approver", "Admin", "unknown"]),
    intendedOutcome: z.string().trim().min(1).max(400),
    observationOnlySteps: z.array(z.string().trim().min(1).max(120)).max(30),
  })
  .strict()
  .superRefine((entry, ctx) => {
    for (const text of [
      entry.intendedOutcome,
      ...entry.sourceReadNeeds,
      ...entry.missingInputs,
    ]) {
      const found = findCustomerIdentifiers(text);
      if (found.length)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Case text must stay generic; it carries a ${found.join(" and ")}.`,
        });
    }
  });
export type WalkthroughCase = z.infer<typeof WalkthroughCaseSchema>;

/** The unselected matrix the runbook starts from: nothing about the customer is invented. */
export function emptyCaseMatrix(): readonly WalkthroughCase[] {
  return [
    {
      slot: "ordinary_renewal",
      privateReference: null,
      sourceReadNeeds: [
        "RentVine lease, parties and rent",
        "Operating Sheet row association",
        "Retained comps for the property",
      ],
      currentCycle: "unknown",
      missingInputs: ["Team-selected lease", "Owner terms as actually communicated"],
      participantRole: "unknown",
      intendedOutcome:
        "Walk the ordinary renewal from facts to prepared messages and a recorded outcome, observing each control.",
      observationOnlySteps: [],
    },
    {
      slot: "policy_related",
      privateReference: null,
      sourceReadNeeds: [
        "RentVine lease and parties",
        "Approved policy material state",
        "Applicable policy facts",
      ],
      currentCycle: "unknown",
      missingInputs: ["Team-selected lease", "Approved policy material"],
      participantRole: "unknown",
      intendedOutcome:
        "Show how a policy-related lease reads while material is pending, then how the same lease reads once material is approved.",
      observationOnlySteps: [],
    },
  ];
}

export function caseReferenceLabel(entry: WalkthroughCase): string {
  return entry.privateReference ?? PENDING_SELECTION;
}

/** Bind an authorized private reference. Customer values are refused; only a storage pointer binds. */
export function bindPrivateReference(
  entry: WalkthroughCase,
  reference: string,
): WalkthroughCase {
  const trimmed = reference.trim();
  const found = findCustomerIdentifiers(trimmed);
  if (found.length)
    throw new Error(
      `A private reference is a storage pointer; this looks like a ${found[0]}.`,
    );
  if (!PRIVATE_REFERENCE.test(trimmed))
    throw new Error(
      "A private reference reads private:<label> and names approved storage.",
    );
  return WalkthroughCaseSchema.parse({ ...entry, privateReference: trimmed });
}

/* ------------------------------------------------------------------------------------------------
 * Side-by-side script (R-F12-03)
 * ---------------------------------------------------------------------------------------------- */

export const MEETING_QUESTION = "Meeting question";

export const WALKTHROUGH_EFFECTS = [
  "none",
  "app_record",
  "unsent_draft",
  "exact_confirmed_effect",
] as const;
export type WalkthroughEffect = (typeof WALKTHROUGH_EFFECTS)[number];

export interface WalkthroughScriptRow {
  readonly step: string;
  /** The team's manual step as they described it, or Meeting question when staff still explain it. */
  readonly manualStep: string;
  readonly manualStepIsQuestion: boolean;
  /** The control cell with emphasis removed, for display. */
  readonly control: string;
  /** Each bold control name in the cell; every one must be an exact operator-guide control. */
  readonly controls: readonly string[];
  /** Guide step numbers this row exercises; each must exist in the operator guide's step-to-control map. */
  readonly guideSteps: readonly string[];
  readonly requiredInput: string;
  readonly expectedOutput: string;
  readonly evidenceType: string;
  readonly permittedEffect: WalkthroughEffect;
  readonly safeRecovery: string;
}

export interface WalkthroughScript {
  readonly rows: readonly WalkthroughScriptRow[];
  readonly meetingQuestions: readonly {
    readonly step: string;
    readonly control: string;
  }[];
  readonly guideStepsReferenced: readonly string[];
}

const SCRIPT_HEADER = "| Step | Manual step today";

/**
 * Parse the runbook's side-by-side table. The parser is strict on shape so a row cannot silently
 * lose its effect or recovery column; it does not check the guide, the caller does.
 */
export function parseWalkthroughScript(markdown: string): WalkthroughScript {
  const rows: WalkthroughScriptRow[] = [];
  let inTable = false;
  for (const line of markdown.split("\n")) {
    if (line.startsWith(SCRIPT_HEADER)) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    if (!line.startsWith("|")) break;
    if (/^\|\s*-+/.test(line)) continue;
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length !== 9)
      throw new Error(`Script row ${cells[0] ?? "?"} needs nine columns.`);
    const [
      step,
      manualStep,
      control,
      guideRef,
      requiredInput,
      expected,
      evidence,
      effect,
      recovery,
    ] = cells;
    if (!WALKTHROUGH_EFFECTS.includes(effect as WalkthroughEffect))
      throw new Error(`Script row ${step} names an unknown effect: ${effect}.`);
    const guideSteps = guideRef
      .split(",")
      .map((ref) => ref.trim())
      .filter(Boolean);
    if (guideSteps.length === 0 || guideSteps.some((ref) => !/^\d+$/.test(ref)))
      throw new Error(`Script row ${step} must cite guide step numbers.`);
    if (!recovery.trim()) throw new Error(`Script row ${step} needs a safe recovery.`);
    rows.push({
      step,
      manualStep,
      manualStepIsQuestion: manualStep.startsWith(MEETING_QUESTION),
      control: control.replace(/\*\*/g, ""),
      controls: [...control.matchAll(/\*\*([^*]+)\*\*/g)].map((match) => match[1].trim()),
      guideSteps,
      requiredInput,
      expectedOutput: expected,
      evidenceType: evidence,
      permittedEffect: effect as WalkthroughEffect,
      safeRecovery: recovery,
    });
  }
  if (rows.length === 0) throw new Error("The runbook has no side-by-side script table.");
  return {
    rows,
    meetingQuestions: rows
      .filter((row) => row.manualStepIsQuestion)
      .map((row) => ({ step: row.step, control: row.control })),
    guideStepsReferenced: [...new Set(rows.flatMap((row) => row.guideSteps))].sort(
      (a, b) => Number(a) - Number(b),
    ),
  };
}

/* ------------------------------------------------------------------------------------------------
 * Safe meeting branches (R-F12-05)
 * ---------------------------------------------------------------------------------------------- */

export interface SafeMeetingBranch {
  readonly id:
    | "no_template"
    | "no_mailbox"
    | "no_policy"
    | "source_read_failed"
    | "provider_unavailable";
  readonly trigger: string;
  /** What the facilitator does instead; always inspection, preparation or a manual handoff. */
  readonly branch: string;
  /** Guide steps that stay available on this branch. */
  readonly guideSteps: readonly string[];
}

export const SAFE_MEETING_BRANCHES: readonly SafeMeetingBranch[] = [
  {
    id: "no_template",
    trigger:
      "A required form family reads Pending materials or the packet reports an unavailable artifact.",
    branch:
      "Show Current facts for this packet and the family readiness on the Admin intake manifest; hand the packet to the manual Dotloop process with the worksheet. Do not preview or create a Dotloop packet.",
    guideSteps: ["28", "71"],
  },
  {
    id: "no_mailbox",
    trigger: "The signed-in sender has no connected managed mailbox.",
    branch:
      "Prepare the message, review the preflight, copy the formatted body and recipients, and send from the team's own mail client as today. No draft is created.",
    guideSteps: ["21", "22", "24", "52", "69"],
  },
  {
    id: "no_policy",
    trigger: "Policy material for the policy-related case is not approved.",
    branch:
      "Show the policy content panel reading Pending approved material and the message gate it adds; record the question for the owner. Do not approve material during the meeting.",
    guideSteps: ["10", "70"],
  },
  {
    id: "source_read_failed",
    trigger: "RentVine or the operating Sheet is unavailable or stale at the meeting.",
    branch:
      "Show the honest source-unavailable state and the returned freshness; inspect the last read facts; record no outcome that depends on the missing read.",
    guideSteps: ["1", "5", "13"],
  },
  {
    id: "provider_unavailable",
    trigger: "Dotloop is not connected, has no selection, or its action keys are closed.",
    branch:
      "Reload document readiness, show the exact gates that hold the packet, and hand off to the manual signing process. Nothing is marked complete.",
    guideSteps: ["28", "30"],
  },
];

/** Actions no branch may take to complete a demonstration. */
export const FORBIDDEN_MEETING_SHORTCUTS = [
  "mark complete for demo",
  "fake signature",
  "copied customer",
  "live proof replay",
  "seed production",
  "advance production renewal",
] as const;

/* ------------------------------------------------------------------------------------------------
 * Observation ledger (R-F12-06, R-F12-08)
 * ---------------------------------------------------------------------------------------------- */

export const OBSERVATION_OUTCOMES = ["pass", "fail", "not_run"] as const;
export type ObservationOutcome = (typeof OBSERVATION_OUTCOMES)[number];

export const ObservationEntrySchema = z
  .object({
    step: z.string().trim().min(1).max(16),
    caseSlot: z.enum(["ordinary_renewal", "policy_related"]),
    privateReference: z.string().regex(PRIVATE_REFERENCE).nullable(),
    actualStep: z.string().trim().min(1).max(300),
    expected: z.string().trim().min(1).max(400),
    observed: z.string().trim().max(600).nullable(),
    actor: z.string().trim().max(80).nullable(),
    timeIso: z.string().regex(ISO_TIMESTAMP).nullable(),
    evidenceLocation: z.string().trim().max(200).nullable(),
    outcome: z.enum(OBSERVATION_OUTCOMES),
    issueOwner: z.string().trim().max(80).nullable(),
    nextAction: z.string().trim().max(300).nullable(),
    dependency: z.string().trim().max(200).nullable(),
  })
  .strict()
  .superRefine((entry, ctx) => {
    if (entry.outcome === "not_run") {
      if (entry.observed !== null || entry.timeIso !== null || entry.actor !== null)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "An unrun step carries no observation, actor or time.",
        });
      return;
    }
    if (!entry.observed || !entry.actor || !entry.timeIso)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A recorded step names what was observed, by whom and when.",
      });
    if (entry.outcome === "fail" && (!entry.issueOwner || !entry.nextAction))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A failed step names its issue owner and next action.",
      });
    for (const text of [entry.observed ?? "", entry.nextAction ?? ""]) {
      const found = findCustomerIdentifiers(text);
      if (found.length)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Ledger text must stay generic; it carries a ${found.join(" and ")}. Put the detail in private evidence and cite its location.`,
        });
    }
  });
export type ObservationEntry = z.infer<typeof ObservationEntrySchema>;

export const ObservationLedgerSchema = z
  .object({
    schemaVersion: z.literal("meeting-observation-ledger/v1"),
    /** Set only by a person after a consented recording exists; never minted here. */
    recordingLocation: z.string().trim().max(200).nullable(),
    entries: z.array(ObservationEntrySchema).max(200),
    interruptedAfterStep: z.string().trim().max(16).nullable(),
  })
  .strict();
export type ObservationLedger = z.infer<typeof ObservationLedgerSchema>;

function entryKey(entry: Pick<ObservationEntry, "caseSlot" | "step">): string {
  return `${entry.caseSlot}:${entry.step}`;
}

/** A ledger with every script step for the case unrun: no pass, no recording link. */
export function emptyObservationLedger(
  script: WalkthroughScript,
  caseSlot: ObservationEntry["caseSlot"],
): ObservationLedger {
  return ObservationLedgerSchema.parse({
    schemaVersion: "meeting-observation-ledger/v1",
    recordingLocation: null,
    interruptedAfterStep: null,
    entries: script.rows.map((row) => ({
      step: row.step,
      caseSlot,
      privateReference: null,
      actualStep: row.control,
      expected: row.expectedOutput,
      observed: null,
      actor: null,
      timeIso: null,
      evidenceLocation: null,
      outcome: "not_run",
      issueOwner: null,
      nextAction: null,
      dependency: null,
    })),
  });
}

/** Record one step. Other steps are untouched, so a failed step never hides a later safe one. */
export function recordObservation(
  ledger: ObservationLedger,
  entry: ObservationEntry,
): ObservationLedger {
  const parsed = ObservationEntrySchema.parse(entry);
  const key = entryKey(parsed);
  if (!ledger.entries.some((existing) => entryKey(existing) === key))
    throw new Error(`Step ${parsed.step} is not on the script for this case.`);
  return ObservationLedgerSchema.parse({
    ...ledger,
    entries: ledger.entries.map((existing) =>
      entryKey(existing) === key ? parsed : existing,
    ),
  });
}

/** Mark where a session stopped. Recorded results stay; nothing is reset. */
export function interruptSession(
  ledger: ObservationLedger,
  afterStep: string,
): ObservationLedger {
  if (!ledger.entries.some((entry) => entry.step === afterStep))
    throw new Error(`Step ${afterStep} is not on this ledger.`);
  return ObservationLedgerSchema.parse({ ...ledger, interruptedAfterStep: afterStep });
}

/**
 * Resume a paused session from its last recorded step. Prior results are carried unchanged; steps
 * the script gained since are appended unrun; steps it lost are kept as history.
 */
export function resumeSession(
  prior: ObservationLedger,
  script: WalkthroughScript,
  caseSlot: ObservationEntry["caseSlot"],
): { readonly ledger: ObservationLedger; readonly nextStep: string | null } {
  const fresh = emptyObservationLedger(script, caseSlot);
  const known = new Set(prior.entries.map(entryKey));
  const ledger = ObservationLedgerSchema.parse({
    ...prior,
    interruptedAfterStep: null,
    entries: [
      ...prior.entries,
      ...fresh.entries.filter((entry) => !known.has(entryKey(entry))),
    ],
  });
  const next = ledger.entries.find((entry) => entry.outcome === "not_run");
  return { ledger, nextStep: next?.step ?? null };
}

export interface LedgerSummary {
  readonly counts: Readonly<Record<ObservationOutcome, number>>;
  /** pass only when every step passed; fail when any failed; otherwise not_run. */
  readonly sessionVerdict: ObservationOutcome;
  readonly humanVerdictLabel: string;
}

export function summarizeLedger(ledger: ObservationLedger): LedgerSummary {
  const counts = Object.fromEntries(
    OBSERVATION_OUTCOMES.map((outcome) => [
      outcome,
      ledger.entries.filter((entry) => entry.outcome === outcome).length,
    ]),
  ) as Record<ObservationOutcome, number>;
  const sessionVerdict: ObservationOutcome =
    counts.fail > 0
      ? "fail"
      : counts.not_run > 0 || ledger.entries.length === 0
        ? "not_run"
        : "pass";
  return {
    counts,
    sessionVerdict,
    humanVerdictLabel:
      sessionVerdict === "pass"
        ? "PASS, observed by staff"
        : sessionVerdict === "fail"
          ? "FAIL, with owners and next actions recorded"
          : "NOT RUN, no human observer",
  };
}

/* ------------------------------------------------------------------------------------------------
 * Post-meeting documentation (R-F12-07)
 * ---------------------------------------------------------------------------------------------- */

export interface ObservationImport {
  /** Steps staff confirmed, ready to describe in the generic guide. */
  readonly confirmedProcedure: readonly {
    readonly step: string;
    readonly control: string;
    readonly observed: string;
  }[];
  /** Steps that failed or were not run stay open questions. */
  readonly openQuestions: readonly {
    readonly step: string;
    readonly control: string;
    readonly reason: string;
  }[];
  /** True only when every step passed. */
  readonly fullWorkflowPassed: boolean;
  readonly customerIdentifiersFound: readonly string[];
}

/** Separate confirmed procedure from open questions; refuse customer identifiers for the generic guide. */
export function importObservations(ledger: ObservationLedger): ObservationImport {
  const parsed = ObservationLedgerSchema.parse(ledger);
  const confirmedProcedure = parsed.entries
    .filter((entry) => entry.outcome === "pass")
    .map((entry) => ({
      step: entry.step,
      control: entry.actualStep,
      observed: entry.observed ?? "",
    }));
  const openQuestions = parsed.entries
    .filter((entry) => entry.outcome !== "pass")
    .map((entry) => ({
      step: entry.step,
      control: entry.actualStep,
      reason:
        entry.outcome === "fail"
          ? `Failed: ${entry.nextAction ?? "next action pending"}`
          : "Not run at the meeting.",
    }));
  const customerIdentifiersFound = [
    ...new Set(
      parsed.entries.flatMap((entry) =>
        findCustomerIdentifiers(
          [entry.observed, entry.nextAction, entry.evidenceLocation]
            .filter(Boolean)
            .join(" "),
        ),
      ),
    ),
  ];
  return {
    confirmedProcedure,
    openQuestions,
    fullWorkflowPassed: parsed.entries.length > 0 && openQuestions.length === 0,
    customerIdentifiersFound,
  };
}

/** Wording the generic guide may carry after an import; the claim is scoped to what passed. */
export function genericGuideClaim(imported: ObservationImport): string {
  if (imported.customerIdentifiersFound.length)
    throw new Error(
      `The generic guide cannot carry a ${imported.customerIdentifiersFound.join(" or ")}; cite private evidence instead.`,
    );
  if (imported.confirmedProcedure.length === 0)
    return "No step has been validated by staff yet; the runbook stays Draft for validation.";
  return imported.fullWorkflowPassed
    ? `Staff validated all ${imported.confirmedProcedure.length} scripted steps.`
    : `Staff validated ${imported.confirmedProcedure.length} scripted steps; ${imported.openQuestions.length} remain open questions.`;
}

/* ------------------------------------------------------------------------------------------------
 * Session planning (R-F12-08)
 * ---------------------------------------------------------------------------------------------- */

export const MEETING_SESSION_PLANNING = {
  approximateMinutes: 90,
  enforcedByApp: false,
  scheduledByApp: false,
  /** The transcript's proposed date is planning context only; nothing here creates an event. */
  proposedDateIsPlanningContextOnly: true,
} as const;

/* ------------------------------------------------------------------------------------------------
 * Technical result ledger (R-F12-04)
 * ---------------------------------------------------------------------------------------------- */

export interface TechnicalResultRow {
  readonly scenario: string;
  readonly owner: string;
  readonly tests: readonly string[];
  readonly providerCalls: string;
  readonly persistence: string;
  readonly failureRecovery: string;
  /** Always Not run: the engineering row never grades the real lease or the person. */
  readonly selectedLease: "Not run";
  readonly humanVerdict: "Not run";
}

const NOT_RUN = "Not run" as const;

export const TECHNICAL_RESULT_LEDGER: readonly TechnicalResultRow[] = [
  {
    scenario: "Fresh renewal from first read to recorded outcome",
    owner: "lib/lease-renewal/live-desk.ts; app/api/lease-renewal/sheet-route",
    tests: [
      "tests/firestore/s113-sheet-route.test.ts",
      "tests/unit/s113-manual-controls.test.tsx",
    ],
    providerCalls: "0 live; deterministic adapters return fixture reads",
    persistence: "Firestore emulator activity and cycle, read back before display",
    failureRecovery:
      "Refused write reads back unchanged; the control names the missing input",
    selectedLease: NOT_RUN,
    humanVerdict: NOT_RUN,
  },
  {
    scenario: "Underway renewal resumes on its recorded cycle",
    owner: "lib/firestore/lease-renewal-cycles.ts",
    tests: [
      "tests/firestore/s123-cycle-store.test.ts",
      "tests/firestore/s113-sheet-route.test.ts",
    ],
    providerCalls: "0 live",
    persistence: "Emulator cycle record; later reads return the same cycle",
    failureRecovery: "A competing save loses on revision and is reported, not merged",
    selectedLease: NOT_RUN,
    humanVerdict: NOT_RUN,
  },
  {
    scenario: "Date advancement and source date notices",
    owner: "lib/lease-renewal/cycle-source-date.ts; lib/lease-renewal/date-display.ts",
    tests: [
      "tests/unit/s123-cycle-source-date.test.ts",
      "tests/unit/s126-date-display.test.ts",
    ],
    providerCalls: "0",
    persistence: "None; projection over the read facts",
    failureRecovery: "An unknown date stays unknown and is labeled",
    selectedLease: NOT_RUN,
    humanVerdict: NOT_RUN,
  },
  {
    scenario: "Non-renewal: tenant decline and lifecycle category",
    owner: "lib/lease-renewal/lifecycle.ts",
    tests: [
      "tests/unit/s105-renewal-lifecycle.test.ts",
      "tests/unit/renewal-tenant-outcome-control.test.tsx",
      "tests/unit/s134-lifecycle-category.test.ts",
    ],
    providerCalls: "0",
    persistence: "App-owned recorded response only",
    failureRecovery: "A decline records the response; nothing is sent or advanced",
    selectedLease: NOT_RUN,
    humanVerdict: NOT_RUN,
  },
  {
    scenario: "Missing templates: packet blocked by an unavailable artifact",
    owner: "lib/lease-documents/packet-truth.ts; lib/lease-documents/artifact-intake.ts",
    tests: [
      "tests/unit/lease-document-packet-truth.test.ts",
      "tests/unit/s130-intake-checkpoints-local.test.ts",
    ],
    providerCalls: "0",
    persistence: "Intake manifest in the emulator; catalog read back",
    failureRecovery: "Blocker names the family; manual handoff stays available",
    selectedLease: NOT_RUN,
    humanVerdict: NOT_RUN,
  },
  {
    scenario: "Policy materials absent: message gate and Pending approved material",
    owner: "lib/lease-renewal/policy-content.ts; lib/lease-renewal/message-preflight.ts",
    tests: [
      "tests/unit/s131-policy-content.test.ts",
      "tests/unit/s129-message-preflight.test.ts",
    ],
    providerCalls: "0",
    persistence: "None; projection over the material snapshot",
    failureRecovery: "Unknown applicability stays unknown; final copy waits",
    selectedLease: NOT_RUN,
    humanVerdict: NOT_RUN,
  },
  {
    scenario: "Read failures: source unavailable and refresh refused",
    owner: "lib/lease-renewal/live-lease-cache.ts; app/api/lease-renewal/refresh",
    tests: [
      "tests/unit/live-lease-cache.test.ts",
      "tests/unit/lease-renewal-refresh-route.test.ts",
      "tests/unit/lease-renewal-writeback-safety.test.ts",
    ],
    providerCalls: "0 live; failing adapter injected",
    persistence: "Last good read retained with its freshness",
    failureRecovery: "Honest unavailable state; no write on a failed read",
    selectedLease: NOT_RUN,
    humanVerdict: NOT_RUN,
  },
  {
    scenario: "Stale snapshots: packet and post-write freshness",
    owner: "lib/firestore/lease-document-packet-snapshots.ts",
    tests: [
      "tests/firestore/lease-document-packet-snapshots.test.ts",
      "tests/unit/renewal-post-write-freshness.test.ts",
    ],
    providerCalls: "0",
    persistence: "Emulator snapshot head with expected-revision saves",
    failureRecovery: "A stale head is refused and the current one is shown",
    selectedLease: NOT_RUN,
    humanVerdict: NOT_RUN,
  },
  {
    scenario: "Duplicate confirmation of one exact effect",
    owner: "lib/firestore/lease-renewal-writeback-execution-store.ts",
    tests: [
      "tests/firestore/lease-renewal-writeback-execution-store.test.ts",
      "tests/firestore/s97-renewal-writeback-lifecycle.test.ts",
    ],
    providerCalls: "0 live; adapter counts attempts",
    persistence:
      "One attempt record per confirmation; the second confirmation reads the first",
    failureRecovery:
      "Ambiguous dispatch reconciles from provider state, never retries blindly",
    selectedLease: NOT_RUN,
    humanVerdict: NOT_RUN,
  },
  {
    scenario: "Interrupted work: draft attempt and connection recovery",
    owner: "lib/execution/governed-draft-execution.ts; lib/firestore/s119-work-status.ts",
    tests: [
      "tests/unit/governed-draft-execution.test.ts",
      "tests/unit/s106-revocation-recovery.test.ts",
      "tests/firestore/s119-work-status-store.test.ts",
      "tests/unit/s129-draft-boundary.test.ts",
    ],
    providerCalls: "0 live",
    persistence: "Durable attempt and staff status survive reload",
    failureRecovery: "Recover the existing attempt; nothing is re-sent",
    selectedLease: NOT_RUN,
    humanVerdict: NOT_RUN,
  },
];

/** Existing checks the preservation gate (AC-S132-9) runs unchanged. */
export const PRESERVATION_CHECKS = [
  "npm run verify:copy-voice",
  "npm run verify:router-boundary",
  "npm run verify:redaction",
  "npm run check:budget-guard",
  "bash scripts/verify.sh",
  "npm run test:firestore",
  "npm run test:e2e:core",
] as const;
