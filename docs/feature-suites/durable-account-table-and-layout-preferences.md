<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: application-usability-reliability-2026-10 -->

# S177 — Durable personal table views and layout preferences

> Status: READY — finalized owner-accepted F11 of batch 005 on 2026-10-04; implementation and delivery NOT RUN. Spec authoring alone does not start execution.

**Goal.**

A person's deliberately chosen table view and useful desktop sizing follow their account across navigation, sign-out/sign-in and devices, with clear ways to clear filters or reset the view.

**Current state / intended end state.**

Current: Deployed S166 already stores renewal filters/sort per signed-in account through the renewal_desk_preferences service, honours explicit URL views and compatible return links, refuses verification-account saves, and recovers invalid preferences. Its canonicalDeskPreferenceView deliberately strips typed q/lease searches and does not persist column/panel sizes. This suite extends and verifies that real baseline instead of claiming no persistence exists.

Required end state: Each actual filterable/sortable table has its own validated account-owned view. Deliberate searches, filters, sort, supported column sizes/visibility/order and useful panel sizes persist where those controls actually exist. Explicit link views win for one visit without replacing personal memory. Responsive clamping and opening a linked record never overwrite the saved desktop choice. Clear filters and Reset view have distinct effects.

The 2026-10-04 guarded Admin inspection read the canonical application's version as e106a88a50d541b4a012111019b09c2183f6ce20 / pmi-kc-app-rmusp7ehl-7ea8703905ca and inspected initial Dashboard, desk, lease workspace, Communications, Connections, and Admin screens. Its completed pass recorded zero mutation attempts. This establishes those observed presentations only; it does not establish failure handling, persistence, AI inference, all roles, accessibility certification, or a new release. Earlier failed access attempts remain failed. Customer values, raw reports, captures, profiles, and credentials remain outside Git.

**Actors and entry conditions.**

Signed-in staff or an existing authorized Admin table user changes their own view through an actual control. The server derives ownership from the session and checks table access. Anonymous, Vendor-inapplicable and verification accounts receive their existing fail-closed behavior. Layout preferences never grant data access or decide whether a lease may be worked.

**What it is / how it functions.**

This is one finalized change in batch 005, handoff application-usability-reliability-2026-10, registered in the canonical suite index. The owner accepted the recommendations on 2026-10-04 and requested specifications plus a launch prompt; authoring does not start execution. The future launch instruction selects only this program. Read the program contract in README.md and AGENTS.md; completed, superseded, and unrelated suites remain baselines rather than queued work.

Use the current owners below as verified starting points, then discover every actual consumer within this scope. They are not a frozen selector allowlist. The architecture obligations define the bounded change; the behavior outcomes define the observable success, failure and recovery. Before implementation, bind each trace row to actual tests/readbacks in the native evidence. A missing behavior must fail on the starting source for its intended reason; already-correct behavior gets preservation evidence.

**In scope / out of scope.**

Deliberate personal view state for existing tables application-wide and actual resizable panels supplied by S173/S174. The renewal desk is the first required complete consumer. New controls are added only where supported by these specs; no global setting makes unrelated tables share a view. Open customer detail state, data snapshots, drafts and unrelated ephemeral modal state are not persisted as layout.

**Open questions & assumptions.**

Persisting typed searches is an accepted intentional extension of S166's prior exclusion. Keep these private account values out of Git, telemetry, support metadata and shared links unless the user deliberately follows the existing link mechanism. Use existing server-only ownership boundaries; no Firestore rules or auth/role change is assumed.

No material product question remains for this authored scope. Ordinary implementation choices are resolved from current evidence. Missing authority or real customer/provider input blocks only its exact effect and is never guessed.

**Cross-product impacts.**

Inspected starting owners:

- `lib/lease-renewal/desk-preferences.ts`
- `lib/firestore/renewal-desk-preferences.ts`
- `app/api/lease-renewal/desk-preferences/route.ts`
- `components/lease-renewal/RenewalDeskViewMemory.tsx`
- `lib/lease-renewal/desk-query-v2.ts`
- `lib/lease-renewal/desk-view-continuation.ts`
- `components/lease-renewal/RenewalWorkspaceSidebars.tsx`

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

- **ARCH-S177-1** — Extend the existing session-owned server preference seam with strict versioned, per-surface schemas and compatibility migration. Validate allowlisted keys, lengths, enums, widths and current authorized party tokens; no caller-supplied uid or arbitrary JSON. Keep direct Firestore access denied and refuse verification effects through existing policy. Structural falsification uses the associated requirement/AC rows below on the starting owners; record the actual check and before/after result.
- **ARCH-S177-2** — Define entry precedence and deliberate-write attribution once: explicit URL view, valid remembered account view, then current defaults. Track which dimensions a human changed. Link arrival, data load, source reconciliation, viewport clamp and default hydration perform no preference write. Saves are bounded and use honest pending/failed/retry state. Structural falsification uses the associated requirement/AC rows below on the starting owners; record the actual check and before/after result.
- **ARCH-S177-3** — Keep durable revision/conflict handling for concurrent choices across tabs/devices and separate desktop intent from rendered mobile bounds. Older saves cannot silently overwrite a newer acknowledged view; obsolete schema/table fields migrate or fall back safely without changing data. Clear filters and Reset view update the correct dimensions atomically. Structural falsification uses the associated requirement/AC rows below on the starting owners; record the actual check and before/after result.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S177-1** — Each table restores only its own complete view across navigation and a new login; a coverage matrix names inapplicable/nonexistent dimensions. Deterministic falsification: Choose a search plus date/month/owner filters and descending sort, leave/reopen/login, and switch to another table; lost dimensions or leaked table state fails.
- **BEH-S177-2** — Another account cannot read or write the preference through a forged uid/key, and restricted tables keep their route/server guards. Deterministic falsification: Try account A/B, anonymous, Vendor, verification account, overlong search, unknown table and malicious width payload; unauthorized data/effect or accepted arbitrary state fails.
- **BEH-S177-3** — Shared links and record returns remain exact; a later ordinary entry restores the person's own view. Deterministic falsification: Open an explicit filtered link and explicit default v=2, then ordinary entry; silent replacement of saved memory or saved filters overriding the link fails.
- **BEH-S177-4** — Both actions visibly change and durably save only their defined dimensions; neither resets unrelated tables or working/customer data. Deterministic falsification: Clear a populated saved view and later Reset it, then sign in again; sort/layout loss on Clear or another table's reset fails.
- **BEH-S177-5** — Phone/zoom remains usable and a later desktop retains the chosen desktop size. Deterministic falsification: Save a wide desktop panel, visit 390/320 px and 200% zoom, return wide; permanent shrink, off-screen controls or a preference write on resize event alone fails.
- **BEH-S177-6** — Reversed responses and concurrent tabs produce a defined revision/conflict outcome; current local work and acknowledged durable state remain honest. Deterministic falsification: Complete older writes after newer writes, change accounts in flight and close/reset before a reply; silent durable rollback, stale UI status or account leakage fails.
- **BEH-S177-7** — The person can continue work and retry the exact current preference after an offline/403/5xx failure. Deterministic falsification: Fail a save after a filter renders, then change it again and retry; discarded local view, endless spinner or old preference written as current fails.
- **BEH-S177-8** — Valid legacy filters/sort survive; bad fields fall back or are removed only from rendering, with no wider data exposure. Deterministic falsification: Seed old version, malformed document, removed column and stale party token; a crash, auto-write on read, lost valid sort or widened authorization fails.
- **BEH-S177-9** — Stored values are limited to the declared preference fields; routine evidence and diagnostics are value-free. Deterministic falsification: Inspect store payload, logs and feedback context after entering a private search; raw customer snapshot/body, search in Git or arbitrary saved payload fails.
- **BEH-S177-10** — Deterministic browser/service evidence establishes account durability and compatibility, with guarded live checks remaining read-only. Deterministic falsification: A localStorage-only implementation or a mocked hook passes but a fresh browser cannot restore the view; the integrated persistence gate fails.

**Human litmus outcome.**

### Return to the same worklist

**If this was built correctly:** The person filters and sorts a worklist, opens a lease, leaves and signs back in on another device. Their chosen view returns. A phone fits its own screen and a later desktop still has the chosen widths. Clear filters broadens the search; Reset view restores the whole default view.

- Model verdict: NOT RUN — specification-only; implementation runner records PASS or FAIL against every trace row with actual evidence.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                                                                                                                                                                           | Architecture outcome | Behavior outcome | Human litmus                | Deterministic evidence / falsification                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S177-1 — Persist the complete deliberate renewal view, including typed searches, filters, sort and actual column settings, and integrate every existing eligible table with a distinct surface key. | ARCH-S177-1          | BEH-S177-1       | Return to the same worklist | AC-S177-1; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence.  |
| R-S177-2 — Store preferences under the authenticated account with strict input validation and existing permission/verification restrictions.                                                          | ARCH-S177-1          | BEH-S177-2       | Return to the same worklist | AC-S177-2; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence.  |
| R-S177-3 — Honor explicit URL/assistant/return views for that visit without changing remembered state unless a person deliberately changes the view or explicitly remembers it.                       | ARCH-S177-2          | BEH-S177-3       | Return to the same worklist | AC-S177-3; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence.  |
| R-S177-4 — Make Clear filters remove typed searches and all filter criteria while retaining sort and layout, and make Reset view restore all defaults for the current table and its related layout.   | ARCH-S177-3          | BEH-S177-4       | Return to the same worklist | AC-S177-4; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence.  |
| R-S177-5 — Persist deliberate desktop column and useful panel sizes across devices while clamping current rendering to usable viewport bounds without saving the clamp.                               | ARCH-S177-3          | BEH-S177-5       | Return to the same worklist | AC-S177-5; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence.  |
| R-S177-6 — Prevent stale saves and delayed account/navigation responses from replacing a newer acknowledged choice or leaking a prior account's view.                                                 | ARCH-S177-3          | BEH-S177-6       | Return to the same worklist | AC-S177-6; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence.  |
| R-S177-7 — Keep immediate usable local view changes and honest saving, saved or failed status; failed preference persistence does not undo the task view or claim durability.                         | ARCH-S177-2          | BEH-S177-7       | Return to the same worklist | AC-S177-7; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence.  |
| R-S177-8 — Migrate existing S166 v1 views and safely ignore damaged, retired or no-longer-authorized values without rewriting preferences on read.                                                    | ARCH-S177-1          | BEH-S177-8       | Return to the same worklist | AC-S177-8; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence.  |
| R-S177-9 — Treat saved searches and view state as private preferences with bounded retention and safe logs; do not persist source/customer records or emit typed values in telemetry/support hints.   | ARCH-S177-1          | BEH-S177-9       | Return to the same worklist | AC-S177-9; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence.  |
| R-S177-10 — Verify remembered views through real server routes/store and compiled navigation with two sessions/devices, including clear/reset and no-write link/clamp entry.                          | ARCH-S177-3          | BEH-S177-10      | Return to the same worklist | AC-S177-10; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |

Every row is a completion obligation, including boundary and recovery behavior. Native implementation evidence names each actual test/readback, environment, observed result and any precise unavailable seam. Unit/adapted evidence, compiled-browser evidence, guarded production reads and human observations retain their separate meanings.

**Preservation set.**

Existing authenticated routes and direct guards; current staff/Admin/Vendor and private-account boundaries; complete/partial source and freshness meanings; all-lease visibility and current working values; source differences and notice invalidation; receipt/ambiguity recovery; editable as-displayed unsent drafts; no-send and closed-key refusals; compatible query/return links; keyboard, touch, themes, reduced motion and existing mobile workflows. Any preservation failure fails the slice independently of a visual or timing improvement.

Retain the existing relevant owning tests and add missing preservation checks where the inspected baseline lacks them. Do not weaken a preserved assertion to make a visual, performance or wording change pass. The full native gate remains required for implementation delivery.

**Adversarial acceptance checks.**

- **AC-S177-1** — Verify R-S177-1 through ARCH-S177-1, BEH-S177-1 and the "Return to the same worklist" litmus: Choose a search plus date/month/owner filters and descending sort, leave/reopen/login, and switch to another table; lost dimensions or leaked table state fails.
- **AC-S177-2** — Verify R-S177-2 through ARCH-S177-1, BEH-S177-2 and the "Return to the same worklist" litmus: Try account A/B, anonymous, Vendor, verification account, overlong search, unknown table and malicious width payload; unauthorized data/effect or accepted arbitrary state fails.
- **AC-S177-3** — Verify R-S177-3 through ARCH-S177-2, BEH-S177-3 and the "Return to the same worklist" litmus: Open an explicit filtered link and explicit default v=2, then ordinary entry; silent replacement of saved memory or saved filters overriding the link fails.
- **AC-S177-4** — Verify R-S177-4 through ARCH-S177-3, BEH-S177-4 and the "Return to the same worklist" litmus: Clear a populated saved view and later Reset it, then sign in again; sort/layout loss on Clear or another table's reset fails.
- **AC-S177-5** — Verify R-S177-5 through ARCH-S177-3, BEH-S177-5 and the "Return to the same worklist" litmus: Save a wide desktop panel, visit 390/320 px and 200% zoom, return wide; permanent shrink, off-screen controls or a preference write on resize event alone fails.
- **AC-S177-6** — Verify R-S177-6 through ARCH-S177-3, BEH-S177-6 and the "Return to the same worklist" litmus: Complete older writes after newer writes, change accounts in flight and close/reset before a reply; silent durable rollback, stale UI status or account leakage fails.
- **AC-S177-7** — Verify R-S177-7 through ARCH-S177-2, BEH-S177-7 and the "Return to the same worklist" litmus: Fail a save after a filter renders, then change it again and retry; discarded local view, endless spinner or old preference written as current fails.
- **AC-S177-8** — Verify R-S177-8 through ARCH-S177-1, BEH-S177-8 and the "Return to the same worklist" litmus: Seed old version, malformed document, removed column and stale party token; a crash, auto-write on read, lost valid sort or widened authorization fails.
- **AC-S177-9** — Verify R-S177-9 through ARCH-S177-1, BEH-S177-9 and the "Return to the same worklist" litmus: Inspect store payload, logs and feedback context after entering a private search; raw customer snapshot/body, search in Git or arbitrary saved payload fails.
- **AC-S177-10** — Verify R-S177-10 through ARCH-S177-3, BEH-S177-10 and the "Return to the same worklist" litmus: A localStorage-only implementation or a mocked hook passes but a fresh browser cannot restore the view; the integrated persistence gate fails.

**Forbidden actions / hard gates.**

No client send, autonomous provider action, proof rerun, fabricated production record, new Action Registry key/activation, permission/claim/identity change, credential-store substitution, cost/guardrail change, or unrelated feature execution. Existing source updates and unsent Gmail drafting keep their exact human preview/confirmation, claim, receipt, readback, and correction contracts. A cancel, timeout, navigation, or client abort never proves an external operation stopped. Preserve Production/Live, managed identity, eleven Spaces, Demo=false and the reviewed Sheet switch. Protected paths retain AGENTS.md's owner-direction requirement; design this program through existing interfaces without assuming a protected-path grant.

**Dependencies / sequencing.**

Extends S166. Consumes S173's column contract and S174's panel dimensions; design schemas alongside those controls. S170 supplies save feedback and S181 verifies navigation/account/device integration. Missing new dimension implementations do not discard the existing validated filters/sort.

**Standalone delivery contract.**

- **Deliverable now:** Account-private versioned preference service/migration, all actual eligible table consumers, search/sizing persistence, clear/reset actions, conflict/recovery paths and session/device/role tests. No provider input or new protected-path grant is required.
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
