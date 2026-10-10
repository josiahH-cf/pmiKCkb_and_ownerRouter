<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S209 — Durable maintenance history and lease, unit and property associations

> Status: READY — finalized specification for later authorized implementation; no application, provider or Registry change is performed by authoring.
> Intake: 081. Authored: 2026-10-09. Source baseline: WSL main `43bad3ad`; recorded serving baseline: `337ac163` (2026-10-08). These are contextual baselines, not new live verification.
> Bundle: `operations-communications-maintenance-2026-10`.

**Goal.**

Preserve trustworthy maintenance facts and artifacts against canonical property/unit/lease identities so reports remain useful after tenancy changes and in ten or more years.

**Current state / intended end state.**

Tickets retain unit/property, activity, photo references and estimates; work-order links retain provider identity/snapshot. Tickets have indefinite product retention, while imported work-order chat/workflow communications have a 365-day policy. No durable complete lease association or reportable financial/evidence history model exists.

Extend the current owners with stable associations, attributable versioned operational facts and retained core artifacts. Start prospectively at rollout without historical maintenance backfill. Historical relationships survive tenant/owner turnover; raw communications retain their separately accepted shorter lifetime.

**Actors and entry conditions.**

PMI staff confirm/correct associations and inspect history; approved integrations supply attributed source observations. Assigned vendors contribute only within their current scope. Reports are prepared by staff; this suite creates no owner/resident login.

**What it is / how it functions.**

- **R-S209-1 — Canonical identity and unresolved states.** Bind a case to verified property/unit/work-order and, when applicable, the lease/tenancy for the work's event date. Support legitimate property-level or vacant work without inventing a lease. Similar addresses/names or current occupancy alone do not prove a historical association.
- **R-S209-2 — Attributable durable timeline.** Persist material staff/vendor/source events with actor or source, occurrence/recording time, canonical references and version/correction history. Reads/import refreshes are observations, not work progress, approvals or proof of a completed effect.
- **R-S209-3 — Indefinite core facts and artifacts.** Retain core ticket/history/associations, reviewed troubleshooting summaries, estimates, invoices, cost/approval/closeout facts, source evidence references and approved attachments for ten-plus-year reporting under indefinite product retention. Preserve original bytes/hash for retained artifacts, with access checks and legal holds.
- **R-S209-4 — Separate raw communication retention.** Apply the accepted shorter communications policy to raw call recordings/transcripts/imported message bodies; preserve required reviewed durable factual summaries/artifacts independently before expiry. Show unavailable/expired raw-source links honestly without retaining private raw bodies through a loophole.
- **R-S209-5 — Prospective collection and correction.** Collect new activity from rollout and attach existing open cases only as needed for continued work, labelled as their starting state. Do not backfill prior maintenance transactions. Association correction is authorized, attributed and updates report/search projections without duplicating the case.

**In scope / out of scope.**

In scope: prospective canonical maintenance history, association correction, durable core evidence/retention and raw-source expiry compatibility. Out of scope: maintenance historical backfill, invented old facts, expanded vendor/owner access, indefinite raw communications by default or financial posting.

**Open questions & assumptions.**

Specific storage implementation/schema is an engineering choice derived from existing Firestore/Drive ownership. Actual source identity/retention rights must be verified for provider inputs. The owner accepted indefinite core facts/artifacts and shorter raw communication retention; those lifetimes must not be conflated.

No material product decision is deferred inside this READY scope. Actual identities, approved runtime policies, financial values and provider configuration are inputs, not values the implementation runner invents. Their absence blocks only the named dependent operation; implementation and independent verification proceed.

**Cross-product impacts.**

- `lib/maintenance/ticket-model.ts`, `lib/firestore/maintenance-tickets.ts`, `maintenance-work-order-links.ts` — existing canonical ticket/activity/provider relation owners.
- `lib/operations/product-record-retention.ts`; `lib/gmail-hub/retention-contract.ts`, `retention-policy.ts` — separate indefinite product and finite communications policies.
- `lib/maintenance/image-store.ts`, existing photo service; S208/S212/S213/S214/S215 — ingest, vendor artifacts, costs, reports and migration.

**Authority and evidence map.**

| Input                                                         | Classification                             | Use and limitation                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AGENTS.md`, current owning code and tests, `docs/facts.md`   | Authority / implementation baseline        | Current safety, identity and exact-action boundaries persist until a later explicitly authorized governance change; source behavior is not automatically desired behavior.                                                                                                                                   |
| Owner clarification on 2026-10-09                             | Confirmed desired outcome                  | Complete staff-managed maintenance, PMI final closure, assigned-vendor contributions, future-only history, durable reporting evidence, configurable policy and explicit financial distinctions. Authoring is not execution authority.                                                                        |
| October 8 meeting intake and feedback aliases MF-20261008-A/B | Intent / reported experience               | Assessment before owner approval; no forced intake email; standing preapproval; visible creation progress, queue reveal and honest reconciliation. Reported duplicate ticket effects remain unverified; the reported creation experience establishes desired usability, not a proven number of live effects. |
| WSL main `43bad3ad`; recorded serving `337ac163`              | Inspected source / supplied batch baseline | Establishes the starting owners listed above. Local code checks and deterministic adapters do not prove a live provider effect, human observation or actual account entitlement.                                                                                                                             |
| Actual provider/configuration/approved-policy inputs          | External dependency                        | Use only verified real inputs for their exact operation. Do not create customer records, provider actions or policy values to demonstrate completion.                                                                                                                                                        |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S209-1** — Extend ticket/link ownership with explicit association provenance/effective context and unresolved/conflicting states; consume verified RentVine IDs. Freeze a focused falsification before changing this boundary.
- **ARCH-S209-2** — Use an append-preserving event/artifact contract adjacent to existing ticket/activity/link stores; correct attribution without rewriting old event meaning. Freeze a focused falsification before changing this boundary.
- **ARCH-S209-3** — Extend the current product-retention owner to new core records/artifacts; verify retrievability, durable storage references and restore/export behavior instead of retaining only expiring URLs. Freeze a focused falsification before changing this boundary.
- **ARCH-S209-4** — Keep product and communications retention structurally separate; S208 source ingestion cannot attach indefinite TTL to raw communications merely by calling them an artifact. Freeze a focused falsification before changing this boundary.
- **ARCH-S209-5** — Define a rollout anchor and current-state migration marker using existing records; S215 owns migration execution, S214 reporting and global search consumes the canonical result. Freeze a focused falsification before changing this boundary.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S209-1** — Staff can distinguish the property's history from one tenancy and resolve a disputed association deliberately.
- **BEH-S209-2** — The timeline says who reported/did what and when; staff claims, vendor reports and provider receipts remain visibly distinct.
- **BEH-S209-3** — A report years later can still establish the job, amount and supporting retained artifact, independent of a provider URL's lifetime.
- **BEH-S209-4** — An older case retains the reportable facts while clearly explaining that a raw conversation has expired; no invented transcript is shown.
- **BEH-S209-5** — Users can tell when coverage starts and why prior history is incomplete; correction moves the association without losing evidence.

**Human litmus outcome.**

### Revisit the right lease and evidence years later

**If this was built correctly:** PMI opens a property, unit or lease years after work was performed and finds the correctly associated maintenance history, reviewed invoices and retained work evidence. Resident turnover or expired raw communications do not attach old work to the wrong lease or remove the retained core evidence.

- Model verdict: LOCAL EVIDENCE — implementation and mapped engineering checks are recorded per requirement in `docs/evidence/operations-communications-maintenance-2026-10.json`; the complete local canonical gate and core E2E passed in their recorded scopes; exact-main CI and runtime/delivery remain separately verified gates. No live provider effect or human observation is claimed.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

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

- **AC-S209-1** — R-S209-1, ARCH-S209-1, BEH-S209-1: Exercise turnover, multi-unit properties, vacant/common-area work, duplicate names and contradictory IDs; no case is silently attached to the current tenant.
- **AC-S209-2** — R-S209-2, ARCH-S209-2, BEH-S209-2: Backdated report, late observation, corrected amount and ambiguous provider effect retain original attribution and corrected current meaning.
- **AC-S209-3** — R-S209-3, ARCH-S209-3, BEH-S209-3: Time-travel beyond ten years and simulate expiring external links/storage restore; core history and retained approved artifact remain readable within scope.
- **AC-S209-4** — R-S209-4, ARCH-S209-4, BEH-S209-4: Expire a source message/recording under policy, then export history: retained facts/approved artifacts remain, raw content is absent and legal holds remain respected.
- **AC-S209-5** — R-S209-5, ARCH-S209-5, BEH-S209-5: A pre-rollout case has only recorded starting facts plus later events; corrected association changes report inclusion once and cannot duplicate totals.

**Forbidden actions / hard gates.**

No historical maintenance backfill, fabricated event date/lease, unlogged reassociation, automatic core-record deletion, expired URL presented as retained evidence, raw-communications retention bypass or tenant/owner turnover rewriting prior responsibility.

Across this suite: no fabricated customer/provider identity or amount, secret/raw customer evidence in Git, guessed provider endpoint or recipient, silent historical-evidence rewrite, or claim of unrun human/provider success. Writing this file opens no exact Action Registry key and grants no account, privilege or live proof target. Preserve S100's explicit warning/confirmation for reads that mark manager messages read; do not relabel them harmless background imports.

**Dependencies / sequencing.**

S206 supplies stable case creation; S208 supplies only verified provider data after finalization. S212/S213 append contributions/financial facts. S214 consumes durable history and S215 performs bounded starting-state migration.

**Standalone delivery contract.**

- **Deliverable now:** Canonical association and durable timeline/artifact contract, correction service/UI, indefinite-core/finite-raw compatibility and long-horizon deterministic verification.
- **Consumes, but does not assume:** Verified real identities/event dates/source evidence; unresolved property/lease remains explicit, and source-provider access may be absent.
- **Externally blocked effect:** Import/capture of actual external artifacts waits for documented access/retention rights and configured storage; app-owned history/correction/retention can be implemented independently.
- **Produces for downstream suites:** Stable report/search/history identity, attributable timeline, retained core evidence and explicit coverage anchor for S214 and later search.

**Verification and delivery contract.**

1. Re-read current owners and refresh the baseline before implementation. Materialize the named architecture, behavior and acceptance falsifications; record pre-existing unrelated failures separately.
2. Exercise every row with service/transaction and rendered journeys appropriate to the outcome, including denial, interruption, concurrency and partial completion. Use isolated local fixtures and deterministic external adapters; keep the preservation result separate.
3. Read back saved artifacts/state and reconcile them with the acted-on identity/version. A UI success label, supplied example or passing adapter cannot establish live provider success.
4. Run focused checks, then `bash scripts/verify.sh` and applicable compiled-browser checks for any later ship candidate. Audit secrets/PII, authority, runtime configuration and cross-suite traceability.
5. A later authorized implementation reports ALL_GATES_GREEN only for completed declared engineering checks; a named live/account proof remains separately BLOCKED when its input is missing. BUDGET_EXHAUSTED applies only to an explicit budget. Never label the whole operational outcome complete from a partial green slice.
6. Authoring registration/validation is documentary only. Commit, push, deployment, implementation-loop start and external communication require their own explicit instruction.

**Ordered prompt sequence.**

1. Re-verify current source, accepted decisions, dependency contracts and relevant read-only state.
2. Freeze the requirement/architecture/behavior/acceptance matrix and preservation baseline before implementation.
3. Implement the bounded owner and all unavailable/recovery paths; reuse existing services and keep adjacent suite ownership explicit.
4. Falsify every row, read back persisted results, run focused/canonical checks, update verified current documentation and deliver only when separately authorized.

**Deletion/merge recommendation.**

Retain this suite until its full behavior, remaining dependencies and acceptance evidence are represented in current code/tests/facts. Then merge its operating contract into current maintenance documentation; preserve historical evidence without keeping duplicate active instructions.
