<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S193 — Communications migration, retirement and complete journey verification

> Status: READY — finalized October 9, 2026 owner-directed scope; execution active under the owner instruction; engineering scope is in the native program ledger and delivery remains unverified. This file authorizes no live effect and starts no implementation run.

**Goal.**

The redesigned communications system becomes the single working experience without losing existing drafts, links or evidence, and complete renewal/maintenance journeys prove that scheduling, replying and team takeover work together.

**Current state / intended end state.**

The application has lease preparation, generic workflow reply controls, a Communications page, manual refresh, retired continuous-watch routes and historical draft/send receipts with distinct meanings. S175 addressed layout, while old docs/tests still impose draft-only/retirement boundaries. The desired release deliberately reconciles these surfaces and contracts under the new owner direction rather than leaving parallel operating flows or relabelling old evidence.

The starting implementation was inspected in the newer WSL checkout `~/pmi-kc-work/main` at `43bad3adc7777ea035bc70eb8d2bee913427c810`; the documented serving release is October 8, 2026, `337ac163c5709381e8db8d2c18810bec357d8a96` / `pmi-kc-app-rmuz9g28p-0a2909d490e1`. These are source/documented release baselines, not a new live verification. Revalidate them before implementation; the Windows checkout's earlier production snapshot is not the baseline.

**Actors and entry conditions.**

Existing staff and their authorized workflow data; implementation/release verification uses deterministic adapters and approved read-only runtime assurance. A meaningful live customer send is ordinary operational work requiring its own exact chosen message/schedule, not something manufactured to fill a test matrix.

**What it is / how it functions.**

Inventory actual current communication entry points, persisted records, provider contracts and consumers. Define compatibility for old links and readback, migrate only necessary app-owned associations/version shape, and route ordinary work into the new hub. Existing drafts remain unscheduled and receipts retain their original effect. Retire conflicting UI/contracts only after complete replacement is proved. Run the integrated lifecycle, failure and privacy journeys as independent acceptance, not an average of component unit passes.

This is intake 065 of the named program. This contract is consumable by the existing implementation process after a separate owner execution instruction; registration and READY are not execution authority.

**In scope / out of scope.**

Communication-specific inventory/migration, old-process retirement, consumer/document parity and integrated unattended journey evidence are in scope. Re-running completed provider proofs, sending a migration backlog, rewriting historical customer/provider evidence, unrelated application feature changes and framework creation are outside scope.

**Open questions & assumptions.**

No material product question remains for this bounded suite. Dates, times, timezone, repeat interval, optional end date/send limit, actual recipients and sender mailbox are explicit runtime inputs, not invented defaults or an authoring blocker. Ordinary implementation choices must be grounded in the owning code and documented provider contracts.

**Cross-product impacts.**

- S186–S192 owners and all actual lease/ticket/communication entry points, notification/global-search links and status projections.
- Existing message preparation/draft snapshots, `gmail_workflow_communications`, confirmation/audit/history records and related cleanup/retention consumers.
- `docs/spec.md`, `integration-architecture.md`, `engineering.md`, current help and old S75/S175/retired-watch assertions; governing router/index changes remain coordinated by the program owner.

Starting owners are discovery anchors, not a frozen implementation allowlist. Retain one canonical contract across all actual consumers.

**Authority and evidence map.**

| Input                                                                                     | Classification                    | Use and limitation                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Latest October 9 owner direction and accepted clarification recommendations               | Confirmed desired behavior        | Establish the named workflow-linked communication redesign, one end-state Send/Schedule action, staff ownership, configurable recurrence, reply pause and retirement. They supersede former draft-only requirements for this future scope; they execute nothing during authoring. |
| `AGENTS.md`, S183/S184 and the selected program in the suite index                        | Authority and governance contract | Follow the selected execution scope and surviving access, identity, protected-path and delivery controls. Reconcile old blanket send restrictions explicitly during the authorized implementation rather than silently opening a key.                                             |
| Inspected WSL source/tests and current `docs/facts.md`                                    | Starting implementation evidence  | Establish existing primitives and their limitations. Current behavior does not replace the owner's new outcome.                                                                                                                                                                   |
| Supplied `feature-specs-to-scope/feature-spec-bundle/` meeting notes, PDF and screenshots | Intake evidence                   | Supply reported staff journeys and defects; they do not prove provider delivery or settle an unchosen runtime schedule.                                                                                                                                                           |
| Managed mailbox permissions, real recipient mapping and provider observations             | Runtime external input            | Absence blocks only the affected provider operation; no guessed recipient, substituted account or synthetic customer record.                                                                                                                                                      |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S193-1** — Maintain one scoped source-to-owner mapping for pages, controls, APIs, links and help; each legacy entry either adapts/redirects to the new contract or is intentionally retired with compatible recovery.
- **ARCH-S193-2** — Any required app-record migration is versioned/idempotent, preflighted against exact records, read back and correctable; existing draft or historical status is not an authorization input.
- **ARCH-S193-3** — Historical drafts, approvals, manual contact reports, sends and unknown attempts retain actual identities/outcomes; migration/cleanup respects active authorization, own-attempt recovery and existing legal holds without assuming a live TTL is configured.
- **ARCH-S193-4** — Integrated adapters exercise shared composer, authorization, worker, observation and operational state through the same real service boundaries used in production.
- **ARCH-S193-5** — Maintenance-provided real workflow association uses the same canonical communication contract; team transfer creates authorized future work under the new sender while preserving linked history.
- **ARCH-S193-6** — Integration covers concurrency, stale edits, missed notifications, DST/outage, missing sender, provider ambiguity and recovery using the actual transaction/calendar/observation contracts.
- **ARCH-S193-7** — Current docs/help/status/key contracts reflect the selected new workflow and direct staff operations, with no remaining blanket draft-only assertion on an enabled named send path and no accidental generic-send expansion.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S193-1** — Staff cannot end up in a conflicting old draft-only workflow from a lease, notification, search result or saved link; genuine old attempt recovery still works.
- **BEH-S193-2** — Old drafts and links remain available with accurate state. Upgrade/retry/restart never queues an old unsent draft, replays a completed reply or sends a migrated backlog.
- **BEH-S193-3** — Staff distinguish an old Gmail draft from a confirmed send and can inspect unresolved work after upgrade. Cleanup does not delete data still required to operate/reconcile an active sequence.
- **BEH-S193-4** — A staff member opens a lease in a new hub tab, edits rich initial/follow-up content, schedules it, closes the browser, receives one confirmed initial send, then a human reply pauses the next follow-up.
- **BEH-S193-5** — Authorized staff see a maintenance conversation, pause it, hand it over and continue from the new responsible person's managed mailbox; a vendor or unrelated actor cannot see private staff threads.
- **BEH-S193-6** — Staff retain content and accurate state through each failure; no duplicate send, catch-up burst, false success, unapproved changed payload or false reply decision occurs.
- **BEH-S193-7** — Staff encounter one understandable process; implementation reports component, compiled journey, provider and human scopes separately, leaving genuine unavailable live effects explicit.

**Human litmus outcome.**

### The replacement works as one complete process

**If this was built correctly:** A staff member starts in a lease, schedules approved messages in the new hub and later sees a reply stop the follow-up. A teammate can take over from their own mailbox. Existing drafts and history are still understandable, and old links no longer lead to competing processes.

- Model verdict: LOCAL EVIDENCE — implementation and mapped engineering checks are recorded per requirement in `docs/evidence/operations-communications-maintenance-2026-10.json`; the complete local canonical gate and core E2E passed in their recorded scopes; exact-main CI and runtime/delivery remain separately verified gates. No live provider effect or human observation is claimed.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                                                      | Architecture outcome | Behavior outcome | Human litmus                                  | Deterministic evidence / falsification                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------- | -------------------- | ---------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R-S193-1** — Inventory and replace every actual communication entry point.     | `ARCH-S193-1`        | `BEH-S193-1`     | The replacement works as one complete process | `AC-S193-1`: Route/control/link inventory traversal and compiled browser checks enter through lease, hub, notification, search and old URL; assert one canonical working flow and preserved exact-attempt recovery.                                           |
| **R-S193-2** — Migrate without scheduling or sending old work.                   | `ARCH-S193-2`        | `BEH-S193-2`     | The replacement works as one complete process | `AC-S193-2`: Representative legacy record fixtures, dry-run/idempotent migration and restart prove unchanged effect counts, no new authorization and preserved draft/link identity.                                                                           |
| **R-S193-3** — Preserve historical meaning and private retention boundaries.     | `ARCH-S193-3`        | `BEH-S193-3`     | The replacement works as one complete process | `AC-S193-3`: Legacy success/ambiguous/draft/held fixtures before and after migration/cleanup compare provenance and hashes; active schedule snapshots survive their operational life, and legal holds remain effective.                                       |
| **R-S193-4** — Prove the complete unattended renewal lifecycle.                  | `ARCH-S193-4`        | `BEH-S193-4`     | The replacement works as one complete process | `AC-S193-4`: One compiled-browser/backend journey records linked identity, approved MIME, restart, worker claim/receipt, fresh incoming observation and zero next-send calls after reply; repeat with no reply to prove approved follow-up.                   |
| **R-S193-5** — Prove linked maintenance and team-transfer lifecycle.             | `ARCH-S193-5`        | `BEH-S193-5`     | The replacement works as one complete process | `AC-S193-5`: Deterministic maintenance journey plus two-actor takeover checks exact old/new sender and thread associations, future authorization and negative vendor/other-Space/private-mail access.                                                         |
| **R-S193-6** — Prove material failure/recovery paths across the whole system.    | `ARCH-S193-6`        | `BEH-S193-6`     | The replacement works as one complete process | `AC-S193-6`: Named integrated scenario matrix injects failure at approval, claim, dispatch, result, incoming sync and transfer boundaries; compare occurrence counts, exact payloads, persisted states and recovery results rather than only component mocks. |
| **R-S193-7** — Retire contradictory processes and verify release scope honestly. | `ARCH-S193-7`        | `BEH-S193-7`     | The replacement works as one complete process | `AC-S193-7`: Reference/route/document validators and scoped old/new contract checks pass; authorized release uses current native gates/readbacks. Human verdict remains NOT RUN without an observer, and no synthetic live message is sent for proof.         |

**Preservation set.**

All surviving S186–S192 preservation sets, legacy own-receipt reconciliation, actual draft/send/provider versus staff-report distinctions, mailbox/Space isolation, immutable failed outcomes, legal holds, no synthetic production data and the program's normal release controls.

**Adversarial acceptance checks.**

- **AC-S193-1** — Falsify `ARCH-S193-1` and `BEH-S193-1`: Route/control/link inventory traversal and compiled browser checks enter through lease, hub, notification, search and old URL; assert one canonical working flow and preserved exact-attempt recovery.
- **AC-S193-2** — Falsify `ARCH-S193-2` and `BEH-S193-2`: Representative legacy record fixtures, dry-run/idempotent migration and restart prove unchanged effect counts, no new authorization and preserved draft/link identity.
- **AC-S193-3** — Falsify `ARCH-S193-3` and `BEH-S193-3`: Legacy success/ambiguous/draft/held fixtures before and after migration/cleanup compare provenance and hashes; active schedule snapshots survive their operational life, and legal holds remain effective.
- **AC-S193-4** — Falsify `ARCH-S193-4` and `BEH-S193-4`: One compiled-browser/backend journey records linked identity, approved MIME, restart, worker claim/receipt, fresh incoming observation and zero next-send calls after reply; repeat with no reply to prove approved follow-up.
- **AC-S193-5** — Falsify `ARCH-S193-5` and `BEH-S193-5`: Deterministic maintenance journey plus two-actor takeover checks exact old/new sender and thread associations, future authorization and negative vendor/other-Space/private-mail access.
- **AC-S193-6** — Falsify `ARCH-S193-6` and `BEH-S193-6`: Named integrated scenario matrix injects failure at approval, claim, dispatch, result, incoming sync and transfer boundaries; compare occurrence counts, exact payloads, persisted states and recovery results rather than only component mocks.
- **AC-S193-7** — Falsify `ARCH-S193-7` and `BEH-S193-7`: Reference/route/document validators and scoped old/new contract checks pass; authorized release uses current native gates/readbacks. Human verdict remains NOT RUN without an observer, and no synthetic live message is sent for proof.

Keep failed and partial outcomes honest. A passing UI alone does not prove dispatch, observation, provider delivery or access isolation.

**Forbidden actions / hard gates.**

No unlinked general-mail sending, guessed recipients, customer/model-triggered authorization, synthetic live records, mailbox impersonation, credential substitution, or unrelated mailbox disclosure. Private message content, attachments, tokens and raw evidence stay outside Git and value-bearing logs. Do not open Action Registry keys, alter protected paths, deploy or send as part of specification authoring. A future selected implementation must reconcile exact capability/operation contracts before enabling its named effects; an open key alone does not authorize arbitrary mail.

**Dependencies / sequencing.**

This integrated outcome consumes compatible S186–S192 implementations and S183/S184 governance. Maintenance participation consumes the actual scoped maintenance association/permission contracts; absent provider access blocks only that live check. Inventory/compatibility/migration and deterministic end-to-end testing proceed independently.

**Standalone delivery contract.**

- **Deliverable now:** Complete communication-specific compatibility and migration slice, retirement mapping, current documentation and deterministic renewal/maintenance/team/recovery evidence matrix.
- **Consumes, but does not assume:** Canonical contracts from the named suites, actual legacy record shapes and current provider/runtime capabilities. Missing live inputs remain named and do not become claimed proof.
- **Externally blocked effect:** Live provider dispatch/observation/takeover readbacks need real managed permissions, configuration and chosen runtime work. Human observation is NOT RUN without an observer. Neither blocks authoring or deterministic integrated verification.
- **Produces for downstream suites:** One verified communication operating contract, stable legacy compatibility and exact evidence ledger for program closure; historical receipts never become new authority.

**Verification and delivery contract.**

1. Re-read current source and service identity; record the starting preservation results. Materialize the specific missing architecture and behavior scenarios below before the first implementation edit. Already-correct behavior receives preservation evidence rather than a manufactured failure.
2. Exercise every requirement with meaningful focused unit/backend checks and compiled-browser journeys where the output is visible. Use deterministic external adapters for send, reply, failure and concurrency scenarios; no live customer effect is created merely as a test.
3. Keep preservation results separate. Run `bash scripts/verify.sh` for an authorized ship candidate; inspect the diff and audit secrets, personal data, mailbox/Space boundaries, exact effect scope, runtime configuration and documentation.
4. Record model evidence and the actual human verdict. Report `ALL_GATES_GREEN` only for the proved implementation scope; keep a named live provider configuration/permission dependency explicitly `BLOCKED` if unavailable. `BUDGET_EXHAUSTED` applies only under an explicit budget. Deliver only under the program's separate execution instruction and release contract.

**Ordered prompt sequence.**

1. Revalidate the inspected starting owners and current live read-only evidence.
2. Bind the requirement rows to falsifying scenarios, a separate preservation baseline and the human litmus.
3. Implement the complete bounded contract and its unset, conflict, failure and recovery behavior.
4. Run focused and canonical checks; reconcile affected current documentation and compatibility; deliver only when the owner has separately selected execution.

**Deletion/merge recommendation.**

Retire this narrative only after the requirements, compatibility behavior and exact evidence are carried by code/tests and current product/facts documentation. Keep blocked provider effects visible; never retire them as proved merely because local tests pass.
