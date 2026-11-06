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
  updates `d76dc72e`, included as `9102ed63`. Final help capture is pending.
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
is diagnostic evidence only.

Preserved by decision: exact review/confirmation, the required Gmail banner, stale authored wording,
who-approved validation, role/Space and Action Registry checks, blank unsettled legal fields,
assistance-animal holds, existing controls/views/filters/collections/old links, historical failed
evidence, and the complete unit/backend/E2E and release assurance bounds. These support the owner's
goals while retaining their original authority and meaning.

## Backend ownership and state changes

| Changed experience             | Route and handler owner                                                                                                                               | Domain and store owner                                                                                                                          | Provider seam and actual mutation                                                                                                                                                                                                                                  |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Guided labels, path and reload | `app/lease-renewal/live/desk/lease/[leaseId]/page.tsx` renders RenewalWorkspace; RenewalGuidedView and RenewalFocusViewContext own local presentation | Existing renewal stage/path/preparation projection remains authoritative; sessionStorage holds only bounded same-path reload continuity         | No new provider action; view, focus and scroll are local. Secondary statuses remain in Focus/Full.                                                                                                                                                                 |
| Program feedback               | `/api/lease-renewal/working-record`, existing working-record save                                                                                     | RenewalHousingAssistance uses RenewalWorkingRecord; the same per-lease, cycle/revisioned field persists only a complete Yes/program             | App-owned save only; no source inference from voucher text, provider write or automatic comparison.                                                                                                                                                                |
| Assistant targets              | `/api/assistant/query`, interpretation and lease-renewal assistant-source                                                                             | Existing coherent display-source read and target projection; interpretation maps batch vocabulary to next-month semantics                       | Existing RentVine read seam, replaced by the guarded synthetic transport here. One bounded fresh generation is awaited; failed evidence stays unavailable. No target data invented or saved.                                                                       |
| Draft currency and waiting     | `/api/lease-renewal/message-preparation`, `/api/lease-renewal/renewal-notice-draft`; MessagePreparationEditor                                         | Saved message revision and existing immutable created-draft attempt evidence; message-revision compares content without the exact review prefix | Existing one-attempt Gmail draft claim/receipt/readback unchanged. Only confirmed created refreshes local page evidence. Here the loopback stand-in accepts it.                                                                                                    |
| Owner reply on Now             | Existing `/api/gmail-hub/sequences/thread`, communication sequence service `.thread()`                                                                | listLeaseOwnerReplies supplies exact linked thread/message IDs from existing inbound evidence; client selects only that message                 | Existing read capability, actor/Space, linked sequence/thread and sender-mailbox gates remain. Plain body is read into client memory and never added to workspace/approval evidence. Approval uses the original party/channel/time action and server revalidation. |
| Authored-wording recovery      | Existing message-preparation save and delivery/composition routes                                                                                     | Editor owns one saved override, its base hash and local Undo value. PreparedMessageSlot exposes the same state and actions                      | Explicit return clears only that saved override; Undo restores the previous wording. All transports read the one displayed message and retain exact review hashes.                                                                                                 |
| Animal task wording            | Workspace manual-activity label and renewal-readiness projection                                                                                      | Existing pet activity ID, stored history and readiness predicates stay identical                                                                | No policy, registration input, animal charge default, provider effect or saved-record migration.                                                                                                                                                                   |
| Default-page assurance         | Read-only production-canary landmarks and production-reconciliation export                                                                            | New independent rendered-stage oracle imports no app stage/path projection; complete table source reconciliation remains intact                 | One visible stage and Next step plus stage/path/Now identity agreement are required. No bound is loosened and no production assurance is executed in this audit.                                                                                                   |

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
- S250 R5 specifies the covered-owner continuation and retained optional message tools.
- S251 R2 records required-program feedback and failed-save recovery in both existing placements;
  R4 records the applicable-path continuation and its assisted program-contact label.
- S253 R6 records Animal follow-up and Animal charges and agreement, their former names and
  preserved records/predicates. Its client-answer, fee, originals/maps and legal holds are unchanged.
- S254 R4 records the explicit audit hold and L33 UNVERIFIED boundary. No L01 to L71 text,
  acceptance condition, budget, preservation set or safety bound was weakened.
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
- Treat a supplied numeric lease reference as an exact lookup in the current actor's read, with
  the same filter in its table link. Keep ordinary address and free-text matching.
- Preserve source-evidence re-review even when the visible draft wording is unchanged. The
  snapshot shows an advanced safety version; accepting the older preview would cross the
  guardrail boundary. Improve its error wording and retain the separate new review.
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
  limit. The reviewed setting stays off; L33 is UNVERIFIED. No test claims the forbidden action ran.
- Identity, roles, security settings, Action Registry keys, budgets, guardrails and protected paths:
  unchanged. auth:ensure was omitted because this task expressly forbids its real-provider probes.
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
- Final-source browser rewalk, help capture/control checks, the existing isolated journey,
  `bash scripts/verify.sh`, report validation, exact-head CI and final cleanup are pending.
  No final gate pass or acceptance is implied by the focused results above.
