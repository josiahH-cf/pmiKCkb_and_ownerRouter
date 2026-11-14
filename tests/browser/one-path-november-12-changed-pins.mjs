// S284 R-S284-4 and AC-S284-4: the replay pins the November 12 qualification reads as changed,
// each with its owning suite. The report lists each entry under "Changed pins".
//
// Each entry is { pin, suite }. An exact S252 check or budget id can scope a replaced bound.
// The other entries name the observed part of an S260, S271 or S252 check that the replay
// now proves directly against its replacement requirement. Those entries cannot excuse a
// failed check or replay.
//
// Carried from the S271 qualification (docs/evidence/renewal-walkthrough-qualification-2026-11-10.md,
// "S252 owner-decision budget" and "S252 first screen on Check the numbers"):
//   journey.owner-decision  recording the owner's answer takes five deliberate actions against the
//                           bound of three, because S262 requires Outcome, Amount approved, the
//                           evidence, review and save. S262 governs.
//   journey.layout-steps    on Check the numbers the primary action sits below the 1280 by 800
//                           screen measured from the page top; S269 measures from the heading.
//                           S269 governs.
import { S283_PREPARATION_PIN } from "./one-path-november-9-qualification-verdict.mjs";

export const CHANGED_PINS = Object.freeze([
  Object.freeze({ pin: "journey.owner-decision", suite: "S262" }),
  // The S285 fact changed inside the old budget. The separate four-action proof must pass.
  Object.freeze({
    pin: "journey.owner-decision.replyingOwnerPreselection",
    suite: "S285",
  }),
  Object.freeze({ pin: "journey.layout-steps", suite: "S269" }),
  Object.freeze({ pin: S283_PREPARATION_PIN, suite: "S283" }),
  Object.freeze({ pin: "N09-02.changedCycleAtMonthEnd", suite: "S282" }),
  Object.freeze({ pin: "N09-03.exactEditorReturn", suite: "S281" }),
  Object.freeze({ pin: "N10-01.ownerDraftResumed.editInPlace", suite: "S281" }),
  Object.freeze({ pin: "N10-03.returnToTenantOffer", suite: "S281" }),
  Object.freeze({ pin: "N10-03.noStoredDurationManualEnd", suite: "S285" }),
  Object.freeze({ pin: "N10-03.scheduleDisclosure", suite: "S281" }),
  Object.freeze({ pin: "N10-04.caseChargeDisclosure", suite: "S281" }),
  Object.freeze({ pin: "N10-05.resourceFixAfterConfirmedSend", suite: "S281" }),
  Object.freeze({ pin: "N10-07.namedWorkGroups", suite: "S281" }),
  Object.freeze({ pin: "N10-08.namedWorkGroups", suite: "S281" }),
  Object.freeze({ pin: "journey.comparison.ownerMessagePlacement", suite: "S281" }),
  Object.freeze({ pin: "journey.complete.tenantContactGroup", suite: "S281" }),
]);
