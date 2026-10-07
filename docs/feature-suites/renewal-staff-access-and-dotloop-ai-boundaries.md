<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: dotloop-pdf-renewal-v1-2026-10 -->

# S182 — Open renewal operations and permitted PMI AI context

> Intake: READY, 2026-10-06, intake 054. This suite extends the deployed S135/S137 operational-context and S148 personal-history foundations. Its operation-level access changes and Dotloop-origin exclusion are specified, not implemented or live-verified. Both Dotloop action keys remain closed; live verification and activation belong to a separate flow.

**Goal.**

Ordinary authorized renewal staff can prepare, correct, inspect, approve and confirm their lease documents without an Admin bottleneck. They retain permitted PMI operational context and their own AI history, while data obtained through the Dotloop API never enters an AI processing or history path.

**Current state / intended end state.**

Starting source: `60145e926a477a35990c48b1123489d98822fe8b`. S135/S137 already establish scoped operational reads, and S148 establishes personal history. S154 establishes renewal workability. The packet fact-resolution and approval paths still impose privileged-role checks, and packet approval ownership follows the last company-selection recorder. The inspected assistant context paths do not establish a complete exclusion of Dotloop API-derived data across transformations, persistence and reuse. These observations do not revoke the existing deployed evidence for adjacent capabilities.

End state: the actual staff identity authorizes ordinary lease operations within existing application/Space scope; company configuration remains Admin-owned. Missing provider readiness affects its exact operation rather than local fields, PDF work or unrelated permitted AI context. Data lineage distinguishes independently sourced PMI facts from Dotloop API data before any model or reusable AI storage boundary.

**Actors and entry conditions.**

Managed staff with the existing Renewal Space capability operate on accessible leases. Editor and Approver roles can perform the ordinary operations listed below when their existing Space scope permits them; an assignment is not an additional prerequisite. Admins manage company credentials, provider selection, published legal templates and shared fee policy. Existing explicit Space exclusions, identity/domain restrictions and verification-account mutation refusals remain effective. This suite grants no global Admin role, claim, identity or cross-user history access.

**What it is / how it functions.**

1. **Authorize the concrete operation.** Support ordinary staff correction/review of app-owned packet inputs, preparation, PDF inspection/download, approval of the exact lease output, explicit loop association, exact confirmation and staff reporting of outside completion. Apply the same capability and actual-actor checks in controls, routes and durable stores. Do not impersonate an Admin, substitute the company settings editor as approver, or require lease assignment. Owner approval of the current economic terms remains S66's separate requirement. Provider execution additionally retains the relevant exact key and S34 execution contract.
2. **Expose usable work and precise holds.** Distinguish read, edit, prepare, output approval, provider confirmation and Admin configuration. Show consistent allowed actions and reasons for refusals. An absent company connection, deferred Drive setup, missing unused form family or closed provider key must not hide independently usable lease facts, local PDF preparation, personal history or permitted AI context. A selected form's missing content or input holds that output; a revoked Space scope still refuses access. Do not substitute a global readiness banner for operation-specific enforcement.
3. **Preserve permitted PMI context and personal history.** Reuse S137's accessible RentVine/Sheet facts, current Working terms, staff-entered inputs, configurations, notes and app activity with source/freshness labels and current access checks. Preserve S148's owner-scoped saved history, including model-free reload. Do not introduce another AI permission gate solely because Dotloop is being connected. Current record-access revocation still applies on retrieval. Team-wide transcript sharing, new history migration/retention rules and another history system are outside scope.
4. **Exclude all Dotloop API-derived data before AI boundaries.** Apply deterministic source checks before prompt construction, embeddings, retrieval, saved AI context/history, history reuse, model caches, AI telemetry and training inputs. This includes API payloads, downloaded document bytes/text, participant fields, provider identifiers/URLs, status and activity, errors containing provider bodies, and summaries or transformations derived from them. Redacting the visible answer after model submission is insufficient. Instructions embedded in documents or provider content cannot waive the exclusion. Non-AI operational stores and staff views may retain the data under their existing contracts; they are not AI sinks.
5. **Retain independent facts without relabeling provider data.** A fact independently obtained from RentVine, the approved Sheet or a staff input remains usable even when the same value was sent to or returned from Dotloop. Its original lineage must survive storage, projection and mixed-record composition. A Dotloop readback is not converted to independent PMI origin by copying it into an app field, using a different field name or summarizing it. Filter the provider-derived branch of a mixed record while retaining independently supported fields and useful coverage information. Unknown lineage is excluded from AI until resolved through an independent permitted source; do not infer provenance from equal values.
6. **Keep document execution deterministic.** PDF filling, fee calculations, mapping, readiness and provider readback run through their own deterministic services. AI may explain permitted PMI facts and app navigation. It cannot approve terms/documents, confirm an action, send/sign, open an action key or turn a staff completion report into provider proof. A source read, model answer or history save grants no execution authority. The normal person-operated preview/confirmation remains the only admission path for the in-scope live operation.

**In scope / out of scope.**

In scope: renewal operation permissions across UI/server/storage; local-work availability; personal history preservation; source-lineage enforcement and exclusion at actual AI boundaries; integration with S106, S66, S130 and S34.

Out of scope: global role/permission reset, claims/IAM/account-domain changes, shared team transcripts, new model budgets or providers, a replacement history system, stable Drive connectivity, client-facing sends, automated signing or provider effects, live testing/demo and key activation. Existing Space isolation is not removed by the request to keep v1 open.

**Open questions & assumptions.**

No specification-blocking question remains after the owner's acceptance of the presented recommendations on 2026-10-06. Broad v1 access means ordinary operations for existing authorized staff, with the stated Admin configuration and source-origin boundaries. The Business+ company entitlement remains owner-reported until a separate live flow verifies it. Exact runtime permission failures or unknown data lineage receive the scoped behavior above; neither is assumed away.

**Cross-product impacts.**

- `lib/lease-renewal/role-action-governance.ts`, packet input/fact-resolution, filled-document and packet approval routes/stores, and renewal controls: one operation matrix using the authenticated staff actor.
- `lib/lease-documents/fact-resolution.ts` and S66/S130/S34 consumers: approved term/output distinctions, ordinary staff access and localized output holds.
- `lib/operational-context/`, assistant query/context assembly and saved-history retrieval/persistence: provenance before model/storage/reuse boundaries. Trace actual source owners before changing them; do not invent a parallel assistant pipeline.
- S135/S137 remain owners of general operational-context access; S148 remains owner of personal history. This suite narrows their Dotloop integration behavior without duplicating or rewriting their unaffected requirements.

**Authority and evidence map.**

| Input                                                                                         | Classification                         | Use and limitation                                                                                                                      |
| --------------------------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`, committed role/context/history code and `docs/facts.md`                          | Authority / implementation truth       | Existing Space/identity isolation, canary refusal, closed exact keys and deployed foundations remain in force.                          |
| Owner's accepted Q7–Q9 recommendations and broad-v1 direction                                 | Confirmed desired behavior             | Ordinary scoped staff operate the lease; Admin owns shared setup; own history and independent PMI context stay open.                    |
| [Dotloop API License Agreement, section 2(k)](https://www.dotloop.com/api-license-agreement/) | External integration constraint        | Dotloop API data is excluded from AI use, including derivative transformations; this does not prohibit independently sourced PMI facts. |
| Current source and S106/S66/S130/S34 revised contracts                                        | Implementation evidence / dependencies | Identifies existing bottlenecks and the deterministic document/provider boundary; authoring does not establish live acceptance.         |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S182-1** — One explicit operation matrix governs the actual actor in UI, routes and stores. Deterministic authorization tests must expose the starting privileged-role/settings-recorder bottlenecks and then pass for ordinary scoped staff, while preserving Admin configuration and verification-account refusals.
- **ARCH-S182-2** — Provenance reaches every actual AI input, persistence and reuse boundary. Instrumented tests must fail when a Dotloop-origin sentinel or its transformation reaches any sink, including through mixed records, error handling or saved history; independent PMI facts remain available. Enforcement occurs before submission/persistence rather than only in rendered answers.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S182-1** — Two ordinary scoped staff can prepare, correct, inspect and approve a configured lease even when neither last saved company settings and the lease is unassigned. With Dotloop unavailable they can still produce local files; only the exact provider operation remains held. Server/store checks match visible controls.
- **BEH-S182-2** — A staff member receives permitted source-backed PMI answers and reloads their own history without a new Dotloop-related AI gate. Dotloop-origin values never reach the model or saved/reused AI context, and another person's history or a newly inaccessible record remains refused.

**Human litmus outcome.**

### Staff can finish their work without an Admin bottleneck

**If this was built correctly:** A staff member edits the lease facts, reviews the fees, opens the actual filled PDFs and approves their exact version. A colleague with access can continue the work without waiting for the person who configured the company connection. The assistant still answers from permitted PMI facts and opens the person's own saved history. Missing Dotloop setup gives a precise hold on upload, while local work remains available. Signature setup and sending happen in Dotloop.

- Model verdict: NOT RUN — specification authoring only; implementation evidence is required.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement                                              | Architecture outcome     | Behavior outcome       | Human litmus                                            | Deterministic evidence / falsification                                           |
| -------------------------------------------------------- | ------------------------ | ---------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Ordinary staff author and approve exact lease outputs    | ARCH-S182-1              | BEH-S182-1             | Staff can finish their work without an Admin bottleneck | Actual Editor/Approver UI, route and store tests; AC-S182-1 and AC-S182-2.       |
| Missing provider prerequisites hold only dependent work  | ARCH-S182-1              | BEH-S182-1             | Staff can finish their work without an Admin bottleneck | Local output with absent connection/key and unrelated missing family; AC-S182-3. |
| Permitted PMI context and own history remain usable      | ARCH-S182-2              | BEH-S182-2             | Staff can finish their work without an Admin bottleneck | Actual context/history reload and access-revocation checks; AC-S182-4.           |
| Dotloop API origin is excluded from every AI sink        | ARCH-S182-2              | BEH-S182-2             | Staff can finish their work without an Admin bottleneck | Instrumented prompt, embedding, storage/reuse and telemetry paths; AC-S182-5.    |
| Independent facts survive mixed-record filtering         | ARCH-S182-2              | BEH-S182-2             | Staff can finish their work without an Admin bottleneck | Equal-value, transformation and unknown-lineage cases; AC-S182-6.                |
| AI/read/save/manual reports grant no execution authority | ARCH-S182-1, ARCH-S182-2 | BEH-S182-1, BEH-S182-2 | Staff can finish their work without an Admin bottleneck | Zero-effect boundary and exact admission checks; AC-S182-7.                      |

**Preservation set.**

Preserve S135/S137 source scope and freshness, S148 personal-history isolation and model-free reload, S113/S154 renewal usability, current explicit Space restrictions and verification-account refusals. Preserve the existing exact-key, owner-term approval, preview/confirmation, receipt/readback and permanent send boundaries. Preserve deployed history tests and unaffected role/source checks as a separate gate; broad local usability never means unchecked provider execution.

**Adversarial acceptance checks.**

- **AC-S182-1** — Real Editor and Approver actors with the existing Renewal Space capability can author, inspect/download and approve exact configured outputs through UI, route and store paths. Tests do not give them an Admin claim or bypass the real authorization boundary.
- **AC-S182-2** — A second authorized staff actor continues an accessible unassigned lease regardless of the last company-selection recorder. The same actor is refused company credential/resource changes and shared policy/legal publication.
- **AC-S182-3** — An absent Dotloop connection, closed action keys, deferred Drive setup and an unused missing form family do not hide independent facts, local files or permitted context/history. Required-form holds remain precise; revoked Space scope, verification identities and exact provider-key refusals still work.
- **AC-S182-4** — Existing permitted sources and the person's saved history work without another Dotloop AI gate; reload performs no new model call. Cross-user access and current source-access revocation fail through the actual retrieval path.
- **AC-S182-5** — Dotloop-origin document text, participants, identifiers/URLs, status, summaries and error-body sentinels are absent at the actual model, embedding, retrieval/history persistence/reuse, cache and AI telemetry/training boundaries. Test every sink present in the application; a nonexistent sink need not be built to test it. Display-only redaction cannot pass.
- **AC-S182-6** — A mixed record retains independently sourced PMI facts while excluding provider-derived fields. Equal values do not change lineage; copying, renaming or summarizing Dotloop data cannot bypass the filter. Unknown origin is held out until independently resolved, with no invented fact.
- **AC-S182-7** — Source reads, model responses, history saves, PDF generation and staff completion reports create no provider attempt/receipt, term approval, role change or key activation. In-scope provider work still requires its exact person-confirmed contract; signatures and sends remain outside model authority.

**Forbidden actions / hard gates.**

Do not change identities/claims or global Space scope to solve an operation permission defect. Do not expose another person's AI transcript. Do not submit Dotloop API-derived data to a model or reusable AI store. Do not let model output approve or initiate effects. Do not open either Dotloop key, send/sign, run a live customer proof or start an implementation loop from this READY registration.

**Dependencies / sequencing.**

Define the operation matrix alongside S66 input/output contracts and S34 confirmation actors; apply it consistently when those routes/stores are implemented. Define source lineage before any new Dotloop reads are wired into general context stores. S106 company readiness and S130 form availability remain localized dependencies. Existing S135/S137/S148 implementations are preservation inputs, not new authorization to rerun old queues. Stable Drive setup and live verification/demo/activation remain separately deferred.

**Standalone delivery contract.**

This suite owns the operation capability matrix and complete AI-origin boundary; it can be implemented and verified against deterministic providers without real Dotloop consent or published private legal files. Completion requires its actual UI/server/store integration and actual AI sink checks, not only helper tests. Other suites retain ownership of credential plumbing, form authoring/filling and provider lifecycle. Missing runtime inputs produce precise holds, not a false successful upload or a new approval process.

**Verification and delivery contract.**

For a later expressly authorized implementation, reproduce the relevant privilege/provenance defects first, verify focused role/context/history tests and actual route/store journeys, and run the repository's required preservation checks. Compiled UI checks must exercise ordinary actors without substituting Admin; report human verdicts accurately. Live provider verification and activation require the separate flow and exact contracts. This authoring run validates only specification shape, registration, references and traceability; it changes no application behavior and schedules no release.

**Ordered prompt sequence.**

1. Map actual operation and AI input/storage/reuse owners; establish fail-first tests for real staff denial and provider-origin leaks.
2. Implement the operation matrix alongside S66/S130/S34; retain Admin setup and existing scoped refusals.
3. Carry independent/provider lineage into context composition; enforce exclusion before each existing AI sink.
4. Verify two-person continuation, local work during provider holds, permitted PMI answers and personal-history isolation with actual boundaries.
5. Run preservation checks and record architecture, behavior and human outcomes separately. Leave live effects and activation to their later authorized flow.

**Deletion/merge recommendation.**

Keep this suite as the focused cross-cutting contract until verified implementation can own the operation matrix and lineage boundary. Do not duplicate S135/S137/S148 or delete their evidence. Reconcile this suite's current status after implementation without rewriting the historical deployed baseline or treating READY as execution authority.
