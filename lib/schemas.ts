import { z } from "zod";
import { SOURCE_STATES } from "@/lib/constants";

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

export type AskRequest = z.infer<typeof AskRequestSchema>;
export type Citation = z.infer<typeof CitationSchema>;
export type AskResponse = z.infer<typeof AskResponseSchema>;
