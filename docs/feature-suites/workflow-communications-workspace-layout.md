<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: application-usability-reliability-2026-10 -->

# S175 — Clear workflow communication and message workspaces

> Status: READY — finalized owner-accepted F08 of batch 005 on 2026-10-04; implementation and delivery NOT RUN. Spec authoring alone does not start execution.

**Goal.**

Make linked messages easy to read, edit, copy and prepare as unsent Gmail drafts, with the current communication task leading the screen.

**Current state / intended end state.**

Current: The live Communications page already spans the viewport and stacks connection information, repeated workflow-boundary text and Admin fallback tools. Lease-linked message preparation and WorkflowCommunicationPanel expose existing editable drafts and actions. Increased width alone does not establish clearer hierarchy.

Required end state: Both the separate Communications page and owner/tenant email sections inside leases organize the selected workflow/message, editor or preview and its relevant actions first. Secondary setup, templates, labels, evidence and Admin recovery tools remain reachable on demand.

The 2026-10-04 guarded Admin inspection read the canonical application's version as e106a88a50d541b4a012111019b09c2183f6ce20 / pmi-kc-app-rmusp7ehl-7ea8703905ca and inspected initial Dashboard, desk, lease workspace, Communications, Connections, and Admin screens. Its completed pass recorded zero mutation attempts. This establishes those observed presentations only; it does not establish failure handling, persistence, AI inference, all roles, accessibility certification, or a new release. Earlier failed access attempts remain failed. Customer values, raw reports, captures, profiles, and credentials remain outside Git.

**Actors and entry conditions.**

Staff handling an existing renewal or maintenance communication and Admin using genuine recovery tools; the actor's connected managed mailbox and current workflow context remain authoritative.

**What it is / how it functions.**

This is one finalized change in batch 005, handoff application-usability-reliability-2026-10, registered in the canonical suite index. The owner accepted the recommendations on 2026-10-04 and requested specifications plus a launch prompt; authoring does not start execution. The future launch instruction selects only this program. Read the program contract in README.md and AGENTS.md; completed, superseded, and unrelated suites remain baselines rather than queued work.

Use the current owners below as verified starting points, then discover every actual consumer within this scope. They are not a frozen selector allowlist. The architecture obligations define the bounded change; the behavior outcomes define the observable success, failure and recovery. Before implementation, bind each trace row to actual tests/readbacks in the native evidence. A missing behavior must fail on the starting source for its intended reason; already-correct behavior gets preservation evidence.

**In scope / out of scope.**

Layout/hierarchy of both existing Gmail-related surfaces, readable editable content and nearby actions. No general inbox, new provider method, automatic draft, new template content or client send.

**Open questions & assumptions.**

Available threads, recipients, provider connection and resource links come from current verified runtime inputs. Blank pending-team resources remain accepted; no placeholder becomes a customer link.

No material product question remains for this authored scope. Ordinary implementation choices are resolved from current evidence. Missing authority or real customer/provider input blocks only its exact effect and is never guessed.

**Cross-product impacts.**

Inspected starting owners:

- `components/gmail-hub/GmailHubHome.tsx`
- `components/gmail-hub/LiveGmailWorkspace.tsx`
- `components/gmail-hub/WorkflowCommunicationPanel.tsx`
- `components/gmail-hub/AnticipatoryDraftComposer.tsx`
- `components/lease-renewal/RenewalMessagePreparation.tsx`
- `components/lease-renewal/RenewalNoticeDraftComposer.tsx`
- `app/globals.css`

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

- **ARCH-S175-1** — Existing workflow-context and draft-content owners remain the data/effect boundaries while presentation reorganizes their current controls. Structural falsification uses the associated requirement/AC rows below on the starting owners; record the actual check and before/after result.
- **ARCH-S175-2** — Reading/editing/preview and action regions adapt by task and viewport, retaining exact current draft and recipient bindings. Structural falsification uses the associated requirement/AC rows below on the starting owners; record the actual check and before/after result.
- **ARCH-S175-3** — Secondary tool disclosure and load/error states preserve current permissions, unsent truth and provider receipt/recovery behavior. Structural falsification uses the associated requirement/AC rows below on the starting owners; record the actual check and before/after result.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S175-1** — Users can identify and act on the current message without scanning unrelated tools. Deterministic falsification: Use populated, empty, checking, unavailable and Admin/non-Admin states; the actual task/recovery leads and secondary controls remain reachable.
- **BEH-S175-2** — Messages and actions fit without cramped content or excessive line length. Deterministic falsification: Render long messages, recipients, sources and validation at desktop, phone and zoom; editor/preview/actions remain readable and reachable.
- **BEH-S175-3** — The person knows what content the action uses and what it does. Deterministic falsification: Edit the displayed subject/body then invoke the existing test transports; compare copied/drafted content and forbid a send implication.
- **BEH-S175-4** — Message reorganization preserves the person's actual draft. Deterministic falsification: Switch audiences and disclosure/layout state with edited content and pending refinement; assert exact bindings and zero automatic provider creation.
- **BEH-S175-5** — Secondary tools remain findable without dominating normal work. Deterministic falsification: Verify Admin/non-Admin parity and delayed connection responses; one explicit entry reaches each supported recovery tool.
- **BEH-S175-6** — A simpler screen still says what must be reviewed or cannot run. Deterministic falsification: Use missing email, unverified resource, denied action and uncertain provider outcome; no unsafe draft/send becomes enabled or mislabeled.
- **BEH-S175-7** — A Gmail failure has an honest, safe recovery. Deterministic falsification: Lose a draft-create response, retry recovery and exercise unsupported draft update; assert no extra provider creation or false sent/completed claim.

**Human litmus outcome.**

### Prepare the message you can see

**If this was built correctly:** A person opens an owner or tenant message, sees who it is for, reads and edits the actual message, and finds Copy and Create Gmail draft beside it. Extra tools stay accessible without competing with that task.

- Model verdict: NOT RUN — specification-only; implementation runner records PASS or FAIL against every trace row with actual evidence.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                                                                                                                                                                                                                                                                      | Architecture outcome | Behavior outcome | Human litmus                    | Deterministic evidence / falsification                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- | ---------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S175-1 — Lead each surface with the current linked workflow, selected communication/audience and its current state. Place relevant message reading/editing/preview before secondary setup, Admin fallback, templates, label tools and repeated mechanics.                                      | ARCH-S175-1          | BEH-S175-1       | Prepare the message you can see | AC-S175-1; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S175-2 — Use readable message regions and sensible neighboring context instead of compressing many equal-weight boxes or making every text block full-width. On narrow screens stack in task order and keep actions within reach.                                                              | ARCH-S175-2          | BEH-S175-2       | Prepare the message you can see | AC-S175-2; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S175-3 — Put clearly labeled Copy and Create Gmail draft actions beside the actual current content, with truthful operation-owned feedback. Secondary actions use appropriate disclosure/hierarchy; no action looks clickable when it is unavailable or falsely implies sending.               | ARCH-S175-2          | BEH-S175-3       | Prepare the message you can see | AC-S175-3; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S175-4 — Preserve editable as-displayed subject/body, greetings, formatting, signature, audience/recipient and existing resource-input behavior. Reorganizing components must not revert edits, mix owner/tenant content or generate a draft merely by opening the region.                     | ARCH-S175-1          | BEH-S175-4       | Prepare the message you can see | AC-S175-4; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S175-5 — Collapse genuinely secondary Admin recovery/setup detail behind clear accessible entry points while retaining every supported tool and direct route. Show actual connection status compactly; checking is not already a missing-access error.                                         | ARCH-S175-3          | BEH-S175-5       | Prepare the message you can see | AC-S175-5; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S175-6 — Keep concise unsent-draft truth, required warnings, missing/ambiguous recipient/resource states, current source differences and exact confirmations at their decision points. Useful explanatory detail moves to accessible help; critical consequences never become hover-only.      | ARCH-S175-3          | BEH-S175-6       | Prepare the message you can see | AC-S175-6; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S175-7 — Retain the existing governed Gmail create/recovery/refinement semantics: successful creation means only an unsent draft; unavailable same-draft update has its disclosed existing alternative; an uncertain attempt uses its original receipt/reconciliation rather than blind retry. | ARCH-S175-3          | BEH-S175-7       | Prepare the message you can see | AC-S175-7; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |

Every row is a completion obligation, including boundary and recovery behavior. Native implementation evidence names each actual test/readback, environment, observed result and any precise unavailable seam. Unit/adapted evidence, compiled-browser evidence, guarded production reads and human observations retain their separate meanings.

**Preservation set.**

Existing authenticated routes and direct guards; current staff/Admin/Vendor and private-account boundaries; complete/partial source and freshness meanings; all-lease visibility and current working values; source differences and notice invalidation; receipt/ambiguity recovery; editable as-displayed unsent drafts; no-send and closed-key refusals; compatible query/return links; keyboard, touch, themes, reduced motion and existing mobile workflows. Any preservation failure fails the slice independently of a visual or timing improvement.

Retain the existing relevant owning tests and add missing preservation checks where the inspected baseline lacks them. Do not weaken a preserved assertion to make a visual, performance or wording change pass. The full native gate remains required for implementation delivery.

**Adversarial acceptance checks.**

- **AC-S175-1** — Verify R-S175-1 through ARCH-S175-1, BEH-S175-1 and the "Prepare the message you can see" litmus: Use populated, empty, checking, unavailable and Admin/non-Admin states; the actual task/recovery leads and secondary controls remain reachable.
- **AC-S175-2** — Verify R-S175-2 through ARCH-S175-2, BEH-S175-2 and the "Prepare the message you can see" litmus: Render long messages, recipients, sources and validation at desktop, phone and zoom; editor/preview/actions remain readable and reachable.
- **AC-S175-3** — Verify R-S175-3 through ARCH-S175-2, BEH-S175-3 and the "Prepare the message you can see" litmus: Edit the displayed subject/body then invoke the existing test transports; compare copied/drafted content and forbid a send implication.
- **AC-S175-4** — Verify R-S175-4 through ARCH-S175-1, BEH-S175-4 and the "Prepare the message you can see" litmus: Switch audiences and disclosure/layout state with edited content and pending refinement; assert exact bindings and zero automatic provider creation.
- **AC-S175-5** — Verify R-S175-5 through ARCH-S175-3, BEH-S175-5 and the "Prepare the message you can see" litmus: Verify Admin/non-Admin parity and delayed connection responses; one explicit entry reaches each supported recovery tool.
- **AC-S175-6** — Verify R-S175-6 through ARCH-S175-3, BEH-S175-6 and the "Prepare the message you can see" litmus: Use missing email, unverified resource, denied action and uncertain provider outcome; no unsafe draft/send becomes enabled or mislabeled.
- **AC-S175-7** — Verify R-S175-7 through ARCH-S175-3, BEH-S175-7 and the "Prepare the message you can see" litmus: Lose a draft-create response, retry recovery and exercise unsupported draft update; assert no extra provider creation or false sent/completed claim.

**Forbidden actions / hard gates.**

No client send, autonomous provider action, proof rerun, fabricated production record, new Action Registry key/activation, permission/claim/identity change, credential-store substitution, cost/guardrail change, or unrelated feature execution. Existing source updates and unsent Gmail drafting keep their exact human preview/confirmation, claim, receipt, readback, and correction contracts. A cancel, timeout, navigation, or client abort never proves an external operation stopped. Preserve Production/Live, managed identity, eleven Spaces, Demo=false and the reviewed Sheet switch. Protected paths retain AGENTS.md's owner-direction requirement; design this program through existing interfaces without assuming a protected-path grant.

**Dependencies / sequencing.**

S169-S172 govern lifecycle/layout, S87/S176 govern concise copy, S177 governs relevant remembered views. Preserve S113/S129 and deployed S139-S140/S161-S163 content and as-displayed drafting contracts.

**Standalone delivery contract.**

- **Deliverable now:** Both Communications and lease-message layouts with current-content/action parity, overflow, responsive and provider-refusal tests.
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
