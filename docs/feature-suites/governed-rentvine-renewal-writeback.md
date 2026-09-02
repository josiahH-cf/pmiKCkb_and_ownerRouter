<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: source-of-truth-writeback-v1 -->

# S97 — Governed RentVine renewal writeback

> Status: COMPLETE and deployed. Closed slice at commit `f2153b00087516cf06c4f9776f2fc3562e146c83` (CI `33583463885`); three serial per-key live proofs passed 2026-09-02 on the owner-designated test lease with receipts, exact readback, duplicate-replay proof, honest ambiguity reconciliation, receipt-bound delete with absence proof, and restores (the update restore hash equals the original creation receipt); protected activation promoted at commit `642269cab5afba563c41ce769541680c04d5c60c` with the mirror read back at 44 keys/ten open. The retired broad identifier stays closed.

**Goal.**

Let an authorized renewal operator write the exact reviewed renewal dates and recurring-charge terms
to RentVine from the canonical lease workspace, with one human-confirmed effect at a time, durable
receipts, exact readback, explicit partial-failure recovery, and no autonomous or bulk mutation.

**Current state / intended end state.**

Current production can read complete lease data and contains a CLI-only S30 proof runner for one
existing lease `endDate`. The reusable transport also represents `increaseEligibilityDate` and three
fields on one existing recurring charge, but those wider operations have no production product route,
typed proposal, complete receipt projection, or live proof. The Action Registry's composite preview
shape does not match either S30 or the real provider payload. The broad
`rentvine.lease.renewal_writeback` key is closed.

The target is a normal product workflow, distinct from S30's proof-and-restore lifecycle. A renewal
proposal is built from fresh RentVine state plus exact human-entered/approved renewal terms, reviewed
in the lease workspace, and executed only through the exact operation key named below. A successful
business update remains applied; reversal is a separately previewed and confirmed correction, not an
automatic S30 closeout.

**Actors and entry conditions.**

- A Renewals-space Editor or higher may assemble and save a proposal but cannot execute a source
  effect merely because the proposal exists.
- Execution requires an authenticated managed `pmikcmetro.com` Admin with Renewals Space access, the
  exact production-allowed operation key, no applicable runtime suspension, fresh provider/account
  readback, and an unexpired exact confirmation. Missing access links to S83's request workflow.
- The live proofs use only the owner-designated real lease supplied outside Git and resolved exactly
  from its owner-provided property anchor plus the matching operating-Sheet row.
  Its secure packet binds the exact account, lease, fresh before state, a temporary one-calendar-day
  `endDate` delta, rollback to the exact original value, actor, evidence reference, and expiry. If any
  designation or state no longer matches, the proof stops and never substitutes another record.

**What it is / how it functions.**

S97 replaces the ambiguous broad action with three exact production capabilities. All path ids are
server-owned positive decimal integers; all requests use the configured account's `/api/manager`
base and strict JSON without extra fields.

| Action Registry key                      | Official write                                        | Exact request and semantics                                                                                                                                                                                                                                                                                                                                                                                                         | Required response/readback                                                                                                                                                                                                                          |
| ---------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rentvine.lease.renewal_dates.update`    | `POST /leases/{leaseID}`                              | Body always includes fresh `startDate` copied unchanged as `YYYY-MM-DD`; it includes changed `endDate` and/or `increaseEligibilityDate` only, each `YYYY-MM-DD` or explicit `null`. At least one editable date must change. `startDate` is not editable and every other lease field is omitted.                                                                                                                                     | Require HTTP 200 wrapper `{lease}` and then independent fresh `GET /leases/{leaseID}`. Readback must match copied start date, changed dates, and preserved omitted state; exact prior dates are reversal input.                                     |
| `rentvine.lease.recurring_charge.create` | `POST /leases/{leaseID}/recurring-charges`            | Required body values are strings: positive canonical decimal `accountID`, `amount` matching `^(?:0\|[1-9]\d*)\.\d{2}$`, exact nonblank `description`, canonical `dayDue` from `"1"` through `"31"`, explicit canonical `frequency` from `"1"` through `"24"`, and real `startDate` as `MM/DD/YYYY`; optional real `endDate` uses `MM/DD/YYYY` and is omitted for open-ended. No provider default or another lease supplies a value. | Require HTTP 200 wrapper `{recurringCharge}` with optional nullable `previousCharge`, a positive string `leaseRecurringChargeID`, and independent detail GET on the returned id. Every normalized submitted field and returned lease/id must match. |
| `rentvine.lease.recurring_charge.update` | `POST /leases/{leaseID}/recurring-charges/{chargeID}` | Body permits only changed `accountID`, `amount`, `description`, `dayDue`, `frequency`, `startDate`, and/or `endDate` with the same string formats. It must be nonempty; null is rejected. Omitted fields retain their fresh detail-GET values. Because the provider has no documented clear value, V1 rejects both dated-to-open-ended and open-ended-to-dated `endDate` transitions: neither has a supported exact inverse.        | Require HTTP 200 wrapper `{recurringCharge}` with optional nullable `previousCharge`, then independent exact detail GET. Every changed field must match and every omitted field must equal the fresh pre-read.                                      |

Discovery may use `GET /leases/{leaseID}/recurring-charges`, but the canonical charge before/after
read is `GET /leases/{leaseID}/recurring-charges/{chargeID}?includes=account`. Its required
`recurringCharge` projection includes string ids/terms `leaseRecurringChargeID`, `leaseID`,
`accountID`, `amount`, `description`, `dayDue`, `frequency`, `startDate`, `isMoveInCharge`, and
`isFromImport`; nullable `endDate`, `nextChargeDate`, `rentIncreaseID`, and `importSourceKey`; and
integer `recurringStatusID` in `1` Current, `2` Future, or `3` Past. Missing, extra-type, conflicting,
or invalid enum data blocks the operation rather than being coerced.

Deletion has no standalone UI or fourth key. The committed exact capability definition for
`rentvine.lease.recurring_charge.create` must explicitly include both its named POST and the paired
receipt-bound reversal `DELETE /leases/{leaseID}/recurring-charges/{chargeID}`; no other key or
category can grant that DELETE. It is reachable only from the original create receipt. A fresh detail read must canonically equal
the receipted app-created projection; a new exact preview/confirmation and claim permits one DELETE.
The HTTP 200 response is the deleted recurring-charge object directly, must match the pre-delete
projection, and is followed by detail not-found plus collection absence of that exact id. Drift or an
ambiguous DELETE permits read-only reconciliation only; it never retries or automatically recreates
the charge. Arbitrary charge deletion, lease creation/deletion, lease status changes, base-rent
guessing, and generic method/path/body execution are not part of S97.

The existing broad `rentvine.lease.renewal_writeback` entry remains closed and becomes a
non-executable retired compatibility identifier. S97 reuses S30's claim/readback/rollback safety
primitives but never opens the broad key; it cannot grant or prove any of the three exact keys above.

**In scope / out of scope.**

In scope: typed proposal and source mapping; exact operation previews; normal product execution;
per-effect claims/receipts/readback; separately confirmed reversal; response-loss reconciliation;
workspace status/action links; protected per-key activation; S30 proof reuse; retirement of the
superseded multi-record proof machinery; removal of the synthetic composite RentVine executor from production reachability;
and current-doc/governance reconciliation.

Out of scope: arbitrary RentVine fields, new leases, lease status transitions, transaction charges or
payments, bulk actions, vendor/work-order operations, RentVine messages, Sheet effects, Dotloop,
LeadSimple, autonomous execution, model-triggered execution, or client-facing sends.

**Open questions & assumptions.**

No product decision remains open. Runtime values are deliberately supplied at execution: a proposal
must contain the actual approved dates/charge terms and exact current provider identifiers. The
proof target arrives through the fresh-context owner instruction or an equivalent secure
untracked packet and is never committed.

**Cross-product impacts.**

Canonical renewal workspace and evidence projection; S80/S83 role and request matrices; Action
Registry seed/preview schemas/gates; RentVine transport; S30 proof lifecycle; Firestore attempts,
receipts, and renewal evidence; S82 action/link presentation; S86 feedback/recovery; S91 read-only
assistant evidence; cache invalidation; runtime suspension; Admin action status; integration and
environment documentation.

**Authority and evidence map.**

| Input                                                                      | Classification                   | Use and limitation                                                                                                                                                          |
| -------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Router, current code/tests, live readback, and `docs/facts.md`             | Authority / implementation truth | Establish the currently closed broad key, S30's one-field proof, managed identity, one-attempt ambiguity rule, and current provider/account state.                          |
| Owner decisions of 2026-08-31                                              | Product/effect authority         | Authorize all renewal-relevant RentVine writeback, the designated ended lease proof, protected per-key activation after gates, and cloud mutation; not a generic API grant. |
| Current official RentVine OpenAPI contract at `https://docs.rentvine.com/` | Provider contract                | Establish the exact lease and recurring-charge POST/GET fields. Snapshot/hash the consumed operations in tests; do not infer undocumented semantics or idempotency.         |
| Fresh provider state and exact operator-entered/approved proposal          | Runtime authority                | Supplies customer values and identifiers. Missing, stale, conflicting, or unmapped values block only that operation.                                                        |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S97-1** — One versioned server proposal schema binds actor, role/Space, lease, provider
  account, operation key, exact before/after fields, source evidence/version, reversal payload,
  preview hash, confirmation expiry, and one opaque attempt identity. Caller-supplied paths, methods,
  account hosts, and fields are structurally unreachable.
- **ARCH-S97-2** — The Action Registry, preview schemas, role/effect matrix, UI, transport, receipts,
  and tests use the same three-key field matrix. Static inventory fails on the retired broad key in
  production reachability or on the old `{current_rent,new_rent,effective_date,lease_end_date,fee_cents}`
  composite shape.
- **ARCH-S97-3** — Every provider POST has an application-level claim-before-call ledger and at most
  one provider attempt. RentVine exposes no proven provider idempotency or compare-and-set token;
  timeout/5xx/invalid-response/claim uncertainty therefore becomes `ambiguous` and never retries.
- **ARCH-S97-4** — Provider receipt persistence precedes the idempotent app-evidence projection.
  Provider success followed by projection failure remains a successful provider effect needing
  projection reconciliation; it never triggers another provider write or automatic reversal.
- **ARCH-S97-5** — A multi-field proposal is expanded into ordered effects: lease dates, existing
  charge updates, then new charges. Each effect has its own preview, confirmation, claim, receipt, and
  state. The first failure/ambiguity stops later effects; no cross-request or cross-source atomicity is
  claimed.
- **ARCH-S97-6** — Superseded multi-record commands, templates, stores, reports, tests, and active documentation
  are removed after dependency inventory proves no generic source reader/evidence utility is lost.
  S30's reusable safety primitives remain; its proof-only CLI/closeout is not exposed as the product
  route.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S97-1** — The lease workspace shows `Review RentVine updates` only when a typed proposal has at
  least one change. Preview shows exact source, target, before/after values, independent effects,
  reversal availability, and any missing input; preview performs zero writes.
- **BEH-S97-2** — Confirming one exact effect once issues at most one allowlisted POST, requires exact
  provider readback, records a bodyless receipt, invalidates the affected live lease cache, and projects
  `source-write-receipt` without marking unrelated renewal steps complete.
- **BEH-S97-3** — Duplicate confirmation returns the durable outcome. Stale provider state, actor,
  role/Space, action state, source version, preview, value, charge id, account, confirmation, or runtime
  state refuses before writer construction.
- **BEH-S97-4** — An ambiguous attempt shows `Needs reconciliation`, the last known before/after
  observations, and no Retry control. Reconciliation may report before, after, or drift but never claims
  causality from matching data alone.
- **BEH-S97-5** — Reversal requires a new exact preview and confirmation. Date reversal restores the
  receipted prior fields; an existing-charge update is offered only when every changed field has a
  supported exact inverse and restores that prior record; created-charge reversal may delete only the
  exact unchanged receipt-bound charge. Drift refuses automatic reversal and links to manual review.
- **BEH-S97-6** — Each exact key has its own bounded proof window and no key inherits evidence from a
  sibling or the retired broad key. The date proof changes only the designated lease `endDate` by the
  owner-authorized one-day delta and separately restores it. Create and update proofs use only that
  same designated lease plus exact source-backed, staff-confirmed charge terms supplied securely at
  execution; create is separately deleted unchanged, while update separately restores its exact prior
  reversible fields. If either safe charge proposal or target is absent, that exact key remains blocked
  rather than inventing values. Every proof key is closed/read back before the next window, and final
  activation opens only keys whose own deterministic and live gates passed.

**Human litmus outcome.**

### Review and apply one renewal source update

**If this was built correctly:** An authorized user opens a lease, reviews exactly what RentVine will
change, confirms one effect, and sees a receipt-backed success or an honest recovery state. Nothing
else changes. The user can separately review a reversal. An unauthorized user can request access but
cannot execute the write.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why; when no human observer is present, use `Human verdict: NOT RUN — no human observer`.

**Requirement-to-outcome traceability.**

| Requirement                                            | Architecture outcome                     | Behavior outcome         | Human litmus                                    | Deterministic evidence / falsification                                                                                         |
| ------------------------------------------------------ | ---------------------------------------- | ------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Exact supported field/key matrix                       | `ARCH-S97-1`, `ARCH-S97-2`               | `BEH-S97-1`, `BEH-S97-3` | Preview contains only supported changes         | Schema/static/provider-spy matrices reject every other key, route, method, field, and caller-supplied target.                  |
| One-attempt receipt/readback and projection            | `ARCH-S97-3`, `ARCH-S97-4`               | `BEH-S97-2`, `BEH-S97-4` | Success or recovery is truthful                 | Claim races, duplicate confirmation, timeout, response loss, receipt loss, and projection-failure fixtures prove no retry.     |
| Ordered partial effects and independent reversal       | `ARCH-S97-5`                             | `BEH-S97-4`, `BEH-S97-5` | User can explain what did and did not happen    | Failure at every effect boundary proves later effects stop and reverse order remains separately confirmed.                     |
| Per-key proof and exact protected activation           | `ARCH-S97-2`, `ARCH-S97-3`, `ARCH-S97-6` | `BEH-S97-6`              | Test target returns to its exact original state | Secure-packet, per-key provider readback, reversal, closeout, release, and post-release key inventory evidence all must agree. |
| Retire superseded multi-record and composite machinery | `ARCH-S97-2`, `ARCH-S97-6`               | `BEH-S97-1`, `BEH-S97-6` | No obsolete run or duplicate write UI remains   | Import/reference/package/docs inventory fails on legacy-proof-only reachability or the synthetic composite product executor.   |

**Preservation set.**

RentVine/read-only renewal behavior, S72 process/evidence meaning, S74/S77 unsent-draft boundary,
S78/S82 identity and query contracts, S80/S83 access separation, S86 recovery, S30 one-attempt
primitives, runtime suspension, exact account/managed identities, seven currently open keys until
activation, no-send rules, cache/source truth, secrets/PII hygiene, and all unrelated provider keys.

**Adversarial acceptance checks.**

- **AC-S97-1** — Matrix tests freeze each official method/path, request wire type/date/decimal rule,
  response wrapper, exact detail/list readback, omitted-field behavior, both unsupported existing-
  charge `endDate` nullability transitions, and the create key's receipt-bound DELETE reversal;
  generic, extra-field, arbitrary-delete, and second-record operations refuse before provider
  construction.
- **AC-S97-2** — Concurrency/duplicate/stale-state tests prove one claim and at most one POST per effect.
- **AC-S97-3** — Failure injection at claim, provider, readback, receipt, projection, and reversal proves
  honest partial/ambiguous recovery with no blind retry or automatic compensation.
- **AC-S97-4** — Browser/route/role tests prove proposers, executors, access-request handoff, exact
  confirmation, focus/error/status behavior, and no process-completion inference.
- **AC-S97-5** — Each secure exact-key live proof, exact reversal/correction, key closeout, protected
  activation diff, zero-traffic release, and stable action readback passes without emitting customer
  values; no broad or sibling proof is accepted.
- **AC-S97-6** — Complete-tree inventory proves legacy-proof-only machinery and old composite production
  execution are gone while generic read/evidence paths and S30 safety primitives remain green.

**Forbidden actions / hard gates.**

No execution while its exact key is closed; no generic/bulk/second-record operation; no editable
`startDate`; no arbitrary deletion; no guessed account, identifier, field, date, amount, charge
mapping, or source; no retry after ambiguity; no automatic cross-effect rollback; no app/model-
triggered effect; no personal identity; no customer values in Git/logs; no client send; and no claim
that proposal, process position, provider response, or matching readback alone proves success.

**Dependencies / sequencing.**

S97 runs after S82 and consumes S83 access, S85/S86 presentation, S72/S78/S80 renewal truth, and the
deployed S30 safety primitives. S98 consumes its canonical lease/source receipt identity. S91/S87
must consume S97's final read-only status/link surfaces. Dotloop and LeadSimple remain later work.

**Standalone delivery contract.**

- **Deliverable now:** closed-gate product architecture, exact three-key matrix, proposal/route/UI,
  transport expansion, receipts/projection/recovery/reversal, legacy-proof retirement, deterministic tests,
  and a deployed closed-state slice.
- **Consumes, but does not assume:** proposal values and charge identifiers are runtime inputs;
  missing values produce an exact blocked effect without blocking unrelated renewal work.
- **Externally blocked effect:** only an exact live proof is blocked if the secure designated target,
  managed Admin session, credentials, or safe source-backed/staff-confirmed recurring-charge proposal
  needed by that key cannot be read. All code and closed-state release work completes first; no
  substitute record or value is chosen and sibling keys do not inherit proof.
- **Produces for downstream suites:** exact source-effect keys, proposal/receipt/status contracts,
  renewal evidence links, and retired legacy-proof/current-doc state.

**Verification and delivery contract.**

1. Freeze current S30/transport/registry/product-route truth and materialize failing matrix, product
   proposal, projection, partial-failure, and legacy-proof-retirement checks before implementation.
2. Implement and release the complete code slice with all new keys false. Run focused tests,
   `bash scripts/verify.sh`, `npm run test:e2e:core`, secret/PII/protected-path/effect/diff audits, exact-
   SHA CI, zero-traffic smoke, promotion, and stable closed-key readback.
3. Validate the secure owner-designated target outside Git. Keep the retired broad key closed. In a
   protected window, open only `rentvine.lease.renewal_dates.update`, perform the one-day `endDate`
   forward call and separately confirmed rollback, prove exact restoration, then close/read back that
   key. Stop as an incident if restoration or closeout cannot be proved.
4. In separate protected windows, open only `rentvine.lease.recurring_charge.create`, then only
   `rentvine.lease.recurring_charge.update`. The create proof requires exact source-backed,
   staff-confirmed terms, exact readback, a separately confirmed receipt-bound DELETE of the unchanged
   proof charge, and absence readback. The update proof requires a fresh existing charge, one exact
   staff-confirmed reversible field delta, exact readback, separate restoration, and final exact
   readback. Close/read back each key before the next window. Missing safe runtime input blocks only
   that key; it never permits a substitute or an irreversible `endDate` transition.
5. Apply the owner-authorized protected activation patch separately for each S97 key whose own proof
   and remaining gates passed, rerun canonical gates and exact-SHA CI, release through a new zero-
   traffic candidate, and read back code revision, runtime, roles, suspensions, retired broad-key state,
   and exact per-key state. Roll back the release if any invariant fails.
6. Record one terminal: `ALL_GATES_GREEN`, `BUDGET_EXHAUSTED` only with an explicit budget, or
   `BLOCKED` only after all independent closed-safe work is green and one exact external prerequisite
   is unavailable.

**Ordered prompt sequence.**

1. Re-read current S30, provider OpenAPI, registry overlays, product proposal gaps, live target state,
   and protected-key authority; freeze fail-first and preservation evidence.
2. Build the closed exact-key/product proposal/execution/receipt/reversal slice and retire legacy-proof-only
   machinery without exposing any key.
3. Falsify every operation, race, partial failure, recovery, role, and projection path; ship the
   closed candidate and prove current production invariants.
4. Run the date, create, and update proofs serially under the secure owner designation, opening only
   the exact key under proof and closing/read backing it after its separately confirmed reversal.
5. Review, test, deliver, and read back only each exact key's independently qualified activation
   patch; update current docs and downstream manifests to observed truth.

**Deletion/merge recommendation.**

After S97 is deployed and its three exact keys/readbacks are represented in current code, tests, and
facts, remove the active S30 suite narrative while preserving reusable safety contracts and durable
receipts. Git retains proof provenance.
