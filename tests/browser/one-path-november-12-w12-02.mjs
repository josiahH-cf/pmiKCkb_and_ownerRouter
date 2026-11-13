// S284 W12-02, "See the held message": the candidate-side acceptance checks of S273 (intake 151)
// for the November 12 qualification matrix.
//
// Spec: docs/feature-suites/renewal-held-and-outdated-message-visibility.md (S273).
// Acceptance checks of this row (W12_MATRIX in one-path-november-12-qualification-verdict.mjs):
//   AC-S273-1, AC-S273-2, AC-S273-3, AC-S273-4, AC-S273-5, AC-S273-6
//
// Staff scenario (docs/feature-suites/staff-workflow-audit-qualification.md, W12 matrix):
//   Before any tick, read the out-of-date state with both values on the lease and the desk. After
//   a tick, read the hold, the notification and the earlier attempt. Update in one confirmation.
//
// Starting sequence (journeyW1202 in one-path-november-12-journeys.mjs, the fail-first table):
//   After the end date change and before any tick, read the lease. After the tick, read the lease
//   and the notifications. On the baseline: New wording above the old schedule; after the hold,
//   no trace and no notification.
//
// STATUS: stub. It records no acceptance check yet, so W12-02 scores UNVERIFIED (never Yes) until
// this file returns its checks. The contract is the qualification driver's "W12 CHECK CONTRACT"
// (one-path-november-12-qualification-driver.mjs); the function below states it in brief.

/**
 * W12-02 candidate checks. The qualification driver calls this once per run, right after
 * journeyW1202 ran on the same page, on the same build and in the same rehearsal.
 *
 * @param {object} ctx  the row's context: journeyId, kit, rehearsal, origin, leases, options,
 *   mode, binding, writes, newPage(role), resetState(), record(entry), unresolved(kind)
 * @param {import("playwright-core").Page} page  the signed-in Editor page the starting
 *   sequence used, still open where it left off
 * @param {{ observed: object | null, steps: object[], error: string | null }} start  the
 *   starting sequence's observation and step log, or (error) the message it stopped with
 * @returns {Promise<Record<string, boolean>>} AC-S273-1 to AC-S273-6 only, each true (passed) or
 *   false (failed). An id left out reads not recorded (the row UNVERIFIED); any other key reads
 *   as a mislabeled check (the row No); a throw stops the row (No).
 */
export async function checkW1202(ctx, page, start) {
  ctx.record({
    candidateChecks: "not written yet",
    startingSequence: start.error ? "stopped" : "completed",
  });
  return {};
}
