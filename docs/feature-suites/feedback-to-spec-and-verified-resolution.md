<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: application-usability-reliability-2026-10 -->

# S180 — Feedback reconciliation into specs and verified fixes

> Status: READY — finalized owner-accepted F14 of batch 005 on 2026-10-04; implementation and delivery NOT RUN. Spec authoring alone does not start execution.

**Goal.**

Relevant feedback informs the start and closure of each expressly authorized feature run, with traceable verification and honest unresolved or deferred status.

**Current state / intended end state.**

Current: Feedback already reaches support_reports, has Admin-only review and new/acknowledged/resolved transitions with append-only activity, and can trigger an existing metadata-only internal notice on submission. A bounded read-only 2026-10-04 query returned nine reports: six new, two acknowledged and one resolved. Topics included renewal completeness, date sort, inactive owners/properties, connection guidance and already resolved task materials. Reports predate newer releases and do not prove current defects. Rental permits, move-out redesign and a public website shortcut were explicitly deferred.

Required end state: The native runner reads relevant accessible feedback at feature-run start and before closure, verifies it against present source/live read-only state, maps in-scope reports to existing requirements or a confirmed repair, and records privacy-safe resolution evidence. Unrelated ideas stay inert pending clarification or in the accepted next-batch deferrals. Existing Admin controls remain the place for authorized report status changes; no unattended provider data cleanup or reporter messaging occurs.

The 2026-10-04 guarded Admin inspection read the canonical application's version as e106a88a50d541b4a012111019b09c2183f6ce20 / pmi-kc-app-rmusp7ehl-7ea8703905ca and inspected initial Dashboard, desk, lease workspace, Communications, Connections, and Admin screens. Its completed pass recorded zero mutation attempts. This establishes those observed presentations only; it does not establish failure handling, persistence, AI inference, all roles, accessibility certification, or a new release. Earlier failed access attempts remain failed. Customer values, raw reports, captures, profiles, and credentials remain outside Git.

**Actors and entry conditions.**

The authorized implementation runner uses its approved Admin read capability and the existing guarded/read-only evidence path; human Admins retain report transition authority. The current report may already be fixed, unresolved, duplicated, historical or outside scope. No impersonated Admin, bypassed report access or new role is allowed.

**What it is / how it functions.**

This is one finalized change in batch 005, handoff application-usability-reliability-2026-10, registered in the canonical suite index. The owner accepted the recommendations on 2026-10-04 and requested specifications plus a launch prompt; authoring does not start execution. The future launch instruction selects only this program. Read the program contract in README.md and AGENTS.md; completed, superseded, and unrelated suites remain baselines rather than queued work.

Use the current owners below as verified starting points, then discover every actual consumer within this scope. They are not a frozen selector allowlist. The architecture obligations define the bounded change; the behavior outcomes define the observable success, failure and recovery. Before implementation, bind each trace row to actual tests/readbacks in the native evidence. A missing behavior must fail on the starting source for its intended reason; already-correct behavior gets preservation evidence.

**In scope / out of scope.**

Bounded relevant feedback retrieval, present-state verification, native requirement/evidence linkage, scoped current defect repair and truthful existing status/recovery controls. Application defects within this selected suite's coverage may be repaired after falsification. New business capabilities, automated customer/provider record deletion, rental permits, move-out workflow redesign, website shortcut, new statuses, an autonomous feedback daemon and reporter messages are outside this run.

**Open questions & assumptions.**

All nine current records were accessible in the bounded query; their correctness and closure evidence were not reverified. A historical inactive-data report never grants deletion or hiding all inactive leases; validate current source, identity/status and existing visibility contracts. A future permission failure blocks only feedback retrieval/status work and must be recorded without claiming an empty queue.

No material product question remains for this authored scope. Ordinary implementation choices are resolved from current evidence. Missing authority or real customer/provider input blocks only its exact effect and is never guessed.

**Cross-product impacts.**

Inspected starting owners:

- `lib/firestore/support-reports.ts`
- `components/admin/SupportReportsPanel.tsx`
- `components/admin/SupportReportStatusControl.tsx`
- `app/api/admin/support-reports/route.ts`
- `app/api/report-issue/route.ts`
- `docs/autonomous-agent-runner.md`
- `docs/feature-suites/README.md`

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

- **ARCH-S180-1** — Add start/end feedback reconciliation to the existing runner/native suite workflow, with bounded complete relevant coverage and an explicit truncation/unavailable state. Keep raw report IDs/customer descriptions and bodies outside Git; use a private report-to-requirement map plus privacy-safe counts/categories and tested outcomes in current native evidence. Structural falsification uses the associated requirement/AC rows below on the starting owners; record the actual check and before/after result.
- **ARCH-S180-2** — Classify each relevant report using present owning source/tests and guarded readback: confirmed in-scope defect, already satisfied with current evidence, duplicate, needs clarification, or accepted deferred/out-of-scope work. Reuse existing suite requirements before adding a repair; unknown or unrelated ideas never append themselves to an execution queue. Structural falsification uses the associated requirement/AC rows below on the starting owners; record the actual check and before/after result.
- **ARCH-S180-3** — Keep status transitions on the existing Admin service/audit controls, truthful loading/error/recovery and original report content. Resolve only with evidence of the reported outcome; planning, specification readiness, implementation-only or a similar old test is not delivered resolution. An exact human-initiated status step retains its current boundary and never blocks independent code/release. Structural falsification uses the associated requirement/AC rows below on the starting owners; record the actual check and before/after result.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S180-1** — The run names retrieval time/scope/counts and every relevant report's disposition; no new schedule or background run is created. Deterministic falsification: Skip closure retrieval, exceed an unreported limit or fail access; treating the incomplete/unavailable source as no feedback fails.
- **BEH-S180-2** — Older feedback has current evidence or an explicit unresolved diagnostic state; report age and description alone prove neither defect nor resolution. Deterministic falsification: An older missing-lease or sort report is assumed fixed from release count alone; the reported-outcome check fails.
- **BEH-S180-3** — Each repair has current fail-first evidence and a requirement owner; duplicate reports map to one outcome. Deterministic falsification: A fresh rental-permit or unrelated business idea adds an implementation queue entry on its own; scope/authority validation fails.
- **BEH-S180-4** — Those ideas remain visible as deferred decisions and do not become acceptance blockers for this usability program. Deterministic falsification: Resolve or implement a deferred feature under a general feedback recommendation; the scope/closure check fails.
- **BEH-S180-5** — Current source/status/view defects are repaired where verified; inactive records and ambiguity retain their actual meaning. Deterministic falsification: Delete a provider record or hide historic/inactive leases merely because a report says remove; safety and inventory parity fail.
- **BEH-S180-6** — A report needing live/reproduction facts stays unresolved; an exact status action is human-initiated, audited/read back and never performed by a release proof. Deterministic falsification: Mark a spec, mock-only effect or unknown customer case resolved automatically; fabricated closure, unsupported status or unreceipted transition fails.
- **BEH-S180-7** — Triage/status work changes no original body or retention and sends no reporter/client message. Deterministic falsification: Inspect the transition diff/store and delivery calls; description overwrite, report deletion, new retention rule or outbound reporter message fails.
- **BEH-S180-8** — Git contains only non-sensitive report categories/counts and verified outcomes; private mappings remain outside uploads and a failed transition keeps its current state. Deterministic falsification: Include customer names/addresses/IDs in an evidence file, or show resolved after a failed transition; privacy/state checks fail.

**Human litmus outcome.**

### See feedback lead to a verified improvement

**If this was built correctly:** An Admin reviews feedback and can see which current problem was verified and addressed, what evidence supports it, and which ideas still need a decision. A report is not called resolved because someone wrote a plan or because an older deployment might have fixed it.

- Model verdict: NOT RUN — specification-only; implementation runner records PASS or FAIL against every trace row with actual evidence.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                                                                                                                                                            | Architecture outcome | Behavior outcome | Human litmus                                | Deterministic evidence / falsification                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S180-1 — Read and reconcile relevant feedback at the start and end of each expressly authorized feature run using the approved existing access path.                                 | ARCH-S180-1          | BEH-S180-1       | See feedback lead to a verified improvement | AC-S180-1; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S180-2 — Verify reported problems against current code/tests and guarded live state before calling them defects or already fixed.                                                    | ARCH-S180-2          | BEH-S180-2       | See feedback lead to a verified improvement | AC-S180-2; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S180-3 — Link confirmed in-scope defects to existing batch requirements and bounded repairs without automatically expanding the named program.                                       | ARCH-S180-2          | BEH-S180-3       | See feedback lead to a verified improvement | AC-S180-3; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S180-4 — Preserve accepted next-batch deferrals for rental permits, move-out business workflow redesign and the public website shortcut.                                             | ARCH-S180-2          | BEH-S180-4       | See feedback lead to a verified improvement | AC-S180-4; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S180-5 — Evaluate missing/inactive lease, owner/property and date-sort reports without silent provider/customer record deletion or default exclusion that violates all-lease access. | ARCH-S180-2          | BEH-S180-5       | See feedback lead to a verified improvement | AC-S180-5; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S180-6 — Require reported-outcome verification and actual delivered behavior before recommending a report's resolved transition; use only existing authorized Admin transitions.     | ARCH-S180-3          | BEH-S180-6       | See feedback lead to a verified improvement | AC-S180-6; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S180-7 — Keep report bodies, retention/hold meaning, existing metadata-only internal notices and private reporter identity intact without contacting anyone.                         | ARCH-S180-3          | BEH-S180-7       | See feedback lead to a verified improvement | AC-S180-7; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S180-8 — Keep native evidence privacy-safe and Admin loading/error/retry honest, including unavailable feedback during independent progress.                                         | ARCH-S180-1          | BEH-S180-8       | See feedback lead to a verified improvement | AC-S180-8; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |

Every row is a completion obligation, including boundary and recovery behavior. Native implementation evidence names each actual test/readback, environment, observed result and any precise unavailable seam. Unit/adapted evidence, compiled-browser evidence, guarded production reads and human observations retain their separate meanings.

**Preservation set.**

Existing authenticated routes and direct guards; current staff/Admin/Vendor and private-account boundaries; complete/partial source and freshness meanings; all-lease visibility and current working values; source differences and notice invalidation; receipt/ambiguity recovery; editable as-displayed unsent drafts; no-send and closed-key refusals; compatible query/return links; keyboard, touch, themes, reduced motion and existing mobile workflows. Any preservation failure fails the slice independently of a visual or timing improvement.

Retain the existing relevant owning tests and add missing preservation checks where the inspected baseline lacks them. Do not weaken a preserved assertion to make a visual, performance or wording change pass. The full native gate remains required for implementation delivery.

**Adversarial acceptance checks.**

- **AC-S180-1** — Verify R-S180-1 through ARCH-S180-1, BEH-S180-1 and the "See feedback lead to a verified improvement" litmus: Skip closure retrieval, exceed an unreported limit or fail access; treating the incomplete/unavailable source as no feedback fails.
- **AC-S180-2** — Verify R-S180-2 through ARCH-S180-2, BEH-S180-2 and the "See feedback lead to a verified improvement" litmus: An older missing-lease or sort report is assumed fixed from release count alone; the reported-outcome check fails.
- **AC-S180-3** — Verify R-S180-3 through ARCH-S180-2, BEH-S180-3 and the "See feedback lead to a verified improvement" litmus: A fresh rental-permit or unrelated business idea adds an implementation queue entry on its own; scope/authority validation fails.
- **AC-S180-4** — Verify R-S180-4 through ARCH-S180-2, BEH-S180-4 and the "See feedback lead to a verified improvement" litmus: Resolve or implement a deferred feature under a general feedback recommendation; the scope/closure check fails.
- **AC-S180-5** — Verify R-S180-5 through ARCH-S180-2, BEH-S180-5 and the "See feedback lead to a verified improvement" litmus: Delete a provider record or hide historic/inactive leases merely because a report says remove; safety and inventory parity fail.
- **AC-S180-6** — Verify R-S180-6 through ARCH-S180-3, BEH-S180-6 and the "See feedback lead to a verified improvement" litmus: Mark a spec, mock-only effect or unknown customer case resolved automatically; fabricated closure, unsupported status or unreceipted transition fails.
- **AC-S180-7** — Verify R-S180-7 through ARCH-S180-3, BEH-S180-7 and the "See feedback lead to a verified improvement" litmus: Inspect the transition diff/store and delivery calls; description overwrite, report deletion, new retention rule or outbound reporter message fails.
- **AC-S180-8** — Verify R-S180-8 through ARCH-S180-1, BEH-S180-8 and the "See feedback lead to a verified improvement" litmus: Include customer names/addresses/IDs in an evidence file, or show resolved after a failed transition; privacy/state checks fail.

**Forbidden actions / hard gates.**

No client send, autonomous provider action, proof rerun, fabricated production record, new Action Registry key/activation, permission/claim/identity change, credential-store substitution, cost/guardrail change, or unrelated feature execution. Existing source updates and unsent Gmail drafting keep their exact human preview/confirmation, claim, receipt, readback, and correction contracts. A cancel, timeout, navigation, or client abort never proves an external operation stopped. Preserve Production/Live, managed identity, eleven Spaces, Demo=false and the reviewed Sheet switch. Protected paths retain AGENTS.md's owner-direction requirement; design this program through existing interfaces without assuming a protected-path grant.

**Dependencies / sequencing.**

Runs at intake and closure alongside all selected batch005 features. S173/S177 cover date sort/views, S168/S178 cover confirmed completeness/lookup defects, and S87/S179 cover guidance/legacy setup. Existing S65/support controls remain the status baseline; S181 checks the start/end reconciliation.

**Standalone delivery contract.**

- **Deliverable now:** Native start/end reconciliation instructions, bounded access/completeness and report mapping, current falsification for relevant usability defects, and truthful preserved Admin transition controls. If a particular report needs missing human facts or a status confirmation, record that precise hold while completing independently testable implementation.
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
