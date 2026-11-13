// S284 W12-03, "Send through a lease re-read": the candidate-side acceptance checks of S274
// (intake 152) for the November 12 qualification matrix.
//
// Spec: docs/feature-suites/renewal-send-refusal-only-for-real-changes.md (S274).
// Acceptance checks of this row (W12_MATRIX in one-path-november-12-qualification-verdict.mjs):
//   AC-S274-1, AC-S274-2, AC-S274-3, AC-S274-4, AC-S274-5, AC-S274-6
//
// Staff scenario (docs/feature-suites/staff-workflow-audit-qualification.md, W12 matrix):
//   Wait 90 seconds in an open review and Send, ten times. Change a recipient, the rent and a
//   date between review and Send. Make a message due during a read in flight and after a real
//   change.
//
// Starting sequence (journeyW1203 in one-path-november-12-journeys.mjs, the fail-first table):
//   Inject an admission that commits between the floor reads and the notice observation, then
//   confirm. On the baseline: The "recipients or source facts changed" refusal with nothing
//   edited.
//
// Note: The starting sequence tries up to ctx.options.w1203Attempts times (driver option
// --w1203-attempts, default 3) with --w1203-wait seconds open (default 75), resetting the harness
// between tries that sent.
//
// STATUS: stub. It records no acceptance check yet, so W12-03 scores UNVERIFIED (never Yes) until
// this file returns its checks. The contract is the qualification driver's "W12 CHECK CONTRACT"
// (one-path-november-12-qualification-driver.mjs); the function below states it in brief.

/**
 * W12-03 candidate checks. The qualification driver calls this once per run, right after
 * journeyW1203 ran on the same page, on the same build and in the same rehearsal.
 *
 * @param {object} ctx  the row's context: journeyId, kit, rehearsal, origin, leases, options,
 *   mode, binding, writes, newPage(role), resetState(), record(entry), unresolved(kind)
 * @param {import("playwright-core").Page} page  the signed-in Editor page the starting
 *   sequence used, still open where it left off
 * @param {{ observed: object | null, steps: object[], error: string | null }} start  the
 *   starting sequence's observation and step log, or (error) the message it stopped with
 * @returns {Promise<Record<string, boolean>>} AC-S274-1 to AC-S274-6 only, each true (passed) or
 *   false (failed). An id left out reads not recorded (the row UNVERIFIED); any other key reads
 *   as a mislabeled check (the row No); a throw stops the row (No).
 */
export async function checkW1203(ctx, page, start) {
  ctx.record({
    candidateChecks: "not written yet",
    startingSequence: start.error ? "stopped" : "completed",
  });
  return {};
}
