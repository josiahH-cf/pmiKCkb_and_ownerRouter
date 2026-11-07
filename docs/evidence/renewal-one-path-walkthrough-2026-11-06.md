# S252 one-path renewal walkthrough, action budgets, defect ledger and help, 2026-11-06

R-S252-8 evidence for `docs/feature-suites/renewal-one-path-staff-walkthrough-and-help.md`.
Synthetic rehearsal data only (the "November 5 mix", Example and Sample names, `example.invalid`
addresses, invented rents); no customer value, body or screenshot is in Git. Each run's journey
result (`journey.json`), step log, server log, stand-in log and refused-connection logs stay in
private local state under `~/.local/state/pmi-kc-one-path-rehearsal/<run>/`. No production record
was created and nothing was sent to a person: every send in these runs was accepted by the
rehearsal's loopback mail stand-in.

Human verdict: NOT RUN — no human observer

## Scope of the resumed review

The builder runs below are retained provenance. They predate the resumed review's guard repairs
and do not establish fresh independent acceptance or final-source qualification. The resumed
[UX review](renewal-one-path-ux-review-2026-11-06.md) records the offline guard falsification,
the corrected committed-source observations and each remaining evidence gap. The original
builder outcomes retain their dates, source commits and actual qualification limits.

The fresh starting-commit walk reached nine required actions plus one optional action across
three tabs before its preserved Demo gate refused Send. Its exact final review, confirmation
and completed baseline send remain UNVERIFIED. The older ten-action count below is the builder's
reported count; it is not substituted for that fresh observation or for an actual provider result.

The default S252 driver includes a phase that deliberately enables automatic preparation. The
owner's current hard limit leaves that phase unrun. Its documented phase selector permits the
other five phases with `--hold-automatic-comparison`; a selected-phase result is reported with
that scope and never as a full default-driver pass. Human and client-answer columns stay NOT RUN
or retain their named outside input.

The first weekly staff session is November 10, 2026. No staff session was held for this evidence,
so every human column below reads NOT RUN and no human result is inferred. Nothing in this file
marks a litmus check Yes; the S254 litmus runs in a fresh session after S252 merges.

## Runs

Every run below served a committed tree (no overlay). `f88ce24b` is the last code commit;
`af757bba` differs from it only in the wording of the reply choice on the owner's decision (with
its unit test) and the ledger check's type declaration, neither of which the runs on `af757bba`
read.

| Run                                  | Served source                                                       | Driver or command                                                                      | Result                                                                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20261106T155130Z-f88ce24b`          | `f88ce24b`                                                          | journey driver, candidate, every phase                                                 | 103 passed, 0 failed; budgets 5 of 5 within bounds; 2 refused connections, both `registry.npmjs.org`.                                                                   |
| `20261106T161242Z-f88ce24b`          | `f88ce24b` with `--no-mail-adapter`                                 | journey driver, verification session                                                   | 5 passed, 0 failed: the four S249 verification-session checks and the refused-connection check.                                                                         |
| `20261106T151743Z-6491c06f-named`    | starting commit `6491c06f`, the harness files of `af757bba` over it | journey driver, named commit: the kickoff from that commit's own guides                | Expected fail-first: guides read (pass), the kickoff followed up to and including the confirmation (pass), budget OUTSIDE at 10 actions across 3 tabs; exit 1.          |
| `20261106T151941Z-af757bba`          | `af757bba` with `--serve --no-mail-adapter`                         | `scripts/smoke-renewal-desk-browser.mjs` and `scripts/smoke-renewal-focus-browser.mjs` | Both passed: the desk smoke end to end (working batch, cardinality, filters, sort, lease and back), the focus smoke on 2 lease workspaces with Guided view the default. |
| `20261106T152258Z-af757bba` (help)   | `af757bba`                                                          | `bash scripts/run-help-rehearsal.sh --check`                                           | 27 scenes resolved, 0 uncaptured.                                                                                                                                       |
| `20261106T152556Z-af757bba` (help)   | `af757bba`                                                          | `bash scripts/run-help-rehearsal.sh --controls`                                        | 825 controls: 627 visible, 198 conditional and unavailable in that state, 0 missing.                                                                                    |
| help rehearsal `--serve` (lane log)  | `af757bba`                                                          | `scripts/smoke-renewal-guide-controls-browser.mjs`                                     | Passed: 84 guide steps located by exact locators; L54 70 of 70 starting rows found (0 by a new name, 21 conditional); desk to lease and back in one tab.                |
| `20261106T154258Z-af757bba` (novdec) | `af757bba`                                                          | `bash scripts/run-renewal-novdec-journey.sh` (L59, journey part)                       | 36 PASS, 0 FAIL.                                                                                                                                                        |

Development runs found the defects listed under "Repairs" and are kept as failed evidence:
`20261106T120510Z-daf8ee05-overlay` (92 passed, 9 failed), `20261106T122914Z-daf8ee05-overlay`
(98 passed, 4 failed), the journey-only runs `20261106T133719Z` and `20261106T134656Z` (each
`journey.complete` failed: after the tenant accepted, the card asked for the tenant offer again),
and the smoke runs that stopped at the party filter, the token pattern, the sort click and the
section navigation. A run labeled `daf8ee05-overlay` served the branch base with the branch's files
laid over it; it is not evidence for a committed source SHA on its own. The first starting-commit
run, `20261106T124759Z-6491c06f-named` (harness of an earlier branch commit), measured the same 10
actions and 3 tabs as the final one. Earlier full candidate runs on committed trees also passed:
`20261106T141954Z-8f301c15` (102 passed, 0 failed) and `20261106T145349Z-af757bba` (103 passed, 0
failed, with the L14 step added).

## Environment

- **Runner:** `bash scripts/run-renewal-one-path-rehearsal.sh --driver tests/browser/one-path-journey-driver.mjs`
  (candidate), the same with `--no-mail-adapter` (verification session), and
  `--commit 6491c06f3773e92c0bd811d4360371523e24d643 --driver tests/browser/one-path-journey-driver.mjs`
  (starting commit). The real Next dev server in the Demo descriptor with local demo sign-in,
  Firestore and Auth emulators on loopback ports, the synthetic RentVine transport, and the
  comparison, mail and model stand-ins on 127.0.0.1. Headless Chromium limited to the rehearsal
  origin.
- **Provider boundary:** `tests/browser/renewal-novdec-journey-network.mjs` loads in every process
  the run starts: the server, the rehearsal process, the driver and each harness child the journey
  starts (the guide reader and the canary landmark check run with tsx and refuse to start unless the
  boundary is active in their own process, as the due-message tick does).
- **Phase isolation:** each builder phase after the first starts from the rehearsal's starting state
  (`scripts/lib/one-path-rehearsal/reset.mjs`: stand-ins, RentVine controls and the emulator
  cleared, RentVine read again with the recorded cycle dates, the same seed steps run again). The
  served app's per-address comparison cache (`lib/lease-renewal/rentcast-quota.ts`, six hours) is
  in server memory and is not cleared, so the phases that count comparison requests run first:
  S249 kickoff, S254 stand-in proof, S254 smoke, the journey (on the smoke's state), then the S247
  and S248 guided path and the S250 and S251 variants.
- **Party filter key:** the rehearsal server now gets a fresh random `RENEWAL_DESK_PARTY_FILTER_KEY`
  each run (`scripts/one-path-rehearsal.mjs`), as production has a configured key; without one the
  desk's owner and tenant header filters read "Party filtering is unavailable." and the desk smoke
  could not reach them.

## Action budgets (R-S252-1, ARCH-S252-1)

Counted from the journey driver's own step log (`scripts/lib/one-path-rehearsal/journey-kit.mjs`):
a deliberate action is a choice, an entry or a confirmation the driver performs; scrolling is
logged and not counted; optional edits (changing a suggested rent, adding a reason) are logged as
optional and excluded; reads (opening a path strip step to look at it) are logged as reads; pages
and tabs are read from the browser context.

| Budget (journey step)                                                                           | Bound                               | Candidate (20261106T155130Z-f88ce24b)                                                                | Starting commit `6491c06f`             |
| ----------------------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Opening Renewals shows the working batch (`journey.desk-batch`, L01)                            | 0 actions, 1 page                   | 0 actions, 1 page                                                                                    | not measured (no working batch)        |
| One action opens a lease in the same tab (`journey.open-lease`, L08)                            | 1 action, 1 page                    | 1 action, 1 page                                                                                     | opening the lease opened a second tab  |
| Prepared kickoff (`journey.kickoff-budget`, L23, L24)                                           | 3 actions, 1 page                   | 3 actions, 1 page                                                                                    | 10 actions across 3 tabs: OUTSIDE      |
| After the confirmed send (`journey.send-evidence`, L25)                                         | 0 actions, 1 page                   | 0 actions, 1 page                                                                                    | not measured (a send is refused there) |
| Owner's decision from an observed reply (`journey.owner-decision`, L36)                         | 3 actions, nothing preselected      | 3 actions, 1 page, nothing preselected                                                               | not measured (6 actions on `daf8ee05`) |
| No other page, one next step at every point (`journey.one-next-step`, L17, L53)                 | 1 page, one next step               | 1 page, one next-step line and one primary action at each of 7 points to Complete                    | not measured                           |
| First screen at 1280 by 800, two screens at 390 (`journey.layout`, `journey.layout-steps`, L14) | no scroll at 1280; 2 screens at 390 | stage, strip and primary within 800 px on all four steps; primary bottom at most 1600 of 1688 at 390 | not measured                           |

**L24, both counts.** The candidate's kickoff on the prepared lease, followed from the rewritten
in-app guide "Work a renewal from the desk to a recorded outcome" (V2.0, read from the served
tree's `lib/help`), takes 3 deliberate actions on 1 page: choose the lease under This batch, Review
and send, Send this message. The starting commit's kickoff on the same lease, followed from that
commit's own in-app guides (its `lib/help/content`, read as data), takes 10 deliberate actions
across 3 tabs: choose the lease (a second tab opens), Full view, Market rent comparison, Look up
market comps (reference only), PMI recommended monthly rent, Working monthly rent, Owner approval,
Compose owner message in Communications (a third tab opens), Save draft, Send. Steps that only
read, and the optional copy and Gmail draft routes, are left out, so 10 is the fewest those guides
allow. On the starting commit the Demo environment refuses a send, so that count covers the actions
up to and including the confirmation (Send was chosen; nothing was sent). The November 5
observation of at least eleven actions across three tabs is consistent with this count.

No budget is met by removing a review or a confirmation (AC-S252-1): the candidate's kickoff count
includes the exact review (Review and send) and its own confirmation (Send this message), and the
journey asserts both were shown for every send, the decision record and each staff completion it
made (`journey.review-shown`, `journey.reviews-and-confirmations`).

## Journey steps (R-S252-2) in run 20261106T155130Z-f88ce24b

The journey's own steps, in order, on the "November 5 mix" (working month December 2026; the five
working-month leases 9101 prepared, 9102 covered by a standing agreement, 9103 housing
assistance, 9104 missing a verified owner recipient, 9105 replied). All passed.

| Step                                | Litmus          | Observed                                                                                                                                                                                                                                                                                                           |
| ----------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `journey.desk-batch`                | L01             | `/lease-renewal/live/desk` reads "Five leases ending in December 2026 need renewal work." and lists 9101, 9104, 9102, 9103 and 9105 under This batch, with no action.                                                                                                                                              |
| `journey.guide-kickoff-read`        | L61             | The served tree's guide "Work a renewal from the desk to a recorded outcome" (V2.0) teaches a kickoff that ends in Send this message.                                                                                                                                                                              |
| `journey.kickoff-from-guide`        | L61, L23        | All six guide steps followed by the control each names: Working batch (read), This batch (choose lease 9101), Renewal path (read), Owner message (read), Review and send, Send this message.                                                                                                                       |
| `journey.layout`                    | L14             | On Ask the owner at 1280 by 800, scroll 0: stage line 475 to 500, path strip 508 to 563, primary action 651 to 698.                                                                                                                                                                                                |
| `journey.numbers`                   | L21             | Check the numbers and Compare market rent read done; the lease opened at Ask the owner with Review and send as its primary action, in Guided view.                                                                                                                                                                 |
| `journey.comparison`                | L22, L32        | One stored comparison of 5 comparables, Rent to recommend 1400 with its basis in words, the owner message preview; no comparison was requested before or after.                                                                                                                                                    |
| `journey.review-shown`              | L58             | The exact review and Send this message were shown before the send.                                                                                                                                                                                                                                                 |
| `journey.owner-reply`               | L36             | After the stand-in delivered a reply from `jordan.sample@example.invalid`, the lease read "Owner replied 11/06/2026" with "Record the owner's decision" as its one next step.                                                                                                                                      |
| `journey.owner-decision-recorded`   | L36             | The Now card's decision was saved (200) through the staff record, nothing preselected, and the lease moved to Offer the tenant.                                                                                                                                                                                    |
| `journey.complete`                  | L53             | From Offer the tenant: Tenant offer delivered: Done (hand record), Tenant response: Accepted, Information form sent and returned: Done, the three document records Done, seven follow-ups Not applicable, then Record staff completion with its confirmation: 15 actions, 1 page, ending "Complete: staff status". |
| `journey.one-next-step`             | L53, L17        | One next-step line and one primary action at each of the 7 points from Offer the tenant to Complete, Guided view pressed, no other page.                                                                                                                                                                           |
| `journey.standing-agreement`        | L46             | Lease 9102 reads "Covered by Example Standing Agreement: no owner message needed", continues at Offer the tenant and carries the "Standing agreement" tag.                                                                                                                                                         |
| `journey.recipients`                | R-S252-11       | No field on the lease page takes a typed recipient.                                                                                                                                                                                                                                                                |
| `journey.housing-assistance`        | L49, L33        | Lease 9103's path: Check the numbers, the program contact, the owner's renewal answer, the rent choice, then the standard steps; the "Housing assistance" tag; 0 comparisons requested for it.                                                                                                                     |
| `journey.cross-lease-values`        | AC-S252-5, L70  | A rent of 1437 and a date of 2027-02-17 typed on one lease stay on it and are suggested on no other lease, portfolio or policy.                                                                                                                                                                                    |
| `journey.renewed-in-source-closure` | L04, BEH-S246-2 | Lease 9132 offered Record staff completion and Keep working, completed only after its confirmation, and left Renewed in RentVine (3 to 2) for Coming up later (12 to 13); 38 leases counted once before and after.                                                                                                 |
| `journey.layout-steps`              | L14             | Lease 9104, each step opened from the path strip: at 1280 by 800 the primary action ends at 705, 672, 705 and 672 px on Check the numbers, Compare market rent, Ask the owner and Offer the tenant; at 390 by 844 at 1600, 1542, 1522 and 1489 px (limit 1688).                                                    |
| `journey.reload-continuity`         | L18             | A reload on Ask the owner returned to "Now: Ask the owner" in Guided view at the same place (4061 px) with the typed Working monthly rent 1388 kept by the autosave.                                                                                                                                               |
| `journey.canary-landmarks`          | R-S252-7        | See "Assurance follows the screens".                                                                                                                                                                                                                                                                               |
| `journey.reviews-and-confirmations` | L58, AC-S252-1  | Four effects, each with its review and its own confirmation: the owner message send, the owner's decision, the staff completion and the renewed-in-RentVine completion.                                                                                                                                            |
| `run.refused-connections`           | L58             | 2 refused connections, both `registry.npmjs.org`; none aimed at production, a provider or a mailbox.                                                                                                                                                                                                               |

## Builder checks re-proved in run 20261106T155130Z-f88ce24b

The journey imports each builder driver's named, self-checking steps and runs them as phases, each
after the reset above; every check keeps its own name and result (`<phase>.<nn>` in
`journey.json`).

| Phase (driver)                                               | Checks | Result    | What it proves, in short                                                                                                                                                                             |
| ------------------------------------------------------------ | ------ | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `s249-kickoff` (`tests/browser/one-path-kickoff-driver.mjs`) | 24     | 24 passed | L21 to L35, L40, L42, L44, L45, L58: the batch's own preparation, the allowance, the stored comparison reused, ready-for-review order, the three-action send, the Gmail draft, rewording, signature. |
| `s254-stand-in-proof` (`one-path-stand-in-proof-driver.mjs`) | 15     | 15 passed | Each stand-in answers through the app's own boundary: comparison once, allowance refusal, rewording, the assistant, RentVine status, mail accepted, reply, unconfirmed, bounce, `example.invalid`.   |
| `s254-smoke` (`one-path-smoke-driver.mjs`)                   | 1      | 1 passed  | The default Renewals list shows leases, every one from the November 5 mix.                                                                                                                           |
| `s247-s248-guided-path` (`one-path-guided-path-driver.mjs`)  | 21     | 21 passed | Guided view default on the five leases with no write, the layout at 1280 and 390, a later step, reload, the three views, the send's evidence states, the due-message tick.                           |
| `s250-s251-variants` (`one-path-variants-driver.mjs`)        | 21     | 21 passed | The batch counts (This batch 5, Carried over 4, Renewed in RentVine 3, Month-to-month 3, Non-renewals 1, Coming up later 12, Not renewal targets 10, 38), standing agreements, housing assistance.   |

The S249 verification-session proof (`tests/browser/one-path-kickoff-verification-driver.mjs`, 4
checks) runs in its own run with `--no-mail-adapter`: in `20261106T161242Z-f88ce24b` the automated session with the setting on and leases with no stored comparison started no lookup (zero comparison requests at the stand-in), attempted no mutation (every non-GET request aborted and counted) and sent nothing off the machine.

## Defect ledger and walkthrough matrix (R-S252-3 to R-S252-5, R-S252-9 to R-S252-11)

Independent review on the resumed source contradicted N4-18's covered-owner primary (L46/L60):
the earlier check verified the coverage label and current path, while the primary still asked to
send. The UX repair and the strengthened variants driver now require Continue to Offer the
tenant and activate it to check its destination. This updates the current checked ledger in
place; the historical runs below retain their original scope and outcomes. Current independent
observations are in `docs/evidence/renewal-one-path-ux-review-2026-11-06.md`.

The ledger is checked data: `scripts/lib/one-path-walkthrough/defect-ledger.json`, checked by
`scripts/lib/one-path-walkthrough/ledger-check.mjs` (`node scripts/check-one-path-defect-ledger.mjs`,
and `tests/unit/s252-defect-ledger.test.ts`). The check resolves every owning id against its
definition in `docs/feature-suites/*.md` and reads the R-S252-3 and R-S252-11 tables from the
specification on the tree. With `--journey <journey.json>` it also fails a verified row whose cited
journey step or builder check that run observed failing (L60). Against 20261106T155130Z-f88ce24b:
"One-path defect ledger check passed: 29 rows (25 verified, 4 open with a reason), 36 walkthrough
matrix rows, none contradicted by run 20261106T155130Z-f88ce24b." Fail-first (ARCH-S252-2), in the lane copy
only: with the ledger data file moved aside `tests/unit/s252-defect-ledger.test.ts` failed 9 of 9
(ENOENT on `defect-ledger.json`); with the check module also moved aside the file failed to import
`ledger-check.mjs`; restored, 9 of 9 pass. The AC-S252-2 and AC-S252-5 cases (a removed row, an
unknown owning id, an empty result, a reported row with no check result, a contradicted row, a
matrix human column other than NOT RUN) are each a test that the check rejects.

- **The twenty November 4 problems (N4-01 to N4-20):** each verified, naming the journey step,
  builder check or test that proves it.
- **Outside this bundle (R-S252-4):** OUT-1 (no sign of progress after a question, owner S171) and
  OUT-2 (an answer that reused an earlier conversation's month, owner S199) are open with their
  owners and not fixed here.
- **Reported items (R-S252-11), each with its check result:**
  - Inactive properties in filters: the same report as N4-01 (closed leases); verified.
  - Evicted tenants in filters: open. The source field is the RentVine lease status (each lease's
    `leaseStatusID` through `GET /leases/statuses`: an eviction in progress is a status whose
    `isPendingMoveOutStatus` flag is set, a finished one a closed status), which R-S246-1 and
    R-S246-4 already read; the operating Sheet's free-text status can also carry the word, and no
    target rule reads it. The November 5 mix has no eviction status, so the report is not
    reproduced. No rule was changed.
  - Revised pricing not kept in a draft: the same problem as N4-08; verified.
  - Revised recipients not kept in a draft: open, not reproduced. A message's recipients are the
    lease's verified recipients; no field on the lease page or in the composer takes a typed
    recipient (`journey.recipients`). A recipient changed inside Gmail stays in that Gmail draft.
  - Housing assistance handling (S251), Renewal screen usability (S247) and MKD selection
    (R-S250-2, R-S250-3): confirmed and verified.
- **No cross-lease default (AC-S252-5, L70):** a rent and a date typed on one lease are kept on that
  lease and suggested on no other lease, portfolio or policy (`journey.cross-lease-values`); no
  recipient can be typed (`journey.recipients`).
- **Walkthrough matrix (R-S252-5, L62):** one row for each of the seven budgets and each of the 29
  ledger rows (36 rows), with the model result kept apart from the human column, which reads
  `Human verdict: NOT RUN — no human observer` in every row. The check fails a human column that
  reads anything else while no staff session is recorded. A real send or update made in a staff
  session is real work and is never release proof.
- **First full case (R-S252-9):** NOT RUN. Which of the four already selected properties (two
  app-based, two regular) is the first case, and its lease end date, packet type, signers, fees,
  elections and disclosures, wait on Bailey and Dan. No case sheet or private value is in Git; a
  private case sheet, when made, stays outside the repository.
- **Approval handoff (R-S252-10):** waiting on holds packet U4 (Dan): who approves the exact rent,
  dates and charges, how that approval arrives and where it is recorded, and who may approve or
  sign for the landlord. The walkthrough covers every step before signature. No approval or signing
  authority is taken from a name or a title, and this file records no approval.

## The manual (R-S252-6, ARCH-S252-3, BEH-S252-3)

- **Version V2.0, a major version.** `lib/help/version.ts` says a change to a documented process
  ships a new major version; the renewal process itself changed (the desk opens on the working
  batch, a lease opens in Guided view on its Renewal path with one Now card, the prepared kickoff is
  Review and send then Send this message), so V1.1 became V2.0. The What changed entry
  (`lib/help/content/changelog.ts`, 2026-11-06) names the change and the affected guides
  (work-a-renewal, compare-rent, owner-message, tenant-offer, update-sources, prepare-documents,
  admin-tasks) with the content digest from `node lib/help/content-digest.mjs`.
- **Rewritten:** the renewal guides for the working batch, the Guided view and its Now card (the
  kickoff steps open-renewals, open-a-lease, read-the-path, read-the-prepared-message,
  review-and-send and send-the-message; record-the-owner-decision for the Now card form; the tenant
  answer and the renewal information form), the Focus view and Full view pages kept current, All
  leases and filters for the worklist table, the lease workspace screen reference, the glossary and
  the control map. The S253 gaps are closed: the packet inputs guide names the fifth section,
  Owner acknowledgment, and the Admin charge policy step names the pet processing fee.
- **Control map and L54:** `lib/help/content/renewal-control-map.json` has 84 rows. The 70 rows of
  the starting commit's map are stored as `tests/fixtures/s252/starting-renewal-control-map.json`
  and read by `renewalControlMapContinuity` (`lib/help/renewal-controls.ts`,
  `tests/unit/s252-control-map-continuity.test.ts`): each is kept by step id, with the one rename
  field (`formerly`) for a renamed control (none needed). The guide-controls smoke finds every one
  of the 70 starting rows by role and accessible name on its own page (the lease page in Guided,
  Focus or Full view, the desk in the batch or in All leases and filters, Connections, Home).
- **Pictures:** every scene was recaptured for V2.0 from the help rehearsal into public/help/V2.0/
  (27 scenes, each at 1280 by 800 or 375 by 812, synthetic values only, each looked at against its
  alt text); the V1.1 picture folder was retired (Git history keeps it). The rehearsal prepares its
  lease through the app's own routes (templates published, the owner message saved with a
  synthetic signature) and one emulator document for its stored comparison, so the kickoff pictures
  show a prepared lease. There is no picture of The owner's decision (the help rehearsal has no
  observed owner reply, so that control is reported conditional) and none for send-the-message (the
  same dialog as review-and-send).
- **L61 and BEH-S252-3:** the journey reads the guides from the served tree (`journey.guide-kickoff-read`)
  and completes the kickoff with only the controls they name (`journey.kickoff-from-guide`, 3
  actions); the pictures are captured from the live screen by `--check`, and the guide-controls
  smoke finds each guide step's control by exact locator on the live screen.
- **Fail-first on `daf8ee05` (ARCH-S252-3):** `bash scripts/run-help-rehearsal.sh --allow-overlay --check`
  exited 1 (21 scenes resolved, 1 uncaptured: renewal-desk-narrow waited for the Renewal worklist
  region, which the bare desk route no longer renders); `--controls` exited 1 (781 controls, 16
  missing, among them the Worklist views navigation, the Renewal table region, the filter
  disclosures and "Reload records and history", plus 3 whose preparation failed); the guide-controls
  smoke from `daf8ee05` exited 1 (it waited for a lease link in a renewal table the working batch
  does not render); the L54 continuity test failed 3 of 5 (the check did not exist).
- **Final:** `--check` 27 scenes resolved, 0 uncaptured; `--controls` 825 controls, 627 visible,
  198 conditional and unavailable in that state, 0 missing; the guide-controls smoke passed (84
  guide steps, L54 70 of 70); `verify:help-coverage`, `verify:help-controls`,
  `verify:help-screenshots` and `verify:help-content` pass (see "Gates on the final tree").

## Assurance follows the screens (R-S252-7)

- **Canary landmarks, read against the rehearsal (`journey.canary-landmarks`):** a harness child
  (`scripts/lib/one-path-rehearsal/canary-landmarks-run.ts`) imports the canary's own exported
  functions from `scripts/run-production-canary.ts` (`resolveWorkspacePath`,
  `hasRenewalWorkspaceLandmarks`) and the manifest from `lib/production-assurance/manifest.ts`
  unchanged, and reads, with every request other than GET, HEAD or OPTIONS aborted and counted:
  the desk table at `ASSURANCE_RENEWAL_DESK_PATH` (`/lease-renewal/live/desk?v=2&scope=all`),
  the workspace that link names, and the prepared, covered and assisted lease pages. The desk table
  had one Renewals heading and 38 rows, and the candidate-phase workspace link resolved to lease
  9138; that lease and leases 9101, 9102 and 9103 each met `hasRenewalWorkspaceLandmarks` (the S247
  Guided view contract). The canary's authenticated route list holds 13 paths and no bare batch
  route. The only aborted request was the development server's own error overlay posting to
  `/__nextjs_original-stack-frames` (a development-only route a production build does not have,
  sent when the dev overlay resolves a logged console error); it is reported here and not counted
  as an app write.
- **Nothing pending:** the canary's lease landmark contract already follows the Guided default
  (S247), and the reconciliation oracle's parity tests exist and pass
  (`tests/unit/s248-oracle-evidence-parity.test.ts`, `tests/unit/s250-s251-variant-oracle-parity.test.ts`,
  `tests/unit/s156-oracle-guidance-contract.test.ts`, `tests/unit/s232-oracle-ended-without-outcome.test.ts`).
  The status rule changed here (below: the next step after an accepted tenant answer) changes the
  stage projection's next-step wording and the step's state, not the staff lane's next activity the
  oracle reads, and those tests pass with it. Nothing was changed in the canary, the manifest, the
  reconciliation or `tests/unit/s113-canary-landmarks.test.ts`, and no bound or write was added.
- **The bare batch route:** the canary's route list (Admin and Editor) holds
  `/lease-renewal/live/desk?v=2&scope=all` and no bare `/lease-renewal` or `/lease-renewal/live/desk`
  route, so it never opens the working batch, where the automatic comparison start lives. No canary
  visit to it was added.
- **Read-only smokes:** `scripts/smoke-renewal-desk-browser.mjs` (red against the rehearsal since
  S246) and `scripts/smoke-renewal-focus-browser.mjs` both passed against
  `20261106T151941Z-af757bba`, each process with the provider boundary loaded through
  `NODE_OPTIONS`; `scripts/smoke-renewal-guide-controls-browser.mjs` (red since S246) passed against
  the help rehearsal. Each change to the desk smoke is listed under "Repairs"; none removes an
  assertion or widens a bound.

## Refused connections (L58)

Every run logged exactly two refused connections, both to `registry.npmjs.org`, both from the Next
dev server itself: the dev overlay's version check (`getVersionInfo` in
`node_modules/next/dist/server/dev/hot-reloader-shared-utils.js` fetches
`https://registry.npmjs.org/-/package/next/dist-tags` on the first overlay sync, with no
environment gate) and the development advisory check
(`node_modules/next/dist/server/lib/router-server.js` with `experimental.agentUpgrade` defaulting
to "security", reading through `node_modules/next/dist/lib/upgrade/nudge.js`). L58 asks that the
refused-connection log show no call to production, a provider or a mailbox. The public npm registry
is none of those: it is a development tool's own update check, not production, not a provider the
app reads or writes (RentVine, Google, Gmail, RentCast, Dotloop and the model), and not a mailbox,
and the boundary refused both before they left the machine. L58 therefore permits them, as the S238
evidence recorded the same two refusals per run. No setting was added and the refusal preload is
unchanged: every non-loopback connection is still refused and logged. The journey's own check
(`run.refused-connections`) fails on any refusal aimed at production or a provider, any refused
RentVine or RentCast write, and any refused host other than this named development-tool check.
`node scripts/one-path-rehearsal-control.mjs --run <run> refused` after the full candidate run
20261106T155130Z-f88ce24b lists exactly two entries, both from the server process and both a refused `fetch` to
`registry.npmjs.org`: `/-/npm/v1/security/advisories/bulk` (the advisory check) and
`/-/package/next/dist-tags` (the version check).

## Repairs

Repairs inside S246 to S253 scope that a measured budget or litmus check required, each tested:

- **L36 budget (S248 BEH-S248-2):** recording the owner's decision from an observed reply took six
  deliberate actions on `daf8ee05` (Owner response Approved, Who approved, How they approved, Reply,
  When they approved, Record approval). The Now card now holds "The owner's decision"
  (`components/lease-renewal/RenewalOwnerDecisionFromReply.tsx`, mounted by
  `components/lease-renewal/RenewalGuidedView.tsx`): choosing "Approved in the reply received
  {time} in {mailbox}" names the channel and the time in one choice (the mailbox is the staff
  mailbox whose thread holds the reply, worded as the S234 reply choice is; the first version said
  "from {mailbox}", which read as the sender, and a test now pins the wording), Who approved in this reply is
  chosen from the owners of record, and Record this decision records the same S234 approval through
  the same staff-record action; nothing is preselected and the server checks the party and the reply
  again. Owner response in Full view stays the route for an authorized representative, another
  written channel or a conversation. Fail-first: `tests/unit/s252-owner-decision-from-reply.test.tsx`
  failed to resolve the component before it existed; it now passes 6 tests, and the journey
  measures 3 actions.
- **L53, the next step after the tenant accepts (S247 stage projection):** with the tenant offer
  and an Accepted answer recorded, the staff lane's next activity is the renewal information form,
  which belongs to Offer the tenant, but the projection marked the step done and its card named
  "Send the tenant offer" again, so the path could not reach Documents. `lib/lease-renewal/renewal-stage.ts`
  now names "Send the renewal information form", then "Record the returned information form", at
  their own staff records; once both are Done or Not applicable the step is done and Documents and
  signatures is next. Fail-first: `tests/unit/s252-tenant-information-form-next-step.test.ts`, 2 of
  4 failed on the base projection ("Send the tenant offer" received); with the repair it passes with
  the S113, S247, S248, S249, S250 and S251 stage tests (10 files, 123 tests), and the journey
  takes the prepared lease to Complete. The guides' tenant-answer steps name the two records.
- **Desk smoke (`scripts/smoke-renewal-desk-browser.mjs`), each change deliberate:**
  - "Lease 9138 rendered the wrong action-destination cardinality" came from the S127 issue
    summary's non-renewal handoff link (S124), which sits in the action cell and was counted as an
    action destination. The smoke checks that link separately and exactly: at most one issue
    summary per row; a confirmed move-out has exactly one link, to this lease's handoff in this tab;
    any other summary has none.
  - Against the rehearsal it is served with `--no-mail-adapter`, as a verification session is:
    with the Demo-owned mail adapter the server is the isolated rehearsal and opening the working
    batch starts the S249 preparation by itself, a write this read-only smoke refuses.
  - The owner and tenant filter options are checked against both opaque token versions the app
    issues (`p1_` over the normalized label, `p2_` over the verified RentVine contact id, each the
    whole HMAC digest; `PARTY_FILTER_TOKEN_PATTERN` in `lib/lease-renewal/desk-query-v2.ts`); the
    smoke's `p1_` pattern predates the `p2_` tokens, and the label-leak check is unchanged.
  - Before choosing a header control on a fresh desk load, the smoke waits for the page's personal
    view read and two frames: applying it moved the header, and the sort click landed on the
    worklist section itself (a diagnostic run saw the click target and no request).
  - A lease opens in Guided view (S247); the smoke now asserts that default, then chooses Full view
    before walking the five-section dashboard, its data check, the term parity and Back.
- **Guide-controls smoke (`scripts/smoke-renewal-guide-controls-browser.mjs`):** repaired with the
  help rewrite for the working batch entry and the same-tab lease open (below).
- **S254 stand-in proof:** its comparison checks asked for the prepared lease, which the S249
  prepared-kickoff seed already looks up, so the server's comparison cache answered without a
  stand-in request and checks 01 and 02 failed on the harness's own starting state. They now ask
  for two carried-over leases nothing else looks up; the checks are unchanged in strictness.
- **Builder drivers:** each `tests/browser/one-path-*-driver.mjs` exports its named steps as one
  function (`runSmoke`, `runKickoff`, `runKickoffVerification`, `runGuidedPath`, `runVariants`,
  `runStandInProof`) that the journey imports, and still runs on its own.

Observed and kept, not changed:

- **The tenant offer is recorded by hand in the rehearsal.** Its send needs a verified renewal
  information form link, a company resource the app refuses to verify for a synthetic host
  (`lib/lease-renewal/resource-locations.ts` refuses `.invalid`, `example.*`, `test` and local
  hosts), so the card reads "Before sending, add renewal information form link." The journey uses
  the hand record the app offers (Tenant offer delivered: Done), then Tenant response: Accepted, and
  records the information form sent and returned by hand. No resource rule was changed.
- **Renewed-in-source closure (L04, BEH-S246-2):** after "Record staff completion" with its
  confirmation on a lease renewed in RentVine, the lease leaves Renewed in RentVine and lands in
  Coming up later (the lease's RentVine end is now a year out), every lease still counted once. BEH-S246-2 asks that recording completion move it out
  of the open groups, and L04 that none completes without a staff confirmation; both hold, so no
  S246 repair was made.
- **The S249 kickoff driver's own working term** writes an end date 24 months out; the journey enters
  a twelve-month term on the prepared lease before the owner's decision. The driver was not changed.

## Gates on the final tree

- `env NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` on `f88ce24b`: 0 errors. (The run
  before it reported TS7016 for the ledger test's import of `ledger-check.mjs`; the declaration file
  `scripts/lib/one-path-walkthrough/ledger-check.d.mts` repaired it.)
- `node scripts/run-unit-tests.mjs` (whole unit suite, on `af757bba` with the reply label repair):
  1163 files passed, 1 skipped; 11430 tests passed, 4 skipped. After the last test edit (types
  only) the S252 files ran again on `f88ce24b`: 4 files, 25 tests passed.
- `npm run test:firestore` (whole backend suite, on `af757bba`): 95 files, 552 tests passed.
- Static gates on `f88ce24b` with this file: `verify:router-boundary`, `verify:falsification`,
  `verify:context-freshness` (two existing facts past their review-by dates are warnings),
  `verify:active-doc-paths`, `verify:spec-traceability`, `verify:copy-voice`, `verify:redaction`,
  `verify:help-coverage`, `verify:help-controls` (825 controls), `verify:help-screenshots` (27
  scenes), `verify:help-content` (3132 strings) and `format:check` pass;
  `node scripts/check-one-path-defect-ledger.mjs`, with and without `--journey`, passes; ESLint
  with `--max-warnings=0` is clean on the 39 code files the branch changed.

## Not verified or open

- **Staff walkthrough (R-S252-5):** Human verdict: NOT RUN — no human observer. No staff session
  was held; the first weekly session is November 10, 2026. Every matrix row's human column reads
  NOT RUN.
- **First full case (R-S252-9):** NOT RUN; the case and its inputs wait on Bailey and Dan.
- **Approval handoff (R-S252-10):** waiting on holds packet U4.
- **The litmus** was not run, no `docs/evidence/renewal-one-path-litmus-*.md` was written and no
  litmus check is marked Yes here. Litmus L59's second part (`bash scripts/verify.sh` on the final
  tree) was not run in this build.
- **Open ledger rows:** OUT-1 (S171) and OUT-2 (S199) are outside this bundle; REP-2 (evicted
  tenants in filters) and REP-4 (revised recipients in a draft) are open and not reproduced on the
  rehearsal data.
- **The tenant offer's own send** was not exercised through Review and send in the rehearsal: it
  needs a verified renewal information form link, which the app refuses to verify for a synthetic
  host. The path used the hand record the app offers.
- **Help pictures:** none of The owner's decision (no observed reply in the help rehearsal) and
  none for send-the-message (the same dialog as review-and-send).
- **L14 on Check the numbers** was measured with that step opened from the path strip; no working
  lease in the November 5 mix is itself current on Check the numbers (their numbers agree).
- **Observed, outside S252 and not changed:**
  - The owner message's comparable lines carry an em dash ("Comparable 1, 3 bedrooms — $1,375.00
    per month", `lib/lease-renewal/renewal-message-content.ts`); `verify:copy-voice` passes on the
    tree and does not read this line.
  - On a lease covered by a standing agreement, Ask the owner opened from the path strip reads
    "Covered by {agreement}: no owner message needed" and still offers Send the owner message (the
    step's own action when the covered state names none); sending stays a staff choice.
- **Not run:** `npm run verify:dependencies` (it reads the public npm registry) and a whole-tree
  `npm run lint` (ESLint ran on every touched file instead).

## Resumed reviewer evidence

This section is separate from the builder's dated observations above. The allowed S252 replay
`20261107T034423Z-4d3359d7` ran these five phases: the S254 stand-in proof, the S254 smoke
journey, the S252 recorded-outcome journey, the S247/S248 path and stage exercise, and the
S250/S251 variants. All 79 checks and all five budgets checked in that invocation passed.
Opening the prepared lease and completing the exact review took three actions and one page;
the observed owner decision took three with nothing preselected. The reviewed synthetic send,
decision and completion produced their own readback. Each consequential action retained its
review and confirmation. The default automatic-start phase did not run. The hold was read
at startup, on resets and at exit. All 105 Node PIDs reported the guard; only two public npm
requests were refused. Four kickoff requests were explicit staff seed or phase-reset operations.

The actual historical kickoff comparison stops at the starting commit's own Demo send refusal.
It reached nine required actions and one optional action across three tabs. The candidate completed
the synthetic kickoff in three actions and one tab. The old run's completed send and exact
confirmation are UNVERIFIED. This direct comparison narrows the earlier builder count above;
it does not erase the earlier record.

The existing checked ledger retains all 20 November 4 items and all nine supplemental rows.
The 36-row walkthrough matrix retains its seven budget rows and 29 ledger rows. The four open
ledger items remain exactly scoped; the first staff case, approval handoff, client inputs and real
provider outcomes retain their original holds. Each human column remains
`Human verdict: NOT RUN — no human observer`.

Help V2.1 was captured on `3602f69ab4ca2e448b9e727641a9e36cbeb9551e`, run
`20261107T061029Z-3602f69a`. All 27 scenes captured and all PNG hashes matched. Nine changed
from the previous capture; the other eighteen were byte-identical. The changed pictures and
the unchanged exact review picture were visually inspected; it shows the sender, recipients
and wording at the top. The source contained only synthetic records. The capture had 22 guarded
Node PIDs, two refused public npm connections and zero kickoff preparation requests. The
asset-only commit is `edba7cbb29dfc7942257e91e91932516a449fbf2`. The
[independent litmus](renewal-one-path-litmus-2026-11-06.md) gives the exact L61 guide-to-screen
coverage and L60/L62 ledger checks. The [UX review](renewal-one-path-ux-review-2026-11-06.md) gives
the component and release-assurance changes and their final qualification.

The exact Help control walk at `eb7f4d69`, run `20261107T072612Z-eb7f4d69`, checked
840 entries: 629 visible, 211 conditional-unavailable and zero missing. The wrapper and
emulator finished. The 36 guarded Node PIDs recorded two public npm requests and ten hosted
identity requests refused before dispatch. There were zero kickoff requests. This covers the
browser control gate's named fixture states; conditional-unavailable controls and human
comprehension retain their separate limits.

The independent corrected-frame follow-up `20261107T075249Z-eb7f4d69` matched all nine
previously partial scenes for layout, labels and control placement. The 15 image blobs and
scene manifest stayed byte-identical to `edba7cbb`. With the six earlier direct matches,
the observations cover all 15 renewal guide images. The only differences were incidental
synthetic clock text and a development indicator where visible. The same guide-named
actions also reached the separate exact confirmation and accepted stand-in in the
independent path walk (L23 and L25). This adds no staff verdict.
