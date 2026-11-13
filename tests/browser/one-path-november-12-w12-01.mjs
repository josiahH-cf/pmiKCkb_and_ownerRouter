// S284 W12-01, "Only the current offer goes out": the candidate-side acceptance checks of S272
// (intake 150) for the November 12 qualification matrix.
//
// Spec: docs/feature-suites/renewal-one-current-message-per-audience.md (S272).
// Acceptance checks of this row (W12_MATRIX in one-path-november-12-qualification-verdict.mjs):
//   AC-S272-1, AC-S272-2, AC-S272-3, AC-S272-4, AC-S272-5, AC-S272-6
//
// Staff scenario (docs/feature-suites/staff-workflow-audit-qualification.md, W12 matrix):
//   Schedule a tenant offer, change the working end date, tick, then try every release action.
//   Update it from the lease and send once. Repeat for an owner message and for a seeded
//   duplicate.
//
// Starting sequence (journeyW1201 in one-path-november-12-journeys.mjs, the fail-first table):
//   Schedule a tenant offer, change the end date, tick, send a new offer from the lease, click
//   "Resume reviewed sequence", tick. On the baseline: The stand-in mailbox holds two tenant
//   messages with different end dates on one thread.
//
// STATUS: stub. It records no acceptance check yet, so W12-01 scores UNVERIFIED (never Yes) until
// this file returns its checks. The contract is the qualification driver's "W12 CHECK CONTRACT"
// (one-path-november-12-qualification-driver.mjs); the function below states it in brief.

/**
 * W12-01 candidate checks. The qualification driver calls this once per run, right after
 * journeyW1201 ran on the same page, on the same build and in the same rehearsal.
 *
 * @param {object} ctx  the row's context: journeyId, kit, rehearsal, origin, leases, options,
 *   mode, binding, writes, newPage(role), resetState(), record(entry), unresolved(kind)
 * @param {import("playwright-core").Page} page  the signed-in Editor page the starting
 *   sequence used, still open where it left off
 * @param {{ observed: object | null, steps: object[], error: string | null }} start  the
 *   starting sequence's observation and step log, or (error) the message it stopped with
 * @returns {Promise<Record<string, boolean>>} AC-S272-1 to AC-S272-6 only, each true (passed) or
 *   false (failed). An id left out reads not recorded (the row UNVERIFIED); any other key reads
 *   as a mislabeled check (the row No); a throw stops the row (No).
 */
export async function checkW1201(ctx, page, start) {
  ctx.record({
    candidateChecks: "not written yet",
    startingSequence: start.error ? "stopped" : "completed",
  });
  return {};
}
