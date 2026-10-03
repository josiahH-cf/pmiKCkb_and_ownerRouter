// S148 stored-answer contract. A history turn stores exactly what the person saw: the S138 answer
// (summary, groups, items, record references, links, interpretation and the executed plan) and the
// knowledge answer, validated here before it is written. Links must stay in-app and sources must
// be https, so a stored record can never smuggle a script or an off-site link into a later render.
// Reopening applies the viewer's current access: a source the viewer can no longer see shows no
// stored detail. Pure; no I/O.

import { z } from "zod";

import {
  ConversationContextSchema,
  ConversationPlanSchema,
  DATE_PRESETS,
  LEASE_DATE_FIELDS,
} from "@/lib/assistant/conversation-plan";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { AskResponseSchema } from "@/lib/schemas";
import { OPERATIONAL_SOURCES } from "@/lib/operational-context/types";

const InAppHrefSchema = z
  .string()
  .max(600)
  .regex(/^\/(?!\/)[^\s]*$/, "Stored links stay inside the application.");
const IsoSchema = z.string().max(40);
const SourceSchema = z.enum(OPERATIONAL_SOURCES);

const RecordRefSchema = z
  .object({ source: SourceSchema, id: z.string().trim().min(1).max(200) })
  .strict();

const StoredItemSchema = z
  .object({
    ref: RecordRefSchema,
    title: z.string().max(400),
    detail: z.string().max(800),
    blockers: z.array(z.string().max(400)).max(30),
    href: InAppHrefSchema,
    facts: z.array(z.string().max(400)).max(40).optional(),
  })
  .strict();

const StoredGroupSchema = z
  .object({
    source: SourceSchema,
    title: z.string().max(120),
    summary: z.string().max(800),
    status: z.enum(["ok", "partial", "unavailable", "not_authorized"]),
    total: z.number().int().min(0),
    items: z.array(StoredItemSchema).max(25),
    notes: z.array(z.string().max(800)).max(30),
    link: z
      .object({ label: z.string().max(120), href: InAppHrefSchema })
      .strict()
      .nullable(),
    asOf: IsoSchema.nullable().optional(),
    coverage: z.object({ startIso: IsoSchema, endIso: IsoSchema }).strict().optional(),
    currency: z
      .object({ state: z.enum(["fresh", "stale", "expired"]), readAtIso: IsoSchema })
      .strict()
      .optional(),
    /** Set only on a restored copy whose source the viewer can no longer see. */
    hiddenForAccess: z.literal(true).optional(),
  })
  .strict();

export const ExecutionRangeSchema = z
  .object({
    preset: z.enum(DATE_PRESETS),
    month: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .nullable(),
    intent: z.enum(["relative", "fixed"]),
    dateField: z.enum(LEASE_DATE_FIELDS).nullable(),
    startIso: IsoSchema.nullable(),
    endIso: IsoSchema,
    label: z.string().max(200),
  })
  .strict();

export const AnswerExecutionSchema = z
  .object({
    plan: ConversationPlanSchema,
    relatedRefs: z.array(RecordRefSchema).max(100),
    detailRef: RecordRefSchema.nullable(),
    range: ExecutionRangeSchema.nullable(),
  })
  .strict();

export const StoredAssistantAnswerSchema = z
  .object({
    version: z.literal("assistant-conversation/v1"),
    kind: z.enum(["answer", "clarification", "knowledge", "unsupported"]),
    summary: z.string().max(1200),
    interpretation: z.array(z.string().max(400)).max(30),
    groups: z.array(StoredGroupSchema).max(12),
    clarification: z.string().max(400).nullable(),
    knowledgeQuestion: z.string().max(500).nullable(),
    interpretedBy: z.enum(["model", "deterministic", "stored_plan"]),
    conversation: ConversationContextSchema,
    contextReset: z.boolean(),
    answeredAtIso: IsoSchema,
    execution: AnswerExecutionSchema.nullable(),
    /** Set only on a replayed or restored copy; never part of what is stored. */
    replayed: z.boolean().optional(),
  })
  .strict();
export type StoredAssistantAnswer = z.infer<typeof StoredAssistantAnswerSchema>;

export const StoredKnowledgeAnswerSchema = AskResponseSchema.superRefine(
  (answer, ctx) => {
    answer.citations.forEach((citation, index) => {
      if (!/^https:\/\//.test(citation.url))
        ctx.addIssue({
          code: "custom",
          path: ["citations", index, "url"],
          message: "Stored sources use https links.",
        });
    });
  },
);
export type StoredKnowledgeAnswer = z.infer<typeof StoredKnowledgeAnswerSchema>;

/** The access a stored answer was produced under, compared on every reopen. */
export interface AccessBasis {
  readonly role: AuthenticatedUser["role"];
  /** Null for every Space; a list only on answers stored before S167 opened every Space. */
  readonly scopes: readonly string[] | null;
}

const ROLE_RANK: Record<AuthenticatedUser["role"], number> = {
  Editor: 0,
  Approver: 1,
  Admin: 2,
};

/** True when the viewer now has less access than the answer was produced under. */
export function accessNarrowedSince(
  basis: AccessBasis,
  viewer: AuthenticatedUser,
): boolean {
  // S167: every staff account has every internal Space, so only a lower role narrows access. An
  // answer stored under a Space allowlist was produced with less reach than the viewer has now.
  return (ROLE_RANK[viewer.role] ?? -1) < (ROLE_RANK[basis.role] ?? 0);
}

const HIDDEN_SUMMARY =
  "Your access has changed since this answer, so its records are hidden. Ask again for current results.";

/**
 * A restored answer as this viewer may see it now. When the viewer's role or Spaces have narrowed
 * since the answer, every record-bearing group is hidden (connection status is value-free and
 * stays), and so are the record references the answer carried for follow-ups and reruns. Nothing
 * is re-read: this only removes stored detail, it never refreshes it.
 */
export function projectStoredAssistantAnswer(
  answer: StoredAssistantAnswer,
  basis: AccessBasis,
  viewer: AuthenticatedUser,
): StoredAssistantAnswer {
  if (!accessNarrowedSince(basis, viewer)) return answer;
  return {
    ...answer,
    conversation: {
      ...answer.conversation,
      turns: answer.conversation.turns.map((turn) => ({ ...turn, refs: [] })),
    },
    execution: answer.execution
      ? { ...answer.execution, relatedRefs: [], detailRef: null }
      : null,
    groups: answer.groups.map((group) =>
      group.source === "connections"
        ? group
        : {
            ...group,
            summary: HIDDEN_SUMMARY,
            total: 0,
            items: [],
            notes: [],
            link: null,
            hiddenForAccess: true as const,
          },
    ),
    summary: answer.groups.some((group) => group.source !== "connections")
      ? HIDDEN_SUMMARY
      : answer.summary,
  };
}

/** The knowledge answer as this viewer may see it now; narrowed access hides its sources too. */
export function projectStoredKnowledgeAnswer(
  answer: StoredKnowledgeAnswer,
  basis: AccessBasis,
  viewer: AuthenticatedUser,
): StoredKnowledgeAnswer | null {
  return accessNarrowedSince(basis, viewer) ? null : answer;
}
