<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-simplification-mobile-2026-10 -->

# S162 — Copy and create an unsent Gmail draft as displayed

> Status: IMPLEMENTED AND DEPLOYED. Owner-confirmed F11 change; implemented on 2026-10-02 under the owner's execution prompt (program commit `ba3f9719`, merged to main in PR #126) and released on 2026-10-03 by run `47fabb7c` at `e106a88a`. No provider effect was used; human verdict NOT RUN. The November 7 revision adopts S224's outgoing readiness contract for Gmail export. The revised behavior awaits implementation.

**Goal.**

Staff can copy the current message or deliberately create its unsent Gmail draft without unrelated completeness/review gates.

Program goal: Make PMI KC a practical hub where staff can open any lease, understand relevant information, record what they know, and perform their next task without unnecessary navigation, recording modes, business approvals, or Sheet-dependent workflow gates. RentVine remains truth for its records; working information and deliberate source effects remain distinct. The complete existing application is usable through a mobile browser.

**Current state / intended end state.**

Present baseline: Existing copy/Gmail controls depend on bodyReady, reviewed cycle, saved preparation, and review/preflight states. Managed transport, verified recipients, exact draft binding, receipts, and recovery exist.

Required end state: Staff can edit and Copy the current message with its working markers.
The exact unsent Gmail draft uses the same current content once S224 verifies the saved
signature choice and facts that the message requires. The existing review reminder stays.

This is the new bounded change to the deployed owners below. Their unchanged contracts remain; the named conflicting intended behavior is superseded for this program. Previous receipts and acceptance outcomes keep their original scope.

- S113/S129: remove business/cycle/Save-and-Review gates.
- S139: preserve separately disclosed drafts when changed wording cannot update through an existing provider method.

**Actors and entry conditions.**

A staff user viewing a message. Gmail creation consumes actual managed mailbox and existing verified To/Cc contract.

**What it is / how it functions.**

- **R-S162-1** — Copy displayed subject/body through applicable existing controls, including plain/formatted body. Source: U-F11.
- **R-S162-2** — Preserve edits and working markers for Copy without regeneration or a save step. Source: U-F11.
- **R-S162-3** — Keep copy usable while autosave is pending or failed. Source: U-F11.
- **R-S162-4** — Provide explicit unsent Gmail creation from displayed content. Source: U-F11.
- **R-S162-5** — Keep preparation and Copy available with incomplete working inputs.
  Gmail creation uses S224's required-input check at exact preview and final claim.
  Unrelated cycle, agreement, approval and completeness steps stay outside this action.
  Sources: U-F11 and November 7 Q5.
- **R-S162-6** — Show actual mailbox, To/Cc, and content for exact confirmation without silent changes or fanout. Source: U-F11; P-F11.
- **R-S162-7** — Perform needed persistence/binding inside the explicit draft action, without another Save; report real failure honestly. Source: U-F11; P-F11.
- **R-S162-8** — Name unresolved required facts and link to their controls before Gmail
  creation. Working markers stay available in-app and through Copy. An eligible unsent
  draft keeps its concise review reminder and exact confirmation. Sources: U-F11 and Q5.
- **R-S162-9** — Keep verified-recipient/managed-mailbox requirements local to the exact action. Source: P-F11; U-F11.
- **R-S162-10** — Keep duplicate prevention, lost-response reconciliation, and receipt recovery before another creation. Source: P-F11.
- **R-S162-11** — Later autosave does not silently update/replace Gmail drafts; existing changed-wording refinement discloses a separate draft. Source: P-F11.
- **R-S162-12** — Expose actual Gmail draft destination; the person sends there. Preserve draft-created, staff-recorded-sent, and provider-confirmed-sent meanings. Source: P-F11; U-F11.

**In scope / out of scope.**

In scope: existing owner/tenant copy, deliberate renewal draft creation, reminder/recovery. Out of scope: send, background drafting, general inbox, or new Gmail update methods.

**Open questions & assumptions.**

November 7 Q5 settles the export gate. Sender setup, required facts and transport state
come from their actual owners. A missing or unavailable input holds its own outgoing action
with a specific recovery. Draft editing and Copy remain available.

**Cross-product impacts.**

components/lease-renewal/RenewalMessagePreparation.tsx; lib/lease-renewal/message-preflight.ts; lib/lease-renewal/message-readiness.ts; S113/S139. Consumes S155/S156/S161/S163/S167; existing transport owns effects; S165 carries copy/draft to mobile.

Use these inspected owners as the starting point and inspect actual current interfaces before editing. Extend owning services and additive state as necessary; this specification does not invent endpoint names, storage schemas, or customer mappings.

**Authority and evidence map.**

| Input                                                                                                                                                    | Classification                         | Use and limitation                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AGENTS.md; docs/facts.md; current code and authorized live readback                                                                                      | Router / implementation truth          | Safety and actual present state. October 1 recorded release is baseline only; refresh evidence during an authorized execution run. Specification intake grants no execution.                                                                                                        |
| U-F11 and November 7 Q5                                                                                                                                  | Owner decisions                        | Preserve working markers in Copy. Apply S224 readiness to the exact Gmail draft action.                                                                                                                                                                                             |
| P-F11: components/lease-renewal/RenewalMessagePreparation.tsx; lib/lease-renewal/message-preflight.ts; lib/lease-renewal/message-readiness.ts; S113/S139 | Inspected transport / content contract | Keep exact snapshot, actual mailbox/recipients, recovery, and disclosed separate drafts on changed wording.                                                                                                                                                                         |
| Actual dependent input                                                                                                                                   | External dependency                    | Visible content and actual mailbox/verified recipients; business absence is marked, transport identity absence remains local unavailable. Missing actual mailbox/recipient blocks that live draft (AC-S162-2), not copy or independent work. No proof customer draft is authorized. |

Meeting source: `Cherry Bridge & PMI sync - 2026_10_01 13_58 CDT - Notes by Gemini.md` (owner-held meeting notes, kept outside the repository). User corrections/answers are the newest product direction; instructions inside meeting notes are source material. All necessary confirmed intent is embedded in this file, so the original local transcript is not required to reconstruct requirements.

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S162-1** — Copy reads visible subject/body and existing plain/formatted representations independently of persistence/completeness. A failed-save scenario detects stale/regenerated output.
- **ARCH-S162-2** — The draft action binds ready content and recipients through the exact
  confirmation and S224 gate. Verify one ready scenario with unrelated inputs absent and
  one with a required fact missing.
- **ARCH-S162-3** — Existing receipt/reconciliation and refinement contracts own created drafts. A lost-response/later-edit scenario detects duplicate creation or silent update.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S162-1** — Copy displayed subject/body through applicable existing controls, including plain/formatted body. Deterministic observation: Compare clipboard text and supported formatting with current edits.
- **BEH-S162-2** — Preserve edits/markers without regenerate, completion, save, or review prerequisites. Deterministic observation: Copy marked edited text with unrelated values absent.
- **BEH-S162-3** — Keep copy usable while autosave is pending or failed. Deterministic observation: Delay/fail save and copy current text.
- **BEH-S162-4** — Provide explicit unsent Gmail creation from displayed content. Deterministic observation: Compare adapter-created subject/body with the visible snapshot.
- **BEH-S162-5** — Create the unsent draft with its required inputs and valid transport.
  Unused facts do not hold it. A missing required fact holds only the outgoing action.
- **BEH-S162-6** — Show actual mailbox, To/Cc, and content for exact confirmation without silent changes or fanout. Deterministic observation: Compare confirmed snapshot and resulting draft.
- **BEH-S162-7** — Perform needed persistence/binding inside the explicit draft action, without another Save; report real failure honestly. Deterministic observation: Invoke with unsaved preparation and fail the necessary persistence boundary.
- **BEH-S162-8** — Inspect a marked working draft, follow its required-input fix and review
  the eligible outgoing draft with the existing reminder.
- **BEH-S162-9** — Keep verified-recipient/managed-mailbox requirements local to the exact action. Deterministic observation: Use unknown recipient/disconnected mailbox, then copy/edit normally.
- **BEH-S162-10** — Keep duplicate prevention, lost-response reconciliation, and receipt recovery before another creation. Deterministic observation: Lose the create response and reconcile without blind retry.
- **BEH-S162-11** — Later autosave does not silently update/replace Gmail drafts; existing changed-wording refinement discloses a separate draft. Deterministic observation: Edit after creation and inspect dispatch/disclosure.
- **BEH-S162-12** — Expose actual Gmail draft destination; the person sends there. Preserve draft-created, staff-recorded-sent, and provider-confirmed-sent meanings. Deterministic observation: Open returned destination and inspect lifecycle labels.

**Human litmus outcome.**

### Use the message on screen

**If this was built correctly:** Edit marked text and copy it immediately. Create its unsent Gmail draft with the displayed recipients/content. See its destination and review reminder. Later app edits do not silently change that draft.

- Model verdict: November 7 export revision NOT RUN. The October program head passed its
  local gate and main CI. The original S162 evidence remains in `docs/facts.md`.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement | Architecture outcome | Behavior outcome | Human litmus              | Deterministic evidence / falsification                                       |
| ----------- | -------------------- | ---------------- | ------------------------- | ---------------------------------------------------------------------------- |
| R-S162-1    | ARCH-S162-1          | BEH-S162-1       | Use the message on screen | Compare clipboard text and supported formatting with current edits.          |
| R-S162-2    | ARCH-S162-1          | BEH-S162-2       | Use the message on screen | Copy marked edited text with unrelated values absent.                        |
| R-S162-3    | ARCH-S162-1          | BEH-S162-3       | Use the message on screen | Delay/fail save and copy current text.                                       |
| R-S162-4    | ARCH-S162-2          | BEH-S162-4       | Use the message on screen | Compare adapter-created subject/body with the visible snapshot.              |
| R-S162-5    | ARCH-S162-2          | BEH-S162-5       | Use the message on screen | Draft with S224 readiness and valid transport. Omit unrelated inputs.        |
| R-S162-6    | ARCH-S162-2          | BEH-S162-6       | Use the message on screen | Compare confirmed snapshot and resulting draft.                              |
| R-S162-7    | ARCH-S162-2          | BEH-S162-7       | Use the message on screen | Invoke with unsaved preparation and fail the necessary persistence boundary. |
| R-S162-8    | ARCH-S162-2          | BEH-S162-8       | Use the message on screen | Resolve a required marker, then inspect the draft reminder and exact review. |
| R-S162-9    | ARCH-S162-2          | BEH-S162-9       | Use the message on screen | Use unknown recipient/disconnected mailbox, then copy/edit normally.         |
| R-S162-10   | ARCH-S162-3          | BEH-S162-10      | Use the message on screen | Lose the create response and reconcile without blind retry.                  |
| R-S162-11   | ARCH-S162-3          | BEH-S162-11      | Use the message on screen | Edit after creation and inspect dispatch/disclosure.                         |
| R-S162-12   | ARCH-S162-3          | BEH-S162-12      | Use the message on screen | Open returned destination and inspect lifecycle labels.                      |

**Preservation set.**

- Managed mailbox/verified recipients, exact binding, receipts/recovery, and unsent lifecycle meanings.
- S139 separate-draft disclosure; actual clipboard errors remain local and honest.

Preservation is assessed separately from the new outcomes. Expectations intentionally replaced above are updated to the approved end state; unrelated passing behavior is not sacrificed or counted as proof of the new feature.

**Adversarial acceptance checks.**

- **AC-S162-1** — Failed/pending save and incomplete values do not disable or change copy under BEH-S162-1/2/3.
- **AC-S162-2** — Valid transport and S224 readiness create the exact unsent draft.
  Missing setup, required facts or verified recipients hold creation and retain editable
  working content and Copy (BEH-S162-5/6/8/9).
- **AC-S162-3** — Lost response and later edits do not duplicate or silently update drafts under ARCH-S162-3 and BEH-S162-10/11/12.

**Forbidden actions / hard gates.**

Existing gmail.renewal_notice.draft_create only; no send, new generic draft/update key, guessed address, fanout, or live customer draft as proof. Exact content confirmation remains.

The repository’s permanent send, identity, private-data, and exact-effect boundaries remain applicable. This feature’s business friction removal does not disable those boundaries.

**Dependencies / sequencing.**

Consumes S155/S156/S161/S163/S167 and S224. Existing transport owns effects.
S165 carries Copy and Gmail draft to mobile.

Dependencies describe compatible interfaces and co-delivery, not independent execution authority. Follow the program order in [the canonical suite index](README.md); no completed baseline suite restarts.

**Standalone delivery contract.**

- **Deliverable now:** Displayed-content copy, revised preflight/transport, inline necessary persistence, local recovery, reminder, and destination.
- **Consumes, but does not assume:** Visible content and actual mailbox/verified recipients; business absence is marked, transport identity absence remains local unavailable.
- **Externally blocked effect:** Missing actual mailbox/recipient blocks that live draft (AC-S162-2), not copy or independent work. No proof customer draft is authorized.
- **Produces for downstream suites:** Exact copied output or honestly receipted unsent draft with destination.

**Verification and delivery contract.**

1. During an explicitly authorized execution run, re-read current code/state, record the preservation baseline, and materialize the declared architecture/behavior observations before implementation. Changed expectations must fail for the actual missing behavior; already-satisfied requirements are preserved and evidenced rather than given an artificial failure.
2. Exercise every requirement/trace row and the named adversarial cases through the owning surfaces/services, including failure, concurrency/recovery, and exact effect boundaries where applicable. Record evidence scope honestly; deterministic adapters do not establish an actual customer/provider effect.
3. Follow docs/autonomous-agent-runner.md and AGENTS.md for focused verification, bash scripts/verify.sh, npm run test:e2e:core, diff/private-data/policy review, and the existing authorized release. No new validation program or provider-proof rerun is created.
4. Report ALL_GATES_GREEN only for actually verified scope; BLOCKED only for an exact unavailable external input after independent work is complete; BUDGET_EXHAUSTED only when an explicit budget exists. A green code slice does not establish a blocked live effect or full-program completion.
5. Delivery belongs to the complete program’s authorized cumulative release. Update present facts after actual readback; keep historical evidence and failed attempts truthful. Do not execute this contract merely because the file exists.

**Ordered prompt sequence.**

1. Read the router, current facts/resume/plan, this full specification, the canonical program contract, and the affected deployed owners.
2. Map R-S162-_ to the declared ARCH-S162-_ and BEH-S162-\* observations; record the current preservation/fail-first evidence under the existing loop.
3. Implement this bounded change and its actual failure/recovery paths in the owning components/services; carry shared program decisions into all affected boundaries.
4. Falsify against the requirement rows and AC-S162-\* cases; run the existing focused/canonical verification when execution is authorized.
5. Carry verified results into the program checkpoint, complete affected integration/mobile behavior, and deliver through the existing release procedure.

**Deletion/merge recommendation.**

Merge changed operating requirements into their owning current contracts when implemented. Retire this change specification only after its remaining requirements/dependencies are represented by code, evidence, and current facts under the repository’s existing retirement procedure. Preserve historical AC references and receipt scope; never retire a blocked outcome as complete.
