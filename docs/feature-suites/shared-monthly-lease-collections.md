<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S201 — Named shared monthly lease collections with stable membership

> Intake: READY. The original collection contract, intake 073, shipped in run `5b3dfb90`. November 7 intake 124 finalizes the revised journey for future implementation.

**Goal.**

Renewal staff share a named monthly group of reviewed leases, track current status and reopen the same membership without sharing private conversations or silently changing the group.

**Current state / intended end state.**

On the November 7 rehearsal of `ef81b891`, an Editor saved one synthetic lease. An Admin
reopened the same member, refreshed its status and opened a one-row desk table. A reload
before save cleared the reviewed selection and its inputs. "New collection" kept the previous
dates and selected lease. The desk entry carried the 38 shown leases into period matching
with blank dates. The revised journey opens on useful current status and separates creating,
reviewing and saving a membership change.

**Actors and entry conditions.**

Existing managed staff with current Renewal Space access. Creation and membership editing use their normal app-owned staff-operation contract; server scope is checked on every referenced lease. Shared means staff within existing applicable Renewal scope, not public access or sharing all Spaces. Private chat remains owner-only.

**What it is / how it functions.**

1. **R-S201-1 — Create a reviewed collection.** From the collection list, "New collection"
   opens a clean form. From a desk or assistant result it starts with exactly the accessible
   leases offered by that result and shows which leases were imported. Staff can select and
   remove named lease/cycle rows and look up accessible leases by address, name or exact ID.
   Preserve the existing ID entry capability as a secondary input. A collection name and an
   ordered period are required. Show field errors, focus the first missing field and retain
   entered values. Confirm the actual lease/cycle membership before saving.

2. **R-S201-2 — Edit membership explicitly.** Opening a collection starts on a member table
   with the period and count. "Refresh statuses" reads current status for the saved members.
   "Edit membership" shows the saved selection and prepares a separate review of additions,
   removals and the resulting members with lease identity and cycle dates. Show the basis and
   version being reviewed. Save only the reviewed difference after staff confirmation. An
   incomplete source read holds the membership change and leaves the saved set intact. Use
   a separate rename action and keep "Open this collection on the Renewals desk".

3. **R-S201-3: Refresh current status honestly.** For stored members, load current lifecycle, work status and source freshness/coverage through existing renewal projections. Historical saved membership remains distinguishable from current status. Unavailable, deleted, cycle-changed or no-longer-accessible members receive an honest scoped unavailable/stale indication and cannot leak protected details or be silently dropped.

4. **R-S201-4: Share only within existing scope.** List/open/edit collections according to existing Renewal Space capability without a new role or lease-assignment gate. Re-evaluate member access per actor. A shared collection never expands source permissions, exposes another user's history or makes saved chat context team-wide.

5. **R-S201-5 — Version edits and preserve collaboration.** Use the ordinary app-owned
   save/version/audit contract. Record the actor, time and reviewed version. Repeat
   confirmation idempotently. A concurrent edit or a lost response shows the current state
   and the original intent's result when known. Staff can recover or review again without
   overwriting newer membership.
6. **R-S201-6 — Make the selection basis explicit.** Default to "Choose leases" for a new
   or imported selection. The period describes a group of explicitly chosen leases. A chosen
   lease outside that period remains in review with its actual cycle date visible. "Match a
   period" applies the selected date field, ordered date range and any recorded worklist filters.
   Show those filters in staff terms and the actual matching leases before the save. Do not
   infer a matching period from imported IDs. A saved group reopens with its recorded basis.
7. **R-S201-7 — Keep the review recoverable.** Refreshing or returning within the original
   signed-in tab restores a still-current review and the entered name, period and selection.
   A changed collection version, expired review or changed access prompts a new scoped
   review, keeping any input still permitted. Recovery does not apply the proposed change.
   Starting a fresh collection clears the previous form. Leaving an edited form offers a
   clear way to keep or discard the local work. Offer a next action on empty lists and a
   retry on failed reads. Announce loading, the reviewed difference, saved result and failures
   and move keyboard focus to the relevant result or recovery.

**In scope / out of scope.**

In scope: named shared monthly lease sets, reviewed stable membership, current status projection, explicit membership refresh, existing-scope collaboration and audit/recovery. Out of scope: general project management, transcript sharing, automatic collection membership churn, bulk provider operations, new source permissions or automatic sends.

**Open questions & assumptions.**

The owner accepted Q4 on November 7. Staff-supplied periods describe explicit membership and
bound matched membership. Reopen and status refresh use the reviewed set in both modes.
Historical collections keep their saved basis, member/cycle identities and links.

**Cross-product impacts.**

Renewal Desk results and accessible assistant lease results; shared app-owned Firestore data/routes; existing renewal lifecycle/work projections; S199/S200 private conversation navigation and S202 explicit operation admission.

**Authority and evidence map.**

| Input                                                                     | Classification                   | Use and limitation                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`, current code/tests and serving readback                      | Authority / implementation truth | Existing identity, Space, provider and exact-operation boundaries apply. Starting reference for this batch: WSL main `43bad3ad`, serving `337ac163` on 2026-10-08; recheck before implementation. A reference is not fresh live proof. |
| Existing Renewal Desk, S137 operational-context projections and S148–S150 | Project evidence                 | Existing lists, scoped references and private history are reusable foundations; neither saved answers nor dynamic saved queries prove shared stable membership.                                                                        |
| October 9 clarification and November 7 accepted Q4                        | Confirmed owner decisions        | Keep team membership stable. Make opening, selecting, reviewing and recovering explicit.                                                                                                                                               |
| Browser rehearsal at `ef81b891` and `SharedLeaseCollections.tsx`          | Observation and current source   | Confirmed saved-set stability, a retained prior selection on New collection and a lost review after reload.                                                                                                                            |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S201-1** — A server-owned app collection stores reviewed stable members and recorded selection basis, separate from conversation/saved-query records. Review/save fixtures fail if a raw dynamic query or transcript substitutes for reviewed membership.
- **ARCH-S201-2** — Membership versioning separates a reviewed snapshot from current query candidates and source coverage. A changed-query or incomplete-read fixture fails if routine refresh rewrites membership.
- **ARCH-S201-3** — The collection joins stable references to current server-authorized renewal projections with explicit missing/degraded states. Status-refresh and revocation fixtures fail against frozen answers or silent removals.
- **ARCH-S201-4** — Server collection operations and member resolution enforce the real actor's existing Space/source scope, separate from private history ownership. Cross-Space and guessed-ID tests fail if a shared collection becomes an access grant.
- **ARCH-S201-5** — Versioned durable collection mutations record actor and reviewed membership basis and use existing idempotency/conflict conventions. Duplicate/concurrent fixtures fail against last-writer-wins replacement.

- **ARCH-S201-6** — One scoped review pipeline records whether the period is context or a
  matching rule. The collection editor uses the existing server review and version boundaries.
  Fail-first: imported exact IDs silently start period matching.
- **ARCH-S201-7** — Recovery binds the exact draft or review to the signed-in actor, collection
  and version. Fail-first: refresh loses a valid review or recovery can apply a stale version.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S201-1** — A staff member reviews a monthly lease set, names and saves it, and another authorized colleague opens the same identified members without accessing the originating conversation.
- **BEH-S201-2** — A newly qualifying lease does not silently appear in an existing collection. Staff can review and accept a clear membership difference, or keep the existing set.
- **BEH-S201-3** — Colleagues see the same collection membership with current member statuses and clear refresh times; an unavailable member is identified only to the extent permitted rather than shown as completed or missing without explanation.
- **BEH-S201-4** — Authorized renewal colleagues collaborate on the collection; users outside its applicable scope cannot retrieve it or use its member references to open restricted leases.
- **BEH-S201-5** — A colleague sees who last changed the collection; a conflicting update shows current state and requires review rather than erasing another person's work.

- **BEH-S201-6** — From a list or an imported result, staff can identify the selected leases
  and explain why a lease is included before confirming.
- **BEH-S201-7** — A teammate opens the saved members directly. A new edit starts clean, and a
  reload during a valid review returns to the same selection and next action.

**Human litmus outcome.**

### Work the same monthly lease group together

**If this was built correctly:** A staff member names a collection from the leases they are
looking at and can see each member before saving. After a reload they finish the same review.
A colleague opens the same table and refreshes its statuses. They can see which leases would
change before choosing to save a membership edit.

- Model verdict: November 7 revision NOT RUN. The original stable membership contract has
  scoped engineering and delivery evidence in run `5b3dfb90`.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement                                            | Architecture outcome | Behavior outcome | Human litmus                               | Deterministic evidence / falsification                                                                                                                                                                                          |
| ------------------------------------------------------ | -------------------- | ---------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S201-1: Create a named reviewed monthly collection   | ARCH-S201-1          | BEH-S201-1       | Work the same monthly lease group together | AC-S201-1: Create from filtered and AI-returned accessible records; inspect reviewed members and recorded date-field/period basis. Reopen as a second scoped user and assert stable lease/cycle IDs and no transcript exposure. |
| R-S201-2: Hold membership stable until explicit review | ARCH-S201-2          | BEH-S201-2       | Work the same monthly lease group together | AC-S201-2: Change underlying qualifying leases, refresh status, reopen and then explicitly refresh membership. Assert unchanged membership until confirmed; incomplete reads show a hold and preserve members.                  |
| R-S201-3: Refresh current status honestly              | ARCH-S201-3          | BEH-S201-3       | Work the same monthly lease group together | AC-S201-3: Advance a member's renewal status, change its cycle, fail one source and revoke access. Assert fresh permitted states, honest coverage and no membership mutation or protected detail.                               |
| R-S201-4: Share only within existing scope             | ARCH-S201-4          | BEH-S201-4       | Work the same monthly lease group together | AC-S201-4: Use permitted staff, an excluded Space actor and guessed collection/member IDs through UI/route/store boundaries; assert no new role/claim and no private conversation content.                                      |
| R-S201-5: Version edits and preserve collaboration     | ARCH-S201-5          | BEH-S201-5       | Work the same monthly lease group together | AC-S201-5: Race two membership edits and a name edit, repeat a confirmation and lose a response. Assert one committed intended version, readable conflict state and zero provider writes.                                       |

November 7 requirements for intake 124. The rows above retain the original program's
requirement identities.

| Requirement                   | Architecture outcome | Behavior outcome | Human litmus                               | Deterministic evidence / falsification                                               |
| ----------------------------- | -------------------- | ---------------- | ------------------------------------------ | ------------------------------------------------------------------------------------ |
| `R-S201-6` explicit basis     | ARCH-S201-6          | BEH-S201-6       | Work the same monthly lease group together | AC-S201-6. Compare period matching with explicitly choosing an out-of-period member. |
| `R-S201-7` recoverable review | ARCH-S201-7          | BEH-S201-7       | Work the same monthly lease group together | AC-S201-7. Reopen, refresh, resume review, then start a clean collection.            |

**Preservation set.**

Existing renewal filters, lifecycle semantics, current-access and source-coverage checks, private history isolation, exact Sheet/RentVine operation gates and per-lease cycle scoping. No source snapshot is relabeled current.

**Adversarial acceptance checks.**

- **AC-S201-1** — Create from filtered and AI-returned accessible records; inspect reviewed members and recorded date-field/period basis. Reopen as a second scoped user and assert stable lease/cycle IDs and no transcript exposure. This falsifies ARCH-S201-1 / BEH-S201-1 and the named human litmus.
- **AC-S201-2** — Change underlying qualifying leases, refresh status, reopen and then explicitly refresh membership. Assert unchanged membership until confirmed; incomplete reads show a hold and preserve members. This falsifies ARCH-S201-2 / BEH-S201-2 and the named human litmus.
- **AC-S201-3** — Advance a member's renewal status, change its cycle, fail one source and revoke access. Assert fresh permitted states, honest coverage and no membership mutation or protected detail. This falsifies ARCH-S201-3 / BEH-S201-3 and the named human litmus.
- **AC-S201-4** — Use permitted staff, an excluded Space actor and guessed collection/member IDs through UI/route/store boundaries; assert no new role/claim and no private conversation content. This falsifies ARCH-S201-4 / BEH-S201-4 and the named human litmus.
- **AC-S201-5** — Race two membership edits and a name edit, repeat a confirmation and lose a response. Assert one committed intended version, readable conflict state and zero provider writes. This falsifies ARCH-S201-5 / BEH-S201-5 and the named human litmus.

- **AC-S201-6** — Open from the desk and from the assistant. Confirm the imported accessible
  identities before saving. Choose an end date outside the period and verify it remains in an
  explicit review with the actual date shown. Switch to period matching and check membership
  against its date field, range and named filters. Save and reopen each result as a second
  authorized actor (ARCH-S201-6, BEH-S201-6).
- **AC-S201-7** — Reload during an uncommitted review and resume the same input. Check expired
  and version-conflicting reviews, changed access and missing responses. Open an existing
  collection, then start a new one and verify clean inputs. Refresh statuses and compare
  exact membership/version before and after. At phone width and by keyboard, verify clear
  focus and feedback after review, save and retry (ARCH-S201-7, BEH-S201-7).

**Forbidden actions / hard gates.**

No public links, cross-Space grants, private transcript sharing, automatic member addition/removal, arbitrary source-date assumptions, provider writes or bulk execution from collection creation/refresh. No new role/claim is part of this feature.

**Dependencies / sequencing.**

Consumes existing renewal projections and may consume S199 chat results without depending on chat persistence. S200 pins threads separately. S183/S184 normal staff action contracts apply to actual collection saves; provider-operation authority remains separate.

**Standalone delivery contract.**

- **Deliverable now:** Complete shared collection creation, review, status refresh, explicit membership refresh and collaboration conflict handling.
- **Consumes, but does not assume:** Accessible stable lease/cycle references and recorded selection basis; incomplete source coverage is explicit and cannot authorize destructive membership differences.
- **Externally blocked effect:** None for the application feature. Source outages hold only dependent current projection/membership confirmation; provider changes are outside scope.
- **Produces for downstream suites:** Shared reviewed lease membership and current-status views without team transcript sharing.

**Verification and delivery contract.**

1. Before implementation edits, recheck the current source and serving readback; record the preservation baseline and the named architecture/behavior cases failing for the expected missing behavior. Historical specification prose is not the current baseline.
2. Exercise every traceability and adversarial row through the actual server, store and rendered controls where applicable; use deterministic adapters and the Firestore emulator for isolation, concurrency and failure cases. Keep preservation results separate.
3. Under a separately authorized implementation run, run focused checks and `bash scripts/verify.sh`; review the mechanical diff, source lineage, privacy, action admission and runtime configuration before authorized delivery. No live customer effect is required to prove this suite.
4. Report `ALL_GATES_GREEN` only for the fully verified implementation scope; use `BLOCKED` for an exact unavailable input after independent work is complete, and `BUDGET_EXHAUSTED` only when an explicit budget exists. Authoring this READY spec is neither execution authorization nor an implementation verdict.

**Ordered prompt sequence.**

1. Re-verify the source, serving state and existing authority contract.
2. Materialize each architecture/behavior falsification, the named human litmus and preservation baseline before implementation edits.
3. Implement the bounded slice and its recovery/refusal paths through existing boundaries.
4. Exercise every acceptance row, run focused and canonical checks, report exact evidence and deliver only under a separate authorized implementation run.

**Deletion/merge recommendation.**

Retire or merge only after code, tests and current facts own every requirement and preservation check, with actual delivery evidence. Do not retire because a related suite is deployed or the spec is registered.
