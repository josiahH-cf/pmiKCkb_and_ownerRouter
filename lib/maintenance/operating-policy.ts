// Shared client-safe deterministic policy decisions. Model/provider labels cannot downgrade them.
import { z } from "zod";
import { MAINTENANCE_EMERGENCY_KEYWORDS } from "./constants";
const canonicalMaintenanceId = z.string().regex(/^[1-9][0-9]{0,9}$/);
export const maintenanceUrgencies = [
  "emergency_fire",
  "urgent_flooding",
  "urgent_property",
  "normal",
] as const;
export type MaintenanceUrgency = (typeof maintenanceUrgencies)[number];
export const EXISTING_MAINTENANCE_GUIDANCE: Record<MaintenanceUrgency, string> = {
  emergency_fire: "Call 911 now if anyone is in danger. We have recorded your report.",
  urgent_flooding:
    "We have your report and we are treating it as urgent. If you can do it safely, shut off the water at the fixture or at the main shutoff, and move what you can away from the water.",
  urgent_property:
    "Thank you. We have your report and a member of the team will review it and follow up with you.",
  normal:
    "Thank you. We have your report and a member of the team will review it and follow up with you.",
};
export const OperatingPolicyScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("organization") }).strict(),
  z.object({ kind: z.literal("property"), propertyId: canonicalMaintenanceId }).strict(),
]);
export type OperatingPolicyScope = z.infer<typeof OperatingPolicyScopeSchema>;
const evidence = z.string().trim().min(1).max(2000),
  wording = z.string().trim().min(1).max(8000);
const ContactSchema = z
  .object({
    id: z.string().uuid(),
    responsibility: z.string().trim().min(1).max(500),
    channel: z.enum(["phone", "email", "internal"]),
    destination: z.string().trim().min(1).max(500),
    coverage: z.string().trim().min(1).max(1000),
    takeoverExpectation: z.string().trim().min(1).max(1000),
    verificationEvidence: evidence,
    verifiedAt: z.string().datetime(),
    enabled: z.boolean(),
  })
  .strict()
  .superRefine((v, c) => {
    if (v.channel === "phone" && !/^\+[1-9][0-9]{7,14}$/.test(v.destination))
      c.addIssue({
        code: "custom",
        message: "Use the actual verified phone number in international format.",
      });
    if (v.channel === "email" && !z.string().email().safeParse(v.destination).success)
      c.addIssue({ code: "custom", message: "Use the actual verified email address." });
    if (v.channel === "internal" && !/^\/[a-z0-9/_-]+$/.test(v.destination))
      c.addIssue({
        code: "custom",
        message: "Use an existing internal routing destination.",
      });
  });
const base = {
  scope: OperatingPolicyScopeSchema,
  state: z.enum(["draft", "approved"]),
  title: z.string().trim().min(1).max(400),
  effectiveFrom: z.string().datetime(),
  expiresAt: z.string().datetime().nullable(),
  sourceRefs: z.array(evidence).max(20),
};
const EmergencySchema = z
  .object({
    ...base,
    purpose: z.literal("emergency"),
    rules: z
      .array(
        z
          .object({
            term: z
              .string()
              .trim()
              .min(2)
              .max(100)
              .regex(/^[\p{L}\p{N} '-]+$/u),
            urgency: z.enum(["emergency_fire", "urgent_flooding", "urgent_property"]),
          })
          .strict(),
      )
      .max(100),
    guidance: z
      .object({
        emergency_fire: wording.nullable(),
        urgent_flooding: wording.nullable(),
        urgent_property: wording.nullable(),
        normal: wording.nullable(),
      })
      .strict(),
    contacts: z.array(ContactSchema).max(20),
  })
  .strict();
const ChargebackSchema = z
  .object({
    ...base,
    purpose: z.literal("chargeback"),
    wording: wording.nullable(),
    timing: z.enum(["after_assessment", "after_responsibility_review"]),
    reviewConditions: z
      .array(z.enum(["assessment", "lease_evidence", "staff_review"]))
      .min(1)
      .max(3),
  })
  .strict();
export const OperatingPolicyInputSchema = z
  .discriminatedUnion("purpose", [EmergencySchema, ChargebackSchema])
  .superRefine((v, c) => {
    const bad = (message: string) => c.addIssue({ code: "custom", message });
    if (v.expiresAt && Date.parse(v.expiresAt) <= Date.parse(v.effectiveFrom))
      bad("The expiry must follow the effective time.");
    if (v.state === "approved" && v.sourceRefs.length === 0)
      bad("Approval requires actual reviewed policy source evidence.");
    if (v.state === "approved" && v.purpose === "chargeback" && !v.wording)
      bad("Approval requires actual reviewed guidance wording.");
    if (v.purpose === "emergency") {
      if (new Set(v.contacts.map((x) => x.id)).size !== v.contacts.length)
        bad("Contact identifiers must be distinct.");
      if (new Set(v.rules.map((x) => x.term.toLowerCase())).size !== v.rules.length)
        bad("Each urgency term must have one reviewed meaning.");
    }
  });
export type OperatingPolicyInput = z.infer<typeof OperatingPolicyInputSchema>;
export type OperatingPolicyVersion = OperatingPolicyInput extends infer T
  ? T extends OperatingPolicyInput
    ? Omit<T, "state"> & {
        id: string;
        version: number;
        state: "draft" | "approved" | "revoked";
        recordedAt: string;
        recordedBy: string;
        reason: string;
      }
    : never
  : never;
export type PolicyPurpose = OperatingPolicyInput["purpose"];
export function operatingPolicyId(purpose: PolicyPurpose, scope: OperatingPolicyScope) {
  return `${purpose}_${scope.kind === "organization" ? "organization" : `property_${scope.propertyId}`}`;
}
export interface OperatingPolicyHead {
  id: string;
  purpose: PolicyPurpose;
  scope: OperatingPolicyScope;
  version: number;
  activeVersion: number | null;
  scheduledVersion: number | null;
  draftVersion: number | null;
  updatedAt: string;
  updatedBy: string;
}
export type OperatingPolicySelection = {
  state: "approved" | "unset" | "conflicting" | "unavailable";
  policy: OperatingPolicyVersion | null;
  detail: string;
};
export function selectOperatingPolicy(
  versions: readonly OperatingPolicyVersion[],
  purpose: PolicyPurpose,
  propertyId: string | null | undefined,
  at: string,
): OperatingPolicySelection {
  const applicable = versions.filter(
    (p) =>
      p.purpose === purpose &&
      p.state === "approved" &&
      Date.parse(p.effectiveFrom) <= Date.parse(at) &&
      (!p.expiresAt || Date.parse(p.expiresAt) > Date.parse(at)) &&
      (p.scope.kind === "organization" ||
        (propertyId && p.scope.propertyId === propertyId)),
  );
  const property = applicable.filter((p) => p.scope.kind === "property"),
    candidates = property.length
      ? property
      : applicable.filter((p) => p.scope.kind === "organization");
  if (candidates.length > 1)
    return {
      state: "conflicting",
      policy: null,
      detail:
        "Competing applicable approved versions need staff review. Existing safety guidance remains available.",
    };
  return candidates.length === 1
    ? {
        state: "approved",
        policy: candidates[0],
        detail: "Applicable staff-approved version.",
      }
    : {
        state: "unset",
        policy: null,
        detail: "No applicable approved policy is configured.",
      };
}
export function operatingHeadSelection(
  head: OperatingPolicyHead | null,
  versions: readonly OperatingPolicyVersion[],
  at: string,
): OperatingPolicyVersion | null {
  if (!head) return null;
  const scheduled = versions.find((v) => v.version === head.scheduledVersion);
  const current =
    scheduled && Date.parse(scheduled.effectiveFrom) <= Date.parse(at)
      ? scheduled
      : versions.find((v) => v.version === head.activeVersion);
  return current?.state === "approved" &&
    Date.parse(current.effectiveFrom) <= Date.parse(at) &&
    (!current.expiresAt || Date.parse(current.expiresAt) > Date.parse(at))
    ? current
    : null;
}
const patterns = new Map<string, RegExp>();
export function maintenanceTermHits(text: string, term: string) {
  let pattern = patterns.get(term);
  if (!pattern) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    pattern = new RegExp(
      `(?:^|[^\\p{L}\\p{N}])${escaped}(?:s|es|d|ed|ing|y)?(?=$|[^\\p{L}\\p{N}])`,
      "iu",
    );
    patterns.set(term, pattern);
  }
  return pattern.test(text);
}
const fire = [
    "fire",
    "smoke",
    "smoking",
    "smoky",
    "gasoline",
    "gas leak",
    "smell gas",
    "smells like gas",
    "gas",
    "carbon monoxide",
  ],
  water = [
    "flood",
    "flooding",
    "flooded",
    "burst",
    "overflow",
    "overflowing",
    "sewage",
    "water everywhere",
    "pouring water",
    "gushing",
  ],
  leak = ["leak", "leaking", "dripping", "running water"];
const rank: Record<MaintenanceUrgency, number> = {
  normal: 0,
  urgent_property: 1,
  urgent_flooding: 2,
  emergency_fire: 3,
};
export function projectMaintenanceUrgency(
  input: {
    summary: string;
    description?: string;
    location?: string;
    damageOrAccess?: string;
    happeningNow?: boolean | null;
    suggestedUrgency?: unknown;
  },
  candidate: OperatingPolicyVersion | null,
) {
  const text = [input.summary, input.description, input.location, input.damageOrAccess]
      .filter(Boolean)
      .join(" "),
    hits = (terms: readonly string[]) =>
      terms.some((term) => maintenanceTermHits(text, term));
  let urgency: MaintenanceUrgency = hits(fire)
    ? "emergency_fire"
    : hits(water) || (input.happeningNow === true && hits(leak))
      ? "urgent_flooding"
      : hits(MAINTENANCE_EMERGENCY_KEYWORDS)
        ? "urgent_property"
        : "normal";
  const policy =
    candidate?.purpose === "emergency" && candidate.state === "approved"
      ? candidate
      : null;
  if (policy)
    for (const rule of policy.rules)
      if (maintenanceTermHits(text, rule.term) && rank[rule.urgency] > rank[urgency])
        urgency = rule.urgency;
  const guidance = policy
      ? (policy.guidance[urgency] ?? EXISTING_MAINTENANCE_GUIDANCE[urgency])
      : EXISTING_MAINTENANCE_GUIDANCE[urgency],
    contacts = policy ? policy.contacts.filter((x) => x.enabled) : [];
  return {
    urgency,
    priority: urgency === "normal" ? ("Normal" as const) : ("Emergency" as const),
    guidance,
    policyId: policy?.id ?? null,
    policyVersion: policy?.version ?? null,
    source: policy ? ("approved_policy" as const) : ("existing_fallback" as const),
    routing: contacts.length
      ? {
          state: "configured" as const,
          contacts,
          detail:
            "Verified configuration; delivery or human takeover has not been executed.",
        }
      : {
          state: "unavailable" as const,
          contacts: [],
          detail:
            "No verified applicable escalation route is configured. Staff routing needs attention.",
        },
  };
}

export const ApplyOperatingPolicySchema = z.discriminatedUnion("op", [
  z
    .object({
      op: z.literal("save_version"),
      operationId: z.string().uuid(),
      expectedVersion: z.number().int().nonnegative(),
      policy: OperatingPolicyInputSchema,
      reason: z.string().trim().min(1).max(4000),
      reviewedExactPolicy: z.literal(true),
    })
    .strict(),
  z
    .object({
      op: z.literal("revoke_version"),
      operationId: z.string().uuid(),
      expectedVersion: z.number().int().positive(),
      purpose: z.enum(["emergency", "chargeback"]),
      scope: OperatingPolicyScopeSchema,
      targetVersion: z.number().int().positive(),
      reason: z.string().trim().min(1).max(4000),
    })
    .strict(),
]);
export type ApplyOperatingPolicy = z.infer<typeof ApplyOperatingPolicySchema>;

export function parseOperatingPolicyVersion(
  value: unknown,
): OperatingPolicyVersion | null {
  const meta = z
    .object({
      id: z
        .string()
        .regex(/^(?:emergency|chargeback)_(?:organization|property_[1-9][0-9]{0,9})$/),
      version: z.number().int().positive(),
      state: z.enum(["draft", "approved", "revoked"]),
      recordedAt: z.string().datetime(),
      recordedBy: z.string().min(1),
      reason: z.string().min(1).max(4000),
    })
    .safeParse(value);
  if (!meta.success || !value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>,
    base = {
      purpose: v.purpose,
      scope: v.scope,
      state: v.state === "revoked" ? "draft" : v.state,
      title: v.title,
      effectiveFrom: v.effectiveFrom,
      expiresAt: v.expiresAt,
      sourceRefs: v.sourceRefs,
    };
  const input = OperatingPolicyInputSchema.safeParse(
    v.purpose === "emergency"
      ? { ...base, rules: v.rules, guidance: v.guidance, contacts: v.contacts }
      : {
          ...base,
          wording: v.wording,
          timing: v.timing,
          reviewConditions: v.reviewConditions,
        },
  );
  if (
    !input.success ||
    operatingPolicyId(input.data.purpose, input.data.scope) !== meta.data.id
  )
    return null;
  return { ...input.data, ...meta.data };
}
export function parseOperatingPolicyHead(value: unknown): OperatingPolicyHead | null {
  const schema = z.object({
      id: z.string(),
      purpose: z.enum(["emergency", "chargeback"]),
      scope: OperatingPolicyScopeSchema,
      version: z.number().int().positive(),
      activeVersion: z.number().int().positive().nullable(),
      scheduledVersion: z.number().int().positive().nullable(),
      draftVersion: z.number().int().positive().nullable(),
      updatedAt: z.string().datetime(),
      updatedBy: z.string().min(1),
    }),
    p = schema.safeParse(value);
  if (
    !p.success ||
    operatingPolicyId(p.data.purpose, p.data.scope) !== p.data.id ||
    [p.data.activeVersion, p.data.scheduledVersion, p.data.draftVersion].some(
      (n) => n !== null && n > p.data.version,
    )
  )
    return null;
  return p.data;
}
