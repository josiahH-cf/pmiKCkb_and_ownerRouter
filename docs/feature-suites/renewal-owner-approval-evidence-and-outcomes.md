<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-novdec-2026-10-28 -->

# S234 — Evidenced owner approval of exact terms and one owner outcome per cycle

> Status: IN PROGRESS (merged to main at bf0c03f9 by PR #158, not served) — the R-S234-3 handoff display now reads the approval-bound Working terms; R-S234-1 (who approved, how and when, with the party checked against a fresh owner roster and a linked reply bound to this lease's own owner thread inside the capture) is implemented with emulator, form and planner tests and merged to main at f1f06bfb by PR #162; R-S234-2 (amended to keep the legacy control on its conditional path: the staff record's owner outcome is the one owner outcome that the downstream gate, the tenant-offer draft stamp and the process projection read, an earlier progress-route record that disagrees reads "Earlier owner record differs. Review: …", and terms recorded on an earlier owner response are no longer read as current terms anywhere except the frozen predecessor assurance oracle, which only reproduces pre-S156 revisions), R-S234-4 (the revision note and "Update the working terms and ask the owner again") and R-S234-5 (a tenant answer recorded before the terms revision changed says so; a tenant acceptance never stands in for the owner's answer) are implemented with tests and merged to main at `06c73561` by PR #163. R-S234-3 is complete: one coverage rule names exactly what changed (rent, effective date, end date or charges) on the desk row (Working terms only; it never claims the charges are covered), the Owner response section, the document handoff, the packet notice and the S237 terms basis. Merged to main at `c689d627` by PR #164, a tenant answer keeps the Working rent, effective date and end date revisions it was recorded against, read inside the save; saving any of them afterwards, even to the same value, makes it an answer to earlier terms (an answer recorded before this compares the Working terms' saved times instead). Merged to main at `bb8e7a00` by PR #167, the served S238 journey records an approval with who, how and when through the lease page and shows its coverage name the rent as no longer covered after a Working rent save, on the lease page and the desk row alike (`e2188bd3`). Originally finalized 2026-10-28 from the November/December renewal Clarify Features initialization (intake 101). Who may approve for each landlord and each real approval's evidence are client facts (C03/C04) that hold only real records, not this code slice.

**Goal.**

When a landlord or their authorized representative approves renewal terms, staff record exactly
who approved, through which channel and when, bound to the exact Working rent, dates and charges.
Every part of the app reads that one owner outcome; any later change to the terms or charges
visibly removes the approval's coverage until the owner approves again.

**Current state / intended end state.**

Inspected at `a1c0fe8c` (source read, not a production observation):

- Working fields in `lib/lease-renewal/working-record.ts` include `terms_rent` "Working renewal
  rent", `terms_effective_date` "Working renewal effective date" and `terms_end_date` "Working
  renewal end date", each with `revision`, recorder and time; saving them writes app-owned data only.
- The staff record in `lib/lease-renewal/workspace-state.ts` carries owner outcomes
  `approved_terms | revision_requested | declined_non_renewal | no_response` ("Approved", "Revision
  requested", "Declined / non-renewal", "No response" in
  `components/lease-renewal/RenewalManualWorkspace.tsx`) and tenant outcomes
  `awaiting_response | accepted | counter_change_requested | declined_nonrenewing |
needs_verification`. Only an approval may carry terms.
- On `approved_terms` the server captures `ApprovedWorkingTerms` {rent, effectiveDate, endDate,
  fieldRevisions, economicsHash, chargePolicyVersion} in the same transaction
  (`lib/firestore/renewal-workspace.ts`). `lib/lease-documents/owner-approval-binding.ts` reports
  `current | not_recorded | no_working_terms | terms_changed | charges_changed`; any revision change,
  even back to the same value, makes it stale; the economics hash covers policy version and each
  charge. The packet requires `current` (`lib/lease-renewal/execution/normal-packet-action.ts`) and
  the execution claim re-checks it (`lib/firestore/lease-document-action-claim.ts`). Tenant consent
  counts only at the current terms revision and is never read as landlord approval.
- Evidence is weak: the record keeps actor, time, terms revision and an optional free-text source
  (default "Staff record"); it does not record who approved for the owner, the channel or a linked
  message.
- Two owner-outcome records exist. The Full view "Owner decision" card renders
  `components/lease-renewal/RenewalOwnerOutcomeControl.tsx` ("Approved the terms", "Asked for
  changes", "Declined / not renewing", "No response yet"; evidence "Linked Gmail receipt" / "Verified
  app record"), stored through `app/api/lease-renewal/renewal-progress/route.ts` and used by
  `ownerOutcomeBlocksDownstream` in `lib/lease-renewal/renewal-progress.ts`; the packet binding
  ignores it. Legacy `ownerResponse.terms` are still read by `currentManualOwnerTerms`,
  `components/lease-renewal/RenewalDocumentHandoff.tsx` (whose copy says the packet reads terms
  recorded with the owner response and not the working terms — the opposite of the binding) and
  `lib/production-assurance/manual-renewal-projection.ts`.
- "Reopen" only clears completion; a revised request is visible only as a stale approval.
- Source rent stays separate: lease-detail `baseRentAmount` is the contractual current rent,
  `rentAmount` the total and the export `unit.rent` a listing reference
  (`lib/integrations/rentvine/lease-mapper.ts`, S102).

Intended: one owner outcome per cycle with structured approval evidence, read by every consumer;
truthful handoff copy; explicit revision, decline, no-response and re-approval flows; approval
coverage visible wherever terms are used.

**Actors and entry conditions.**

Renewal staff with Editor or higher capability record outcomes as they occur outside the app. The
approving party is the landlord or a representative the client designates (C03 in
`docs/open-blockers.md`); a staff title, a pricing recommendation, a reply or a pricing policy never
stands in. Entry requires the lease's owner roster from the current source read; when the roster is
unreadable the approval control states that and records nothing.

**What it is / how it functions.**

- **R-S234-1 — Structured approval evidence.** Recording "Approved" requires (a) the approving party:
  a named owner from the lease's current owner roster, or "Authorized representative" with a typed
  name and capacity; (b) the channel: a reply message selected from this lease's linked renewal
  thread (bound by mailbox, thread and message id from S233 evidence), another written channel with a
  reference, or a conversation with its participants; and (c) when it happened. The record stores
  these with the existing actor, time, terms revision and `ApprovedWorkingTerms`. Nothing is
  pre-selected from an incoming message.
- **R-S234-2 — One owner outcome per cycle.** The staff-record owner outcome is the owner outcome
  that desk and Focus guidance, the packet gate, `ownerOutcomeBlocksDownstream`, the assurance
  projection and the handoff screen read. The legacy "Owner decision" control stays on its existing
  conditional path (after an app-sent owner message) pending a material change (amended 2026-10-28);
  when its earlier progress-route record disagrees with the staff record, the screen shows "Earlier
  owner record differs — review" and never uses it silently. Legacy `ownerResponse.terms` are not
  read as current terms anywhere.
- **R-S234-3 — Truthful terms and approval display.** The handoff screen, the Owner approval section
  and the desk row state which Working terms (rent, effective date, end date with their revisions)
  and charges the approval covers, and its state: covered; no longer covers because the rent, dates
  or charges changed; or no recorded approval.
- **R-S234-4 — Revision, decline, no response and re-approval.** "Revision requested" records the
  owner's requested change in its note and makes the next action "Update the working terms and ask
  the owner again"; the Working terms remain the single terms record. "Declined / non-renewal" keeps
  the existing non-renewal handoff and downstream block. "No response" keeps the owner as the
  waiting party. Recording a new approval after a change supersedes the earlier one, which stays in
  history with its revision; changing an outcome after approval needs a new owner record, never a
  silent edit.
- **R-S234-5 — Tenant consent stays separate.** Tenant acceptance displays against the current terms
  revision ("Recorded before the terms changed" otherwise) and is never shown as owner approval, as
  a staff communication authorization or as a signature.

**In scope / out of scope.**

In scope: approval evidence capture and storage, consolidation of owner-outcome consumers,
handoff/approval/desk copy, revision and re-approval flows, tests. Out of scope: automatic approval
from a reply or recommendation, structured owner counter-terms, per-person approval permissions
(S64 remains unauthorized), legal verification of a representative's authority, provider writes,
changing D-RENEWAL-STAFF-OPERATIONS (approval is not a prerequisite for RentVine/Sheet updates).

**Open questions & assumptions.**

- No product decision blocks this slice. Who may approve for each landlord, and the evidence for each
  real approval, are client facts (C03, C04).
- Assumption (labeled): older progress-route owner records are preserved as history; consolidation
  never rewrites them.
- Synthetic illustration for tests only: Working terms 1750.00 / 2026-12-01 / 2027-11-30, approved by
  "Example Owner LLC" through a linked reply; never a live value.

**Cross-product impacts.**

`lib/lease-renewal/workspace-state.ts`, `lib/firestore/renewal-workspace.ts`,
`lib/lease-documents/owner-approval-binding.ts`, `lib/lease-renewal/renewal-progress.ts`,
`lib/lease-renewal/renewal-process.ts`, `app/api/lease-renewal/renewal-progress/route.ts`,
`components/lease-renewal/RenewalManualWorkspace.tsx`, `components/lease-renewal/RenewalOwnerOutcomeControl.tsx`,
`components/lease-renewal/RenewalDocumentHandoff.tsx`, `components/lease-renewal/RenewalWorkspace.tsx`,
`lib/production-assurance/manual-renewal-projection.ts`, S232 guidance, S235 packet facts, S237
basis, the operator guide.

**Authority and evidence map.**

| Input                                                                | Classification       | Use and limitation                                                                                   |
| -------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------- |
| `AGENTS.md` (owner approval of exact terms stays explicit), D-NO-S64 | Authority            | Staff record real outcomes; no manual marker grants provider execution; no person-level permissions. |
| Committed code/tests at `a1c0fe8c`                                   | Implementation truth | Binding, states, two records and legacy reads above.                                                 |
| 2026-10-28 Clarify Features initialization (Obsidian inbox)          | Intent evidence      | Evidence, actor, time, revisions, invalidation; decline/counteroffer/no-response/reopen flows.       |
| Client approver designation and real approvals (C03, C04)            | External dependency  | Hold only real approval records; fixtures prove behavior.                                            |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S234-1** — The approval record carries a typed approving party, channel and occurrence time,
  with a bound message reference when the channel is a linked reply, validated server-side in the
  capture transaction. Fail-first: an approval without party or channel is accepted today.
- **ARCH-S234-2** — One owner-outcome accessor per cycle feeds every consumer; the progress-route
  writer is retired from the card and disagreeing historical records project as a conflict.
  Fail-first: the card and the staff record write separate outcomes that can disagree.
- **ARCH-S234-3** — No production path reads legacy `ownerResponse.terms` as current terms.
  Fail-first: the handoff screen and the assurance projection read them.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S234-1** — Recording "Approved" without an approving party or channel is refused with the
  missing item named; with a linked reply it stores the message reference.
- **BEH-S234-2** — Changing the Working rent after approval shows "no longer covers — rent changed"
  on the desk row, Owner approval section and handoff screen, and the packet stays held.
- **BEH-S234-3** — The "Owner decision" card and the staff record show the same outcome; a seeded
  disagreeing historical record shows the review conflict.
- **BEH-S234-4** — "Revision requested" sets the next action to update the terms and ask again; a new
  approval supersedes the old one, which remains in history.

**Human litmus outcome.**

### Staff record exactly who approved which terms

**If this was built correctly:** A staff member records the owner's approval by choosing who
approved, how (for example the reply in this lease's thread) and when. The lease then shows exactly
which rent, dates and charges are approved. If anyone changes those terms, every screen says the
approval no longer covers them until the owner approves again.

- Model verdict: NOT RUN — to be completed by the implementation runner with evidence.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                           | Architecture outcome | Behavior outcome | Human litmus                                  | Deterministic evidence / falsification                                                                                     |
| ------------------------------------- | -------------------- | ---------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| R-S234-1 structured approval evidence | ARCH-S234-1          | BEH-S234-1       | Staff record exactly who approved which terms | Extend `tests/firestore/s66-packet-inputs-store.test.ts`: missing party/channel refused; linked reply bound by message id. |
| R-S234-2 one owner outcome per cycle  | ARCH-S234-2          | BEH-S234-3       | Staff record exactly who approved which terms | Extend `tests/unit/s113-workspace-state.test.ts`: every consumer reads one outcome; historical disagreement is a conflict. |
| R-S234-3 truthful terms and approval  | ARCH-S234-3          | BEH-S234-2       | Staff record exactly who approved which terms | Extend `tests/unit/s34-handoff-controls.test.tsx` and `tests/unit/s66-owner-approval-binding.test.ts`: covered/stale copy. |
| R-S234-4 revision and re-approval     | ARCH-S234-2          | BEH-S234-4       | Staff record exactly who approved which terms | Extend `tests/unit/s113-workspace-state.test.ts`: revision note, next action, supersession history.                        |
| R-S234-5 tenant consent separate      | ARCH-S234-2          | BEH-S234-2       | Staff record exactly who approved which terms | Extend `tests/unit/s113-workspace-state.test.ts`: tenant acceptance never reads as owner approval or signature.            |

**Preservation set.**

`tests/unit/s66-owner-approval-binding.test.ts` (stale on revision change even to the same value; no
legacy-terms or pricing substitution), `tests/unit/s102-lease-detail-enrichment.test.ts` (no
`unit.rent` or `rentAmount` as base rent), the execution-claim re-check, the non-renewal handoff and
downstream block, and the canonical gate.

**Adversarial acceptance checks.**

- **AC-S234-1** — An approval whose party is not on the owner roster and is not marked "Authorized
  representative" with name and capacity is refused; a selected reply from another lease's thread is
  refused (ARCH-S234-1, BEH-S234-1).
- **AC-S234-2** — Rent, effective date, end date and each charge change independently make the
  approval stale with the matching reason everywhere it is displayed, and the packet claim refuses
  (ARCH-S234-3, BEH-S234-2).
- **AC-S234-3** — No reply, auto-reply, pricing policy, tenant acceptance or staff title produces an
  approved outcome; only an explicit staff record does (ARCH-S234-2, BEH-S234-3).
- **AC-S234-4** — After consolidation the card cannot create a second record, and every consumer
  returns the same outcome for the same cycle (ARCH-S234-2, BEH-S234-3, BEH-S234-4).

**Forbidden actions / hard gates.**

No inferred approval, no automatic outcome from mail or models, no rewrite of historical records,
no S64 permission change, no provider write, no customer names or terms in Git or fixtures beyond
synthetic data.

**Dependencies / sequencing.**

Consumes S66 binding, S105/S113 owner outcomes, S102 rent sources and, when delivered, S233 linked
reply evidence (absent → only written-channel and conversation evidence types). Produces the single
outcome and approval coverage used by S232, S235, S237 and S238.

**Standalone delivery contract.**

- **Deliverable now:** R-S234-1 to R-S234-5 with tests and operator-guide wording.
- **Consumes, but does not assume:** S233 message references (unset → no linked-reply choice).
- **Externally blocked effect:** real approval records for November/December leases need the
  client's actual approvers and evidence (C03, C04) — `BLOCKED` until supplied; independent work
  proceeds.
- **Produces for downstream suites:** owner outcome, approval coverage state and evidence reference.

**Verification and delivery contract.**

1. Before edits, record the current readback, the preservation baseline and each ARCH/BEH check
   failing for the stated reason.
2. Run the focused checks for every ARCH, BEH and AC row; keep preservation separate.
3. Run `bash scripts/verify.sh` and `npm run test:e2e:core`; audit secrets, PII, gates, runtime
   configuration and diff scope before any authorized delivery.
4. Report `ALL_GATES_GREEN`, `BUDGET_EXHAUSTED` only under an explicit budget, or `BLOCKED` only for
   the named external input after all fail-closed work is green.

**Ordered prompt sequence.**

1. Re-verify current code and both owner-outcome paths.
2. Materialize the ARCH/BEH checks, litmus and preservation baseline; record fail-first results.
3. Build evidence capture, consolidation, copy and revision flows.
4. Falsify, run focused and canonical tests, update the operator guide, and ship only when
   authorized.

**Deletion/merge recommendation.**

Remove this suite when its checks are represented by code, tests and current facts; keep S66 and
S105 history unchanged.
