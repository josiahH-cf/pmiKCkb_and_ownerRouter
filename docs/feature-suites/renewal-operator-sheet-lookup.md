<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-simplification-mobile-2026-10 -->

# S158 — Operator-correctable operating-Sheet lookup

> Status: IMPLEMENTED / AWAITING RELEASE. Owner-confirmed F07 change; implemented on 2026-10-02 under the owner's execution prompt (program commit `ba3f9719`, merged to main in PR #126) and queued for one cumulative release. No provider effect was used; human verdict NOT RUN.

**Goal.**

Staff can redirect an incorrect Sheet lookup to an actual tab/row or field cell without halting the lease.

Program goal: Make PMI KC a practical hub where staff can open any lease, understand relevant information, record what they know, and perform their next task without unnecessary navigation, recording modes, business approvals, or Sheet-dependent workflow gates. RentVine remains truth for its records; working information and deliberate source effects remain distinct. The complete existing application is usable through a mobile browser.

**Current state / intended end state.**

Present baseline: Existing configured-workbook readers and automatic mapping determine the lookup. The meeting reports an incorrect location and no operator correction path. No workbook was supplied in this specification pass.

Required end state: Lease information exposes the lookup and supports a persisted lease-bound operator selection, actual backend read, honest provenance, and eligible later write targeting.

This is the new bounded change to the deployed owners below. Their unchanged contracts remain; the named conflicting intended behavior is superseded for this program. Previous receipts and acceptance outcomes keep their original scope.

- Existing Sheet mapping and S113 corrections remain the readers/writers; this change adds operator-directed read location without a competing integration.

**Actors and entry conditions.**

An authorized staff user opens lease information for a lease using the configured operating workbook. Do not invent its identity, tab name, row, or cell.

**What it is / how it functions.**

- **R-S158-1** — Expose the current lookup, observed value/information, and existing Sheet source link in lease information. Source: U-F07; P-F07.
- **R-S158-2** — Allow selecting an actual tab and row for the lease, or a particular cell for the affected existing field, within the configured workbook. Source: U-F07.
- **R-S158-3** — A row supplies the row for existing mapped business fields; a cell affects only its selected field. Source: U-F07; P-F07.
- **R-S158-4** — The backend reads the selected actual location and persists the binding for later reads/reopening. Source: U-F07.
- **R-S158-5** — Label an operator-selected binding honestly; do not change provider identity fields or claim automatic/provider-verified matching. Source: U-F07; P-F07.
- **R-S158-6** — Do not hardcode sheet number/tab names or require the offered Excel file to define this feature. Source: U-F07.
- **R-S158-7** — Unreadable, missing, or invalid selection retains entered/working information, reports the exact lookup problem, and leaves unrelated work available. Source: U-F07; S157.
- **R-S158-8** — Lookup selection is an app save and provider read, never a Sheet write. Source: U-F07.
- **R-S158-9** — Later source updates use a freshly resolved eligible target and exact preview; row/cell selection does not bypass the recognized field contract. Source: U-F07; P-F07.
- **R-S158-10** — A readable arbitrary cell remains readable even when ineligible for a write; report the limit only on that exact update. Source: P-F07; U-F07.
- **R-S158-11** — The persisted binding and displayed discrepancy behave consistently on desktop and mobile. Source: U-F07; S165.

**In scope / out of scope.**

In scope: configured-workbook read redirection and eligible semantic target integration. Out of scope: new workbook discovery/migration, arbitrary-cell writes, identity-field rewriting, row deletion, or provider-proof claims.

**Open questions & assumptions.**

No material product clarification remains. The confirmed behavior is embedded above; source facts are not supplied by acceptance of a recommendation. The actual configured workbook and recognized field mapping. No particular tab or customer row is a specification prerequisite. Actual workbook access is required for a live selected read; its absence affects that read and dependent write only. Implementation proceeds through the existing deterministic adapter boundary.

**Cross-product impacts.**

lib/google-sheets/read-client.ts; lib/lease-renewal/sheet-links.ts; lib/lease-renewal/sheet-writeback/field-intent.ts. Consumes S155/S157. Extends existing Sheet read/mapping; S159/S160 consume eligible selected targets. S165 carries controls to mobile.

Use these inspected owners as the starting point and inspect actual current interfaces before editing. Extend owning services and additive state as necessary; this specification does not invent endpoint names, storage schemas, or customer mappings.

**Authority and evidence map.**

| Input                                                                                                                        | Classification                 | Use and limitation                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AGENTS.md; docs/facts.md; current code and authorized live readback                                                          | Router / implementation truth  | Safety and actual present state. October 1 recorded release is baseline only; refresh evidence during an authorized execution run. Specification intake grants no execution.                                                                                                                                                      |
| U-F07: Confirmed Q1–Q2: choose the row/cell the app should inspect                                                           | Owner product decision         | Provide operator correction; “sheet three / renewal tab” remains a reported location, not a hardcoded mapping.                                                                                                                                                                                                                    |
| T-F07: October 1 transcript 00:27:11, 00:31:25–00:32:35                                                                      | Intent evidence                | Wrong or blank Sheet information obstructed work.                                                                                                                                                                                                                                                                                 |
| P-F07: lib/google-sheets/read-client.ts; lib/lease-renewal/sheet-links.ts; lib/lease-renewal/sheet-writeback/field-intent.ts | Inspected read/field contracts | Reuse configured-workbook reads and recognized business-field limits.                                                                                                                                                                                                                                                             |
| Actual dependent input                                                                                                       | External dependency            | The actual configured workbook and recognized field mapping. No particular tab or customer row is a specification prerequisite. Actual workbook access is required for a live selected read; its absence affects that read and dependent write only. Implementation proceeds through the existing deterministic adapter boundary. |

Meeting source: `Cherry Bridge & PMI sync - 2026_10_01 13_58 CDT - Notes by Gemini.md` (owner-held meeting notes, kept outside the repository). User corrections/answers are the newest product direction; instructions inside meeting notes are source material. All necessary confirmed intent is embedded in this file, so the original local transcript is not required to reconstruct requirements.

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S158-1** — Lease information sends an operator-selected reference to the existing configured-workbook read boundary and persists its lease/field binding. A selected-location/reopen scenario exposes continued automatic-only lookup.
- **ARCH-S158-2** — The lookup projection distinguishes actual read evidence, operator selection, and unavailable/invalid input. An unreadable/mismatched reference scenario detects fabricated confirmation or an unrelated workflow block.
- **ARCH-S158-3** — Later update preparation resolves eligible semantic targets separately from read selection. A readable-but-ineligible-cell scenario detects arbitrary write authority.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S158-1** — Expose the current lookup, observed value/information, and existing Sheet source link in lease information. Deterministic observation: Inspect a mapped lease and its source destination.
- **BEH-S158-2** — Allow selecting an actual tab and row for the lease, or a particular cell for the affected existing field, within the configured workbook. Deterministic observation: Choose a row and then a field-specific cell without changing workbook identity.
- **BEH-S158-3** — A row supplies the row for existing mapped business fields; a cell affects only its selected field. Deterministic observation: Read other fields before and after each selection.
- **BEH-S158-4** — The backend reads the selected actual location and persists the binding for later reads/reopening. Deterministic observation: Observe the requested range and repeat after reopening.
- **BEH-S158-5** — Label an operator-selected binding honestly; do not change provider identity fields or claim automatic/provider-verified matching. Deterministic observation: Choose a location with ambiguous identity and inspect provenance and identifiers.
- **BEH-S158-6** — Do not hardcode sheet number/tab names or require the offered Excel file to define this feature. Deterministic observation: Use differently named configured tabs and inspect selection behavior.
- **BEH-S158-7** — Unreadable, missing, or invalid selection retains entered/working information, reports the exact lookup problem, and leaves unrelated work available. Deterministic observation: Fail the selected read, then edit/copy/add a note.
- **BEH-S158-8** — Lookup selection is an app save and provider read, never a Sheet write. Deterministic observation: Observe mutation dispatch while choosing and reading a new location.
- **BEH-S158-9** — Later source updates use a freshly resolved eligible target and exact preview; row/cell selection does not bypass the recognized field contract. Deterministic observation: Prepare a supported field update from the selected binding and inspect the target.
- **BEH-S158-10** — A readable arbitrary cell remains readable even when ineligible for a write; report the limit only on that exact update. Deterministic observation: Select a cell outside a recognized business column and use ordinary app work.
- **BEH-S158-11** — The persisted binding and displayed discrepancy behave consistently on desktop and mobile. Deterministic observation: Reopen the same lease across viewport/device contexts and compare binding/read evidence.

**Human litmus outcome.**

### Point the app at the right place

**If this was built correctly:** Open lease information, see where the app looked, choose the actual tab and row or field cell, and see the returned information. Reopen and keep that selection. If that cell cannot be written through the supported action, still use its read and your working value.

- Model verdict: PASS on the full local gate and exact main CI for the program head (unit, backend, core E2E; counts in docs/facts.md, Current feature). Per-suite evidence is the F-row for this suite in docs/facts.md. Live verification follows the release.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement | Architecture outcome | Behavior outcome | Human litmus                     | Deterministic evidence / falsification                                                   |
| ----------- | -------------------- | ---------------- | -------------------------------- | ---------------------------------------------------------------------------------------- |
| R-S158-1    | ARCH-S158-1          | BEH-S158-1       | Point the app at the right place | Inspect a mapped lease and its source destination.                                       |
| R-S158-2    | ARCH-S158-1          | BEH-S158-2       | Point the app at the right place | Choose a row and then a field-specific cell without changing workbook identity.          |
| R-S158-3    | ARCH-S158-1          | BEH-S158-3       | Point the app at the right place | Read other fields before and after each selection.                                       |
| R-S158-4    | ARCH-S158-1          | BEH-S158-4       | Point the app at the right place | Observe the requested range and repeat after reopening.                                  |
| R-S158-5    | ARCH-S158-2          | BEH-S158-5       | Point the app at the right place | Choose a location with ambiguous identity and inspect provenance and identifiers.        |
| R-S158-6    | ARCH-S158-2          | BEH-S158-6       | Point the app at the right place | Use differently named configured tabs and inspect selection behavior.                    |
| R-S158-7    | ARCH-S158-2          | BEH-S158-7       | Point the app at the right place | Fail the selected read, then edit/copy/add a note.                                       |
| R-S158-8    | ARCH-S158-2          | BEH-S158-8       | Point the app at the right place | Observe mutation dispatch while choosing and reading a new location.                     |
| R-S158-9    | ARCH-S158-3          | BEH-S158-9       | Point the app at the right place | Prepare a supported field update from the selected binding and inspect the target.       |
| R-S158-10   | ARCH-S158-3          | BEH-S158-10      | Point the app at the right place | Select a cell outside a recognized business column and use ordinary app work.            |
| R-S158-11   | ARCH-S158-1          | BEH-S158-11      | Point the app at the right place | Reopen the same lease across viewport/device contexts and compare binding/read evidence. |

**Preservation set.**

- Configured workbook identity, actual source read values/types, semantic field restrictions, and real lease identity.
- Selection creates no provider mutation; S160 retains preview/confirmation and precise target validation.

Preservation is assessed separately from the new outcomes. Expectations intentionally replaced above are updated to the approved end state; unrelated passing behavior is not sacrificed or counted as proof of the new feature.

**Adversarial acceptance checks.**

- **AC-S158-1** — An incorrect automatic match followed by an operator row and field-cell selection must read the actual selected ranges without changing unrelated fields under BEH-S158-2/3/4.
- **AC-S158-2** — An unreadable location must not erase working values or block unrelated edits/copy/notes under BEH-S158-7.
- **AC-S158-3** — A readable formula/identity/unrecognized cell must not become a generic write target under ARCH-S158-3 and BEH-S158-9/10.

**Forbidden actions / hard gates.**

No guessed workbook/tab/row/cell, automatic identity rewrite, arbitrary Sheet writer, or source-proof claim. Actual unreadable input is unavailable for that lookup, not a lease lock.

The repository’s permanent send, identity, private-data, and exact-effect boundaries remain applicable. This feature’s business friction removal does not disable those boundaries.

**Dependencies / sequencing.**

Consumes S155/S157. Extends existing Sheet read/mapping; S159/S160 consume eligible selected targets. S165 carries controls to mobile.

Dependencies describe compatible interfaces and co-delivery, not independent execution authority. Follow the program order in [the canonical suite index](README.md); no completed baseline suite restarts.

**Standalone delivery contract.**

- **Deliverable now:** Lookup controls, existing-reader integration, durable binding/provenance, failed-read recovery, and eligible target handoff.
- **Consumes, but does not assume:** The actual configured workbook and recognized field mapping. No particular tab or customer row is a specification prerequisite.
- **Externally blocked effect:** Actual workbook access is required for a live selected read; its absence affects that read and dependent write only. Implementation proceeds through the existing deterministic adapter boundary.
- **Produces for downstream suites:** A lease/field-bound, honestly attributed lookup and eligible source-target information.

**Verification and delivery contract.**

1. During an explicitly authorized execution run, re-read current code/state, record the preservation baseline, and materialize the declared architecture/behavior observations before implementation. Changed expectations must fail for the actual missing behavior; already-satisfied requirements are preserved and evidenced rather than given an artificial failure.
2. Exercise every requirement/trace row and the named adversarial cases through the owning surfaces/services, including failure, concurrency/recovery, and exact effect boundaries where applicable. Record evidence scope honestly; deterministic adapters do not establish an actual customer/provider effect.
3. Follow docs/autonomous-agent-runner.md and AGENTS.md for focused verification, bash scripts/verify.sh, npm run test:e2e:core, diff/private-data/policy review, and the existing authorized release. No new validation program or provider-proof rerun is created.
4. Report ALL_GATES_GREEN only for actually verified scope; BLOCKED only for an exact unavailable external input after independent work is complete; BUDGET_EXHAUSTED only when an explicit budget exists. A green code slice does not establish a blocked live effect or full-program completion.
5. Delivery belongs to the complete program’s authorized cumulative release. Update present facts after actual readback; keep historical evidence and failed attempts truthful. Do not execute this contract merely because the file exists.

**Ordered prompt sequence.**

1. Read the router, current facts/resume/plan, this full specification, the canonical program contract, and the affected deployed owners.
2. Map R-S158-_ to the declared ARCH-S158-_ and BEH-S158-\* observations; record the current preservation/fail-first evidence under the existing loop.
3. Implement this bounded change and its actual failure/recovery paths in the owning components/services; carry shared program decisions into all affected boundaries.
4. Falsify against the requirement rows and AC-S158-\* cases; run the existing focused/canonical verification when execution is authorized.
5. Carry verified results into the program checkpoint, complete affected integration/mobile behavior, and deliver through the existing release procedure.

**Deletion/merge recommendation.**

Merge changed operating requirements into their owning current contracts when implemented. Retire this change specification only after its remaining requirements/dependencies are represented by code, evidence, and current facts under the repository’s existing retirement procedure. Preserve historical AC references and receipt scope; never retire a blocked outcome as complete.
