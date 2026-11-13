<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: staff-workflow-audit-2026-11-12 -->

# S279 — Show one lease status from one record

> Status: DELIVERED at ba9a64f6, intake 157. Chunk 1 run `a6f14bac-7edd-4db2-ab94-93f0875dc1ee`. R-S279-2 is partial. See the delivery evidence for the remaining scope.

**Goal.**

A lease shows one answer to "who are we waiting on, since when" on every card and to
every staff member, and a status check appears only when two facts about the same
message really disagree.

**Current state / intended end state.**

Verified by a read-only trace of the serving source:

- The step's waiting line reads the outreach evidence built from the lease's sequences
  (`lib/lease-renewal/renewal-stage.ts`, lines 507 to 528).
- The "Waiting and follow-up" card reads a different record: workflow links, the notice
  policy and a fallback from the older process step
  (`components/lease-renewal/RenewalFollowUpStatus.tsx`, lines 17 to 56;
  `lib/lease-renewal/follow-up-projection.ts`, lines 438 to 479). "An unresolved source"
  is that fallback for the step named verify-renewal (`lib/lease-renewal/live-desk.ts`,
  lines 1348 to 1377). The two records share no source.
- "Needs a check" compares the staff record with one workflow link's waiting state
  (`lib/lease-renewal/lease-work-status.ts`, lines 93 to 111, 155 to 163 and 271 to 292).
  The link is chosen from the viewer's own mailbox links only
  (`lib/gmail-hub/service.ts`, lines 177 to 194), filtered by a purpose taken from the
  older process step, newest observed contact first
  (`lib/lease-renewal/follow-up-projection.ts`, lines 139 to 163). A link written by the
  app's own confirmed send has no contact fields, so it sorts last
  (`lib/gmail-hub/sequence-store.ts`, lines 649 to 671). Two staff members can therefore
  see different statuses for one lease.
- "Timing policy not confirmed … Next: Ask an Admin to confirm and version the client
  timing policy" comes from the follow-up projection (lines 286 to 300 and 416 to 418).
  It concerns the renewal notice rules, owned by the Admin panel
  `components/admin/NoticeRulesAdminPanel.tsx`. The line names neither the page nor a
  link. The rule values are an open client input (B-TIMING in
  [the blocker packet](../open-blockers.md)).
- The stage wording comes from the current step (`lib/lease-renewal/renewal-path.ts`,
  line 266): the Offer the tenant step reads "Preparing tenant offer" whatever has been
  recorded on it.
- The readiness list mixes two reads: the page projection and the message editor's own
  fetched message (`lib/lease-renewal/renewal-preparation.ts`, lines 529 to 541;
  `components/lease-renewal/RenewalMessagePreparation.tsx`, lines 1005 to 1014 and 1692
  to 1694).

In the November 12 rehearsal one screen said "Waiting on the owner since 11/12/2026" and
"Waiting on an unresolved source. Last contact: Needs Verification"; a "Needs a check"
appeared right after the app's own confirmed send; the stage still read "Preparing
tenant offer" after the tenant accepted; and "Rent to recommend: Ready" stood beside
"Missing rent to recommend" (audit findings A-08 and A-19).

Intended end state: waiting status has one source; it does not depend on whose mailbox
the viewer uses; the check compares the staff record with the current message's own
thread and names the fix; the stage follows recorded outcomes; the unconfirmed policy
line names its owner; and the readiness list has one read behind it.

**Actors and entry conditions.**

Any staff member with the lease's workflow access reads the lease and the desk. Entry
requires the lease's current cycle. No capability changes.

**What it is / how it functions.**

- **R-S279-1 — Use one source for waiting.** The step's waiting line, the "Waiting and
  follow-up" card and the desk row derive who is waited on, since when and the last
  contact from the same outreach evidence for the lease and cycle. When that evidence
  exists the card does not fall back to the older process step. Where the card would
  only repeat the step's line it shows what it adds, the next follow-up date and the
  policy note, and nothing else.
- **R-S279-2 — Show the same status to every staff member.** Status derivation does not
  read the viewer's own mailbox links. Any staff member with the lease's workflow access
  sees the same waiting line, last contact and check result. A person's link attention
  still drives only that person's notifications.
- **R-S279-3 — Compare like with like in "Needs a check".** The thread side is the thread
  of the current step's latest message for that audience and cycle, including the link a
  confirmed send writes. Right after an app-confirmed send with no reply, no "Needs a
  check" appears. For a real disagreement the line keeps both facts (S232 R-S232-4) and
  adds the fix, for example "The staff record says waiting on the tenant. The tenant
  replied on 11/12/2026. Record the response." with a link to that editor. It appears
  once on the screen.
- **R-S279-4 — Let the stage follow recorded outcomes.** Once a tenant acceptance is
  recorded, the stage line does not read "Preparing tenant offer". It reads the existing
  bounded status of the work that is outstanding. The closed status list is unchanged.
- **R-S279-5 — Name the owner of an unconfirmed policy.** The timing policy line reads
  "Renewal notice rules are not confirmed. Next: an Admin confirms them in Admin, Renewal
  notice rules." An Admin gets a link to that panel; other roles get the text. The line
  stays while the rule values remain unconfirmed.
- **R-S279-6 — Put one read behind the readiness list.** After Prepare or any save, the
  readiness rows and the message's marked values come from the same refreshed read. The
  list never shows a fact as ready beside a marker that says the same fact is missing.

**In scope / out of scope.**

In scope: the source of the waiting card and the check, viewer independence, the check's
wording and fix, the stage after a recorded acceptance, the policy line and the readiness
read. Out of scope: reply detection ([S275](renewal-replies-reach-the-lease.md)), the
Dashboard and queue rows ([S280](staff-waiting-on-you-renewal-work.md)), the notice rule
values themselves, and the work status control staff set by hand.

**Open questions & assumptions.**

- Assumption: sequence records are already readable by any staff member with the
  workflow Space, as the lease's reply card shows; status reads them under the same
  access.
- Open, not blocking: which bounded status best describes the work between a tenant
  acceptance and the documents. The implementer uses the path's existing mapping; the
  renewal lead can confirm the wording at staff review.

**Cross-product impacts.**

Lease work status lines, the follow-up projection and its card, the stage projection,
the desk row, the readiness list, the notice rules Admin link, Help and the control map.

**Authority and evidence map.**

| Input                                                                                                                       | Classification                   | Use and limitation                                                                                |
| --------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------- |
| S232 R-S232-4, S247 R-S247-5, S248 evidence-driven stage, S75 follow-up state, S188 ownership                               | Active contracts                 | Both facts in a check, waiting explained in place, one evidence source, access by workflow Space. |
| `lib/lease-renewal/lease-work-status.ts`, `lib/lease-renewal/follow-up-projection.ts`, `lib/lease-renewal/renewal-stage.ts` | Committed implementation (trace) | Two unrelated records and viewer-scoped links. Re-verify lines before editing.                    |
| [The blocker packet](../open-blockers.md), B-TIMING                                                                         | External dependency              | Rule values stay unconfirmed until the client supplies them; only the line's wording changes.     |
| Staff workflow audit of November 12, 2026, findings A-08 and A-19                                                           | Intent evidence only             | Observed contradictions on synthetic data. Viewer dependence was found by the later trace.        |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S279-1** — One waiting projection over outreach evidence feeds the step line,
  the card and the desk row. A test with a confirmed owner send and no link contact
  fields fails on the starting state, where the card reads "an unresolved source".
- **ARCH-S279-2** — The projection takes the lease, cycle and stored sequence evidence
  as inputs and no viewer identity. The same inputs give the same output for two actors.
- **ARCH-S279-3** — The readiness list renders from one read identity; a second read
  replaces the whole list, never a subset of rows.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S279-1** — After an app-confirmed owner send, the lease shows one waiting line,
  the card adds only its follow-up note, no "Needs a check" appears and the desk row
  matches the step line.
- **BEH-S279-2** — With staff recorded as waiting on the tenant and a tenant reply
  observed, the check shows both facts and the fix, once.
- **BEH-S279-3** — An Editor and an Approver open the same lease and read the same
  waiting line, last contact and check result.
- **BEH-S279-4** — After a recorded tenant acceptance the stage line does not read
  "Preparing tenant offer".
- **BEH-S279-5** — After Prepare, the readiness list shows no ready row beside a missing
  marker for the same fact.

**Human litmus outcome.**

### One answer to who we are waiting on

**If this was built correctly:** Two staff members looking at the same lease see the same
status. A warning to check something appears only when the staff record and the
customer's own reply disagree, and it says what to do.

- Model verdict: NOT RUN
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                   | Architecture outcome | Behavior outcome | Human litmus                        | Deterministic evidence / falsification                                      |
| --------------------------------------------- | -------------------- | ---------------- | ----------------------------------- | --------------------------------------------------------------------------- |
| R-S279-1 one source for waiting               | ARCH-S279-1          | BEH-S279-1       | One answer to who we are waiting on | AC-S279-1. Step, card and desk row from one projection.                     |
| R-S279-2 same status for every staff          | ARCH-S279-2          | BEH-S279-3       | One answer to who we are waiting on | AC-S279-2. Two actors, identical output.                                    |
| R-S279-3 like with like in the check          | ARCH-S279-1          | BEH-S279-2       | One answer to who we are waiting on | AC-S279-3. No check after a confirmed send; both facts and a fix.           |
| R-S279-4 stage follows outcomes               | ARCH-S279-1          | BEH-S279-4       | One answer to who we are waiting on | AC-S279-4. Stage text after a recorded acceptance.                          |
| R-S279-5 owner of the policy line             | ARCH-S279-1          | BEH-S279-1       | One answer to who we are waiting on | AC-S279-4. Text for each role and the Admin link.                           |
| R-S279-6 one read behind readiness            | ARCH-S279-3          | BEH-S279-5       | One answer to who we are waiting on | AC-S279-5. No ready row beside a missing marker.                            |
| Safety boundary across the requirements above | ARCH-S279-1          | BEH-S279-1       | One answer to who we are waiting on | AC-S279-6. No send, write or lookup happens outside the staff action shown. |

**Preservation set.**

- `tests/unit/s232-lease-work-status.test.ts`: a real disagreement still reads "Needs a
  check" with both facts; its asserted sentence is updated to the form in R-S279-3.
- `tests/unit/renewal-follow-up-projection.test.ts`: the latest provider contact is
  preferred over the most recently rewritten link, within the step's own thread.
- `tests/unit/s247-renewal-path.test.ts`: a waiting step says who, since when, the last
  contact and what is watched.
- `tests/unit/s248-outreach-evidence.test.ts`: scheduled, unconfirmed and bounced
  messages never count as outreach.
- The work status control and its closed list in `lib/lease-renewal/work-status.ts`.

**Adversarial acceptance checks.**

- **AC-S279-1** — Falsify ARCH-S279-1 and BEH-S279-1. For a confirmed send with no reply,
  a scheduled message, a reply and a bounce, the step line, the card and the desk row
  agree word for word on who, since when and last contact, and the card never reads "an
  unresolved source" when outreach evidence exists.
- **AC-S279-2** — Falsify ARCH-S279-2 and BEH-S279-3. Two staff accounts with different
  mailbox links read the same lease: identical status. A user without workflow access
  reads no status.
- **AC-S279-3** — Falsify BEH-S279-2. An app-confirmed send with an older unrelated
  thread on the lease shows no check. A recorded "waiting on tenant" with an observed
  tenant reply shows both facts and the fix once, and the link opens the response editor.
- **AC-S279-4** — Falsify BEH-S279-4 and R-S279-5. Record a tenant acceptance: the stage
  line names outstanding work. The policy line reads as specified for an Editor and
  carries the link for an Admin.
- **AC-S279-5** — Falsify ARCH-S279-3 and BEH-S279-5. Run Prepare and each save that
  feeds the list: at no rendered moment does a ready row stand beside a missing marker
  for the same fact.
- **AC-S279-6** — Safety. Status reads cause zero saves, sends, claims or paid lookups,
  and expose no reply body.

**Forbidden actions / hard gates.**

No status that depends on the viewer's mailbox. No reply body in a status line. No new
status value. No change to notice rule values. No protected path edit.

**Dependencies / sequencing.**

Standalone on S248 evidence as delivered. S275 makes replies arrive; this suite makes
their status agree. S284 qualifies the batch.

**Standalone delivery contract.**

- **Deliverable now:** The single waiting projection, the viewer-independent check, the
  stage and policy wording and the single readiness read, with tests and Help rows,
  reaching `ALL_GATES_GREEN`.
- **Consumes, but does not assume:** S275's observed replies. Without them the check
  compares against the evidence that exists.
- **Externally blocked effect:** Confirmed notice rule values remain with B-TIMING.
- **Produces for downstream suites:** One waiting projection for S280.

**Verification and delivery contract.**

1. Before editing, prove BEH-S279-1 and BEH-S279-3 fail on the starting state and record
   the preservation baseline separately.
2. Run focused unit and rendered checks for every ARCH, BEH and AC row.
3. For an authorized candidate run `bash scripts/verify.sh` and `npm run test:e2e:core`,
   complete the scoped S284 qualification and follow the current release gates.
4. Report `ALL_GATES_GREEN` only for completed verification, `BUDGET_EXHAUSTED` only under
   an explicit budget, and `BLOCKED` only for an exact unavailable input or authority.

**Ordered prompt sequence.**

1. Re-verify the two records, the link choice and the readiness reads.
2. Materialize the failing checks and the preservation baseline.
3. Build the single projection, then the check, then the stage, policy line and
   readiness read.
4. Falsify, run focused and canonical checks, update Help and current docs.

**Deletion/merge recommendation.**

Keep active until the single projection and the viewer-independent check are represented
by verified code, tests and current facts.
