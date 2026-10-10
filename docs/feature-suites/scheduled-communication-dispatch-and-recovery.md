<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S190 — Durable message dispatch and ambiguous-outcome recovery

> Status: READY — finalized October 9, 2026 owner-directed scope; execution active under the owner instruction; engineering scope is in the native program ledger and delivery remains unverified. This file authorizes no live effect and starts no implementation run.

**Goal.**

Approved workflow messages send at their selected time without a second human approval, with no duplicate dispatch on retries/restarts and truthful recovery when delivery cannot be confirmed.

**Current state / intended end state.**

`GmailHubService.sendConfirmed` already claims one human-confirmed linked reply, excludes unresolved sibling attempts and reconciles an RFC Message-ID. `GmailRuntimeClient.sendMessage` uses Gmail messages.send without a provider idempotency parameter and currently supports plain text. No approved lease recurrence worker exists; lease sends remain closed in the starting source. The new state consumes S189's durable authorization and S187's exact rich content, preserving useful existing claim/receipt primitives while introducing per-occurrence background dispatch.

The starting implementation was inspected in the newer WSL checkout `~/pmi-kc-work/main` at `43bad3adc7777ea035bc70eb8d2bee913427c810`; the documented serving release is October 8, 2026, `337ac163c5709381e8db8d2c18810bec357d8a96` / `pmi-kc-app-rmuz9g28p-0a2909d490e1`. These are source/documented release baselines, not a new live verification. Revalidate them before implementation; the Windows checkout's earlier production snapshot is not the baseline.

**Actors and entry conditions.**

A service-authenticated worker acts only for an existing authorized workflow sequence and designated managed sender. It is not a model or external caller choosing targets. The authorizing staff's workflow authority, approved revision and current sender availability must still allow the occurrence.

**What it is / how it functions.**

A due occurrence is claimed durably against the exact active authorization, sender, content and pause state. Before dispatch, obtain the fresh linked inbound observation required by S191 and revalidate the exact real target. Each occurrence has one stable provider message identity and immutable attempt evidence. Record success only from provider-backed evidence. Retry only a proved pre-dispatch failure or documented definitive non-effect; an ambiguous dispatch is reconciled, never blindly resent.

This is intake 062 of the named program. This contract is consumable by the existing implementation process after a separate owner execution instruction; registration and READY are not execution authority.

**In scope / out of scope.**

Immediate approved Send now and scheduled occurrences share dispatch, rich serialization, durable exclusion, service authentication, readback, success accounting and recovery. Generic bulk mail, unapproved recipients/content, model-driven sends, provider exactly-once claims and deleting old evidence are outside scope. S192 owns user-facing operating controls and catch-up.

**Open questions & assumptions.**

No material product question remains for this bounded suite. Dates, times, timezone, repeat interval, optional end date/send limit, actual recipients and sender mailbox are explicit runtime inputs, not invented defaults or an authoring blocker. Ordinary implementation choices must be grounded in the owning code and documented provider contracts.

**Cross-product impacts.**

- `lib/gmail-hub/service.ts`, `state-store.ts`, `contracts.ts`, `dependencies.ts` and current runtime suspension/effect boundaries.
- `lib/gmail-runtime/client.ts`, `raw-message.ts` and exact lease draft snapshot/claim/recovery primitives.
- New service-authenticated dispatch entry/worker and operational attention projection; discover exact infrastructure shape without guessing endpoints or scheduled-resource names.

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

- **ARCH-S190-1** — The server derives due work from durable authorization and current sequence state; worker input references an occurrence rather than supplying arbitrary sender/recipients/body.
- **ARCH-S190-2** — The dispatch route/queue validates the configured managed service identity before decoding effect-bearing input; sender access remains bound to the selected managed mailbox, not a stored staff bearer token.
- **ARCH-S190-3** — A transaction binds one occurrence/authorization revision/message identity to one attempt and excludes another unresolved occurrence for the same sequence; persist claim before provider invocation.
- **ARCH-S190-4** — Provider serialization consumes immutable approved recipients/subject/plain/HTML/attachment identities; sender From and client subject match and dispatch cannot recompute unreviewed wording.
- **ARCH-S190-5** — Fresh inbound observation and active-version/pause checks precede the durable occurrence claim; pause/cancel/transfer and claim use a consistent serializable sequence boundary.
- **ARCH-S190-6** — Persist immutable attempt states and provider-backed result/readback; use stable RFC Message-ID reconciliation and retain an unresolved hold when absence does not prove non-delivery.
- **ARCH-S190-7** — Successful-send accounting and next-occurrence progression use a durable settled transition linked to the receipt; repeated success notifications are idempotent and failures never increment the count.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S190-1** — A due approved occurrence can run unattended; unapproved, future, cancelled, paused, stale or fabricated occurrences produce no Gmail call.
- **BEH-S190-2** — Approved work survives browser closure; an unauthenticated/wrong-identity request cannot dispatch and a missing sender connection becomes visible blocked work.
- **BEH-S190-3** — Duplicate task delivery, double-click Send now and worker restart cannot create a second copy of an attempted occurrence.
- **BEH-S190-4** — The sent output matches what staff approved, including formatting and supported attachment bytes; intervening source/model/template changes cannot silently rewrite it.
- **BEH-S190-5** — A qualifying reply or acknowledged pause known before claim prevents that occurrence. A reply arriving after actual dispatch starts pauses later work and is never described as preventing the already-started send.
- **BEH-S190-6** — Timeouts show Unknown outcome with recovery, never Sent or Ready to retry. A matching provider result can settle the original attempt; a readback not found alone does not authorize another copy.
- **BEH-S190-7** — Staff see one sent item and the correct remaining limit/next date after success. Receipt-write failure and duplicate completion cannot double-count or start a follow-up early.

**Human litmus outcome.**

### Scheduled work sends once and tells the truth

**If this was built correctly:** A staff member schedules a message and closes the app. It sends once when due, preserves the approved formatting and sender, and appears as sent only when confirmed. If delivery is uncertain, the app explains that uncertainty and recovers the original attempt without sending another copy.

- Model verdict: LOCAL EVIDENCE — implementation and mapped engineering checks are recorded per requirement in `docs/evidence/operations-communications-maintenance-2026-10.json`; the complete local canonical gate and core E2E passed in their recorded scopes; exact-main CI and runtime/delivery remain separately verified gates. No live provider effect or human observation is claimed.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                                                         | Architecture outcome | Behavior outcome | Human litmus                                  | Deterministic evidence / falsification                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------- | -------------------- | ---------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R-S190-1** — Dispatch only a real due occurrence of an active approved revision.  | `ARCH-S190-1`        | `BEH-S190-1`     | Scheduled work sends once and tells the truth | `AC-S190-1`: Fixed-clock worker cases cover each state and forged payload/reference; adapter call count is exactly one only for the eligible occurrence and zero otherwise.                                               |
| **R-S190-2** — Authenticate the worker independently of browser sessions.           | `ARCH-S190-2`        | `BEH-S190-2`     | Scheduled work sends once and tells the truth | `AC-S190-2`: Invoke worker with absent/wrong/valid service identity and expired browser context; confirm rejection precedes provider construction and valid durable work does not depend on a live browser.               |
| **R-S190-3** — Claim each occurrence once across concurrent workers and restarts.   | `ARCH-S190-3`        | `BEH-S190-3`     | Scheduled work sends once and tells the truth | `AC-S190-3`: Actual emulator transaction race and restart-after-claim adapter scenarios prove one winner/one dispatch; task replay returns existing state and never manufactures a new message identity.                  |
| **R-S190-4** — Send exactly the approved rich content from the authorized sender.   | `ARCH-S190-4`        | `BEH-S190-4`     | Scheduled work sends once and tells the truth | `AC-S190-4`: Decode captured exact provider MIME and compare to the approved snapshot; altered attachment/body/sender/revision and missing bytes refuse before dispatch.                                                  |
| **R-S190-5** — Respect the reply/pause state at the final dispatch boundary.        | `ARCH-S190-5`        | `BEH-S190-5`     | Scheduled work sends once and tells the truth | `AC-S190-5`: Deterministic reply/pause before read, between read and claim, and after dispatch-start races prove the precise prevention boundary and honest state; unreadable/truncated evidence defers without dispatch. |
| **R-S190-6** — Separate definitive refusal, unknown outcome and confirmed delivery. | `ARCH-S190-6`        | `BEH-S190-6`     | Scheduled work sends once and tells the truth | `AC-S190-6`: Inject before-send failure, definitive provider refusal, lost-response success, missing result and multiple Message-ID matches; reconciliation preserves evidence and forbids blind redispatch.              |
| **R-S190-7** — Advance sequence/count only from a settled successful occurrence.    | `ARCH-S190-7`        | `BEH-S190-7`     | Scheduled work sends once and tells the truth | `AC-S190-7`: Crash after provider success/before record, duplicate result and contested completion scenarios recover to one success count; no next occurrence becomes executable while predecessor outcome is unresolved. |

**Preservation set.**

Existing unique message identity, source-backed sender validation, unresolved-send exclusion, receipt/readback and own-attempt recovery; current draft receipts remain drafts. Preserve service/Space authorization, canary refusals, runtime suspension and no synthetic live data.

**Adversarial acceptance checks.**

- **AC-S190-1** — Falsify `ARCH-S190-1` and `BEH-S190-1`: Fixed-clock worker cases cover each state and forged payload/reference; adapter call count is exactly one only for the eligible occurrence and zero otherwise.
- **AC-S190-2** — Falsify `ARCH-S190-2` and `BEH-S190-2`: Invoke worker with absent/wrong/valid service identity and expired browser context; confirm rejection precedes provider construction and valid durable work does not depend on a live browser.
- **AC-S190-3** — Falsify `ARCH-S190-3` and `BEH-S190-3`: Actual emulator transaction race and restart-after-claim adapter scenarios prove one winner/one dispatch; task replay returns existing state and never manufactures a new message identity.
- **AC-S190-4** — Falsify `ARCH-S190-4` and `BEH-S190-4`: Decode captured exact provider MIME and compare to the approved snapshot; altered attachment/body/sender/revision and missing bytes refuse before dispatch.
- **AC-S190-5** — Falsify `ARCH-S190-5` and `BEH-S190-5`: A reply included in the final provider observation prevents dispatch. A durable pause observed after that read but before claim also prevents it. A provider reply arriving after the read with delayed notification cannot be guaranteed caught by the local claim: test honest in-flight outcome and pause of subsequent work, with no claim of impossible atomic prevention. Unreadable/truncated evidence defers without dispatch.
- **AC-S190-6** — Falsify `ARCH-S190-6` and `BEH-S190-6`: Inject before-send failure, definitive provider refusal, lost-response success, missing result and multiple Message-ID matches; reconciliation preserves evidence and forbids blind redispatch.
- **AC-S190-7** — Falsify `ARCH-S190-7` and `BEH-S190-7`: Crash after provider success/before record, duplicate result and contested completion scenarios recover to one success count; no next occurrence becomes executable while predecessor outcome is unresolved.

Keep failed and partial outcomes honest. A passing UI alone does not prove dispatch, observation, provider delivery or access isolation.

**Forbidden actions / hard gates.**

No unlinked general-mail sending, guessed recipients, customer/model-triggered authorization, synthetic live records, mailbox impersonation, credential substitution, or unrelated mailbox disclosure. Private message content, attachments, tokens and raw evidence stay outside Git and value-bearing logs. Do not open Action Registry keys, alter protected paths, deploy or send as part of specification authoring. A future selected implementation must reconcile exact capability/operation contracts before enabling its named effects; an open key alone does not authorize arbitrary mail.

Do not claim Gmail provides provider-owned idempotency or an atomic send-if-no-new-reply primitive. Local claims, exact Message-ID lookup and dispatch ordering have explicit limits; preserve those limits in acceptance evidence.

**Dependencies / sequencing.**

The prevention guarantee applies to replies included in the complete final provider read and to
durable pause observations serialized before the occurrence claim. Gmail exposes no atomic
send-if-no-reply operation: an unseen provider reply after that read may race with dispatch,
including before the local claim. A later observation pauses subsequent work and records the real
ordering; it cannot unsend or retrospectively claim prevention. Check again before dispatch when a
durable pause is already available, without promising cross-provider atomicity.

S183/S184 provide selected operational authority. S187 content, S188 sender/responsibility, S189 durable authorization and S191 inbound evidence are required inputs; S192 operates recovery/catch-up. Missing inputs block only the occurrence while deterministic dispatch/refusal implementation proceeds.

**Standalone delivery contract.**

- **Deliverable now:** Service-authenticated due-work/Send-now dispatcher, transactional occurrence exclusion, exact rich transport, immutable receipts and uncertainty reconciliation with deterministic concurrency/restart evidence.
- **Consumes, but does not assume:** An exact approved sequence, real recipient/contact context, managed sender and fresh complete linked-thread observation. Missing or stale input yields no dispatch and an actionable state.
- **Externally blocked effect:** Actual Gmail sending waits on the exact implemented operation capability and managed provider connection/permission. Existing closed keys are not changed by this specification; local end-to-end evidence uses adapters.
- **Produces for downstream suites:** Per-occurrence immutable attempts, confirmed provider outcomes and body-minimized operational state for S191–S193.

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
