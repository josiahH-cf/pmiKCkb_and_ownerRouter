<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: application-usability-reliability-2026-10 -->

# S178 — Reliable actionable person and property lookup

> Status: READY — finalized owner-accepted F12 of batch 005 on 2026-10-04; implementation and delivery NOT RUN. Spec authoring alone does not start execution.

**Goal.**

Entering an accessible tenant, owner or property name in an existing read-only assistant lookup returns identifiable related leases with working app links and a verified RentVine link when one is actually available.

**Current state / intended end state.**

Current: S138/S166 already provide validated query plans, actor-scoped owning-service records, multiple-name resolution, follow-up selections and real lease workspace links. Deterministic interpretation mostly expects a subject or relation phrase; the existing model can fall back to knowledge/clarification for unsupported wording. Current name resolution uses normalized labels and the renewal adapter never invents a provider URL. The reported call's exact box, question and response are unavailable, so its cause is not asserted as reproduced.

Required end state: Bare-name and natural person/property lookup are handled consistently in the current operational question path and relevant existing read-only lookup controls. Current authorized records determine matches and links. All related accessible leases are discoverable regardless of default renewal horizon; explicit question constraints still apply. Ambiguity is shown with useful candidates instead of guessing, and partial/unavailable sources never become a definitive no-match.

The 2026-10-04 guarded Admin inspection read the canonical application's version as e106a88a50d541b4a012111019b09c2183f6ce20 / pmi-kc-app-rmusp7ehl-7ea8703905ca and inspected initial Dashboard, desk, lease workspace, Communications, Connections, and Admin screens. Its completed pass recorded zero mutation attempts. This establishes those observed presentations only; it does not establish failure handling, persistence, AI inference, all roles, accessibility certification, or a new release. Earlier failed access attempts remain failed. Customer values, raw reports, captures, profiles, and credentials remain outside Git.

**Actors and entry conditions.**

Authenticated staff ask a current read-only question or refine a result. Every lookup uses the actual actor, authorized projection and source state. A person may be a tenant, owner, staff member or more than one; a property may have multiple units/current or historical leases. Nothing in an answer initiates a run, creates a draft or executes a provider action.

**What it is / how it functions.**

This is one finalized change in batch 005, handoff application-usability-reliability-2026-10, registered in the canonical suite index. The owner accepted the recommendations on 2026-10-04 and requested specifications plus a launch prompt; authoring does not start execution. The future launch instruction selects only this program. Read the program contract in README.md and AGENTS.md; completed, superseded, and unrelated suites remain baselines rather than queued work.

Use the current owners below as verified starting points, then discover every actual consumer within this scope. They are not a frozen selector allowlist. The architecture obligations define the bounded change; the behavior outcomes define the observable success, failure and recovery. Before implementation, bind each trace row to actual tests/readbacks in the native evidence. A missing behavior must fail on the starting source for its intended reason; already-correct behavior gets preservation evidence.

**In scope / out of scope.**

Diagnose and repair read-only interpretation, source/projection coverage, person/property resolution, actionable answer projection and follow-ups. Preserve explicit questions and knowledge requests. This does not introduce fuzzy source joins, new provider endpoints, guessed RentVine destinations, new system-of-record writes, or autonomous anticipation of effects.

**Open questions & assumptions.**

Accepted interpretation: the spoken provider name refers to RentVine. The historical failing question is a nonblocking diagnostic gap; cover the current operational entry points rather than fabricating a reproduction. Exact provider links use only current trusted source URLs or a currently verified official configured link contract; when absent the correct result is the app lease link plus concise unavailable-provider-link state.

No material product question remains for this authored scope. Ordinary implementation choices are resolved from current evidence. Missing authority or real customer/provider input blocks only its exact effect and is never guessed.

**Cross-product impacts.**

Inspected starting owners:

- `lib/assistant/interpret.ts`
- `lib/assistant/conversation-plan.ts`
- `lib/assistant/conversation.ts`
- `lib/assistant/renewal-adapter.ts`
- `lib/lease-renewal/assistant-source.ts`
- `lib/lease-renewal/rentvine-link.ts`
- `lib/lease-renewal/desk-view-continuation.ts`
- `components/ask/AskForm.tsx`
- `app/api/assistant/query/route.ts`

Shared presentation and service changes must preserve other current consumers, direct entry routes, account boundaries and compatible return links. Coordinate with the named dependencies rather than creating parallel owners. Record exact revised source/test ownership in the current native docs after implementation.

**Authority and evidence map.**

| Input                                                                 | Classification                     | Use and limitation                                                                                                                                           |
| --------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AGENTS.md`                                                           | Authority and safety               | Exact scope, identities, protected paths, action and release gates; a spec or registry row is not execution authority.                                       |
| Current live readback, source/tests and `docs/facts.md`               | Implementation truth               | Establish actual baseline and preservation; revalidate before implementation. The October 4 read covers initial Admin screens, not every future requirement. |
| October 4 accepted recommendations and general UI/UX audit framework  | Clarified product intent           | Establish this bounded desired behavior. Audit timing/navigation heuristics are not measured guarantees or a mandate to invent new workflows.                |
| `docs/feature-suites/README.md`, `docs/plan.md`, `docs/loop-state.md` | Native program and resume contract | Identify selected specs, decisions, sequencing and evidence status; completed/superseded rows never restart themselves.                                      |
| Missing external input or human observation                           | Scoped dependency                  | Keep its actual unavailable or NOT RUN state; continue independent implementation and fail-closed verification.                                              |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S178-1** — Keep one validated read-only interpretation/resolution path over the existing actor-scoped sources. A model may propose bounded terms/filters but never record IDs, links, actors or authority. Add a deterministic bare-name/property lookup fallback with conservative candidate matching and preserve knowledge/mixed/explicit-date intent. Structural falsification uses the associated requirement/AC rows below on the starting owners; record the actual check and before/after result.
- **ARCH-S178-2** — Resolve relations against complete accessible source identities, not the remembered desk filter or the default renewal window. Use exact provider IDs for relationships when available, normalized label matching for candidate search only, and keep indistinguishable identities ambiguous. Group and paginate actual related leases without truncating the discovered count or manufacturing a unique party. Structural falsification uses the associated requirement/AC rows below on the starting owners; record the actual check and before/after result.
- **ARCH-S178-3** — Project actions from actual resolved lease IDs through the existing guarded workspace-link builder and trusted provider-URL validation. Keep link identity, matched person/property, source completeness and follow-up references bound together. Saved reruns/history and restored links use current authorization; query remains read-only. Structural falsification uses the associated requirement/AC rows below on the starting owners; record the actual check and before/after result.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S178-1** — A supported bare-name/property query produces current candidate/lease results rather than knowledge-only prose or an unrelated workflow run. Deterministic falsification: Use privacy-safe bare-name, relation phrase, address/unit and capitalization fixtures with and without model availability; a model-only happy path or unsolicited execution fails.
- **BEH-S178-2** — Active, upcoming, out-of-window, month-to-month and historical matches are discoverable with truthful status and total; explicit constraints retain their meaning. Deterministic falsification: Choose a saved narrow month/owner view, then query a multi-lease party/property across windows; a hidden authorized match or ignored explicit date/status constraint fails.
- **BEH-S178-3** — The answer identifies tenant/owner relation, property/unit and relevant dates/status; it never silently selects one same-name identity. Deterministic falsification: Use two parties with the same label, a staff/owner overlap, multiple units and duplicate-address records; first-match selection or fabricated unique identity fails.
- **BEH-S178-4** — Clicking a result opens the selected lease with correct identity and compatible return/view context. Deterministic falsification: Open every fixture result, select an ordinal follow-up and return; a property/unit/name-derived lease ID, dead route or wrong record fails.
- **BEH-S178-5** — Available provider links identify the same lease; absent or conflicting URLs do not prevent the app link and never become guessed destinations. Deterministic falsification: Supply hostile host/scheme, unit-only link, wrong lease ID, duplicate references and missing URL; accepting a forged link or inventing the provider path fails.
- **BEH-S178-6** — The person understands whether to choose a candidate, narrow a term or refresh the source; unavailable data is not called no leases. Deterministic falsification: Force missing pages, stale/failed source and unresolved owner relation; a definitive zero count from incomplete data or unexplained prose fails.
- **BEH-S178-7** — Client/model-proposed IDs, URLs, roles and hidden record references are rejected or re-resolved within the actor's actual scope. Deterministic falsification: Inject an unowned lease ID, prompt instruction to send/create, invented link and saved reference after permission loss; disclosure or provider/app business effect fails.
- **BEH-S178-8** — The chosen lease stays selected across a follow-up and valid saved rerun; an obsolete/unavailable reference is stated honestly. Deterministic falsification: Reorder candidates, remove a record, change account and rerun a saved question; ordinal drift, stale unauthorized link or repeated inference for a structured rerun fails.
- **BEH-S178-9** — Deterministic service and compiled-browser checks identify the repaired missing behavior; historical-call reproduction and live inference are claimed only if actually observed. Deterministic falsification: Run tests with fallback, malformed/throttled model, large multi-match projection and delayed sources; a prose snapshot without clickable identity/readback coverage fails.

**Human litmus outcome.**

### Find a person's leases from their name

**If this was built correctly:** The person types a tenant, owner or property name and sees the matching leases with enough identity to choose the right one. Each resolved lease opens its actual workspace. A verified RentVine link opens that same lease when available; otherwise the app says it is unavailable. Similar names are offered as choices.

- Model verdict: NOT RUN — specification-only; implementation runner records PASS or FAIL against every trace row with actual evidence.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                                                                                                                                                      | Architecture outcome | Behavior outcome | Human litmus                           | Deterministic evidence / falsification                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S178-1 — Discover each current operational/read-only lookup entry point and accept a bare tenant, owner or property name without requiring the user to write identify leases.  | ARCH-S178-1          | BEH-S178-1       | Find a person's leases from their name | AC-S178-1; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S178-2 — Return all related accessible leases for an unconstrained identity query, independent of default renewal horizon and the person's saved filters.                      | ARCH-S178-2          | BEH-S178-2       | Find a person's leases from their name | AC-S178-2; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S178-3 — Show useful distinctions for every actual match and retain ambiguity when labels collide across people, roles, properties or units.                                   | ARCH-S178-2          | BEH-S178-3       | Find a person's leases from their name | AC-S178-3; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S178-4 — Give every resolved lease a working in-app workspace link based on its real lease ID; unresolved records remain unlinked or lead to an honestly labelled scoped desk. | ARCH-S178-3          | BEH-S178-4       | Find a person's leases from their name | AC-S178-4; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S178-5 — Offer a RentVine shortcut only when its trusted destination and exact lease identity validate against current configured/source truth.                                | ARCH-S178-3          | BEH-S178-5       | Find a person's leases from their name | AC-S178-5; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S178-6 — Distinguish complete no-match, partial/unavailable source, unresolved relationship and ambiguous candidate states with concise read-only recovery.                    | ARCH-S178-2          | BEH-S178-6       | Find a person's leases from their name | AC-S178-6; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S178-7 — Preserve server-owned truth, current permissions and effect-free query/history boundaries under hostile prompt/model output.                                          | ARCH-S178-1          | BEH-S178-7       | Find a person's leases from their name | AC-S178-7; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S178-8 — Keep follow-ups, selected candidate/detail questions and structured saved reruns bound to the displayed verified references rather than re-guessing a name.           | ARCH-S178-3          | BEH-S178-8       | Find a person's leases from their name | AC-S178-8; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S178-9 — Prove interpretation-to-source-to-rendered-link parity with fail-first regressions for confirmed gaps and preservation tests for existing S166 behavior.              | ARCH-S178-1          | BEH-S178-9       | Find a person's leases from their name | AC-S178-9; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |

Every row is a completion obligation, including boundary and recovery behavior. Native implementation evidence names each actual test/readback, environment, observed result and any precise unavailable seam. Unit/adapted evidence, compiled-browser evidence, guarded production reads and human observations retain their separate meanings.

**Preservation set.**

Existing authenticated routes and direct guards; current staff/Admin/Vendor and private-account boundaries; complete/partial source and freshness meanings; all-lease visibility and current working values; source differences and notice invalidation; receipt/ambiguity recovery; editable as-displayed unsent drafts; no-send and closed-key refusals; compatible query/return links; keyboard, touch, themes, reduced motion and existing mobile workflows. Any preservation failure fails the slice independently of a visual or timing improvement.

Retain the existing relevant owning tests and add missing preservation checks where the inspected baseline lacks them. Do not weaken a preserved assertion to make a visual, performance or wording change pass. The full native gate remains required for implementation delivery.

**Adversarial acceptance checks.**

- **AC-S178-1** — Verify R-S178-1 through ARCH-S178-1, BEH-S178-1 and the "Find a person's leases from their name" litmus: Use privacy-safe bare-name, relation phrase, address/unit and capitalization fixtures with and without model availability; a model-only happy path or unsolicited execution fails.
- **AC-S178-2** — Verify R-S178-2 through ARCH-S178-2, BEH-S178-2 and the "Find a person's leases from their name" litmus: Choose a saved narrow month/owner view, then query a multi-lease party/property across windows; a hidden authorized match or ignored explicit date/status constraint fails.
- **AC-S178-3** — Verify R-S178-3 through ARCH-S178-2, BEH-S178-3 and the "Find a person's leases from their name" litmus: Use two parties with the same label, a staff/owner overlap, multiple units and duplicate-address records; first-match selection or fabricated unique identity fails.
- **AC-S178-4** — Verify R-S178-4 through ARCH-S178-3, BEH-S178-4 and the "Find a person's leases from their name" litmus: Open every fixture result, select an ordinal follow-up and return; a property/unit/name-derived lease ID, dead route or wrong record fails.
- **AC-S178-5** — Verify R-S178-5 through ARCH-S178-3, BEH-S178-5 and the "Find a person's leases from their name" litmus: Supply hostile host/scheme, unit-only link, wrong lease ID, duplicate references and missing URL; accepting a forged link or inventing the provider path fails.
- **AC-S178-6** — Verify R-S178-6 through ARCH-S178-2, BEH-S178-6 and the "Find a person's leases from their name" litmus: Force missing pages, stale/failed source and unresolved owner relation; a definitive zero count from incomplete data or unexplained prose fails.
- **AC-S178-7** — Verify R-S178-7 through ARCH-S178-1, BEH-S178-7 and the "Find a person's leases from their name" litmus: Inject an unowned lease ID, prompt instruction to send/create, invented link and saved reference after permission loss; disclosure or provider/app business effect fails.
- **AC-S178-8** — Verify R-S178-8 through ARCH-S178-3, BEH-S178-8 and the "Find a person's leases from their name" litmus: Reorder candidates, remove a record, change account and rerun a saved question; ordinal drift, stale unauthorized link or repeated inference for a structured rerun fails.
- **AC-S178-9** — Verify R-S178-9 through ARCH-S178-1, BEH-S178-9 and the "Find a person's leases from their name" litmus: Run tests with fallback, malformed/throttled model, large multi-match projection and delayed sources; a prose snapshot without clickable identity/readback coverage fails.

**Forbidden actions / hard gates.**

No client send, autonomous provider action, proof rerun, fabricated production record, new Action Registry key/activation, permission/claim/identity change, credential-store substitution, cost/guardrail change, or unrelated feature execution. Existing source updates and unsent Gmail drafting keep their exact human preview/confirmation, claim, receipt, readback, and correction contracts. A cancel, timeout, navigation, or client abort never proves an external operation stopped. Preserve Production/Live, managed identity, eleven Spaces, Demo=false and the reviewed Sheet switch. Protected paths retain AGENTS.md's owner-direction requirement; design this program through existing interfaces without assuming a protected-path grant.

**Dependencies / sequencing.**

Extends the deployed S138/S166 foundations and integrates S171 pending/recovery plus S177 explicit-link precedence. S180's relevant feedback can refine current defect evidence without guessing names or input. S181 covers source/answer/link parity.

**Standalone delivery contract.**

- **Deliverable now:** Current-input diagnostic coverage, deterministic/validated interpretation repair, complete scoped relation lookup, honest ambiguity/partial states, real links and follow-up/history compatibility tests. An absent trusted RentVine URL blocks only that external shortcut, not the in-app result.
- **Consumes, but does not assume:** Compatible deployed behavior and the named program contracts. Missing optional source/layout data has an explicit default, unavailable or recoverable state; an unimplemented peer is never treated as deployed.
- **Externally blocked effect:** This authored change requires no new provider activation or business mutation as proof. Any unavailable real input, human verdict or protected authority is recorded only against its exact outcome, with its actual BLOCKED or NOT RUN meaning; independent engineering/release proceeds.
- **Produces for downstream suites:** Verified owning contracts, traceable new behavior and separate preservation evidence for S181's cumulative validation and delivery.

**Verification and delivery contract.**

1. At the start of an explicitly authorized execution, refresh approved WSL authentication, read the actual serving version and relevant source, and freeze the existing behavior and preservation checks. Materialize missing-behavior tests before implementation; they must fail for the expected defect. Already-satisfied requirements receive preservation evidence rather than an artificial failure.
2. Exercise every requirement, architecture outcome, behavior outcome, and adversarial case through the actual owning components and services. Distinguish unit, emulator/backend, compiled-browser, guarded live-read, and human evidence. A passing adapter or screenshot does not establish a customer/provider effect. Use privacy-safe fixtures only in tests.
3. Run focused checks and the existing canonical verification, including bash scripts/verify.sh and npm run test:e2e:core, before an authorized mainline delivery. Keep preservation results separate. Audit scope, diff, secrets/PII, permissions, action contracts, runtime configuration, and deterministic traceability; update any changed route-opening landmark in the release canary in the same slice.
4. Deliver this program cumulatively through the existing runner and release gates: one watcher/lock, exact-main green CI, fresh prerequisites and locked GO, one application build per run, a zero-traffic candidate, guarded exact-revision assurance and reconciliation, receipt-bound promotion, the full 300,000 ms observation, and independent final readbacks. Preserve the reviewed Sheet=true value on candidate/promoted revisions and the captured predecessor's actual value on its recovery target. Consumed receipts/permits never admit this program.
5. Keep actual failed attempts immutable outside Git and diagnose before resuming or replacing them. Pre-dispatch authentication holds recheck the same approved store/checkpoint after change; in-flight or ambiguous operations still require reconciliation. Report ALL_GATES_GREEN only for actually completed requirements and delivery; BLOCKED only for an exact unavailable dependency after independent work is complete; BUDGET_EXHAUSTED only when an explicit budget exists. Human verdicts stay NOT RUN unless a person actually observes.

**Ordered prompt sequence.**

1. Read this complete specification, the canonical program section, router, current facts/resume/plan, and inspected owning source/tests. Revalidate present behavior instead of reviving old prerequisites.
2. Record the relevant baseline, requirement-to-outcome checks, expected fail-first results and preservation checks before implementation. Resolve ordinary technical choices from evidence; never invent missing customer/provider input.
3. Implement the bounded change and its actual loading, failure, recovery, concurrency and compatibility paths in the existing owners. Preserve unsaved work and unrelated/user-owned files.
4. Verify every trace row and adversarial case, then integrate with the other named program changes and existing mobile behavior. Record exact tested environments and unavailable live seams.
5. Carry the verified slice into the native checkpoint and authorized cumulative delivery. Authoring or a registry row alone never runs this sequence.

**Deletion/merge recommendation.**

Keep this suite active through verified program delivery and any remaining acceptance dependency. Retire or merge its narrative only after current code/tests/facts own every contract and the registry retains the exact disposition. Never remove the only unmet requirement, fabricate a human/provider result or restart a completed baseline from its row.
