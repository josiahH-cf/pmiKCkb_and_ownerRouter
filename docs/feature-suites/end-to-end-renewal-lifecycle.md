<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-completion-v1 -->

# S105 — End-to-end renewal lifecycle closure

> Status: IMPLEMENTED / UNRELEASED, except the Dotloop phase link, which waits on S106 and S34. The
> typed owner outcome, its reopening and exit routing, the version-binding audit, and the lifecycle
> and branch proofs are in place through the existing paths. Production still serves the S72
> baseline without typed owner outcomes.

**Goal.**

An eligible fixed-term lease moves through verification, owner decision, tenant offer, document
packet, source updates, communication, and completion without hidden state repair, duplicate
external work, or a completion claim that lacks evidence.

**Current state / intended end state.**

| Package requirement (PMI-04)                            | Classification    | Evidence                                                                                                                                                                                                                              |
| ------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One visible lifecycle with project-native phases        | Already satisfied | `lib/lease-renewal/renewal-process.ts` steps `verify-renewal`, `owner-decision`, `tenant-decision`, `document-packet`, `signatures-follow-up`, `compliance-close` with evidence-derived substeps                                      |
| No proposal or external work before verification clears | Already satisfied | Substeps `verify-base-rent`, `resolve-source-conflicts`, `confirm-source-currency`; S82 blocker precedence                                                                                                                            |
| Distinct owner outcomes                                 | Already satisfied | `RenewalOwnerOutcome` types `approved_terms`, `revision_requested`, `declined_non_renewal`, and `no_response` on the existing `record-owner-response` evidence, with `planRecordOwnerOutcome` and the `owner_outcome` progress action |
| Downstream work bound to the current proposal version   | Already satisfied | `ownerDecisionRevision`, S97 proposal generation claims (`lib/firestore/s97-renewal-writeback-claim.ts`), S98 lease-scoped claim, S66 packet snapshot hash                                                                            |
| Dotloop packet phase                                    | Missing           | `document-packet` substep `read-back-document-packet` still has no provider; S106 and S34 deliver it. The absent state is already a visible blocker with its exact next action, proved here                                           |
| Reuse RentVine, Sheet, approval, messaging paths        | Already satisfied | S97, S98, approval queue, `gmail.renewal_notice.draft_create`                                                                                                                                                                         |
| Safe retries, one effective result per version          | Already satisfied | One-attempt claims, receipts, readback, reconcile (`docs/integration-architecture.md` effect model)                                                                                                                                   |
| Uncertain external result stays in reconciliation       | Already satisfied | `ambiguous` execution state and reconcile operations in S97/S98/S99                                                                                                                                                                   |
| One lease's blocker never blocks another                | Already satisfied | Per-lease progress, claims, and guidance                                                                                                                                                                                              |
| Completion only when required steps are complete        | Already satisfied | `record-app-completion` requires every required item Verified or Not Applicable                                                                                                                                                       |

Intended end state: typed owner outcomes, the Dotloop phase wired to S34's packet state, and one
fixture-driven lifecycle proof that exercises every branch through the owning services.

**Actors and entry conditions.**

Renewal operator (Editor or higher, Renewals Space) for app-owned progress; Admin for S97/S98
effects and approvals; a person sends every draft from Gmail. Entry requires one Live lease with a
current source snapshot and a clear verification phase.

**What it is / how it functions.**

1. **Owner outcome vocabulary.** Extend the `owner-decision` step's `record-owner-response` evidence
   with a typed `ownerOutcome`: `approved_terms` (carries the existing decision and values),
   `revision_requested`, `declined_non_renewal`, `no_response`. `approved_terms` advances;
   `revision_requested` reopens `prepare-owner-copy` onward and invalidates downstream previews;
   `declined_non_renewal` routes to the existing `record-non-renewal-handoff` exit; `no_response`
   stays `Waiting` on the owner with the S75 waiting projection.
2. **Version binding audit.** Add one test that changes owner terms after a tenant draft, a Dotloop
   binding, and an S97 proposal exist and asserts each downstream artifact reports stale and cannot
   execute.
3. **Dotloop phase.** `document-packet` consumes S34's packet execution state
   (`Provider pending` → `Executed`) and `signatures-follow-up` consumes S34's readback and handoff
   state; a closed key or missing connection is a visible blocker with the exact next action.
4. **Lifecycle proof.** One fixture-driven test through the owning services: eligibility →
   verification (rent/term from S102/S103) → owner outcome → tenant offer accepted → packet →
   S97/S98 previews and claims (fake providers) → renewal notice draft → completion. Branch cases:
   revision, decline, no response, rent conflict, term review, missing recipient, Dotloop
   unavailable, provider failure, ambiguous result.

**In scope / out of scope.**

In scope: owner outcome vocabulary, phase wiring, version-binding and lifecycle tests. Out of scope:
choosing terms, legal language, LeadSimple, new write paths, or a second workflow engine.

**Open questions & assumptions.**

None. Every external effect keeps its human-initiated exact confirmation; the lifecycle proof uses
provider fakes and the existing claim/receipt stores.

**Cross-product impacts.**

Renewal progress schema and rules, S72 evidence, S75 waiting projection, S34/S106 packet state,
S110 blocker adapter, S111 proof, `docs/products/lease-renewal-agent.md`.

**Authority and evidence map.**

| Input                                                             | Classification                   | Use and limitation                                                                         |
| ----------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------ |
| `AGENTS.md` safety boundaries, S72, S97, S98, S77, committed code | Authority / implementation truth | Human-confirmed effects, draft-only messaging, evidence-derived completion stay unchanged. |
| Owner package PMI-04                                              | Intent evidence                  | Owner outcome distinctions and the lifecycle proof expectation.                            |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S105-1** — `ownerOutcome` lives in the existing progress evidence map with version-bound
  invalidation; a fixture recording `revision_requested` fails today (no such state) and reopens
  the correct substeps after.
- **ARCH-S105-2** — Every downstream artifact carries the owner decision revision or packet hash it
  was built from; a changed input makes each report stale in one shared check.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S105-1** — The fixed-term lifecycle fixture reaches `Complete` only after every required
  substep has evidence; removing any one evidence item returns the exact blocker.
- **BEH-S105-2** — Revision, decline, no response, rent conflict, term review, missing recipient,
  Dotloop unavailable, provider failure, and ambiguous result each stop at their distinct state with
  a recoverable next action.
- **BEH-S105-3** — Repeating any confirmed external step yields one receipt and no second provider
  effect.

**Human litmus outcome.**

### One renewal from start to finish

**If this was built correctly:** The operator works one lease through each phase in order. When the
owner asks for changes, declines, or does not answer, the lease shows exactly that. The lease shows
complete only when the documents, updates, and notice are done, and repeating a step never creates a
duplicate.

- Model verdict: PASS - why: the owner response is typed, so asking for changes reopens the owner
  copy and every preview built from it, a decline continues through the documented non-renewal
  handoff without inventing a tenant answer, and silence keeps the lease visibly waiting on the
  owner. Completion is reachable only with the full accepted-path evidence set: removing any single
  required item returns that exact key as missing. A new owner response or changed terms supersedes
  the decision and every downstream preview, a confirmation captured against superseded terms is
  refused, and two confirmations of the same effect map to one attempt identity. The Dotloop phase
  link is the one part still outstanding; it waits on S106 and S34, and its absence is already a
  visible blocker with its exact next action.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement                               | Architecture outcome | Behavior outcome | Human litmus                     | Deterministic evidence / falsification        |
| ----------------------------------------- | -------------------- | ---------------- | -------------------------------- | --------------------------------------------- |
| RENEWAL-01 complete path                  | `ARCH-S105-1`        | `BEH-S105-1`     | One renewal from start to finish | Lifecycle fixture                             |
| RENEWAL-02 distinct branches              | `ARCH-S105-1`        | `BEH-S105-2`     | One renewal from start to finish | Branch fixtures                               |
| RENEWAL-03, RENEWAL-06 retry/isolation    | `ARCH-S105-2`        | `BEH-S105-3`     | One renewal from start to finish | Duplicate-confirmation and two-lease fixtures |
| RENEWAL-04, RENEWAL-05 version/completion | `ARCH-S105-2`        | `BEH-S105-1`     | One renewal from start to finish | Changed-input staleness fixture               |

**Preservation set.**

S72 process tests, S75 follow-up consumers, S77 preview/confirm, S97/S98 proposal and execution
suites, and renewal notice draft tests stay green.

**Adversarial acceptance checks.**

- **AC-S105-1** — `BEH-S105-1`: no path records completion without the required evidence set.
- **AC-S105-2** — `ARCH-S105-2`: a stale owner revision cannot execute an S97 effect, create a
  Dotloop packet, or create a tenant draft.
- **AC-S105-3** — `BEH-S105-3`: two confirmations of the same step yield one receipt.
- **AC-S105-4** — No branch produces a send, an autonomous draft, or a provider write.

**Forbidden actions / hard gates.**

No send, no autonomous chaining of writes, no legal copy, no LeadSimple, no new write path.

**Dependencies / sequencing.**

After S102–S104; consumes S106/S34 packet state when present; S107 and S111 build on its proof.

**Standalone delivery contract.**

- **Deliverable now:** owner outcomes, version-binding audit, lifecycle and branch fixtures.
- **Consumes, but does not assume:** S34/S106 packet state; absent state is the existing
  `document-packet` blocker.
- **Externally blocked effect:** none; live effects keep their own gates.
- **Produces for downstream suites:** the lifecycle fixture S107 and S111 reuse.

**Verification and delivery contract.**

1. Freeze the owner-outcome and staleness fixtures failing for the expected reason.
2. Run focused progress, evidence, draft, proposal, and lifecycle checks.
3. Run `bash scripts/verify.sh` and `npm run test:e2e:core`.
4. Report `ALL_GATES_GREEN`, `BUDGET_EXHAUSTED` only with an explicit budget, or `BLOCKED` naming one
   exact unavailable input.

**Ordered prompt sequence.**

1. Re-verify the S72 evidence graph and S97/S98 claim stores.
2. Materialize the fail-first owner-outcome and staleness fixtures.
3. Implement outcomes and phase wiring.
4. Run the lifecycle proof, canonical checks, and update current docs.

**Deletion/merge recommendation.**

Merge into S72 once outcomes and the packet phase are deployed and read back.
