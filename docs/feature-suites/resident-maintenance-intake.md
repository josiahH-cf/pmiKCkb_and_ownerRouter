<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: maintenance-intake-v1 -->

# S47 — Tokenized resident maintenance intake

> Status: Complete and deployed for Live tokenized app intake, quarantine, and staff review; RentVine
> Current applicability: historical delivery evidence only; operational requirements are superseded by S227. No former maintenance or provider proof is queued.
> work-order chat synchronization and resident-reply drafting are separate S100 scope.

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

| Input                                                            | Classification                | Use and limitation                                                                                                                                                     |
| ---------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`, `docs/facts.md`, and current environment descriptor | Authority / current truth     | Production is Live-only; no public input may create a provider effect, and sample or Test data may not become a production record or draft.                            |
| Public intake token/route, quarantine writer, and review store   | Verified implementation truth | Establish the current token lifetimes, 16-KiB body ceiling, quarantine-only public write, transactional replay/cap checks, and atomic promote/dismiss behavior.        |
| Current maintenance page, role guards, and Firestore tests       | Verification baseline         | Establish Maintenance Space and `read`/`edit` boundaries without converting page visibility into write authority.                                                      |
| S100                                                             | Separate desired contract     | Owns manual RentVine work-order-chat sync and the human-reviewed resident-reply Gmail draft; it cannot be used to reinterpret public intake as verified provider data. |

**Architecture outcome (deterministic, fail-first).**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

- **ARCH-S47-1** — The public route remains structurally isolated from authenticated ticket writers,
  RentVine, Gmail, and provider execution. A negative-import/effect-spy check fails if the public path
  can import or construct any of them.
- **ARCH-S47-2** — Nonce consumption, property/day counting, intake creation, and activity evidence
  remain transactionally bounded. Concurrency tests prove two uses of one single-use token cannot
  create two quarantine records.
- **ARCH-S47-3** — Promotion creates the app ticket, ticket activity, and promoted intake state in
  one transaction. Dismissal writes only dismissal state and activity. A transaction-failure test
  proves neither path can leave a partial transition.
- **ARCH-S47-4** — Token, nonce, unreviewed-intake, and public response identities remain separated;
  secrets, raw IP addresses, token nonces, and internal document ids never enter the public response
  or ordinary logs.

**Behavior outcome (deterministic, fail-first).**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

- **BEH-S47-1** — A valid token and bounded valid report return `202 received` with an opaque public
  reference and create exactly one unverified quarantine item, never a ticket or provider record.
- **BEH-S47-2** — Missing/invalid/expired/revoked tokens, replay, retired data mode, oversize or
  malformed bodies, and exhausted burst/daily caps return their existing bounded status and generic
  copy without revealing which secret, record, or identity failed.
- **BEH-S47-3** — An authorized Editor can promote an unreviewed item once, with a confirmed unit or
  `Needs Verification`, or dismiss it once with a reason. Unauthorized, missing, or already-reviewed
  items refuse without another ticket or transition.
- **BEH-S47-4** — Loading or using the intake flow performs no RentVine call, chat read marker,
  work-order/status mutation, Gmail draft, or message send.

**Human litmus outcome.**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

### Submit and review one maintenance request

**If this was built correctly:** Staff creates a property-specific intake link. A resident uses it to
submit a short issue and receives a neutral confirmation. Staff sees the report in an unverified
queue and either confirms the unit and promotes it once or dismisses it with a reason. Nothing is
created in RentVine or Gmail.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with bounded-route,
  transaction, role, isolation, and provider-spy evidence.
- Human verdict: PASS | FAIL - why; when no human observer is present, use
  `Human verdict: NOT RUN — no human observer` and continue unless the owner explicitly makes that
  verdict a completion gate.

**Requirement-to-outcome traceability.**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

| Requirement                                              | Architecture outcome       | Behavior outcome         | Human litmus                              | Deterministic evidence / falsification                                                                                             |
| -------------------------------------------------------- | -------------------------- | ------------------------ | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Public submissions reach quarantine only                 | `ARCH-S47-1`, `ARCH-S47-4` | `BEH-S47-1`, `BEH-S47-4` | Submit and review one maintenance request | Negative-import scan and provider/ticket spies prove the public writer can touch only quarantine/activity/cap records.             |
| Tokens, replay, revocation, bounds, and caps fail closed | `ARCH-S47-2`, `ARCH-S47-4` | `BEH-S47-1`, `BEH-S47-2` | Submit and review one maintenance request | Token time/epoch, concurrent replay, 16-KiB boundary, malformed-body, and cap tables prove one bounded outcome and generic errors. |
| Promotion/dismissal is authorized and atomic             | `ARCH-S47-3`               | `BEH-S47-3`              | Submit and review one maintenance request | Role/Space, double-click, concurrent transition, transaction-failure, confirmed-unit, and unverified-unit tests.                   |
| S47 creates no external effect                           | `ARCH-S47-1`               | `BEH-S47-4`              | Submit and review one maintenance request | Static imports and RentVine/Gmail/action-executor spies remain zero across mint, submit, review, promote, and dismiss.             |

**Preservation set.**

Maintenance page read/edit guards; intake token, client-IP, rate-limit, sanitation, public-route,
quarantine, review-route, review-store, Firestore-rule, ticket, unit matcher, and Live-only retirement
tests remain green as a separate gate. S100 tests must not be used to substitute for S47 preservation.

**Adversarial acceptance checks.**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

- **AC-S47-1** — `ARCH-S47-1/4` and `BEH-S47-1/4` prove the only unauthenticated write remains the
  quarantine path and cannot import ticket creation, RentVine, Gmail, or generic execution.
- **AC-S47-2** — `ARCH-S47-2` and `BEH-S47-2` cover expired, revoked, replayed, reusable, concurrent,
  oversize, malformed, burst-limited, and property/day-limited cases with no information oracle.
- **AC-S47-3** — `ARCH-S47-3` and `BEH-S47-3` prove one atomic staff disposition, including a
  transaction abort and two concurrent reviews of the same item.
- **AC-S47-4** — Free-form `contact` never becomes a verified resident, recipient, unit, provider id,
  or draft address.
- **AC-S47-5** — A Test/legacy record cannot be submitted, promoted, or dismissed into current Live
  product state.

**Forbidden actions / hard gates.**

No provider call, work-order creation/status change, resident invitation, chat sync, Gmail draft or
send, public attachment, guessed resident/unit, direct promotion by a token bearer, Test-to-Live
promotion, secret/token/raw-IP logging, or exposure of internal ids. Do not preserve the obsolete
invitation seam as an S47 dependency or claim that it implements S100.

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
