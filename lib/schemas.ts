import { z } from "zod";
import { SOURCE_STATES } from "@/lib/constants";

const CaptureSourceStates = [
  "Partial Source",
  "Open Placeholder",
  "No Reliable Source Found",
] as const;

export const AskRequestSchema = z.object({
  question: z.string().trim().min(3),
  draft_enabled: z.boolean().default(true),
  space: z.string().trim().optional(),
  // The process the question is asked in (action console). Optional; resolved server-side to context.
  process_id: z.string().trim().optional(),
});

export const CitationSchema = z.object({
  source_id: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url(),
  excerpt: z.string().optional(),
  // KB freshness (Slice 5, D13): the source's existing sources_meta.last_reviewed_at, when present.
  // Honest surfacing only — the UI shows "reviewed <date>"; absent when the source has no review date.
  last_reviewed_at: z.string().optional(),
  // S32 source freshness: computed server-side from last_reviewed_at + the source's review interval.
  // Absent when either input is missing (status "unknown"); the UI shows a chip only for review-due/stale.
  freshness: z
    .object({
      status: z.enum(["fresh", "review-due", "stale", "unknown"]),
      dueDateIso: z.string().optional(),
      daysOverdue: z.number().optional(),
    })
    .optional(),
});

export const AskResponseSchema = z.object({
  question: z.string(),
  source_state: z.enum(SOURCE_STATES),
  answer: z.string(),
  handling_steps: z.array(z.string()),
  citations: z.array(CitationSchema),
  draft: z.string(),
  escalation_owner: z.string().optional(),
  // Answer transparency (Slice 4): the friendly answer-model label + the number of sources shown.
  // Stamped by the Ask service on every result; the UI renders "Answered by <model> · N sources".
  answered_by: z
    .object({
      model: z.string(),
      source_count: z.number().int().nonnegative(),
    })
    .optional(),
});

export const AskCaptureRequestSchema = z.object({
  owner_uid: z.string().trim().min(1).optional(),
  priority: z.enum(["P0", "P1", "P2"]).default("P1"),
  question: z.string().trim().min(3),
  related_sop_id: z.string().trim().min(1).optional(),
  source_hint: z.string().trim().optional(),
  source_state: z.enum(CaptureSourceStates),
  space_id: z.string().trim().min(1),
});

// S32: filing a plain-language correction on an Ask answer. It writes a Proposed-only review record and
// changes nothing on its own (mirrors the capture-task shape). `citations`/`source_state` are a
// non-authoritative context snapshot for the reviewer.
export const AskCorrectionKinds = [
  "wrong_fact",
  "wrong_source",
  "missing_detail",
  "wrong_process",
] as const;

export const CorrectionRequestSchema = z.object({
  ask_log_id: z.string().trim().min(1).optional(),
  space_id: z.string().trim().min(1),
  question: z.string().trim().min(3),
  kind: z.enum(AskCorrectionKinds),
  note: z.string().trim().min(1),
  source_state: z.string().trim().optional(),
  citations: z.array(CitationSchema).default([]),
});

export type AskRequest = z.infer<typeof AskRequestSchema>;
export type AskCaptureRequest = z.infer<typeof AskCaptureRequestSchema>;
export type CorrectionRequest = z.infer<typeof CorrectionRequestSchema>;
export type Citation = z.infer<typeof CitationSchema>;
export type AskResponse = z.infer<typeof AskResponseSchema>;
