<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: connected-ai-batch-002 -->

# S137 — Shared actor-scoped operational context for AI

> Intake: ready, batch 002 item 004. Scope only; no connector, model tool, or provider effect is activated.

**Goal.**

Dashboard questions, renewal assistance, and workflow-linked email refinement can retrieve the same relevant authorized operational facts through reusable server-side interfaces.

**Current state / intended end state.**

The deployed S110 assistant uses `WorkAccountabilityStore.listSnapshot(..., "mine")` and `loadRenewalAssistantSource` for three intents. Other owning services supply approvals, connections, processes, Maintenance, and workflow-linked Gmail, but there is no common cross-module retrieval contract for these three AI consumers. S101's old closed deterministic V2 registry is unimplemented; this suite replaces its overlapping read-coverage plan without treating its historical text as executable. Current live record availability remains unverified.

**Actors and entry conditions.**

The server derives the signed-in actor, role, Space scope, and selected workflow/record. Every source read must enforce its own existing access rules. No model-provided identity or unrestricted mailbox access.

**What it is / how it functions.**

Build typed retrieval/filter/aggregate interfaces over owning services for current lease and cycle facts, source Sheet rows, assignments, recorded blockers, approval decisions, My Work and sessions, process definitions/runs, relevant Maintenance, connection state/freshness, and workflow-linked communication. Use stable IDs and current-cycle keys; keep provider facts, app records, and staff reports distinct. Return record links, provenance, as-of/coverage, and explicit empty/partial/stale/unavailable/not-authorized states. Apply filters and pagination before claiming exact totals. Retrieve bounded relevant detail as needed, not a whole-database prompt or arbitrary first-page "all" answer.

**In scope / out of scope.**

Shared read context and safe model-facing projection, not duplicate business tables, new connectors, a general inbox assistant, role expansion, or Dashboard writes. Do not background-read RentVine chat because its GET marks messages read. Ordinary safe reads need no additional per-source approval.

**Open questions & assumptions.**

No user clarification blocks intake. Actual cross-source join fields, live connection health, freshness policies, and pagination capabilities must be verified against current services during implementation. Unknown freshness stays unknown; no guessed policy or name-only join.

**Cross-product impacts.**

Assistant/Ask loaders, renewal desk and workspace projection, My Work, approvals, Connections, Internal Processes, Maintenance, Gmail Hub workflow context, shared schemas and access tests.

**Authority and evidence map.**

| Input                                        | Classification    | Use and limitation                                                                    |
| -------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------- |
| Current code/tests and S110 serving readback | Verified baseline | Existing three-intent shared loaders; not full cross-app coverage.                    |
| Source item 004                              | Owner intent      | Relevant, discoverable application context and honest partial answers.                |
| Live records/connectors                      | Unverified        | Test only through authorized reads; do not infer availability from a configured name. |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S137-1** — One actor-scoped, typed retrieval interface reuses owning services and stable record/cycle IDs across AI consumers; cross-module fixture parity fails before implementation.
- **ARCH-S137-2** — Filters, pagination, exact-count/coverage metadata, source freshness, and access scope travel with every result; multi-page and two-actor fixtures falsify leakage/truncation.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S137-1** — A lease can be joined to its current renewal, assigned work, recorded blocker, approval state, and relevant communication without asking staff to retype available IDs.
- **BEH-S137-2** — A source failure retains independent facts and states the missing scope; empty, stale, conflicting, unauthorized, and unavailable remain distinct.

**Human litmus outcome.**

### Ask across one lease's work

**If this was built correctly:** Staff see the same lease and work identities in the Dashboard and owning screens, with a clear note if one source could not answer. Record model verdict; without an observer use `Human verdict: NOT RUN — no human observer`.

**Requirement-to-outcome traceability.**

| Requirement                      | Architecture outcome | Behavior outcome | Human litmus                | Falsification                                              |
| -------------------------------- | -------------------- | ---------------- | --------------------------- | ---------------------------------------------------------- |
| Shared joined context            | ARCH-S137-1          | BEH-S137-1       | Ask across one lease's work | Current/historical cycles and same-name records.           |
| Full, scoped and honest coverage | ARCH-S137-2          | BEH-S137-2       | Ask across one lease's work | Multi-page, source-outage, freshness, and two-actor cases. |

**Preservation set.**

S110 answers, desk/workspace source parity, existing role/Space restrictions, Gmail workflow scope, and no-effect query behavior remain green.

**Adversarial acceptance checks.**

- **AC-S137-1** — One supported question combines current lease, assignment, blocker and approval with matching owning-screen IDs.
- **AC-S137-2** — Pagination and counts cover the stated scope; failed or stale sources never masquerade as zero or fresh.
- **AC-S137-3** — Cross-user caches/follow-ups cannot leak records; reads do not create a provider effect or activate a connector.

**Forbidden actions / hard gates.**

No unrestricted database reflection, raw whole-portfolio prompt, personal inbox search, hidden-effect chat GET, model-chosen actor, business mutation, or send. Preserve source-specific authority.

**Dependencies / sequencing.**

Intake order 004. Consumes the S135 read boundary and S136 model choice where narration is used. Produces a shared context contract for S138/S139. Old S90/S91/S101 planned adapters are not separate restart instructions.

**Standalone delivery contract.**

The typed safe retrieval layer and its honest absent-source states can be verified independently of UI/model presentation. Actual unavailable external sources block only their live readback, not the general contract.

**Verification and delivery contract.**

Map owning services/IDs first; fail-first parity, pagination, access, and no-effect cases; focused/canonical checks; exact authorized source readback after any later release. Never commit customer values.

**Ordered prompt sequence.**

1. Recheck source services, current code, and live read-only availability.
2. Record fail-first join, pagination, access, and failure-state cases.
3. Build shared typed retrieval and adapter contracts without duplicate business logic.
4. Verify parity and preserve no-effect boundaries; update actual evidence/status.

**Deletion/merge recommendation.**

Retire after shipped tests and current facts own the shared context and any external limitations.
