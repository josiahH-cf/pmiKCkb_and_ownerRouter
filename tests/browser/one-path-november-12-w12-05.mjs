// S284 W12-05, "Record the tenant's answer": the candidate-side acceptance checks of S276 (intake
// 154) for the November 12 qualification matrix.
//
// Spec: docs/feature-suites/renewal-tenant-response-review-and-reminder-stop.md (S276).
// Acceptance checks of this row (W12_MATRIX in one-path-november-12-qualification-verdict.mjs):
//   AC-S276-1, AC-S276-2, AC-S276-3, AC-S276-4, AC-S276-5, AC-S276-6, AC-S276-7
//
// Staff scenario (docs/feature-suites/staff-workflow-audit-qualification.md, W12 matrix):
//   Choose a response without saving, then save. With follow-ups authorized, confirm the next
//   tick sends none. Fail the pause write and make a reminder due. Tick the follow-up option and
//   read the filled form, then confirm an edited interval.
//
// Starting sequence (journeyW1205 in one-path-november-12-journeys.mjs, the fail-first table):
//   Choose "Accepted" with follow-ups authorized, then tick at the next due time. On the
//   baseline: Saved on selection; the reminder is sent.
//
// Note: S284 execution order: an approver publishes the follow-up copy before W12-05 checks the
// filled-in form. Rows do not share state, so this row publishes it itself, as an Approver page
// (ctx.newPage), through the control staff use.
//
// STATUS: stub. It records no acceptance check yet, so W12-05 scores UNVERIFIED (never Yes) until
// this file returns its checks. The contract is the qualification driver's "W12 CHECK CONTRACT"
// (one-path-november-12-qualification-driver.mjs); the function below states it in brief.

/**
 * W12-05 candidate checks. The qualification driver calls this once per run, right after
 * journeyW1205 ran on the same page, on the same build and in the same rehearsal.
 *
 * @param {object} ctx  the row's context: journeyId, kit, rehearsal, origin, leases, options,
 *   mode, binding, writes, newPage(role), resetState(), record(entry), unresolved(kind)
 * @param {import("playwright-core").Page} page  the signed-in Editor page the starting
 *   sequence used, still open where it left off
 * @param {{ observed: object | null, steps: object[], error: string | null }} start  the
 *   starting sequence's observation and step log, or (error) the message it stopped with
 * @returns {Promise<Record<string, boolean>>} AC-S276-1 to AC-S276-7 only, each true (passed) or
 *   false (failed). An id left out reads not recorded (the row UNVERIFIED); any other key reads
 *   as a mislabeled check (the row No); a throw stops the row (No).
 */
export async function checkW1205(ctx, page, start) {
  ctx.record({
    candidateChecks: "not written yet",
    startingSequence: start.error ? "stopped" : "completed",
  });
  return {};
}
