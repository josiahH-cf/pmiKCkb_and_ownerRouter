<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-simplification-mobile-2026-10 -->

# S163 — First-name greetings for owners and tenants

> Status: IMPLEMENTED AND DEPLOYED. Owner-confirmed F12 change; implemented on 2026-10-02 under the owner's execution prompt (program commit `ba3f9719`, merged to main in PR #126) and released on 2026-10-03 by run `47fabb7c` at `e106a88a`. No provider effect was used; human verdict NOT RUN.

**Goal.**

Owner and tenant greetings use known first names while preserving actual recipients and editable wording.

Program goal: Make PMI KC a practical hub where staff can open any lease, understand relevant information, record what they know, and perform their next task without unnecessary navigation, recording modes, business approvals, or Sheet-dependent workflow gates. RentVine remains truth for its records; working information and deliberate source effects remain distinct. The complete existing application is usable through a mobile browser.

**Current state / intended end state.**

Present baseline: renewal-message-content joins available names and may include full names. The meeting requests first-name owners and tenants.

Required end state: Available first names form each greeting, including multiple people, with honest editable missing-name handling.

This is the new bounded change to the deployed owners below. Their unchanged contracts remain; the named conflicting intended behavior is superseded for this program. Previous receipts and acceptance outcomes keep their original scope.

- S113 F3: refine greeting only, retaining content and recipient contracts.

**Actors and entry conditions.**

A staff user prepares either existing audience from the actual lease roster.

**What it is / how it functions.**

- **R-S163-1** — Use known first name for each applicable owner individual. Source: T-F12.
- **R-S163-2** — Apply the same behavior to tenants. Source: T-F12.
- **R-S163-3** — Keep multiple-person joining and existing formatting. Source: T-F12; P-F12.
- **R-S163-4** — Use established roster names or staff edits; do not guess ambiguous/missing names. Source: U-F12.
- **R-S163-5** — Use existing appropriate generic/marked handling when first name is unknown; editing/copy/usable drafting continue. Source: U-F12; S161/S162.
- **R-S163-6** — Keep greeting editable and protect the staff edit on refresh. Source: U-F12; S161.
- **R-S163-7** — Greeting changes do not change To/Cc, drop other recipients, or alter configured staff Cc. Source: U-F12; P-F12.

**In scope / out of scope.**

In scope: both existing audience greetings and missing-name/editing behavior. Out of scope: new roster fields, guessed names, recipient changes, or new templates.

**Open questions & assumptions.**

No material product clarification remains. The confirmed behavior is embedded above; source facts are not supplied by acceptance of a recommendation. Actual names/recipients; unknown first name uses honest fallback/marker. No new dependency; actual missing name is handled rather than blocking.

**Cross-product impacts.**

lib/lease-renewal/renewal-message-content.ts; existing roster/recipient resolution. Refines composer used by S161; S162 exports current greeting. No source-write enablement dependency.

Use these inspected owners as the starting point and inspect actual current interfaces before editing. Extend owning services and additive state as necessary; this specification does not invent endpoint names, storage schemas, or customer mappings.

**Authority and evidence map.**

| Input                                                                                     | Classification                | Use and limitation                                                                                                                                                           |
| ----------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AGENTS.md; docs/facts.md; current code and authorized live readback                       | Router / implementation truth | Safety and actual present state. October 1 recorded release is baseline only; refresh evidence during an authorized execution run. Specification intake grants no execution. |
| T-F12: October 1 transcript 01:06:51                                                      | Confirmed intent              | First-name owner and tenant greetings.                                                                                                                                       |
| U-F12: Accepted full F12 specification                                                    | Owner product decision        | Preserve To/Cc, editing, and nonblocking unknown-name handling.                                                                                                              |
| P-F12: lib/lease-renewal/renewal-message-content.ts; existing roster/recipient resolution | Inspected implementation      | Names remain separate from recipient identity and approved formatting.                                                                                                       |
| Actual dependent input                                                                    | External dependency           | Actual names/recipients; unknown first name uses honest fallback/marker. No new dependency; actual missing name is handled rather than blocking.                             |

Meeting source: `Cherry Bridge & PMI sync - 2026_10_01 13_58 CDT - Notes by Gemini.md` (owner-held meeting notes, kept outside the repository). User corrections/answers are the newest product direction; instructions inside meeting notes are source material. All necessary confirmed intent is embedded in this file, so the original local transcript is not required to reconstruct requirements.

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S163-1** — Existing composition derives first-name greetings from established names without invented identity. A full-name/multiple-person scenario distinguishes current output.
- **ARCH-S163-2** — Editable greeting/missing handling stays separate from To/Cc resolution. An unknown-name scenario detects blocking output or changed fanout.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S163-1** — Use known first name for each applicable owner individual. Deterministic observation: Prepare owner greeting from established first-name information.
- **BEH-S163-2** — Apply the same behavior to tenants. Deterministic observation: Prepare tenant greeting with known first names.
- **BEH-S163-3** — Keep multiple-person joining and existing formatting. Deterministic observation: Prepare with multiple people and inspect rendered text.
- **BEH-S163-4** — Use established roster names or staff edits; do not guess ambiguous/missing names. Deterministic observation: Prepare with uncertain name evidence.
- **BEH-S163-5** — Use existing appropriate generic/marked handling when first name is unknown; editing/copy/usable drafting continue. Deterministic observation: Use missing names with valid recipients and perform those actions.
- **BEH-S163-6** — Keep greeting editable and protect the staff edit on refresh. Deterministic observation: Edit, refresh, and compare exact greeting.
- **BEH-S163-7** — Greeting changes do not change To/Cc, drop other recipients, or alter configured staff Cc. Deterministic observation: Compare resolved recipients before/after.

**Human litmus outcome.**

### Greet people by first name

**If this was built correctly:** Prepare either message with available first names, including multiple people. Edit if needed. Recipients remain unchanged and missing names do not stop work.

- Model verdict: PASS on the full local gate and exact main CI for the program head (unit, backend, core E2E; counts in docs/facts.md, Current feature). Per-suite evidence is the F-row for this suite in docs/facts.md. Live verification follows the release.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement | Architecture outcome | Behavior outcome | Human litmus               | Deterministic evidence / falsification                             |
| ----------- | -------------------- | ---------------- | -------------------------- | ------------------------------------------------------------------ |
| R-S163-1    | ARCH-S163-1          | BEH-S163-1       | Greet people by first name | Prepare owner greeting from established first-name information.    |
| R-S163-2    | ARCH-S163-1          | BEH-S163-2       | Greet people by first name | Prepare tenant greeting with known first names.                    |
| R-S163-3    | ARCH-S163-1          | BEH-S163-3       | Greet people by first name | Prepare with multiple people and inspect rendered text.            |
| R-S163-4    | ARCH-S163-1          | BEH-S163-4       | Greet people by first name | Prepare with uncertain name evidence.                              |
| R-S163-5    | ARCH-S163-2          | BEH-S163-5       | Greet people by first name | Use missing names with valid recipients and perform those actions. |
| R-S163-6    | ARCH-S163-2          | BEH-S163-6       | Greet people by first name | Edit, refresh, and compare exact greeting.                         |
| R-S163-7    | ARCH-S163-2          | BEH-S163-7       | Greet people by first name | Compare resolved recipients before/after.                          |

**Preservation set.**

- Actual roster/recipient resolution, all To/Cc and staff Cc, supplied formatting, and authored text.

Preservation is assessed separately from the new outcomes. Expectations intentionally replaced above are updated to the approved end state; unrelated passing behavior is not sacrificed or counted as proof of the new feature.

**Adversarial acceptance checks.**

- **AC-S163-1** — Multiple owner/tenant names retain proper audience greeting and all recipients under BEH-S163-1/2/3/7.
- **AC-S163-2** — Missing/ambiguous name stays honest while edit/copy/usable drafting continue under BEH-S163-4/5.
- **AC-S163-3** — Manual greeting survives refresh without recipient change under BEH-S163-6/7.

**Forbidden actions / hard gates.**

No invented name/address, recipient reduction, or effect from greeting composition.

The repository’s permanent send, identity, private-data, and exact-effect boundaries remain applicable. This feature’s business friction removal does not disable those boundaries.

**Dependencies / sequencing.**

Refines composer used by S161; S162 exports current greeting. No source-write enablement dependency.

Dependencies describe compatible interfaces and co-delivery, not independent execution authority. Follow the program order in [the canonical suite index](README.md); no completed baseline suite restarts.

**Standalone delivery contract.**

- **Deliverable now:** Both-audience name handling, multiple/missing cases, editable output, and recipient preservation.
- **Consumes, but does not assume:** Actual names/recipients; unknown first name uses honest fallback/marker.
- **Externally blocked effect:** No new dependency; actual missing name is handled rather than blocking.
- **Produces for downstream suites:** Editable first-name greeting with unchanged recipients.

**Verification and delivery contract.**

1. During an explicitly authorized execution run, re-read current code/state, record the preservation baseline, and materialize the declared architecture/behavior observations before implementation. Changed expectations must fail for the actual missing behavior; already-satisfied requirements are preserved and evidenced rather than given an artificial failure.
2. Exercise every requirement/trace row and the named adversarial cases through the owning surfaces/services, including failure, concurrency/recovery, and exact effect boundaries where applicable. Record evidence scope honestly; deterministic adapters do not establish an actual customer/provider effect.
3. Follow docs/autonomous-agent-runner.md and AGENTS.md for focused verification, bash scripts/verify.sh, npm run test:e2e:core, diff/private-data/policy review, and the existing authorized release. No new validation program or provider-proof rerun is created.
4. Report ALL_GATES_GREEN only for actually verified scope; BLOCKED only for an exact unavailable external input after independent work is complete; BUDGET_EXHAUSTED only when an explicit budget exists. A green code slice does not establish a blocked live effect or full-program completion.
5. Delivery belongs to the complete program’s authorized cumulative release. Update present facts after actual readback; keep historical evidence and failed attempts truthful. Do not execute this contract merely because the file exists.

**Ordered prompt sequence.**

1. Read the router, current facts/resume/plan, this full specification, the canonical program contract, and the affected deployed owners.
2. Map R-S163-_ to the declared ARCH-S163-_ and BEH-S163-\* observations; record the current preservation/fail-first evidence under the existing loop.
3. Implement this bounded change and its actual failure/recovery paths in the owning components/services; carry shared program decisions into all affected boundaries.
4. Falsify against the requirement rows and AC-S163-\* cases; run the existing focused/canonical verification when execution is authorized.
5. Carry verified results into the program checkpoint, complete affected integration/mobile behavior, and deliver through the existing release procedure.

**Deletion/merge recommendation.**

Merge changed operating requirements into their owning current contracts when implemented. Retire this change specification only after its remaining requirements/dependencies are represented by code, evidence, and current facts under the repository’s existing retirement procedure. Preserve historical AC references and receipt scope; never retire a blocked outcome as complete.
