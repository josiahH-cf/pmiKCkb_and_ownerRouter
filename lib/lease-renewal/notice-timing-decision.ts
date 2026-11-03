import { z } from "zod";

export const NOTICE_TIMING_BASIS_TARGET_ID = "renewal-notice-timing-basis";

/** S125: an already documented business decision, not a new legal or staff approval. */
export const DOCUMENTED_NOTICE_TIMING_DECISION = Object.freeze({
  id: "notice-basis/2026-10-02/q2",
  label: "Lease end · calendar days · 30 days (exactly 30 meets)",
  targetKind: "lease_end" as const,
  countingRule: "calendar_days_target_minus_notice_v1" as const,
  thresholdDays: 30,
  source: "docs/feature-suites/thirty-day-notice-timing-review.md",
  note: "Owner's October 2, 2026 Q2 decision: contractual lease end; calendar days (target minus notice); 30 days; exactly 30 meets.",
});

export const SelectNoticeTimingBasisInputSchema = z
  .object({
    decisionId: z.literal(DOCUMENTED_NOTICE_TIMING_DECISION.id),
    expectedVersion: z.number().int().nonnegative(),
    operationId: z.string().uuid(),
  })
  .strict();
export type SelectNoticeTimingBasisInput = z.infer<
  typeof SelectNoticeTimingBasisInputSchema
>;

export function isDocumentedNoticeTimingBasis(
  record:
    | {
        target_kind: string;
        counting_rule: string;
        threshold_days: number;
      }
    | null
    | undefined,
): boolean {
  return (
    record?.target_kind === DOCUMENTED_NOTICE_TIMING_DECISION.targetKind &&
    record.counting_rule === DOCUMENTED_NOTICE_TIMING_DECISION.countingRule &&
    record.threshold_days === DOCUMENTED_NOTICE_TIMING_DECISION.thresholdDays
  );
}
