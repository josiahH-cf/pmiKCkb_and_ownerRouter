// S284 W12-07, "Finish the source updates": the candidate-side acceptance checks of S278 (intake
// 156) for the November 12 qualification matrix.
//
// Spec: docs/feature-suites/renewal-source-updates-from-working-terms.md (S278).
// Acceptance checks of this row (W12_MATRIX in one-path-november-12-qualification-verdict.mjs):
//   AC-S278-1, AC-S278-2, AC-S278-3, AC-S278-4, AC-S278-5, AC-S278-6
//
// Staff scenario (docs/feature-suites/staff-workflow-audit-qualification.md, W12 matrix):
//   Compare the pending Market value with the reviewed recommendation. Open each form from its
//   preview. With the deterministic Sheets adapter, review five cells together and confirm once,
//   change one value after the preview, and inject one conflict mid-run.
//
// Starting sequence (journeyW1207 in one-path-november-12-journeys.mjs, the fail-first table):
//   Save a recommendation that differs from the provider point estimate and read the pending
//   Market value. On the baseline: The pending value is the point estimate.
//
// Note: S284 open questions: Sheet writes stay off in the rehearsal, so this row's writes are
// proven with the deterministic Sheets adapter in backend tests. Record here only what the
// rehearsal shows; an id it cannot prove stays out (not recorded, never Yes).
//
// STATUS: stub. It records no acceptance check yet, so W12-07 scores UNVERIFIED (never Yes) until
// this file returns its checks. The contract is the qualification driver's "W12 CHECK CONTRACT"
// (one-path-november-12-qualification-driver.mjs); the function below states it in brief.

/**
 * W12-07 candidate checks. The qualification driver calls this once per run, right after
 * journeyW1207 ran on the same page, on the same build and in the same rehearsal.
 *
 * @param {object} ctx  the row's context: journeyId, kit, rehearsal, origin, leases, options,
 *   mode, binding, writes, newPage(role), resetState(), record(entry), unresolved(kind)
 * @param {import("playwright-core").Page} page  the signed-in Editor page the starting
 *   sequence used, still open where it left off
 * @param {{ observed: object | null, steps: object[], error: string | null }} start  the
 *   starting sequence's observation and step log, or (error) the message it stopped with
 * @returns {Promise<Record<string, boolean>>} AC-S278-1 to AC-S278-6 only, each true (passed) or
 *   false (failed). An id left out reads not recorded (the row UNVERIFIED); any other key reads
 *   as a mislabeled check (the row No); a throw stops the row (No).
 */
export async function checkW1207(ctx, page, start) {
  ctx.record({
    candidateChecks: "not written yet",
    startingSequence: start.error ? "stopped" : "completed",
  });
  return {};
}
