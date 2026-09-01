<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: source-of-truth-writeback-v1 -->

# S98 — Operating renewal Sheet append and field writeback

> Status: Specified successor to the retired copy-only approach; the operating Sheet is still read-only in production and both new exact action keys remain absent/closed until this suite passes implementation, proof, protected activation, release, and readback.

**Goal.**

Let an authorized renewal operator append a missing renewal row or update one supported checklist
field in the operating Sheet, using exact preview/confirmation, atomic expected-value checks where
available, one provider attempt, bodyless receipts, readback, and separately confirmed correction.

**Current state / intended end state.**

Current production reads the operating `Renewals` tab. The deployed writeback route can only propose
one value into an existing empty `KB Proposed — <field>` cell and intentionally refuses because the
live Google writer lacks the former provider-owned status/idempotency/tombstone abstraction. It does
not append a row or update an authoritative checklist field. The separate-copy path is retired.

The target replaces that unreachable abstraction with a Sheets-native, app-at-most-once contract:
`spreadsheets.batchUpdate`/`appendCells` for an atomic new row and note, and an exact-cell
find/replace compare-and-set for one expected-value field update. A durable app claim permits one
call only. Because Sheets has no operation-status/idempotency ledger for these requests, an uncertain
response never retries and is reconciled as observed state without claiming causality.

**Actors and entry conditions.**

- A Renewals-space Editor or higher may prepare a row/field proposal.
- Execution requires a managed authenticated Admin with Renewals Space access, the exact operation
  key, the write runtime switch, current Sheets DWD write scope, no runtime suspension, a fresh exact
  header/row/grid snapshot, and an unexpired preview confirmation. S83 owns missing-access requests.
- The one-time proof uses the owner-designated real lease/property input outside Git. The row contains
  only fresh real source values, is visibly and machine-marked as the temporary writeback proof, is
  excluded from all downstream renewal projections, and is deleted after exact readback. No fake
  identity or invented customer value is used.

**What it is / how it functions.**

S98 adds two exact keys and retires the broad, unreachable
`google_sheets.renewal_checklist.writeback` key as a non-executable compatibility identifier:

| Exact key                                      | Supported operation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `google_sheets.renewal_checklist.row_append`   | Append one row after the current logical `Renewals` table, using the freshly resolved header width. It requires server-resolved provider lease/property ids and a nonblank source-backed `tenant_name`; uses the server-generated opaque operation id in the note as the stable Sheet row key; and writes the normal system note on the resolved `tenant_name` cell: `PMI KC writeback — operation <opaque id> — lease <provider id> — property <provider id>`. The same capability owns only the separately confirmed receipt-bound reversal of that exact unchanged app-appended row through one `spreadsheets.batchUpdate` `deleteDimension` ROW request. The sealed proof mode uses the `TEST — ` prefix below. |
| `google_sheets.renewal_checklist.field_update` | Replace one supported cell only when the exact anchored row, header, current value, and preview still match. A correction restores the exact receipted prior value under a new confirmation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

The recognized field allowlist is the current `Renewals` semantic schema:

`owner_pricing_confirmed`, `renewal_letter_sent`, `tenant_name`, `renewal_date`, `current_rent`,
`market_value`, `renewal_completed`, `tenant_responded`, `info_form_sent`, `form_returned`,
`lease_docs_sent`, `rhino_renewed`, `pet_registered`, `esign_complete`,
`additional_insured_verified`, `recurring_charge_added`, `added_to_inspection_sheet`,
`air_filter_setup`, and `utility_proof`.

Each nonblank appended or updated value names its exact source in the preview. `renewal_date` is never
silently equated to RentVine `endDate`; it is populated only from an existing approved Sheet value or
an explicit human-confirmed value/source mapping. Murky/missing/duplicate headers, protected or merged
targets, formulas, unexpected validation, ambiguous row identity, and type mismatch refuse.

A normal append uses the non-Test note on the resolved `tenant_name` cell, becomes visible to
downstream readers after exact readback, and is not scheduled for deletion. Its durable identity is
the provider lease id plus the server-generated opaque operation id persisted in the note and
receipt; the provider-returned range is only a readback hint, and name/address-only identity is rejected.
The browser cannot select a proof mode, either note, provider ids, or the row key.

The separately sealed one-time proof appends the fresh real tenant label only when its exact mapping
passes and leaves `current_rent`, `renewal_date`, `renewal_completed`, and every other unconfirmed
field blank. The resolved `tenant_name` cell receives the exact note
`TEST — PMI KC writeback proof — operation <opaque id> — lease <provider id> — property <provider id>`.
Before the proof, downstream readers are changed to ignore only rows with that exact prefix. Under a
separate preview and confirmation, `field_update` then changes the proof row's blank `current_rent`
cell to the fresh source-backed base rent and reads it back. The proof row is finally deleted under a
separate reversal confirmation under `row_append` only if its receipt, values, note, sheet id, tab,
stable row key, current row index, and current row hash remain exact. The server issues one exact
`deleteDimension` ROW request for that row and final readback proves both the stable key and exact note
prefix absent. No generic row delete exists. Thus both keys are proven without hiding or deleting a
normal product row.

**In scope / out of scope.**

In scope: operating row append; exact supported field update; typed source proposal; stable lease/
property note; test-row isolation and deletion; application claim/receipt/reconciliation; separate
correction; DWD/write flag/key activation; removal of rehearsal configuration/route/UI/script/tests;
and downstream read/cache invalidation.

Out of scope: arbitrary tabs/columns/ranges; credential or excluded tabs; formulas; formatting
redesign; bulk rows/cells; silently adding columns; Sheet-derived RentVine changes; writes from Ask;
autonomous execution; retaining the proof row; or treating a Sheet write as renewal completion.

**Open questions & assumptions.**

No product decision remains open. The exact proof row values are generated from fresh provider and
Sheet schema reads at execution and stay outside Git/logs. If a required header/source/managed actor
is unavailable, the proof is blocked without choosing a substitute or weakening validation.

**Cross-product impacts.**

Operating Sheet connector and DWD scope; Action Registry; renewal header/row normalization;
reconciliation approvals/dispositions; S82 workspace/action links; S86 feedback/recovery; S97 source
identity; S91 read-only assistant projection; Admin connections; runtime suspension; cache
invalidation; S87 surface manifest; environment/deployment/client documentation.

**Authority and evidence map.**

| Input                                                                                | Classification                   | Use and limitation                                                                                                                                                           |
| ------------------------------------------------------------------------------------ | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Router, current writer/service/tests, live schema readback, and `docs/facts.md`      | Authority / implementation truth | Establish current read-only state, header ambiguity rules, operating id, DWD identity, and missing current row-append/general-CAS capability.                                |
| Owner decisions of 2026-08-31                                                        | Product/effect authority         | Retire the copy-only path; authorize operating-Sheet writes and one temporary real-data proof row, protected activation, and cloud mutation; no generic workbook permission. |
| Official Google Sheets `batchUpdate`, `appendCells`, values, and grid-data contracts | Provider contract                | Establish atomic subrequest application, appended row data/notes, exact-cell find/replace, readback, and row deletion. No provider idempotency/status behavior is inferred.  |
| Fresh exact header/grid/source data and human confirmation                           | Runtime authority                | Supplies column positions, row identity, expected/current/after values, types, and source evidence. Missing or drifting input refuses the exact operation.                   |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S98-1** — Separate strict row-append and field-update schemas bind actor, role/Space,
  spreadsheet/tab, lease/property, header/schema hash, row anchor when applicable, expected/after
  value hashes, source/version, server-owned normal-versus-proof mode, operation note marker, preview
  expiry, reversal data, and one attempt. Only the secure one-time proof packet can derive proof mode.
- **ARCH-S98-2** — Row append uses one atomic batch to append exact `RowData` and the mode-correct
  system note on `tenant_name` and persists the opaque operation id as the stable row key. Field update uses one exact
  grid-scoped expected-value replacement. Only `row_append` can construct a receipt-bound reversal,
  and it emits one `deleteDimension` ROW subrequest after exact unchanged-row revalidation. Neither
  action accepts a caller-supplied method, range, row index, header position, spreadsheet id, or
  arbitrary field; no general delete seam exists.
- **ARCH-S98-3** — A durable claim occurs before the single Sheets call. Duplicate confirmation
  returns its durable state. Timeout/5xx/invalid response/receipt uncertainty becomes `ambiguous` and
  cannot issue another provider request.
- **ARCH-S98-4** — Reconciliation searches the exact opaque note/row identity or re-anchors the exact
  cell and reports `observed_after`, `observed_before`, `drift`, or `unavailable`. Matching data is
  corroboration, never proof that this call caused it.
- **ARCH-S98-5** — Rehearsal-copy config, API, panel, CLI, environment variable, focused tests, and
  active copy-only documentation are removed. The operating id remains server-owned; no copy fallback is
  accepted.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S98-1** — The workspace offers `Add Sheet row` only when no exact row exists, and `Update in
Sheet` only for one changed supported field on one exact row. Preview shows tab, stable row/lease,
  field, source, expected and proposed value, proof/test marker when applicable, and correction rule.
- **BEH-S98-2** — One confirmed append/update performs at most one provider call, reads back the exact
  note/row or cell, records a bodyless receipt, invalidates the live renewal cache, and updates the
  source-write evidence without completing unrelated process steps. A normal appended row is
  immediately eligible for ordinary projections; only the exact proof-note prefix is excluded.
- **BEH-S98-3** — Duplicate, stale, moved, edited, protected, merged, formula, murky-header,
  type-mismatch, wrong actor/account/sheet, disabled flag/key, or expired confirmation refuses before
  the write call.
- **BEH-S98-4** — Uncertain results show `Needs reconciliation` and no Retry. A separately confirmed
  correction restores one exact unchanged receipted cell, or deletes one exact unchanged app-appended
  row; collaborator drift disables correction and shows manual recovery.
- **BEH-S98-5** — The proof uses three serial windows with the write flag enabled only for the active
  window: `row_append` alone appends/reads/isolates the authorized temporary real-data row and is then
  closed/read back; `field_update` alone performs and reads back the separately confirmed blank-to-
  source-backed `current_rent` update and is then closed/read back; `row_append` alone is reopened for
  its separately confirmed receipt-bound exact-row deletion, absence proof, and mandatory close/readback.
  The proof row never survives completion, and neither key inherits the other's evidence.

**Human litmus outcome.**

### Add or update the exact renewal Sheet fact

**If this was built correctly:** An authorized user sees the current Sheet value, the proposed value
and source, confirms one clearly named change, and receives a verified result or an honest recovery
state. A missing row can be added without opening the Sheet manually. No other row or cell changes.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why; when no human observer is present, use `Human verdict: NOT RUN — no human observer`.

**Requirement-to-outcome traceability.**

| Requirement                          | Architecture outcome                                                 | Behavior outcome         | Human litmus                                        | Deterministic evidence / falsification                                                                                      |
| ------------------------------------ | -------------------------------------------------------------------- | ------------------------ | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Exact append and update contracts    | `ARCH-S98-1`, `ARCH-S98-2`                                           | `BEH-S98-1`, `BEH-S98-3` | Only one intended row/cell is offered               | Header/grid/schema/provider-spy tables reject arbitrary, murky, protected, formula, merged, stale, and multi-target inputs. |
| At-most-once and honest ambiguity    | `ARCH-S98-3`, `ARCH-S98-4`                                           | `BEH-S98-2`, `BEH-S98-4` | Success/recovery never invites a blind retry        | Claim races, response loss, delayed effect, duplicate confirmation, note search, and drift fixtures prove behavior.         |
| Reversible real-data operating proof | `ARCH-S98-1`, `ARCH-S98-2`, `ARCH-S98-3`, `ARCH-S98-4`, `ARCH-S98-5` | `BEH-S98-5`              | Temporary row appears, is isolated, then disappears | Exact row/note/value/readback/deletion/final-absence and downstream-query evidence; no customer values enter artifacts.     |
| Retire rehearsal-copy product path   | `ARCH-S98-5`                                                         | `BEH-S98-1`, `BEH-S98-5` | No rehearsal control remains                        | Complete-tree route/component/config/script/test/docs inventory and environment-preservation checks.                        |

**Preservation set.**

All read-only Sheet/RentVine joins and header ambiguity rules; excluded tabs; current renewal desk,
workspace, process, access, Gmail, RentCast, and discrepancy behavior; eleven Spaces; managed
identity; action/runtime suspensions; no-send rules; secrets/PII hygiene; and every unrelated action
key. S97 receipts and S98 receipts remain distinct.

**Adversarial acceptance checks.**

- **AC-S98-1** — Static/schema/provider-spy tests prove the two exact actions cannot target another
  sheet/tab/range/field or perform more than one row/cell mutation; only an unchanged `row_append`
  receipt can construct the exact one-row `deleteDimension` reversal.
- **AC-S98-2** — Atomic append-note and exact-value CAS tests cover normal/proof note separation,
  proof-mode caller refusal, normal-row projection, collaborators, row movement, duplicate
  confirmation, timeout, response loss, receipt loss, and observed-state reconciliation.
- **AC-S98-3** — Browser/route/role/accessibility tests cover add-vs-update visibility, exact preview,
  confirmation, blocked/loading/success/ambiguous/correction states, and S83 access handoff.
- **AC-S98-4** — The operating proof proves exact temporary row creation, downstream exclusion,
  readback, deletion, final absence, and unchanged surrounding rows/formulas/validation.
- **AC-S98-5** — Protected activation diff and post-release readback prove only the two new exact keys
  and write flag became executable; the broad old key and all other keys remain closed/current.
- **AC-S98-6** — Complete-tree inventory proves copy-only config/route/UI/CLI/tests/docs are gone and no
  rehearsal id is deployed.

**Forbidden actions / hard gates.**

No write while the exact key/flag is closed; no generic/bulk range; no guessed header/row/value;
no formula/protected/merged/murky target; no overwrite without exact expected-value match; no retry
after uncertainty; no autonomous/model action; no retained proof row; no fake identity/customer
value; no values in Git/logs; no operating/copy id substitution; and no process-completion claim from
a source receipt.

**Dependencies / sequencing.**

S98 runs after S97 so its proof and normal rows use S97's canonical lease/source identity and receipt
vocabulary. It consumes S82/S83/S85/S86 UI/access contracts. S91 and S87 consume its final status and
recovery surfaces. It does not depend on Dotloop, LeadSimple, or S36.

**Standalone delivery contract.**

- **Deliverable now:** exact two-key schemas, provider methods, product proposal/route/UI,
  downstream proof-row exclusion, claims/receipts/reconciliation/correction, rehearsal retirement,
  deterministic tests, closed release, live proof, and protected activation.
- **Consumes, but does not assume:** real row values come from fresh runtime sources and confirmation;
  missing source/header/actor fails the exact effect without blocking the rest of the app.
- **Externally blocked effect:** only the live proof is blocked if the operating Sheet or managed
  Admin/DWD scope is unavailable. No substitute sheet or synthetic row is used.
- **Produces for downstream suites:** exact Sheet action keys, stable source receipt/status links,
  proof-row exclusion, and removal of copy-only surfaces.

**Verification and delivery contract.**

1. Freeze current writer/service/header/rehearsal truth and materialize fail-first append, general CAS,
   one-attempt, proof-isolation, and retirement checks.
2. Implement/release the full slice with both new keys and write flag closed; run focused tests,
   `bash scripts/verify.sh`, `npm run test:e2e:core`, secrets/PII/protected/effect/diff audits, exact-SHA
   CI, candidate smoke, promotion, and closed-state readback.
3. Resolve the secure owner-designated real lease source and generate the exact temporary row from
   fresh data. Open only `row_append` plus the write flag, append/read/isolate the Test row, then close
   and read back both key and flag. Open only `field_update` plus the flag, separately confirm and read
   back the blank-to-source-backed `current_rent` change, then close/read back both. Finally reopen only
   `row_append` plus the flag for its receipt-bound exact-row DELETE, separately confirm it, prove the
   stable key and marker absent, and close/read back both. Treat failure to prove absence or any
   closeout as an incident; no window contains both keys.
4. Apply the owner-authorized protected activation for only the two S98 keys plus the reviewed runtime
   flag, rerun the full delivery path, and read back exact revision/config/key state. Preserve a fast
   suspension/rollback path that does not delete receipts.
5. Report only `ALL_GATES_GREEN`, `BUDGET_EXHAUSTED` with an explicit budget, or `BLOCKED` after every
   independent closed-safe deliverable is green and one exact external prerequisite is unavailable.

**Ordered prompt sequence.**

1. Re-verify the operating schema, live writer limitations, action state, DWD identity/scope,
   rehearsal surfaces, and downstream row readers; freeze falsification.
2. Build closed exact append/update/reconcile/correct contracts and remove copy-only product machinery.
3. Falsify concurrency, ambiguity, row isolation, role/UI, and preservation behavior; ship/read back
   the closed candidate.
4. Execute and reverse the one temporary operating-row proof using only fresh real source data.
5. Deliver/read back the exact activation patch, reconcile current docs, and hand the final contracts
   to S91/S87.

**Deletion/merge recommendation.**

Keep S98 active until both exact actions are deployed/read back and the temporary proof row is proven
absent. Then merge its stable operation contract into the Sheet connector/product documentation and
remove the suite narrative.
