// S284 W12-04, "The reply reaches the decision": the candidate-side acceptance checks of S275
// (intake 153) for the November 12 qualification matrix.
//
// Spec: docs/feature-suites/renewal-replies-reach-the-lease.md (S275).
// Acceptance checks of this row (W12_MATRIX in one-path-november-12-qualification-verdict.mjs):
//   AC-S275-1, AC-S275-2, AC-S275-3, AC-S275-4, AC-S275-5, AC-S275-6
//
// Staff scenario (docs/feature-suites/staff-workflow-audit-qualification.md, W12 matrix):
//   Send an owner message, deliver a reply with the stand-in, tick, and read the desk and the
//   lease. Repeat with the lease's own check and with a failing mailbox read. Follow the
//   notification.
//
// Starting sequence (journeyW1204 in one-path-november-12-journeys.mjs, the fail-first table):
//   Send an owner message, deliver a reply, tick, open the desk and the lease, use every visible
//   refresh. On the baseline: The lease keeps waiting; no visible control shows the reply.
//
// STATUS: stub. It records no acceptance check yet, so W12-04 scores UNVERIFIED (never Yes) until
// this file returns its checks. The contract is the qualification driver's "W12 CHECK CONTRACT"
// (one-path-november-12-qualification-driver.mjs); the function below states it in brief.

/**
 * W12-04 candidate checks. The qualification driver calls this once per run, right after
 * journeyW1204 ran on the same page, on the same build and in the same rehearsal.
 *
 * @param {object} ctx  the row's context: journeyId, kit, rehearsal, origin, leases, options,
 *   mode, binding, writes, newPage(role), resetState(), record(entry), unresolved(kind)
 * @param {import("playwright-core").Page} page  the signed-in Editor page the starting
 *   sequence used, still open where it left off
 * @param {{ observed: object | null, steps: object[], error: string | null }} start  the
 *   starting sequence's observation and step log, or (error) the message it stopped with
 * @returns {Promise<Record<string, boolean>>} AC-S275-1 to AC-S275-6 only, each true (passed) or
 *   false (failed). An id left out reads not recorded (the row UNVERIFIED); any other key reads
 *   as a mislabeled check (the row No); a throw stops the row (No).
 */
export async function checkW1204(ctx, page, start) {
  ctx.record({
    candidateChecks: "not written yet",
    startingSequence: start.error ? "stopped" : "completed",
  });
  return {};
}
