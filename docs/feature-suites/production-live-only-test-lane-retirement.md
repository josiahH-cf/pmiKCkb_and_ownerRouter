<!-- spec-shape: overhaul-v1 -->

# S56 — Production becomes Live-only and the Test lane is retired

> New 2026-08-01 (owner decision). Supersedes the S40 assumption that Production's `data_mode:test`
> records MIGRATE to a Demo project. Owner: "The production instance is supposed to be just live
> data. our local becomes the rehearsal surface. The team is no longer using test data. This is a
> production instance. That's the whole point." The Demo project is deferred
> (`F-DEMO-DEFERRED-LOCAL-FIRST`), so those records have no destination and are DELETED rather than
> moved. Explicitly scoped as a large change, not a hotfix.

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
- **Stage 3 — retire the machinery, not just the data.** `lib/external-execution/orchestrator.ts`
  (`isolatedTestWorkspace`, test executors), `lib/firestore/approval-test-fixtures.ts`,
  `lib/publication/test-fixture.ts`, `approval-queue.ts`'s `test_fixture_key` coupling, and the
  `data_mode` field itself across `lib/firestore/schemas.ts` and `types.ts`. Retiring the field is
  the largest and last step and may be deferred: a Live-only Production is already achieved once no
  test record and no test-writing route exist.
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

**Open questions & assumptions.**

- _Open:_ whether `data_mode` is retired entirely or retained as a permanently-`live` vestigial
  field. Retaining it is cheaper and keeps `resolveStoredDataMode`'s fail-safe read behaviour;
  retiring it touches ~85 files. **Recommend retaining the field and deleting only the Test lane**,
  and treating full field removal as a separate later suite.
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

**Cross-product impacts.** `app/api/approval-queue/test-fixtures/route.ts`;
`lib/firestore/approval-test-fixtures.ts`; `lib/firestore/approval-queue.ts`;
`lib/firestore/schemas.ts`; `lib/firestore/types.ts`; `lib/firestore/workflows.ts`;
`lib/external-execution/orchestrator.ts`; `lib/publication/service.ts`;
`lib/publication/test-fixture.ts`; `lib/data-mode.ts`; `lib/operations/migration-dry-run.ts`;
`components/layout/EnvironmentBadge.tsx`. Around 85 source files reference `data_mode` in total.

**Adversarial acceptance checks.**

- **AC-S56-1** — the test-fixtures route refuses when the descriptor is Production+Live, with a test
  proving the refusal is by ENVIRONMENT and not only by role, so an Admin cannot mint a test record
  in Production.
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

**Forbidden actions / hard gates.**

- Never delete a Production record before the intake route is closed. Deleting while a route can
  still create is a loop that will read as a failed migration.
- Never delete without a named backup reference AND a rehearsed restore. The dry-run's refusals are
  not advisory here: under delete semantics a misclassification destroys client data.
- Never infer that a record is Test because a name, label, or fixture key looks like a test. Only the
  explicit `data_mode` value classifies, and anything else refuses the plan.
- Never remove the Live-effect fence, the Demo/Production separation, or any provider gate as part of
  "simplifying" the lane away.
- Never delete automated tests, security paths, or rollback code alongside the fixture machinery.
- This suite must not touch `firestore.rules` or any other D12 protected path; verified unnecessary.

**Ordered prompt sequence.**

1. _Discovery:_ count `data_mode:"test"` records per collection in Production and record it.
2. _Build:_ fence the test-fixtures route by environment, with tests.
3. _Verify:_ full gate, and confirm the count cannot increase.
4. _Build:_ make local resolve Demo + Live-read-only explicitly, with the badge and effect fence.
5. _Falsify:_ prove a Live effect cannot execute from local and a test record cannot be created in
   Production.
6. _Build:_ re-verify the dry-run under delete semantics; rehearse restore on one record.
7. _Execute:_ delete with backup, then prove zero remain.
8. _Build:_ retire the fixture machinery in code, keeping all test coverage.
9. _Document:_ record the deletion evidence, counts only, no record content.

**Deletion/merge recommendation.** KEEP until the lane is gone and Production is provably Live-only,
then MERGE the durable outcome into `docs/feature-suites/environment-deployment-separation.md` (S40)
and delete this file. It carries a retirement, not permanent guidance.
