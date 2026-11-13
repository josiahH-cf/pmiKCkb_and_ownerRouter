// S284 W12-06, "Know which rent this is": the candidate-side acceptance checks of S277 (intake
// 155) for the November 12 qualification matrix.
//
// Spec: docs/feature-suites/renewal-rent-basis-affirmation-and-agreement-adoption.md (S277).
// Acceptance checks of this row (W12_MATRIX in one-path-november-12-qualification-verdict.mjs):
//   AC-S277-1, AC-S277-2, AC-S277-3, AC-S277-4, AC-S277-5, AC-S277-6
//
// Staff scenario (docs/feature-suites/staff-workflow-audit-qualification.md, W12 matrix):
//   On the covered lease follow "Set renewal base rent" and adopt the agreement amount. Affirm an
//   equal owner amount. Record answers before and after the dates exist. Read the monthly table.
//
// Starting sequence (journeyW1206 in one-path-november-12-journeys.mjs, the fail-first table):
//   Open the covered lease's Offer step and follow "Set renewal base rent". On the baseline:
//   Focus on "Owner decides each renewal"; no control adopts the agreement amount.
//
// STATUS: stub. It records no acceptance check yet, so W12-06 scores UNVERIFIED (never Yes) until
// this file returns its checks. The contract is the qualification driver's "W12 CHECK CONTRACT"
// (one-path-november-12-qualification-driver.mjs); the function below states it in brief.

/**
 * W12-06 candidate checks. The qualification driver calls this once per run, right after
 * journeyW1206 ran on the same page, on the same build and in the same rehearsal.
 *
 * @param {object} ctx  the row's context: journeyId, kit, rehearsal, origin, leases, options,
 *   mode, binding, writes, newPage(role), resetState(), record(entry), unresolved(kind)
 * @param {import("playwright-core").Page} page  the signed-in Editor page the starting
 *   sequence used, still open where it left off
 * @param {{ observed: object | null, steps: object[], error: string | null }} start  the
 *   starting sequence's observation and step log, or (error) the message it stopped with
 * @returns {Promise<Record<string, boolean>>} AC-S277-1 to AC-S277-6 only, each true (passed) or
 *   false (failed). An id left out reads not recorded (the row UNVERIFIED); any other key reads
 *   as a mislabeled check (the row No); a throw stops the row (No).
 */
export async function checkW1206(ctx, page, start) {
  ctx.record({
    candidateChecks: "not written yet",
    startingSequence: start.error ? "stopped" : "completed",
  });
  return {};
}
