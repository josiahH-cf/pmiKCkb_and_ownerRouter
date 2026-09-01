<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-stabilization-v2 -->

# S30 - one-lease RentVine renewal-write proof

> Status: The closed/fail-first proof runner was first deployed at commit
> `1d68c7fb0a4f3138b9d0ba410d221b44bfb5534c` and remains deployed in current commit
> `fb32194b5a15be11fd1e7e2dff7192d62dd947fc`. Production remains non-executable. The owner has now
> designated the sole target outside Git and authorized S97's temporary exact-key proof window; no secure
> packet, provider write, or live proof has yet been performed.

**Goal.**

Make one exact, reversible lease-end-date proof possible without creating general RentVine write
authority: one managed Admin, one client-designated lease, one `endDate` before/after pair, one
forward attempt, exact readback, one separately confirmed rollback, exact restoration readback, and
mandatory closed-key closeout.

**Current state / intended end state.**

The implementation is complete to the external seam. The only executable proof shape is the
documented lease-update POST for one exact lease `endDate`. The existing recurring-charge client is
not part of S30 execution because no verified exact recurring-charge readback contract exists. The
action `rentvine.lease.renewal_writeback` is still non-executable. S97 now owns the proof: it resolves
the sole owner-designated target from secure execution context, derives the temporary proposed date
as exactly one calendar day after the fresh current `endDate`, binds rollback to the exact current
date, and migrates these safety primitives into S97's exact
`rentvine.lease.renewal_dates.update` proof window. The broad action remains closed throughout and is
retired; it cannot grant or prove the successor action.

**Actors and entry conditions.**

The actor must be an enabled Firebase Auth user whose readback proves the exact UID/email, verified
Google provider, Admin role, Renewals-space scope, and absence of vendor/test-lane claims. Runtime and
confirmation packets must live under gitignored `temp/` or outside the repository. They must bind a
new opaque `s30-<UUID>` proof ref, exact lease id, exact current/proposed/rollback `endDate`, expected
account, actor, phase, execution id, preview hash, and unexpired confirmation. Templates are
intentionally invalid and cannot execute. No client identity or value belongs in Git, arguments,
logs, receipts, or documentation.

**What it is / how it functions.**

1. Parse and validate secure runtime input; refuse tracked or unsafe paths before credential or
   provider access.
2. Read back the exact managed actor and the exact action/runtime state; closed or suspended state
   refuses before writer construction.
3. Read the lease twice around durable execution claiming. Both reads must equal the packet's exact
   current state. Revalidate actor, action, runtime, preview, and confirmation after the first read
   and again after the in-gate read immediately before constructing the writer.
4. Claim one durable forward execution. Construct only the one-lease update writer, issue at most one
   provider call, read back the exact `endDate`, and store a bodyless outcome. Duplicate confirmation
   returns the durable result and cannot issue another write.
5. Treat timeout, abandonment, or uncertain state as ambiguous. Reconciliation may read state after
   the two-minute running window, but it never retries or asserts that matching provider state proves
   this application caused it.
6. Require a new rollback preview, execution id, hash, and confirmation. Issue at most one exact
   rollback call, read back the original value, and record the separate outcome.
7. Close out only when forward and rollback receipts exist, the committed Registry seed is false,
   and live action readback is non-executable. Closeout stores bodyless hashes/refs/states only.

RentVine exposes neither a proven atomic compare-and-set nor provider idempotency token for this
operation. S30 therefore supplies application-level at-most-once claiming and never retries an
ambiguous attempt. Exact state readback proves observed state, not provider causality. Those limits
must remain visible in every live review.

**In scope / out of scope.**

In scope: one lease `endDate`; secure designation; actor/action/runtime readback; immutable
preview/confirmation; at-most-one forward attempt; receipt/readback; ambiguity reconciliation;
separate rollback; bodyless closeout; and mandatory post-proof closed-state proof. Out of scope:
recurring-charge proof, generic endpoints or bodies, a second record, status changes, creating or
deleting charges, bulk work, Sheet writeback, communications, general renewal-write activation, or
authority inferred from S72 process completion.

**Open questions & assumptions.**

No product or authority question remains. The designated target URL is supplied only in the fresh
execution instruction; S97 resolves its exact lease/account/current value and managed Admin at
runtime, generates the secure packet outside Git, and stops on any drift or ambiguity without
substitution. Until those runtime reads and the reviewed proof window exist, only deterministic
fixtures and closed-key refusals run.

**Cross-product impacts.**

S72 may prepare reviewed intent, but S30 independently re-reads source state and authority. The proof
uses the RentVine read/write clients, Action Registry readback, Firebase Auth readback, durable
forward/rollback execution stores, closeout store, incident/reconciliation handling, facts, and
client checklist. It does not change any of those systems' broader authority.

**Authority and evidence map.**

| Input                                                                                    | Classification           | Use and limitation                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md` action inventory, protected paths, live-write policy, and exact-effect rules | Authority                | The exact key is closed; live execution needs a separate designation and owner-directed protected review, and must be previewed, confirmed, at-most-once, receipted, read back, reversible, and closed afterward. |
| Live action readback and `docs/facts.md`                                                 | Present truth            | The action is non-executable and no live proof exists; bound credentials and successful reads do not grant write authority.                                                                                       |
| `rentvine-proof-*`, execution/closeout stores, and proof CLI                             | Implementation truth     | They implement only the secure one-lease `endDate` lifecycle and bodyless outputs.                                                                                                                                |
| S30 unit, Firestore, inventory, suspension, and provider-boundary tests                  | Deterministic evidence   | They prove fail-before-construction behavior, exact binding, temporal freshness, at-most-one calls, ambiguity handling, rollback, and no generic/second-record seam.                                              |
| Owner-designated secure target and 2026-08-31 protected proof direction                  | Product/effect authority | S97 may use them only for one one-day forward/readback/rollback proof under the exact date key while the broad key remains closed; target values never enter Git.                                                 |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S30-1** - The proof boundary exposes only one exact lease `endDate` update. Static/schema
  inventory rejects recurring-charge execution, generic method/path/body, delete, create-charge,
  status, bulk, and second-record operations.
- **ARCH-S30-2** - One forward identity and one separate rollback identity bind actor, account,
  lease, exact before/after value, phase, preview hash, confirmation time, durable claim, provider
  receipt/readback, and closeout without storing client bodies.
- **ARCH-S30-3** - Closed/global/action suspension, wrong actor/account, unsafe or tracked input,
  stale state, stale confirmation, unmatched hash, or missing authority refuses before writer
  construction; freshness is revalidated immediately before that construction.
- **ARCH-S30-4** - One-attempt execution and reconciliation are explicit about the provider's lack of
  atomic compare-and-set/idempotency; ambiguous state cannot trigger a blind retry or false causality
  claim.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S30-1** - With current production authority, preview preparation can stay dry but execution
  returns the exact closed-action refusal with zero writer constructions and zero provider writes.
- **BEH-S30-2** - In deterministic provider fixtures, an unchanged current state and unexpired exact
  confirmation issue at most one forward call, require exact readback, record a bodyless receipt, and
  make duplicate confirmation return the durable outcome without another call.
- **BEH-S30-3** - A separately confirmed rollback issues at most one exact restoration call and
  requires exact original-value readback. Timeout/ambiguous/abandoned execution exposes only
  reconciliation after the bounded running window and never retries.
- **BEH-S30-4** - A changed lease/value/state/actor/account/payload/hash/time, unsupported field,
  second target, tracked packet, suspension, or post-read authority change invalidates execution and
  performs zero provider writes.
- **BEH-S30-5** - Closeout refuses until forward and rollback outcomes are complete and both committed
  seed and live action readback prove non-executable.

**Human litmus outcome.**

### Prove and reverse one exact lease end-date update

**If this was built correctly:** Using only the owner-designated lease under S97, the operator sees
the fresh exact before value, one-day temporary change, and rollback, confirms the forward step once,
sees its receipt and provider readback, separately confirms rollback, sees the original date restored,
and sees the exact action closed. No other record, field, or operation is selectable.

- Model verdict: PASS - The closed-gate implementation and deterministic provider fixtures satisfy
  `ARCH-S30-1..4` and `BEH-S30-1..5`; production action readback is non-executable. The live-effect
  portion is `NOT EVALUATED` because S97 has not yet generated/confirmed the secure runtime packet or
  run the proof.
- Human verdict: PASS | FAIL - why; when no human observer is present, use
  `Human verdict: NOT RUN — no human observer`.

**Requirement-to-outcome traceability.**

| Requirement                                                                              | Architecture outcome       | Behavior outcome         | Human litmus                                           | Deterministic evidence / falsification                                                                                                                    |
| ---------------------------------------------------------------------------------------- | -------------------------- | ------------------------ | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No generic, second-record, recurring-charge, or unsupported proof operation is reachable | `ARCH-S30-1`, `ARCH-S30-3` | `BEH-S30-1`, `BEH-S30-4` | Only one lease `endDate` appears                       | Static inventory, schema, safe-path, suspension, and provider-spy tables reject every expansion and prove refusal before construction.                    |
| One exact confirmed attempt has complete evidence                                        | `ARCH-S30-2`, `ARCH-S30-3` | `BEH-S30-2`, `BEH-S30-4` | Operator sees before/change/receipt/readback           | Contract/service/store tests bind actor, lease, phase, values, hashes, freshness, claim, receipt, and readback; duplicate confirmation cannot call twice. |
| Uncertain effect reconciles without retry or causality overclaim                         | `ARCH-S30-2`, `ARCH-S30-4` | `BEH-S30-3`              | Ambiguity produces recovery, not another change        | Timeout/abandonment fixtures prove no new provider call, bounded-window reconciliation, and explicit observed-state-only language.                        |
| Rollback restores state and closeout proves the key closed                               | `ARCH-S30-2..4`            | `BEH-S30-3`, `BEH-S30-5` | Original value and non-executable action are read back | Separate rollback identity/confirmation/readback tests plus seed/live-action closeout refusal; either missing result fails.                               |

**Preservation set.**

The seven-open/34-closed action inventory, exact account/managed identity, provider method/path/field
allowlists, runtime suspension, existing read-only renewal paths, secret/PII redaction, operating-Sheet
and send prohibitions, current read-only renewal behavior, and all protected files remain a separate green gate.

**Adversarial acceptance checks.**

- **AC-S30-1** - `ARCH-S30-1/3` and `BEH-S30-1/4` prove current Production cannot construct a writer.
- **AC-S30-2** - `ARCH-S30-2/3` and `BEH-S30-2` bind one fixture attempt to exact, fresh evidence and
  prove duplicate confirmation cannot duplicate the effect.
- **AC-S30-3** - `ARCH-S30-2/4` and `BEH-S30-3` prove rollback and ambiguity behavior without retry or
  false causality.
- **AC-S30-4** - `BEH-S30-4` proves temporal authority/confirmation changes after each provider read,
  along with every target/payload/path mismatch, fail before writer construction.
- **AC-S30-5** - `BEH-S30-5` proves closeout needs completed forward/rollback outcomes plus committed
  and live closed-state evidence.
- **AC-S30-6** - Any `production_allowed` change remains a separately owner-directed protected patch;
  this suite, deployment, dry preview, or S72 progress cannot authorize it.

**Forbidden actions / hard gates.**

No live write before exact designation and protected review; no guessed id/endpoint/date/account;
fake/sample identity or record; recurring-charge proof without exact readback; broad route; delete;
new charge; status change; bulk/second-record write; blind retry; personal identity; operating-Sheet
write; client send; client values in Git/output; or claim that observed final state proves causality.

**Dependencies / sequencing.**

The closed implementation is independently complete and deployed. S97 owns its live use and must
generate the exact packet, prove the managed actor and fresh provider/account state, and open only the
reviewed temporary proof window. Any missing or ambiguous runtime stage stops; it never skips forward. S72 can supply
reviewed intent or evidence, but it cannot grant the exact S30 action or substitute for the
fresh S30 reads.

**Standalone delivery contract.**

- **Delivered:** secure exact-input contract; invalid templates; managed-actor proof; one-lease
  `endDate` boundary; immutable phase-specific preview/confirmation; temporal freshness barriers;
  durable at-most-one forward/rollback stores; readback/reconciliation; bodyless closeout; exact
  closed/suspended/mismatch refusal codes; and deterministic tests.
- **Consumes but does not assume:** S72 may offer reviewed intent, while S30 independently re-reads
  actor, action, account, lease state, confirmation, and rollback evidence.
- **Externally blocked effect:** the live portion of AC-S30-2/3/5 waits only on S97's fresh target/
  actor/account/confirmation reads. Missing any runtime prerequisite forbids writer construction;
  owner designation and protected proof authority are already recorded.
- **Produces for downstream operation:** a safe proof command, secure templates, bodyless durable
  evidence, explicit recovery/incident states, and mandatory closed-state closeout. It produces no
  general write authority and no recurring-charge proof.

**Verification and delivery contract.**

1. Focused S30 architecture/behavior/provider/store/suspension tests must pass, including a fail-first
   temporal freshness case and zero-writer assertions for closed, suspended, unreadable, stale, and
   mismatched states.
2. `bash scripts/verify.sh` must pass from a clean install; inspect production-only and complete-tree
   advisory results separately.
3. Audit protected paths, secrets/PII, packet/output paths, target cardinality, method/path/field
   inventory, one-attempt claims, provider limitations, rollback/closeout, action readback, and all
   Sheet/send/read-only preservation boundaries.
4. Push only a green exact commit; release through a zero-traffic candidate with exact identity,
   bounded smoke, normalized configuration parity, promotion, stable readback, and post-release exact
   action readback. Do not deploy later documentation-only edits.
5. Report exactly one loop terminal state: `ALL_GATES_GREEN` only when every in-scope implementation
   gate passes; `BUDGET_EXHAUSTED` only when an explicit execution budget ends, with the exact resume
   pointer and no completion claim; or `BLOCKED` with the missing external prerequisite. Report the
   closed implementation separately from the live proof. After a future live attempt, failure to
   restore/read back the original value or closed action is an incident, not completion.

**Implementation evidence.**

- Focused final S30 set: 22 tests passed, including the captured temporal-freshness red case and its
  repair.
- Canonical gate: 559 unit files passed with one intentional skip; 5,064 tests passed with four
  skips; 26 Firestore files/119 tests; 107-route build; production audit zero vulnerabilities.
- Original commit/CI/release: `1d68c7fb0a4f3138b9d0ba410d221b44bfb5534c`; aggregate run
  `33330420327`; revision `pmi-kc-app-rmtg73suu-fe8734d35330`. Current production carries the same
  closed behavior in `pmi-kc-app-rmtic5vib-8774cfecd0c8`; the exact action reread non-executable.
- No S30 secure proof packet, writer construction, provider mutation, rollback, or client-data effect
  occurred during implementation or release.

**Ordered prompt sequence.**

1. Re-read authority, production action state, managed actor requirements, exact provider mapping,
   and the one-lease `endDate` boundary; define the fail-first falsification before any effect.
2. S97 resolves the owner-designated target and validates the secure phase packet outside Git, then
   produces the exact dry preview and rereads actor, account, runtime suspension, the exact date key,
   and the still-closed broad action.
3. Under S97's recorded protected proof direction, review and verify the temporary patch for only
   `rentvine.lease.renewal_dates.update`; repeat source/action/confirmation freshness checks
   immediately before writer construction.
4. Claim and attempt the forward effect at most once, read back and reconcile without retry, then use
   a new preview and confirmation to claim and attempt the exact rollback at most once.
5. Require original-value restoration plus exact date-key closeout and broad-key non-executable readback;
   otherwise stop as ambiguous/incident and never claim completion.
6. Run focused adversarial tests, the canonical gate, scope/secret/PII/protected-path audit, exact-SHA
   CI, and the human litmus; record only the deterministic terminal state justified by evidence.

**Deletion/merge recommendation.**

Remove only after the one-record live proof and rollback are complete, the exact action is restored
and read back closed, and the durable operating/incident contract is represented in current code,
tests, facts, and provider documentation. A missing human observer is recorded as `NOT RUN` and does
not retain this proof-only suite.
