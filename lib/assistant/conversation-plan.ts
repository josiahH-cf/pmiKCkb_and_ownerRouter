// S138 conversation plan: the closed, typed interpretation of one Dashboard question. A model may
// propose a plan, but the server validates it against this schema and executes it itself, so every
// record, count and link still comes from the owning services. The plan carries filters and
// references only; it never carries a record id, an actor, a role, or a Space.

import { z } from "zod";

export const PLAN_SUBJECTS = [
  "leases",
  "work",
  "approvals",
  "connections",
  "processes",
  "maintenance",
  "communications",
] as const;
export type PlanSubject = (typeof PLAN_SUBJECTS)[number];

export const DATE_PRESETS = [
  "today",
  "this_week",
  "next_week",
  "this_month",
  "next_month",
  "last_month",
  "overdue",
  "month",
] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];

/**
 * Which recorded date a lease range reads. The lease end date is the desk's renewal date and the
 * established meaning of a lease being due or coming up; the follow-up due date is the desk's Action
 * timing. The app records no lease notice deadline, so that value only ever produces a question.
 */
export const LEASE_DATE_FIELDS = [
  "lease_end",
  "follow_up_due",
  "notice_deadline",
] as const;
export type LeaseDateField = (typeof LEASE_DATE_FIELDS)[number];

/** How named people relate to the records: an assignment, or an owner or tenant relation. */
export const PEOPLE_MATCHES = ["assigned", "related", "assigned_or_related"] as const;
export type PeopleMatch = (typeof PEOPLE_MATCHES)[number];

export const PLAN_KINDS = [
  "operational",
  "knowledge",
  "mixed",
  "clarify",
  "unsupported",
] as const;

// The model-facing vocabulary uses "none" instead of a nullable enum; it normalizes to null.
const PlanRangeSchema = z
  .object({
    preset: z.enum([...DATE_PRESETS, "none"]),
    month: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .nullable(),
  })
  .strict()
  .refine((range) => range.preset !== "month" || range.month !== null, {
    message: "An exact month range names its month.",
  })
  .transform((range) =>
    range.preset === "none"
      ? null
      : { preset: range.preset as DatePreset, month: range.month },
  );

export const ConversationPlanSchema = z
  .object({
    kind: z.enum(PLAN_KINDS),
    subjects: z.array(z.enum(PLAN_SUBJECTS)).max(4),
    filters: z
      .object({
        range: PlanRangeSchema.nullable(),
        dateField: z
          .enum([...LEASE_DATE_FIELDS, "none"])
          .nullable()
          .transform((value) => (value === "none" ? null : value)),
        assignee: z
          .enum(["me", "any", "none"])
          .nullable()
          .transform((value) => (value === "none" ? null : value)),
        people: z.array(z.string().trim().min(1).max(80)).max(5),
        peopleMatch: z
          .enum([...PEOPLE_MATCHES, "none"])
          .nullable()
          .transform((value) => (value === "none" ? null : value)),
        blocked: z.boolean().nullable(),
        stale: z.boolean().nullable(),
        waitingOnOthers: z.boolean().nullable(),
        needsMyApproval: z.boolean().nullable(),
        includeClosed: z.boolean().nullable(),
        text: z.string().trim().min(1).max(120).nullable(),
      })
      .strict(),
    followUp: z
      .object({
        usePrevious: z.boolean(),
        ordinal: z.number().int().min(1).max(100).nullable(),
        detail: z.boolean(),
      })
      .strict(),
    clarification: z.string().trim().min(1).max(240).nullable(),
    unsupportedTopic: z.string().trim().min(1).max(80).nullable(),
  })
  .strict();

export type ConversationPlan = z.output<typeof ConversationPlanSchema>;
export type PlanFilters = ConversationPlan["filters"];

export const EMPTY_FILTERS: PlanFilters = {
  range: null,
  dateField: null,
  assignee: null,
  people: [],
  peopleMatch: null,
  blocked: null,
  stale: null,
  waitingOnOthers: null,
  needsMyApproval: null,
  includeClosed: null,
  text: null,
};

/** JSON Schema handed to the model; the zod schema above remains the authority. */
export const CONVERSATION_PLAN_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "kind",
    "subjects",
    "filters",
    "followUp",
    "clarification",
    "unsupportedTopic",
  ],
  properties: {
    kind: { type: "string", enum: [...PLAN_KINDS] },
    subjects: {
      type: "array",
      maxItems: 4,
      items: { type: "string", enum: [...PLAN_SUBJECTS] },
    },
    filters: {
      type: "object",
      additionalProperties: false,
      required: [
        "range",
        "dateField",
        "assignee",
        "people",
        "peopleMatch",
        "blocked",
        "stale",
        "waitingOnOthers",
        "needsMyApproval",
        "includeClosed",
        "text",
      ],
      properties: {
        range: {
          type: "object",
          additionalProperties: false,
          required: ["preset", "month"],
          properties: {
            preset: { type: "string", enum: [...DATE_PRESETS, "none"] },
            month: { type: ["string", "null"], pattern: "^\\d{4}-(0[1-9]|1[0-2])$" },
          },
        },
        dateField: { type: "string", enum: [...LEASE_DATE_FIELDS, "none"] },
        assignee: { type: "string", enum: ["me", "any", "none"] },
        people: { type: "array", maxItems: 5, items: { type: "string", maxLength: 80 } },
        peopleMatch: { type: "string", enum: [...PEOPLE_MATCHES, "none"] },
        blocked: { type: ["boolean", "null"] },
        stale: { type: ["boolean", "null"] },
        waitingOnOthers: { type: ["boolean", "null"] },
        needsMyApproval: { type: ["boolean", "null"] },
        includeClosed: { type: ["boolean", "null"] },
        text: { type: ["string", "null"], maxLength: 120 },
      },
    },
    followUp: {
      type: "object",
      additionalProperties: false,
      required: ["usePrevious", "ordinal", "detail"],
      properties: {
        usePrevious: { type: "boolean" },
        ordinal: { type: ["integer", "null"], minimum: 1, maximum: 100 },
        detail: { type: "boolean" },
      },
    },
    clarification: { type: ["string", "null"], maxLength: 240 },
    unsupportedTopic: { type: ["string", "null"], maxLength: 80 },
  },
} as const;

/** What a clarification asked for, so a short reply can complete the earlier question. */
export const AWAITING_DETAILS = ["period", "person", "date_field"] as const;
export type AwaitingDetail = (typeof AWAITING_DETAILS)[number];

/** One prior exchange the client keeps for this page session only. */
export const ConversationTurnSchema = z
  .object({
    question: z.string().trim().min(1).max(500),
    plan: ConversationPlanSchema,
    awaiting: z.enum(AWAITING_DETAILS).nullable(),
    refs: z
      .array(
        z
          .object({
            source: z.enum([
              "renewals",
              "work",
              "approvals",
              "connections",
              "processes",
              "maintenance",
              "communications",
            ]),
            id: z.string().trim().min(1).max(200),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
export type ConversationTurn = z.infer<typeof ConversationTurnSchema>;

export const ConversationContextSchema = z
  .object({
    version: z.literal(1),
    actorKey: z.string().regex(/^[a-f0-9]{16,64}$/),
    turns: z.array(ConversationTurnSchema).max(6),
  })
  .strict();
export type ConversationContext = z.infer<typeof ConversationContextSchema>;

export const MAX_CONTEXT_TURNS = 6;
