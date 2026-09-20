import { z } from "zod";

import {
  currentStaffActivity,
  type ManualActivity,
  type RenewalWorkspaceState,
  type StaffActivityRecord,
} from "@/lib/lease-renewal/workspace-state";

/**
 * S131 (F11): Rhino-policy conditional logic, ready for approved material upload.
 *
 * This module is the one conditional policy projection. It models applicability as Unknown,
 * Applicable, Not applicable or Needs review over three inputs it never confuses: the staff-recorded
 * follow-up (an app-owned task record, never coverage), the legacy operating-Sheet column (evidence
 * only) and an approved material version whose typed declarative rule is evaluated over verified
 * facts. With no approved material it truthfully reads Pending approved policy material and names
 * the exact missing items. Nothing here invents wording, fees, premiums, coverage, deadlines or
 * legal effect: an output slot renders only the approved text with declared placeholders filled
 * from verified facts, and every result carries its version and content hash. Pure; no I/O.
 */

export const POLICY_CONTENT_SCHEMA_VERSION = "policy-material/v1" as const;
export const POLICY_PRODUCT_KEYS = ["rhino"] as const;
export type PolicyProductKey = (typeof POLICY_PRODUCT_KEYS)[number];
export const POLICY_PRODUCT_LABELS: Record<PolicyProductKey, string> = {
  rhino: "Rhino policy",
};
/** The existing conditional follow-up that staff use to identify a policy-related lease. */
export const POLICY_PRODUCT_ACTIVITY: Record<PolicyProductKey, ManualActivity> = {
  rhino: "rhino",
};
export const POLICY_OUTPUT_CHANNELS = [
  "owner_message",
  "tenant_message",
  "document_packet",
] as const;
export type PolicyOutputChannel = (typeof POLICY_OUTPUT_CHANNELS)[number];
export const POLICY_OUTPUT_CHANNEL_LABELS: Record<PolicyOutputChannel, string> = {
  owner_message: "Owner message wording",
  tenant_message: "Tenant message wording",
  document_packet: "Document packet section",
};

export const POLICY_MATERIAL_STATES = [
  "pending",
  "approved",
  "rejected",
  "superseded",
] as const;
export type PolicyMaterialState = (typeof POLICY_MATERIAL_STATES)[number];

const FACT_KEY = /^[a-z][a-z0-9_.]{0,80}$/;
const CONDITION_ID = /^[a-z][a-z0-9_]{0,40}$/;
const SLOT_ID = /^[a-z][a-z0-9_]{0,40}$/;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const PUBLICATION_REFERENCE = /^publication:[A-Za-z0-9-]{8,80}$/;
const CONTENT_HASH = /^[a-f0-9]{64}$/;
const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Executable or embedded content never belongs in approved material. */
const EXECUTABLE_CONTENT =
  /<\s*\/?\s*(script|iframe|object|embed|style|link|meta)\b|javascript:|data:text\/html|\$\{|<\?|\bon[a-z]+\s*=/i;
const PLACEHOLDER = /\{\{\s*([^{}]*?)\s*\}\}/g;

const bounded = (max: number) => z.string().trim().min(1).max(max);

export type PolicyCondition =
  | { readonly kind: "always" }
  | {
      readonly kind: "fact_equals";
      readonly factKey: string;
      readonly expectedValue: string | number | boolean;
    }
  | { readonly kind: "fact_present"; readonly factKey: string }
  | { readonly kind: "all_of"; readonly conditions: readonly PolicyCondition[] }
  | { readonly kind: "any_of"; readonly conditions: readonly PolicyCondition[] }
  | { readonly kind: "not"; readonly condition: PolicyCondition }
  | { readonly kind: "ref"; readonly conditionId: string };

export const PolicyConditionSchema: z.ZodType<PolicyCondition> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("always") }).strict(),
    z
      .object({
        kind: z.literal("fact_equals"),
        factKey: z.string().regex(FACT_KEY),
        expectedValue: z.union([z.string().max(200), z.number().finite(), z.boolean()]),
      })
      .strict(),
    z
      .object({ kind: z.literal("fact_present"), factKey: z.string().regex(FACT_KEY) })
      .strict(),
    z
      .object({
        kind: z.literal("all_of"),
        conditions: z.array(PolicyConditionSchema).min(1).max(12),
      })
      .strict(),
    z
      .object({
        kind: z.literal("any_of"),
        conditions: z.array(PolicyConditionSchema).min(1).max(12),
      })
      .strict(),
    z.object({ kind: z.literal("not"), condition: PolicyConditionSchema }).strict(),
    z
      .object({ kind: z.literal("ref"), conditionId: z.string().regex(CONDITION_ID) })
      .strict(),
  ]),
);

function referencedConditionIds(condition: PolicyCondition, into: string[] = []) {
  if (condition.kind === "ref") into.push(condition.conditionId);
  else if (condition.kind === "not") referencedConditionIds(condition.condition, into);
  else if (condition.kind === "all_of" || condition.kind === "any_of")
    for (const child of condition.conditions) referencedConditionIds(child, into);
  return into;
}

/** Depth-first reference walk; returns the first circular or unknown reference, if any. */
export function findConditionReferenceProblem(
  root: PolicyCondition,
  named: Readonly<Record<string, PolicyCondition>>,
): { kind: "circular" | "unknown"; conditionId: string } | null {
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (
    condition: PolicyCondition,
  ): { kind: "circular" | "unknown"; conditionId: string } | null => {
    for (const id of referencedConditionIds(condition)) {
      if (visiting.has(id)) return { kind: "circular", conditionId: id };
      if (done.has(id)) continue;
      const target = named[id];
      if (!target) return { kind: "unknown", conditionId: id };
      visiting.add(id);
      const problem = visit(target);
      if (problem) return problem;
      visiting.delete(id);
      done.add(id);
    }
    return null;
  };
  return visit(root);
}

export function slotPlaceholders(text: string): string[] {
  return Array.from(text.matchAll(PLACEHOLDER), (match) => match[1] ?? "");
}

export const PolicyMaterialConfigSchema = z
  .object({
    schemaVersion: z.literal(POLICY_CONTENT_SCHEMA_VERSION),
    productKey: z.enum(POLICY_PRODUCT_KEYS),
    version: z.string().regex(VERSION),
    /** A citation naming the approved material; never the material itself. */
    reference: bounded(240),
    /** The S21 trusted publication that holds the approved material, by id and content hash. */
    publicationSource: z
      .object({
        system: z.literal("s21_publication"),
        reference: z.string().regex(PUBLICATION_REFERENCE),
        contentHash: z.string().regex(CONTENT_HASH),
      })
      .strict(),
    /** Who reviewed the supplied material and when; a content review, not the app's approval step. */
    review: z
      .object({
        reviewer: bounded(120),
        reviewedAt: z.string().datetime({ offset: true }),
        note: bounded(500),
      })
      .strict(),
    effectiveFrom: z.string().regex(CALENDAR_DATE),
    effectiveUntil: z.string().regex(CALENDAR_DATE).optional(),
    applicability: z
      .object({ ruleVersion: bounded(64), condition: PolicyConditionSchema })
      .strict(),
    requiredInputs: z
      .array(
        z
          .object({
            factKey: z.string().regex(FACT_KEY),
            label: bounded(120),
            allowedSourceSystems: z.array(bounded(64)).min(1).max(8),
          })
          .strict(),
      )
      .max(24),
    outputSlots: z
      .array(
        z
          .object({
            slotId: z.string().regex(SLOT_ID),
            channel: z.enum(POLICY_OUTPUT_CHANNELS),
            /** Approved wording with `{{factKey}}` placeholders declared under requiredInputs. */
            text: bounded(2000),
          })
          .strict(),
      )
      .min(1)
      .max(12),
    conditions: z
      .record(z.string().regex(CONDITION_ID), PolicyConditionSchema)
      .default({}),
  })
  .strict()
  .superRefine((config, ctx) => {
    const texts: Array<[string, string]> = [
      ["reference", config.reference],
      ["review.note", config.review.note],
      ...config.requiredInputs.map(
        (input, index) =>
          [`requiredInputs.${index}.label`, input.label] as [string, string],
      ),
      ...config.outputSlots.map(
        (slot, index) => [`outputSlots.${index}.text`, slot.text] as [string, string],
      ),
    ];
    for (const [path, text] of texts)
      if (EXECUTABLE_CONTENT.test(text))
        ctx.addIssue({
          code: "custom",
          path: path.split("."),
          message: "Executable or embedded content is not allowed in approved material.",
        });
    const declared = new Set(config.requiredInputs.map((input) => input.factKey));
    if (declared.size !== config.requiredInputs.length)
      ctx.addIssue({
        code: "custom",
        path: ["requiredInputs"],
        message: "Each required input must be declared once.",
      });
    const slotIds = new Set(config.outputSlots.map((slot) => slot.slotId));
    if (slotIds.size !== config.outputSlots.length)
      ctx.addIssue({
        code: "custom",
        path: ["outputSlots"],
        message: "Each output slot needs a distinct id.",
      });
    config.outputSlots.forEach((slot, index) => {
      if ((slot.text.match(/\{\{/g) ?? []).length !== slotPlaceholders(slot.text).length)
        ctx.addIssue({
          code: "custom",
          path: ["outputSlots", index, "text"],
          message: "Every placeholder must be written as {{factKey}}.",
        });
      for (const key of slotPlaceholders(slot.text))
        if (!declared.has(key))
          ctx.addIssue({
            code: "custom",
            path: ["outputSlots", index, "text"],
            message: `Slot ${slot.slotId} uses the undeclared placeholder ${key || "(empty)"}.`,
          });
    });
    const problem = findConditionReferenceProblem(
      config.applicability.condition,
      config.conditions,
    );
    if (problem)
      ctx.addIssue({
        code: "custom",
        path: ["applicability", "condition"],
        message:
          problem.kind === "circular"
            ? `Condition reference ${problem.conditionId} is circular.`
            : `Condition reference ${problem.conditionId} is not declared.`,
      });
    for (const [id, condition] of Object.entries(config.conditions)) {
      const inner = findConditionReferenceProblem(condition, config.conditions);
      if (inner || referencedConditionIds(condition).includes(id))
        ctx.addIssue({
          code: "custom",
          path: ["conditions", id],
          message: `Condition ${id} references itself or an undeclared condition.`,
        });
    }
    if (config.effectiveUntil && config.effectiveUntil < config.effectiveFrom)
      ctx.addIssue({
        code: "custom",
        path: ["effectiveUntil"],
        message: "The material cannot end before it starts.",
      });
  });
export type PolicyMaterialConfig = z.infer<typeof PolicyMaterialConfigSchema>;

/** A verified fact the rule or a slot may consume; anything below Verified never substitutes. */
export interface PolicyFact {
  readonly factKey: string;
  readonly value: string | number | boolean;
  readonly displayValue: string;
  readonly source: { readonly system: string; readonly reference: string };
  readonly confidence: "Verified" | "Likely" | "Needs Review" | "Conflict";
}

export type PolicyMaterialSnapshot =
  | {
      readonly state: "approved";
      readonly active: PolicyMaterialConfig;
      readonly activeRevision: number;
      readonly pendingVersions: readonly string[];
    }
  | {
      readonly state: "none" | "pending_only" | "ambiguous" | "unreadable";
      readonly active: null;
      readonly activeRevision: null;
      readonly pendingVersions: readonly string[];
    };

export const MISSING_POLICY_MATERIAL: PolicyMaterialSnapshot = {
  state: "none",
  active: null,
  activeRevision: null,
  pendingVersions: [],
};

export interface ConditionEvaluation {
  readonly result: "include" | "exclude" | "unknown";
  /** Fact keys that were missing or not verified; empty unless the result is unknown. */
  readonly missingFactKeys: readonly string[];
  readonly reason: string;
}

function verifiedFact(facts: readonly PolicyFact[], factKey: string) {
  const fact = facts.find((entry) => entry.factKey === factKey);
  if (!fact) return { fact: null, state: "missing" as const };
  return fact.confidence === "Verified"
    ? { fact, state: "verified" as const }
    : { fact, state: "unverified" as const };
}

/** Evaluate a typed declarative condition; absence of a fact is never treated as evidence. */
export function evaluatePolicyCondition(
  condition: PolicyCondition,
  facts: readonly PolicyFact[],
  named: Readonly<Record<string, PolicyCondition>> = {},
  visiting: ReadonlySet<string> = new Set(),
): ConditionEvaluation {
  switch (condition.kind) {
    case "always":
      return { result: "include", missingFactKeys: [], reason: "always" };
    case "fact_present":
    case "fact_equals": {
      const { fact, state } = verifiedFact(facts, condition.factKey);
      if (state !== "verified" || !fact)
        return {
          result: "unknown",
          missingFactKeys: [condition.factKey],
          reason: state === "missing" ? "fact_missing" : "fact_unverified",
        };
      if (condition.kind === "fact_present")
        return { result: "include", missingFactKeys: [], reason: "fact_present" };
      return fact.value === condition.expectedValue
        ? { result: "include", missingFactKeys: [], reason: "fact_equals" }
        : { result: "exclude", missingFactKeys: [], reason: "fact_differs" };
    }
    case "not": {
      const inner = evaluatePolicyCondition(condition.condition, facts, named, visiting);
      return {
        result:
          inner.result === "include"
            ? "exclude"
            : inner.result === "exclude"
              ? "include"
              : "unknown",
        missingFactKeys: inner.missingFactKeys,
        reason: `not(${inner.reason})`,
      };
    }
    case "all_of":
    case "any_of": {
      const results = condition.conditions.map((child) =>
        evaluatePolicyCondition(child, facts, named, visiting),
      );
      const missing = Array.from(
        new Set(results.flatMap((entry) => entry.missingFactKeys)),
      );
      const decisive = condition.kind === "all_of" ? "exclude" : "include";
      if (results.some((entry) => entry.result === decisive))
        return {
          result: decisive,
          missingFactKeys: [],
          reason: `${condition.kind}_decided`,
        };
      if (results.some((entry) => entry.result === "unknown"))
        return {
          result: "unknown",
          missingFactKeys: missing,
          reason: `${condition.kind}_unknown`,
        };
      return {
        result: condition.kind === "all_of" ? "include" : "exclude",
        missingFactKeys: [],
        reason: `${condition.kind}_complete`,
      };
    }
    case "ref": {
      const target = named[condition.conditionId];
      if (!target || visiting.has(condition.conditionId))
        return {
          result: "unknown",
          missingFactKeys: [],
          reason: target ? "circular_reference" : "unknown_reference",
        };
      return evaluatePolicyCondition(
        target,
        facts,
        named,
        new Set([...visiting, condition.conditionId]),
      );
    }
  }
}

export type PolicyApplicabilityState =
  | "unknown"
  | "applicable"
  | "not_applicable"
  | "needs_review";
export type PolicyApplicabilityReason =
  | "pending_approved_material"
  | "material_unreadable"
  | "material_ambiguous"
  | "material_expired"
  | "material_not_yet_effective"
  | "staff_not_applicable"
  | "rule_include"
  | "rule_exclude"
  | "rule_needs_facts"
  | "conflicting_evidence";

export const POLICY_APPLICABILITY_LABELS: Record<PolicyApplicabilityState, string> = {
  unknown: "Unknown",
  applicable: "Applicable",
  not_applicable: "Not applicable",
  needs_review: "Needs review",
};

export type PolicyMissingItemDestination = "admin_intake" | "follow_up" | "verified_fact";
export interface PolicyMissingItem {
  readonly id: string;
  readonly label: string;
  readonly destination: PolicyMissingItemDestination;
  readonly factKey?: string;
}

export interface PolicyFollowUpEvidence {
  /** The staff-recorded task outcome; a recorded task, never a renewed policy or a claim. */
  readonly outcome: StaffActivityRecord["outcome"] | "not_recorded";
  readonly recordedAt: string | null;
  readonly source: string | null;
  readonly reason: string | null;
  readonly applicabilityPolicy: string | null;
}

export interface PolicyApplicability {
  readonly productKey: PolicyProductKey;
  readonly productLabel: string;
  readonly state: PolicyApplicabilityState;
  readonly stateLabel: string;
  readonly reason: PolicyApplicabilityReason;
  readonly label: string;
  readonly explanation: string;
  readonly source: {
    readonly origin: "staff_review" | "approved_rule" | "none";
    readonly reference: string | null;
  };
  readonly reviewer: string | null;
  readonly leaseId: string;
  readonly cycleId: string | null;
  readonly ruleVersion: string | null;
  readonly materialVersion: string | null;
  /** Staff identified this lease as policy-related through the existing follow-up control. */
  readonly identified: boolean;
  readonly followUp: PolicyFollowUpEvidence;
  readonly missingItems: readonly PolicyMissingItem[];
  /** Plain statements about evidence that proves nothing by itself. */
  readonly evidenceNotes: readonly string[];
  readonly pendingVersions: readonly string[];
}

export interface PolicyApplicabilityInput {
  readonly productKey: PolicyProductKey;
  readonly leaseId: string;
  readonly manualState: RenewalWorkspaceState | null | undefined;
  readonly material: PolicyMaterialSnapshot;
  readonly facts: readonly PolicyFact[];
  /** The legacy operating-Sheet column text, if the row was read; evidence only. */
  readonly sheetLegacyValue: string | null;
  readonly todayIso: string;
}

function followUpEvidence(
  productKey: PolicyProductKey,
  manualState: RenewalWorkspaceState | null | undefined,
): PolicyFollowUpEvidence {
  const record = manualState
    ? currentStaffActivity(manualState, POLICY_PRODUCT_ACTIVITY[productKey])
    : null;
  return record
    ? {
        outcome: record.outcome,
        recordedAt: record.recordedAt,
        source: record.source,
        reason: record.reason ?? null,
        applicabilityPolicy: record.applicabilityPolicy ?? null,
      }
    : {
        outcome: "not_recorded",
        recordedAt: null,
        source: null,
        reason: null,
        applicabilityPolicy: null,
      };
}

const MATERIAL_ITEMS: readonly PolicyMissingItem[] = [
  {
    id: "approved_material",
    label: "Approved policy material (published, reviewed and approved as one version)",
    destination: "admin_intake",
  },
  {
    id: "applicability_rule",
    label: "Applicability rule and required inputs inside that approved version",
    destination: "admin_intake",
  },
];

/** The one applicability projection the workspace panel and the message readiness both use. */
export function projectPolicyApplicability(
  input: PolicyApplicabilityInput,
): PolicyApplicability {
  const productLabel = POLICY_PRODUCT_LABELS[input.productKey];
  const followUp = followUpEvidence(input.productKey, input.manualState);
  const identified = followUp.outcome === "waiting" || followUp.outcome === "done";
  const staffNotApplicable =
    followUp.outcome === "not_applicable" &&
    Boolean(followUp.reason?.trim()) &&
    Boolean(followUp.applicabilityPolicy?.trim());
  const evidenceNotes: string[] = [];
  const legacy = input.sheetLegacyValue?.trim() ?? "";
  if (legacy)
    evidenceNotes.push(
      `The operating Sheet's legacy "${productLabel}" column reads "${legacy.slice(0, 40)}". That is evidence to review, not a confirmed policy, renewal or required wording.`,
    );
  if (followUp.outcome === "done")
    evidenceNotes.push(
      `Staff recorded the ${productLabel} follow-up as done. That records a task; it does not verify coverage or a renewed policy.`,
    );
  if (followUp.outcome === "waiting")
    evidenceNotes.push(`Staff recorded the ${productLabel} follow-up as waiting.`);
  const base = {
    productKey: input.productKey,
    productLabel,
    leaseId: input.leaseId,
    cycleId: input.manualState?.cycleId ?? null,
    identified,
    followUp,
    evidenceNotes,
    pendingVersions: input.material.pendingVersions,
  } as const;
  const staffResult = (): PolicyApplicability => ({
    ...base,
    state: "not_applicable",
    stateLabel: POLICY_APPLICABILITY_LABELS.not_applicable,
    reason: "staff_not_applicable",
    label: `${productLabel}: not applicable to this lease (staff review)`,
    explanation: `Staff recorded Not applicable citing ${followUp.applicabilityPolicy}. Only this conditional dependency is cleared; nothing else changes.`,
    source: { origin: "staff_review", reference: followUp.source },
    reviewer:
      input.manualState?.activities[POLICY_PRODUCT_ACTIVITY[input.productKey]]
        ?.actorUid ?? null,
    ruleVersion: null,
    materialVersion: null,
    missingItems: [],
  });
  const review = (
    reason: Extract<
      PolicyApplicabilityReason,
      | "material_unreadable"
      | "material_ambiguous"
      | "material_expired"
      | "material_not_yet_effective"
      | "conflicting_evidence"
    >,
    explanation: string,
    material: PolicyMaterialConfig | null,
  ): PolicyApplicability => ({
    ...base,
    state: "needs_review",
    stateLabel: POLICY_APPLICABILITY_LABELS.needs_review,
    reason,
    label: `${productLabel}: needs review`,
    explanation,
    source: {
      origin: material ? "approved_rule" : "none",
      reference: material ? material.reference : null,
    },
    reviewer: null,
    ruleVersion: material?.applicability.ruleVersion ?? null,
    materialVersion: material?.version ?? null,
    missingItems: material
      ? []
      : reason === "material_unreadable"
        ? []
        : [MATERIAL_ITEMS[0]],
  });

  const material = input.material;
  if (material.state === "unreadable")
    return review(
      "material_unreadable",
      "The approved policy material could not be read right now. Reload before relying on this state; nothing was assumed.",
      null,
    );
  if (material.state === "ambiguous")
    return review(
      "material_ambiguous",
      "More than one approved version is recorded, so no version is used. An approver must leave exactly one current version.",
      null,
    );
  if (material.state !== "approved") {
    if (staffNotApplicable) return staffResult();
    const missingItems: PolicyMissingItem[] = [...MATERIAL_ITEMS];
    if (identified)
      missingItems.push({
        id: "lease_applicability_review",
        label: `Applicability review for this lease once the ${productLabel} rule is approved`,
        destination: "follow_up",
      });
    return {
      ...base,
      state: "unknown",
      stateLabel: POLICY_APPLICABILITY_LABELS.unknown,
      reason: "pending_approved_material",
      label: `${productLabel}: pending approved policy material`,
      explanation:
        material.pendingVersions.length > 0
          ? `Material version${material.pendingVersions.length === 1 ? "" : "s"} ${material.pendingVersions.join(", ")} ${material.pendingVersions.length === 1 ? "is" : "are"} uploaded but not approved, so nothing is used. Unrelated renewal work continues as usual.`
          : "No approved policy material or applicability rule exists yet, so applicability cannot be determined for any lease. Unrelated renewal work continues as usual.",
      source: { origin: "none", reference: null },
      reviewer: null,
      ruleVersion: null,
      materialVersion: null,
      missingItems,
    };
  }
  const active = material.active;
  if (active.effectiveFrom > input.todayIso)
    return review(
      "material_not_yet_effective",
      `Approved version ${active.version} takes effect on ${active.effectiveFrom}; it is not used before then.`,
      active,
    );
  if (active.effectiveUntil && active.effectiveUntil < input.todayIso)
    return review(
      "material_expired",
      `Approved version ${active.version} ended on ${active.effectiveUntil}. Nothing is inferred from an expired version; an approver must supply a current one.`,
      active,
    );
  const evaluation = evaluatePolicyCondition(
    active.applicability.condition,
    input.facts,
    active.conditions,
  );
  if (staffNotApplicable && evaluation.result === "include")
    return review(
      "conflicting_evidence",
      `Staff recorded Not applicable, but the approved rule ${active.applicability.ruleVersion} includes this lease on verified facts. Resolve the conflict before any policy wording is used.`,
      active,
    );
  if (staffNotApplicable) return staffResult();
  const ruleBase = {
    ...base,
    source: { origin: "approved_rule" as const, reference: active.reference },
    reviewer: active.review.reviewer,
    ruleVersion: active.applicability.ruleVersion,
    materialVersion: active.version,
  };
  if (evaluation.result === "include") {
    const missingItems = missingVerifiedInputs(active, input.facts);
    return {
      ...ruleBase,
      state: "applicable",
      stateLabel: POLICY_APPLICABILITY_LABELS.applicable,
      reason: "rule_include",
      label: `${productLabel}: applicable (rule ${active.applicability.ruleVersion}, version ${active.version})`,
      explanation:
        missingItems.length === 0
          ? "The approved rule includes this lease on verified facts. Dependent wording uses only the approved version."
          : `The approved rule includes this lease. Dependent wording stays blocked until ${missingItems.length} verified input${missingItems.length === 1 ? "" : "s"} ${missingItems.length === 1 ? "is" : "are"} read from an allowed source.`,
      missingItems,
    };
  }
  if (evaluation.result === "exclude")
    return {
      ...ruleBase,
      state: "not_applicable",
      stateLabel: POLICY_APPLICABILITY_LABELS.not_applicable,
      reason: "rule_exclude",
      label: `${productLabel}: not applicable (rule ${active.applicability.ruleVersion}, version ${active.version})`,
      explanation:
        "The approved rule excludes this lease on verified facts. No policy wording is produced and nothing else is affected.",
      missingItems: [],
    };
  return {
    ...ruleBase,
    state: "unknown",
    stateLabel: POLICY_APPLICABILITY_LABELS.unknown,
    reason: "rule_needs_facts",
    label: `${productLabel}: unknown until ${evaluation.missingFactKeys.length} verified fact${evaluation.missingFactKeys.length === 1 ? "" : "s"} ${evaluation.missingFactKeys.length === 1 ? "is" : "are"} read`,
    explanation:
      "The approved rule needs verified facts that have not been read. Review the lease rather than assuming there is no policy; unrelated work continues.",
    missingItems: evaluation.missingFactKeys.map((factKey) => ({
      id: `fact:${factKey}`,
      label: `Verified fact ${factKey} (${active.requiredInputs.find((entry) => entry.factKey === factKey)?.label ?? "not declared as a required input"})`,
      destination: "verified_fact",
      factKey,
    })),
  };
}

function missingVerifiedInputs(
  material: PolicyMaterialConfig,
  facts: readonly PolicyFact[],
): PolicyMissingItem[] {
  return material.requiredInputs
    .filter((input) => {
      const { fact, state } = verifiedFact(facts, input.factKey);
      return (
        state !== "verified" ||
        !fact ||
        !input.allowedSourceSystems.includes(fact.source.system)
      );
    })
    .map((input) => ({
      id: `fact:${input.factKey}`,
      label: `Verified ${input.label} (${input.factKey}) from ${input.allowedSourceSystems.join(" or ")}`,
      destination: "verified_fact" as const,
      factKey: input.factKey,
    }));
}

export interface PolicyOutputEvidence {
  readonly productKey: PolicyProductKey;
  readonly version: string;
  readonly contentHash: string;
  readonly ruleVersion: string;
  readonly slotId: string;
  readonly factSources: ReadonlyArray<{
    factKey: string;
    system: string;
    reference: string;
  }>;
}

export type PolicyOutput =
  | {
      readonly state: "ready";
      readonly slotId: string;
      readonly text: string;
      readonly evidence: PolicyOutputEvidence;
    }
  | {
      readonly state: "omitted";
      readonly slotId: string | null;
      readonly reason: "not_applicable" | "no_slot_for_channel";
    }
  | {
      readonly state: "blocked";
      readonly slotId: string | null;
      readonly reason:
        | "no_material"
        | "unknown_applicability"
        | "needs_review"
        | "slot_unknown"
        | "missing_inputs";
      readonly missing: readonly PolicyMissingItem[];
      readonly explanation: string;
    };

/** Fill one approved slot with verified facts only; a missing amount, source or slot fails by name. */
export function preparePolicyOutput(input: {
  readonly material: PolicyMaterialConfig | null;
  readonly applicability: PolicyApplicability;
  readonly facts: readonly PolicyFact[];
  readonly slotId?: string;
  readonly channel?: PolicyOutputChannel;
}): PolicyOutput {
  const { applicability, material } = input;
  const slot = material
    ? input.slotId
      ? (material.outputSlots.find((entry) => entry.slotId === input.slotId) ?? null)
      : (material.outputSlots.find((entry) => entry.channel === input.channel) ?? null)
    : null;
  const slotId = slot?.slotId ?? input.slotId ?? null;
  if (applicability.state === "not_applicable")
    return { state: "omitted", slotId, reason: "not_applicable" };
  if (applicability.state === "needs_review")
    return {
      state: "blocked",
      slotId,
      reason: "needs_review",
      missing: applicability.missingItems,
      explanation: applicability.explanation,
    };
  if (!material || applicability.materialVersion !== material.version)
    return {
      state: "blocked",
      slotId,
      reason: "no_material",
      missing: applicability.missingItems,
      explanation:
        "No approved policy material is in use, so no policy wording exists to prepare.",
    };
  if (applicability.state === "unknown")
    return {
      state: "blocked",
      slotId,
      reason: "unknown_applicability",
      missing: applicability.missingItems,
      explanation: applicability.explanation,
    };
  if (!slot) {
    if (input.slotId)
      return {
        state: "blocked",
        slotId,
        reason: "slot_unknown",
        missing: [],
        explanation: `Approved version ${material.version} has no output slot ${input.slotId}.`,
      };
    return { state: "omitted", slotId: null, reason: "no_slot_for_channel" };
  }
  const missing: PolicyMissingItem[] = [];
  const factSources: Array<{ factKey: string; system: string; reference: string }> = [];
  const text = slot.text.replace(PLACEHOLDER, (_match, rawKey: string) => {
    const key = rawKey.trim();
    const declared = material.requiredInputs.find((entry) => entry.factKey === key);
    const { fact, state } = verifiedFact(input.facts, key);
    if (
      !declared ||
      state !== "verified" ||
      !fact ||
      !declared.allowedSourceSystems.includes(fact.source.system)
    ) {
      missing.push({
        id: `fact:${key}`,
        label: declared
          ? `Verified ${declared.label} (${key}) from ${declared.allowedSourceSystems.join(" or ")}`
          : `Declared input ${key}`,
        destination: "verified_fact",
        factKey: key,
      });
      return `{{${key}}}`;
    }
    factSources.push({ factKey: key, ...fact.source });
    return fact.displayValue;
  });
  if (missing.length > 0)
    return {
      state: "blocked",
      slotId: slot.slotId,
      reason: "missing_inputs",
      missing,
      explanation: `${missing.length} verified input${missing.length === 1 ? "" : "s"} for slot ${slot.slotId} ${missing.length === 1 ? "is" : "are"} missing; nothing is substituted or guessed.`,
    };
  return {
    state: "ready",
    slotId: slot.slotId,
    text,
    evidence: {
      productKey: material.productKey,
      version: material.version,
      contentHash: material.publicationSource.contentHash,
      ruleVersion: material.applicability.ruleVersion,
      slotId: slot.slotId,
      factSources,
    },
  };
}

export interface PolicyPreparationBinding {
  readonly productKey: PolicyProductKey;
  readonly version: string;
  readonly contentHash: string;
}

/** Whether an unexecuted preparation still binds the version in use; a superseding version invalidates it. */
export function policyPreparationCurrent(
  binding: PolicyPreparationBinding,
  material: PolicyMaterialSnapshot,
): {
  current: boolean;
  reason: "current" | "no_active_version" | "superseded" | "content_changed";
} {
  if (material.state !== "approved")
    return { current: false, reason: "no_active_version" };
  if (material.active.version !== binding.version)
    return { current: false, reason: "superseded" };
  if (material.active.publicationSource.contentHash !== binding.contentHash)
    return { current: false, reason: "content_changed" };
  return { current: true, reason: "current" };
}

export interface PolicyMessageGate {
  readonly field: string;
  readonly message: string;
}

/** The exact readiness item a prepared message carries for this policy, or none for unrelated leases. */
export function policyMessageGates(
  applicability: PolicyApplicability,
  channel: "owner" | "tenant",
  material: PolicyMaterialSnapshot,
  facts: readonly PolicyFact[] = [],
): PolicyMessageGate[] {
  const field = `policy.${applicability.productKey}`;
  const label = applicability.productLabel;
  if (applicability.state === "not_applicable") return [];
  if (applicability.state === "needs_review")
    return [
      {
        field,
        message: `Review the ${label} applicability: ${applicability.explanation}`,
      },
    ];
  if (applicability.state === "unknown")
    return applicability.identified
      ? [
          {
            field,
            message: `Review whether the ${label} applies to this lease before final use: ${applicability.label}.`,
          },
        ]
      : [];
  const output = preparePolicyOutput({
    material: material.state === "approved" ? material.active : null,
    applicability,
    facts,
    channel: channel === "owner" ? "owner_message" : "tenant_message",
  });
  if (output.state === "blocked")
    return [
      {
        field,
        message: `${label} wording is required for this message and is not ready: ${output.explanation}`,
      },
    ];
  return [];
}

/**
 * AC-S131-7: every conditional decision this module can make, by branch id, so the test suite can
 * prove each one executes. Policy-specific wording, real applicability rules and customer
 * validation are listed separately as not run; no fixture here is approved policy.
 */
export const POLICY_LOGIC_BRANCHES = [
  "applicability.material_unreadable",
  "applicability.material_ambiguous",
  "applicability.pending_approved_material",
  "applicability.pending_identified",
  "applicability.staff_not_applicable_without_material",
  "applicability.material_not_yet_effective",
  "applicability.material_expired",
  "applicability.conflicting_evidence",
  "applicability.staff_not_applicable_with_material",
  "applicability.rule_include",
  "applicability.rule_include_missing_inputs",
  "applicability.rule_exclude",
  "applicability.rule_needs_facts",
  "condition.always",
  "condition.fact_equals",
  "condition.fact_differs",
  "condition.fact_missing",
  "condition.fact_unverified",
  "condition.fact_present",
  "condition.not",
  "condition.all_of",
  "condition.any_of",
  "condition.ref",
  "condition.ref_unknown",
  "output.omitted_not_applicable",
  "output.blocked_needs_review",
  "output.blocked_no_material",
  "output.blocked_unknown",
  "output.blocked_slot_unknown",
  "output.omitted_no_slot",
  "output.blocked_missing_inputs",
  "output.ready",
  "preparation.current",
  "preparation.no_active_version",
  "preparation.superseded",
  "preparation.content_changed",
  "gate.not_applicable",
  "gate.needs_review",
  "gate.unknown_identified",
  "gate.unknown_unrelated",
  "gate.applicable_blocked",
  "gate.applicable_ready",
] as const;

export const POLICY_CHECKS_NOT_RUN = [
  "Actual Rhino policy wording and legal accuracy (awaiting approved material)",
  "Actual applicability rules and evidence requirements from the product owner",
  "Output mappings into documents (F10) and message consumers (F09)",
  "Selected policy lease validation in the next meeting (F12)",
] as const;
