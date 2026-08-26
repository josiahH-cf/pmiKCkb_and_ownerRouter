<!-- spec-shape: overhaul-v1 -->

# S76 — Renewal Sheet rehearsal copy and reversible proof

> Built 2026-08-26 for meeting readiness. The operating renewal Sheet remains read-only; this suite
> gives Admins a separately configured copy and an exact-confirmed, copy-only write/read/undo proof.

**Goal.** The team can rehearse renewal-sheet write-back against a verbatim copy without creating any
path that can mistake the operating spreadsheet for the test target. Admin shows both links and says
which is view-only; a bounded operator command proves one empty cell can be written, read, restored,
and read back blank.

**What it is / how it functions.** `RENEWAL_SHEET_ID` remains the operating read source and the new
`RENEWAL_REHEARSAL_SHEET_ID` names only the copy. `resolveRenewalSheetBindings` refuses equal ids.
`RenewalRehearsalSheetPanel` exposes both links on Admin, with the operating link labeled view-only.
`proveRehearsalSheetRoundTrip` requires an exact cell that is already blank, performs a compare-and-set
synthetic marker write, reads the exact marker back, clears only that marker, and proves blank state.
The CLI is dry by default and requires both `--live` and an exact target-derived confirmation token.

- **Buildable now (app-plane).** Separate configuration, Admin links, discrepancy guidance, dry plan,
  alias refusal, exact confirmation, and fixture-driven proof are built and shipped.
- **Build to the seam (live provider).** The existing bounded Google Sheets writer is reused only by
  the operator proof. No product browser route can invoke it, and no Action Registry gate is widened.
- **Owner dependency (the one flip).** Make a verbatim copy of the operating Sheet and configure its
  spreadsheet id as `RENEWAL_REHEARSAL_SHEET_ID`. Until the distinct id exists, Admin reports setup
  needed and the proof refuses before authentication or network access.

**Open questions & assumptions.**

- _Client-owned:_ the client chooses where the copy lives and who may view it.
- _Assumption:_ `Lease Renewal!ZZ1` is an unused blank cell in the copy. The proof checks blank state
  before writing, so a false assumption causes a refusal rather than an overwrite.
- _Answered 2026-08-26:_ a rehearsal must restore the exact cell in the same run; leaving a marker in
  the copy is not a passing proof.

**Cross-product impacts.** This extends the S25/S26 write safety model without opening
`google_sheets.renewal_checklist.writeback`. It touches Admin, deployment env propagation, the existing
Sheets writer, and the meeting action center. It does not change the operating read path or the
app-owned resolution/approval stores.

**Adversarial acceptance checks.**

- **AC-S76-1** — equal operating and rehearsal ids render a refusal and no writer is constructed.
  _Verify:_ `npm test -- tests/unit/meeting-readiness-behavior.test.ts`.
- **AC-S76-2** — the copy proof refuses a nonblank target, a lost compare-and-set, a mismatched
  readback, or a mismatched clear; success requires a final blank readback. _Verify:_
  `npm test -- tests/unit/meeting-readiness-behavior.test.ts`.
- **AC-S76-3** — dry mode performs no authentication or network call and prints the exact confirmed
  sequence; live mode requires a SHA-256 confirmation bound to copy id and cell. _Verify:_
  `npm run prove:rehearsal-sheet -- --env-file=.env.local` after the copy is configured.
- **AC-S76-4** — Admin labels the operating link view-only, exposes the distinct copy link, and
  explains the reversible proof in plain language. _Verify:_
  `npm test -- tests/unit/meeting-readiness-architecture.test.mjs`; human litmus.
- **AC-S76-5** — deployment propagation may include the optional rehearsal id but never aliases it or
  enables the operating Sheet write-back switch. _Verify:_ `npm run typecheck`; `npm test`.

**Forbidden actions / hard gates.** Never run the probe against `RENEWAL_SHEET_ID`. Never overwrite a
nonblank cell. Never leave the synthetic marker behind. The operating Sheet write-back key stays
closed and every future system-of-record write remains human-confirmed, previewed, receipted,
readback-verified, and reversible. No Sheet id, client value, or credential is copied into source
control. No client-facing send occurs. A missing copy is a setup state, not permission to use the
operating file.

**Ordered prompt sequence.**

1. _Discovery:_ resolve the operating id without printing it and verify the copy id is distinct.
2. _Build:_ render the two Admin links and keep every browser control read-only.
3. _Build:_ implement blank-check, synthetic write, exact readback, exact clear, and blank readback.
4. _Gate:_ dry-run first; compare the derived confirmation with the intended cell.
5. _Owner:_ create/share the verbatim copy and provide only its id through deployment configuration.
6. _Verify:_ run the exact copy-only proof once, then inspect the copy and operating Sheet separately.
7. _Context update:_ record `F-RENEWAL-SHEET-REHEARSAL` only after the live copy proof returns
   `restored:true`; until then record the seam as built and setup as open.

**Deletion/merge recommendation.** KEEP until the first live copy proof is recorded. It can later
merge into the Sheet write-back suite as its mandatory rehearsal section; never merge its target id
with the operating read binding.
