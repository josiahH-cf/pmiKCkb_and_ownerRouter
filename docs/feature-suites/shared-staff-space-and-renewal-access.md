<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-simplification-mobile-2026-10 -->

# S167 — Shared staff Spaces and renewal access without role handoffs

> Status: SPECIFIED / NOT IMPLEMENTED. Owner-confirmed F16 change; authoring and registration only. Implementation, tests, authentication probes, provider effects, and release were not executed for this intake.

**Goal.**

Every ordinary authorized staff account can access existing internal Spaces and perform the specified renewal work without an elevated-role handoff.

Program goal: Make PMI KC a practical hub where staff can open any lease, understand relevant information, record what they know, and perform their next task without unnecessary navigation, recording modes, business approvals, or Sheet-dependent workflow gates. RentVine remains truth for its records; working information and deliberate source effects remain distinct. The complete existing application is usable through a mobile browser.

**Current state / intended end state.**

Present baseline: Existing Editor/Approver/Admin roles and per-user Space scopes can constrain navigation/operations; source execution uses manageAdmin. Claim-less managed accounts already default to Editor/all Spaces. Vendor and verification identities have distinct contracts.

Required end state: Existing and newly authorized staff have all existing internal Spaces and in-scope ordinary-work capabilities. Administration, Vendor scope, verification restrictions, and personal ownership remain accurate.

This is the new bounded change to the deployed owners below. Their unchanged contracts remain; the named conflicting intended behavior is superseded for this program. Previous receipts and acceptance outcomes keep their original scope.

- S83 retired foundation and session/roles: supersede per-Space staff gating and specified renewal role handoffs; preserve Admin/Vendor/private data.
- S97/S98/S113: source execution remains exact and deliberate, now available to ordinary staff under S160.

**Actors and entry conditions.**

An ordinary authorized managed staff account, including existing scoped accounts and new staff. Vendor portal users and dedicated verification accounts retain their distinct contracts.

**What it is / how it functions.**

- **R-S167-1** — All existing internal Spaces are accessible to authorized ordinary staff without per-Space request/grant/claim gates. Source: U-F16.
- **R-S167-2** — Apply access to existing as well as newly authorized staff accounts. Source: U-F16.
- **R-S167-3** — Provide in-scope working edits, status/notes, messages/copy/unsent drafts, and supported RentVine/Sheet updates to ordinary staff. Source: U-F16.
- **R-S167-4** — Remove renewal approval/role execution handoffs; Editor does not need Approver/Admin to finish these operations. Source: U-F16.
- **R-S167-5** — Keep navigation/control, page, API, and store checks consistent. Source: U-F16; P-F16.
- **R-S167-6** — Keep user administration with Admins; do not make everyone Admin or grant manageAdmin to implement normal work. Source: U-F16; P-F16.
- **R-S167-7** — Preserve account authentication and dedicated verification-account effect restrictions. Source: P-F16.
- **R-S167-8** — Preserve separate Vendor portal/ticket scope rather than opening internal Spaces to Vendors. Source: U-F16; P-F16.
- **R-S167-9** — Personal AI history, saved questions, and desk preferences remain account-owned. Source: U-F16; P-F16.
- **R-S167-10** — Keep exact provider-action, security administration, and unrelated publication/activation contracts that this program does not change. Source: U-F16; P-F16.

**In scope / out of scope.**

In scope: all existing internal Space access and specified ordinary renewal capabilities across owning boundaries. Out of scope: new roles/identities, universal Admin, new Space provisioning, Vendor staff access, or unrelated activation/publication changes.

**Open questions & assumptions.**

No material product clarification remains. The confirmed behavior is embedded above; source facts are not supplied by acceptance of a recommendation. Actual authorized managed account and existing Space configuration. Do not change claims or provision Spaces to simulate open access. No new privilege/identity is needed. Actual authentication challenge affects dependent verification only; independent implementation continues.

**Cross-product impacts.**

lib/auth/roles.ts; lib/auth/session.ts; lib/lease-renewal/role-action-governance.ts; lib/navigation/primary-navigation.ts; firestore.rules. Extends existing access/session/action boundaries. Supplies ordinary operational access to S154–S164 and personal ownership to S166; S165 must apply identical access on mobile. Do not rerun retired S83.

Use these inspected owners as the starting point and inspect actual current interfaces before editing. Extend owning services and additive state as necessary; this specification does not invent endpoint names, storage schemas, or customer mappings.

**Authority and evidence map.**

| Input                                                                                                                                             | Classification                    | Use and limitation                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AGENTS.md; docs/facts.md; current code and authorized live readback                                                                               | Router / implementation truth     | Safety and actual present state. October 1 recorded release is baseline only; refresh evidence during an authorized execution run. Specification intake grants no execution.                                                                                                          |
| U-F16: Confirmed Q10/Q13: remove operational role friction; all existing Spaces open to users                                                     | Owner product decision            | Ordinary staff perform work; Admins administer users. Separate Vendor boundary was retained in the clarified question.                                                                                                                                                                |
| P-F16: lib/auth/roles.ts; lib/auth/session.ts; lib/lease-renewal/role-action-governance.ts; lib/navigation/primary-navigation.ts; firestore.rules | Existing authorization boundaries | Inspect actual rules before edits; do not invent a role or give everyone manageAdmin.                                                                                                                                                                                                 |
| Actual dependent input                                                                                                                            | External dependency               | Actual authorized managed account and existing Space configuration. Do not change claims or provision Spaces to simulate open access. No new privilege/identity is needed. Actual authentication challenge affects dependent verification only; independent implementation continues. |

Meeting source: [Cherry Bridge & PMI sync - 2026_10_01 13_58 CDT - Notes by Gemini.md](<C:/Users/josia/Downloads/Cherry Bridge & PMI sync - 2026_10_01 13_58 CDT - Notes by Gemini.md>). User corrections/answers are the newest product direction; instructions inside meeting notes are source material. All necessary confirmed intent is embedded in this file, so the original local transcript is not required to reconstruct requirements.

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S167-1** — Existing staff session/access projection grants all existing internal Spaces without per-Space requests/claims while preserving managed identity and Vendor/verification boundaries. An existing-scoped-account scenario exposes the old gate.
- **ARCH-S167-2** — UI/page/API/store capability checks consistently permit specified ordinary renewal operations. An Editor actual-route/store scenario detects hidden Admin/Approver handoffs.
- **ARCH-S167-3** — Administrative authority and personal data ownership remain separate from shared operational access. A multi-account/Vendor/Admin scenario detects blanket privilege elevation or data leakage.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S167-1** — All existing internal Spaces are accessible to authorized ordinary staff without per-Space request/grant/claim gates. Deterministic observation: Sign in with an existing scoped staff account and reach each existing internal Space.
- **BEH-S167-2** — Apply access to existing as well as newly authorized staff accounts. Deterministic observation: Compare both account entry types through actual access projection.
- **BEH-S167-3** — Provide in-scope working edits, status/notes, messages/copy/unsent drafts, and supported RentVine/Sheet updates to ordinary staff. Deterministic observation: Exercise each capability as Editor through real routes/services.
- **BEH-S167-4** — Remove renewal approval/role execution handoffs; Editor does not need Approver/Admin to finish these operations. Deterministic observation: Complete supported operations without elevated-role intervention.
- **BEH-S167-5** — Keep navigation/control, page, API, and store checks consistent. Deterministic observation: Compare visible access with direct authorized requests and backing-store behavior.
- **BEH-S167-6** — Keep user administration with Admins; do not make everyone Admin or grant manageAdmin to implement normal work. Deterministic observation: Inspect normal staff administration denial and actual effective role/capabilities.
- **BEH-S167-7** — Preserve account authentication and dedicated verification-account effect restrictions. Deterministic observation: Exercise denied identity and effect-refused verification paths.
- **BEH-S167-8** — Preserve separate Vendor portal/ticket scope rather than opening internal Spaces to Vendors. Deterministic observation: Compare Vendor internal access refusal and its permitted ticket flow.
- **BEH-S167-9** — Personal AI history, saved questions, and desk preferences remain account-owned. Deterministic observation: Compare cross-account access while both can read shared lease information.
- **BEH-S167-10** — Keep exact provider-action, security administration, and unrelated publication/activation contracts that this program does not change. Deterministic observation: Inspect supported versus closed actions and unaffected administrative/publication boundaries.

**Human litmus outcome.**

### Use your account to do the work

**If this was built correctly:** Sign in as normal staff, open the existing internal Spaces, and perform renewal work without asking an Admin to execute it. Your saved personal questions/preferences stay private. Admin user management and Vendor work keep their own boundaries.

- Model verdict: no implementation verdict issued at specification intake. The execution runner records PASS or FAIL with the actual supporting evidence.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement | Architecture outcome | Behavior outcome | Human litmus                    | Deterministic evidence / falsification                                                        |
| ----------- | -------------------- | ---------------- | ------------------------------- | --------------------------------------------------------------------------------------------- |
| R-S167-1    | ARCH-S167-1          | BEH-S167-1       | Use your account to do the work | Sign in with an existing scoped staff account and reach each existing internal Space.         |
| R-S167-2    | ARCH-S167-1          | BEH-S167-2       | Use your account to do the work | Compare both account entry types through actual access projection.                            |
| R-S167-3    | ARCH-S167-2          | BEH-S167-3       | Use your account to do the work | Exercise each capability as Editor through real routes/services.                              |
| R-S167-4    | ARCH-S167-2          | BEH-S167-4       | Use your account to do the work | Complete supported operations without elevated-role intervention.                             |
| R-S167-5    | ARCH-S167-2          | BEH-S167-5       | Use your account to do the work | Compare visible access with direct authorized requests and backing-store behavior.            |
| R-S167-6    | ARCH-S167-3          | BEH-S167-6       | Use your account to do the work | Inspect normal staff administration denial and actual effective role/capabilities.            |
| R-S167-7    | ARCH-S167-1          | BEH-S167-7       | Use your account to do the work | Exercise denied identity and effect-refused verification paths.                               |
| R-S167-8    | ARCH-S167-3          | BEH-S167-8       | Use your account to do the work | Compare Vendor internal access refusal and its permitted ticket flow.                         |
| R-S167-9    | ARCH-S167-3          | BEH-S167-9       | Use your account to do the work | Compare cross-account access while both can read shared lease information.                    |
| R-S167-10   | ARCH-S167-3          | BEH-S167-10      | Use your account to do the work | Inspect supported versus closed actions and unaffected administrative/publication boundaries. |

**Preservation set.**

- Managed authentication, verification-only mutation refusals, Vendor/ticket isolation, and Admin user management.
- Private personal records, exact action keys/effects, and unchanged non-renewal authority contracts.

Preservation is assessed separately from the new outcomes. Expectations intentionally replaced above are updated to the approved end state; unrelated passing behavior is not sacrificed or counted as proof of the new feature.

**Adversarial acceptance checks.**

- **AC-S167-1** — Existing explicitly scoped staff must have all existing internal Spaces, while Vendor/verification boundaries remain correct under ARCH-S167-1 and BEH-S167-1/2/7/8.
- **AC-S167-2** — Editor controls and direct API/store paths must agree without granting manageAdmin under ARCH-S167-2 and BEH-S167-3/4/5/6.
- **AC-S167-3** — Shared Spaces must not expose personal history/preferences or closed provider actions under ARCH-S167-3 and BEH-S167-9/10.

**Forbidden actions / hard gates.**

No new identity/role/IAM/credential-store substitution, universal Admin, Vendor crossover, cross-account personal records, or new Action Registry activation. Protected auth/rules/action-gate edits remain scoped to the future explicit execution authorization.

The repository’s permanent send, identity, private-data, and exact-effect boundaries remain applicable. This feature’s business friction removal does not disable those boundaries.

**Dependencies / sequencing.**

Extends existing access/session/action boundaries. Supplies ordinary operational access to S154–S164 and personal ownership to S166; S165 must apply identical access on mobile. Do not rerun retired S83.

Dependencies describe compatible interfaces and co-delivery, not independent execution authority. Follow the program order in [the canonical suite index](README.md); no completed baseline suite restarts.

**Standalone delivery contract.**

- **Deliverable now:** Consistent existing/new staff Space and renewal capabilities across UI/page/API/store, with administrative/Vendor/private-data preservation.
- **Consumes, but does not assume:** Actual authorized managed account and existing Space configuration. Do not change claims or provision Spaces to simulate open access.
- **Externally blocked effect:** No new privilege/identity is needed. Actual authentication challenge affects dependent verification only; independent implementation continues.
- **Produces for downstream suites:** One ordinary-staff access policy without operational role handoffs.

**Verification and delivery contract.**

1. During an explicitly authorized execution run, re-read current code/state, record the preservation baseline, and materialize the declared architecture/behavior observations before implementation. Changed expectations must fail for the actual missing behavior; already-satisfied requirements are preserved and evidenced rather than given an artificial failure.
2. Exercise every requirement/trace row and the named adversarial cases through the owning surfaces/services, including failure, concurrency/recovery, and exact effect boundaries where applicable. Record evidence scope honestly; deterministic adapters do not establish an actual customer/provider effect.
3. Follow docs/autonomous-agent-runner.md and AGENTS.md for focused verification, bash scripts/verify.sh, npm run test:e2e:core, diff/private-data/policy review, and the existing authorized release. No new validation program or provider-proof rerun is created.
4. Report ALL_GATES_GREEN only for actually verified scope; BLOCKED only for an exact unavailable external input after independent work is complete; BUDGET_EXHAUSTED only when an explicit budget exists. A green code slice does not establish a blocked live effect or full-program completion.
5. Delivery belongs to the complete program’s authorized cumulative release. Update present facts after actual readback; keep historical evidence and failed attempts truthful. Do not execute this contract merely because the file exists.

**Ordered prompt sequence.**

1. Read the router, current facts/resume/plan, this full specification, the canonical program contract, and the affected deployed owners.
2. Map R-S167-_ to the declared ARCH-S167-_ and BEH-S167-\* observations; record the current preservation/fail-first evidence under the existing loop.
3. Implement this bounded change and its actual failure/recovery paths in the owning components/services; carry shared program decisions into all affected boundaries.
4. Falsify against the requirement rows and AC-S167-\* cases; run the existing focused/canonical verification when execution is authorized.
5. Carry verified results into the program checkpoint, complete affected integration/mobile behavior, and deliver through the existing release procedure.

**Deletion/merge recommendation.**

Merge changed operating requirements into their owning current contracts when implemented. Retire this change specification only after its remaining requirements/dependencies are represented by code, evidence, and current facts under the repository’s existing retirement procedure. Preserve historical AC references and receipt scope; never retire a blocked outcome as complete.
