import { z } from "zod";
import type { RenewalDiscrepancyDisposition } from "@/lib/firestore/renewal-discrepancy-dispositions";
export const CurrentRentReviewSchema = z
  .object({
    schemaVersion: z.literal("renewal-current-rent-review/v1"),
    value: z
      .number()
      .finite()
      .positive()
      .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 0.00001),
    source: z.string().trim().min(3).max(240),
    destination: z.enum(["sheet", "both"]),
    candidateFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type CurrentRentReview = z.infer<typeof CurrentRentReviewSchema>;
export function currentRentReviewFromDisposition(
  record: RenewalDiscrepancyDisposition,
): (CurrentRentReview & { recordedByUid: string; recordedAt: string }) | null {
  if (record.field !== "current_rent" || record.status !== "proposed") return null;
  try {
    const parsed = CurrentRentReviewSchema.parse(JSON.parse(record.proposedCorrection));
    if (record.sourceHash !== parsed.candidateFingerprint) return null;
    return {
      ...parsed,
      recordedByUid: record.recordedByUid,
      recordedAt: record.recordedAt,
    };
  } catch {
    return null;
  }
}
