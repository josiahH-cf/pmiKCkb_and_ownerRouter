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

- L07 on `8149b612` in `20261107T165949Z-8149b612`. The new outgoing reply
  driver timed out before the exact linked conversation opened. The 105 other S252 checks
  and all five numerical budgets passed. L14 remains unaccepted for that run.
- L03 and L13 on `93b3e91d`. The scoped collection response and screenshot both showed
  the saved unavailable member without a link. The locator still timed out on the full row.
  Rendered Help flagged Tenant offer and Entity search as material changes in
  `canonical-93b3e91d-20261107T171838Z`.

- L06 on `ccb8fae8` in `20261107T173720Z-ccb8fae8`. The Owner approval
  checkpoint switched to Full, but the visible page remained in the preceding comparison section.
  The same driver's working-value revision case passed. The screenshot and the failed wait
  remain in that run's evidence.

- L09 and L10 on `2c029709` in `20261107T175831Z-2c029709`. The lease
  retired and disappeared from the active Dashboard answer. The collection locator expected
  the reason as the whole cell, but the cell includes the separate source lifecycle. The pet PDF
  downloaded with its exact saved hash, but the ESM loader returned zero text runs. A local
  fixture reproduction returned 0 lines with that loader and 17 pet-agreement lines with
  the CommonJS reader. The browser cases require new observations.

- L01, L06 and L10 on `405b2ba1` in `20261107T180419Z-405b2ba1`. The empty
  filter remained pending with its previous rows. The Owner approval heading held focus while
  the obsolete Market rent comparison fragment still occupied the address and the heading
  stood 1,318 pixels below the viewport top. The pet PDF extraction then passed, but the
  brochure check lost its row locator when Check filled document became Refresh filled
  document. The retirement and restoration passed across lease, desk, Dashboard and
  saved collection, with both history events and the later source cycle verified.

- L07 on `fb203f52` in `20261107T182159Z-fb203f52`. The Editor opened the exact
  synthetic reply, confirmed the original subject and scope, and typed the intended body.
  The verifier attempted inputValue on a rich-text editing surface and stopped before
  Send. Run 5 has the earlier completed exact outgoing reply. The current conflict and
  correction separately agreed on stage and next action across lease, desk and Dashboard.

- L13 and L14 on `254b485c` in `canonical-254b485c-20261107T183640Z`.
  All 27 scenes rendered. The Tenant offer scene had a one-pixel vertical shift across
  the section. The rendered inventory later lost its local server at sign-in after
  Next dev recorded a memory-threshold restart. The monitor recorded a peak group RSS
  of 6,212,251,648 bytes against the 6,442,450,944-byte bound. The lane and canonical
  verification exited 1. The exact `a54eaf18` capture review generated all 27 scenes.
  Only the visually reviewed Tenant offer picture was adopted, with SHA-256
  `62de3125ae6530aeab4cf90253dbf500e58cf8186a6e554237fc7ee39532b00b`.

- L13 and L14 on `347bf8e5` in `canonical-347bf8e5-20261107T185054Z`.
  All 27 scenes matched, including the stabilized Tenant offer. The fresh control server
  served sign-in and the version route, then the verifier called the Fetch response's
  boolean status property as a function. No control inventory result was issued.

- L14 on `7f660154` in `canonical-7f660154-20261107T185639Z`. All 27 scenes
  matched and the rendered inventory accounted for 838 controls with zero missing. Formatting,
  lint and TypeScript passed. Unit verification exited 1 with 11,507 passed, 70 failed and four
  skipped across 1,172 files. The failures exposed outdated test fixtures and evidence inventory
  references, two unregistered route entries and an empty trailing separator in the lease target
  display. Firestore, build and served E2E did not start in that run.

- L14 on `dbb7778f` in `canonical-dbb7778f-20261107T192420Z`. The rendered
  Help check passed with all 27 scenes matched. TypeScript rejected a Playwright-only
  option on a Testing Library role query and stopped before units.

- L13 and L14 on `8a2e231c` in `canonical-8a2e231c-20261107T193901Z`. The
  rendered Help gate refused two scenes. Comparing the retained images showed a one-pixel
  displacement below the sticky Lease details toolbar and a missing Pricing basis legend
  at the bottom of Compare market rent. The unchanged source and first six hundred pixels
  of comparison content separated the second difference from a layout shift. The gate
  exited 1 before formatting, lint, typecheck or tests.

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

The 19 affected unit files reran with 197 passed. The route inventory covers the
cycle disposition and sender signature through their existing read and Editor authority.
The lease target no longer emits a separator without a following reason. The exact
`6c7bc686` capture review `20261107T191941Z-6c7bc686` generated all 27 scenes.
Nine visually reviewed images show the corrected target line. Five exceeded the
material tile threshold and four differed only at the separator glyph.
The default accessible-name matcher replaced the incompatible assertion option.
Typecheck and all six focused desk tests passed before restarting the gate.
Lease details now uses the same integer-pixel placement as the settled Tenant offer.
Compare market rent waits for the actual Pricing basis fieldset before framing. The
material-difference thresholds and required control checks are unchanged.

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

The complete mailbox-disabled rehearsal on `fb203f525f09422f7451da328ee34e8f93fe521d`
passed all 17 cases in `20261107T181636Z-fb203f52`. It observed the exact desk group scroll
and focus return, the Dashboard task link and private or missing entries, the independent
later document record, all ten current and legacy Full detail destinations, and newer
working text winning delayed readback. It worked retirement through lease, desk, Dashboard
and the preserved collection. The actual downloaded synthetic documents showed the fee,
kept the owner execution-date area blank and kept the approved brochure bytes. The
oversized owner explanation was refused and the assistance-animal amounts stayed absent.

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

## Run 4

Commit: 8149b6128ec54bbad9a569fb24262806e5b5ba2b
Starting commit: ef81b8917209f4eec3f22097142b559f3cce875b
Run: 4
Goal groups: all
Accepted: No

<!-- prettier-ignore -->
| Check | Verdict | Evidence | Repair | Blocker |
| ----- | ------- | -------- | ------ | ------- |
| L01 | UNVERIFIED | The Editor expected the exact table and its preserved saved filters. All 38 group IDs and the month and saved or empty views matched in `20261107T165608Z-8149b612/L01-desk`. The effect rehearsal read an unavailable source and recovered it. | Retained the independent fixture partition. | Record the original focus and position through each requested scoped return. |
| L02 | Yes | Browser outcome `20261107T165608Z-8149b612/L02-linked-entries`. The Editor opened the prepared lease from the desk by keyboard, from the Dashboard result and from the explicit private task. Each showed the same stage and the task returned to My Work. A second permitted actor did not see the private task. | Counted only workspace links in the month answer and used the actual task form. | None for the observed scoped paths. |
| L03 | No | The Editor expected the unavailable member's exact saved row and version after Refresh statuses. The reviewed save, recovery, second actor and stale refusal had occurred. The unavailable row did not appear within the case's wait. The imported period selection separately reread one exact member. | Wait for the changed desk inventory, then capture the exact collection response before checking the row. | Reobserve the unavailable row and retained membership after exact source read. |
| L04 | UNVERIFIED | The prepared Editor saw comparison, recommendation, stage and action on the first screen, then opened a later step without a write and restored the view and step after reload. All five numerical S252 budgets passed. | Keep the prior bounds and exact confirmations. | Complete the independent later control and keyboard return proof together. |
| L05 | UNVERIFIED | The Editor expected an exact owner decision, correction and note. The decision advanced the same lease, the correction retained the reason, and the failed note retained 1,362 characters through reload and saved once. | Kept the status and message evidence separate. | Reobserve the conflicting staff and derived records across lease, desk and Dashboard. |
| L06 | UNVERIFIED | All five Guided links and their legacy Focus URLs focused the requested heading below the sticky toolbar, returned to the same step, resolved a valid step link and handled a malformed fragment. A separate case verified tab-private note recovery. | The live workspace now owns fragment-only navigation and leaves embedded Focus behavior covered by its unit check. | Observe the delayed acknowledgment and newer incomplete working value through the exact alternate view. |
| L07 | No | The subject and body matched across Copy, Send, Schedule and composer. The draft receipt and replacement both read back exact unsent bytes. Pause and Resume kept reviewed content and the due tick accepted one exact message. The outgoing reply case timed out before the worklist opened the linked sequence. | Wait for the actual Outgoing tab selection and exact linked row before opening the reply. | Complete the outbound linked reply and readback on the candidate. |
| L08 | Yes | Browser outcome `20261107T165949Z-8149b612/s250-s251-variants`. The Editor worked standing agreement scope and override, program contact, No answer yet, Renew with the rent path, and Do not renew. The separate annual review and source move-out case saved, reread and returned to the counted groups. | Preserved all fixture variants and held automatic preparation. | None for the observed synthetic variants. |
| L09 | No | A reviewed retirement and stale refusal were worked. The later source cycle check reached the refreshed Coming up later route, but the restoration leg did not receive the required fresh source read. Pending and ambiguous cases each gave their exact Communications recovery link. | Respect the source refresh cooldown and assert the fresh result on both sides of the override. | Observe the later cycle, restored scope and history together. |
| L10 | UNVERIFIED | The Editor reached Complete and reopened the same lease from Completed. The synthetic Admin's $50 fee, the Editor's $250 deposit and the $300 total and two paragraphs persisted on reload. The packet reached Ready for preview, the other lease stayed blank, and the cross-lease rent and date check passed after exact save responses. | The form test now forces a fresh document load before reread. | Finish the browser file-byte and untouched-region observations. |
| L11 | UNVERIFIED | The narrow Editor followed named Operations, the renewal procedure, its legacy entry and exact lease return. My Work opened the same stage and the other actor could not see the task. | Kept the task result private. | Observe the requested Dashboard task answer and missing target case together. |
| L12 | Yes | Browser outcome `20261107T165608Z-8149b612/L12-connection-retry`. A narrow Admin followed the named service and an old entry, saw the injected failed read and retried successfully. The separate legacy safety task returned to the index. The Editor saw the denial and no write control. | Used the verified synthetic health response from the RentVine stand-in. | None for the observed scoped tasks. |
| L13 | UNVERIFIED | The Editor used the actual Help guide through review and completion and requested browser printing. All 32 tested heading rules kept content together, then Back returned to the exact lease section. Earlier required Help rendered all 27 scenes without drift on its own exact source. | Kept the same isolated renderer and synthetic assets. | Run deliberate missing-control and material-change injection and repeat the required positive gate on the final candidate. |
| L14 | No | The full S252 rehearsal passed 105 checks and five numerical budgets with one failure at the outgoing linked reply entry. The mailbox-disabled rehearsal passed 13 of 15. Stand-in and guard reports preserved the same effect boundaries. | Kept prior failures, the versioned S254 crosswalk and the same-date comparisons. | Complete the exact-candidate matrix, canonical and core gates, and CI. |

## Run 5

Commit: ccb8fae84bfd58c6ee28aa653610cd5fabd7f201
Starting commit: ef81b8917209f4eec3f22097142b559f3cce875b
Run: 5
Goal groups: all
Accepted: No

<!-- prettier-ignore -->
| Check | Verdict | Evidence | Repair | Blocker |
| ----- | ------- | -------- | ------ | ------- |
| L01 | UNVERIFIED | The Editor checked all 38 lease IDs, each group, both views, the explicit saved view and the empty-filter recovery in `20261107T173720Z-ccb8fae8/L01-desk`. | The driver now also measures the explicit return link's focus and scroll. | Observe the scoped position on the final candidate. |
| L02 | UNVERIFIED | The same lease and stage opened from the desk, Dashboard and explicit private task. The Approver did not see the Editor's task. | Added the explicit Dashboard task answer and missing and signed-out entry checkpoints. | Observe those entries on the final candidate. |
| L03 | Yes | Browser outcome `20261107T173720Z-ccb8fae8/L03-collection`. The Editor recovered the lost save and saw the exact two members. A second actor read them, a stale removal was refused, and a temporary missing member kept its row with no link. Restoring the source returned its link. The filtered period choice saved a separate exact member. | Matched the unavailable row by its accessible lease header and checked the returned scoped response. | None for the observed synthetic collection. |
| L04 | UNVERIFIED | The prepared Editor saw the existing numbers, comparison, recommendation and preview, inspected a later step and kept the current step. All five S252 action budgets were within their original bounds. | Added a keyboard case to work a real independent later form. | Observe the independent save and return. |
| L05 | UNVERIFIED | The decision and correction were recorded on the exact lease. The refused note kept the exact text through reload and persisted once. | Added the real staff outreach disagreement and correction across lease, desk and Dashboard. A separate rendered regression found the hand-set status cue hidden without a message conflict. | Observe all three projections and the fixed status disclosure. |
| L06 | No | The Owner approval detail check switched to Full but the screenshot stayed within the preceding comparison section. In a separate case, the incomplete amount survived view changes and reload and the later valid edit won after the earlier acknowledgment. | Record the entry method, hash, focus and geometry if a detail transition fails again. | Reobserve all current and old detail destinations and the return to the same step. |
| L07 | Yes | Browser outcome `20261107T174213Z-ccb8fae8/s247-s248-guided-path.25`. The actual Outgoing row opened the incoming conversation. An Editor sent one reply with the reviewed subject, body and exact thread. Both the original incoming message and new durable receipt reread. The same rehearsal matched Copy, Send, Schedule, two exact unsent draft receipts, Pause, Resume and one due effect. The mailbox-disabled profile saved and reread a versioned blank. | Waited for the rendered Outgoing tab and exact lease record. | Provider and customer effects retain their separate boundaries. |
| L08 | Yes | Browser outcome `20261107T174213Z-ccb8fae8/s250-s251-variants`. The Editor exercised standing coverage and override and the assisted contact, no answer, renew and do-not-renew paths. The mailbox-disabled annual review and move-out records persisted after reload and returned to their desk groups. | Kept the original role, exact saved facts and counted branches. | None for the observed synthetic variants. |
| L09 | UNVERIFIED | Retirement reached the counted desk reason. A stale tab kept its reason, a verified later source cycle stayed active, and restoration reread two exact history events. Scheduled and ambiguous work both refused with the exact recovery link. | Respect the source refresh cooldown before restoring the fixture. | Observe membership and active Dashboard scope before, during and after retirement on the final candidate. |
| L10 | UNVERIFIED | The standard Editor journey completed and reopened from Completed. The synthetic fee and deposit added to $300, the owner explanation retained two paragraphs, and the downloaded prepared pet PDF matched its recorded digest. Values on another lease stayed blank. | The extended check observes the separate owner form and unchanged brochure bytes. | Observe the protected areas, overflow and applicable assistance cases in the browser. |
| L11 | UNVERIFIED | The narrow Editor entered named Communications and Internal Processes and followed the old procedure link back to the exact lease. The same private My Work task did not appear for a second actor. | Added an exact Dashboard task answer and target availability case. | Reobserve the extended entry and return paths. |
| L12 | Yes | Browser outcome `20261107T173720Z-ccb8fae8/L12-connection-retry`. The narrow Admin read the focused service, received the synthetic refusal, retried with a verified result and returned. The old Admin anchor and the Editor refusal were observed. | Used the exact role and local metadata read. | None for the observed scoped tasks. |
| L13 | UNVERIFIED | Help printed and returned to the exact lease section. The separate exact `b4a01582` capture review generated all 27 scenes. The fixed search image was visually checked and committed at `ccb8fae8`. | The search scene uses the fixed synthetic time for generated read timestamps. | Repeat required positive verification and demonstrate deliberate control and scene rejection. |
| L14 | No | S252 passed all 106 checks and five numerical action budgets. The mailbox-disabled rehearsal passed 15 of 16 cases, with Owner approval focus unresolved. The local core and complete canonical lanes have no result on this commit. | Keep the failed detail proof alongside the positive synthetic effect and cleanup results. | Complete the same-candidate matrix, local gates and exact CI. |
