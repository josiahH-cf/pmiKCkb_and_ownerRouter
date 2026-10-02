<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-simplification-mobile-2026-10 -->

# S164 — Running Status log with autosaved notes

> Status: SPECIFIED / NOT IMPLEMENTED. Owner-confirmed F13 change; authoring and registration only. Implementation, tests, authentication probes, provider effects, and release were not executed for this intake.

**Goal.**

Staff have one running record of lease status and contextual notes, without requiring a status change to add a note.

Program goal: Make PMI KC a practical hub where staff can open any lease, understand relevant information, record what they know, and perform their next task without unnecessary navigation, recording modes, business approvals, or Sheet-dependent workflow gates. RentVine remains truth for its records; working information and deliberate source effects remain distinct. The complete existing application is usable through a mobile browser.

**Current state / intended end state.**

Present baseline: RenewalWorkStatusControl selects/saves status and renders status history. Its lease-bound store has server attribution, expected revisions, immutable operation identity, and duplicate protection; the schema has no note content.

Required end state: The Status log combines existing status history and distinct autosaved notes beneath the status control, with actual actor/time and no duplicate keystroke entries.

This is the new bounded change to the deployed owners below. Their unchanged contracts remain; the named conflicting intended behavior is superseded for this program. Previous receipts and acceptance outcomes keep their original scope.

- Existing status model and S119 retired contract: extend the existing per-lease store; do not revive its retired narrative or create parallel status authority.

**Actors and entry conditions.**

An ordinary authorized staff user records progress/context on an existing lease. Status remains staff information and independent of provider evidence or cycle creation.

**What it is / how it functions.**

- **R-S164-1** — Retain existing staff status choices and historical status entries. Source: U-F13; P-F13.
- **R-S164-2** — Place note entry beneath the status control. Source: U-F13; T-F13.
- **R-S164-3** — Allow notes with unchanged status; no dirty selection prerequisite. Source: U-F13.
- **R-S164-4** — Autosave notes and status changes under S155 without another Save/approval. Source: U-F13.
- **R-S164-5** — Show notes/status changes together with actual actor and time. Source: U-F13; P-F13.
- **R-S164-6** — One composed note is one logical entry; repeated saves update ongoing composition rather than appending duplicate visible notes. Source: U-F13.
- **R-S164-7** — Starting another note creates a distinct entry from the same note area without a mandatory Save/approval action. Source: U-F13.
- **R-S164-8** — Empty input creates no note; failed/pending text remains available; no keystroke activity stream. Source: U-F13.
- **R-S164-9** — Retrying the same note/status operation must not append another entry. Source: P-F13; U-F13.
- **R-S164-10** — Keep original historical attribution; introduce no historical edit/delete feature. Source: U-F13; P-F13.
- **R-S164-11** — Notes do not automatically change status, approval, completion, or provider evidence. Source: U-F13.
- **R-S164-12** — Workspace and desk use the same status; reopen the same log on desktop/mobile. Source: U-F13; P-F13.

**In scope / out of scope.**

In scope: note composition, one combined log, autosave, existing history/integrity, shared status. Out of scope: historical note editing/deletion, note interpretation automation, or new workflow/provider effects.

**Open questions & assumptions.**

No material product clarification remains. The confirmed behavior is embedded above; source facts are not supplied by acceptance of a recommendation. Existing lease/status/history and actual authenticated actor. A note requires content, not a status change or cycle. Unavailable app persistence affects that save only; input remains recoverable. No provider input or activation is required.

**Cross-product impacts.**

components/lease-renewal/RenewalWorkStatusControl.tsx; lib/lease-renewal/work-status.ts; app/api/lease-renewal/work-status/route.ts; lib/firestore/renewal-work-status.ts. Consumes S155 autosave and S154 independent storage. S152 presents the control; S165 covers mobile; S167 supplies ordinary access.

Use these inspected owners as the starting point and inspect actual current interfaces before editing. Extend owning services and additive state as necessary; this specification does not invent endpoint names, storage schemas, or customer mappings.

**Authority and evidence map.**

| Input                                                                                                                                                                            | Classification                | Use and limitation                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AGENTS.md; docs/facts.md; current code and authorized live readback                                                                                                              | Router / implementation truth | Safety and actual present state. October 1 recorded release is baseline only; refresh evidence during an authorized execution run. Specification intake grants no execution.                                                                     |
| U-F13: Confirmed Q11 and autosave answer                                                                                                                                         | Owner product decision        | Notes beneath status, unchanged-status notes, one running log, meaningful entries, and no separate Save.                                                                                                                                         |
| T-F13: October 1 transcript 01:26:40                                                                                                                                             | Intent evidence               | Small note entry under status and running history.                                                                                                                                                                                               |
| P-F13: components/lease-renewal/RenewalWorkStatusControl.tsx; lib/lease-renewal/work-status.ts; app/api/lease-renewal/work-status/route.ts; lib/firestore/renewal-work-status.ts | Inspected ownership/integrity | Extend existing status store/route; preserve actor/time, revision, history, and no provider effects.                                                                                                                                             |
| Actual dependent input                                                                                                                                                           | External dependency           | Existing lease/status/history and actual authenticated actor. A note requires content, not a status change or cycle. Unavailable app persistence affects that save only; input remains recoverable. No provider input or activation is required. |

Meeting source: `Cherry Bridge & PMI sync - 2026_10_01 13_58 CDT - Notes by Gemini.md` (owner-held meeting notes, kept outside the repository). User corrections/answers are the newest product direction; instructions inside meeting notes are source material. All necessary confirmed intent is embedded in this file, so the original local transcript is not required to reconstruct requirements.

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S164-1** — The existing status boundary stores notes and status activity in one lease-bound log without requiring dirty status or a cycle. An unchanged-status note scenario exposes the absent note capability.
- **ARCH-S164-2** — One ongoing note composition has a stable logical entry identity across repeated autosaves/retries; beginning another creates a distinct entry. A typing/lost-response scenario detects duplicate visible log items.
- **ARCH-S164-3** — Desk/workspace/mobile consume the same saved status/log, preserving original history and staff/provider distinctions. A reload/history scenario detects shadow storage or invented progress.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S164-1** — Retain existing staff status choices and historical status entries. Deterministic observation: Read original choices/history before and after a new note.
- **BEH-S164-2** — Place note entry beneath the status control. Deterministic observation: Inspect the lease status area in both views and mobile.
- **BEH-S164-3** — Allow notes with unchanged status; no dirty selection prerequisite. Deterministic observation: Add a note without changing selected status.
- **BEH-S164-4** — Autosave notes and status changes under S155 without another Save/approval. Deterministic observation: Change each and confirm persistence through the actual route.
- **BEH-S164-5** — Show notes/status changes together with actual actor and time. Deterministic observation: Read the log after both kinds of entry.
- **BEH-S164-6** — One composed note is one logical entry; repeated saves update ongoing composition rather than appending duplicate visible notes. Deterministic observation: Type across several saves and count/read logical log entries.
- **BEH-S164-7** — Starting another note creates a distinct entry from the same note area without a mandatory Save/approval action. Deterministic observation: Begin the next note after the saved one and inspect entry identity/history.
- **BEH-S164-8** — Empty input creates no note; failed/pending text remains available; no keystroke activity stream. Deterministic observation: Autosave empty, delayed, and failed input and inspect composer/log.
- **BEH-S164-9** — Retrying the same note/status operation must not append another entry. Deterministic observation: Lose the response and recover/retry using the same operation identity.
- **BEH-S164-10** — Keep original historical attribution; introduce no historical edit/delete feature. Deterministic observation: Compare prior entries after ongoing composition and a new note.
- **BEH-S164-11** — Notes do not automatically change status, approval, completion, or provider evidence. Deterministic observation: Enter text about planned/completed work and inspect unrelated states/effects.
- **BEH-S164-12** — Workspace and desk use the same status; reopen the same log on desktop/mobile. Deterministic observation: Save, navigate to desk, and reopen in another viewport/session.

**Human litmus outcome.**

### Add context without changing status

**If this was built correctly:** Leave status as it is and add a note beneath it. See one saved log entry with who and when. Continue composing without duplicate entries, then begin a separate note. Reopen on your phone and see the same log.

- Model verdict: no implementation verdict issued at specification intake. The execution runner records PASS or FAIL with the actual supporting evidence.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement | Architecture outcome | Behavior outcome | Human litmus                        | Deterministic evidence / falsification                                        |
| ----------- | -------------------- | ---------------- | ----------------------------------- | ----------------------------------------------------------------------------- |
| R-S164-1    | ARCH-S164-3          | BEH-S164-1       | Add context without changing status | Read original choices/history before and after a new note.                    |
| R-S164-2    | ARCH-S164-1          | BEH-S164-2       | Add context without changing status | Inspect the lease status area in both views and mobile.                       |
| R-S164-3    | ARCH-S164-1          | BEH-S164-3       | Add context without changing status | Add a note without changing selected status.                                  |
| R-S164-4    | ARCH-S164-1          | BEH-S164-4       | Add context without changing status | Change each and confirm persistence through the actual route.                 |
| R-S164-5    | ARCH-S164-3          | BEH-S164-5       | Add context without changing status | Read the log after both kinds of entry.                                       |
| R-S164-6    | ARCH-S164-2          | BEH-S164-6       | Add context without changing status | Type across several saves and count/read logical log entries.                 |
| R-S164-7    | ARCH-S164-2          | BEH-S164-7       | Add context without changing status | Begin the next note after the saved one and inspect entry identity/history.   |
| R-S164-8    | ARCH-S164-2          | BEH-S164-8       | Add context without changing status | Autosave empty, delayed, and failed input and inspect composer/log.           |
| R-S164-9    | ARCH-S164-2          | BEH-S164-9       | Add context without changing status | Lose the response and recover/retry using the same operation identity.        |
| R-S164-10   | ARCH-S164-3          | BEH-S164-10      | Add context without changing status | Compare prior entries after ongoing composition and a new note.               |
| R-S164-11   | ARCH-S164-3          | BEH-S164-11      | Add context without changing status | Enter text about planned/completed work and inspect unrelated states/effects. |
| R-S164-12   | ARCH-S164-3          | BEH-S164-12      | Add context without changing status | Save, navigate to desk, and reopen in another viewport/session.               |

**Preservation set.**

- Original status choices/history/attribution, actor/revision/duplicate-operation conventions, and independent lease-bound status storage.
- Staff status and notes never establish provider completion or signatures.

Preservation is assessed separately from the new outcomes. Expectations intentionally replaced above are updated to the approved end state; unrelated passing behavior is not sacrificed or counted as proof of the new feature.

**Adversarial acceptance checks.**

- **AC-S164-1** — Unchanged status and no cycle must still permit a note without creating a cycle under BEH-S164-3/4/11.
- **AC-S164-2** — Repeated composition autosaves, empty input, and lost responses must produce only the appropriate logical entries under ARCH-S164-2 and BEH-S164-6/7/8/9.
- **AC-S164-3** — A note must not modify historical entries, status, or provider evidence and must reopen consistently under BEH-S164-10/11/12.

**Forbidden actions / hard gates.**

No fabricated actor/time/provider effect, parsing notes into workflow completion, historical delete, or keystroke-log pollution. Concurrent save recovery follows S155.

The repository’s permanent send, identity, private-data, and exact-effect boundaries remain applicable. This feature’s business friction removal does not disable those boundaries.

**Dependencies / sequencing.**

Consumes S155 autosave and S154 independent storage. S152 presents the control; S165 covers mobile; S167 supplies ordinary access.

Dependencies describe compatible interfaces and co-delivery, not independent execution authority. Follow the program order in [the canonical suite index](README.md); no completed baseline suite restarts.

**Standalone delivery contract.**

- **Deliverable now:** Note-aware existing status route/store/control and combined log, stable composition identity, recovery, and history preservation.
- **Consumes, but does not assume:** Existing lease/status/history and actual authenticated actor. A note requires content, not a status change or cycle.
- **Externally blocked effect:** Unavailable app persistence affects that save only; input remains recoverable. No provider input or activation is required.
- **Produces for downstream suites:** One shared lease Status log and current staff status.

**Verification and delivery contract.**

1. During an explicitly authorized execution run, re-read current code/state, record the preservation baseline, and materialize the declared architecture/behavior observations before implementation. Changed expectations must fail for the actual missing behavior; already-satisfied requirements are preserved and evidenced rather than given an artificial failure.
2. Exercise every requirement/trace row and the named adversarial cases through the owning surfaces/services, including failure, concurrency/recovery, and exact effect boundaries where applicable. Record evidence scope honestly; deterministic adapters do not establish an actual customer/provider effect.
3. Follow docs/autonomous-agent-runner.md and AGENTS.md for focused verification, bash scripts/verify.sh, npm run test:e2e:core, diff/private-data/policy review, and the existing authorized release. No new validation program or provider-proof rerun is created.
4. Report ALL_GATES_GREEN only for actually verified scope; BLOCKED only for an exact unavailable external input after independent work is complete; BUDGET_EXHAUSTED only when an explicit budget exists. A green code slice does not establish a blocked live effect or full-program completion.
5. Delivery belongs to the complete program’s authorized cumulative release. Update present facts after actual readback; keep historical evidence and failed attempts truthful. Do not execute this contract merely because the file exists.

**Ordered prompt sequence.**

1. Read the router, current facts/resume/plan, this full specification, the canonical program contract, and the affected deployed owners.
2. Map R-S164-_ to the declared ARCH-S164-_ and BEH-S164-\* observations; record the current preservation/fail-first evidence under the existing loop.
3. Implement this bounded change and its actual failure/recovery paths in the owning components/services; carry shared program decisions into all affected boundaries.
4. Falsify against the requirement rows and AC-S164-\* cases; run the existing focused/canonical verification when execution is authorized.
5. Carry verified results into the program checkpoint, complete affected integration/mobile behavior, and deliver through the existing release procedure.

**Deletion/merge recommendation.**

Merge changed operating requirements into their owning current contracts when implemented. Retire this change specification only after its remaining requirements/dependencies are represented by code, evidence, and current facts under the repository’s existing retirement procedure. Preserve historical AC references and receipt scope; never retire a blocked outcome as complete.
