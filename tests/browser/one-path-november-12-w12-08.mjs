// S284 W12-08, "One status for everyone": the candidate-side acceptance checks of S279 (intake
// 157) for the November 12 qualification matrix.
//
// Spec: docs/feature-suites/renewal-one-status-from-one-record.md (S279).
// Acceptance checks of this row (W12_MATRIX in one-path-november-12-qualification-verdict.mjs):
//   AC-S279-1, AC-S279-2, AC-S279-3, AC-S279-4, AC-S279-5, AC-S279-6
//
// Staff scenario (docs/feature-suites/staff-workflow-audit-qualification.md, W12 matrix):
//   After a confirmed send read the step, the card and the desk row. Create a real disagreement.
//   Read the same lease as an Editor and as an Approver. Record a tenant acceptance and read the
//   stage.
//
// Starting sequence (journeyW1208 in one-path-november-12-journeys.mjs, the fail-first table):
//   Read one lease as two staff members with different mailbox links. On the baseline: Different
//   waiting status for the same lease.
//
// STATUS: stub. It records no acceptance check yet, so W12-08 scores UNVERIFIED (never Yes) until
// this file returns its checks. The contract is the qualification driver's "W12 CHECK CONTRACT"
// (one-path-november-12-qualification-driver.mjs); the function below states it in brief.

/**
 * W12-08 candidate checks. The qualification driver calls this once per run, right after
 * journeyW1208 ran on the same page, on the same build and in the same rehearsal.
 *
 * @param {object} ctx  the row's context: journeyId, kit, rehearsal, origin, leases, options,
 *   mode, binding, writes, newPage(role), resetState(), record(entry), unresolved(kind)
 * @param {import("playwright-core").Page} page  the signed-in Editor page the starting
 *   sequence used, still open where it left off
 * @param {{ observed: object | null, steps: object[], error: string | null }} start  the
 *   starting sequence's observation and step log, or (error) the message it stopped with
 * @returns {Promise<Record<string, boolean>>} AC-S279-1 to AC-S279-6 only, each true (passed) or
 *   false (failed). An id left out reads not recorded (the row UNVERIFIED); any other key reads
 *   as a mislabeled check (the row No); a throw stops the row (No).
 */
export async function checkW1208(ctx, page, start) {
  ctx.record({
    candidateChecks: "not written yet",
    startingSequence: start.error ? "stopped" : "completed",
  });
  return {};
}
