<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S209 — Durable maintenance history and lease, unit and property associations

> Status: READY — original authoring state retained for historical ledger consistency; operational requirements superseded by S227. Current scope is read-only retention compatibility; no operational execution is authorized by this file.
> Intake: 081. Authored: 2026-10-09. Source baseline: WSL main `43bad3ad`; recorded serving baseline: `337ac163` (2026-10-08). These are contextual baselines, not new live verification.
> Bundle: `operations-communications-maintenance-2026-10`.

**Goal.**

Retain the original maintenance/vendor records, receipts, permissions and historical requirement evidence after custom maintenance retirement. S227 owns the current operating contract; Vendoroo remains standalone.

**Current state / intended end state.**

October 15 30:54–31:32 and the confirming maintenance emails retire the custom workflow. The source baseline 0b892865 contains the earlier implementation or proposal recorded below; S227 retires operational entry and preserves authorized read-only history. S227–S229 are under verification, with no new deployment claimed. Earlier authoring and delivery evidence retains its original scope.

**Actors and entry conditions.**

Existing authorized readers retain their current permissions. No new maintenance intake, vendor work, provider action, maintenance draft, integration access request or old proof window may start from this contract. Shared renewal and knowledge behavior remains separately owned.

**What it is / how it functions.**

Read-only retention uses the existing stores and receipt/history readers under their original authorization, with operational requests refused before dispatch. No records are deleted or relabeled. Current maintenance is managed in standalone Vendoroo; no destination URL or integration is invented.

**In scope / out of scope.**

Only retention, historical interpretation and permission compatibility remain applicable. All former operational maintenance/vendor requirements and Vendoroo ingestion work in the historical trace below are superseded by S227. Raw private sources remain outside Git. This file grants no new execution or release authority.

**Open questions & assumptions.**

Former provider/account/policy inputs are not prerequisites for retirement and must not trigger duplicate requests. Fresh read-only provider evidence and deployment are held only by the exact authentication/browser limitations recorded in docs/open-blockers.md. Missing observations are not success.

**Cross-product impacts.**

S227 owns retired HTTP and shared effect admission, authorized history and reports. Existing stores, receipts and permissions remain unchanged. Renewal, workflow-linked unsent communications, search and knowledge retain their independent contracts. The historical architecture below identifies original owners for preservation only; it does not request extensions or integration.

**Authority and evidence map.**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

| Input                                                         | Classification                             | Use and limitation                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AGENTS.md`, current owning code and tests, `docs/facts.md`   | Authority / implementation baseline        | Current safety, identity and exact-action boundaries persist until a later explicitly authorized governance change; source behavior is not automatically desired behavior.                                                                                                                                   |
| Owner clarification on 2026-10-09                             | Confirmed desired outcome                  | Complete staff-managed maintenance, PMI final closure, assigned-vendor contributions, future-only history, durable reporting evidence, configurable policy and explicit financial distinctions. Authoring is not execution authority.                                                                        |
| October 8 meeting intake and feedback aliases MF-20261008-A/B | Intent / reported experience               | Assessment before owner approval; no forced intake email; standing preapproval; visible creation progress, queue reveal and honest reconciliation. Reported duplicate ticket effects remain unverified; the reported creation experience establishes desired usability, not a proven number of live effects. |
| WSL main `43bad3ad`; recorded serving `337ac163`              | Inspected source / supplied batch baseline | Establishes the starting owners listed above. Local code checks and deterministic adapters do not prove a live provider effect, human observation or actual account entitlement.                                                                                                                             |
| Actual provider/configuration/approved-policy inputs          | External dependency                        | Use only verified real inputs for their exact operation. Do not create customer records, provider actions or policy values to demonstrate completion.                                                                                                                                                        |

**Architecture outcome (deterministic, fail-first).**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

- **ARCH-S209-1** — Extend ticket/link ownership with explicit association provenance/effective context and unresolved/conflicting states; consume verified RentVine IDs. Freeze a focused falsification before changing this boundary.
- **ARCH-S209-2** — Use an append-preserving event/artifact contract adjacent to existing ticket/activity/link stores; correct attribution without rewriting old event meaning. Freeze a focused falsification before changing this boundary.
- **ARCH-S209-3** — Extend the current product-retention owner to new core records/artifacts; verify retrievability, durable storage references and restore/export behavior instead of retaining only expiring URLs. Freeze a focused falsification before changing this boundary.
- **ARCH-S209-4** — Keep product and communications retention structurally separate; S208 source ingestion cannot attach indefinite TTL to raw communications merely by calling them an artifact. Freeze a focused falsification before changing this boundary.
- **ARCH-S209-5** — Define a rollout anchor and current-state migration marker using existing records; S215 owns migration execution, S214 reporting and global search consumes the canonical result. Freeze a focused falsification before changing this boundary.

**Behavior outcome (deterministic, fail-first).**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

- **BEH-S209-1** — Staff can distinguish the property's history from one tenancy and resolve a disputed association deliberately.
- **BEH-S209-2** — The timeline says who reported/did what and when; staff claims, vendor reports and provider receipts remain visibly distinct.
- **BEH-S209-3** — A report years later can still establish the job, amount and supporting retained artifact, independent of a provider URL's lifetime.
- **BEH-S209-4** — An older case retains the reportable facts while clearly explaining that a raw conversation has expired; no invented transcript is shown.
- **BEH-S209-5** — Users can tell when coverage starts and why prior history is incomplete; correction moves the association without losing evidence.

**Human litmus outcome.**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

### Revisit the right lease and evidence years later

**If this was built correctly:** PMI opens a property, unit or lease years after work was performed and finds the correctly associated maintenance history, reviewed invoices and retained work evidence. Resident turnover or expired raw communications do not attach old work to the wrong lease or remove the retained core evidence.

- Model verdict: ENGINEERING VERIFIED / DELIVERED — all mapped engineering scopes and independent deployment verified in run 5b3dfb90 /780f48db; exact CI, full observation, eleven readbacks and mobile scope are recorded in the native ledger. Human NOT RUN; no customer send was test proof.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

| Requirement                                        | Architecture outcome | Behavior outcome | Human litmus                                     | Acceptance / deterministic falsification                                                                                                                                          |
| -------------------------------------------------- | -------------------- | ---------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S209-1: Canonical identity and unresolved states | ARCH-S209-1          | BEH-S209-1       | Revisit the right lease and evidence years later | AC-S209-1: Exercise turnover, multi-unit properties, vacant/common-area work, duplicate names and contradictory IDs; no case is silently attached to the current tenant.          |
| R-S209-2: Attributable durable timeline            | ARCH-S209-2          | BEH-S209-2       | Revisit the right lease and evidence years later | AC-S209-2: Backdated report, late observation, corrected amount and ambiguous provider effect retain original attribution and corrected current meaning.                          |
| R-S209-3: Indefinite core facts and artifacts      | ARCH-S209-3          | BEH-S209-3       | Revisit the right lease and evidence years later | AC-S209-3: Time-travel beyond ten years and simulate expiring external links/storage restore; core history and retained approved artifact remain readable within scope.           |
| R-S209-4: Separate raw communication retention     | ARCH-S209-4          | BEH-S209-4       | Revisit the right lease and evidence years later | AC-S209-4: Expire a source message/recording under policy, then export history: retained facts/approved artifacts remain, raw content is absent and legal holds remain respected. |
| R-S209-5: Prospective collection and correction    | ARCH-S209-5          | BEH-S209-5       | Revisit the right lease and evidence years later | AC-S209-5: A pre-rollout case has only recorded starting facts plus later events; corrected association changes report inclusion once and cannot duplicate totals.                |

**Preservation set.**

`tests/unit/product-record-retention.test.ts`, `communications-retention.test.ts`, `tests/firestore/communications-retention-worker.test.ts`, `s99-work-order-link-store.test.ts`, photo storage/MIME/access checks and vendor assigned-ticket privacy.

Preservation is a separate result from new behavior. Existing tests are retained where they cover unchanged contracts; new checks must demonstrate the new outcome rather than repeat implementation details.

**Adversarial acceptance checks.**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

- **AC-S209-1** — R-S209-1, ARCH-S209-1, BEH-S209-1: Exercise turnover, multi-unit properties, vacant/common-area work, duplicate names and contradictory IDs; no case is silently attached to the current tenant.
- **AC-S209-2** — R-S209-2, ARCH-S209-2, BEH-S209-2: Backdated report, late observation, corrected amount and ambiguous provider effect retain original attribution and corrected current meaning.
- **AC-S209-3** — R-S209-3, ARCH-S209-3, BEH-S209-3: Time-travel beyond ten years and simulate expiring external links/storage restore; core history and retained approved artifact remain readable within scope.
- **AC-S209-4** — R-S209-4, ARCH-S209-4, BEH-S209-4: Expire a source message/recording under policy, then export history: retained facts/approved artifacts remain, raw content is absent and legal holds remain respected.
- **AC-S209-5** — R-S209-5, ARCH-S209-5, BEH-S209-5: A pre-rollout case has only recorded starting facts plus later events; corrected association changes report inclusion once and cannot duplicate totals.

**Forbidden actions / hard gates.**

No historical maintenance backfill, fabricated event date/lease, unlogged reassociation, automatic core-record deletion, expired URL presented as retained evidence, raw-communications retention bypass or tenant/owner turnover rewriting prior responsibility.

Across this suite: no fabricated customer/provider identity or amount, secret/raw customer evidence in Git, guessed provider endpoint or recipient, silent historical-evidence rewrite, or claim of unrun human/provider success. Writing this file opens no exact Action Registry key and grants no account, privilege or live proof target. Preserve S100's explicit warning/confirmation for reads that mark manager messages read; do not relabel them harmless background imports.

**Dependencies / sequencing.**

Use S227 for maintenance retirement and retained read-only compatibility. S228 owns current Dotloop diagnostics and S229 renewal/unsent communications preservation. Do not resume the old maintenance, Vendoroo integration or proof sequence from this historical contract.

**Standalone delivery contract.**

- **Deliverable now:** The S227 retirement/retention slice, preserving original evidence without migration effects.
- **Consumes, but does not assume:** Existing authorized history and exact receipts.
- **Externally blocked effect:** No former maintenance/provider effect is requested. Current live verification holds are in docs/open-blockers.md.
- **Produces for downstream suites:** Original record/receipt meanings and permissions, without new operational authority.

**Verification and delivery contract.**

1. Verify current S227 retirement and read-only retention through the real request, service and authorized reader boundaries.
2. Preserve original requirement IDs, historical verdicts, records and receipt meanings. Do not execute the superseded operational acceptance outcomes or collect retired integration inputs.
3. Use S227-S229 for current focused regressions, required repository checks and authorized gated delivery. Record local, live-provider, human and deployment outcomes separately; missing evidence cannot become success.
4. Report ALL_GATES_GREEN only for actually completed current engineering gates, BUDGET_EXHAUSTED only for an explicit budget, or BLOCKED with its exact unavailable external input after independent work. These terminal states do not resume the superseded operational outcomes.

**Ordered prompt sequence.**

1. Read the current router and S227; verify actual retirement/retention behavior.
2. Use original evidence below only for provenance and preservation scope.
3. Do not execute former operational instructions, collect retired integration inputs or rerun completed proofs.
4. Verify and deliver the currently authorized S227–S229 slice through existing gates.

**Deletion/merge recommendation.**

The original operational contract is superseded by S227. Its historical trace remains temporarily available for native program-ledger consistency; it is not an execution queue. Remove that provenance only with its remaining evidence references reconciled, retaining originals in Git history.
