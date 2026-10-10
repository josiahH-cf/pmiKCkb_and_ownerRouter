// S202 explicit certainty metadata, shared by generation, strict history and rendering.
import { z } from "zod";
export const AnswerClaimSchema = z
  .object({
    kind: z.enum(["source_fact", "historical", "recommendation", "unknown"]),
    text: z.string().trim().min(1).max(2000),
    source_ids: z.array(z.string().min(1).max(200)).max(10),
    history_seq: z.number().int().positive().nullable(),
  })
  .strict();
export const AnswerClaimsSchema = z.array(AnswerClaimSchema).min(1).max(20);
export const AnswerEvidenceContextSchema = z
  .object({
    answered_at: z.string().datetime(),
    mode: z.enum(["source_facts", "mixed", "guidance", "unknown"]),
    coverage: z.array(z.string().max(500)).max(10),
    claims: z.array(AnswerClaimSchema).max(20),
  })
  .strict();
export type AnswerClaim = z.infer<typeof AnswerClaimSchema>;
export const CLAIM_LABELS: Record<AnswerClaim["kind"], string> = {
  source_fact: "Source fact",
  historical: "Historical context",
  recommendation: "Recommendation",
  unknown: "Unknown",
};
