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

Read-only Cloud Run metadata at 14:15 UTC confirmed 100% canonical traffic on
`pmi-kc-app-rmw65wgt2-8c8249a0547c` and its ready revision's source
`ef81b8917209f4eec3f22097142b559f3cce875b`. The required Communications canary would read the
managed Gmail profile through `/api/gmail-hub/connection`. The November 7 instruction excludes
live mailbox access as verification, so release admission and assurance remain held.

Raw logs, receipts, screenshots and fixture data remain in private rehearsal state. The run
identifiers identify the exact source and never stand in for a later candidate pass.

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
