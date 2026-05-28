import { z } from "zod";
import { SOURCE_STATES } from "@/lib/constants";

const CaptureSourceStates = [
  "Partial Source",
  "Bailey Placeholder",
  "No Reliable Source Found",
] as const;

export const AskRequestSchema = z.object({
  question: z.string().trim().min(3),
  audience: z.string().trim().default("Unknown"),
  channel: z.string().trim().default("Other"),
  urgency: z.string().trim().default("Normal"),
  draft_enabled: z.boolean().default(true),
  space: z.string().trim().optional(),
});

export const CitationSchema = z.object({
  source_id: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url(),
  excerpt: z.string().optional(),
});

export const AskResponseSchema = z.object({
  question: z.string(),
  source_state: z.enum(SOURCE_STATES),
  answer: z.string(),
  handling_steps: z.array(z.string()),
  citations: z.array(CitationSchema),
  draft: z.string(),
  escalation_owner: z.string().optional(),
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

export type AskRequest = z.infer<typeof AskRequestSchema>;
export type AskCaptureRequest = z.infer<typeof AskCaptureRequestSchema>;
export type Citation = z.infer<typeof CitationSchema>;
export type AskResponse = z.infer<typeof AskResponseSchema>;
