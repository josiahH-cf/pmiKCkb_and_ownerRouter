<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: source-of-truth-writeback-v1 -->

# S97 — Governed RentVine renewal writeback

> Status: Baseline COMPLETE and deployed. Closed slice at commit
> `f2153b00087516cf06c4f9776f2fc3562e146c83` (CI `33583463885`); three serial
> per-key live proofs passed 2026-09-02 on the owner-designated test lease with receipts, exact
> readback, duplicate-replay proof, honest ambiguity reconciliation, receipt-bound delete with
> absence proof, and restores (the update restore hash equals the original creation receipt);
> protected activation promoted at commit `642269cab5afba563c41ce769541680c04d5c60c` with the
> then-current mirror read back at 44 keys/ten open. The current registry is 48 keys/16 open. The
> retired broad identifier stays closed. A current integrity remediation adds generation-bound
> replay, fresh duplicate verification, and fail-closed ambiguous-create handling; it is
> implemented in the working tree but remains unreleased until the current S51/S54 gate passes.

**Goal.**

Let an authorized renewal operator write the exact reviewed renewal dates and recurring-charge terms
to RentVine from the canonical lease workspace, with one human-confirmed effect at a time, durable
receipts, exact readback, explicit partial-failure recovery, and no autonomous or bulk mutation.

**Current state / intended end state.**

Production has the normal S97 product workflow and all three exact action keys below are proven,
activated, deployed, and executable. A renewal proposal is built from fresh RentVine state plus exact
human-entered or approved terms, reviewed in the lease workspace, and executed only through its exact
operation key. A successful business update remains applied; reversal is a separately previewed and
confirmed correction. The completed proof windows are closed and must not be rerun or assigned a new
target. The broad `rentvine.lease.renewal_writeback` compatibility key remains closed and retired.
The active unreleased correction does not repeat a proof or widen a key: it closes replay and
ambiguous-create attribution gaps in the normal product path.

**Actors and entry conditions.**

- A Renewals-space Editor or higher may assemble and save a proposal but cannot execute a source
  effect merely because the proposal exists.
- Execution requires an authenticated managed `pmikcmetro.com` Admin with Renewals Space access, the
  exact production-allowed operation key, no applicable runtime suspension, fresh provider/account
  readback, and an unexpired exact confirmation. Missing access links to S83's request workflow.
- The owner-designated proof lease and proof windows are historical completed evidence, not an entry
  condition for normal product use. Never rerun them or substitute another record.

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
workspace status/action links; exact per-key activation; retired-S30 safety primitives; retirement of the
superseded multi-record proof machinery; removal of the synthetic composite RentVine executor from production reachability;
and current-doc/governance reconciliation.

Out of scope: arbitrary RentVine fields, new leases, lease status transitions, transaction charges or
payments, bulk actions, vendor/work-order operations, RentVine messages, Sheet effects, Dotloop,
LeadSimple, autonomous execution, model-triggered execution, or client-facing sends.

**Open questions & assumptions.**

No product decision remains open. Runtime values are deliberately supplied for each normal execution:
a proposal must contain the actual approved dates or charge terms and exact current provider
identifiers. Completed proof targets and receipts are not reusable execution authority.

**Cross-product impacts.**

Canonical renewal workspace and evidence projection; S80/S83 role and request matrices; Action
Registry seed/preview schemas/gates; RentVine transport; retired-S30 safety primitives; Firestore attempts,
receipts, and renewal evidence; S82 action/link presentation; S86 feedback/recovery; S91 read-only
assistant evidence; cache invalidation; runtime suspension; Admin action status; integration and
environment documentation.

**Authority and evidence map.**

| Input                                                                      | Classification                   | Use and limitation                                                                                                                                                          |
| -------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Router, current code/tests, live readback, and `docs/facts.md`             | Authority / implementation truth | Establish the three exact open keys, retired broad key, managed identity, one-attempt ambiguity rule, and current provider/account state.                                   |
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
- **ARCH-S97-7** — A create proposal captures the exact canonical ids/hashes of every currently
  matching charge and revalidates that baseline immediately before claim and again inside the action
  gate. RentVine exposes no provider-owned idempotency or attempt receipt that can attribute a newly
  observed matching charge to a lost response, so every ambiguous create remains unproven and cannot
  mint a success receipt or receipt-bound delete authority. Forward execution identity includes the
  exact proposal generation; legacy records are accepted only when their stored context hash matches
  it. Every duplicate success rereads the provider after-state, and every reversal preview/confirmation
  binds the exact resolved forward execution, effect, receipt, expiry, and reversal kind.

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
  causality from matching data alone. For recurring-charge create, any newly observed matching charge
  remains drift/unproven and cannot become a causal receipt.
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
- **BEH-S97-7** — A pre-existing identical charge, any newly observed matching charge after an
  ambiguous create, changed baseline, missing baseline on a legacy create proposal, stale duplicate
  receipt, different proposal generation, or cross-forward reversal token fails closed. No such state
  can produce a causal create receipt or authorize deletion.

**Human litmus outcome.**

### Review and apply one renewal source update

**If this was built correctly:** An authorized user opens a lease, reviews exactly what RentVine will
change, confirms one effect, and sees a receipt-backed success or an honest recovery state. Nothing
else changes. The user can separately review a reversal. An unauthorized user can request access but
cannot execute the write.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why; when no human observer is present, use `Human verdict: NOT RUN — no human observer`.

**Requirement-to-outcome traceability.**

| Requirement                                            | Architecture outcome                     | Behavior outcome                      | Human litmus                                      | Deterministic evidence / falsification                                                                                                                             |
| ------------------------------------------------------ | ---------------------------------------- | ------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Exact supported field/key matrix                       | `ARCH-S97-1`, `ARCH-S97-2`               | `BEH-S97-1`, `BEH-S97-3`              | Preview contains only supported changes           | Schema/static/provider-spy matrices reject every other key, route, method, field, and caller-supplied target.                                                      |
| One-attempt receipt/readback and projection            | `ARCH-S97-3`, `ARCH-S97-4`               | `BEH-S97-2`, `BEH-S97-4`              | Success or recovery is truthful                   | Claim races, duplicate confirmation, timeout, response loss, receipt loss, and projection-failure fixtures prove no retry.                                         |
| Ordered partial effects and independent reversal       | `ARCH-S97-5`                             | `BEH-S97-4`, `BEH-S97-5`              | User can explain what did and did not happen      | Failure at every effect boundary proves later effects stop and reverse order remains separately confirmed.                                                         |
| Per-key proof and exact protected activation           | `ARCH-S97-2`, `ARCH-S97-3`, `ARCH-S97-6` | `BEH-S97-6`                           | Test target returns to its exact original state   | Secure-packet, per-key provider readback, reversal, closeout, release, and post-release key inventory evidence all must agree.                                     |
| Retire superseded multi-record and composite machinery | `ARCH-S97-2`, `ARCH-S97-6`               | `BEH-S97-1`, `BEH-S97-6`              | No obsolete run or duplicate write UI remains     | Import/reference/package/docs inventory fails on legacy-proof-only reachability or the synthetic composite product executor.                                       |
| Create causality, replay, and reversal binding         | `ARCH-S97-3`, `ARCH-S97-7`               | `BEH-S97-4`, `BEH-S97-5`, `BEH-S97-7` | No old or unrelated charge can be claimed/deleted | Pre-existing-identical, response-loss, changed/multiple-match, stale-duplicate, fresh-generation, legacy-context, and cross-forward reversal fixtures fail closed. |

**Preservation set.**

RentVine/read-only renewal behavior, S72 process/evidence meaning, S74/S77 unsent-draft boundary,
S78/S82 identity and query contracts, S80/S83 access separation, S86 recovery, S30 one-attempt
primitives, runtime suspension, exact account/managed identities, the current 48-key/16-open registry,
no-send rules, cache/source truth, secrets/PII hygiene, and all unrelated provider keys.

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
- **AC-S97-7** — Create ambiguity tests seed an identical charge before proposal, inject response
  loss, and prove reconciliation and reversal both refuse. Separate fixtures prove even one newly
  matching absent id stays unproven, provider drift invalidates duplicate success, a fresh identical
  proposal after external restoration receives a new attempt identity, legacy fallback requires exact
  context, and a reversal token cannot cross proposal generations.

**Forbidden actions / hard gates.**

No execution while its exact key is closed; no generic/bulk/second-record operation; no editable
`startDate`; no arbitrary deletion; no guessed account, identifier, field, date, amount, charge
mapping, or source; no retry after ambiguity; no automatic cross-effect rollback; no app/model-
triggered effect; no personal identity; no customer values in Git/logs; no client send; and no claim
that proposal, process position, provider response, or matching readback alone proves success.

**Dependencies / sequencing.**

S97 runs after S82 and consumes S83 access, S85/S86 presentation, S72/S78/S80 renewal truth, and the
retained one-attempt/readback safety primitives first established by retired S30. S98 consumes its canonical lease/source receipt identity. S91/S87
must consume S97's final read-only status/link surfaces. Dotloop and LeadSimple remain later work.

**Standalone delivery contract.**

- **Delivered:** exact three-key matrix, proposal/route/UI, transport, receipts, projection,
  recovery/reversal, retired broad-key posture, deterministic tests, completed per-key proofs, and
  activated production paths.
- **Consumes, but does not assume:** proposal values and charge identifiers are runtime inputs;
  missing values produce an exact blocked effect without blocking unrelated renewal work.
- **Externally blocked effect:** none for S97 delivery. Normal operations can still refuse on missing
  actor authority, source values, provider state, runtime suspension, or exact confirmation; that is
  expected per-operation safety, not an instruction to rerun a proof.
- **Produces for downstream suites:** exact source-effect keys, proposal/receipt/status contracts,
  renewal evidence links, and retired legacy-proof/current-doc state.

**Verification and delivery contract.**

1. Preserve the exact key/field/method matrix, one-attempt behavior, receipt/readback, correction,
   actor, runtime-suspension, and no-send tests in every affected change.
2. Keep the three exact keys and retired broad key aligned across the registry, route, UI, provider
   transport, and current docs; a runtime flag or historical receipt grants nothing independently.
3. Release changes through the normal exact-SHA, zero-traffic candidate, managed assurance,
   promotion, and readback gates. Do not rerun any S97 proof window.
4. Specify any new RentVine method, field, or product operation under a new exact contract and key;
   never broaden or repurpose the completed S97 proof.

**Ordered prompt sequence.**

1. Reconcile the current three-key implementation, normal proposal lifecycle, and provider codecs
   against this contract without rerunning any completed live proof.
2. Run the focused S97 schema, route, concurrency, ambiguity, reversal, projection, and static-
   inventory falsification, followed by every preservation test named above.
3. Run the canonical verifier, exact-SHA CI, zero-traffic candidate smoke and assurance, exact
   promotion, observation, and live configuration/version readback.
4. Report exactly one terminal state: `ALL_GATES_GREEN` only when every applicable deterministic and
   release gate passes; `BUDGET_EXHAUSTED` only when an explicit execution budget is actually
   exhausted; or `BLOCKED` only when one exact required runtime input or authority remains unavailable
   after unrelated in-scope work is complete. Never substitute a proof target or relax a hard gate.

**Deletion/merge recommendation.**

Keep S97 as the current product contract. S30 is retired and should not remain an active execution
dependency; Git retains its proof provenance while current code, tests, facts, and this contract own
normal S97 behavior.
