// S284 W12-09, "What needs me": the candidate-side acceptance checks of S280 (intake 158) for the
// November 12 qualification matrix.
//
// Spec: docs/feature-suites/staff-waiting-on-you-renewal-work.md (S280).
// Acceptance checks of this row (W12_MATRIX in one-path-november-12-qualification-verdict.mjs):
//   AC-S280-1, AC-S280-2, AC-S280-3, AC-S280-4, AC-S280-5, AC-S280-6, AC-S280-7
//
// Staff scenario (docs/feature-suites/staff-workflow-audit-qualification.md, W12 matrix):
//   Read the Dashboard after a reply, a hold and an unconfirmed send on your own leases. Create a
//   Sheet rent and date difference on three leases and read four screens, then make RentVine
//   unreadable on one. Age the renewal read. Read the notification menu as an Editor and as an
//   Admin.
//
// Starting sequence (journeyW1209 in one-path-november-12-journeys.mjs, the fail-first table):
//   Create rent differences on three leases and read the Dashboard. On the baseline: One unnamed
//   "Current rent" row.
//
// STATUS: stub. It records no acceptance check yet, so W12-09 scores UNVERIFIED (never Yes) until
// this file returns its checks. The contract is the qualification driver's "W12 CHECK CONTRACT"
// (one-path-november-12-qualification-driver.mjs); the function below states it in brief.

/**
 * W12-09 candidate checks. The qualification driver calls this once per run, right after
 * journeyW1209 ran on the same page, on the same build and in the same rehearsal.
 *
 * @param {object} ctx  the row's context: journeyId, kit, rehearsal, origin, leases, options,
 *   mode, binding, writes, newPage(role), resetState(), record(entry), unresolved(kind)
 * @param {import("playwright-core").Page} page  the signed-in Editor page the starting
 *   sequence used, still open where it left off
 * @param {{ observed: object | null, steps: object[], error: string | null }} start  the
 *   starting sequence's observation and step log, or (error) the message it stopped with
 * @returns {Promise<Record<string, boolean>>} AC-S280-1 to AC-S280-7 only, each true (passed) or
 *   false (failed). An id left out reads not recorded (the row UNVERIFIED); any other key reads
 *   as a mislabeled check (the row No); a throw stops the row (No).
 */
export async function checkW1209(ctx, page, start) {
  ctx.record({
    candidateChecks: "not written yet",
    startingSequence: start.error ? "stopped" : "completed",
  });
  return {};
}
