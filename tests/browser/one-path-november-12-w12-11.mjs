// S284 W12-11, "Clear an off-cycle hold": the candidate-side acceptance checks of S282 (intake
// 160) for the November 12 qualification matrix.
//
// Spec: docs/feature-suites/renewal-off-cycle-end-date-review.md (S282).
// Acceptance checks of this row (W12_MATRIX in one-path-november-12-qualification-verdict.mjs):
//   AC-S282-1, AC-S282-2, AC-S282-3, AC-S282-4, AC-S282-5
//
// Staff scenario (docs/feature-suites/staff-workflow-audit-qualification.md, W12 matrix):
//   Open the off-cycle lease, read the readiness row and the button, record "Include" with a
//   reason, then change the source end date and correct it to a month end.
//
// Starting sequence (journeyW1211 in one-path-november-12-journeys.mjs, the fail-first table):
//   Open the off-cycle lease and look for a control that clears the block. On the baseline: None
//   exists; five readiness rows read Ready.
//
// Note: The off-cycle lease is ctx.options.offCycleLeaseId (9106 in the fixture).
//
// STATUS: stub. It records no acceptance check yet, so W12-11 scores UNVERIFIED (never Yes) until
// this file returns its checks. The contract is the qualification driver's "W12 CHECK CONTRACT"
// (one-path-november-12-qualification-driver.mjs); the function below states it in brief.

/**
 * W12-11 candidate checks. The qualification driver calls this once per run, right after
 * journeyW1211 ran on the same page, on the same build and in the same rehearsal.
 *
 * @param {object} ctx  the row's context: journeyId, kit, rehearsal, origin, leases, options,
 *   mode, binding, writes, newPage(role), resetState(), record(entry), unresolved(kind)
 * @param {import("playwright-core").Page} page  the signed-in Editor page the starting
 *   sequence used, still open where it left off
 * @param {{ observed: object | null, steps: object[], error: string | null }} start  the
 *   starting sequence's observation and step log, or (error) the message it stopped with
 * @returns {Promise<Record<string, boolean>>} AC-S282-1 to AC-S282-5 only, each true (passed) or
 *   false (failed). An id left out reads not recorded (the row UNVERIFIED); any other key reads
 *   as a mislabeled check (the row No); a throw stops the row (No).
 */
export async function checkW1211(ctx, page, start) {
  ctx.record({
    candidateChecks: "not written yet",
    startingSequence: start.error ? "stopped" : "completed",
  });
  return {};
}
