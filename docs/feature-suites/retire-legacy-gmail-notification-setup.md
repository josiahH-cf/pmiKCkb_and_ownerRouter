<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: application-usability-reliability-2026-10 -->

# S179 — Retire obsolete legacy Gmail notification setup

> Status: READY — finalized owner-accepted F13 of batch 005 on 2026-10-04; implementation and delivery NOT RUN. Spec authoring alone does not start execution.

**Goal.**

Admin and Connections show only current workflow-linked Gmail setup and readiness, with no dead legacy notification-sender feature on screen.

**Current state / intended end state.**

Current: The current connector catalog includes Gmail (legacy notification sender) with a governance-closed/no-setup description. Admin connection navigation also mentions that legacy path. Workflow-linked Gmail reads, labels/replies and unsent drafts are the supported application lane; client-facing Gmail sends and retired keys remain closed.

Required end state: The obsolete legacy card, setup affordances and explanatory navigation copy disappear from the product. Current workflow Gmail connection/readiness, internal transactional notices, Admin governance and existing historical receipts remain intact. If an old route is still externally addressable it preserves authorization and safely points to the supported destination or a concise retired state without suggesting activation.

The 2026-10-04 guarded Admin inspection read the canonical application's version as e106a88a50d541b4a012111019b09c2183f6ce20 / pmi-kc-app-rmusp7ehl-7ea8703905ca and inspected initial Dashboard, desk, lease workspace, Communications, Connections, and Admin screens. Its completed pass recorded zero mutation attempts. This establishes those observed presentations only; it does not establish failure handling, persistence, AI inference, all roles, accessibility certification, or a new release. Earlier failed access attempts remain failed. Customer values, raw reports, captures, profiles, and credentials remain outside Git.

**Actors and entry conditions.**

Authorized staff view Connections; Admin views existing configuration/governance. Verification stays effect-free. Retirement changes product visibility and compatible routing only, not secrets, OAuth configuration, provider credentials or send authority.

**What it is / how it functions.**

This is one finalized change in batch 005, handoff application-usability-reliability-2026-10, registered in the canonical suite index. The owner accepted the recommendations on 2026-10-04 and requested specifications plus a launch prompt; authoring does not start execution. The future launch instruction selects only this program. Read the program contract in README.md and AGENTS.md; completed, superseded, and unrelated suites remain baselines rather than queued work.

Use the current owners below as verified starting points, then discover every actual consumer within this scope. They are not a frozen selector allowlist. The architecture obligations define the bounded change; the behavior outcomes define the observable success, failure and recovery. Before implementation, bind each trace row to actual tests/readbacks in the native evidence. A missing behavior must fail on the starting source for its intended reason; already-correct behavior gets preservation evidence.

**In scope / out of scope.**

Remove the closed legacy notification-sender entry and its references/affordances from default Admin/Connections UI. Audit current consumers before removing unused presentation code. Preserve supported workflow Gmail and independent internal notices. Deleting stored credentials, historical records, send-refusal tests or Registry entries is out of scope.

**Open questions & assumptions.**

Source establishes the legacy card has no setup step and is closed, so no V1 scoping clarification remains. If a historical data identifier is shared with a supported consumer, preserve the identifier internally and remove only its obsolete product representation.

No material product question remains for this authored scope. Ordinary implementation choices are resolved from current evidence. Missing authority or real customer/provider input blocks only its exact effect and is never guessed.

**Cross-product impacts.**

Inspected starting owners:

- `lib/connections/connector-catalog.ts`
- `lib/navigation/admin-connections.ts`
- `components/connections/ConnectionCenter.tsx`
- `components/connections/ConnectorCard.tsx`
- `app/connections/page.tsx`
- `app/admin/gmail-inbox-zero/page.tsx`

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

- **ARCH-S179-1** — Inventory legacy connector/navigation/presentation consumers and distinguish supported workflow Gmail and internal notices before editing. Remove dead product entries at the catalog/navigation boundary instead of hiding them with CSS or leaving inert clickable setup controls. Structural falsification uses the associated requirement/AC rows below on the starting owners; record the actual check and before/after result.
- **ARCH-S179-2** — Preserve existing authenticated routes and historical/internal identifiers when necessary; a retained legacy entry point has a bounded retired/redirect response and no activation or mutation path. Current workflow Gmail setup, status and Admin recovery keep their real owners. Structural falsification uses the associated requirement/AC rows below on the starting owners; record the actual check and before/after result.
- **ARCH-S179-3** — Keep Action Registry, authentication, secret bindings and notification transport contracts unchanged. Presentation retirement tests verify both absence of obsolete setup and preservation of supported/closed behavior. Structural falsification uses the associated requirement/AC rows below on the starting owners; record the actual check and before/after result.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S179-1** — No default product surface advertises the closed legacy feature or asks the user to configure it. Deterministic falsification: Render all connector/Admin views for staff/Admin and search their actual accessible content; hidden-with-CSS, dead card or leftover promoted link fails.
- **BEH-S179-2** — Current Gmail setup and action states preserve their identity and exact contracts. Deterministic falsification: Compare healthy/checking/missing/denied states before and after; deleting the supported Gmail connector or falsely claiming readiness fails.
- **BEH-S179-3** — Removing a display entry does not change delivery/configuration semantics or delete stored provider data. Deterministic falsification: Exercise the existing internal-notice and historical-read contract with local adapters; a shared identifier removed or secret cleanup dispatched fails.
- **BEH-S179-4** — A bookmarked legacy path does not become an unauthorized page, blank screen or dead setup workflow. Deterministic falsification: Open old path as authorized and unauthorized actors; missing guard, accidental activation or unexplained blank state fails.
- **BEH-S179-5** — Retirement grants no provider action and no automatic notification or draft is created. Deterministic falsification: Inspect diff and run current send/action-gate tests; a key change, auth change or send call fails the slice.
- **BEH-S179-6** — Product references are removed or accurately rewritten; archival/internal references retain their true purpose. Deterministic falsification: A broad string deletion removes refusal coverage or supported source records while a snapshot still passes; owner/reference and preservation checks fail.

**Human litmus outcome.**

### See one supported Gmail connection

**If this was built correctly:** An Admin opens Connections and sees the current workflow Gmail connection and its real next step. There is no obsolete notification-sender card or dead setup link. Existing Gmail work and internal attention notices still function within their current boundaries.

- Model verdict: NOT RUN — specification-only; implementation runner records PASS or FAIL against every trace row with actual evidence.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                                                                                                                                 | Architecture outcome | Behavior outcome | Human litmus                       | Deterministic evidence / falsification                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S179-1 — Remove the obsolete Gmail legacy notification-sender card and any setup button or default Admin/Connections description promoting it.            | ARCH-S179-1          | BEH-S179-1       | See one supported Gmail connection | AC-S179-1; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S179-2 — Keep the supported workflow Gmail connection, readiness, manual reads, labels/replies and governed unsent draft controls reachable.              | ARCH-S179-2          | BEH-S179-2       | See one supported Gmail connection | AC-S179-2; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S179-3 — Preserve internal transactional notices, in-app attention and historical receipts/configuration values that are independent of the retired card. | ARCH-S179-3          | BEH-S179-3       | See one supported Gmail connection | AC-S179-3; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S179-4 — Give any still-supported old deep link a truthful guarded retirement or supported-destination path without an activation affordance.             | ARCH-S179-2          | BEH-S179-4       | See one supported Gmail connection | AC-S179-4; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S179-5 — Keep all client-send/closed-key refusals and current credential, OAuth and Action Registry configuration unchanged.                              | ARCH-S179-3          | BEH-S179-5       | See one supported Gmail connection | AC-S179-5; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S179-6 — Verify removal from current rendered consumers and source references without erasing legitimate historical/security evidence.                    | ARCH-S179-1          | BEH-S179-6       | See one supported Gmail connection | AC-S179-6; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |

Every row is a completion obligation, including boundary and recovery behavior. Native implementation evidence names each actual test/readback, environment, observed result and any precise unavailable seam. Unit/adapted evidence, compiled-browser evidence, guarded production reads and human observations retain their separate meanings.

**Preservation set.**

Existing authenticated routes and direct guards; current staff/Admin/Vendor and private-account boundaries; complete/partial source and freshness meanings; all-lease visibility and current working values; source differences and notice invalidation; receipt/ambiguity recovery; editable as-displayed unsent drafts; no-send and closed-key refusals; compatible query/return links; keyboard, touch, themes, reduced motion and existing mobile workflows. Any preservation failure fails the slice independently of a visual or timing improvement.

Retain the existing relevant owning tests and add missing preservation checks where the inspected baseline lacks them. Do not weaken a preserved assertion to make a visual, performance or wording change pass. The full native gate remains required for implementation delivery.

**Adversarial acceptance checks.**

- **AC-S179-1** — Verify R-S179-1 through ARCH-S179-1, BEH-S179-1 and the "See one supported Gmail connection" litmus: Render all connector/Admin views for staff/Admin and search their actual accessible content; hidden-with-CSS, dead card or leftover promoted link fails.
- **AC-S179-2** — Verify R-S179-2 through ARCH-S179-2, BEH-S179-2 and the "See one supported Gmail connection" litmus: Compare healthy/checking/missing/denied states before and after; deleting the supported Gmail connector or falsely claiming readiness fails.
- **AC-S179-3** — Verify R-S179-3 through ARCH-S179-3, BEH-S179-3 and the "See one supported Gmail connection" litmus: Exercise the existing internal-notice and historical-read contract with local adapters; a shared identifier removed or secret cleanup dispatched fails.
- **AC-S179-4** — Verify R-S179-4 through ARCH-S179-2, BEH-S179-4 and the "See one supported Gmail connection" litmus: Open old path as authorized and unauthorized actors; missing guard, accidental activation or unexplained blank state fails.
- **AC-S179-5** — Verify R-S179-5 through ARCH-S179-3, BEH-S179-5 and the "See one supported Gmail connection" litmus: Inspect diff and run current send/action-gate tests; a key change, auth change or send call fails the slice.
- **AC-S179-6** — Verify R-S179-6 through ARCH-S179-1, BEH-S179-6 and the "See one supported Gmail connection" litmus: A broad string deletion removes refusal coverage or supported source records while a snapshot still passes; owner/reference and preservation checks fail.

**Forbidden actions / hard gates.**

No client send, autonomous provider action, proof rerun, fabricated production record, new Action Registry key/activation, permission/claim/identity change, credential-store substitution, cost/guardrail change, or unrelated feature execution. Existing source updates and unsent Gmail drafting keep their exact human preview/confirmation, claim, receipt, readback, and correction contracts. A cancel, timeout, navigation, or client abort never proves an external operation stopped. Preserve Production/Live, managed identity, eleven Spaces, Demo=false and the reviewed Sheet switch. Protected paths retain AGENTS.md's owner-direction requirement; design this program through existing interfaces without assuming a protected-path grant.

**Dependencies / sequencing.**

S87 reconciles related wording, S170 pending/readiness and S175 Communications preserve current setup paths. This slice is independently verifiable without connecting Gmail or dispatching any notice. S181 verifies the complete navigation.

**Standalone delivery contract.**

- **Deliverable now:** Removed legacy UI entry/references, compatible guarded old-route handling where needed, and catalog/navigation/send-refusal preservation tests.
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
