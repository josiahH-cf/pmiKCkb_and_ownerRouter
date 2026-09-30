<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: connected-ai-batch-002 -->

# S141 — Integrated Dashboard and email AI validation

> Intake: ready, batch 002 item 008. This is one final evidence join for S135–S140, not an extra approval stage or a second implementation run.

**Goal.**

Prove the connected Dashboard/model/context and workflow-linked email-refinement paths work through the actual application, with precise tested-environment and live-readback limits.

**Current state / intended end state.**

S110's three read intents and existing draft paths are deployed. The broader batch is not implemented or validated. Prior S111 integrated proof applies to its older fixed scope and cannot establish this batch. Current production config still selects Gemini 2.5 Flash; code tests alone would not prove a later model migration or serving data access.

**Actors and entry conditions.**

Authorized test identities and existing role/Space boundaries, controlled non-production fixtures for failure/effect scenarios, authorized real read paths for live checks. No synthetic customer data in production.

**What it is / how it functions.**

Trace signed-in UI → server → selected model → shared retrieval → displayed records and follow-ups, using semantic IDs/fields/counts rather than exact prose. Trace instruction → revision → accepted/manual edit → relevant app save/reload or labelled transient state → authorized exact Gmail handoff. Cover all linked draft screens resolved by the owner. Check alternate phrasing, combined filters, timezone boundaries, similar names, current versus historical cycles, multi-page counts, genuine empty and partial sources, two different existing access scopes, transient model/source failure, late response, failed/ambiguous draft save, duplicate prevention, and the UI-only hint. Record the environment, model ID/endpoint, accounts' roles, source readiness, and exact unverified seams. Fix in-scope defects within S135–S140; do not turn this suite into a new platform or approval ceremony.

**In scope / out of scope.**

Integrated verification and targeted correction of this batch's authorized implementation. No reopening request 001, completed S111 proof, provider activation, client send, general inbox product, or extra release decision. Deployment occurs only if separately included in the actual execution instruction and gated by the router.

**Open questions & assumptions.**

No intake question remains. Live model/project access and real records may be unavailable during a future run; mark that exact portion unverified while independent checks proceed. A mock-only pass cannot support an integrated/live claim.

**Cross-product impacts.**

Dashboard, shared AI/model configuration, renewal/work/approval/connection/communication reads, all S139 linked draft paths, Gmail handoff, tests and current loop status.

**Authority and evidence map.**

| Input                                      | Classification    | Use and limitation                                                   |
| ------------------------------------------ | ----------------- | -------------------------------------------------------------------- |
| Serving release/readbacks and current code | Verified baseline | S110 and prior draft behavior only.                                  |
| Source item 008                            | Owner intent      | Required integrated checks and honest reporting.                     |
| Future test/live receipts                  | Required evidence | Only exact observed environment and effects may be called validated. |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S141-1** — The integrated suite exercises real app routes, selected model transport, source adapters, and draft persistence/handoff boundaries, not only injected isolated mocks.
- **ARCH-S141-2** — A single evidence record maps each batch acceptance check to the exact environment, actor scope, source readiness, and implementation/served result.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S141-1** — Operational questions/follow-ups match owning records under source failures, pagination and access changes; no query effect occurs.
- **BEH-S141-2** — Successive draft instructions and manual edits reach their supported saved/unsent state, while failure/retry and the optional hint remain truthful and never send.

**Human litmus outcome.**

### Complete the connected staff journey

**If this was built correctly:** Staff ask a follow-up about current work, open the matching record, refine a linked email and see the accepted wording in its supported review/handoff; no surprise action occurs. Record model verdict; without an observer use `Human verdict: NOT RUN — no human observer`.

**Requirement-to-outcome traceability.**

| Requirement                    | Architecture outcome | Behavior outcome | Human litmus                         | Falsification                                               |
| ------------------------------ | -------------------- | ---------------- | ------------------------------------ | ----------------------------------------------------------- |
| Actual model/data/UI path      | ARCH-S141-1          | BEH-S141-1       | Complete the connected staff journey | Real route/model and semantic record comparison.            |
| Draft path and honest evidence | ARCH-S141-2          | BEH-S141-2       | Complete the connected staff journey | Reload, timeout, ambiguity, duplicate and body-hint checks. |

**Preservation set.**

S110/S111 delivered scopes, role/Space checks, existing exact draft gates, no autonomous send, source/effect receipts, and canonical app verification remain green.

**Adversarial acceptance checks.**

- **AC-S141-1** — Actual signed-in Dashboard path answers varied, combined and follow-up questions with record/coverage parity and no hidden effects.
- **AC-S141-2** — Serving model ID/endpoint and real inference are evidenced for the environment claimed; mocks alone are labelled limited.
- **AC-S141-3** — Every linked draft path preserves latest edits, reports save/Gmail state correctly, avoids duplicate/send, and keeps the Gemini hint out of content.

**Forbidden actions / hard gates.**

No customer send, synthetic production record, stateful provider GET as passive proof, unapproved action/key activation, credential exposure, or release claim from local tests.

**Dependencies / sequencing.**

Intake order 008. Joins S135–S140 in the supplied order; dependency readiness is not a discretionary approval stage. Verify already-working pieces, do not rebuild them.

**Standalone delivery contract.**

One integrated evidence pass and in-scope corrections once the prior features are implemented. If an external seam is unavailable, preserve a precise unverified cell instead of a false batch-complete claim.

**Verification and delivery contract.**

Use existing focused/adversarial, backend, browser and canonical gates. When release is authorized, require exact CI, candidate smoke, promotion/observation and serving readback under the router. Update suite and loop statuses to what actually passed.

**Ordered prompt sequence.**

1. Recheck exact checkout, serving config, accounts and source readiness.
2. Map S135–S140 acceptance cases to fail-first and preservation evidence.
3. Exercise actual routes/model/records/draft states and repair only observed in-scope defects.
4. Run canonical and authorized live gates; record precise verified and unverified outcomes.

**Deletion/merge recommendation.**

Retire after its evidence map is recorded in current facts and no acceptance gap is hidden by mocks or unavailable sources.
