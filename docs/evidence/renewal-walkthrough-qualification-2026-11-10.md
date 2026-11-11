# November 10 renewal walkthrough qualification

The owner authorized intakes 139–149 (S261–S271) as one cumulative application run with
mainline integration and native Cloud Run delivery. The eleven transferred specifications
and the November 10 registry section matched the authoring files byte for byte. The batch
started at exact remote main `9b3bb69e2694d72c8312c4c8a5e42cb984f895aa`. Two owner-directed
authentication fixes moved main during the run: PR #200 at `2f3d3d2e` (with the
fast-xml-parser 5.12.0 lockfile patch for GHSA-474x-hrwr-fgx4) and PR #201 at `80bb2d22`.
Both merged into the batch before the final gates. [Fail-first and preservation baseline](renewal-walkthrough-baseline-2026-11-10.md)

## Exact cumulative qualification

S271 engineering is **Yes** on exact source `c0f6490e8659a3aa684099590efbbbcbef7c6deb`,
compiled build `EvsdEv_bUWl9gRTP0vv6O` and private run `20261111T164228Z-c0f6490e` with the
synthetic mail adapter. Matrix `S271-2026-11-10.2` is complete with nine Yes rows, no mixed
build and zero refused outbound connections. N10-06 is the human read-through.
**Human verdict: NOT RUN — no human observer.**

The Thursday core checkpoint verdict is **Yes** from the same run, recorded in its own
`thursday` scope. The November 12 checkpoint stays separate from cumulative admission, and
November 13 remains the S271 staff review and issue intake.

The full S260 replay is **Yes** on the same source, compiled build `uxwowqkZnQ7B3dwpOgdUQ`
and private run `20261111T171533Z-c0f6490e`: all ten journeys and the three Help roles, twelve
Yes rows and zero refused connections. Its Help proof binds canonical run
`20261111T165300Z-c0f6490e` (Help V4.0, 27 matched scenes, 882 controls, none missing) and the
deliberate drift run `20261111T171432Z-c0f6490e-overlay`, which reported the hidden Work status
control missing. N09-10 checked 28 outcomes, kept reconciliation ahead of any send and rejected
all five rendered negative controls: hidden fixes, duplicate editors, effectful evidence, old
Full clutter and a blocked Send competing with reconciliation. Earlier S254, S259 and S260
reports keep their original sources, scopes and verdicts.

`bash scripts/verify.sh` passed on the exact source in the native checkout from 16:52 to
17:13 UTC: zero production dependency vulnerabilities, every policy and context gate, spec
traceability for 1,134 acceptance IDs across 185 specifications, Help coverage, control names,
screenshots, content and exact rendered Help, the budget guard, format, lint, typecheck, 12,073
unit tests in 1,216 files, 601 Firestore tests in 104 files, the production build and served
E2E with 65 passed and 4 skipped. `npm run test:e2e:core` passed with 46 passed and 23
skipped. Rendered Help needed one capture repair: each Full view frame now releases the
pointer and any focused info button before capture, and the document-handoff picture was
re-adopted from the settled capture.

| Intake   | Case   | Verified outcome                                                                                                                                                                                                                                        |
| -------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 139 S261 | N10-01 | Current base rent and pet rent stay separate. The saved comparison and owner draft resume with no new lookup, the owner copy uses the base, a prior cycle is refused as current and the correction reads back exactly.                                  |
| 140 S262 | N10-02 | The uncertain owner send reconciles first. A different approved base records apart from the preserved recommendation, amount-only coverage holds, concurrent and late prior-cycle saves are refused and tenant preparation uses the approved base.      |
| 141 S263 | N10-03 | The next-day start comes from the verified end. Working and source dates stay distinct, a source disagreement holds, invalid ranges and a scheduled recheck are refused and the fix returns to the tenant offer.                                        |
| 142 S264 | N10-04 | The Admin mapping saves and reads back. Two lines of one family, a permitted case fee and exact separate totals ($1,547.50 monthly, $35.00 one time) review exactly; ended and unknown lines are declined and stale or drifted sources refuse at claim. |
| 142 S264 | N10-04 | After one charge-only change, both recorded answers read as earlier offers. Offer the tenant leads with Record the tenant's answer for the current offer, Finish up waits with the exact difference and the RentVine confirmation added no claim.       |
| 143 S265 | N10-05 | Pending links show their Connections fix. Changed or required flyers are enforced, the exact review binds its evidence, a same-link proof change and a wrong recipient refuse, and an uncertain attempt reconciles without a send.                      |
| 144 S266 | N10-09 | The verified program contact records once. An absent or duplicate vendor stays Source pending, nothing is inferred and no copy recipient is added.                                                                                                      |
| 145 S267 | N10-09 | A trainee prepares the renewal and the lead inspects it inside the app, with no granted access and no routing.                                                                                                                                          |
| 146 S268 | N10-10 | Applicable families and pending map decisions show. Both exact Dotloop keys refuse, the manual handoff stays available, protected fields hold and the shared charge discrepancy waits. Zero provider effects.                                           |
| 147 S269 | N10-07 | The active field leads in seven outcomes and five Full sections, in both themes and widths and for supported roles. Stale or failed saves are kept through view switches and returns.                                                                   |
| 148 S270 | N10-08 | Named groups start closed, open by keyboard and mouse, link exactly to their owner and return focus. All five negative controls were rejected and evidence has no effect.                                                                               |
| 149 S271 | All    | Complete matrix and separate Thursday verdict on one exact build. Human verdict: NOT RUN — no human observer.                                                                                                                                           |

## Decisions recorded during qualification

- **Acceptance of an earlier offer (S264 R-S264-6).** Offer the tenant stays open and the
  RentVine renewal date, rent and charge updates and the Sheet renewal date wait, refused
  before any claim. The current base rent correction never waits. A RentVine charge update
  with no stated purpose waits too. The Renewal Desk row keeps the recorded stage, since
  reading coverage there would add four reads per accepted lease on every render. Answers
  recorded before S264, and comparisons that cannot be read, keep their recorded reading.
- **Unresolved sends.** Ask the owner leads with Check whether the message went out ahead
  of an owner reply, and Send again stays hidden until that check settles.
- **S252 owner-decision budget.** Recording the owner's answer takes five deliberate
  actions against the S252 bound of three, because S262 requires Outcome, Amount approved,
  the evidence, review and save. S262 governs.
- **S252 first screen on Check the numbers.** The primary action sits 141 px below the
  1280 by 800 screen measured from the page top. S269 measures from the heading, where it
  fits in 446 px. S269 governs; the page-top result is recorded below.
- **Rehearsal boundary for N10-04.** The Demo environment refuses a RentVine confirmation
  before the acceptance hold is read, and a status read of a saved preview stays closed by
  the Live execution ledger, as in S260. The hold refusal is covered by
  `tests/unit/s97-rentvine-writeback-route.test.ts` and
  `tests/firestore/s264-acceptance-hold.test.ts`, and the panel's Tenant acceptance row by
  `tests/unit/s264-acceptance-hold-ui.test.tsx`.
- **Optional form made usable (N10-05).** A reviewed draft that omitted the information
  form is refused once the form becomes usable, because the current message would then
  differ from the exact review. The person reviews again.

Scoped S252 ran on the same source in run `20261111T172308Z-c0f6490e` (development server,
named commit). Twenty checks passed, including the release canary's own landmark predicates on
its desk table and the prepared, covered and assisted leases, and four of five budgets stayed in
bounds. The two remaining results are the scoped conflicts above: the owner decision measured
five actions against three, and the page-top first-screen check failed on Check the numbers.
The only refused connections were two named development-tool registry checks.

## Source pending and holds

| Hold                                        | What clears it                                                                                       |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| S264 fees and charge mappings               | An Admin saves Offer charge mappings and the verified fee sources; until then those lines hold.      |
| S265 tenant flyers and the information form | An Admin records each link's tenant audience check in Connections.                                   |
| S268 Dotloop forms and maps                 | The form owners approve each form and map. Both Dotloop write keys stay closed and signing is human. |
| S266 RentVine program source                | A qualified RentVine vendor or program read; the verified program contact is used until then.        |
| S267 process routing                        | B-PROCESS-OWNER: Dan and the team name the responsible managed staff.                                |
| N10-06 human review                         | The November 13 staff review with an observer.                                                       |

## Rollout notes for renewals already in progress

- Working values saved before S262 read Not confirmed for this renewal until confirmed.
- A base reads Needs verification when the RentVine rent charge differs from the contract.
- Until an Admin saves Offer charge mappings, non-rent lines hold tenant offers.
- Draft previews prepared before the release need a fresh preview, and a scheduled tenant
  send with non-rent lines pauses once for review.
- After an Admin records an audience check, or a lease saves its own charge selection,
  rolling back to the November 9 build leaves that record unreadable to the older code, which
  holds the affected sends and offers.

## Earlier runs (preserved)

- `20261111T150304Z-b5826c1d`: S271 recorded seven Yes. N10-04 waited for a RentVine status
  the rehearsal keeps closed, and N10-05 failed only because it reuses N10-04's lease.
  `20261111T152702Z-cd6ebd15` named the refused status read; the driver now reads the saved
  preview as S260 does.
- `20261111T151307Z-b5826c1d` (S260 Yes) and `20261111T152042Z-b5826c1d` (S252 with the same
  two scoped results) ran on an earlier source with the same application code.
- Exact rendered Help on `1208c6b2` and `b8287989` matched 20 of 27 scenes; the seven scenes
  showing the S261–S270 screens were re-adopted at `b5826c1d`. On `8597e1a7` the full gate
  stopped at one capture-state difference in document-handoff, repaired as described above.
- Development runs are not verdicts: `20261111T140802Z-9b3bb69e-overlay` recorded all nine N10
  cases Yes before the compiled matrix.
