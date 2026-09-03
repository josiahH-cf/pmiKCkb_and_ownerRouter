<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: source-of-truth-writeback-v1 -->

# S98 — Operating renewal Sheet append and fixed-row capability boundary

> Status: **DEPLOYED PROOF-QUALIFIED BASELINE; APPEND-ONLY INTEGRITY/CAPABILITY REMEDIATION ACTIVE
> AND UNRELEASED.** Both exact Registry keys remain open, the operating-Sheet write switch is on,
> and the temporary proof row is absent. The serving revision still contains the historical
> fixed-row path. The required end state keeps normal row append and refuses normal field update and
> every fixed-row delete/restore before writer construction until a provider-owned stable-row seam
> exists.

**Goal.**

An authorized renewal operator can add one missing operating-Sheet row from fresh server-resolved
lease data through an exact preview, explicit confirmation, one lease-scoped attempt, receipt, and
readback. The application never presents a fixed-row update or reversal as safe when Google Sheets
cannot atomically prove that the addressed row still represents the intended lease.

**Current state / intended end state.**

The deployed S98 baseline passed bounded live proofs for
`google_sheets.renewal_checklist.row_append` and
`google_sheets.renewal_checklist.field_update`. Its proof row was deleted and read back absent. Those
historical receipts remain valid evidence and both exact Registry keys remain open.

Post-deployment review found two separate risks:

1. Browser-selected row/value/source terms and proposal replacement could break the chain from the
   current lease workspace to the exact provider attempt.
2. A read followed by a fixed-A1 `findReplace` or `deleteDimension` request cannot prove that a
   collaborator did not insert, delete, sort, or move rows between the read and mutation. The
   current Google client has no provider-owned logical-row token, expected generation, idempotency
   status, or tombstone protocol. Google documents atomic application of one `batchUpdate` request,
   but not a conditional logical-row mutation across prior reads:
   <https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate>.

The correction therefore keeps append—the operation that creates a new row and its identity in one
atomic request—and fails closed for every fixed-row mutation. An open key or completed proof never
overrides an absent provider safety capability.

**Actors and entry conditions.**

- A managed Renewals-space Editor, Approver, or Admin may assemble or discard an app-owned proposal
  for the lease workspace they are viewing.
- Only a managed Admin with Renewals Space access may confirm a provider effect.
- S83 owns access requests when the signed-in actor lacks the required role or Space.
- Normal append additionally requires Production + Live, the exact row-append key, the operating
  write switch, no runtime suspension, current Sheets DWD scope, a fresh unambiguous RentVine/Sheet
  association proving the lease has no row, a current resolved header, and an unexpired preview.
- The browser supplies only the signed short-lived workspace context, bounded intent, proposal
  generation, effect hash, and explicit confirmation. It never supplies the spreadsheet, tab,
  lease/property ids, tenant, row, header position, values, value sources, note, operation id, or
  proof mode.

**What it is / how it functions.**

### Exact capability matrix

| Registry key                                       | Current product behavior                                                                                                                                                                                              |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `google_sheets.renewal_checklist.row_append`       | Executable for one normal server-derived append. One `appendCells` request writes the exact row and the system note on the resolved `tenant_name` cell. No fixed-row delete reversal is offered.                      |
| `google_sheets.renewal_checklist.field_update`     | Remains open only as historical activation/receipt truth. Normal proposal and execution return typed `provider_capability_unavailable` before constructing the Sheets writer. No restore is offered.                  |
| `google_sheets.renewal_checklist.writeback`        | Retired compatibility identifier; permanently closed and non-executable.                                                                                                                                              |
| Historical sealed-proof proposal/runner operations | Provider mutations are retired. They cannot propose, execute, update, delete, restore, or recreate the proof row. Bodyless historical receipt/status evidence remains readable through ordinary evidence stores only. |

The normal append note is:

`PMI KC writeback — operation <opaque id> — lease <provider id> — property <provider id>`

The opaque operation id is server-generated and stored in the same atomic append as the row values.
It is a reconciliation key, not proof that this application caused matching external state after an
ambiguous response.

### Functional requirements

### Server-owned proposal

- Resolve the operating spreadsheet and `Lease Renewal` tab from server configuration.
- Read RentVine and the operating Sheet fresh. Associate entities before projecting individual
  fields: exact ids win; name/address-only ambiguity, duplicate rows, conflicting links, or a row
  already representing the lease refuses append.
- Resolve the current header against the recognized Renewals semantic schema. Missing, duplicate,
  murky, protected, merged, formula-backed, or unexpected targets refuse.
- Derive lease id, property id, tenant label, each nonblank field value, and each field source on the
  server. `renewal_date` is never inferred from RentVine `endDate` without an explicit approved
  mapping. Unconfirmed columns remain blank.
- Save one active proposal per canonical lease workspace by compare-and-set against the expected
  prior preview hash. Cross-actor and cross-lease access refuses.

### Confirmation and one-attempt execution

- The preview names the destination, lease/property identity, tenant label, every nonblank field and
  source, the system note, and the correction boundary. Preview performs no provider write.
- A confirmation is valid only for the exact active proposal/effect hash before its finite expiry.
- One Firestore transaction must reread and match the active lease proposal, execution record, and
  lease append-lifecycle document before changing the execution from `ready` to `running` with
  attempt count one. A missing, malformed, conflicting, or prior lifecycle refuses.
- After the claim and immediately before the provider call, reread the relevant server-owned
  association/source terms. Drift consumes no second provider attempt.
- Execute exactly one gated `appendCells` request. Read back the unique operation note, exact row
  width/content, and header identity before recording success.
- A replay of the same completed generation returns its existing receipt and performs no provider
  call. A fresh generation has a new execution identity and still must pass current no-row proof.

### Ambiguity, recovery, and evidence lifecycle

- Timeout, transport failure, malformed response, or receipt uncertainty after the claim becomes
  `ambiguous`; the UI shows `Needs reconciliation` and never shows Retry.
- Reconciliation is read-only. It scans for exactly one operation note and reports observed after,
  observed before, drift, or unavailable without claiming causality from matching data.
- A `running` or `ambiguous` append lifecycle prevents proposal replacement and discard so the exact
  recovery evidence cannot be stranded.
- A succeeded proposal may be replaced or discarded only in the same transaction that writes an
  immutable lease-scoped archive of the exact proposal/lifecycle evidence. Existing conflicting
  history fails closed. Failed or reversed legacy lifecycle state may be cleared before a new
  current proposal.
- All readers with workspace read access receive current durable effect status. Immutable completed
  history remains available to the authorized status/audit boundary without becoming another
  front-page action. Unknown/unavailable status renders as checking/unavailable, never as
  `Ready to confirm`.
- A successful append is correctable manually by an authorized Sheet operator using the bodyless
  receipt and exact Sheet destination. The app does not automate row deletion and does not claim
  rollback. A future automated reversal is a new provider-capability and activation decision.

### UI behavior

- Show the operating-Sheet control only in its owning renewal phase.
- If the lease has no exact Sheet row, an Editor sees `Prepare exact missing-row append`.
- If the lease already has a row, show a concise explanation that fixed-row updates are unavailable;
  disable or omit the preparation button and do not offer a confirmation flow.
- Admin execution is cancel-first and exact-confirmed. Non-Admins see the S83 request-access link.
- Show loading, expired, declined-without-change, running, ambiguous, success/receipt, unavailable,
  and archive/discard states distinctly.
- After success, invalidate the local live-lease cache and enforce the cross-instance post-write
  freshness barrier before displaying renewed source truth.

### Error and edge-state rules

- Missing configuration, managed identity, key, write switch, source, header, association, access,
  or confirmation disables only this exact action and leaves the rest of the lease workspace usable.
- Duplicate or conflicting RentVine links within one Sheet row are ambiguous, not first-link wins.
- Two same-name candidate leases remain ambiguous even when only one contains the field being
  projected.
- Provider response loss never creates a second append attempt.
- Reconciliation finding no row is not proof that no append occurred unless the one-attempt record
  remains parked for explicit recovery; the system does not blindly reset it.
- No customer values, provider bodies, credentials, tokens, or browser-profile paths enter logs,
  receipts, assurance artifacts, Git, or documentation.

**In scope / out of scope.**

In scope: normal server-derived row append; lease-scoped proposal/claim/lifecycle; current-source
revalidation; exact note/content readback; honest ambiguity; immutable succeeded evidence archive;
typed capability refusal; proof mutation retirement; cache freshness; role/access handoff; and
focused/release assurance.

Out of scope: normal field update; automated Sheet row delete or cell restore; arbitrary
tabs/columns/ranges; formulas/formatting; bulk effects; autonomous/model-triggered writes; proof-row
recreation; copy-only rehearsal; generic Sheet writeback; Sheet-derived RentVine changes; treating a
Sheet receipt as renewal completion; Dotloop; or LeadSimple.

**Open questions & assumptions.**

No product decision remains open. Append remains executable because the new row and its identity are
created together in one atomic request and the app enforces one lease-scoped attempt. Fixed-row
mutations are unavailable because the current provider seam cannot atomically bind the logical lease
row across collaborator movement; this is a verified capability limit, not an invitation to infer an
implementation. Historical proof and open-key state remain truth but do not establish current provider
capability. Manual Sheet correction is the supported correction path for a normal append, and no new
live proof is required or authorized for this fail-closed correction.

**Cross-product impacts.**

Canonical renewal desk/workspace and source association; S83 role/access handoff; S85/S86 action,
confirmation, feedback, and recovery presentation; Action Registry descriptions and capability
projection; Google Sheets and RentVine reads; Firestore proposal, execution, lifecycle, receipt, and
archive records; live-lease cache freshness; S91/S87 read-only projections; Admin connection status;
runtime suspension; release assurance; and current integration, environment, status, and facts
documentation.

**Authority and evidence map.**

| Input                                                                 | Classification                   | Use and limitation                                                                                                                                                            |
| --------------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`, current code/tests, live readback, and `docs/facts.md`   | Authority / implementation truth | Establish the exact open-key state, enabled switch, completed proof, missing-row append boundary, and current unreleased fixed-row refusal.                                   |
| Owner decisions and completed 2026-09-02 proof receipts               | Product/effect authority         | Authorize the already proven exact actions and preserve historical evidence; they do not prove a currently safe fixed-row mutation seam or authorize a proof rerun.           |
| Official Google Sheets API contract and current integration behavior  | Provider contract                | Establish atomic application of one `batchUpdate` request and the lack of a reviewed stable logical-row compare-and-set/idempotency/tombstone contract across separate reads. |
| Fresh RentVine/Sheet association, header, and server-derived proposal | Runtime authority                | Supplies the one exact missing-row append target and values. Missing, stale, duplicate, conflicting, or ambiguous evidence refuses only that action.                          |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S98-1** — One signed actor/lease context and fresh server join owns every proposal term.
- **ARCH-S98-2** — Normal append writes row values and the unique note in one atomic provider request;
  no browser-selected target or mode reaches the writer.
- **ARCH-S98-3** — Proposal, execution, and lease lifecycle are transactionally bound before one
  provider attempt; generation participates in execution identity.
- **ARCH-S98-4** — Ambiguous recovery is read-only and causal claims never exceed observed state.
- **ARCH-S98-5** — Running/ambiguous generations remain locked; succeeded generations are archived
  immutably before active-slot replacement/discard.
- **ARCH-S98-6** — Normal field update and every fixed-row delete/restore fail before writer
  construction until a separately reviewed provider-owned logical-row + expected-generation +
  idempotency/status + tombstone seam exists.
- **ARCH-S98-7** — The completed sealed proof cannot cause another app or provider mutation. Its
  historical receipts remain parseable without recreating the proof row.
- **ARCH-S98-8** — The two exact keys and switch may remain open for historical/current authority,
  but route/service capability checks are conjunctive and cannot be bypassed by that open state.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S98-1** — A missing-row lease offers one server-derived append; an existing-row lease offers
  no fixed-row write.
- **BEH-S98-2** — Confirmation performs at most one append call and returns either exact readback,
  duplicate receipt, definite refusal, or honest ambiguity.
- **BEH-S98-3** — Source/header/identity/generation/actor drift refuses without redirecting or
  widening the effect.
- **BEH-S98-4** — Unknown durable status never defaults to actionable readiness.
- **BEH-S98-5** — Replacement/discard cannot strand in-flight recovery; completed evidence remains
  in immutable lease-scoped history for authorized audit.
- **BEH-S98-6** — Field-update and reversal UI/API/CLI paths state that provider capability is
  unavailable and perform no Sheets mutation.
- **BEH-S98-7** — The proof runner cannot rerun a provider mutation; the historical proof row stays
  absent.

**Adversarial acceptance checks.**

- **AC-S98-1** — Route/service/provider-spy tests prove client JSON cannot choose ids, row, tenant,
  values, sources, field, range, note, spreadsheet/tab, or proof mode.
- **AC-S98-2** — Append tests cover exact header/content/note, one call, replay, response loss,
  ambiguous reconciliation, duplicate note, header/source drift, and cache freshness.
- **AC-S98-3** — Firestore tests cover concurrent claim, cross-lease access, replacement/discard CAS,
  running/ambiguous lock, failed reset, succeeded immutable archive, conflicting archive, and
  generation-bound re-proposal.
- **AC-S98-4** — Asymmetric same-name and conflicting-link fixtures prove association ambiguity is
  entity-level and fail-closed before proposal or provider work.
- **AC-S98-5** — Field-update, reverse-preview/execute, and legacy proof mutation fixtures return the
  exact typed refusal and prove the writer/provider spy has zero calls.
- **AC-S98-6** — Reversal-token fixtures prove a token is HMAC-bound to the exact current succeeded
  forward receipt, proposal/effect, reversal id/kind/row, and finite expiry even though execution is
  currently unavailable.
- **AC-S98-7** — Server render and client refresh tests cover bodyless durable status for Editor,
  Approver, and Admin; missing/failed status is never labeled ready.
- **AC-S98-8** — Static inventory proves the proof runner cannot mutate, no copy-only path or broad
  key is executable, Registry count remains 48/16, and protected authority is unchanged.
- **AC-S98-9** — Focused tests, Firestore emulator suite, lint, typecheck, canonical verifier, core
  E2E, exact-SHA CI, zero-traffic candidate, managed Admin/Editor canaries, source reconciliation,
  promotion observation, and configuration/version readback all pass before this remediation is
  called deployed.

**Forbidden actions / hard gates.**

No caller-selected spreadsheet, tab, row, range, field, value, source, lease, property, tenant,
operation id, or proof mode; no field update, fixed-row delete/restore, proof-row recreation, copy-only
rehearsal, generic/bulk/autonomous/model-triggered write, blind retry, or causal claim from matching
state; no bypass from an open key or runtime switch; no writer construction after a typed capability
refusal; no source write as renewal-completion evidence; no guessed mapping or value; no personal
identity; and no credential, customer value, provider body, or browser-profile path in Git, logs, or
assurance artifacts.

**Requirement-to-outcome traceability.**

| Outcome                       | Architecture                  | Behavior                    | Deterministic falsification                                                                  |
| ----------------------------- | ----------------------------- | --------------------------- | -------------------------------------------------------------------------------------------- |
| Correct lease and values      | ARCH-S98-1, ARCH-S98-2        | BEH-S98-1, BEH-S98-3        | Caller injection, asymmetric names, conflicting links, stale source/header                   |
| One attempt and ambiguity     | ARCH-S98-3, ARCH-S98-4        | BEH-S98-2                   | Claim race, timeout after apply, duplicate confirmation, before/after/drift reconciliation   |
| Recoverable durable evidence  | ARCH-S98-3, ARCH-S98-5        | BEH-S98-4, BEH-S98-5        | In-flight discard/replace, succeeded archive conflict, unknown SSR/client status             |
| No unsafe fixed-row mutation  | ARCH-S98-6, ARCH-S98-8        | BEH-S98-1, BEH-S98-6        | Row movement, update/delete/restore direct route/service calls, provider-spy zero-call proof |
| Completed proof stays retired | ARCH-S98-7                    | BEH-S98-7                   | Every proof mutation command refuses before actor/provider construction                      |
| Release and live truth        | ARCH-S98-1 through ARCH-S98-8 | BEH-S98-1 through BEH-S98-7 | AC-S98-9 release matrix and exact post-promotion readback                                    |

**Preservation set.**

Preserve the operating spreadsheet/tab configuration; exact current header and source semantics;
RentVine and Sheet read behavior; one-to-one lease association; completed proof receipts and final
proof-row absence; the 48-key/16-open Registry without any `production_allowed` change; enabled
Sheet-write switch; managed identity and DWD scope; S82 workspace identity; S83 access separation;
S85/S86 interaction contracts; runtime suspension; all no-send and exact-action boundaries; bodyless
evidence; cache freshness; secrets/PII hygiene; eleven Spaces; and every unrelated provider action.

**Dependencies / sequencing.**

S98 consumes S82's current one-generation lease/Sheet association, S83 access requests, S85/S86
interaction patterns, and S97 canonical provider identity. Its correction releases with the active
S82/S97 slice through the expanded S51/S54 assurance gate. S91 and S87 may consume only its released
status/capability projection. S98 does not depend on S36, Dotloop, or LeadSimple.

**Ordered prompt sequence.**

1. Close proposal/claim/generation/source-binding races and add falsification tests.
2. Disable fixed-row and sealed-proof mutations at route/service/CLI boundaries before writer
   construction; preserve read-only receipt/status compatibility.
3. Add immutable succeeded evidence archive and in-flight lifecycle lock.
4. Align UI, Action Registry descriptions, product docs, and active status documents without
   changing key count or `production_allowed` values.
5. Run the complete verification and S51/S54 release matrix. Do not rerun a live S98 proof.
6. Update deployed facts only after exact production readback.

**Human litmus outcome.**

### Append one missing renewal row without exposing an unsafe fixed-row action

**If this is correct:** A new user on a lease with no Sheet row can review and confirm one clearly
described append. A lease with an existing row explains that the fixed-row action is unavailable
instead of offering a button that could touch the wrong row. An uncertain append stays recoverable
without Retry, and every completed proposal remains auditable.

- Model verdict: PASS | FAIL — implementation runner supplies evidence.
- Human verdict: PASS | FAIL — when no observer is present, record `NOT RUN — no human observer`.

**Standalone delivery contract.**

- **Delivered by the active remediation:** server-derived missing-row append; lease-scoped
  proposal/claim/lifecycle; one-attempt execution and exact readback; honest ambiguity and immutable
  history; typed fixed-row and retired-proof capability refusal; UI/status/access behavior; and
  deterministic preservation and release checks.
- **Consumes, but does not assume:** fresh operating-Sheet configuration, DWD access, current header,
  exact RentVine/Sheet association, server-derived values/sources, current actor authority, and the
  enabled exact append gate are runtime inputs. Missing or conflicting input refuses only the append.
- **Externally blocked effect:** fixed-row field update, delete, and restore intentionally remain
  unavailable until a separately reviewed provider-owned stable-row, expected-generation,
  idempotency/status, and tombstone seam exists. Their absence does not block safe append delivery.
- **Produces for downstream suites:** bodyless append receipt/status/history, exact capability
  availability, refreshed source projection, and stable read-only evidence for S91 and S87.

**Verification and delivery contract.**

1. Preserve focused proposal, route, provider-spy, association, header/source, one-attempt,
   ambiguity/reconciliation, immutable-history, capability-refusal, proof-retirement, UI/status, and
   cache-freshness tests on every affected change.
2. Run the full Firestore emulator suite, lint, typecheck, canonical verifier, and core E2E; audit the
   exact diff for secrets, PII, protected authority, action counts, and forbidden Sheet reachability.
3. Require exact-SHA CI, a zero-traffic candidate, managed Admin/Editor assurance, source
   reconciliation, exact promotion, full observation, and configuration/version readback before
   rewriting this status as deployed. Never rerun the completed S98 proof.
4. Report exactly one terminal state: `ALL_GATES_GREEN` only after every applicable implementation
   and release gate passes; `BUDGET_EXHAUSTED` only when an explicit execution budget is actually
   exhausted; or `BLOCKED` only when one exact unavailable runtime input or authority prevents the
   remaining in-scope gate after all independent work is complete. Fixed-row capability refusal is a
   delivered boundary, not a reason to invent a provider seam.

**Deletion/merge recommendation.**

Keep S98 as the active append and fixed-row-capability contract until durable renewal and integration
documentation preserves the same server-owned proposal, one-attempt receipt, immutable evidence,
manual-correction, and fail-closed fixed-row boundary. Git retains completed proof provenance; active
documentation must not revive the retired proof runner or represent the absent provider seam as safe.
