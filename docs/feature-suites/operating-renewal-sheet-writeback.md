<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: source-of-truth-writeback-v1 -->

# S98 — Operating renewal Sheet append, field updates, and execution integrity

> Status: DEPLOYED PROOF-QUALIFIED BASELINE; CANDIDATE INTEGRITY CORRECTIONS UNPROMOTED.
> The candidate currently permits normal append and refuses field updates. The owner's September 9
> S113 direction requires pre-approved normal in-app field updates; that replacement is implemented locally with actual route/store/claim/receipt acceptance,
> not yet deployed. Historical proofs remain complete and must not run again.

**Goal.**

An authorized operator previews and confirms one server-resolved append or supported field update,
receives an honest result with readback, and can review/correct it without duplicate effects or
guessed targets. S113 owns the new field editor and normal update path under the existing open keys,
using the current S98 execution services.

**Current state / intended end state.**

The serving baseline passed bounded append/field-update proofs. Both exact keys and the operating
write switch remain open; the temporary proof row was deleted and read back absent. Current candidate
code binds append terms to a fresh lease, serializes claims/generations, preserves immutable history,
and refuses normal field update and fixed-row reversal before writer construction.

The owner expressly required in-app existing-row Sheet updates and rejected a new provider
safety-contract prerequisite. S113 F2 replaces that refusal using existing narrow APIs, fresh exact
target/value checks, preview/confirmation, one-attempt claims, receipts/readback and new confirmed
corrections. Do not wait for a hypothetical provider-owned logical-row/idempotency/status/tombstone
protocol or ask for this feature approval again. Documentation does not enable the current code path.

A batch applies atomically, but Google permits collaborator changes. The implementation must detect
observed drift, report ambiguous outcomes and preserve private correction evidence rather than certify
unseen causality or blindly retry. This is not transaction isolation across separate reads.
Reference: <https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate>.

**Actors and entry conditions.**

Managed Renewals-space staff retain existing read/proposal permissions; only current Admin authority
executes external writes. Production + Live, exact key, runtime suspension, operating write switch,
managed Sheets credentials, an unexpired actor-bound proposal and explicit confirmation remain
required. Missing or ambiguous source/row/header evidence affects only the exact action. No role,
claim, key count, identity, scope, cost or provider-proof target changes are implied.

**What it is / how it functions.**

| Exact action/path                            | Current candidate                                                              | Intended contract                                                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| google_sheets.renewal_checklist.row_append   | Normal source-derived append with one-attempt claim and atomic row/note write. | Preserve, including missing-row proof and private readback/correction evidence.                                            |
| google_sheets.renewal_checklist.field_update | Normal field update refuses.                                                   | S113 F2 requires actual supported updates after fresh server resolution, exact preview/confirmation and one-attempt claim. |
| google_sheets.renewal_checklist.writeback    | Retired compatibility key, closed.                                             | Remains closed; no generic range/body route.                                                                               |
| Historical proof / row deletion              | Mutation paths retired/refused.                                                | Remain unavailable; field correction is a new current-state update, not proof replay or deletion.                          |

### Shared target, proposal and execution

- Resolve the configured operating spreadsheet and Lease Renewal tab server-side. Use exact
  lease/property association before field projection. Name/address-only ambiguity, duplicate rows,
  conflicting links and unrecognized/murky headers refuse the specific operation.
- Append only when a fresh one-to-one association proves no row already represents that lease.
  Derive source-backed or exact human-confirmed nonblank fields; never infer renewal date from lease
  end or manufacture a value. Append the row and unique system note together.
- Preserve the note format: PMI KC writeback — operation <opaque id> — lease <provider id> —
  property <provider id>. It is a reconciliation key, not proof of causality after response loss.
- For updates, accept only S113's typed business intent. Derive physical targets, source evidence,
  actor and generation server-side; browser-selected spreadsheet/tab/row/range/proof mode is
  forbidden. Preserve formulas, formatting, identity columns and unsupported fields.
- Bind one active proposal, execution and lease/target claim transactionally. Competing app attempts
  serialize; replacement/discard cannot release a running/ambiguous attempt. Succeeded generations
  remain in immutable lease-scoped history. Existing receipt/status callers stay compatible.
- After exact confirmation, reread authority/identity/header/prior value, make one narrow provider
  attempt and verify returned state against the intended target. Use replaceCellIfExactMatch for
  supported normal fields. Remove the blanket normal-field refusal through S113 implementation.
- Definite pre-effect refusal, definite success, mismatch and ambiguity remain distinct. An uncertain
  response cannot authorize another attempt or produce a success receipt from matching values alone.
  Reconciliation is read-only. Wrong-target/readback discrepancies require explicit review/correction.
- A correction is a newly previewed and confirmed update based on fresh state; prior receipted values
  may be selected. Do not automatically restore historical cells or delete a row.
- Refresh shared source generation with the existing cross-instance post-write barrier before
  displaying renewed truth. Keep raw data and recovery evidence outside Git and ordinary logs.

**In scope / out of scope.**

In scope: shared S98 proposal/claim/attempt/history/readback contracts, retained normal append,
S113 normal-field updates and confirmed corrections, honest recovery and release assurance. The
specific editor and recognized writable business fields are defined in S113 F2.

Out of scope: generic spreadsheet APIs, new keys, bulk/autonomous/model-triggered writes, row
deletion, proof replay, copy-only rehearsal, formulas/formatting changes, invented column mappings,
provider success from observed equality, and a Sheet write proving renewal completion.

**Open questions & assumptions.**

No further product or provider-contract approval is required for normal field updates. Fresh source
association, actual credentials and observed conflicts remain runtime facts. Historical proofs are
neither rerun nor substituted. An app lock or exact-value comparison does not prove collaborator
isolation; failures must report observations without claiming an unavailable provider guarantee.

**Cross-product impacts.**

S113 dashboard/editor, shared S82/S104 association/parity, S97 source reads, S83 access handoffs,
S85/S86 confirmation/feedback, Firestore claims/history and receipts, live-source freshness,
Admin capability presentation, and S51/S54 release assurance.

**Authority and evidence map.**

| Input                                                  | Classification                | Use and limitation                                                                                       |
| ------------------------------------------------------ | ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| AGENTS.md and S113 accepted owner direction            | Authority                     | Normal field updates are required with retained exact-write controls; no new provider-contract approval. |
| Current code/tests, docs/facts.md and version readback | Implementation evidence       | Serving proof-qualified baseline, candidate refusal and unimplemented S113 replacement remain distinct.  |
| Completed S98 receipts                                 | Historical execution evidence | Preserve proof outcomes/retirement; no new proof mutation or causal inference.                           |
| Official Sheets contract                               | Provider evidence             | Atomic batch application and collaborator limits; no invented isolation/idempotency API.                 |
| Fresh lease/Sheet association and headers/values       | Runtime input                 | Resolve/check the specific target; never substitute name-only joins or stale row numbers.                |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S98-1** — Authenticated lease context and fresh server resolution own physical proposal terms.
- **ARCH-S98-2** — Append writes values/note together; normal fields use a typed path to the narrow writer.
- **ARCH-S98-3** — Active generation, execution and lease/target claim bind before one provider attempt.
- **ARCH-S98-4** — Ambiguous reconciliation stays read-only; causal claims never exceed evidence.
- **ARCH-S98-5** — Running/ambiguous generations remain locked; succeeded history stays immutable.
- **ARCH-S98-6** — S113 supported fields reach the writer after retained guards; row deletion and
  historical restore/proof paths remain refused.
- **ARCH-S98-7** — Completed proof code cannot mutate again; receipts remain readable.
- **ARCH-S98-8** — Exact role/key/switch/runtime terms remain conjunctive without reintroducing the
  intentionally superseded normal-field capability prerequisite.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S98-1** — Missing-row leases offer append; matched rows offer supported updates after S113,
  without operator entry of physical targets.
- **BEH-S98-2** — Confirmation makes at most one effect attempt and reports readback, replay, refusal
  or ambiguity honestly, including independent both-destination outcomes.
- **BEH-S98-3** — Observed source/header/identity/value/generation/actor drift prevents stale success;
  readback mismatch requires recovery, not automatic retargeting.
- **BEH-S98-4** — Unknown durable status never defaults to actionable readiness.
- **BEH-S98-5** — Replace/discard cannot strand recovery or erase completed evidence.
- **BEH-S98-6** — Supported field updates and fresh confirmed field corrections execute; deletion
  and historical reversal/proof mutation remain refused. Lost responses never cause blind retry.
- **BEH-S98-7** — The proof is not rerun and its final absent row is not recreated.

**Human litmus outcome.**

### Review, update, and recover the exact operating-Sheet field

**If this was built correctly:** I can add a genuinely missing row or update a supported field from
the lease dashboard, see what happened in each destination, and review an uncertain result without
repeating it. Normal field updates do not end at a permanently disabled button. S113 H3–H5 are the
consolidated human-verification entries for this changed experience.

- Model verdict: PASS | FAIL - why: pending S113 implementation and exact evidence.
- Human verdict: PASS | FAIL - why:

**Requirement-to-outcome traceability.**

| Requirement                            | Architecture           | Behavior             | Deterministic falsification                                               |
| -------------------------------------- | ---------------------- | -------------------- | ------------------------------------------------------------------------- |
| Exact source/target                    | ARCH-S98-1, ARCH-S98-2 | BEH-S98-1, BEH-S98-3 | Forged range, ambiguous names/links, changed header/row/value.            |
| One attempt and honest evidence        | ARCH-S98-3, ARCH-S98-4 | BEH-S98-2            | Claim race, timeout after apply, replay, wrong readback, partial outcome. |
| Durable recovery/history               | ARCH-S98-5             | BEH-S98-4, BEH-S98-5 | In-flight replacement, conflicting history, unknown status labeled ready. |
| Required update and bounded correction | ARCH-S98-6, ARCH-S98-8 | BEH-S98-6            | Refusal-only product, unguarded write, old restore or row delete.         |
| Proof stays retired                    | ARCH-S98-7             | BEH-S98-7            | Any completed proof command reaches mutation.                             |

**Preservation set.**

Keep existing association, append, source/header, generation/claim, ambiguity, archive, freshness,
role/key/runtime, credential/PII and proof-retirement checks separate from new field-update checks.
S113 explicitly replaces blanket normal-field-refusal expectations. Record those amendments and new
acceptance owners; do not weaken unrelated checks. Preserve spreadsheet/tab, eleven Spaces, enabled
switch, 48-key/16-open Registry, historical receipts and unrelated providers.

**Adversarial acceptance checks.**

- **AC-S98-1** — ARCH-S98-1/2 and BEH-S98-1/3 reject physical-target/proof injection. S113 can accept
  typed allowlisted business values/fields; their physical mapping remains server-derived.
- **AC-S98-2** — ARCH-S98-2/4 and BEH-S98-2 cover append content/note/readback, exact field replacement,
  response loss, replay, drift and fresh source generation.
- **AC-S98-3** — ARCH-S98-3/5 and BEH-S98-4/5 cover concurrent claims, cross-lease access, recovery
  locks, generation compare-and-set and immutable succeeded history.
- **AC-S98-4** — ARCH-S98-1 and BEH-S98-3 retain entity-level name/link ambiguity refusal.
- **AC-S98-5** — ARCH-S98-6/8 and BEH-S98-6 prove actual supported normal updates and fresh corrections;
  deletion/historical reversal/proof routes have zero mutation calls.
- **AC-S98-6** — Historical reversal bindings stay parseable but cannot authorize old restores;
  BEH-S98-6 requires a fresh current-state field preview/confirmation for correction.
- **AC-S98-7** — ARCH-S98-5 and BEH-S98-4 retain honest role-filtered SSR/client status and recovery.
- **AC-S98-8** — ARCH-S98-7/8 and BEH-S98-7 prove proof retirement, closed broad key, unchanged exact
  key counts and no bypass outside the explicit S113 contract amendment.
- **AC-S98-9** — Applicable focused, Firestore, canonical/core/browser/CI and exact candidate/
  promotion/readback/observation gates pass before the changed contract is called deployed.

**Forbidden actions / hard gates.**

No arbitrary target, generic key, bulk/autonomous/model-triggered write, row deletion, completed proof
mutation, blind retry, fabricated success receipt or new identity. Preserve live human preview/
confirmation and correction. S113 changes the normal-field requirement, not those boundaries.

**Dependencies / sequencing.**

S113 F2 implements this amendment through existing S98 owners. Preserve candidate append/integrity
corrections and S51/S54 assurance. No second S98 proof or queue run, and no Dotloop, S36 or LeadSimple
dependency is required for normal Sheet updates.

**Standalone delivery contract.**

- **Deliverable now:** reconciled S98 contract preserving current implementation truth and exact
  acceptance identifiers, with S113 owning required new field-update behavior.
- **Consumes, but does not assume:** fresh source/identity/header/value evidence and actual managed
  connection/authority. Missing runtime facts localize the stop; feature authorization is settled.
- **Externally blocked effect:** name an actual unavailable connection/target or unresolved attempt,
  never a new generic provider-contract approval. Independent work continues.
- **Produces for downstream suites:** exact results, durable recovery/history and fresh source state;
  no inference of verified renewal completion.

**Verification and delivery contract.**

Before product edits, pin preservation and new deterministic checks, record intended failing
baselines, and retain S113's consolidated litmus. Run focused and canonical gates, inspect the real
diff and source/PII boundaries, then use exact release acceptance. Report ALL_GATES_GREEN only to the
verified scope; BUDGET_EXHAUSTED only at an actual supplied/platform limit; BLOCKED only for a named
external dependency after independent work. No document edit proves a provider effect.

**Ordered prompt sequence.**

1. Reverify current code and the S113 amendment; pin append/integrity preservation.
2. Implement S113's typed editor/server proposals and normal-field execution through existing owners.
3. Falsify target drift, same-value ambiguity, duplicates, lost responses, partial success and recovery.
4. Align capability/status documentation without changing exact key counts or rerunning proof.
5. Run applicable checks, preserve history and release only through exact readback gates.

**Deletion/merge recommendation.**

Retain this shared execution contract while S113 field updates and release acceptance are unfinished.
Once code/tests/facts own every requirement, retire the narrative to Git without removing proof
evidence or creating a duplicate queue entry.
