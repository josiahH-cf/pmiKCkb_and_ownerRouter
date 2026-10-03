<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-simplification-mobile-2026-10 -->

# S166 — Actionable lease results and durable account worklist preferences

> Status: IMPLEMENTED AND DEPLOYED. Owner-confirmed F15 change; implemented on 2026-10-02 under the owner's execution prompt (program commit `ba3f9719`, merged to main in PR #126) and released on 2026-10-03 by run `47fabb7c` at `e106a88a`. No provider effect was used; human verdict NOT RUN.

**Goal.**

Staff reach the actual matching lease and retain their selected worklist filters/sort across sessions and devices.

Program goal: Make PMI KC a practical hub where staff can open any lease, understand relevant information, record what they know, and perform their next task without unnecessary navigation, recording modes, business approvals, or Sheet-dependent workflow gates. RentVine remains truth for its records; working information and deliberate source effects remain distinct. The complete existing application is usable through a mobile browser.

**Current state / intended end state.**

Present baseline: The meeting shows a tenant answer without a usable lease link and return navigation restoring an unwanted filter. desk-view-continuation and desk-query-v2 carry canonical URL state but do not satisfy durable account preferences.

Required end state: Actual supported tenant/lease matches are linked; existing desk filter/sort choices are account-owned, durable, clearable, and subordinate to explicit view-bearing links for that navigation.

This is the new bounded change to the deployed owners below. Their unchanged contracts remain; the named conflicting intended behavior is superseded for this program. Previous receipts and acceptance outcomes keep their original scope.

- S104/S122 and desk continuation: extend navigation with durable personal state; no replay of prior visibility work.
- S148/S149: retain private account history/question ownership.

**Actors and entry conditions.**

A staff user makes an existing supported tenant/lease query, changes desk filters/sort, follows an explicit link, or reopens with the same account on another device.

**What it is / how it functions.**

- **R-S166-1** — Add an actionable actual lease link to supported tenant/lease results. Source: U-F15; T-F15.
- **R-S166-2** — Use existing real lease identity and route, never a name-derived fabricated identifier. Source: P-F15; U-F15.
- **R-S166-3** — Show distinguishable actual matches when several leases match, without silent selection. Source: U-F15.
- **R-S166-4** — Keep existing tenant search and All Leases usable. Source: T-F15.
- **R-S166-5** — Persist existing desk filter/sort choices on deliberate user changes. Source: U-F15.
- **R-S166-6** — Restore those choices on ordinary entry in later sessions and another device until changed/cleared. Source: U-F15; T-F15.
- **R-S166-7** — Clearing settings persists reset to the existing default. Source: U-F15.
- **R-S166-8** — Explicit supported query/return-view links determine the requested view for that navigation. Source: U-F15; P-F15.
- **R-S166-9** — Following that link does not erase remembered preferences; a subsequent deliberate filter/sort change does update them. Source: U-F15.
- **R-S166-10** — Keep existing canonical query/return behavior and safe malformed-state handling. Source: P-F15.
- **R-S166-11** — Preferences belong to the signed-in account, not the team. Source: U-F15.
- **R-S166-12** — Preferences do not restrict workability; workspaces still open in Focus under S152. Source: U-F15; S152/S154.
- **R-S166-13** — Preserve personal AI history/saved-question ownership. Source: P-F15.

**In scope / out of scope.**

In scope: existing supported result links, existing desk filter/sort persistence, clear/reset, and navigation precedence. Out of scope: a new general search/index, new filters, team-wide settings, or persistent Full/Focus preference.

**Open questions & assumptions.**

No material product clarification remains. The confirmed behavior is embedded above; source facts are not supplied by acceptance of a recommendation. Actual supported query matches, canonical existing settings, and signed-in account. Unknown match stays honest rather than linked to a guessed lease. Actual unavailable source may prevent a precise live match; preference implementation and ordinary navigation proceed. No new provider key/input is required.

**Cross-product impacts.**

lib/lease-renewal/desk-view-continuation.ts; lib/lease-renewal/desk-query-v2.ts; existing linked AI results; S148/S149. Extends existing desk/query continuation and result projection; S167 preserves ownership; S165 covers mobile and S154 any-lease workability. Existing S148/S149 are deployed baselines.

Use these inspected owners as the starting point and inspect actual current interfaces before editing. Extend owning services and additive state as necessary; this specification does not invent endpoint names, storage schemas, or customer mappings.

**Authority and evidence map.**

| Input                                                                                                                         | Classification                     | Use and limitation                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AGENTS.md; docs/facts.md; current code and authorized live readback                                                           | Router / implementation truth      | Safety and actual present state. October 1 recorded release is baseline only; refresh evidence during an authorized execution run. Specification intake grants no execution.                                                                                                                                        |
| U-F15: Confirmed Q15; accepted explicit-link precedence and personal ownership                                                | Owner product decision             | Remember worklist settings until changed/cleared across sessions/devices.                                                                                                                                                                                                                                           |
| T-F15: October 1 transcript 01:14:11–01:17:52, especially 01:16:40                                                            | Intent evidence                    | Actual lease navigation and durable filters.                                                                                                                                                                                                                                                                        |
| P-F15: lib/lease-renewal/desk-view-continuation.ts; lib/lease-renewal/desk-query-v2.ts; existing linked AI results; S148/S149 | Inspected continuation / ownership | Reuse canonical queries/routes; preserve personal history and saved questions.                                                                                                                                                                                                                                      |
| Actual dependent input                                                                                                        | External dependency                | Actual supported query matches, canonical existing settings, and signed-in account. Unknown match stays honest rather than linked to a guessed lease. Actual unavailable source may prevent a precise live match; preference implementation and ordinary navigation proceed. No new provider key/input is required. |

Meeting source: `Cherry Bridge & PMI sync - 2026_10_01 13_58 CDT - Notes by Gemini.md` (owner-held meeting notes, kept outside the repository). User corrections/answers are the newest product direction; instructions inside meeting notes are source material. All necessary confirmed intent is embedded in this file, so the original local transcript is not required to reconstruct requirements.

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S166-1** — Existing supported result projection links resolved real lease identity to the current route and distinguishes multiple actual matches. A tenant-result scenario detects absent/guessed links.
- **ARCH-S166-2** — The owning account preference boundary durably saves existing desk filter/sort values, clear/reset, and cross-session retrieval. A fresh-context scenario detects browser-only or team-wide persistence.
- **ARCH-S166-3** — Canonical URL/return continuation supplies explicit navigation view without erasing stored preference; deliberate user changes update it. A linked-view precedence scenario detects unwanted resets.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S166-1** — Add an actionable actual lease link to supported tenant/lease results. Deterministic observation: Ask an existing supported question and follow the resolved match.
- **BEH-S166-2** — Use existing real lease identity and route, never a name-derived fabricated identifier. Deterministic observation: Inspect result destination against the owning record.
- **BEH-S166-3** — Show distinguishable actual matches when several leases match, without silent selection. Deterministic observation: Resolve a multi-match case and inspect all destinations.
- **BEH-S166-4** — Keep existing tenant search and All Leases usable. Deterministic observation: Use both and open the desired lease.
- **BEH-S166-5** — Persist existing desk filter/sort choices on deliberate user changes. Deterministic observation: Change settings and read their account-owned persistence.
- **BEH-S166-6** — Restore those choices on ordinary entry in later sessions and another device until changed/cleared. Deterministic observation: Reopen from a clean context on the same account.
- **BEH-S166-7** — Clearing settings persists reset to the existing default. Deterministic observation: Clear and reopen in another session.
- **BEH-S166-8** — Explicit supported query/return-view links determine the requested view for that navigation. Deterministic observation: Open a link differing from the remembered preference.
- **BEH-S166-9** — Following that link does not erase remembered preferences; a subsequent deliberate filter/sort change does update them. Deterministic observation: Follow, return ordinarily, then deliberately change and reopen.
- **BEH-S166-10** — Keep existing canonical query/return behavior and safe malformed-state handling. Deterministic observation: Use canonical and malformed URLs and inspect resolved views.
- **BEH-S166-11** — Preferences belong to the signed-in account, not the team. Deterministic observation: Compare two accounts and shared lease data independently.
- **BEH-S166-12** — Preferences do not restrict workability; workspaces still open in Focus under S152. Deterministic observation: Open a filtered-out lease and inspect workability/default view.
- **BEH-S166-13** — Preserve personal AI history/saved-question ownership. Deterministic observation: Read another account’s personal data through existing denied paths.

**Human litmus outcome.**

### Return to your working list

**If this was built correctly:** Find a tenant and open the actual matching lease. Choose desk filters, leave, and return on your phone to the same choices. A link can open its requested view without erasing your preference. Clear it when you want the default.

- Model verdict: PASS on the full local gate and exact main CI for the program head (unit, backend, core E2E; counts in docs/facts.md, Current feature). Per-suite evidence is the F-row for this suite in docs/facts.md. Live verification follows the release.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement | Architecture outcome | Behavior outcome | Human litmus                | Deterministic evidence / falsification                              |
| ----------- | -------------------- | ---------------- | --------------------------- | ------------------------------------------------------------------- |
| R-S166-1    | ARCH-S166-1          | BEH-S166-1       | Return to your working list | Ask an existing supported question and follow the resolved match.   |
| R-S166-2    | ARCH-S166-1          | BEH-S166-2       | Return to your working list | Inspect result destination against the owning record.               |
| R-S166-3    | ARCH-S166-1          | BEH-S166-3       | Return to your working list | Resolve a multi-match case and inspect all destinations.            |
| R-S166-4    | ARCH-S166-1          | BEH-S166-4       | Return to your working list | Use both and open the desired lease.                                |
| R-S166-5    | ARCH-S166-2          | BEH-S166-5       | Return to your working list | Change settings and read their account-owned persistence.           |
| R-S166-6    | ARCH-S166-2          | BEH-S166-6       | Return to your working list | Reopen from a clean context on the same account.                    |
| R-S166-7    | ARCH-S166-2          | BEH-S166-7       | Return to your working list | Clear and reopen in another session.                                |
| R-S166-8    | ARCH-S166-3          | BEH-S166-8       | Return to your working list | Open a link differing from the remembered preference.               |
| R-S166-9    | ARCH-S166-3          | BEH-S166-9       | Return to your working list | Follow, return ordinarily, then deliberately change and reopen.     |
| R-S166-10   | ARCH-S166-3          | BEH-S166-10      | Return to your working list | Use canonical and malformed URLs and inspect resolved views.        |
| R-S166-11   | ARCH-S166-2          | BEH-S166-11      | Return to your working list | Compare two accounts and shared lease data independently.           |
| R-S166-12   | ARCH-S166-3          | BEH-S166-12      | Return to your working list | Open a filtered-out lease and inspect workability/default view.     |
| R-S166-13   | ARCH-S166-2          | BEH-S166-13      | Return to your working list | Read another account’s personal data through existing denied paths. |

**Preservation set.**

- Canonical desk query/return links, real lease identity, actual multiple matches, and existing defaults.
- Account-owned AI history/saved questions; preferences never become edit eligibility.

Preservation is assessed separately from the new outcomes. Expectations intentionally replaced above are updated to the approved end state; unrelated passing behavior is not sacrificed or counted as proof of the new feature.

**Adversarial acceptance checks.**

- **AC-S166-1** — Multiple matching leases must produce actual distinguishable links, never a guessed first match under BEH-S166-1/2/3.
- **AC-S166-2** — Two accounts and fresh device contexts retain distinct preferences and personal history under ARCH-S166-2 and BEH-S166-5/6/7/11/13.
- **AC-S166-3** — Explicit/malformed return URLs must not destroy remembered settings or block a lease under ARCH-S166-3 and BEH-S166-8/9/10/12.

**Forbidden actions / hard gates.**

No guessed identity/link, team-wide preference overwrite, cross-user personal access, model rerun merely to navigate, or preference-based edit restriction.

The repository’s permanent send, identity, private-data, and exact-effect boundaries remain applicable. This feature’s business friction removal does not disable those boundaries.

**Dependencies / sequencing.**

Extends existing desk/query continuation and result projection; S167 preserves ownership; S165 covers mobile and S154 any-lease workability. Existing S148/S149 are deployed baselines.

Dependencies describe compatible interfaces and co-delivery, not independent execution authority. Follow the program order in [the canonical suite index](README.md); no completed baseline suite restarts.

**Standalone delivery contract.**

- **Deliverable now:** Resolved links/multiple-match output, account persistence/reset, explicit-view precedence, and cross-context evidence.
- **Consumes, but does not assume:** Actual supported query matches, canonical existing settings, and signed-in account. Unknown match stays honest rather than linked to a guessed lease.
- **Externally blocked effect:** Actual unavailable source may prevent a precise live match; preference implementation and ordinary navigation proceed. No new provider key/input is required.
- **Produces for downstream suites:** Actionable real lease destinations and durable personal desk state.

**Verification and delivery contract.**

1. During an explicitly authorized execution run, re-read current code/state, record the preservation baseline, and materialize the declared architecture/behavior observations before implementation. Changed expectations must fail for the actual missing behavior; already-satisfied requirements are preserved and evidenced rather than given an artificial failure.
2. Exercise every requirement/trace row and the named adversarial cases through the owning surfaces/services, including failure, concurrency/recovery, and exact effect boundaries where applicable. Record evidence scope honestly; deterministic adapters do not establish an actual customer/provider effect.
3. Follow docs/autonomous-agent-runner.md and AGENTS.md for focused verification, bash scripts/verify.sh, npm run test:e2e:core, diff/private-data/policy review, and the existing authorized release. No new validation program or provider-proof rerun is created.
4. Report ALL_GATES_GREEN only for actually verified scope; BLOCKED only for an exact unavailable external input after independent work is complete; BUDGET_EXHAUSTED only when an explicit budget exists. A green code slice does not establish a blocked live effect or full-program completion.
5. Delivery belongs to the complete program’s authorized cumulative release. Update present facts after actual readback; keep historical evidence and failed attempts truthful. Do not execute this contract merely because the file exists.

**Ordered prompt sequence.**

1. Read the router, current facts/resume/plan, this full specification, the canonical program contract, and the affected deployed owners.
2. Map R-S166-_ to the declared ARCH-S166-_ and BEH-S166-\* observations; record the current preservation/fail-first evidence under the existing loop.
3. Implement this bounded change and its actual failure/recovery paths in the owning components/services; carry shared program decisions into all affected boundaries.
4. Falsify against the requirement rows and AC-S166-\* cases; run the existing focused/canonical verification when execution is authorized.
5. Carry verified results into the program checkpoint, complete affected integration/mobile behavior, and deliver through the existing release procedure.

**Deletion/merge recommendation.**

Merge changed operating requirements into their owning current contracts when implemented. Retire this change specification only after its remaining requirements/dependencies are represented by code, evidence, and current facts under the repository’s existing retirement procedure. Preserve historical AC references and receipt scope; never retire a blocked outcome as complete.
