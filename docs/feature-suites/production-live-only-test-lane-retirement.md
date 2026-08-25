<!-- spec-shape: overhaul-v1 -->

# S56 — Production becomes Live-only and the Test lane is retired

> New 2026-08-01 (owner decision). Supersedes the S40 assumption that Production's `data_mode:test`
> records MIGRATE to a Demo project. Owner: "The production instance is supposed to be just live
> data. our local becomes the rehearsal surface. The team is no longer using test data. This is a
> production instance. That's the whole point." The Demo project is deferred
> (`F-DEMO-DEFERRED-LOCAL-FIRST`), so those records have no destination and are DELETED rather than
> moved. Explicitly scoped as a large change, not a hotfix.
>
> **Human-audit amendment 2026-08-19.** HV-001 of run
> `20260817T104500Z-model-audit` found a second residue class that the original S56 catalog could
> not see: 78 records whose values came from committed demo/fixture/smoke sources but whose stored
> mode was Live or unclassified. The owner separately confirmed the exact bodyless manifest and
> exact-confirmed its deletion after a fresh backup and restore proof. This amendment does not make
> names or marker strings deletion authority; it specifies the review, backup-readiness,
> conflict-reconciliation, journal, rollback, and cleanup behavior the permanent S56 tooling lacked.

**Goal.** A record in Production is client data. There is no second lane, no rehearsal records
sitting beside real ones, and no way for an operator or an Admin to create a pretend record in the
environment that serves residents and staff. Rehearsal moves to local, which reads real data
read-only and produces no live effect. When this suite is done, "is this record real?" stops being a
question anyone has to ask in Production, because the answer is structurally always yes.

**What it is / how it functions.** Roughly 85 source files reference `data_mode`, so this is a
subsystem retirement rather than a flag flip. It runs strictly two-stage: make the lane unreachable
and prove nothing depends on it, THEN delete records and code. Nothing here is a single commit.

- **Stage 1a — close the intake.** `app/api/approval-queue/test-fixtures/route.ts` is a live
  Production route that writes `data_mode:"test"` records via `restoreApprovalTestFixtures`. It is
  gated by `requireCapabilityInSpace("manageAdmin","renewals")` and by **no environment gate at
  all** (verified: nothing in `middleware.ts`, `lib/`, or `app/` fences it). Closing this first is
  what makes the record count monotonically non-increasing; deleting records while a route can still
  mint them is a loop, not a migration.
- **Stage 1b — instrument before deleting.** Emit a count of surviving `data_mode:"test"` records per
  collection so the number is observable and trending to zero. A deletion whose scope was never
  measured cannot be verified afterwards.
- **Stage 2 — delete with proof, never migrate.** `lib/operations/migration-dry-run.ts` already
  plans this and refuses on a missing backup, a duplicate, an unnamed record, an ungoverned
  collection, or an unclassified record; `migrationRemovalSet` re-derives classification from source
  records and throws if a Live record appears. **Its semantics change from "move" to "delete", which
  raises the cost of a wrong classification from a misplaced record to a destroyed one.** The
  refusal-on-unclassified behaviour becomes load-bearing rather than conservative.
- **Stage 3 — retire the lane machinery, not the `data_mode` field.**
  `lib/external-execution/orchestrator.ts`'s isolated Test workspace/executors,
  `lib/firestore/approval-test-fixtures.ts`, `lib/publication/test-fixture.ts`, and
  `approval-queue.ts`'s `test_fixture_key` coupling are removed from Production code. The owner
  resolved field retention on 2026-08-01: `data_mode` remains for explicit Live writes and
  fail-closed decoding of legacy evidence. Full field removal is a separate later suite.
- **Rehearsal moves to local, and local must say so.** Local runs Demo + Live-read-only, which S40
  already sanctions as a valid combination. It must resolve the descriptor EXPLICITLY rather than
  falling through to `legacy-node-env`, so `EnvironmentBadge` renders "Live data, read only" and the
  Live-effect fence engages. Local reading real RentVine and Sheet data is intended, not a gap.
- **What replaces the capability.** The team loses in-Production rehearsal. That is the point, but it
  is a real capability being removed, so the suite is not done until local rehearsal is confirmed
  usable for the workflows the fixtures covered.

Buildable now (app-plane): every stage above. Owner dependency: none. Deleting Production records is
an owner-authorized destructive operation already covered by this decision, executed only behind the
dry-run's backup and rollback proof.

**2026-08-19 residual-cleanup continuation.** The permanent S56 script family must keep the original
explicit-`data_mode:"test"` catalog path intact and add a separate, owner-reviewed residual path. It
may reuse the existing pinned Firestore REST, clone, create-only restore, CAS, secure-manifest, and
managed-identity primitives, but it must never silently broaden the automatic Test classifier.

- **Current behavior versus required behavior.** `scripts/retire-production-test-records.ts` safely
  refuses unclassified records. That is correct for automatic retirement, but it left committed
  demo-seed records and fixture/smoke-linked records stamped Live outside the measured set. The
  required path lets deterministic source contracts and marker/link queries nominate a private
  review set; only an owner-confirmed count plus digest turns that set into a deletion manifest.
- **Bodyless review manifest.** The public plan and chat contain collection/category counts and two
  SHA-256 digests only. Exact document names, update times, and full-field hashes remain in a
  mode-`0600` private manifest under the secure temporary root. The operational digest binds ordered
  document name, update time, and full-field hash. A candidate added, removed, or changed after
  confirmation stops the operation before the next effect.
- **Forward path.** Discover → owner review → current managed-identity/deployment/session readback →
  named PITR clone → clone identity and data-plane readiness → N/N hash verification → create-only
  restore rehearsal → exact drill cleanup → final drift/auth check → exact human confirmation →
  one-record update-time-CAS deletes with an atomic journal entry and immediate absence readback →
  independent zero query → four-surface reload. Loading, unavailable, stale, denied, timeout, or
  partial evidence is a blocking state, never an empty or passing state.
- **Return path.** The retained clone is the rollback source. Restore is create-only and writes only
  manifest destinations proven missing; an occupied or changed destination stops without overwrite.
  Every restored field hash must match before rollback can pass. The backup remains deletion-protected
  through the stated rollback window and is removed only by a separately exact-confirmed cleanup with
  database-UID and absence readback.
- **Clone readiness and retry.** A completed clone LRO proves only control-plane completion. The same
  persisted clone operation and destination are polled until the database identity is exact and every
  manifest document is readable and hash-equal. A transient data-plane 400/404/409 never starts a
  second clone. Timeout names one blocker and leaves Production unchanged.
- **Conflict reconciliation.** A database-delete conflict is not evidence that the database is
  absent or deleting. Read back exact database name, UID, ETag, `deleteTime`, and any operation. Only
  exact absence is success; exact same-UID presence without `deleteTime` is no-effect and permits a
  bounded retry; different identity or incomplete readback is ambiguous and stops.
- **No product/runtime broadening.** This is operator tooling and evidence. It creates no Production
  seeder, Test route, browser fixture control, provider effect, or new Action Registry key. The
  already-shipped emulator-only fence in `scripts/demo-firestore-target.mjs` remains load-bearing.

**Open questions & assumptions.**

- _RESOLVED by owner 2026-08-01:_ retain `data_mode` and retire only the Test lane. Removing the
  field touches roughly 85 files without adding safety and belongs to a separate later suite.
- _RESOLVED by owner 2026-08-01:_ "The team has not tested anything." No `data_mode:"test"` record is
  relied on as real, so every one of them is disposable and deletion needs no per-record judgement.
  Stage 1b's count therefore remains as EVIDENCE for the deletion record, not as a gate that waits on
  owner review. The loop does not stop to have the count approved.
- _Assumption:_ no Firestore rule depends on `data_mode`; verified, `firestore.rules` contains zero
  references. Rules therefore need no change, which keeps this suite off the D12 protected path.
- _RESOLVED by owner 2026-08-01:_ local rehearsal needs NO seeded fixture records. Local runs
  Demo + Live-read-only against the real RentVine and Sheet, which is the owner's intended rehearsal
  surface, so the records to rehearse against are the real ones read read-only. Do not build a
  fixture seeder for local; that would recreate the invented-record lane this suite exists to
  retire.
- _RESOLVED by owner 2026-08-19 through HV-001:_ the exact 78-record manifest at owner digest
  `sha256:d508ece8e389366f41df1c33c55dc7449e4da604fb5fcfe43215156b4cbb3786`
  was synthetic residue, despite Live/unclassified stored modes. This decision applies only to that
  confirmed manifest; it is not a reusable marker-based deletion grant.
- _Answered 2026-08-19:_ the rollback clone is retained through audit closure. Its later deletion is
  cleanup of an exact audit-created resource, not implicit permission to delete another database.

**Cross-product impacts.** `app/api/approval-queue/test-fixtures/route.ts`;
`lib/firestore/approval-test-fixtures.ts`; `lib/firestore/approval-queue.ts`;
`lib/firestore/schemas.ts`; `lib/firestore/types.ts`; `lib/firestore/workflows.ts`;
`lib/external-execution/orchestrator.ts`; `lib/publication/service.ts`;
`lib/publication/test-fixture.ts`; `lib/data-mode.ts`; `lib/operations/migration-dry-run.ts`;
`components/layout/EnvironmentBadge.tsx`. Around 85 source files reference `data_mode` in total.
The residual continuation additionally affects the S56 operator script family,
`scripts/demo-firestore.mjs`, `scripts/demo-firestore-target.mjs`,
`tests/unit/retire-production-test-records-script.test.ts`,
`tests/unit/production-test-retirement.test.ts`, and
`tests/unit/demo-firestore-target.test.mjs`. It interacts with S69 for the fresh browser-session
proof required immediately before an exact-confirmed Production effect.

**Adversarial acceptance checks.**

- **AC-S56-1** — before deletion, the test-fixtures route refuses when the descriptor is
  Production+Live, with a test proving the refusal is by ENVIRONMENT and not only by role. Stage 3
  then removes that route and the final sentinel proves it stays absent, so an Admin cannot mint a
  Test record in Production.
- **AC-S56-2** — a count of `data_mode:"test"` records per collection is observable before any
  deletion, and the count is recorded in the evidence for the deletion that follows.
- **AC-S56-3** — the dry-run is re-verified under DELETE semantics: a test asserts a Live record can
  never enter the removal set, and that an unclassified record refuses the whole plan rather than
  being deleted.
- **AC-S56-4** — deletion runs only with a named backup reference and a rehearsed restore, and the
  restore is proven on at least one record before the bulk operation.
- **AC-S56-5** — after deletion, a query proves zero `data_mode:"test"` records remain in every
  governed collection, and the intake route still refuses, so the count cannot climb again.
- **AC-S56-6** — local resolves `environmentKind:"demo"` + `dataContext:"live_readonly"` with
  `source:"explicit"`, the shell renders "Live data, read only", and a test proves no Live effect can
  execute from local.
- **AC-S56-7** — no Production code path can construct a test executor or an isolated Test workspace;
  the provider-boundary sentinel is extended to cover it.
- **AC-S56-8** — retiring the fixture machinery deletes no automated test coverage: the suite's own
  tests continue to exercise the same behaviours through non-fixture paths.
- **AC-S56-9** — the residual path cannot delete from a marker query alone. A deterministic
  nomination produces a private manifest containing exact document names, update times, and
  full-field hashes plus public category counts and owner/operational digests. Mutation refuses until
  the owner exact-confirms the count and owner digest, and it refuses if any current record is
  missing, added, update-time-drifted, or hash-drifted. A unit falsification that changes one field,
  substitutes one path, or supplies the right count with the wrong digest fails before a commit
  client is constructed. _Verify:_ `npm test -- tests/unit/retire-production-test-records-script.test.ts`;
  keep `tests/unit/production-test-retirement.test.ts` green.
- **AC-S56-10** — clone LRO completion is followed by exact source/destination database identity
  readback and bounded data-plane polling until all manifest documents are readable and N/N hashes
  match. A fake transport where the LRO is `done:true` but the first document read returns 400 must
  reuse the same clone and later pass; it must record the readiness retry and issue zero second clone
  requests. Timeout blocks with Production writes/deletes at zero. _Verify:_
  `npm test -- tests/unit/retire-production-test-records-script.test.ts`.
- **AC-S56-11** — restore-drill and backup cleanup classify each delete response by exact resource
  readback. A 409 with same-UID presence and no `deleteTime` records no-effect and permits only the
  bounded exact-UID retry; absence passes; `deleteTime` waits on the recorded operation; a changed
  UID, missing ETag, or contradictory state blocks. No message or helper may translate every 409 to
  "already absent or deleting." _Verify:_
  `npm test -- tests/unit/retire-production-test-records-script.test.ts` with accepted, absent,
  deleting, no-effect-conflict, different-UID, and unavailable readback cases.
- **AC-S56-12** — immediately before deletion, the tool re-verifies managed identity, the exact
  serving Production+Live target, a fresh S69 Admin browser proof, the owner and operational digests,
  N/N source and backup hashes, restore-drill absence, and the exact confirmation phrase. Each
  deletion uses the bound `updateTime`, persists pending intent before the commit, records the commit
  or reconciled effect, and reads the one target absent before advancing. A transport failure is
  reconciled as exact effect or exact no-effect before any retry; mixed or changed state blocks.
  Independent post-delete reads must report 0/N exact records and zero governed residual markers,
  while Console, Approval Queue, and Notifications agree on the remaining genuine decision count and
  Maintenance contains no retired smoke ticket. _Verify:_ focused operator-script unit tests plus an
  authenticated Production bodyless readback; keep `npm run verify:redaction` green.
- **AC-S56-13** — rollback reads only the retained, deletion-protected, exact-UID clone and performs
  create-only writes for missing manifest destinations. Any occupied destination or hash mismatch
  stops without overwrite. After the rollback window closes, backup cleanup requires its own exact
  confirmation, exact UID/ETag, bounded conflict reconciliation per AC-S56-11, and final absence
  readback; until then the response names the retained backup as authorized recovery state rather
  than claiming residue-free cleanup. _Verify:_
  `npm test -- tests/unit/retire-production-test-records-script.test.ts`.

**Forbidden actions / hard gates.**

- Never delete a Production record before the intake route is closed. Deleting while a route can
  still create is a loop that will read as a failed migration.
- Never delete without a named backup reference AND a rehearsed restore. The dry-run's refusals are
  not advisory here: under delete semantics a misclassification destroys client data.
- Never infer that a record is Test because a name, label, or fixture key looks like a test. Only the
  explicit `data_mode` value classifies, and anything else refuses the plan.
- A name/label/source heuristic may nominate a residual for owner review, but it never classifies or
  authorizes deletion. Only the exact owner-confirmed manifest described by AC-S56-9 crosses that
  boundary. Do not weaken the original automatic classifier to make the residual path convenient.
- Never treat control-plane completion as clone data readiness, treat a conflict as deletion, retry
  an ambiguous effect, overwrite a rollback destination, or delete the retained backup as incidental
  cleanup.
- Never remove the Live-effect fence, the Demo/Production separation, or any provider gate as part of
  "simplifying" the lane away.
- Never delete automated tests, security paths, or rollback code alongside the fixture machinery.
- This suite must not touch `firestore.rules` or any other D12 protected path; verified unnecessary.

**Ordered prompt sequence.**

1. _Build:_ fence every Test intake and persistence seam by environment, with tests.
2. _Build:_ make local resolve Demo + Live-read-only explicitly, with the badge and effect fence.
3. _Falsify:_ prove a Live effect cannot execute from local and a Test record cannot be created in
   Production.
4. _Discovery:_ count `data_mode:"test"` records per collection in Production and record it.
5. _Build:_ re-verify the dry-run under delete semantics; create a named backup and rehearse restore
   on one record.
6. _Execute:_ delete from the verified manifest, then independently prove zero remain.
7. _Build:_ retire the fixture machinery in code while retaining `data_mode` and all automated test
   coverage.
8. _Document:_ record counts and bodyless proof only; no record content.

Residual follow-on sequence:

9. _Discovery:_ re-read the HV-001 feedback index, current S56 code/tests, the committed demo source,
   and the sealed bodyless audit evidence; keep the automatic Test classifier unchanged.
10. _Build:_ add the separate secure residual-review manifest and deterministic nomination adapters,
    with owner count+digest confirmation and drift refusals.
11. _Build:_ add clone data-plane readiness polling and exact conflict reconciliation shared by
    backup, restore-drill, and final-cleanup paths.
12. _Build:_ add resumable one-record CAS deletion and create-only rollback journals, including
    ambiguous-effect reconciliation and crash recovery.
13. _Verify:_ falsify field/path/digest drift, LRO-before-data readiness, every cleanup conflict
    class, a lost commit response, a stale browser proof, an occupied rollback destination, and a
    post-delete marker/count mismatch; run the focused tests and full documentation gates.
14. _Context update:_ record only implementation facts after the permanent tooling passes; do not
    rewrite the historical 2026-08-19 deletion as though the new tooling performed it.

**Implementation evidence (2026-08-03).** All eight acceptance checks are complete locally and the
destructive Production steps are verified. **AC-S56-1** was deployed to both reachable services
before the count, and the final route/module sentinel now proves the mutators are absent.
**AC-S56-2** recorded 90 explicit Test records across 28 governed collections. **AC-S56-3** keeps
the delete planner's Live-record and unclassified-record refusals under tests. **AC-S56-4** used
named PITR clone `s56-test-retirement-20260802-233824`; a one-record restore into the named drill
matched the source hash before drill cleanup. **AC-S56-5** deleted exactly those 90 records and a
fresh query proved zero in all 28 collections; a separate exact CAS moved four lane-only
`process_definitions.status:"Testing"` values to `Draft` and read back zero Testing statuses.
**AC-S56-6** resolves local as explicit Demo + Live-read-only, renders the read-only badge, and
refuses effects. **AC-S56-7** removes every Production Test route, executor, fixture panel, and
isolated workspace while retaining legacy decoders only to refuse restored non-Live state.
**AC-S56-8** deletes no automated test file: the prior fixture-named suites were repurposed around
ordinary Live paths and negative absence/refusal sentinels, with focused verification and deliberate
falsification observed. The final full-gate and deployed revision are recorded in `docs/status.md`.

**Human-run evidence (2026-08-19; specification provenance, not implementation completion).** HV-001
owner-confirmed 78 records at the digest in the resolved decision above. A named PITR clone matched
78/78 full-field hashes and was deletion-protected; one create-only restore matched and its drill was
removed. The clone LRO/data-plane gap and a cleanup 409/no-effect gap were safely reconciled. After a
fresh managed/Admin/Production+Live recheck, 78 one-record update-time CAS deletes each read back
absent; an independent read found 0/78 and zero governed markers. Reloaded Console, Approval Queue,
and Notifications each showed one remaining genuine decision, and Maintenance showed zero tickets,
with zero governed markers, alert states, or failed same-origin resources on the four pages. The
protected backup remains intentionally retained through the rollback window. This evidence motivates
AC-S56-9 through AC-S56-13; those criteria remain **specified, not yet built into permanent tooling**.

**Deletion/merge recommendation.** KEEP as the declaration site for **AC-S56-1** through
**AC-S56-13**. A later documentation-only consolidation may merge the durable Live-only outcome into
S40 only after moving every AC declaration without breaking traceability.
