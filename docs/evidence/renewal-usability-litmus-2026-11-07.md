# November 7 renewal usability litmus report, 2026-11-07

Engineering qualification is in progress. The published specification is
`4caad68df6885d3eed4cb2b3fff7c70e5c96ae15`, and the main branch fetched for the implementation
was `bf9753d6af9c7cb90c7a17d3dee0965ae9656095`. The November 7 comparison source is
`ef81b8917209f4eec3f22097142b559f3cce875b`. The [versioned crosswalk](../renewal-usability-litmus-profile-2026-11-07.md)
preserves all 71 S254 check identities. The [historical report](renewal-one-path-litmus-2026-11-06.md)
still records L55 as No. The historical S252 comparison measured 10 deliberate actions over
three tabs against the candidate's three actions on one page. The owner session's earlier measure
was at least eleven actions over three tabs. Those are distinct observations.

Human verdict: NOT RUN
Staff session: none

## Initial failures

- L03 on `c7ed2b3d`. The first click on New collection landed before hydration. The membership
  editor stayed closed. The failed run is `20261107T133826Z-c7ed2b3d`.
- L07 on `66dc83c2`. The optional owner draft on the covered fixture refused an unverified
  notice generation. The stand-in had zero drafts before and after the refused review. The older
  signature driver also found two controls with the same setup name, stopping before the revised
  blank-save check. The completed kickoff phase is in `20261107T141120Z-66dc83c2`.
- L13 on `7598d536`. The first required Help pass found 25 missing controls, 19 materially changed
  scenes, and one uncaptured scene. On `56bfd98e`, 24 required controls still failed because
  same-document anchors had no HTTP response. All 27 scenes rendered, with three flagged for
  generated release or process version identifiers.
- L10 and L13 on `d85d7c5c`. The first S252 run reached the exact send review. It attempted to
  open that review a second time because the guide included a verifier setup action. The driver
  stopped before confirmation. Its failed run and action counts are in `20261107T134213Z-d85d7c5c`.

- L02, L03, L05, L11, L12 and L13 on `8bd32d57`. The keyboard desk locator expected the
  carried-over link label on a working-month row. The collection saved and reopened, but the
  first desk assertion sampled the route while it still showed Opening. The refused note kept
  the long text and added a suffix the locator missed. Mobile Communications needed the Menu
  before Operations. The old connection retry and print cases did not observe their action.
  The run is `20261107T143941Z-8bd32d57`.
- L07 on `8040ed8c`. The exact composer Copy case located its button inside the editor region.
  The control sits alongside that region, so the checkpoint timed out. The independent
  unfinished follow-up regression then failed at the app-draft schema.

- L02 and L10 on `cec7c4f0` in `20261107T161743Z-cec7c4f0`. The Dashboard check
  counted the separate RentVine source links and stopped before My Work. The synthetic Admin
  setup timed out before the browser observed a form-policy request.
- L14 on `cec7c4f0` in `20261107T160403Z-cec7c4f0`. The rent and date comparison
  reread both fields before their successful saves had completed. The 103 other S252
  checkpoints passed. Canonical verification on `8c216ee6` passed all rendered Help checks,
  then stopped on a render-time ref access in Communications. The queued browser rerun
  stopped before startup because the emulator launcher selected the same port twice.

- L06 on `9fca1cbc` in `20261107T163645Z-9fca1cbc`. Full opened while the
  named heading stayed above the visible area. The focused component regression saw a link
  get focus where the section heading should have received it.
- L06 and L10 on `e1cf8905` in `20261107T164528Z-e1cf8905`. A direct legacy
  section worked after the focus repair. A fragment-only change to the next section stayed in
  Guided. The Admin family and charge-policy saves and both packet input saves succeeded. The
  form driver reopened the same URL without a fresh document load and found the form still open.
- L03 and L09 on `8149b612` in `20261107T165608Z-8149b612`. The member-removal
  fixture did not produce the required visible unavailable row in the recorded case. The later
  cycle case stopped on a source refresh without the required fresh response. Neither group
  earns a pass from those checkpoints.

## Repairs

- L03 now waits for the initial collection list before enabling New collection. The focused
  component test exercises the review after a selection is imported and looked up.
- L07 now exercises the explicit source refresh before retrying exact draft review. The November 7
  signature check uses the sending-readiness control and expects a versioned blank for a different
  sender, followed by reload and the independent recipient hold.
- L13 separates actual guide actions from verifier setup. The later guide-led kickoff used the
  ordinary open, review and confirm controls. The rendered gate now rereads the exact anchor
  destination and checks the three changing identifiers against their known sources before
  comparing the rest of each picture. V2.2 adopts all 27 reviewed synthetic scenes captured from
  `ee2d0dd2d581cc6e56b83ffe5fa37343d3d90511`.
- L10's subsequent driver opens Completed, reopens the exact lease, and checks its recorded stage
  before returning to the group. That readback is a separate requirement from reaching Complete.

- L02 targets the working row's address link. L03 waits for the collection route and table and
  separately reviews a stale removal after a concurrent rename. L05 scopes the refusal to the
  note status. L11 opens Menu and Operations on narrow touch emulation. L12 and L13 wait for
  the focused action and record the response or print request.
- L07 checks the exact plain body and subject, with the required Gmail review banner as separate
  framing. The composer checks Copy in the initial message's action group. Unfinished follow-up
  wording uses the existing app draft, while the authorization snapshots a follow-up only when
  the schedule repeats. The store keeps the legacy complete follow-up field readable for older
  readers. The repeating action continues to require complete, verified content.
- L14 core E2E at `aa7ecd93` completed the 14-file inventory with 44 passed, 23 skipped and
  two failures. Those assertions expected the old migration and governance labels on the Admin
  index. The repairs check the current accessible names and exact hrefs and exercise the
  legacy migration link on its focused page. The core gate requires a fresh pass.

## Final observations

The mailbox-disabled checkpoints on `c7ed2b3d` verified every lease ID and count in the November 5
mix. This batch had five, Carried over four, Renewed in RentVine three, Month-to-month three,
Non-renewals one, Coming up later twelve, and Not renewal targets ten. Completed and Retired started
at zero. These sum to 38. The month survived the view switch. A narrow dark keyboard run verified
Record work focus, Cancel focus and the old Focus URL for Documents and completion. A narrow light
run saved a blank signature from Profile and read back the same choice. The retirement and restore
checkpoint persisted each decision across reload. These checkpoints retain their own source SHA.

The `66dc83c2` synthetic Editor run at 1280 by 800 kept automatic comparison held. Its stand-in
proof verified comparison reuse, allowance refusal, a bounded unreadable source and recovery,
synthetic mail acceptance, the linked reply, an unconfirmed send and reconciliation, and a
bounce. The guide-led path met the no-action desk and one-action same-tab open bounds. It kept the
stage, path and primary action on the first screen. The prepared kickoff took three actions on one
page including exact review and confirmation. Waiting on the owner took zero further actions.
Recording the linked reply's owner decision took three actions on one page. The same path reached
staff-recorded Complete. The narrow layout, reload with saved typing, cross-lease value isolation
and separate exact confirmation for the source-renewed lease passed. The rehearsal also exercised
the canary's updated landmarks on the synthetic app. Physical device, assistive technology, staff verdict and real provider
effects are separate observations with no completed verification here.

The `8bd32d57` mailbox-disabled pass separately recorded 5 passed checkpoints and 6 failures.
The passed cases covered exact counted groups, saved-view and empty-filter recovery, keyboard
Record work and the legacy Documents anchor, versioned blank signature, retirement and restoration,
and legacy Admin return. The lost collection save had a version 1 readback for two members, an
Approver's read and an unchanged version after Cancel and Refresh. Its desk handoff still failed
as recorded above.

The `8040ed8c` full S252 engineering driver in `20261107T151210Z-8040ed8c` recorded
91 passed and 1 failed. Its five numerical budgets stayed within bounds. The prepared lease
reopened from Completed, both pending-effect retirement refusals linked the exact communication,
all 23 Guided path checks and all 21 standing-agreement and assistance variant checks passed.
The stand-ins recorded 15 of 15 checks, with two refusals to development tooling and none to
production, a provider or a mailbox. The kickoff comparator did not reach draft creation on
this commit. Cleanup removed the disposable rehearsal worktree and stopped its emulators.

On `9f173cbe` the six focused tests, typecheck and all 25 targeted Firestore tests passed. The
new backend case saved and reread incomplete optional follow-up wording, refused a repeating
schedule and accepted exactly one synthetic one-off send containing only the reviewed initial
body. These are focused results from that exact source.

Read-only Cloud Run metadata at 14:15 UTC confirmed 100% canonical traffic on
`pmi-kc-app-rmw65wgt2-8c8249a0547c` and its ready revision's source
`ef81b8917209f4eec3f22097142b559f3cce875b`. The required Communications canary would read the
managed Gmail profile through `/api/gmail-hub/connection`. The November 7 instruction excludes
live mailbox access as verification, so release admission and assurance remain held.

Raw logs, receipts, screenshots and fixture data remain in private rehearsal state. The run
identifiers identify the exact source and never stand in for a later candidate pass.

The `8c216ee6` canonical run passed the required rendered Help lane in 536.773 seconds.
All 27 scenes matched. It checked 838 controls, with 630 visible, 208 conditionally unavailable
and zero missing. Lint later refused a ref read during render. The composer now keeps the
pending attachment slot in render state and keeps the exact upload intent in its existing ref.
The next browser process failed before startup when the launcher selected one port for both
emulators. It now reserves both ephemeral listeners until it has distinct ports. On
`8c216ee6` an intentional no-preload startup stopped before starting an emulator or app.

The same-date serial comparisons used the November 5 mix with automatic comparison held and
the mail adapter disabled. `20261107T164935Z-e1cf8905` showed nine default rows as a table,
zero closed, two views and the same stage in Guided and Full. `20261107T165018Z-ef81b891-named`
showed nine default rows as a list, zero closed and three views. Both opened the prepared lease
in one tab and returned to the working month. `20261107T165100Z-6491c06f-named` showed 37
default rows, including ten closed. All three runs exited zero. In the first historical
comparison attempt a separate focused test wrote the shared Vitest cache. Both wrappers
rejected cleanup despite recording their browser readings. The serial results above are the
rechecks. The existing historical three-tab kickoff remains separately scoped.

The `8149b612` mailbox-disabled run passed 13 of 15 cases. The Editor opened the same
prepared lease from the desk, Dashboard and explicit My Work task. The Approver did not see
the private task. All five section destinations and their exact legacy fragments focused the
named heading below the toolbar and returned to the prior step. The ordinary annual review
and move-out handoff reread their saved records. The synthetic Admin published the $50 fee
and the Editor saved the $250 deposit for a $300 total and two-paragraph owner explanation.
These persisted on a fresh load, the packet reached Ready for preview, and the other lease
kept its values blank. The missing-member and later-cycle attempts retained their failures.
The final comparison still needs those cases on one candidate.

Approved CLI-only metadata at 16:31 UTC read Ready on
`pmi-kc-app-rmw65wgt2-8c8249a0547c` with all canonical traffic at `ef81b891`, 54
environment keys and five secret bindings. Production and Live, Demo=false, Sheet=true and
RentCast allowance 50 matched. Billing and the existing cost-control check passed. The
registered pair was clean at the serving source and the prior checkpoint was complete with
its permit consumed. A separate open found the release lock free at 16:26 UTC. Print-only
preflight was NOT READY with zero queued items. Fresh guarded admission is held by the
required real Gmail profile read. No production application route supplied this evidence.

## Remaining blockers

- L01 and L02 require the exact saved-view, filter, scope and return evidence on the final
  candidate. L03 requires reviewed membership, lost-save recovery, shared readback and stale refusal.
- L04 requires the remaining independent-control and narrow cases. L05 requires staff evidence
  conflicts and the note recovery. L06 requires the full old-anchor and working-entry matrix.
- L07 requires the revised draft recovery and signature checks, replacement, Resume and reply
  preservation. L08 requires the remaining assisted, monthly and move-out branches.
- L09 requires the pending and ambiguous refusals, exact version and next-cycle independence in
  the browser. L10 requires the final Completed-group reopen, variants, document and form readbacks.
- L11 requires the named destinations and exact return. L12 requires the focused task and
  connection retry and denial. L13 requires a green rendered Help run and the print/return case.
- L14 requires a single accepted S259 candidate, complete canonical verification and exact-head
  CI. Release assurance separately holds at the live mailbox read described above.

## Run 1

Commit: 66dc83c221b13146503b537e2a12324d0f634a30
Starting commit: ef81b8917209f4eec3f22097142b559f3cce875b
Run: 1
Goal groups: all
Accepted: No

<!-- prettier-ignore -->
| Check | Verdict | Evidence | Repair | Blocker |
| ----- | ------- | -------- | ------ | ------- |
| L01 | UNVERIFIED | Expected exact current-month membership and recoverable source read. The synthetic Editor saw the five working-month leases, four carried rows and zero closed rows on the bare desk. The bounded unreadable lease and restoration passed in the stand-in phase. | The next driver includes explicit saved-view and zero-result recovery. | Recheck every counted group, the old filter and restored position on one candidate. |
| L02 | UNVERIFIED | Expected the desk, Dashboard and My Work to open the same lease and stage. An Editor opened the row by pointer in the same tab. The synthetic assistant answered the month query. | The linked-entry driver compares the exact IDs and same stage. | Observe the explicit task, restricted read and return together. |
| L03 | UNVERIFIED | Expected the collection review, commit and recovery to retain exact membership. This run did not work the collection. | The older pre-hydration click was repaired. | Observe lost response, stale version, another actor and return. |
| L04 | UNVERIFIED | Expected a prepared lease's comparison, suggestion and preview with no extra action. Desktop Editor observed these, a held comparison setting, and the stage, path and primary in the first viewport. | The stage locator follows the shared header. | Observe the later independent control, missing input and narrow transition. |
| L05 | UNVERIFIED | Expected exact staff evidence, log and correction. The Editor recorded an owner's decision in three deliberate actions after the linked reply and the stage moved to Offer the tenant. | Added separate failed-note and reload readback. | Exercise conflicting evidence, correction and note isolation. |
| L06 | UNVERIFIED | Expected each detail and old Focus link to keep the same lease and retained text. This run did not replay each link. | Earlier narrow keyboard checkpoint reached the old Documents and completion anchor. | Observe every detail, allowed interruption and isolation scope. |
| L07 | No | Expected the one message and deliberate exact actions to produce the intended synthetic outcome. Edited amount and wording matched across the named preview routes and the accepted send. The covered draft refused notice safety and produced zero drafts. The earlier signature locator matched two setup controls. | Scope setup to its readiness list and recover the draft via explicit refresh. | Reobserve the exact draft, replacement and blank choice with all other applicable outcomes. |
| L08 | UNVERIFIED | Expected coverage and assistance to advance through their own paths. The Editor saw the standing agreement continue to Offer the tenant and the assisted lease name its program, answer and rent actions without a lookup. | Preserved the existing fixture meanings. | Complete all assisted answers and the monthly and notice branches. |
| L09 | UNVERIFIED | Expected retire and restore for the exact cycle and refusal when an effect is pending. The earlier narrow scope passed retire and restore on a different exact source. | Kept separate transactions and exact reconciliation destinations. | Observe stale, pending, ambiguous and later-cycle cases on the candidate. |
| L10 | UNVERIFIED | Expected exact send, decision, tenant, documents and completion readback. The Editor worked these synthetic stages and reached Complete. The standard tenant and document outcomes used staff records. | The driver now returns via the counted Completed group. | Verify the Completed reopen and all required source, document and effect variants on one candidate. |
| L11 | UNVERIFIED | Expected named Operations and Internal Processes handoffs with exact return. This run did not exercise those entries. | Focused browser case has the named destinations and roles. | Work the named links and private or unauthorized task refusal. |
| L12 | UNVERIFIED | Expected focused Admin and Connections read, retry and denial. This run did not exercise those entries. | Focused browser case includes a one-time synthetic check failure. | Verify the retry, scope, denial and index return together. |
| L13 | UNVERIFIED | Expected an actual guide, correct scenes and print return. This run followed the served guide through a separate exact confirmation and accepted synthetic send. | Moved dialog setup out of the guide. | Finish the required rendered and material scene gate, legacy step and print return. |
| L14 | UNVERIFIED | Expected a complete exact-candidate matrix, original budgets and guard checks. The scoped stand-in and journey evidence shows the reached synthetic checkpoints. | The versioned profile carries the 71 historical checks. | Finish the same-SHA matrix, canonical gates and CI. |

## Run 2

Commit: 8040ed8c1f772e1794d34450d7d02dbaa93d6e8e
Starting commit: ef81b8917209f4eec3f22097142b559f3cce875b
Run: 2
Goal groups: all
Accepted: No

<!-- prettier-ignore -->
| Check | Verdict | Evidence | Repair | Blocker |
| ----- | ------- | -------- | ------ | ------- |
| L01 | UNVERIFIED | Expected exact desk counts. The Editor saw the working-month group and the later variant read all 38 leases and the voucher-only suggestion. | The focused case now checks the saved view and filter return. | Reobserve exact IDs, filter and position on the final candidate. |
| L02 | UNVERIFIED | Expected desk, Dashboard and task parity. The pointer opened the prepared row in the same tab. Variant cases compared stage and next step with assistant answers. | Target the working row's address link by keyboard. | Observe the explicit private task, Dashboard result and return on the same candidate. |
| L03 | UNVERIFIED | Expected reviewed shared membership through recovery. This run did not exercise collections. | Wait for the table before sampling membership and exercise a stale second-tab review. | Observe both creation modes, scope, exact recovery and return. |
| L04 | UNVERIFIED | Expected the stored comparison and current step in view. The Editor saw the ready prepared lease and no opening write. Narrow and desktop layout passed. A later step opened and reload kept its place. | The live switch checks Guided and Full with the old Focus route separately. | Exercise a later independent action with its own inputs, then return by keyboard. |
| L05 | UNVERIFIED | Expected exact recorded work and correction. The owner decision took three actions and advanced the lease. Correcting unrelated outreach removed the derived item and retained the reason. | The separate note case observes the refused save and reload. | Complete note recovery and conflict readback in the final matrix. |
| L06 | UNVERIFIED | Expected legacy and current controls with working entry intact. The Editor reached Full by old section link, checked two selectable views and reloaded a typed entry. | Retain legacy destinations in their owning view. | Observe every Full destination and remaining interruption and scope cases. |
| L07 | No | Expected identical edited message content and a canceled preview without effects. The composer Copy control was outside the locator's region. The browser stopped at that checkpoint. | Scope the action next to the initial editor and compare the required draft banner separately. | Rerun exact body, blank and wrong-sender setup, draft replacement, schedule, Resume and linked reply coverage. |
| L08 | UNVERIFIED | Expected standing and assisted variants. The 21 variant checks passed for pricing scope, typed override, program choices, voucher-only classification and their actual stage readbacks. | Preserve the same fixture and separate monthly and move-out handoffs. | Work the monthly and notice transitions on the final candidate. |
| L09 | UNVERIFIED | Expected pending and ambiguous refusal and exact restoration. Each refusal named its communication and left the lease active. | A separate second-tab case checks exact retirement history and stale reason retention. | Observe successful retirement and restoration in every required entry and later-cycle independence. |
| L10 | UNVERIFIED | Expected standard completion and its variants. The Editor reached Complete, opened it from the counted Completed group and observed the stored stage. Schedule, due send and failed delivery paths reached their readbacks. | Added the exact Completed reopen to the driver. | Finish the remaining draft and S253 form and document scenarios. |
| L11 | UNVERIFIED | Expected named Operations, procedure and task returns. This run did not exercise those entries. | The narrow case opens Menu before Operations. | Observe a scoped lease return and private-task refusal. |
| L12 | UNVERIFIED | Expected exact Admin and Connections controls and recoverable reads. This run did not exercise those entries. | The focused case observes the failed POST and its retry. | Observe the exact health result, denied role and index return. |
| L13 | UNVERIFIED | Expected a real guide with current pictures. The Editor worked the served guide through exact confirmation and completion. | Match exact anchors, dynamic identifier bounds and current V2.2 captures. | Observe green rendered Help, injected drift and the print return. |
| L14 | UNVERIFIED | Expected one accepted candidate and canonical verification. S252 counted 91 passed and 1 failed, with all five action budgets met. | Preserve the failed comparator and recheck the exact scope. | Complete the matrix and green local and CI gates. |

## Run 3

Commit: cec7c4f0f6fcfb04457d2f38a47abe908ae73641
Starting commit: ef81b8917209f4eec3f22097142b559f3cce875b
Run: 3
Goal groups: all
Accepted: No

<!-- prettier-ignore -->
| Check | Verdict | Evidence | Repair | Blocker |
| ----- | ------- | -------- | ------ | ------- |
| L01 | UNVERIFIED | Expected the loaded leases to count exactly once. The Editor read all 38 IDs in their expected groups, shifted the month, switched tables, reopened a saved view and recovered from an empty filter in `20261107T161743Z-cec7c4f0/L01-desk`. The effect rehearsal separately observed unreadable source status and recovery. | The table and saved route were exercised with the production-shaped fixture. | Observe exact scroll and focus return through the saved and shared routes. |
| L02 | No | Expected the same lease and stage through the desk, Dashboard and My Work. The keyboard row opened in the same tab and returned. Dashboard displayed all five lease rows, but the checkpoint also counted their separate RentVine links as workspace entries and stopped before My Work. The screenshot is `20261107T161743Z-cec7c4f0/L02-linked-entries`. | Count only exact lease workspace routes and assert the same destination after navigation. | Rerun the task and restricted or missing entry with the corrected matcher. |
| L03 | UNVERIFIED | Expected an exact reviewed membership and recovery. In `20261107T161743Z-cec7c4f0/L03-collection`, the Editor's lost save returned version 1 with two members. An Approver opened the same set, Refresh and Cancel kept it, a rename refused a stale removal, and the exact desk table returned to version 2. The imported and matched-period case kept one exact member. | The versioned review and focus were worked with a concurrent tab. | Recheck a revoked member and repeat confirmation through the visible recovery entry. |
| L04 | UNVERIFIED | Expected the stored comparison and current action on the first screen. The prepared lease opened with no write, all five S252 action budgets passed, and the later step opened and survived reload in `20261107T160403Z-cec7c4f0`. | Same-page guidance and deliberate confirmation remain. | Verify an independent later action with its own inputs and keyboard return. |
| L05 | UNVERIFIED | Expected a staff decision and its exact record. The guide path recorded the linked decision in three actions. Another Editor case kept all 1,362 characters after a refused note, kept the text private to the tab and saved exactly one note. The correction removed the unrelated derived outreach and kept its reason. | Scope working text to the active record and actor. | Confirm conflict handling and the resulting staff stage across all read surfaces together. |
| L06 | UNVERIFIED | Expected the former Focus links and Full sections to keep the same lease and selected step. The narrow dark keyboard case focused Record work, canceled and opened the old Documents anchor. Reload kept a chosen step and text. | Separate exact focus and address behavior for each destination. | Reopen every Full destination and verify new edits win delayed readback across lease, cycle and tab. |
| L07 | UNVERIFIED | Expected one reviewed message across the action routes. `20261107T160403Z-cec7c4f0` matched exact subject and body across Copy, Send, Schedule, composer and the draft with its required banner. The first draft and separate replacement had exact receipts and both remained unsent after reload. The visible Schedule, Pause and Resume controls retained exact bytes and date. One due tick accepted the message. Blank setup and unfinished optional follow-up were reread. | Kept action-specific validation and existing exact receipts. | Work an outgoing linked reply from the received conversation and complete the assisted and stale-preview cases. |
| L08 | UNVERIFIED | Expected distinct coverage and assistance decisions. All 21 standing and assisted variant checks passed. The candidate observed source-only voucher scope, agreement override and an assisted non-renewal result. | Add browser readback for the annual review and source move-out handoff. | Observe those two exact local records and return on the final candidate. |
| L09 | UNVERIFIED | Expected retirement to affect only the exact cycle. The Editor saw the reason in the Retired count, refused a stale review and restored the cycle. Both history entries reread. Pending and ambiguous effects each refused retirement and linked to the exact communication. | Kept each effect's original recovery route. | Observe retirement from a saved collection and Dashboard, plus a verified later cycle's independence. |
| L10 | No | Expected the ordinary journey and S253 form variants. The Editor completed and reopened the standard lease from Completed. The Admin setup case timed out before observing a form policy request. The financial readback sampled the prior fields before both exact save responses completed. | Wait for Admin hydration and the specific financial save responses before rereading. | Finish the exact form preparation and readback paths after the repairs. |
| L11 | UNVERIFIED | Expected the named adjacent entries and scoped return. At narrow width the Editor reached Communications, opened Internal Processes, found the renewal procedure, followed the old path and returned to the same lease. | Scope the navigation to the current Operations group. | Observe the Dashboard task answer and private or missing result alongside those handoffs. |
| L12 | Yes | Browser outcome `20261107T161743Z-cec7c4f0/L12-connection-retry`. The Admin reopened the named RentVine task, saw the injected 503, retried the actual check and read a verified synthetic result, then returned to the task index. The Editor saw the role refusal and no write control. The separate legacy safety anchor reached the exact focused section and returned to the index. | No additional change was needed for these checkpoints. | None on this run. |
| L13 | UNVERIFIED | Expected a matching guide, scene and print return. The Editor worked the guide through exact confirmation and completion in the effect run. The narrow keyboard case invoked Print this guide and verified 32 heading rules, then returned to the old lease section. | Use the same isolated renderer for V2.2 verification and captures. | Verify the required isolated recapture and deliberate missing-control and stale-scene rejection. |
| L14 | No | Expected an accepted same-SHA matrix and canonical verification. Core E2E passed 46 with 23 explicit skips. The S252 rehearsal passed 103 checks and all five numerical action budgets, with one failed readback. The mailbox-disabled rehearsal passed 11 of 13 cases. | Preserve both logs and use exact source and confirmation boundaries in the rerun. | Complete the full matrix, required canonical verification and exact CI. |
