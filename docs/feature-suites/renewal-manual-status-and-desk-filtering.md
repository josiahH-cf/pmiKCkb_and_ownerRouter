<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-operator-hub-v1 -->

# S119 — Audited manual work status and matching renewal-table filters

> Status: IMPLEMENTED at `2c810eb1` (integrated on main); serialized release not yet performed. verify.sh, core E2E
> and both compiled renewal browser checks passed on the integrated head. Human verdict: NOT RUN — no human observer.

**Repository:** `josiahH-cf/pmiKCkb_and_ownerRouter` (`pmi-kc-kb`).  
**Canonical file:** `docs/feature-suites/renewal-manual-status-and-desk-filtering.md`.  
**Authoring baseline:** `e903b68aa4efa2462f565f225d562924a57ccf8b`; re-read current main before implementation.  
**Requested execution order:** S114 → S115 → S116 → S117 → S118 → S119 → S120. This is feature 6 of 7 in this request, not the earlier September 14 batch.

**Goal.**

Let an operator select and save the lease’s current work status, see who recorded it and when, and filter the global lease table by that same status to resume the right work. This is a manual tracking annotation, not automatic process advancement or provider verification.

**Current state / intended end state.**

The header in `RenewalWorkspace.tsx` currently displays derived overall status and process/manual stage. `workspace-state.ts` already records audited manual activities/outcomes by actor and cycle and derives next activity, waiting party and completion. The desk query/projection carries existing overall status, stage, source and party filters. There is no separately saved free-standing manual status dropdown in the inspected header.

The user explicitly wants a simple dropdown followed by Save and a log of the state/recorder, including waiting on owner or tenant response and verifying rent. The transcript corrects “messaged tenants” into the waiting-on-tenant state and explicitly defers automatic status-setting. Preserve the existing derived verification/completion model instead of making the new field impersonate it.

**Actors and entry conditions.**

Use existing authorized Renewals read/edit capabilities and server-derived actor identity. Readers can view/filter; users with ordinary app-owned edit permission save the annotation. Do not grant roles or require a provider action key for an app-owned status save. Preserve current inspection-only mutation restrictions; a status cannot make an otherwise restricted lease executable.

**What it is / how it functions.**

### R119.1 — Explicit manual dropdown, Save and readable recorder

Place a clearly labeled **Work status (recorded by staff)** control with the lease-level information established by S114. Make the current saved value discoverable in the compact lease context and in the table. Selecting an option changes only the local selection; **Save status** persists it and shows the actual result. Leaving without saving or a failed save must not report the selection as durable.

Use these bounded workflow meanings, derived from the existing renewal sections and the user’s examples: **Verifying lease and rent; Preparing market comparison; Preparing owner outreach; Waiting on owner response; Preparing tenant offer; Waiting on tenant response; Preparing lease documents / Dotloop; Waiting on signatures; Completing follow-up; Non-renewal handoff; Complete — staff status**. An unset field displays **Not recorded** rather than inventing a status from existing derived progress. Do not create a duplicate “messaged tenants” state, arbitrary user-defined status designer or automatic classifier.

The saved state includes the exact lease identity, selected status, server-derived recorder and recorded timestamp. Show a readable staff identity and time; retain the stable recorded actor reference even if a display name later becomes unavailable. A small history disclosure exposes status changes with prior/new values and recorder/time so staff can understand and resume work. Do not require an invented reason, recipient, source quote or verification checklist simply to save this manual annotation.

### R119.2 — Keep manual status distinct from evidence and completion

This field reports where staff say the work stands. It does not record owner approval, tenant acceptance, message delivery, a completed checklist item, a signature, an exact system-of-record update or provider success. Choosing Complete — staff status does not call `complete`, satisfy required obligations, alter an approval or hide unsynchronized source work. Existing derived status, blockers, next action and staff/provider completion attribution remain available and honestly labeled.

Do not require resolved rent or all downstream facts to record that the work is currently **Verifying lease and rent**. A known authenticated lease and applicable existing edit permission are the necessary identity/access basis; unrelated provider failures cannot be treated as status completion. The annotation must not manufacture a renewal cycle merely to save a dropdown. Associate the current cycle when one exists, preserve historical status attribution on rollover, and make a previous-cycle value distinguishable rather than silently claiming it was recorded for a new cycle. Use the existing app-owned version/audit patterns, not a second task or ticket system.

Status changes are manual only in this feature. A later background classifier, reminders, email resending and automatic assignments are not requested. “Filter waiting owners and resend” means help a person find the leases; it is not authority for a bulk-send action.

### R119.3 — Table filtering and exact return context

Project the same durable manual status into the global renewal table and expose a filter for it, including Not recorded. Do not overwrite the existing overall verification/waiting/completion filter or infer one from the other. A person can combine staff status with the table's existing owner/tenant, date, scope, source and sort choices. Filtering uses current authorized data, not just already visible rows, and empty/unavailable results retain their true meanings.

Include the new filter in the existing canonical query/continuation contract so a table → lease → Save status → Back journey restores the requested view. A lease whose saved status no longer matches the filter may correctly leave that result set; do not lose the filter to keep the row visible. Old bookmarks without this optional filter keep working. Reuse opaque party-filter tokens and prevent customer/actor identifiers from being leaked through an unnecessary new URL representation.

### R119.4 — Save integrity and recovery

Reuse the application's current versioned app-owned persistence and audit conventions: server-owned lease/actor validation, expected-state conflict handling and duplicate-operation protection where already used. Two staff members updating a stale view must receive a clear conflict/current value rather than silent history loss; a lost save response is resolved by reading the saved state/history, not by manufacturing duplicate log entries. Ordinary refresh/navigation does not write status. A saved status is re-read in the sidebar and desk; a failed/unavailable read is not rendered as Not recorded or Complete.

**In scope / out of scope.**

Only the bounded manual status, change attribution/history and matching global desk filter/continuation are new. No new task management product, automatic advancement, source write, customer communication, reminder/timing policy, analytics, custom status builder or rewrite of existing process history is included.

**Open questions & assumptions.**

No unresolved decision remains. The initial labels express the existing workflow, and automatic status selection is explicitly deferred by the transcript. This is deliberately independent of derived verification and checklist/provider completion; the manual record cannot waive them. It is an app-owned lease annotation, not a RentVine lease-status setter.

**Cross-product impacts.**

Inspect and reuse `components/lease-renewal/RenewalWorkspace.tsx`, `RenewalDeskTable.tsx`, `RenewalManualWorkspace.tsx`; `lib/lease-renewal/workspace-state.ts`, `desk-model.ts`, `live-desk.ts`, `desk-query.ts`, `desk-query-v2.ts`, `desk-view-continuation.ts`; `lib/firestore/renewal-workspace.ts`; the owning workspace API under `app/api/lease-renewal/workspace/`; and current role/action governance. Extend the minimum owning app state/query surfaces needed without introducing a parallel progress engine.

During implementation update only the operator guide, table/status documentation and current-state evidence affected by this manual field. Source and provider progress schemas and their old receipts retain their historical meaning.

**Authority and evidence map.**

| Source                                                                                                                               | Classification                                               | Application here                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`; current committed code and actual readbacks; `docs/facts.md`                                                            | Governing repository boundaries and implementation evidence  | Re-establish current truth before implementation. The earlier September 14 features and S113 are the baseline, not work to repeat. Older contradictory “candidate-only” prose does not override current code and facts.                              |
| The owner's September 15 renewal notes, transcript, summary, mindmap and supplied 19-page application capture                        | Requested product intent and reported behavior               | The requirements below incorporate the relevant details. “Rent volume” is RentVine; the spoken “Excel” is the configured Google operating Sheet. These private source materials need not be imported or available in an implementation conversation. |
| Owner acceptance of Q1A, Q2A and Q3A                                                                                                 | Resolved specification decisions                             | Where relevant, this file states the complete accepted rule. Acceptance was not a live-write, integration-activation or send authorization.                                                                                                          |
| `docs/autonomous-agent-runner.md`, `docs/environment-handoff.md`, `docs/feature-suites/TEMPLATE.md`, `docs/feature-suites/README.md` | Existing implementation, specification and release contracts | Use the existing complete loop below. No new release process, extra independent review gate or blanket PR requirement is introduced.                                                                                                                 |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S119-1** — A server-attributed manual lease annotation and audit are separate from the existing derived process, activity, approval and provider-evidence state.
- **ARCH-S119-2** — One saved projection feeds sidebar, compact context and desk filtering/continuation; absent, unavailable and previous-cycle states cannot be conflated.
- **ARCH-S119-3** — Existing authorized versioned-save/readback patterns preserve recorder/history under stale updates, duplicates and response loss without provider effects.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S119-1** — Select, save and reload a bounded manual status and see who recorded it and when, without completing any other work.
- **BEH-S119-2** — Filter the global table by that exact status, combine existing filters and return from an edited lease with the canonical view intact.
- **BEH-S119-3** — Unset/unavailable/previous-cycle values and save conflicts remain honest and recoverable; no automatic classification or history loss occurs.

**Human litmus outcome.**

### Find the leases waiting on owners and see who marked them

**If this was built correctly:** An operator saves Waiting on owner response, sees their recorded identity and time, and later filters the lease table to that group. The filter survives opening and returning from a lease. The label helps staff resume work but never claims that an email was sent, terms were approved or a source was verified.

The implementation runner records the model verdict with actual evidence. Record `Human verdict: NOT RUN — no human observer` when no observer is present; do not invent human acceptance or add it as a release gate.

**Requirement-to-outcome traceability.**

| Requirement                                               | Architecture             | Behavior / human litmus         | Evidence / falsification                                                                    |
| --------------------------------------------------------- | ------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------- |
| R119.1 explicit save, bounded labels and recorder/history | ARCH-S119-1, ARCH-S119-3 | BEH-S119-1; find waiting owners | Selection versus durable save, reload and readable attribution; AC-S119-1.                  |
| R119.2 annotation/evidence/cycle separation               | ARCH-S119-1              | BEH-S119-1, BEH-S119-3          | Complete annotation leaves obligations/keys unchanged; prior cycle explicit; AC-S119-2.     |
| R119.3 same-status table filtering and continuation       | ARCH-S119-2              | BEH-S119-2                      | Combined filters, old bookmarks, membership change and Back; AC-S119-3.                     |
| R119.4 authorized save/conflict/readback                  | ARCH-S119-3              | BEH-S119-3                      | Forged actor/lease, stale update, lost response, duplicate and unavailable read; AC-S119-4. |

**Preservation set.**

Preserve existing workspace/manual-cycle/derived-guidance, desk query/continuation, scope/role and app-owned versioned-save tests. Existing staff completion, source verification, owner/tenant outcomes and provider receipts remain unchanged. Retain existing `tests/unit/s113-dashboard.test.tsx`, desk copy/guide controls and independent desk readback evidence with intentional new filter coverage in the same harness.

**Adversarial acceptance checks.**

- **AC-S119-1** — R119.1 / ARCH-S119-1 / BEH-S119-1: a selected value is not durable until successful Save; reload displays exactly the saved value, recorder/time and corresponding history event. No required reason or duplicate tenant-message state is added.
- **AC-S119-2** — R119.2 / ARCH-S119-1 / BEH-S119-1,3: choose waiting/complete/manual verification states with unrelated workflow gaps. They cannot satisfy owner approval, source agreement, checklist completion or provider execution. New-cycle handling preserves attribution without fabricating a cycle/status.
- **AC-S119-3** — R119.3 / ARCH-S119-2 / BEH-S119-2: combined staff-status/party/date filters use the same saved projection, old bookmarks remain valid, and Back restores the exact query after a status changes result membership.
- **AC-S119-4** — R119.4 / ARCH-S119-3 / BEH-S119-3: reject forged actor/unauthorized lease and stale concurrent saves; resolve uncertain save results through readback without duplicate history. An unavailable read is not interpreted as an empty status. No provider request or automatic state update occurs.

**Forbidden actions / hard gates.**

Preserve managed identity, Renewals Space and role checks; exact Action Registry authority; the Production + Live boundary; and the distinction between source facts, staff reports and provider-verified effects. Never add autonomous/bulk/model-triggered writes or client sends. Gmail initiation ends in an explicitly confirmed unsent draft; a person sends. A link, a saved fact, a chosen status or a checked business decision is not a provider-effect receipt.

Do not widen action keys, change protected paths without their separately required authority, manufacture customer values, use test data in production, rerun completed provider proofs, or add new accounts, dependencies, services, background processes or billing headroom. Preserve `firestore.rules`, `lib/integrations/action-gate.ts`, `lib/auth/**`, action-seed activation flags, budget guards and `scripts/auth/**` under the router's protected-path rules. Customer values, source exports, message bodies, credentials and raw live evidence remain outside Git. Use deterministic synthetic data only in automated tests.

**Dependencies / sequencing.**

Begin only after S118 completes its applicable release; this is serialization of the requested features, not a functional dependency on having market evidence. Functionally consume S114’s current lease-level information surface and the existing desk/persistence contracts. S120 must preserve this annotation without using it as an approval/delivery input. No preceding implementation conversation is needed.

**Standalone delivery contract.**

**Deliverable now:** the complete audited manual status/control/filter/return slice and its own release. **Consumes, but does not assume:** current authenticated lease identity, ordinary app-owned edit authority and existing optional cycle context. **Externally blocked effect:** none; this feature performs no provider mutation or send. **Produces for downstream suites:** a consistently labeled manual status and history that remain separate from actual process evidence.

**Verification and delivery contract.**

This is a future implementation handoff. Authoring or importing this Markdown is not implementation or release completion.

1. **Re-ground from a fresh context.** Read `AGENTS.md` and `docs/README.md`, then current `docs/facts.md`, `docs/loop-state.md`, `docs/open-blockers.md`, `docs/plan.md`, this file, the relevant owning contracts listed here, and `docs/environment-handoff.md`. Inspect the actual checkout, diff, current main, relevant code and read-only application state; preserve unrelated/user-owned changes. On the approved implementation host run `npm run auth:ensure` using the existing approved identity/store. A human authentication challenge pauses only its dependent phase; never substitute an identity or request secrets. Do not reuse a preceding conversation's source snapshot, lease state, release receipt, candidate or rollback revision.
2. **Establish this feature's evidence.** Record its current behavior and the smallest applicable preservation baseline. Materialize the architecture/behavior falsifications below before the implementation edit, using the existing test harnesses. A requirement already satisfied is preserved, not broken to fabricate fail-first evidence. A historical test-pass claim is not a new result. Implement only this objective, including its applicable error, partial-result and recovery paths.
3. **Run the existing gates for the changed slice.** Run focused tests and an intentional adversarial case, retaining preservation results separately. From the repository root in the documented WSL/native Node environment run:

   ```bash
   bash scripts/verify.sh
   npm run test:e2e:core
   ```

   `scripts/verify.sh` already performs the lockfile install, formatting, lint, type checks, units, Firestore/backend tests, router/falsification/context/path/spec-traceability/copy/redaction gates, budget guard and production build. Keep the documented two-worker Vitest ceiling. Exercise the existing applicable compiled renewal-desk and renewal-guide browser checks; use the existing navbar/theme coverage when this slice touches their shared controls. Do not replace or relax those checks, freshness requirements, role coverage, deadlines or failure accounting. No new blanket test or review program is required by this specification.

4. **Review and record the bounded result.** Audit the diff, secrets/PII, source destinations, exact action gates, runtime configuration, protected paths and rollback. Update only documentation made inaccurate by this feature, including its named operator/control references and the existing facts/status/plan/loop-state records. Do not claim deployed behavior before release. Keep private source captures and receipts outside Git.
5. **Integrate a green feature.** The router permits a green commit/push directly to `main`. When the actual checkout uses a feature branch, complete its applicable existing merge/integration path into `main`; do not invent a mandatory PR or bypass an applicable repository restriction. Preserve unrelated changes and never force-push, rewrite history, delete branches or create a release tag. Require successful CI for the exact integrated main SHA, not merely the branch or PR SHA.
6. **Complete this feature's serialized release.** Reuse the existing release watcher and lock described in `docs/environment-handoff.md`; do not start a competing watcher. `npm run release:watch:dry-run` is the documented print-only inspection. The existing watcher, or its documented `npm run release:watch:once` single-pass path only when it can run without competing ownership, carries the exact-main green change through the established driver. Follow that handoff's current arguments rather than inventing candidate identifiers. The required sequence is print-only plan, captured predecessor/configuration, zero-traffic Cloud Run candidate, exact commit/tag/revision anonymous smoke, authorized-domain and runtime readback, complete Admin assurance plus independent source reconciliation and monitoring, a fresh aggregate candidate-assurance receipt, then receipt-bound exact-revision promotion and 100% traffic readback. Production is project `pmi-kc-kb-prod`, region `us-central1`, service `pmi-kc-app`. Preserve its reviewed runtime identity, eleven Spaces, provider bindings, Sheet switch and allowance unless this feature explicitly changes a named business default in application code.
7. **Reach the actual completion boundary.** Complete the canonical-origin 300,000 ms observation with its immediate and end checkpoints and the bound promotion receipt. Independently read back `/api/version`, Ready state, exact serving commit/revision, traffic, runtime configuration, action state and the feature's applicable owning-page evidence. The current approved browser policy uses the enrolled owner Admin session and records Editor `not_run`; backend Editor/role tests remain required. Candidate and post-promotion assurance remain read-only with zero mutation attempts. The old exception for one exact historical predecessor is not reusable for a new failure. A required rollback must restore and verify the receipt-bound predecessor through the existing recovery path; preserve failed receipts/checkpoints and resume this same feature's loop, not the next feature. Diagnostics alone do not replace aggregate receipts or observation.
8. **Close and only then advance.** Record verified present truth in `docs/facts.md`, `docs/status.md`, `docs/plan.md`, `docs/loop-state.md` and this suite's status/evidence as applicable. Use `ALL_GATES_GREEN` only for passed applicable implementation and release gates; use `BLOCKED` for an exact unresolved required input/authority after independent fail-closed work, and `BUDGET_EXHAUSTED` only with an explicit user budget. Separately identify a resource-dependent live effect not exercised; do not call it operationally verified. A documentation-only import does not deploy an app, but the code/UI changes requested here do require their own release. Complete this feature's applicable cycle before beginning the next objective, then re-read the updated repository and project state as a fresh-context model.

**Ordered prompt sequence.**

1. Re-ground and inspect the derived current statuses, existing manual audit and canonical desk query.
2. Establish explicit-save/attribution, no-evidence-advance and filter/return falsifications.
3. Implement only the manual annotation/history/filter contract and existing recovery semantics.
4. Complete verification, integration and the exact release cycle, then re-ground before S120.

**Deletion/merge recommendation.**

Register this file once in the existing `docs/feature-suites/README.md` when importing it; use the suite ID, canonical path and sequence given above without replacing unrelated queue rows or marking work complete. No registration or queue edit has been performed by specification authoring. After implementation and applicable release completion, follow the repository's existing retirement rule only when every remaining requirement/dependency is represented by code, tests and current facts. Do not merge these features into one implementation followed by a single final deployment.

Import registration row for the existing suite table (add once; do not replace its other rows):

```markdown
| S119 | `docs/feature-suites/renewal-manual-status-and-desk-filtering.md` | SPECIFICATION READY; feature 6 of 7 in renewal-operator-hub-v1; implementation/release not started. |
```
