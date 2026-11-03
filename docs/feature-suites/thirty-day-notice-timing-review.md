<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-meeting-readiness-2026-09 -->

# S125 — Thirty-day notice timing review with an explicit date basis

> **Approval reference:** F04 (original feature #4).
> **Delivered baseline:** the original evaluator/display was implemented and deployed at `c541db723d3622234956a16e95765867733427cf` / `pmi-kc-app-rmundpf2v-249c945f2220`; [the shared audit](../evidence/batch-litmus-audit-2026-09-28.md) and [adversarial review](../evidence/adversary-review-2026-09-29.md) retain their dated scopes.
> **November 3 amendment:** Source and local gate QUALIFIED; application delivery PENDING. Staff selection/persistence and same-page recovery passed full06 and the final v8 fixture journey within the scopes in [implementation evidence](../evidence/application-gap-implementation-2026-11-03.md). No live basis selection or human acceptance is claimed.
> **Registration:** existing S125 / F04 owner in `docs/feature-suites/README.md`. Classification remains an operational timing indicator, not law, fees or legal compliance.

**Goal.**

Authorized renewal staff select the documented notice-comparison basis once and see that selection
saved and used by the desk/workspace, without an Admin handoff or another confirmation. Results
still name their actual dates, provenance, freshness and basis version.

**Current state / intended end state.**

Reviewed source is main `39435919`; the runtime baseline is `bc975353`, documented in the
[November 3 assessment](../evidence/current-application-gap-analysis-2026-11-03.md). The basis is
currently absent. Its evaluator honestly returns Cannot determine, separately from notice evidence.
The October 2 Q2 decision already chose **contractual lease end; calendar days, target minus notice;
threshold 30; exactly 30 meets**. No decision on that tuple remains to be collected.

At the assessment baseline, `components/admin/MoveOutTimingBasisAdminPanel.tsx` was mounted only in Admin. With no record
it defaults the target to `expected_move_out`; changing a select edits local state, and a required
Who confirmed this basis, and where field plus Record reviewed basis submits the whole tuple.
`app/api/admin/move-out-timing-basis/route.ts` requires `manageAdmin` on both GET and PATCH;
`lib/firestore/lease-renewal-move-out-timing-basis.ts` repeats the Admin check. The store already
uses an expected-version transaction and append-only activity. Current route/config tests explicitly
expect Editor rejection. No extra modal exists today: the redundant step is the Admin/re-attestation
handoff imposed on selecting an already documented business decision.

The owner's November 3 clarification supersedes that assignment for this narrow operation:
**an Admin is not needed for confirmation; making the selection may write**. Intended behavior is
an ordinary authorized renewal-staff selection, server-resolved to the documented tuple and its
real provenance, with one durable intent, audit/readback and honest response-loss recovery. It
creates no general policy-editing, legal, fee, sending, role or provider authority.

**Actors and entry conditions.**

- Managed Editor, Approver or Admin with current Renewals Space access and `edit` may select the
  documented basis; the server resolves the actor, role and Space. Verification principals remain
  read-only. Unauthenticated, wrong-domain, read-only or out-of-Space callers cannot write.
- The selectable option must resolve to an actual documented business decision. The initial option
  is the settled October 2 Q2 tuple above, using a stable decision reference and non-secret source
  note. A genuinely new rule requires its actual business decision; Dan is the ask contact for only
  an unresolved question. His contact role does not create a new technical approval role.
- Missing/invalid/unreadable saved state remains explicit. Selecting an already approved option
  supplies intent to record it; opening the page or showing an unselected option does not.

**What it is / how it functions.**

- **R-F04-01 — Named dates.** Keep validated notice-given and target calendar dates, exact lease
  association, source/provenance, freshness and basis version distinct. Never substitute expected
  move-out for contractual end because a value is blank.
- **R-F04-02 — Settled counting.** Reuse the recorded Q2 decision: date-only target-minus-notice,
  threshold 30, exactly 30 meets. No time-of-day, weekend, holiday or inclusive extra-day adjustment.
  Staff select this documented rule; the team does not ask for it again or invent another rule.
- **R-F04-03 — Truthful states.** Show Meets configured 30-day timing, Below configured 30-day
  timing — staff review, Cannot determine or Not applicable, with dates/days/basis. Absence or
  withdrawal/applicability must have evidence; unreadable/invalid/conflicting dates are unknown.
- **R-F04-04 — Version binding.** Corrected dates or a genuinely reviewed new basis recompute only
  current results. Retain earlier reviewed evidence/version; do not change source dates to pass.
- **R-F04-05 — Review without sanction.** Link late/uncertain results to existing source review.
  Compute no fee, balance, deduction, collection action, legal conclusion or notice send.
- **R-F04-06 — Consistent filtering.** Desk/workspace filters consume the same projection; unknown
  is explicitly filterable, never compliant. Loading/read failures preserve earlier evidence.
- **R-F04-07 — One selection writes once.** Add the existing Notice timing area's staff-accessible
  basis selector, visible even when the indicator is Not applicable or unconfigured. Label the scope:
  the selection is the shared basis used by renewal notice comparisons, not a lease-specific legal
  rule. The initial no-record value is Choose documented basis. Selecting the documented Q2 option
  immediately submits that complete choice; no second Save, confirmation dialog, approver handoff
  or retyped approval note is required. Show Saving, Saved with version/time, conflict or uncertain
  outcome beside the control. Selecting the already-current option is a no-op. Preserve the existing
  Admin entry as a compatible view of the same state, not a required route or a second writer.
- **R-F04-08 — Scoped server admission.** The staff endpoint is
  `/api/lease-renewal/notice-timing-basis` (GET/PATCH), delegating the existing store; the legacy
  `/api/admin/move-out-timing-basis` adapter remains compatible with existing Admin clients.
  Authenticate/authorize before private decoding or writes. PATCH carries the selected decision
  reference, expected saved version and one operation UUID; the server resolves the allowed tuple
  and provenance. A forged threshold, target, actor, source attribution or unapproved decision is
  refused. No broad `manageAdmin` grant or change to other Admin policy/configuration APIs.
- **R-F04-09 — Durable intent and ambiguity.** Bind the UUID to actor, exact selected decision,
  canonical payload and expected version in the same existing store/activity transaction. A replay
  of that same intent returns its original recorded result; reuse with different content conflicts.
  Concurrent version changes refuse without overwrite. After response loss, read the current state
  and the owned intent before displaying success or retrying; Retry same selection reuses the UUID,
  never creates a fresh intent blindly. A merely matching tuple without its owned intent evidence
  cannot establish this save's causality. Preserve immutable earlier activity.
- **R-F04-10 — Real provenance without new consent.** Populate the note/reference from the actual
  settled decision, and audit the current staff recorder separately. Do not claim the recorder made
  the original business decision, performed a new legal review or received a missing human verdict.
  Legacy valid records remain readable with their original attribution; none is silently migrated
  into a new approval or overwritten when a page opens.
- **R-F04-11 — Current readback.** Independently read back the saved decision/tuple/version and
  owned intent before showing Saved; refresh the existing desk/workspace projection against that
  version. Unknown dates or stale/unavailable sources can still return Cannot determine after a
  successful selection. Saving the basis creates no schedule, provider effect or workflow progress.

**In scope / out of scope.**

In scope: this basis selection, narrow staff route/store admission, UI relocation/reuse, intent
recovery, provenance, current documentation and meaningful focused tests. Out of scope: arbitrary
rule authoring by ordinary staff, another permission system, role/claim/IAM changes, general Admin
access, changing the unrelated notice-rule cadence, legal determination, fees, source mutations,
client sends, new workers and rerunning historical proofs.

**Open questions & assumptions.**

No product or actor decision blocks this slice: the owner resolved selection authority and the
basis is settled. Actual notices/targets may remain absent or contradictory per lease. A genuinely
new business-rule request is recorded with its exact source and directed to Dan only after available
Dan/team evidence is checked. It does not block implementation of the documented choice.

**Cross-product impacts.**

Existing owners: `components/admin/MoveOutTimingBasisAdminPanel.tsx`, the Notice timing region in
`components/lease-renewal/RenewalWorkspace.tsx`, `app/admin/page.tsx`, the two named API adapters,
`lib/firestore/lease-renewal-move-out-timing-basis.ts`,
`lib/lease-renewal/role-action-governance.ts`, `lib/lease-renewal/move-out-timing.ts`,
`lib/lease-renewal/live-desk.ts` and `lib/lease-renewal/desk-model.ts`. Reuse one active record and
activity owner; no duplicate authoritative basis or direct browser Firestore access. Other
administrative policy permissions and both closed Dotloop keys are unaffected.

**Authority and evidence map.**

| Input                                                                | Classification                  | Use and limitation                                                                                                                                                   |
| -------------------------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| November 3 owner Q2 selection/write clarification                    | Current scoped authority        | Removes the Admin/second-confirmation requirement for this ordinary authorized selection; does not authorize arbitrary policy changes or execution during authoring. |
| October 2 Q2 decision, carried in the prior canonical unblock packet | Recorded business decision      | Exact contractual-end/calendar-day/30 tuple; provenance to reuse, not another client question.                                                                       |
| Current route/panel/store and S125 tests                             | Implementation evidence         | Establish existing Admin gate, default mismatch and version/audit behavior; source review is not a fresh save.                                                       |
| Current assessment and original F04 audit                            | Dated evidence                  | Absent saved basis and already-delivered evaluator; no new live selection, human acceptance or legal conclusion.                                                     |
| Dan/team correspondence and later exact decisions                    | Evidence / scoped missing input | Inspect first; Dan receives only a genuinely unresolved question. Presence of a title or correspondence is not a new runtime privilege.                              |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S125-1** — One existing evaluator and active versioned basis feed desk/workspace/filtering.
- **ARCH-S125-2** — Date/source/provenance and unchanged effect boundaries remain explicit; reads
  do not mutate a provider or manufacture notice evidence.
- **ARCH-S125-3** — Staff entry, both route adapters and store share exact managed-role/Space and
  verification-account admission. Fail-first: current Editor route/config tests reject the intended
  selected-basis save. Revoked access is rechecked server-side, never inferred from a visible select.
- **ARCH-S125-4** — One explicit selection resolves the trusted documented decision and owns one
  transactional intent/result/activity. Fail-first: the current form requires Admin/retyped note,
  has no staff entry/decision resolution and lacks same-intent replay evidence.
- **ARCH-S125-5** — Version, operation payload and independent readback determine Saved/conflict/
  uncertainty; matching state alone is not own-intent proof. Existing activity remains immutable.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S125-1** — Both actual dates and basis are named without substitution.
- **BEH-S125-2** — 29/30/31-day and leap/year/DST date-only cases obey the settled comparison.
- **BEH-S125-3** — Missing, stale, unreadable, future or contradictory notice/target facts produce
  explained uncertainty or review, not fees or a compliant result.
- **BEH-S125-4** — Current corrections recompute while historical versions remain attributable.
- **BEH-S125-5** — A late/unknown result reaches source review without an automated sanction.
- **BEH-S125-6** — Filters preserve unknown and use the same result as the workspace.
- **BEH-S125-7** — An ordinary authorized Editor chooses the documented basis on the lease screen;
  one selection writes once and shows read-back Saved without Admin, another Save or confirmation.
- **BEH-S125-8** — Opening/cancelling without selection writes nothing; changing an incomplete or
  forged choice is refused locally/server-side and preserves useful input. No silent default saves.
- **BEH-S125-9** — Response loss, concurrent edits, retry and service restart preserve one intent,
  expose the actual result and never append duplicate selection/activity or overwrite a newer basis.
- **BEH-S125-10** — The UI names the current recorder separately from the recorded decision source;
  selected basis success leaves genuinely missing notice/date evidence unknown.

**Human litmus outcome.**

### Select the documented notice basis and continue

**If this was built correctly:** A renewal staff member sees the already-decided comparison,
chooses it once, sees whether it saved and can continue. They do not find an Admin or ask Dan to
confirm the same decision again. A missing notice date still says what fact is missing.

- Model verdict: NOT RUN — staff selection/persistence source and focused unit/emulator checks are implemented; cumulative qualification, this model litmus and delivery remain pending. No live basis save is claimed.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement            | Architecture outcome     | Behavior outcome        | Human litmus                                    | Deterministic evidence / falsification                                                                           |
| ---------------------- | ------------------------ | ----------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| R-F04-01 dates         | ARCH-S125-1, ARCH-S125-2 | BEH-S125-1              | Select the documented notice basis and continue | Existing evaluator/desk fixtures distinguish lease end and move-out; missing stays unknown.                      |
| R-F04-02 counting      | ARCH-S125-1              | BEH-S125-2              | Select the documented notice basis and continue | 29/30/31, leap/year and DST date-only boundaries; no extra day.                                                  |
| R-F04-03 states        | ARCH-S125-2              | BEH-S125-3              | Select the documented notice basis and continue | Unavailable/invalid/stale/withdrawn/absent evidence fixtures; no legal/fee claim.                                |
| R-F04-04 history       | ARCH-S125-1, ARCH-S125-5 | BEH-S125-4              | Select the documented notice basis and continue | Correction updates current projection; earlier activity/version unchanged.                                       |
| R-F04-05 review        | ARCH-S125-2              | BEH-S125-5              | Select the documented notice basis and continue | Review destination and zero business-effect calls.                                                               |
| R-F04-06 filters       | ARCH-S125-1              | BEH-S125-6              | Select the documented notice basis and continue | Desk/workspace/filter parity, including unknown.                                                                 |
| R-F04-07 single choice | ARCH-S125-4              | BEH-S125-7, BEH-S125-8  | Select the documented notice basis and continue | Mounted Editor selection emits one complete intent; no modal/second-save/required approval-note; no mount write. |
| R-F04-08 scoped route  | ARCH-S125-3              | BEH-S125-7, BEH-S125-8  | Select the documented notice basis and continue | Actual route/store Editor pass and wrong-domain/role/Space/verification/forged-choice refusal.                   |
| R-F04-09 recovery      | ARCH-S125-5              | BEH-S125-9              | Select the documented notice basis and continue | Concurrent transaction, response loss/restart/replay and UUID-payload conflict; exactly one activity.            |
| R-F04-10 provenance    | ARCH-S125-4, ARCH-S125-5 | BEH-S125-10             | Select the documented notice basis and continue | Stored real decision reference and current actor separated; old records preserved.                               |
| R-F04-11 readback      | ARCH-S125-1, ARCH-S125-5 | BEH-S125-9, BEH-S125-10 | Select the documented notice basis and continue | Independent owned-intent/tuple/version readback; missing notice remains Cannot determine.                        |

**Preservation set.**

Keep `tests/unit/s125-move-out-timing.test.ts` date/evidence semantics;
`tests/unit/s125-move-out-timing-desk.test.tsx` source labels/filter parity;
`tests/unit/s125-move-out-timing-route.test.ts` authentication/body rejection;
`tests/unit/s125-move-out-timing-basis-config.test.ts` version/activity/history checks; and
`tests/unit/renewal-role-action-governance.test.ts` unrelated role/effect contracts. Update only the
old Admin-only and expected-move-out-default expectations deliberately superseded here. Add
meaningful mounted selection and real emulator transaction/replay cases under the same owners;
proposed new test paths are not claimed existing/passing. No global role, Firestore Rule, notice
cadence, claim/receipt or provider key change is part of this preservation amendment.

**Adversarial acceptance checks.**

- **AC-S125-1** — ARCH-S125-1/2, BEH-S125-1: chosen basis names its actual target; a blank target
  cannot borrow another date. The settled choice is not represented as unapproved business intent.
- **AC-S125-2** — ARCH-S125-1, BEH-S125-2: date-only 29/30/31/leap/DST boundaries pass exactly.
- **AC-S125-3** — ARCH-S125-2, BEH-S125-3: missing/unreadable/conflicting dates remain unknown;
  selection creates no notice, fee or legal claim.
- **AC-S125-4** — ARCH-S125-5, BEH-S125-4: earlier actor/source/version survives correction.
- **AC-S125-5** — ARCH-S125-2, BEH-S125-5: source review links make no write or send.
- **AC-S125-6** — ARCH-S125-1, BEH-S125-6: unknown filtering/desk/workspace result agree.
- **AC-S125-7** — ARCH-S125-3/4, BEH-S125-7/8: Editor one-selection success fails on current
  Admin-only source, then passes; no mount write, Admin ceremony or second confirmation remains.
- **AC-S125-8** — ARCH-S125-3, BEH-S125-8: denied role/Space/domain, verification principal,
  forged actor/tuple/decision and stale version cause no store activity. Other Admin APIs stay gated.
- **AC-S125-9** — ARCH-S125-5, BEH-S125-9: lost response plus same-intent retry/restart creates
  one version/activity; competing edit and altered-UUID-payload fail without overwrite.
- **AC-S125-10** — ARCH-S125-4/5, BEH-S125-10: correct decision provenance/readback is visible;
  no model approval, source date, new policy choice or human verdict is fabricated.

**Forbidden actions / hard gates.**

The owner launched this scoped app-owned selection implementation under current protected-path
and release gates; source and focused checks are complete, with cumulative qualification pending. It cannot
open provider keys, grant general Admin/policy power, invent business/legal evidence, alter notice
facts or use a production customer effect as test proof. Authentication challenges remain human;
independent implementation continues. No runtime selection or policy record is written by this spec.

**Dependencies / sequencing.**

Consume the actual October 2 decision and November 3 selection-authority amendment. Implement
staff admission and one-intent storage/UI together; then reconcile the current guide/unblock packet
through S238. Source dates remain runtime inputs, not a blocker to implementing honest missing
states. F03 supplies notice evidence, F06 date display and F07 source review; no duplicate owner.

**Standalone delivery contract.**

- **Deliverable now:** implemented staff selector, route/store authority, replay/conflict/readback
  recovery, tests and current guidance with passing focused checks; cumulative qualification and
  delivery remain pending. No new client basis decision is required.
- **Consumes, but does not assume:** current actor/Space, documented decision and source dates;
  unavailable dates remain unknown after an otherwise successful selection.
- **Externally blocked effect:** only a genuinely new business rule or human acceptance. Contact
  Dan for an actually unresolved rule after checking evidence; no Admin confirmation hold remains
  for the specified selection. A legal verdict/send/provider write is not this suite's outcome.
- **Produces for downstream suites:** selected basis/version/provenance plus independently read
  selection receipt and truthful desk/workspace classification for available facts.

**Verification and delivery contract.**

1. Freeze current source/readback and preservation evidence; materialize Editor/single-choice and
   exact-intent replay checks before implementation. Record expected failures, not fabricated reds.
2. Verify new route/store/component architecture and behavior, concurrent/emulator recovery, and the
   separate unchanged date/effect-preservation gate. Fixtures are not production/human evidence.
3. Before an authorized delivery, run `bash scripts/verify.sh` and affected browser checks, inspect
   scope/PII/permissions and use the existing exact-main/lock/candidate/receipt/observation route.
4. Report authoring, implemented engineering, deployed and operational/human results separately.
   Existing authority carries approved phases; an unavailable human verdict is NOT RUN, not an
   invented pass or a blanket blocker on independent engineering.

**Ordered prompt sequence.**

1. Reverify the source, real UI/store contracts and recorded decisions without a production save.
2. Under a later named launch, create fail-first single-choice/role/replay checks and preservation.
3. Implement the exact scoped route/store/UI behavior, refuse forged choices and reconcile ambiguity.
4. Verify/deliver through existing gates and update S238/current documents to actual evidence.

**Deletion/merge recommendation.**

Keep this amendment in S125 until code/tests/current facts own the one-selection contract and its
remaining human limits. Do not retire the original evaluator/date invariants or revive its settled
basis question from older F04 prose.
