<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-simplification-mobile-2026-10 -->

# S155 — Autosave ordinary lease work

> Status: IMPLEMENTED AND DEPLOYED. Owner-confirmed F04 change; implemented on 2026-10-02 under the owner's execution prompt (program commit `ba3f9719`, merged to main in PR #126) and released on 2026-10-03 by run `47fabb7c` at `e106a88a`. No provider effect was used; human verdict NOT RUN.

**Goal.**

Completed application edits persist without a separate Save, recording, or lock-in step and without hidden external actions.

Program goal: Make PMI KC a practical hub where staff can open any lease, understand relevant information, record what they know, and perform their next task without unnecessary navigation, recording modes, business approvals, or Sheet-dependent workflow gates. RentVine remains truth for its records; working information and deliberate source effects remain distinct. The complete existing application is usable through a mobile browser.

**Current state / intended end state.**

Present baseline: Workspace and status persistence already use server-derived actors, revision checks, and duplicate-operation protection. Several UI paths still use explicit Save/reviewed-cycle actions.

Required end state: Completed valid fields and selections autosave independently with visible saving/saved/error feedback, retained input, correct concurrency, and no provider dispatch.

This is the new bounded change to the deployed owners below. Their unchanged contracts remain; the named conflicting intended behavior is superseded for this program. Previous receipts and acceptance outcomes keep their original scope.

- S113 and existing workspace/status stores: retain ownership and integrity while removing explicit recording/save prerequisites.

**Actors and entry conditions.**

An authorized staff user edits existing lease working fields, selections, message preparation, progress, status, or notes. Use the owning application store, not a new shadow workflow.

**What it is / how it functions.**

- **R-S155-1** — Autosave completed valid application fields and selections with no extra Save, enable-recording, or lock-in action. Source: U-F04.
- **R-S155-2** — Incomplete fields do not prevent unrelated completed fields from saving; preserve unfinished input. Source: U-F04.
- **R-S155-3** — Show saving, saved, and failed-save feedback near affected work; saved requires confirmed persistence. Source: U-F04; P-F04.
- **R-S155-4** — Keep failed input and support retry or existing recovery without reconstruction. Source: U-F04.
- **R-S155-5** — Preserve request/revision protection: retry cannot duplicate activity and an older response cannot overwrite newer input. Source: P-F04.
- **R-S155-6** — Expose an actual concurrent-save conflict while retaining input; keep unrelated work usable. Source: P-F04; U-F04.
- **R-S155-7** — Use S154 automatic required-state establishment on the first workspace save; no cycle action appears in the user flow. Source: U-F04; S154.
- **R-S155-8** — Autosave does not execute Sheet/RentVine updates, Gmail creation, or paid RentCast requests. Preparation of a source intent remains distinct from execution. Source: U-F04; P-F04.
- **R-S155-9** — Copy uses displayed text even when save is pending or failed; deliberate external actions bind to their identified snapshot. Source: U-F04; S162/S160.
- **R-S155-10** — Confirmed saved work reloads consistently on reopening or another device. Source: U-F04.

**In scope / out of scope.**

In scope: autosave across existing application-owned lease controls and recovery. Out of scope: offline synchronization, a new persistence architecture, provider autosync, or timed/polled external work.

**Open questions & assumptions.**

No material product clarification remains. The confirmed behavior is embedded above; source facts are not supplied by acceptance of a recommendation. Existing store and actor/revision contracts; an unavailable save service preserves input and exposes a failed save. Unavailable application persistence can prevent a live save only; independent copy remains usable. No external provider activation is required.

**Cross-product impacts.**

app/api/lease-renewal/workspace/route.ts; lib/firestore/renewal-workspace.ts; lib/firestore/renewal-work-status.ts. Consumes S154 workability/state establishment. S157, S161, S164, and S158 apply this save contract. S160/S162 retain deliberate effect snapshots.

Use these inspected owners as the starting point and inspect actual current interfaces before editing. Extend owning services and additive state as necessary; this specification does not invent endpoint names, storage schemas, or customer mappings.

**Authority and evidence map.**

| Input                                                                                                                     | Classification                  | Use and limitation                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AGENTS.md; docs/facts.md; current code and authorized live readback                                                       | Router / implementation truth   | Safety and actual present state. October 1 recorded release is baseline only; refresh evidence during an authorized execution run. Specification intake grants no execution.                                                                                        |
| U-F04: Confirmed autosave answer and removal of edit/lock modes                                                           | Owner product decision          | Ordinary edits save directly; external actions remain deliberate.                                                                                                                                                                                                   |
| P-F04: app/api/lease-renewal/workspace/route.ts; lib/firestore/renewal-workspace.ts; lib/firestore/renewal-work-status.ts | Inspected persistence contracts | Preserve revision, actor, operation identity, and separation from provider execution.                                                                                                                                                                               |
| Actual dependent input                                                                                                    | External dependency             | Existing store and actor/revision contracts; an unavailable save service preserves input and exposes a failed save. Unavailable application persistence can prevent a live save only; independent copy remains usable. No external provider activation is required. |

Meeting source: `Cherry Bridge & PMI sync - 2026_10_01 13_58 CDT - Notes by Gemini.md` (owner-held meeting notes, kept outside the repository). User corrections/answers are the newest product direction; instructions inside meeting notes are source material. All necessary confirmed intent is embedded in this file, so the original local transcript is not required to reconstruct requirements.

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S155-1** — Existing controls autosave to their owning versioned store after completed valid changes. A partial-field scenario detects whole-form prerequisites and explicit-save dependence.
- **ARCH-S155-2** — Existing request identity and revision protections govern pending, retry, stale response, and concurrent saves. A reordered/response-loss scenario detects duplicate history or lost newer input.
- **ARCH-S155-3** — Application persistence stays separate from provider, Gmail, and paid RentCast execution. A save/copy/action snapshot scenario detects hidden dispatch or stale output.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S155-1** — Autosave completed valid application fields and selections with no extra Save, enable-recording, or lock-in action. Deterministic observation: Change a field/selection and read the durable value without clicking Save.
- **BEH-S155-2** — Incomplete fields do not prevent unrelated completed fields from saving; preserve unfinished input. Deterministic observation: Leave one field incomplete, finish another, and inspect saved and retained values.
- **BEH-S155-3** — Show saving, saved, and failed-save feedback near affected work; saved requires confirmed persistence. Deterministic observation: Delay, succeed, and fail persistence and inspect feedback/readback.
- **BEH-S155-4** — Keep failed input and support retry or existing recovery without reconstruction. Deterministic observation: Fail a save and retry the same entered value.
- **BEH-S155-5** — Preserve request/revision protection: retry cannot duplicate activity and an older response cannot overwrite newer input. Deterministic observation: Lose a response and reorder two saves, then inspect input and activity.
- **BEH-S155-6** — Expose an actual concurrent-save conflict while retaining input; keep unrelated work usable. Deterministic observation: Save competing edits and then use another independent field/action.
- **BEH-S155-7** — Use S154 automatic required-state establishment on the first workspace save; no cycle action appears in the user flow. Deterministic observation: Autosave a first edit on a lease without relevant workspace state.
- **BEH-S155-8** — Autosave does not execute Sheet/RentVine updates, Gmail creation, or paid RentCast requests. Preparation of a source intent remains distinct from execution. Deterministic observation: Observe each dispatch boundary while saving supported working values.
- **BEH-S155-9** — Copy uses displayed text even when save is pending or failed; deliberate external actions bind to their identified snapshot. Deterministic observation: Copy during a failed save and compare bytes; inspect the later exact action snapshot.
- **BEH-S155-10** — Confirmed saved work reloads consistently on reopening or another device. Deterministic observation: Save, reopen with the same account, and compare durable working values.

**Human litmus outcome.**

### Edit and keep working

**If this was built correctly:** Change a lease value and see saving followed by saved. If saving fails, the text remains. Continue another task, copy the displayed message, and later reopen the confirmed saved work without having clicked a recording or Save button.

- Model verdict: PASS on the full local gate and exact main CI for the program head (unit, backend, core E2E; counts in docs/facts.md, Current feature). Per-suite evidence is the F-row for this suite in docs/facts.md. Live verification follows the release.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement | Architecture outcome | Behavior outcome | Human litmus          | Deterministic evidence / falsification                                                |
| ----------- | -------------------- | ---------------- | --------------------- | ------------------------------------------------------------------------------------- |
| R-S155-1    | ARCH-S155-1          | BEH-S155-1       | Edit and keep working | Change a field/selection and read the durable value without clicking Save.            |
| R-S155-2    | ARCH-S155-1          | BEH-S155-2       | Edit and keep working | Leave one field incomplete, finish another, and inspect saved and retained values.    |
| R-S155-3    | ARCH-S155-1          | BEH-S155-3       | Edit and keep working | Delay, succeed, and fail persistence and inspect feedback/readback.                   |
| R-S155-4    | ARCH-S155-2          | BEH-S155-4       | Edit and keep working | Fail a save and retry the same entered value.                                         |
| R-S155-5    | ARCH-S155-2          | BEH-S155-5       | Edit and keep working | Lose a response and reorder two saves, then inspect input and activity.               |
| R-S155-6    | ARCH-S155-2          | BEH-S155-6       | Edit and keep working | Save competing edits and then use another independent field/action.                   |
| R-S155-7    | ARCH-S155-1          | BEH-S155-7       | Edit and keep working | Autosave a first edit on a lease without relevant workspace state.                    |
| R-S155-8    | ARCH-S155-3          | BEH-S155-8       | Edit and keep working | Observe each dispatch boundary while saving supported working values.                 |
| R-S155-9    | ARCH-S155-3          | BEH-S155-9       | Edit and keep working | Copy during a failed save and compare bytes; inspect the later exact action snapshot. |
| R-S155-10   | ARCH-S155-1          | BEH-S155-10      | Edit and keep working | Save, reopen with the same account, and compare durable working values.               |

**Preservation set.**

- Existing server-derived attribution, revision/operation protection, and source/receipt meanings.
- Historical activity stays meaningful; note autosave follows S164 rather than creating a keystroke stream.

Preservation is assessed separately from the new outcomes. Expectations intentionally replaced above are updated to the approved end state; unrelated passing behavior is not sacrificed or counted as proof of the new feature.

**Adversarial acceptance checks.**

- **AC-S155-1** — A partially typed invalid field plus a valid selection must save only the valid completed change under ARCH-S155-1 and BEH-S155-2.
- **AC-S155-2** — Response loss, reordered saves, and a second operator must not duplicate history or replace newer input under ARCH-S155-2 and BEH-S155-4/5/6.
- **AC-S155-3** — Saving and copying while offline from the application service must preserve input, honest feedback, exact copied content, and zero external dispatch under BEH-S155-3/8/9.

**Forbidden actions / hard gates.**

No provider action from autosave. Do not fabricate a saved result, silently overwrite a concurrent value, or expose customer data in repository evidence. Ordinary field validation affects that field, not the full lease.

The repository’s permanent send, identity, private-data, and exact-effect boundaries remain applicable. This feature’s business friction removal does not disable those boundaries.

**Dependencies / sequencing.**

Consumes S154 workability/state establishment. S157, S161, S164, and S158 apply this save contract. S160/S162 retain deliberate effect snapshots.

Dependencies describe compatible interfaces and co-delivery, not independent execution authority. Follow the program order in [the canonical suite index](README.md); no completed baseline suite restarts.

**Standalone delivery contract.**

- **Deliverable now:** Autosave controls and owning-route/store changes for completed fields, truthful feedback, concurrency/retry, and no-effect boundaries.
- **Consumes, but does not assume:** Existing store and actor/revision contracts; an unavailable save service preserves input and exposes a failed save.
- **Externally blocked effect:** Unavailable application persistence can prevent a live save only; independent copy remains usable. No external provider activation is required.
- **Produces for downstream suites:** One common application-save experience and confirmed working data for downstream actions.

**Verification and delivery contract.**

1. During an explicitly authorized execution run, re-read current code/state, record the preservation baseline, and materialize the declared architecture/behavior observations before implementation. Changed expectations must fail for the actual missing behavior; already-satisfied requirements are preserved and evidenced rather than given an artificial failure.
2. Exercise every requirement/trace row and the named adversarial cases through the owning surfaces/services, including failure, concurrency/recovery, and exact effect boundaries where applicable. Record evidence scope honestly; deterministic adapters do not establish an actual customer/provider effect.
3. Follow docs/autonomous-agent-runner.md and AGENTS.md for focused verification, bash scripts/verify.sh, npm run test:e2e:core, diff/private-data/policy review, and the existing authorized release. No new validation program or provider-proof rerun is created.
4. Report ALL_GATES_GREEN only for actually verified scope; BLOCKED only for an exact unavailable external input after independent work is complete; BUDGET_EXHAUSTED only when an explicit budget exists. A green code slice does not establish a blocked live effect or full-program completion.
5. Delivery belongs to the complete program’s authorized cumulative release. Update present facts after actual readback; keep historical evidence and failed attempts truthful. Do not execute this contract merely because the file exists.

**Ordered prompt sequence.**

1. Read the router, current facts/resume/plan, this full specification, the canonical program contract, and the affected deployed owners.
2. Map R-S155-_ to the declared ARCH-S155-_ and BEH-S155-\* observations; record the current preservation/fail-first evidence under the existing loop.
3. Implement this bounded change and its actual failure/recovery paths in the owning components/services; carry shared program decisions into all affected boundaries.
4. Falsify against the requirement rows and AC-S155-\* cases; run the existing focused/canonical verification when execution is authorized.
5. Carry verified results into the program checkpoint, complete affected integration/mobile behavior, and deliver through the existing release procedure.

**Deletion/merge recommendation.**

Merge changed operating requirements into their owning current contracts when implemented. Retire this change specification only after its remaining requirements/dependencies are represented by code, evidence, and current facts under the repository’s existing retirement procedure. Preserve historical AC references and receipt scope; never retire a blocked outcome as complete.
