// S284 W12-12, "Plain, accurate screens": the candidate-side acceptance checks of S283 (intake
// 161) for the November 12 qualification matrix.
//
// Spec: docs/feature-suites/staff-surface-accuracy-cleanup.md (S283).
// Acceptance checks of this row (W12_MATRIX in one-path-november-12-qualification-verdict.mjs):
//   AC-S283-1, AC-S283-2, AC-S283-3, AC-S283-4, AC-S283-5, AC-S283-6, AC-S283-7, AC-S283-8
//
// Staff scenario (docs/feature-suites/staff-workflow-audit-qualification.md, W12 matrix):
//   Read each listed date rendering. Filter the month to four of nine leases, read the Prepare
//   button and line, run it and reach the allowance. Read the three pages for internal text as an
//   Editor. Read the notice basis line as an Editor and change it as an Admin. Read Connections
//   and the bulk actions. Read the steps of a standing-agreement lease and a default in
//   Documents. Double-click Start run on a Space that still runs.
//
// Starting sequence (journeyW1212 in one-path-november-12-journeys.mjs, the fail-first table):
//   Filter December to four of nine leases and click Prepare. On the baseline: All nine leases
//   are prepared and the button names no count.
//
// Note: The filter term is ctx.options.w1212Filter (driver option --w1212-filter, default
// Example).
//
// STATUS: stub. It records no acceptance check yet, so W12-12 scores UNVERIFIED (never Yes) until
// this file returns its checks. The contract is the qualification driver's "W12 CHECK CONTRACT"
// (one-path-november-12-qualification-driver.mjs); the function below states it in brief.

/**
 * W12-12 candidate checks. The qualification driver calls this once per run, right after
 * journeyW1212 ran on the same page, on the same build and in the same rehearsal.
 *
 * @param {object} ctx  the row's context: journeyId, kit, rehearsal, origin, leases, options,
 *   mode, binding, writes, newPage(role), resetState(), record(entry), unresolved(kind)
 * @param {import("playwright-core").Page} page  the signed-in Editor page the starting
 *   sequence used, still open where it left off
 * @param {{ observed: object | null, steps: object[], error: string | null }} start  the
 *   starting sequence's observation and step log, or (error) the message it stopped with
 * @returns {Promise<Record<string, boolean>>} AC-S283-1 to AC-S283-8 only, each true (passed) or
 *   false (failed). An id left out reads not recorded (the row UNVERIFIED); any other key reads
 *   as a mislabeled check (the row No); a throw stops the row (No).
 */
export async function checkW1212(ctx, page, start) {
  ctx.record({
    candidateChecks: "not written yet",
    startingSequence: start.error ? "stopped" : "completed",
  });
  return {};
}
