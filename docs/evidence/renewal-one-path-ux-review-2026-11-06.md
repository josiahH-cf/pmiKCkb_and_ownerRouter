# Renewal one-path UX review, November 6, 2026

This review resumes the November 5 S246 to S254 build and tests the product in the synthetic
November 5 mix. It includes the merged batch, all six previously unmerged Claude commits and the
remaining generated-ID typing-recovery implementation and regression.
The owner requests pull requests only. No merge, release, deployment, production read, real
provider operation, mailbox operation or billed comparison is part of this review.

Human verdict: NOT RUN, no human observer.

## Source and independence

- Starting current main: `2187cf09fa0d5860919940448ae1ef55cd298f05`, fetched from origin.
- Branch: `codex/renewal-one-path-ux`.
- The shared original checkout was on `a7356547de964a0736a0c761ba9938431dd9dd25`, with no
  tracked edits. Its unrelated untracked owner files remain untouched: `.codex/`, the private
  Dotloop information directory, feature-specs-to-scope, pipeline-simplification-plan, the
  existing renewal product PDFs/outline, and Python cache directories.
- No open pull requests were returned at intake. S246 to S254 implementation was already in
  main through #184 to #190. The source provenance is #184 S254 harness, #185 S253, #186 S246,
  #187 S247/S248, #188 S249, #189 S250/S251, and #190 S252/help V2.0. Their code and tests,
  rather than the registry's older statuses, establish the build state.
- Claude's clean local branch held `147c9d8a`, `d42d7a15` and `f18a5bc0`. Those repairs were
  cherry-picked as `04bfd687`, `d7618793` and `b22c2dde`. Their original branch was preserved.
  The focused recovery/guard strengthening was committed as `9fdf624c`.
- A later read of the original lane found `c107a075`, agreed-numbers continuation on the lease's
  applicable path. It was included as `01152fcd`; its original branch and commits remain intact.
- The original lane later added `120b4966`, waiting for the settled prepared Now card before
  framing its help picture. It was included as `87908f80`, followed by its four curated picture
  updates `d76dc72e`, included as `9102ed63`. All 27 current Help pictures were subsequently
  captured from `fdaf9614` and recaptured for the current assets from `a3a24d43`,
  with every recorded PNG hash checked before copying.
- The remaining uncommitted generated-ID field lookup and its regression were inspected and integrated
  with complete-text recovery, legacy snapshot compatibility and cancellation for newer input.
  The original working file is untouched. The existing 20-second recovery window is preserved.
- A fresh independent S254 session received the brief, candidate source and starting baseline
  `6491c06f3773e92c0bd811d4360371523e24d643`. It used the actual app with Editor and Admin
  rehearsal actors. It recorded expectations before observations. Initial observations use
  `9fdf624c`; each repaired surface requires a final committed-source rewalk. Earlier builder
  walkthrough evidence is provenance, never a substitute for this independent observation.
- Evidence levels here are Verified (direct observation or a named executed check), Supported
  inference (code path plus supporting tests), Assumption (a selected UX choice), Unknown
  (missing evidence), and Contradictory (two observed states disagree). Unknown is never PASS.

## Expected journeys, declared before the repaired-source walk

The following steps and expected outcomes apply to each requirement listed in its row. The
unchanged S254 handoff supplies the individual expected outcome for each L01 to L71 check.
The independent litmus report records their observed results individually. A code assertion or a
successful response alone does not establish a person's outcome.

| Journey                                 | Requirements                      | Litmus                                      | Steps and expected result                                                                                                                                                                                                                                                                                                                                         | Evidence needed                                                                                                                                    |
| --------------------------------------- | --------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| J01 Enter the desk                      | R-S246-1,2,3,4,5,6,7,8,11,12      | L01 to L09                                  | Open bare Renewals, read This batch and each group, open rows and return. The month follows the Central business date; 5 working-month, 4 carried, 12 later, 10 closed, 3 already renewed, 3 month-to-month and 1 non-renewal account for all 38. Carried rows are oldest first; each row has one stage and next action.                                          | Loaded UI, visible rows, counts against all 38 synthetic source records, boundary correction and reload.                                           |
| J02 Table, saved view and collections   | R-S246-9                          | L55,L56                                     | Open All leases and filters, use each existing view/filter/sort, save and reopen a view, then open a shared collection link. Bare Renewals offers the saved view without applying it.                                                                                                                                                                             | Starting and candidate table/control inventories, URL keys, persisted readback, keyboard and back navigation.                                      |
| J03 Ask about targets                   | R-S246-10                         | L10                                         | Ask which leases in the working batch need renewal work, and ask for the explicit working month. The assistant returns the same eligible set as the desk from a current coherent read or reports unavailable evidence.                                                                                                                                            | Returned identities/counts compared with loaded desk and source; stale refresh and failed-read tests.                                              |
| J04 Open a lease and its views          | R-S247-1,3,4,5,6,7,10,11          | L12 to L17,L19,L53,L54,L57                  | Open a row in the same tab, read the path and Now card, change steps, visit Focus and Full, and follow old step/section/control links. Guided is the default, has one stage and one next step, and every existing capability remains reachable.                                                                                                                   | Loaded route and tab count; path/Now agreement; keyboard, pointer, legacy links, complete control inventory.                                       |
| J05 Variant path and arbitrary order    | R-S247-2,8                        | L20,L46 to L52                              | Inspect the covered and assisted paths, then Work a later step now. The same controls are available without unlocking previous steps; an inspection leaves underlying progress unchanged.                                                                                                                                                                         | Before/after saved state, same-page navigation, variant actions and current-step landmarks.                                                        |
| J06 Reload retained work                | R-S247-9                          | L18                                         | Type an unfinished value, select a non-default step/view, scroll and reload the same path. The complete focused text, view, step and position return. New typing wins over delayed recovery; passwords are excluded.                                                                                                                                              | Actual reload on desktop/phone; focused input tests including more than 5,000 characters and a new edit during recovery.                           |
| J07 Prepared kickoff                    | R-S249-1,2,5,8,10,11              | L21 to L24,L27,L29 to L32,L45               | Open the prepared row, inspect numbers/comparison, recommendation/basis, recipient/signature/template and exact preview, Review and send, then confirm once. The candidate uses 3 actions and 1 tab including opening; the historical baseline is measured through its own help. Missing input has its own fix in place.                                          | Counted actual actions/tabs, visible exact review and separate confirmation, accepted stand-in message and evidence readback.                      |
| J08 One message across delivery routes  | R-S249-6,7,9,12                   | L27,L28,L40,L44                             | Edit rent/reason, inspect each delivery preview, copy, open Communications, create a draft, edit again, replace with exact confirmation, and accept/reject an AI revision. All routes carry the displayed revision. Authored wording stays exact with a visible deliberate resolution when facts change; a draft's review banner remains intact.                  | Actual payload/clipboard and visible previews; created-draft evidence; rejected AI instruction retained; recovery/Undo; no real mailbox.           |
| J09 Preparation controls and allowance  | R-S249-3,4,13                     | L33 to L35                                  | Hold automatic comparison off throughout automation. Use Prepare this batch manually with the stand-in, reuse stored results, and reach the synthetic allowance. Remaining rows name the allowance and own-figures entry.                                                                                                                                         | Stand-in request counts, existing setting and reset readback. Automatic-start L33 stays UNVERIFIED under the owner's hard limit.                   |
| J10 Accepted outreach and correction    | R-S248-1,2,10                     | L25,L26,L39,L40                             | Send with exact confirmation, separately schedule with review, inspect a draft, record outside Gmail sending, then disavow an outreach with a reason. Only accepted or explicitly staff-recorded outreach advances the evidence state. Scheduling alone establishes no outreach.                                                                                  | Visible card and desk plus exact accepted/scheduled/staff/corrected records, times, sender and audit attribution.                                  |
| J11 Owner reply and failure recovery    | R-S248-3,4,5,6,8,9                | L20,L36 to L41                              | Observe an exact linked reply, read its text, choose a decision and approver and record; inject uncertain send, failed delivery and a newer conflicting staff record. The primary next step names the actual state, preserves both facts and offers a recovery. Reply reading never chooses an outcome.                                                           | Controlled stand-in outcomes, plain-text exact message, loading/error/partial/retry, no preselection, attribution and reconciliation readback.     |
| J12 Later steps and completion          | R-S248-7,11,12; R-S249-14         | L04,L42,L43,L53                             | Record owner decision, offer tenant, record response, prepare documents, inspect source-update previews, use existing hand records where provider work is closed, reach Complete and return to desk. Each consequential operation retains its own exact confirmation. A stage never creates follow-up work automatically.                                         | One named next step throughout the actual path; completion and desk readback; scheduled/deadline/reminder inventories unchanged.                   |
| J13 Standing agreement                  | R-S250-1,2,3,4,5,6,7,8,9          | L46 to L48,L54,L55                          | Read active agreement choices and rules in Pricing basis, choose scope and Save, follow the covered owner step to tenant offer, type a different rent, inspect rule version changes. Typed rent wins; disagreement reopens owner review with a reason; existing message tools remain available.                                                                   | Scoped saved authority, calculation/rule/version tests, covered and overridden UI, retained Full/Focus controls.                                   |
| J14 Housing assistance                  | R-S251-1,2,3,4,5,6,7,8,9,10,11,12 | L15,L33,L43,L49 to L53,L70                  | Set Yes with a program, inspect program contact and unselected tenant/rent decisions, choose Keep or Propose, record non-renewal, inspect unset/voucher-only cases and cycle carry. Missing program gets an explicit field error. Assistance alone creates no comparison, deadline or inferred client rule.                                                       | Same two field placements, saved per-lease state/cycle tests, path changes, tags, missing-input recovery and stand-in counts.                      |
| J15 Help and walkthrough evidence       | R-S252-1,2,3,4,5,6,7,8,9,10,11    | L14,L23,L24,L36,L53,L54,L59 to L62          | Follow the in-app guide using named controls; compare pictures with loaded screens; inspect all 20 ledger rows and each action-budget row. Preserve S171/S199/provider holds. Report synthetic model observation separately from the future staff session and original/map approvals.                                                                             | Actual guide walk, 27 current synthetic captures, control checks, old control preservation, ledger/matrix, human verdict NOT RUN.                  |
| J16 Published pet fee and deposit       | R-S253-2,3,4,5,6                  | L63 to L65                                  | Admin publishes synthetic fee 50; Editor records a single ordinary pet's deposit 200/source; inspect 50+200=250 and both form blanks. Try no deposit, multiple pets, assistance animal and an original with conflicting 150 text. Only supported exact totals print, and differing source text is refused.                                                        | Visible page, generated synthetic PDF and extracted text, exact refusal and no invalid output; no inferred animal registration rule.               |
| J17 Per-lease forms                     | R-S253-7,8,9,10,11,12             | L66 to L70                                  | Enter two paragraphs in the owner explanation, prepare, exceed its box, leave it absent, inspect execution date, brochure boxes, more than four tenants, differing organization text and another lease. Exact paragraphs stay; overflow is refused; execution date/initials/agency stay blank; unrelated forms proceed; nothing leaks to another lease or policy. | Synthetic rendered PDF and text, specific overflow bounds, untouched boxes/organization bytes, missing-form-only hold and separate lease readback. |
| J18 Business answers and originals      | R-S253-1                          | L65 to L69                                  | Compare code/spec holds with the existing answered/open split. Real private original/map/legal approval or a new client answer cannot be established in this synthetic audit.                                                                                                                                                                                     | Code/proposal consistency is a supported inference; exact client/authority answer and real approved artifacts remain UNVERIFIED.                   |
| J19 Independent report and preservation | R-S254-1,2,3,4,5,6,7,8,9          | L06,L11,L24,L58,L59,L71 plus all L01 to L71 | Use the fresh handoff, both named source commits, complete all reachable checks, repair and rewalk, validate all 71 rows, run focused/full gates, clean temporary outputs and deliver PR only. Any No or missing check prevents acceptance.                                                                                                                       | Fresh report with original failures and final observations, actual action counts, validator, exact-head CI and cleanup confirmation.               |

## Findings and decisions

These are the initial observations. Final rewalk and verification results are recorded below when
executed; an implementation alone is not marked verified.

| ID     | Evidence and consequence                                                                                                                                                                                                                                                                                | Baseline                          | Correction and reason                                                                                                                                                                                                                                                                                                                             | Status                                                                                                                                                                 |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UX-001 | The inherited stage fallback omitted who owns an unrecorded next step. Staff must infer the responsible party.                                                                                                                                                                                          | P02,P03,P04; SC02,03              | Included Claude's explicit PMI KC team wording. Preserve the stage model and record the party in its existing line.                                                                                                                                                                                                                               | Implemented; final rewalk pending.                                                                                                                                     |
| UX-002 | The inherited wide path type wrapped the assisted path into three rows before core work.                                                                                                                                                                                                                | P08,P11,P15; SC03,07              | Included Claude's compact path type and spacing, preserving every step and full labels.                                                                                                                                                                                                                                                           | Implemented; final viewport rewalk pending.                                                                                                                            |
| UX-003 | Reload recovery truncated a focused entry at 5,000 characters, could overwrite newer typing, and could lose the field when its generated ID changed.                                                                                                                                                    | P05,P12,P13,P14; SC04,05,09,10    | Include the inherited continuity and late name lookup, retain complete text, match a unique visible name or retained ID, keep legacy snapshots readable, and cancel delayed recovery on new input/key/pointer activity. Ambiguous targets keep their current values; passwords remain excluded.                                                   | Focused eight-case recovery tests and typecheck passed; final actual reload rewalk pending.                                                                            |
| UX-004 | The actual covered-owner Now card said no message was needed while its prominent action still said Send the owner message; its ready/decision text also asked for owner outreach.                                                                                                                       | P02,P07,P09; AP03,09; SC03,06,08  | Use Continue to Offer the tenant, show coverage in existing ready/decision lines, retain all optional owner message tools. D-OP agreement authority is unchanged.                                                                                                                                                                                 | Implemented; final rewalk pending.                                                                                                                                     |
| UX-005 | Choosing Housing assistance Yes with blank Program produced no specific error or saved value. Required was false on the live field.                                                                                                                                                                     | P02,P05,P12,P16; AP07; SC04,05    | Mark Program required for Yes, explain what saves it, show a blur error, and explicitly confirm successful saves. Apply the shared component in both locations.                                                                                                                                                                                   | Focused tests passed; final rewalk pending.                                                                                                                            |
| UX-006 | Working-batch questions selected all leases or My Work; an explicit December query initially included a move-out and returned 6 while the desk showed 5. Later fresh evidence returned 5.                                                                                                               | P03,P09,P12; SC02,08              | Recognize the user's batch terms, preserve explicit renewal-task queries, and await one bounded coherent source refresh for assistant targets or report unreadable evidence. No fabricated target state.                                                                                                                                          | Focused parity/stale/failure tests passed; final rewalk pending.                                                                                                       |
| UX-007 | A just-created unsent Gmail draft immediately read older because the comparison included its required review banner. The waiting state appeared only after manual reload.                                                                                                                               | P05,P09,P12; AP07; SC04,08        | Exclude only the exact leading banner from the non-authority wording-revision comparison, keep exact preview/claim hashes intact, and refresh page evidence after confirmed creation. No replay or relaxed confirmation.                                                                                                                          | Focused tests passed; final draft rewalk pending.                                                                                                                      |
| UX-008 | Guided header showed In progress and Staff status: Not recorded above its one evidence-derived stage, giving competing status signals.                                                                                                                                                                  | P02,P08,P09,P15; AP04; SC02,06    | Disclose these existing secondary labels in Focus/Full; retain the single derived stage and disagreement action in Guided. All controls and source fields stay present.                                                                                                                                                                           | Focused view-preservation test passed; final rewalk pending.                                                                                                           |
| UX-009 | Assistance-animal form inputs correctly had no registration input, but a generic staff task/readiness label still asserted registration.                                                                                                                                                                | P02,P03,P09; AP01,03; SC02,08     | Rename the same activity Animal follow-up and the legacy readiness item Animal charges and agreement. Keep its ID, records, predicates, source-update confirmations and all ordinary-pet tools. Preserve old snapshots and add an explicit exact-name migration in the Full-view comparison.                                                      | New Full-view preservation fixture passed; final form/control rewalk pending.                                                                                          |
| UX-010 | The replied lease showed its received time, mailbox and decision radios but no actual reply text. A meaningful approval decision needed a separate lookup.                                                                                                                                              | P01,P04,P13; SC01,03              | Read the exact observed message through the existing authorized linked-thread route, plain text in client memory, with visible loading, partial, missing and retry states. No new grant, body persistence, reply inference or preselection.                                                                                                       | Implemented; focused and final rewalk pending.                                                                                                                         |
| UX-011 | After an accepted AI body, changing Reason to include kept the authored body, as S161 requires, but Guided omitted the existing stale-information notice and resolver.                                                                                                                                  | P04,P05,P09,P12; AP07; SC04,05,10 | Expose the existing changed-information state, deliberate Return to the standard wording and Undo on Now. Preserve the authored body and all exact transport checks.                                                                                                                                                                              | Implemented; focused and final rewalk pending.                                                                                                                         |
| UX-012 | The comparison lines inserted an em dash into owner message copy.                                                                                                                                                                                                                                       | P09; SC08                         | Use a colon in the existing generated line and update its pinned expectation.                                                                                                                                                                                                                                                                     | Focused content test passed.                                                                                                                                           |
| UX-013 | Default rehearsal seeds enabled the automatic comparison, conflicting with this audit's explicit boundary. The app entry needed a fail-closed preload assertion, and the shell's port/config helpers and outer Firebase CLI did not inherit that guard.                                                 | P07,P12; safety boundary          | Add --hold-automatic-comparison and preserve it across reset. The one-path, help and November/December wrappers load the guard before their first Node helper; each inherited preload self-checks and records readiness before its entrypoint. Keep existing heap bounds. Use manual synthetic preparation where allowed. L33 remains UNVERIFIED. | 32 focused safety checks passed, including an outer process and inherited child refusing a reserved invalid provider host. Final wrapper rewalk pending.               |
| UX-014 | An offline sentinel test against the original preload found that two net.createConnection overloads reached the base socket method because Node forwarded a normalized options array. This invalidates a broad isolation claim for initial runs; it does not establish that a real connection occurred. | P07,P12; safety boundary          | Inspect normalized and direct socket arguments before DNS/connect, retain loopback and Unix behavior, and self-assert the preload. The test uses an offline base method and a reserved invalid hostname, so it creates no provider connection.                                                                                                    | Fail-first: 2 failures/30 passes against the original guard, including missing per-process readiness; repaired guard: 32 passes. Final strengthened rehearsal pending. |
| UX-015 | The additional Claude repair records that agreed Check the numbers always continued to Compare market rent, including on the assisted path where that step was outside the path.                                                                                                                        | P02,P07,P09,P13; SC03,08,10       | Include c107a075, deriving the continuation from the next applicable path step and naming that destination. The standard comparison continuation is kept; the assisted primary continues to program contact. S251 R4 and Help record the same behavior.                                                                                           | Included with its focused regression; independent final primary-action rewalk and full gate pending.                                                                   |
| UX-016 | The later Claude scene repair records that the first cold Guided help picture could capture Send the owner message and Reading the pricing basis before the prepared card settled, contradicting its caption.                                                                                           | P02,P09; SC08                     | Include 120b4966. The existing scene action waits for Review and send before framing; it changes no application action or verification bound.                                                                                                                                                                                                     | Included; final synthetic capture and picture review pending.                                                                                                          |

UX-005 follow-up, observed on `30a3e46c`: the completed Program field retained its value after a
controlled HTTP 503 and correctly said it was unsaved. Recovery required another focus/blur
because no retry action was visible. The shared field now uses the existing AutosaveStatus
component for Saving and Try again, in both locations. It keeps the original idempotent save,
complete-value checks and edit permission. Verification of this additional correction is pending.
This addresses P05, P12, P13 and SC04, SC05, SC10.

UX-017, observed on `30a3e46c`: an address-specific question returned exactly one lease with the
same stage and next step, but the explicit numeric lease question returned all 38, with only the
first 25 displayed. The deterministic interpreter dropped that reference. The correction retains
the person's explicit lease phrase in the existing text filter and resolves its numeric ID exactly
in the actor-scoped answer and linked table, including an empty result for a missing ID. It adds
no control, grant or saved state. This addresses P03, P09, P12 and SC05, SC08. Implementation
and focused tests are pending verification; the failed observation is retained.

UX-018, observed on `30a3e46c`: a first draft confirmation was refused despite unchanged visible
wording. The immutable emulator snapshots establish why: notice-safety version advanced from 9
to 11, with the same semantic/scope hashes and message payload. The next preview also held its
own saved preparation revision (1 to 2). This is current-evidence re-review, preserved under the
guardrail boundary. The refusal now accurately names message or lease evidence, with the same
pre-provider refusal and exact confirmation predicate. No confirmation is retried automatically.
This applies P05, P12 and SC04, SC05; the material review boundary is preserved with its reason.

UX-019, observed on `30a3e46c`: a deliberately lost successful draft response kept one exact
attempt and offered recovery, but the control was below Now at page y=4134. After recovery the
first stage capture was transiently old; a later capture correctly showed Draft waiting in Gmail,
Send the Gmail draft and I sent it from Gmail without navigation or reload. The refresh request
took 1.243 seconds. The correction puts the same recovery handler on Now with visible progress,
retains the Full view control, refreshes editor metadata after confirmed recovery, and includes
the service's confirmed reconciliation outcome. Unknown/not-found recovery never becomes success.
This addresses P04, P05, P13, P14 and SC03, SC04, SC09, SC10. Final rewalk is pending.

UX-020, observed on `3996c380`: opening the replied lease before injections produced two React
list-key warnings from the staff-status section and per-audience message editor. No hydration
exception was captured. The correction gives those two existing nodes stable keys; it changes
no label, layout, capability or saved state. P09 and SC08 apply. Final console recheck is pending.

UX-021, observed on `3996c380`: while an actual successful program-only response was delayed,
staff typed a newer contact and kept focus there. At 300 ms and one second after the HTTP 200
response, that contact was empty. The new saved entry unconditionally replaced all local fields.
This is data loss (P05, P12, P14; SC04, SC05, SC09). Both placements now track local edit and
confirmed-save generations, preserve newer Program/contact/notes typing, and reuse the existing
"Unsaved housing assistance edits" status until that entry saves. Older results keep their own
scope and never replace newer feedback. The backend field, CAS and idempotent request behavior
stay unchanged. The six-case regression passed after failing against the original component;
final real-interface recheck is pending.

UX-022, introduced by this branch's Help V2.1 move and observed on `3996c380`: two prior V2.0
picture URLs returned 200 text/html with the generic This guide moved page, with no image. The
correction redirects old versioned PNG URLs to their current same-named picture. The current-only
asset-folder gate remains strict, and historical original pixels remain available from their Git
commit. Installed Next redirects and configuration/TypeScript guides were read before the config
change. This addresses P09, P12, P13 and SC08, SC10. Final actual image recheck is pending.

UX-023, observed on `3996c380`: a separately confirmed draft's response was deliberately lost.
The dialog closed to BODY with its old trigger disabled. After exact recovery, Tab reached the
optional Communications link rather than the visible next action. The correction gives the shared
dialog an explicit fallback for a disabled/removed trigger and supplies the exact recovery button
on this card. The existing dashboard focus helper returns confirmed recovery to the visible Now
heading; unresolved recovery returns to its own control. Review, confirmation, busy and cancellation
semantics are preserved. This addresses P05, P13, P14 and SC04, SC09, SC10. Disabled/removed-trigger
and recovery-outcome regressions passed; final real-interface keyboard recheck is pending.

UX-024, observed on `59808383`: a valid long program name put the Numbers primary action's
bottom at 905.6 px on a 1280 by 800 screen and 1,840.3 px at 390 wide. Even the normal name's
phone action ended at 1,631.3 px. Both themes failed the unchanged L14 / R-S247-10 bounds.
The phone header stacked utilities, the lease header repeated spacing, and the Now card put
duplicate full-name context ahead of the action. P01, P06, P08, P11, P14 and SC03, SC06, SC07
apply. The correction shares phone-header rows in DOM order, compacts Guided spacing and places
the action after the heading and consequential alerts, before supporting next-step/detail text.
Every full label, header control, touch target rule, Focus/Full view and warning remains. The
read-only canary and independent oracle now also require action-before-context order. The
unchanged viewport budgets require a fresh committed-source browser check; prototype geometry
is diagnostic evidence only. Extended `67408d3f` testing used a valid 120-character program
name on the existing two-tenant assisted lease. Desktop fit at 775/777 px, while phone actions
ended at 1,611.25/1,618.25 px in both themes. The ordinary name fit at 1,427.25/1,404.25 px.
The pending correction tightens existing header/toolbar row spacing by 40 px in Guided view;
it preserves label text, font size, controls and touch heights. Final testing also includes the
existing five-tenant synthetic lease. This remaining failure is retained until actual recheck.
The committed `7e0d11af` checkpoint measured 96 cases: normal and maximum 120-character
program names, the first four steps, three existing one/two/five-tenant leases, both widths
and both themes. One- and two-tenant cases fit; the five-tenant maximum still failed Numbers
and program contact, at 803/805 px on desktop and 1,635.25/1,642.25 px on phone. No horizontal
overflow was observed. The next correction uses the existing compact 8 px inset for Guided
and Now, preserving full labels, type and touch sizes. The read-only landmark/oracle now also
checks actual primary top/bottom and viewport dimensions for those early steps; production's
existing 1440 by 1000 viewport and all other bounds remain. Actual recheck is pending.
The phone Guided canvas also uses the existing 12 px spacing token, giving full wrapping labels
more width. This is still a pending layout correction until the same 96 cases pass on committed
source; no prototype or static geometry assertion establishes the rendered outcome.

UX-025, observed while visually reviewing the `351ace2c` Help capture: ordinary prepared-lease
pictures showed "RentVine status unavailable" and "pending or closed lease (Active)". The
three-lease Help/older-journey fixture declared Active names but omitted their export status IDs
and the catalog's primary status IDs. The app correctly kept the missing evidence unknown.
This teaches a misleading ordinary flow (P02, P09; SC02, SC08). The fixture now explicitly
identifies its two Active leases and supplies primary status 2 for its Active and move-out-notice
catalog rows, matching the already complete November 5 mix. Production status classification,
unknown-state behavior and the refusal guard are preserved. All 27 earlier captures succeeded
as captures; those ordinary-flow pixels are superseded by a fresh capture on the corrected source.

UX-026, observed on frozen `67408d3f`: the missing-owner-recipient row and Now card correctly
named the missing input, but its fix focused "Compose owner message in Communications".
The target was the entire message card, so the generic focus helper chose its first link.
No provider link was followed. This fails the intended fix outcome (R-S249-11, L30; P02, P04,
P09, P13; AP09; SC03, SC05, SC10). The correction gives recipient reasons and the existing
source-record handoff a canonical focus target for both message audiences. Already-read owner
records are shown there; when none exists, the already-read lease record explains the owner
handoff and refresh. All former links remain. The same generic target affected the missing
template; its fix now focuses the actual publication status. The read-only canary and independent
oracle additionally require a real recipient-specific target for this exact visible action.
Focused tests and a fresh browser check are pending. The actual provider edit remains UNVERIFIED
by hard limit.

The `7e0d11af` checkpoint confirmed the actual missing-owner action now focuses its recipient
handoff. An injected tenant-recipient failure still had no action on its missing-input row,
although its existing lease source link was present below. The tenant fallback had null fixes
for recipient and template. They now use the same canonical handoffs, in the existing readiness
rows, with two conditional actions recorded in Help/map rows 94 and 95 and the same spec.
This Add addresses a demonstrated missing resolver (DR-06); it grants no provider edit or approval.
Mounted missing-state focus/no-dispatch tests and the next-source browser recheck are pending.

UX-027, observed on `67408d3f`: "Show me the working month's renewals." returned a fresh,
confident zero with an unrequested assignee=me filter. The same working-month question without
"Show me" returned five. The deterministic interpreter treated every bare "me" as ownership,
contradicting its own model contract (R-S246-10, L10; P02, P03, P09; SC01, SC08).
The correction reserves assignment for explicit my/mine/assigned-to-me wording, retains display
phrases' visible record scope, and makes the model instruction explicit too. Three common display
utterances join the exact batch-membership regressions. Tests and the next-source browser check
are pending; the real model provider remains UNVERIFIED.

UX-028, observed on `67408d3f`: an explicitly selected two-lease collection with a name and blank
period dates returned "Invalid ISO date". Neither period field had a required marker or required
attribute. The entries were retained and adding dates recovered the review/save, so this is a
required-field and error-description failure (R-S201-1, preserved by R-S246-9; P02, P12, P14;
SC02, SC05, SC09). The correction uses the existing Field component for the already-required
name/from/through, with required cues, specific inline messages and focus on the first missing
value before any review request. The period bounds, explicit selection, review and confirmation
remain identical. Its focused regression and real-interface recovery recheck are pending.

UX-029, observed on `67408d3f`: the assisted owner-answer card had no radios after 25 seconds;
its primary focused Renew in the legacy content outside Now. The ordinary owner-response,
tenant-response, outreach and working-terms controls were also outside Now. They stayed on the
same Guided page, which does not satisfy the literal card requirement (R-S247-4, L17; P04, P08,
P11; SC03, SC08). The shared correction puts the existing revealed controls and the Now
introduction inside one visual/named card, with the path before it and section links after it.
The controls keep their same React and DOM position; transparent Full/Focus wrappers preserve
their presentation and unsaved state. Presentation markers apply to navigation, keeping ordinary
field-to-field autosave active. New regressions require every visible step field inside Now and
the exact typed input node/value preserved across the three views. The read-only assurance
oracle now also rejects visible work fields outside Now. Focused tests, same-source geometry
and a fresh complete actor walk are pending; the litmus requirement is unchanged.

UX-030, observed on `67408d3f`: saving a blank Admin standing agreement returned a technical
schema dump, including UUID and regular-expression diagnostics, without required markers or
field errors. Values were kept and no save succeeded. This fails R-S250-1; P02, P12, P14;
SC02, SC05, SC09. The correction uses the same client-safe domain schema before dispatch,
marks its existing required fields and puts plain errors beside them, with focus on the first
invalid field. The server's schema, permissions, verified portfolio read and versions stay
authoritative. Blank/malformed-entry regression tests and the next-source actor check are pending.

UX-031, observed on `67408d3f`: the existing Use policy proposal control saved the covered
lease's rent with only a generic policy context. After the Admin changed the actual rule from
3 to 4 percent, the saved amount stayed $1,751 but the message called it Entered by staff and
offered neither its earlier rule nor Rebuild with the current rule. This fails R-S250-7;
P02, P04, P09; SC02, SC04, SC08. Proposal adoption now preserves the actual applied agreement
and policy version. Message composition can describe that earlier rule while the normal coverage
function still requires the current rule for owner-step coverage. Explicit rebuild uses ordinary
working-rent and message saves; a failed save keeps the earlier value and a staff typed rent wins.
Mounted adoption/rebuild tests and an emulator regression cover the state change; execution and
the next-source actor check are pending. No historic generic record is assigned an invented basis.
Existing adopted amounts also name their recorded source consistently on the desk, Now card and
message, rather than calling every saved proposal Entered by staff. A generic historical policy
label stays generic; it gains no inferred standing agreement or coverage.
The `7e0d11af` checkpoint confirmed the adopted policy stamp and earlier-rule API basis/notice.
It exposed one remaining hard-coded Entered by staff line in the shared
Rent to recommend field. That field now uses the same recorded-source helper; mounted tests
cover both a named agreement and a generic historical policy label without a save on read.

UX-032, observed on `67408d3f`: the original control map's row 5 named Refresh source facts,
while both the baseline and current rendered control read Refresh data. The obsolete map name
prevented a literal name lookup. P09 and SC08 apply. The map now records Refresh data and keeps
Refresh source facts in formerly, with the actual component as its source. The interface, help's
existing Refresh data wording and litmus remain unchanged. The final preservation check must
use the explicit recorded mapping; conditional provider-effect controls retain their own limits.

UX-033, observed on `7e0d11af`: a real terms-rent save was held before the rehearsal server.
At 800 ms the field held the newly typed synthetic amount while an enabled exact-send review
carried the older confirmed amount. A controlled HTTP 503 produced the same older review.
Both reviews were cancelled; no send ran. This hides state during a consequential action
(P02, P05, P09, P12; SC02, SC04, SC05, SC08), with core-outcome priority. The existing message
action now waits for its own working figures, reads their normal confirmed preparation and
preserves the exact review/confirmation. Failure keeps the entry, focuses its field and prepares
no older review, schedule, Gmail preview or Communications handoff. Copy keeps the displayed
bytes and names unconfirmed figures. The recommendation uses the existing AutosaveStatus,
required Field and retry. Unrelated fields remain independent. Mounted delayed, failed,
newer-input, copy and transport cases passed; actual rehearsal recheck is pending.

UX-034, observed on `7e0d11af`: a successful older rent response was held while a newer rent
was typed and focused. Releasing it replaced the newer value at both 300 ms and one second,
without that newer entry ever being left. This is data loss (P05, P12, P14; SC04, SC05, SC09),
with core-outcome priority. Existing working money/date editors now share one lease-local draft
per field. An acknowledgment clears only its own entry; later complete choices queue using the
confirmed field revision, and Full/Guided switches retain the same draft. The local generation
never enters HTTP or persistent state. An uncertain 5xx or unreadable response retains its exact
operation identity for recovery. The server's CAS, actor, idempotency and validation remain.
Money/date and shared-view mounted cases passed; actual newer-typing and reload recheck is pending.

UX-035, observed on `7e0d11af`: after UTC midnight, the comparison read Compared 11/07 while
the working business date and the stored retrieval's Central timestamp were still 11/06. The
shared projection sliced the UTC date from its actual observation time. This misstates age
(P02, P03, P09; SC02, SC08). It now uses the existing business timestamp formatter with Central
time and zone, or Comparison time unavailable for unreadable metadata. It changes no stored
instant, comparison, provider call or allowance. Winter/summer midnight and malformed-time
regressions passed; actual shared desk/Now recheck is pending.

UX-036, observed on committed `269b4f16`: a successful composition response for the earlier
rent was held while a newer rent was entered and saved. Releasing the response opened an enabled
exact send review with the older amount while both the field and actual working record held the
newer amount at revision two. The review was cancelled. This is a consequential stale snapshot
(P02, P05, P09, P12; SC02, SC04, SC05, SC08), with core-outcome priority. Review and Schedule
now check their actual relevant field revisions and local save state after composition and after
the application draft save. Changed figures leave the older review closed and give recovery beside
the existing Now action; the next review updates the same saved app draft. The shared audience
field list and client revision read add no persistent data or HTTP fields. Verification is pending.

UX-037, introduced by the financial recovery on `269b4f16`: a refused save kept the amount and
blocked an older review, but keyboard focus stayed on BODY. The visible Now input crossed the
viewport's bottom at 804 px and Try again was below it at 902 to 942 px. The retained Full input
shared the field but used a generated ID outside the dashboard helper's canonical prefix. This
fails P05, P12, P13, P14 and SC04, SC05, SC09, SC10. Recovery now prefers the Now editor, focuses
the actual generated or canonical input, opens its existing disclosure when needed and centers
the field and nearby status. Its error names the rendered field label. Only that financial refusal
clears after its own confirmed recovery. Existing IDs, controls and view navigation stay intact.
Verification is pending; the earlier partial safety/value pass does not pass this focus outcome.

UX-038, introduced by the financial focus recovery on `c1981cd8`: a refused Gmail preview
kept its modal open with Create disabled while focus moved to the underlying rent input.
Tab then moved to BODY, and Escape left the modal open after 25 seconds; only pointer Cancel
closed it. No draft was created or confirmed. This excludes keyboard users from a core task
(P12, P13, P14; SC05, SC09, SC10), with top priority. A failed financial preparation now returns
its local focus recovery to the existing preview controller. The empty dialog closes first,
finishes ordinary focus restoration and then focuses the actual field and its nearby retry.
Create and Replace share that controller. A successful preview and its separate exact
confirmation retain their original behavior; an earlier cancel/step change keeps its own focus.
This client-only recovery callback changes no request, permission, provider seam or saved record.
The focused mounted keyboard case and actual browser recheck are pending.

UX-039, observed on committed `58f93a54`: Tab from a refused rent input started its blur
save and removed Try again just as focus reached it. The 503 response restored the button,
but focus remained on BODY. Input and operation identity stayed intact. This blocks keyboard
recovery (P05, P12, P13, P14; SC04, SC05, SC09, SC10). The shared AutosaveStatus now keeps
the same retry through saving, exposes aria-disabled while an operation is pending, and
prevents duplicate activation. After success the focused retry remains until the next Tab;
then it retires as focus reaches the following control. All consumers share this correction.
Verification is pending.

UX-040, observed on committed `58f93a54`: a successful Gmail preview opened while busy
with disabled buttons and left focus on BODY. After loading finished, Escape still failed
and Tab reached background Copy. Pointer Cancel worked; no draft was created. This fails
P12, P13, P14 and SC09, SC10. ConfirmationDialog now focuses its dialog during initial
loading and moves to Cancel when ready, with both Tab directions contained. Dispatched
operations retain their existing cancellation boundary. No provider or saved-state contract
changes. Verification is pending.

UX-041, isolated by source inspection on `835ba306` and reproduced in both mounted housing
placements: after a successful retry, the form unmounted its shared status even while Retry
held focus. Both tests received BODY after the stored record and its saved notice appeared.
This breaks the keyboard continuation after recovery (P05, P09, P13, P14; SC04, SC08, SC09,
SC10). The same status instance now stays mounted across acknowledgment, with its existing
saved/edited wording and the focused, unavailable retry until Tab leaves. Idle status adds no
markup or layout. The store, permissions and default lease rendering stay unchanged. Before
the fix, two keyboard checks failed and eight other housing checks passed. A final rehearsal
is needed to verify the person's outcome.

UX-042, verified on `0546d986`: the selected five S252 phases finished with 77 checks passing
and two failing L58 log checks, both pointing to the guarded emulator CLI's public `/cli.json`
metadata request. The guard refused it; the other three refusals were npm tooling. All five
measured budgets were within their bounds. The installed Firebase CLI skips the optional metadata
fetch in CI mode. Apply that mode only to the emulator invocation in each rehearsal launcher.
No refusal is hidden, reclassified or allowed through, and both checks remain unchanged.
This preserves the audit's isolation boundary (P07, P12). The repeated journey must confirm it.

UX-043, observed on `4d3359d7` in the existing November/December journey: the ordinary
Active fixture reached the correct December target and carried row, but the old harness
expected the unavailable-status wording there. The normal check now requires its absence.
The existing controlled status-table outage now also requires the target to remain visible
with the unavailable wording, the full loaded count to stay three and a fresh read to clear
the wording. This separates valid and failed evidence without changing classification or the
R-S246-12 fail-closed check (P02, P09, P12; SC02, SC04, SC08).

UX-044, observed in the same journey: two overlapping Communications composition reads both
failed with Firestore transaction-lock timeouts. The page showed a raw JSON parsing error and
Close, with no draft or usable continuation. A repeated composer load now joins the pending
read for that exact entry and actor, and only a current result can install its app draft. A
failed read gets a plain error and Try again beside the existing Close, with visible loading,
keyboard focus retained during the retry and returned to the loaded heading. This Add addresses
the observed dead end (DR-06; P01, P05, P12, P13, P14; SC01, SC04, SC05, SC09, SC10). Existing
authorization, evidence reads, app-draft idempotency and exact dispatch review are unchanged.
The full browser rerun must verify whether duplicate reads caused the timeout.

UX-045, observed on `eb846ea5` in the older journey: its document prerequisite tried an
owner-outreach field while Guided view displayed Documents and signatures. No workspace save
was sent and later document checks had no cycle. The driver now deliberately chooses the
preserved Full view and confirms its pressed state before using the same staff activity field.
It still requires the actual save, exactly one stored work record and the same document and
readback outcomes. This keeps the later-step check on the person's real route (P04, P09;
SC03, SC08), without adding a product requirement or using a fixture record as proof.
The failing run was stopped after the dependent document failures; its isolation controller
terminated the owned children and reported zero remaining. Later steps were unobserved there.

UX-046, observed in the first full gate on `2ef9a967`: the branch's global Help
picture redirects crossed the sign-in test's strict configuration boundary. The same-origin
picture compatibility now runs only for known previous-version PNG names on GET or HEAD,
after the existing request policies. All 27 previous V2.0 picture names redirect temporarily
to the matching current asset. The original Next configuration, sign-in test, relay rewrites,
authentication, roles and request policies are unchanged. This keeps old embeds usable
without a broader route rule (P09, P12, P13; SC08, SC10).

The same gate also found five mounted-message suites that lacked an App Router context, a
composer heading-focus race in the test, four in-place help strings missing from the S244
inventory, and an old S132 runbook and control inventory name for Refresh data. The corrections
supply the mounted tests' normal route context, focus the ready heading as it renders, add
the four specific recovery messages to the inventory and reconcile the real, unchanged label
across the walkthrough and inventory. Every substantive test assertion is retained. The
focused rerun passed all 204 checks across 15 files, including the original sign-in and
request-boundary assertions, exact recovery focus, old-picture scope, the help inventory and
the older walkthrough. TypeScript and the Help, copy-voice and traceability checks also passed.

UX-047, observed on `76160a22`: Enter on the linked reply's Try again correctly
started the exact read and retained entered decisions, but it removed the focused
button before replacing it. Visible focus briefly fell to the body. The next Tab
still reached the selected decision radio. Preserve the same button and focus while
reading; if it still has focus on success, the visible reply heading receives focus.
A newer decision focus stays in place. No linked-thread scope, data, retry limit or
recording authority changes (P05, P12, P14; SC04, SC09).

UX-048, observed on `76160a22`: after one confirmed synthetic draft's response was
lost, Guided Now exposed two accessible Recover exact Gmail attempt buttons for
that same attempt. One was under Owner message and the other under Owner approval.
There is one visible current recovery beside the compact preview in either audience's
Now card. The original Unsent Gmail draft control remains where that compact preview
is absent, including Full view; earlier distinct attempts remain available. No draft
attempt, exact request, permission or confirmation changes (DR-02, DR-03; P06, P09,
P12; SC06, SC08).

UX-049, observed on `76160a22`: on the covered lease after a typed rent override,
Guided exposed two visible Pricing basis fieldsets with the same owner and agreement
choices and repeated the departure explanation. A staff member could enter two
different scopes for the same assignment. The existing chooser in the pricing panel
stays mounted with its own unsubmitted entry and is hidden only when its equivalent
chooser is on Now. The standing summary appears once; the old policy assignment,
panel, authority and Full/Focus chooser stay available. Read-only assurance now
falsifies duplicate visible choosers or current exact recoveries without relaxing
its existing checks (DR-02, DR-03; P06, P09, P11, P12; SC03, SC06, SC08).

UX-050, observed in the Admin part of `76160a22`: the reusable pricing policy's
blank name, date and purpose were unmarked and made a POST with schema diagnostics.
The original portfolio default Save also compared two initially empty values.
Mark the existing required policy fields, keep a blank increase blank, check the
existing schema before sending, name and focus the first correction, and retain
the entry. A portfolio default awaits a current successful read for its entered
ID; stale reads cannot enable Save for a different ID. The same server validation,
role, command identity, version and saved rule remain (P02, P05, P07, P12, P14;
SC04, SC05, SC09).

UX-051, observed on `76160a22` after exact owner approval: Offer the tenant showed
the prepared terms and a missing renewal information form link. The enabled
Review and send gave no new focus, dialog, request or next action. Use the existing
tenant Marked values resolver the owner route already uses. It links to the actual
shared form setting for Admin, with the existing role and verified-value checks.
The specific missing value still holds the send; ordinary hand records and other
work remain available (P02, P09, P12, P13, P14; SC03, SC04, SC05, SC09, SC10).

UX-052, observed in both housing placements on `76160a22`: the same focused
Retry survived the confirmed save, but the resulting layout change moved it
below the visible window. Its desktop bounds moved from y710–750 to y855–895
in 800 px, and its phone bounds moved from y810–850 to y955–995 in 844 px.
Keep the focused shared autosave retry visible after the state and layout update.
When staff already moved to another control, leave their focus and viewport
alone. Preserve the same saved acknowledgment and normal next Tab (P05, P14;
SC04, SC07, SC09).

UX-053, observed on `76160a22`: when the Approver chose Set up your signature,
the same Guided Now card showed two rendered Sender name entries. The compact
form named the empty name, while its duplicate under the Owner approval section
made the active form ambiguous. Show one setup form while it is open, with a
visible required marker and focus on the first refused field. The longer
managed editor, optional fields and retained signature action stay mounted and
available in Full view or when the compact form is closed (DR-02, P02, P06,
P09, P12, P14; SC05, SC06, SC09).

UX-054, observed on `76160a22`: the coherent completion advanced the derived
stage after staff recorded a returned form, signatures and follow-ups. A
selected earlier step stayed on Now, with no Next step line and a primary for
the earlier work. A visit that selected or arrived on the current step now
follows the projection. When staff deliberately inspect another step, one
authoritative Next step stays visible and Show current step returns to it.
All old controls and intentional out-of-order work stay available
(DR-05, P01, P02, P04, P09, P13, P14; SC01, SC03, SC08, SC09, SC10).

UX-055, observed on `76160a22`: after an accepted authored revision and later
change to its facts, two Return to the standard wording controls appeared on
the same Guided card. When its compact preview supplies the stale-wording
notice and action, present them once and keep the original Full controls.
Undo appears once when the compact preview supplies it. The user's authored
text and prior revision stay exact (DR-02, DR-03; P06, P09, P12; SC06, SC08).

UX-056, observed on `30fa69ea`: the guarded desktop and phone scans found zero main
landmarks on the desk, the table, all three lease views and the Admin pricing screen;
Help already had one. The existing content wrapper now supplies one main landmark
on the scoped staff surfaces, including the adjoining Console, Communications,
Connections and live review routes. This lets assistive navigation enter the main
work directly. It adds no visible content and changes no handler. The read-only
Guided landmark check and independent oracle require it (P10, P14; SC08, SC09).

UX-057, observed on `30013219`: from the prepared owner message, Tab and Enter opened the
exact review and moved focus inside at 1280 by 800 light and 390 by 844 dark. Escape closed
the dialog in both, but focus never returned to Review and send. Preparing the exact
review can disable its button before the dialog takes focus. The Now action now supplies
the original button synchronously, just as Schedule and Gmail already do. Cancel and
Escape return to that button when it remains available. The exact review and confirmation
are unchanged (P12, P13, P14; SC09, SC10).

Preserved by decision: exact review/confirmation, the required Gmail banner, stale authored wording,
who-approved validation, role/Space and Action Registry checks, blank unsettled legal fields,
assistance-animal holds, existing controls/views/filters/collections/old links, historical failed
evidence, and the complete unit/backend/E2E and release assurance bounds. These support the owner's
goals while retaining their original authority and meaning.

## Backend ownership and state changes

| Changed experience                  | Route and handler owner                                                                                                                                       | Domain and store owner                                                                                                                                                                                                                       | Provider seam and actual mutation                                                                                                                                                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Guided labels, path and reload      | `app/lease-renewal/live/desk/lease/[leaseId]/page.tsx` renders RenewalWorkspace; RenewalGuidedView and RenewalFocusViewContext own local presentation         | Existing renewal stage/path/preparation projection remains authoritative; sessionStorage holds only bounded same-path reload continuity                                                                                                      | No new provider action; view, focus and scroll are local. Secondary statuses remain in Focus/Full.                                                                                                                                                                 |
| Program feedback                    | `/api/lease-renewal/working-record`, existing working-record save                                                                                             | RenewalHousingAssistance uses RenewalWorkingRecord; the same per-lease, cycle/revisioned field persists only a complete Yes/program                                                                                                          | App-owned save only; no source inference from voucher text, provider write or automatic comparison.                                                                                                                                                                |
| Assistant targets                   | `/api/assistant/query`, interpretation and lease-renewal assistant-source                                                                                     | Existing coherent display-source read and target projection; interpretation maps batch vocabulary to next-month semantics                                                                                                                    | Existing RentVine read seam, replaced by the guarded synthetic transport here. One bounded fresh generation is awaited; failed evidence stays unavailable. No target data invented or saved.                                                                       |
| Draft currency and waiting          | `/api/lease-renewal/message-preparation`, `/api/lease-renewal/renewal-notice-draft`; MessagePreparationEditor                                                 | Saved message revision and existing immutable created-draft attempt evidence; message-revision compares content without the exact review prefix                                                                                              | Existing one-attempt Gmail draft claim/receipt/readback unchanged. Only confirmed created refreshes local page evidence. Here the loopback stand-in accepts it.                                                                                                    |
| Owner reply on Now                  | Existing `/api/gmail-hub/sequences/thread`, communication sequence service `.thread()`                                                                        | listLeaseOwnerReplies supplies exact linked thread/message IDs from existing inbound evidence; client selects only that message                                                                                                              | Existing read capability, actor/Space, linked sequence/thread and sender-mailbox gates remain. Plain body is read into client memory and never added to workspace/approval evidence. Approval uses the original party/channel/time action and server revalidation. |
| Authored-wording recovery           | Existing message-preparation save and delivery/composition routes                                                                                             | Editor owns one saved override, its base hash and local Undo value. PreparedMessageSlot exposes the same state and actions                                                                                                                   | Explicit return clears only that saved override; Undo restores the previous wording. All transports read the one displayed message and retain exact review hashes.                                                                                                 |
| Animal task wording                 | Workspace manual-activity label and renewal-readiness projection                                                                                              | Existing pet activity ID, stored history and readiness predicates stay identical                                                                                                                                                             | No policy, registration input, animal charge default, provider effect or saved-record migration.                                                                                                                                                                   |
| Default-page assurance              | Read-only production-canary landmarks and production-reconciliation export                                                                                    | New independent rendered-stage oracle imports no app stage/path projection; complete table source reconciliation remains intact                                                                                                              | One visible stage and Next step plus stage/path/Now identity agreement are required. No bound is loosened and no production assurance is executed in this audit.                                                                                                   |
| Recipient and template fixes        | MessagePreparationEditor reads `/api/lease-renewal/message-preparation`; kickoff projection names canonical recipient/publication targets                     | Existing recipient resolution, supplied publication and source destination read own the unavailable facts; the focus helper opens their existing details                                                                                     | Focus and an already-read source handoff only. No guessed URL, provider fix, save or success is created.                                                                                                                                                           |
| Shared collection required fields   | SharedLeaseCollections validates before the existing `/api/lease-renewal/collections` review handler                                                          | Existing collection review and explicit-member/period basis store remain authoritative; entered client state survives validation                                                                                                             | No request while required input is blank. Valid input retains the ordinary review and confirmed app-owned save.                                                                                                                                                    |
| Standing rule adoption and recovery | RenewalRecommendation and MessagePreparationEditor use the ordinary working-record and message-preparation routes; Admin uses existing pricing-policy handler | StandingAgreementInputSchema owns validation; RenewalPricingPolicyStore owns versioned agreements/policies and verified portfolio; currentRenewalMessage reads actual adopted rule stamps                                                    | Only existing app-owned saves. Earlier-rule description does not grant current owner coverage; a typed rent wins. Exact provider confirmations and all permission gates stay unchanged.                                                                            |
| Confirmed financial preparation     | RenewalWorkingRecordProvider and existing `/api/lease-renewal/working-record`; MessagePreparationEditor then reads `/api/lease-renewal/message-preparation`   | Existing versioned working-record store owns durable values, actors and operation IDs. The provider holds only each field's local text/generation and pending save; the message record and communication sequence keep their existing owners | Normal app saves and confirmed reads precede review or preview. Failure focuses the actual field and starts no older transport. Copy remains local and explicit exact confirmation remains mandatory.                                                              |
| Linked composer recovery            | `/api/gmail-hub/composition` GET uses `prepareWorkflowComposition`; `/api/gmail-hub/sequences` saves only a current draft                                     | The mounted composer shares an in-flight read for its exact entry and actor; the existing sequence service and versioned Firestore store own the app draft                                                                                   | No composition retry has send or schedule authority. Previewed recipient and message evidence still goes through the existing actor, reviewed hash and one-attempt gates.                                                                                          |
| Previous Help pictures              | `proxy.ts` responds only after the existing request policies; its picture helper matches known historical names and versions                                  | The Help manifest owns existing names; `public/help/V2.1` owns the synthetic picture bytes                                                                                                                                                   | A temporary same-origin GET/HEAD redirect to a static asset, with no effect or credential change.                                                                                                                                                                  |

## Specification and label maintenance

- S246 R10 clarifies the supported working-batch wording, current coherent-read requirement,
  and exact actor-scoped resolution of a person-supplied numeric lease reference.
- S247 R9 records full retained text and precedence for new user input; secondary statuses remain
  available in Focus/Full under the original single-stage Guided requirement. R4 and R10 record
  action-before-context order and full-label wrapping within the unchanged screen budgets.
- S248 R4 describes reading the existing exact linked reply with explicit read states, without
  persisting its body or inferring approval.
- S249 R7 describes the existing S161 authored-wording preservation and in-place resolver; R9
  describes the banner-only comparison normalization, post-created evidence refresh and exact
  attempt recovery on Now, with the existing Full view recovery retained.
  R2 now names the Central comparison timestamp; R5 records recommendation state/retry and
  saved-source basis, and R7 records confirmed-figure preparation and the exact-copy limitation.
- S155 R5/R9 and S247 R9 record same-field entry acknowledgment, retained shared-view drafts,
  revision-ordered complete choices and independent Copy. They preserve every existing
  validation, per-field independence, actor, idempotency and exact-effect requirement.
- S250 R5 specifies the covered-owner continuation and retained optional message tools.
  R1 records schema-consistent plain validation; R7 records preserved proposal provenance and
  deliberate rebuild across working rent and the prepared message.
- S251 R2 records required-program feedback and failed-save recovery in both existing placements;
  R4 records the applicable-path continuation and its assisted program-contact label.
- S253 R6 records Animal follow-up and Animal charges and agreement, their former names and
  preserved records/predicates. Its client-answer, fee, originals/maps and legal holds are unchanged.
- S254 R4 records the explicit audit hold and L33 UNVERIFIED boundary. No L01 to L71 text,
  acceptance condition, budget, preservation set or safety bound was weakened.
- S201 R1 makes its existing required collection name and period visible, with specific missing
  input feedback, retaining both collection modes, selected members, review and confirmation.
- README, facts, status, plan and loop state now reflect the already merged build and current
  PR-only review instead of saying implementation has not begun. The nine source/status lines
  preserve authoring READY separately from implementation and owner release authority.
- Help V2.1 records the changed names/states in place, control-map additions and recorded old
  animal-task name. Historical V2.0 evidence stays dated history. Current pictures must be
  recaptured from the synthetic final source before delivery. S252 R6 now explicitly preserves
  prior picture URLs through same-origin compatibility redirects.

## Decisions made without asking

- Preserve all six prior commits and integrate the remaining generated-ID change with the
  stronger complete-text/newer-input tests. This carries forward the unfinished build and keeps
  the original lane available for provenance.
- Put covered continuation, reply reading, authored-wording resolution and uncertain-draft
  recovery in the existing Now structure. Each addresses an observed next-action gap and uses
  its current backend authority. All Full/Focus controls remain.
- Use the existing AutosaveStatus for housing save recovery, rather than a second save workflow.
  Keep its original field permission, complete-value validation and retry identity.
- Keep the full housing program labels and all header utilities. Move supporting duplicate
  context after the Now action and use tighter Guided spacing and wrapping phone-header rows;
  the measured failure supports this layout change without a label change or a weaker bound.
- Correct the Help fixture's missing canonical status fields, rather than hiding the app's
  truthful missing-evidence warnings. Ordinary-flow pictures should carry the complete synthetic
  facts they claim to illustrate.
- Use one stable workspace container for the selected step's Now card. Moving the existing
  rendered controls between different React parents would risk remounting unsaved fields;
  transparent Full/Focus wrappers keep their exact control instances.
- Reserve assistant ownership for explicit ownership words. Show me describes an action on the
  visible batch and supplies no assignment evidence.
- Validate required Admin and collection inputs with the existing Field pattern and domain
  bounds before dispatch. Keep the actual server validation and confirmations authoritative.
- Retain actual agreement/policy stamps for proposal adoption and read older recorded versions
  to explain a kept rent. Give generic historical records their saved source label, with no
  invented standing agreement or retroactive coverage.
- Keep financial draft text in the existing lease-scoped working provider, rather than adding a
  store or a Save action. Only a confirmed response acknowledges its own entry. Wait on the
  message's own figures and reuse the normal preparation read before review; the observed stale
  review and lost newer typing justify this shared correction. Copy retains its existing promise
  to match the displayed bytes and makes unconfirmed working figures visible.
- Format comparison observations with the existing Central timestamp formatter. A UTC date
  slice contradicted the visible business day and the saved observation's local time.
- Treat a supplied numeric lease reference as an exact lookup in the current actor's read, with
  the same filter in its table link. Keep ordinary address and free-text matching.
- Preserve source-evidence re-review even when the visible draft wording is unchanged. The
  snapshot shows an advanced safety version; accepting the older preview would cross the
  guardrail boundary. Improve its error wording and retain the separate new review.
- Keep reply retry focused using the same ready-heading convention as the composer, and leave
  a newer decision focus alone. The real keyboard failure was visible before the reply loaded.
- Show one exact current draft recovery and one Pricing basis on Now. Retain the original
  controls, earlier attempts and hidden Full choice state so view switching preserves capability.
- Keep legacy Help images under the request proxy's exact known-name rule. The global Next
  configuration and its sign-in relay restriction stay unchanged.
- Use manual synthetic preparation and the explicit automatic hold for this audit. Automatic
  start remains UNVERIFIED and its requirement stays intact.
- Measure the historical baseline only as far as its own Demo gate permits. The nine-action,
  three-tab lower bound supports a narrower comparison; it establishes no completed baseline
  send or exact confirmation.
- Version current Help as V2.1 and recapture synthetic scenes. Historical V2.0 records retain
  their original scope; client answers, legal approvals and staff verdicts remain separate.

## Coverage limits and left undone

- Real sends, Gmail drafts, scheduling, provider writes, customer records, paid comparisons and
  production contact, including opening the production Renewals desk: left undone by hard limit.
  Synthetic stand-in outcomes do not prove a real provider, mailbox or customer result.
- Automatic comparison from an automated browser or verification session: left undone by hard
  limit. The one-path rehearsal's audit setting stays off; L33 is UNVERIFIED. Help and the existing
  journey retain the webdriver/non-rehearsal fence. No test claims the forbidden action ran.
- Identity, roles, security settings, Action Registry keys, budgets, permanent action/cost
  guardrails and protected paths: unchanged. The local rehearsal's refusal boundary was
  strengthened. auth:ensure was omitted because this task forbids its real-provider probes.
- Removing a control, section, view, filter, saved view, collection, old link, review or
  confirmation: left undone by hard limit. Focus/Full and their exact review gates are preserved.
- Production release assurance: read-only code only, with its landmarks and independent oracle
  updated together. No live assurance run, mutation or bound relaxation was performed.
- Customer values and raw audit screenshots in Git, protected-path pushes, broad staging,
  force pushes, rewritten history, tags and branch deletion: left undone by hard limit.
  The only committed pictures are curated synthetic product Help assets. Staging names files
  explicitly on the branch cut from fetched current main.
- Real originals, legal/map approval, unsettled client answers, signing and human judgment: no
  verdict invented. They retain their exact independent holds. Staff walkthrough remains NOT RUN.
- Physical phone and assistive-technology use by a person: UNVERIFIED. Chromium emulation,
  keyboard/accessible-name/contrast evidence establish only their named machine scope.
- Merge, release and deployment: left to the owner. The recorded production commit was not
  refreshed through a production read during this task.
- Historical handoff claim: PROGRESS reports four November 5 rehearsal due-message children
  without the network preload, then its fix in merged #187. Synthetic credentials do not prove
  absence of historical outbound attempts/effects. This audit neither contacts production to
  investigate that claim nor relabels those old runs as guarded. Initial runs also had the outer-wrapper and normalized-socket limitations described above, so their logs alone establish no complete outbound-isolation claim. Final runs require the strengthened guard
  in the entry point, server and child processes.

## Verification record

- The retained-typing, rehearsal-safety, batch-view and working-batch focused run passed 70 tests
  across four files on `9fdf624c`. This establishes their test scope, not a complete user walk.
- The new exact-name Full-view presentation fixture was captured through its mounted test; the
  prior S181/S244 fixtures remain byte-preserved. The explicit animal-task name migration keeps
  every previous control/heading in the preservation comparison.
- The first repair-focused run had 81 passes and two new test-assertion failures: an outdated
  control-map count and a locator for a region the tenant editor does not name. Both assertions
  were corrected to the actual contract. The later 14-file repair run passed all 135 tests.
- Initial standalone typecheck exhausted Node's default 2 GB heap. A 4 GB run then identified an
  invalid test-only Testing Library `exact` option; it was removed. The subsequent 4 GB
  typecheck exited zero. No application or assurance time/memory bound was raised.
- The later inherited applicable-path action exposed a TypeScript union integration error. It
  now reads the typed step action directly. The eight-file focused rerun passed 268 tests and
  typecheck passed. Integrating the uncommitted generated-ID lookup then passed all 38 tests
  across recovery, Guided view and housing assistance, followed by another zero-error typecheck.
- Static help control names (830), help content (3,143 strings), copy voice, active-document
  paths (273) and context freshness passed on the repaired source at that point. Existing past
  fact review dates remained warnings; they were not refreshed through forbidden production
  probes. These checks will run again on the final tree.
- The offline guard proof against the original source failed two checks (30 passed): normalized
  socket calls reached an offline sentinel and per-process readiness was absent. The repaired
  guard passed all 32 checks. No live socket or provider was used in that proof. Two earlier WSL
  launch attempts timed out before the proof started; the later completed runs supply its result.
- Initial independent rehearsal `20261106T180800Z-9fdf624c` had an inner exit zero and an outer
  exit one on shared-cache mutation. Its initial report has 41 Yes, six No and 24 UNVERIFIED;
  it is unaccepted. Isolation limitations and that failed qualification are retained.
- The fresh historical baseline directly observed 37 default table rows, including ten Closed,
  against nine candidate default rows (four carried, five working-month). Both loaded all 38
  source leases. The baseline reached nine required actions plus one optional action across three tabs before its Demo provider gate refused Send. Its exact review/confirmation and completed kickoff are UNVERIFIED; the protected gate was preserved. The strengthened baseline wrapper exited zero with 21 guarded Node PIDs and two refused registry lookups.
- The `30a3e46c` repaired-surface rehearsal qualified cleanly: wrapper/controller exit zero,
  42 distinct guarded Node PIDs, two refused public registry fetches, zero shared dependency
  changes, and its browser/helper/emulators and temporary worktree stopped/removed. Its loaded
  covered continuation, reply body, group partition and per-address assistant parity are direct
  observations. New retry/reference/recovery findings above require the next-source recheck.
- The additional eight-file focused run first passed 153/155; its two new housing assertions
  assumed a single blur save while keyboard navigation also autosaved complete fields. The
  fixture now keeps failing until the explicit retry, then checks one additional same-value save.
  The rerun passed all 155 tests, including exact numeric references, address collisions,
  same-attempt recovery and unknown reconciliation. Standalone typecheck passed at 3 GB.
  Help controls passed 832 names, Help content passed 3,147 strings, copy voice passed with zero
  violations, and active document paths passed all 273 present-context files.
- Fail-first housing proof on the original `3996c380` component failed all six newer-typing
  cases (four unrelated cases were unselected by the explicit test filter). The repaired run
  passed all 190 tests across 13 files, including Full/Focus preservation, retained typing,
  modal focus fallbacks, original-attempt recovery and all prior V2.0 scene URL matchers.
  Typecheck at 3 GB, 832 Help labels, 3,147 Help strings, copy voice and all 273 active document
  paths passed. The tested native files matched the Windows source hashes for all 16 changed
  paths before this evidence-only update.
- No final gate pass or acceptance is implied by the focused results above. Subsequent
  committed-source checkpoints and their remaining qualification follow.
- The later layout-focused run passed 62 tests across six files, including Full/Focus
  preservation and stricter canary/oracle failure cases. Typecheck at 3 GB, 832 Help controls,
  3,147 Help strings, copy voice and 273 active document paths passed.
- Committed-source checkpoint `351ace2c` passed 16 assisted and 16 standard step/width/theme
  measurements. Full long-program primary bounds were 775/777 px on desktop and 1,579.3/1,586.3
  px on phone for Numbers/program contact, in both themes. All five fresh default entries passed
  the local canary and independent actual-DOM oracle with zero mismatches. Phone menus stayed
  within the viewport; Escape returned to their triggers and Tab reached the retained utilities.
  Controller/wrapper exited zero, 18 guarded Node PIDs were recorded, only two public npm
  requests were refused, and the browser/helper/emulators and temporary worktree were removed.
- The first all-scene Help capture on `351ace2c` captured 27/27 and exited zero. Visual review
  found UX-025's incomplete ordinary-flow fixture, so those pixels are superseded. Its fixture
  correction passed all 32 existing rehearsal-safety checks plus copy voice and document paths.
- Fresh Help capture `20261106T221921Z-fdaf9614` captured all 27 scenes with zero uncaptured,
  source and served SHA `fdaf9614cfcaf4913271b684791486f3051db28d`, and no overlay. All 27
  PNG hashes matched the run record; 17 files changed and ten were byte-identical. The corrected
  prepared Guided image has no missing-status/move-out warning. Root inspected all 27 in contact
  sheets and the key changed screens at full size. Wrapper exited zero and emulators stopped;
  22 guarded Node PIDs and only two refused public npm requests were recorded. Final guide walk,
  Help control browser check, existing journey, canonical verify and exact-head CI remain pending.
- The broader Help control rehearsal on `67408d3f` found 627 visible controls and 205 conditional
  unavailable controls out of 832, with zero missing. It exited zero and stopped its emulators;
  all 36 Node PIDs had the guard. Its 12 locally refused requests were two public npm requests
  and ten identitytoolkit.googleapis.com socket attempts. Those refused Admin read attempts
  supply no real identity-provider evidence. No automatic comparison ran.
- Fresh complete finding run `67408d3f` covers all 71 checks: 58 Yes, six No and seven
  UNVERIFIED, so acceptance is No. Its six failed checks are L10, L14, L17, L30, L53 and L60.
  Qualified controller and outer wrapper exited zero, 138 distinct Node PIDs reported guard
  readiness, and exactly two public npm requests were refused. Browser, helper, server, emulators
  and disposable worktree were removed, with the shared lane clean and locks free. The helper's
  SIGTERM/PTY exit one is retained separately; no completed-driver verdict is inferred.
- The next repair-focused run first passed 201 tests and failed seven assertions. Four assumed
  the Now card contained only one level-two heading; the card now correctly contains its
  existing work sections. They locate the named step heading, and browser drivers use that
  heading's existing stable ID. One synthetic pricing fixture omitted its working revision.
  Correcting the old refresh map name exposed a duplicate Help entry for the same actual button;
  those descriptions were merged while all 70 map rows and the real button remain. The failed
  rebuild exposed duplicated notice rendering, now shown once on Now or in the Full editor.
  The subsequent 19-file focused run passed all 208 tests.
- Standalone typecheck then rejected test-only Testing Library `exact` options and an untyped
  DOM query. Removing the unsupported option and typing the actual HTML controls preserved
  their runtime expectations. The two-file rerun passed all 22 Guided/ledger checks, the three
  browser drivers passed syntax checks, and typecheck passed at 3 GB. Help control names passed
  831, Help content passed 3,145 strings, copy voice had zero violations and all 273 active
  document paths passed. The one-entry count reduction merges the duplicate refresh reference;
  it removes no interface control. Same-source browser checks and the new backend regression
  remain pending before the canonical gate and exact-head CI.
- The financial-repair focused run initially passed 65 and failed seven new fixture assertions:
  its owner comparison omitted comparable evidence, its clipboard double omitted formatted
  copying, and a modal repeated the same error in its own status. These fixture gaps were
  corrected without weakening the real readiness or copy contracts. The next five-file run
  passed all 72 tests, followed by zero-error TypeScript at 3 GB. Expanded 5xx recovery,
  preservation and static checks follow before committing and the actual browser replay.
- The expanded run passed 285 and failed two checks: Full view retained three empty hidden
  presentation outlets, and the two conditional Try again references shared an overly broad
  Help scope. Empty outlets now disappear through their empty-state CSS without hidden Full
  content; the rent retry names its actual Owner message region. The repeated 21-file run
  passed all 287 tests, TypeScript passed at 3 GB, Help names passed 834, Help content passed
  3,151 strings, copy voice passed with zero violations and all 273 active document paths passed.
  The Help digest at that checkpoint was `c68a7e6b213dab958b3eb5b751cf03e7cdcef1cac645af58b903422807e0e554`.
- Committed checkpoint `269b4f16` passed all 96 maximum/normal-name geometry cases and the
  standard 16 step/theme/width cases. The five-tenant maximum ended at 797 px desktop and
  1,558.25 px phone, with full labels and zero horizontal overflow. Its five pristine default
  entries passed the local canary and independent actual-DOM oracle with zero mismatches.
  All 17 selected standard/assisted steps kept their visible work inside Now. Four actual
  money/date newer-input races saved and reloaded the latest entry; the same connected control
  retained its typing through all three views. Both recipient/template handoffs and both
  standing-rule adoption/rebuild paths passed. UX-036 and UX-037 remained failures on that
  source and were never counted as passes. The qualified controller/wrapper exited zero,
  all 56 Node PIDs had the guard, three npm and one Firebase CLI metadata requests were refused,
  and its browser/helper/server/emulators and disposable worktree were removed. The helper's
  intentional SIGTERM/PTY one remains separate from the completed controller outcome.
- The next 21-file focused run passed 288 and failed two assertions: one checked refusal
  clearance before its state effect, and the other exposed unnecessarily duplicated generic
  review feedback. The clearance check now awaits the actual state transition; only the
  changed-figure recovery supplies the new action-adjacent hint. The repeated run passed all
  290 tests, targeted lint and TypeScript, then 834 Help names, 3,151 Help strings, copy voice
  with zero violations and all 273 active document paths. New delayed composition and app-draft
  tests assert no old dialog and reuse the same application draft for the fresh review.
  The subsequent assurance update also requires the recommendation's visible required label
  and live save status from actual DOM; its focused check follows before this source commits.

- `4d3359d7` selected S252 run `20261107T034423Z-4d3359d7`: all five permitted
  phases, 79 checks, zero failures, and all five action budgets passed. The default
  automatic-start phase was intentionally excluded. The 105 guarded Node PIDs recorded
  only two refused public npm requests. Four kickoff POSTs were the explicit staff seed
  and phase-reset preparations. The off setting held at startup, after resets and at exit.
- `2ef9a967` separate degraded-mode core: 46 passed and 23 existing no-emulator skips,
  14 files. The earlier November/December gate was 35 PASS, 1 FAIL because the added
  status-outage probe used a closed test page; the retained negative and positive assertions
  now use a new page in the active fenced Editor session.
- First full gate, `qualification-verify-20261107T043440Z-2ef9a967`: real Linux dependency
  installation, production dependency audit, policy, format, lint and type checks passed.
  Unit ended with 11,498 passed, 25 failed, and four existing skips. The gate stopped before
  Firestore, build and full served E2E. UX-044/046 record the correction and focused rerun.
- The older November/December journey on `76160a22` finished 36 PASS, zero FAIL
  (`qualification-journey-20261107T044951Z-76160a22`), with all 17 kernel controls
  passing and zero owned processes left. One cold composition GET answered 200 before
  saving a draft; the reopened draft read independently. The synthetic status outage
  kept the December target visible and counted at three through two failed status reads;
  one fresh read cleared the unavailable wording. The log shows 281 synthetic RentVine
  reads and the only refused destination was public npm tooling.
