<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S201 — Named shared monthly lease collections with stable membership

> Intake: READY, 2026-10-09, intake 073. Finalized specification; implementation, live verification and delivery have not run. Registration alone grants no execution authority.

**Goal.**

Renewal staff share a named monthly group of reviewed leases, track current status and reopen the same membership without sharing private conversations or silently changing the group.

**Current state / intended end state.**

The Renewal Desk already lists and filters leases, and the assistant can return source-scoped lease results with record references. Private history and saved plans preserve answers or rerun queries; they do not establish a shared team collection with stable reviewed membership. End state: a named collection stores a reviewed lease/cycle set and its selection context; current status refreshes independently from explicit membership changes.

**Actors and entry conditions.**

Existing managed staff with current Renewal Space access. Creation and membership editing use their normal app-owned staff-operation contract; server scope is checked on every referenced lease. Shared means staff within existing applicable Renewal scope, not public access or sharing all Spaces. Private chat remains owner-only.

**What it is / how it functions.**

1. **R-S201-1: Create a named reviewed monthly collection.** From accessible renewal results or explicit selection, let staff review the actual lease/cycle members and save a friendly name plus month/period and the source selection criteria/date field used. A query interpretation is visible before saving. Use stable lease/cycle identities, not row numbers, addresses alone or the wording of a prompt. Store only the collection context needed for renewal work, not a private transcript.

2. **R-S201-2: Hold membership stable until explicit review.** Reopening or refreshing status never automatically adds/removes members. An explicit Refresh membership action computes a proposed difference against the recorded selection, shows additions/removals and requires staff confirmation before committing that new version. If the source read is incomplete, do not claim a complete difference or silently remove unseen members.

3. **R-S201-3: Refresh current status honestly.** For stored members, load current lifecycle, work status and source freshness/coverage through existing renewal projections. Historical saved membership remains distinguishable from current status. Unavailable, deleted, cycle-changed or no-longer-accessible members receive an honest scoped unavailable/stale indication and cannot leak protected details or be silently dropped.

4. **R-S201-4: Share only within existing scope.** List/open/edit collections according to existing Renewal Space capability without a new role or lease-assignment gate. Re-evaluate member access per actor. A shared collection never expands source permissions, exposes another user's history or makes saved chat context team-wide.

5. **R-S201-5: Version edits and preserve collaboration.** Use ordinary app-owned save/version/audit patterns for name and membership changes, recording actual actor/time and reviewed version. Repeated confirmation is idempotent; concurrent edits and lost responses reconcile to current state instead of replacing newer membership. Do not create Sheet or RentVine writes merely by saving a collection.

**In scope / out of scope.**

In scope: named shared monthly lease sets, reviewed stable membership, current status projection, explicit membership refresh, existing-scope collaboration and audit/recovery. Out of scope: general project management, transcript sharing, automatic collection membership churn, bulk provider operations, new source permissions or automatic sends.

**Open questions & assumptions.**

No product-blocking question remains. Month/period and selection basis are supplied by the staff action and resolved using existing date interpretation; no unstated month or date field is hardcoded. Exact storage shape is an implementation choice; required semantics above are fixed.

**Cross-product impacts.**

Renewal Desk results and accessible assistant lease results; shared app-owned Firestore data/routes; existing renewal lifecycle/work projections; S199/S200 private conversation navigation and S202 explicit operation admission.

**Authority and evidence map.**

| Input                                                                     | Classification                   | Use and limitation                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`, current code/tests and serving readback                      | Authority / implementation truth | Existing identity, Space, provider and exact-operation boundaries apply. Starting reference for this batch: WSL main `43bad3ad`, serving `337ac163` on 2026-10-08; recheck before implementation. A reference is not fresh live proof. |
| Existing Renewal Desk, S137 operational-context projections and S148–S150 | Project evidence                 | Existing lists, scoped references and private history are reusable foundations; neither saved answers nor dynamic saved queries prove shared stable membership.                                                                        |
| Owner's 2026-10-09 clarification and accepted recommendations             | Confirmed desired behavior       | Named team monthly lease collections retain reviewed members while statuses refresh, and membership refresh remains explicit.                                                                                                          |
| Current record permissions and source availability                        | Runtime dependency               | Resolve against current server authority; historical answers and saved references never grant access or effect authority.                                                                                                              |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S201-1** — A server-owned app collection stores reviewed stable members and recorded selection basis, separate from conversation/saved-query records. Review/save fixtures fail if a raw dynamic query or transcript substitutes for reviewed membership.
- **ARCH-S201-2** — Membership versioning separates a reviewed snapshot from current query candidates and source coverage. A changed-query or incomplete-read fixture fails if routine refresh rewrites membership.
- **ARCH-S201-3** — The collection joins stable references to current server-authorized renewal projections with explicit missing/degraded states. Status-refresh and revocation fixtures fail against frozen answers or silent removals.
- **ARCH-S201-4** — Server collection operations and member resolution enforce the real actor's existing Space/source scope, separate from private history ownership. Cross-Space and guessed-ID tests fail if a shared collection becomes an access grant.
- **ARCH-S201-5** — Versioned durable collection mutations record actor and reviewed membership basis and use existing idempotency/conflict conventions. Duplicate/concurrent fixtures fail against last-writer-wins replacement.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S201-1** — A staff member reviews a monthly lease set, names and saves it, and another authorized colleague opens the same identified members without accessing the originating conversation.
- **BEH-S201-2** — A newly qualifying lease does not silently appear in an existing collection. Staff can review and accept a clear membership difference, or keep the existing set.
- **BEH-S201-3** — Colleagues see the same collection membership with current member statuses and clear refresh times; an unavailable member is identified only to the extent permitted rather than shown as completed or missing without explanation.
- **BEH-S201-4** — Authorized renewal colleagues collaborate on the collection; users outside its applicable scope cannot retrieve it or use its member references to open restricted leases.
- **BEH-S201-5** — A colleague sees who last changed the collection; a conflicting update shows current state and requires review rather than erasing another person's work.

**Human litmus outcome.**

### Work the same monthly lease group together

**If this was built correctly:** One staff member saves a reviewed monthly list under a useful name. A colleague opens the same leases and sees today's statuses. New qualifying leases appear only after someone reviews and accepts the membership changes; their private discussions stay private.

- Model verdict: ENGINEERING VERIFIED / DELIVERED — all mapped engineering scopes and independent deployment verified in run 5b3dfb90 /780f48db; exact CI, full observation, eleven readbacks and mobile scope are recorded in the native ledger. Human NOT RUN; no customer send was test proof.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement                                            | Architecture outcome | Behavior outcome | Human litmus                               | Deterministic evidence / falsification                                                                                                                                                                                          |
| ------------------------------------------------------ | -------------------- | ---------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S201-1: Create a named reviewed monthly collection   | ARCH-S201-1          | BEH-S201-1       | Work the same monthly lease group together | AC-S201-1: Create from filtered and AI-returned accessible records; inspect reviewed members and recorded date-field/period basis. Reopen as a second scoped user and assert stable lease/cycle IDs and no transcript exposure. |
| R-S201-2: Hold membership stable until explicit review | ARCH-S201-2          | BEH-S201-2       | Work the same monthly lease group together | AC-S201-2: Change underlying qualifying leases, refresh status, reopen and then explicitly refresh membership. Assert unchanged membership until confirmed; incomplete reads show a hold and preserve members.                  |
| R-S201-3: Refresh current status honestly              | ARCH-S201-3          | BEH-S201-3       | Work the same monthly lease group together | AC-S201-3: Advance a member's renewal status, change its cycle, fail one source and revoke access. Assert fresh permitted states, honest coverage and no membership mutation or protected detail.                               |
| R-S201-4: Share only within existing scope             | ARCH-S201-4          | BEH-S201-4       | Work the same monthly lease group together | AC-S201-4: Use permitted staff, an excluded Space actor and guessed collection/member IDs through UI/route/store boundaries; assert no new role/claim and no private conversation content.                                      |
| R-S201-5: Version edits and preserve collaboration     | ARCH-S201-5          | BEH-S201-5       | Work the same monthly lease group together | AC-S201-5: Race two membership edits and a name edit, repeat a confirmation and lose a response. Assert one committed intended version, readable conflict state and zero provider writes.                                       |

**Preservation set.**

Existing renewal filters, lifecycle semantics, current-access and source-coverage checks, private history isolation, exact Sheet/RentVine operation gates and per-lease cycle scoping. No source snapshot is relabeled current.

**Adversarial acceptance checks.**

- **AC-S201-1** — Create from filtered and AI-returned accessible records; inspect reviewed members and recorded date-field/period basis. Reopen as a second scoped user and assert stable lease/cycle IDs and no transcript exposure. This falsifies ARCH-S201-1 / BEH-S201-1 and the named human litmus.
- **AC-S201-2** — Change underlying qualifying leases, refresh status, reopen and then explicitly refresh membership. Assert unchanged membership until confirmed; incomplete reads show a hold and preserve members. This falsifies ARCH-S201-2 / BEH-S201-2 and the named human litmus.
- **AC-S201-3** — Advance a member's renewal status, change its cycle, fail one source and revoke access. Assert fresh permitted states, honest coverage and no membership mutation or protected detail. This falsifies ARCH-S201-3 / BEH-S201-3 and the named human litmus.
- **AC-S201-4** — Use permitted staff, an excluded Space actor and guessed collection/member IDs through UI/route/store boundaries; assert no new role/claim and no private conversation content. This falsifies ARCH-S201-4 / BEH-S201-4 and the named human litmus.
- **AC-S201-5** — Race two membership edits and a name edit, repeat a confirmation and lose a response. Assert one committed intended version, readable conflict state and zero provider writes. This falsifies ARCH-S201-5 / BEH-S201-5 and the named human litmus.

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
