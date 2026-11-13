<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: staff-workflow-audit-2026-11-12 -->

# S278 — Prepare source updates from the working terms and work them from one list

> Status: AUTHORING READY, intake 156. Renewal amounts. Revised on November 12, 2026 to
> carry one confirmation for a lease's listed Sheet cells by owner direction.
> Implementation and verification pending.

**Goal.**

The Sheet and RentVine updates a renewal needs are prepared from the values staff already
agreed in the app and shown together in one list. A lease's pending Sheet cells are
reviewed in one exact preview and applied with one confirmation, and each cell still
gets its own claim, readback and receipt.

**Current state / intended end state.**

Verified by a read-only trace of the serving source:

- The pending Sheet "Market value" update takes a figure named `pmiNumber`
  (`lib/lease-renewal/workspace-state.ts`, lines 810 to 815). The governing rule says the
  Sheet market value takes the reviewed PMI recommended monthly rent (S118 R118.3;
  `docs/products/lease-renewal-spreadsheet-map.md`). In the current layout that figure's
  input is not rendered, it is filled from the provider's point estimate when untouched,
  and it is still saved (`components/lease-renewal/RenewalProgressControls.tsx`, lines 391
  to 417 and 1404 to 1423). The recommendation staff edit is "Rent to recommend", a
  different stored value. A lease prepared only by the monthly run saves no such figure
  and gets no Market value update.
- The RentVine "New end date", the lease fact correction and the Sheet "New value" forms
  open filled with the current source value, not the working value
  (`components/lease-renewal/RentvineUpdatesPanel.tsx`, lines 204 to 208 and 913 to 934;
  `components/lease-renewal/OperatingSheetPanel.tsx`, lines 219 to 226 and 908 to 923).
  Finish up already builds read-only previews from the working end date
  (`lib/lease-renewal/finish-up-preparation.ts`, lines 150 to 166 and 263 to 269); its
  button only opens the Rent and charges area.
- Each pending Sheet fact has its own "Prepare the Sheet update for …" button
  (`components/lease-renewal/RenewalManualWorkspace.tsx`, lines 450 to 489 and 851 to
  878). Preparing refuses while another proposal for the lease is unresolved
  (`lib/lease-renewal/workspace-sheet-sync.ts`, lines 215 to 327). A proposal holds one
  effect and "Apply Sheet update" confirms one effect with a one-attempt claim, a
  compare-and-swap write, a readback and a receipt.
- The exact action `google_sheets.renewal_checklist.field_update` updates one supported
  field of an existing server-resolved lease row after exact preview and confirmation.
  The stored proposal already allows one to ten effects
  (`lib/lease-renewal/sheet-writeback/proposal-store.ts`), and the normal path requires
  exactly one (`lib/lease-renewal/workspace-sheet-sync.ts`,
  `lib/lease-renewal/sheet-writeback/workspace-resolution.ts`).

In the November 12 rehearsal five Sheet updates were pending on one lease before
Documents, each reached separately, and the same dates were typed again in the RentVine
and Sheet forms (audit findings A-06, A-07 and A-18).

One confirmation per field followed S98 and S159 as first written. The owner's November
12, 2026 direction retires that part of the rule for the listed cells of one lease row:
one reviewed preview and one confirmation may apply them. S98, S159, the spreadsheet map
and the router are amended in place and name this suite. Arbitrary ranges, rows, formulas
and unattended writes stay unavailable.

Intended end state: Market value is prepared from the recommendation staff reviewed; a
form opened from a preview carries the previewed value; one list shows every pending
source update for the lease in order; one confirmation applies the lease's listed Sheet
cells; and each cell keeps its own exact preview line, one-attempt claim, readback and
receipt.

**Actors and entry conditions.**

Renewal staff with the existing capability for each update work the Finish up step.
Entry requires saved working terms or recorded staff facts for the lease's current cycle
and, for a write, the existing open exact key and runtime switch.

**What it is / how it functions.**

- **R-S278-1 — Take Market value from the reviewed recommendation.** The pending Sheet
  "Market value" update is prepared from the current-cycle recommendation, the value Rent
  to recommend shows, once that value is reviewed: a staff member saved or changed it, or
  a staff member confirmed the review of an owner message that states it. It carries the
  recommendation's basis. The hidden provider-filled figure no longer feeds the Sheet.
  The low and high range stay app evidence. A lease prepared by the monthly run gets its
  Market value update on the same rule. The pinned S118 check is updated with this
  change.
- **R-S278-2 — Open the form with the previewed value.** From a Finish up source preview,
  the action opens the owning form with the previewed new value filled into "New end
  date" or "New value", marked "From the working terms", and focus on that input. The
  form's own exact preview and confirmation follow unchanged, and staff can change the
  value first. Opening writes nothing and reads no paid source.
- **R-S278-3 — Show one list of pending source updates.** Finish up Work shows "Source
  updates (5 pending)" with one row per update: the field, the current source value, the
  new value and its basis. Each row has its own "Prepare and review" leading to the
  existing exact preview and the existing confirmation. After a confirmed readback the
  row shows done with the receipt time and focus moves to the next pending row. A
  conflict or refusal stays on its row with its existing recovery. While one proposal is
  open, the other rows read "Finish or discard the open update first".
- **R-S278-4 — Apply a lease's listed Sheet cells with one confirmation.** When two or
  more Sheet rows are pending, the list offers "Review all 5 Sheet updates". It prepares
  one proposal for that lease's one existing row holding at most 10 cells; with more
  pending it takes the first 10 in list order and says how many remain. One exact
  preview lists every cell: the field, its column, the value read from the Sheet now,
  the new value and its basis. "Apply 5 Sheet updates" is the one confirmation. Before
  the first write the server reads the row again and refuses the whole confirmation,
  writing nothing, when the row identity or any listed current value differs from the
  preview: "The Sheet changed since this preview: Market value. Review the updates
  again." It then applies the cells in list order, each through the existing exact field
  update under its own one-attempt claim, compare-and-swap write, readback and receipt.
- **R-S278-5 — Stop at the first cell that does not apply, and say what was written.**
  If a cell conflicts, is refused or cannot be read back, the run stops. Cells already
  written show done with their receipts, the failing cell shows its existing recovery,
  and the cells after it stay pending and unattempted. The list states the three groups
  by field name. Nothing retries on its own, and another attempt needs a fresh preview.
- **R-S278-6 — Keep every other write contract.** The combined confirmation covers
  recognized fields of one existing lease row in the operating Sheet only. A single row
  can still be reviewed and confirmed alone. Row append, the RentVine operations, the
  lease fact correction and any correction of an applied cell keep one preview and one
  confirmation each. No range, formula, header, other row or other lease is written.

**In scope / out of scope.**

In scope: the Market value source, form prefill from a preview, the pending list and the
combined confirmation for one lease row's listed Sheet cells. Out of scope: new Sheet
fields, row deletion, historical restore, writes across leases or rows, any unattended
or model-triggered write, any combined RentVine confirmation, and any change to
`lib/integrations/action-gate.ts` or to a `production_allowed` value.

**Open questions & assumptions.**

- The owner directed on November 12, 2026 that several Sheet cells may share one
  confirmation. The specifics are the author's inference and can be changed before a
  launch: at most 10 cells, one lease row, a recheck of every listed value before the
  first write, and a stop at the first cell that does not apply.
- Assumption: the exact action is evaluated once per cell exactly as today, so its
  registry entry and the gate need no change. If the build finds that a protected path
  must change, it stops and reports the exact change for the owner instead of making it.
- Assumption: "reviewed" means a staff save of the recommendation or a staff-confirmed
  owner message review that states it. An untouched suggestion saved by preparation is
  not yet reviewed.
- The rehearsal keeps Sheet writes off. Write behavior is verified with the existing
  deterministic Sheets adapter in backend tests; the rehearsal verifies previews and the
  list.

**Cross-product impacts.**

Workspace Sheet sync and its pending facts, the comparison preparation save, Finish up
previews, the RentVine updates panel, the Operating Sheet panel, the lease fact
correction, the S118 test, Help and the control map.

**Authority and evidence map.**

| Input                                                                                                                                                                                    | Classification                   | Use and limitation                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| AGENTS.md, Permanent safety boundaries and Action authority; S98, S113 F2.2, S159 and S160, as amended on November 12, 2026                                                              | Authority and active contracts   | Every cell is exact-previewed and exact-confirmed, with its own claim, receipt and readback. One confirmation may cover one lease row's listed cells. |
| Owner direction of November 12, 2026, to carry every audit proposal and retire the rules that held them                                                                                  | Owner decision                   | Authority for the combined confirmation. The limits are assumptions.                                                                                  |
| S118 R118.3 and `docs/products/lease-renewal-spreadsheet-map.md`                                                                                                                         | Active contract                  | Market value is the reviewed PMI recommended monthly rent.                                                                                            |
| `lib/lease-renewal/workspace-state.ts`, `lib/lease-renewal/workspace-sheet-sync.ts`, `lib/lease-renewal/finish-up-preparation.ts`, `lib/lease-renewal/sheet-writeback/proposal-store.ts` | Committed implementation (trace) | Present value source, one-proposal rule, previews and the stored effect bound. Re-verify before editing.                                              |
| Staff workflow audit of November 12, 2026, findings A-06, A-07 and A-18                                                                                                                  | Intent evidence only             | Observed list of pending updates; writes were not exercised in the rehearsal.                                                                         |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S278-1** — The Market value sync action reads the current-cycle recommendation
  fact and its review evidence. A test with a provider point estimate of one amount and
  an edited recommendation of another fails on the starting state, which prepares the
  point estimate.
- **ARCH-S278-2** — The pending list is a read projection over the existing pending
  facts, proposals and receipts. It creates no proposal and no write by being shown.
- **ARCH-S278-3** — One confirmation binds the ordered set of effect hashes in one
  proposal for one row. The existing execution service still applies one effect at a
  time, each with its own claim and receipt, after one recheck of the whole set. A
  backend test that confirms a three-effect proposal fails on the starting state, which
  refuses any proposal that does not hold exactly one effect.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S278-1** — With a provider point estimate of $1,480 and a staff-saved
  recommendation of $1,500, the pending Market value is $1,500.00 with its basis.
- **BEH-S278-2** — A lease prepared only by the monthly run shows no Market value update
  until its recommendation is reviewed, then shows it.
- **BEH-S278-3** — From the Finish up preview of the renewal end date, the RentVine form
  opens with the working end date filled and marked, focus on the input, and its own
  preview next.
- **BEH-S278-4** — Five pending Sheet updates take one review and one confirmation and
  leave five receipts. A conflict on the third leaves the first two written with their
  receipts, the third on its recovery and the last two pending and unattempted, and the
  list says so by field name.
- **BEH-S278-5** — A value changed in the Sheet between the preview and the confirmation
  refuses the whole confirmation with the field named, and nothing is written.

**Human litmus outcome.**

### Finish the source updates from one list

**If this was built correctly:** At Finish up a staff member sees every Sheet and
RentVine update the renewal still needs in one list, with the new values already filled
from what was agreed. They read the Sheet changes together, confirm once, and see a
receipt beside each cell without hunting for it or retyping a date.

- Model verdict: NOT RUN
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                   | Architecture outcome | Behavior outcome       | Human litmus                            | Deterministic evidence / falsification                                      |
| --------------------------------------------- | -------------------- | ---------------------- | --------------------------------------- | --------------------------------------------------------------------------- |
| R-S278-1 Market value from recommendation     | ARCH-S278-1          | BEH-S278-1, BEH-S278-2 | Finish the source updates from one list | AC-S278-1. Differing estimate and recommendation; review evidence.          |
| R-S278-2 form opens with previewed value      | ARCH-S278-2          | BEH-S278-3             | Finish the source updates from one list | AC-S278-2. Filled input equals the preview; zero writes on open.            |
| R-S278-3 one pending list                     | ARCH-S278-2          | BEH-S278-4             | Finish the source updates from one list | AC-S278-3. Rows, order, focus and per-row recovery.                         |
| R-S278-4 one confirmation for listed cells    | ARCH-S278-3          | BEH-S278-4, BEH-S278-5 | Finish the source updates from one list | AC-S278-4. One confirmation, N claims, N receipts, whole-set recheck.       |
| R-S278-5 stop and say what was written        | ARCH-S278-3          | BEH-S278-4             | Finish the source updates from one list | AC-S278-4. Injected failure at each position and the three stated groups.   |
| R-S278-6 every other write contract kept      | ARCH-S278-3          | BEH-S278-4             | Finish the source updates from one list | AC-S278-6. Single-row path, RentVine, append and correction unchanged.      |
| Safety boundary across the requirements above | ARCH-S278-1          | BEH-S278-1             | Finish the source updates from one list | AC-S278-5. No send, write or lookup happens outside the staff action shown. |

**Preservation set.**

- `tests/unit/s160-operating-sheet-panel.test.tsx`: one exact preview and one "Apply
  Sheet update" for a single field stay available.
- The S98, S159 and S184 execution tests: claim, compare-and-swap, readback and receipt
  per cell. The cases that refuse a proposal for holding more than one effect are
  rewritten on purpose for R-S278-4, with the new bound of one row and ten cells.
- `tests/unit/s249-finish-up-previews.test.tsx`: previews stay read only.
- `tests/unit/s118-workspace-market-value.test.ts`: updated for R-S278-1; the range still
  stays app evidence.

**Adversarial acceptance checks.**

- **AC-S278-1** — Falsify ARCH-S278-1, BEH-S278-1 and BEH-S278-2. Vary the point estimate
  and the recommendation independently. The pending value always equals the reviewed
  recommendation. An untouched prepared suggestion produces no pending update until a
  review exists.
- **AC-S278-2** — Falsify BEH-S278-3. Open each form from its preview: the input equals
  the previewed value and is marked. Opening makes zero provider calls and zero writes.
  Changing the value before preview previews the changed value.
- **AC-S278-3** — Falsify ARCH-S278-2 and BEH-S278-4 with the deterministic Sheets
  adapter. The list shows every pending fact once. Confirming one moves focus to the
  next. Inject a conflict on one row: the others keep their state and the row keeps its
  recovery.
- **AC-S278-4** — Falsify ARCH-S278-3, BEH-S278-4, BEH-S278-5 and R-S278-5 with the
  deterministic Sheets adapter. Five cells: one confirmation, five claims, five writes
  and five receipts, each write carrying one field. Change one listed value after the
  preview: zero writes and the field named. Inject a conflict, a refusal and a failed
  readback at the first, a middle and the last position: the cells before it hold
  receipts, the cells after it are unattempted, and the list names each group. Confirm
  twice quickly: one run. Eleven pending cells: the proposal holds ten and the list says
  one remains. Cells from two leases or two rows in one request are refused.
- **AC-S278-5** — Safety. With the Sheet switch off, every row previews and no row
  writes. No `production_allowed` value, gate or rule file changes. No cell outside the
  confirmed preview is written.
- **AC-S278-6** — Falsify R-S278-6. A single row still previews and applies alone. Row
  append, each RentVine operation, the lease fact correction and a correction of an
  applied cell each still take their own preview and confirmation.

**Forbidden actions / hard gates.**

No write to a cell the confirmed preview did not list. No range, formula, header, other
row or other lease. No more than ten cells in one confirmation. No write after a failed
recheck. No blind retry. No unattended or model-triggered write. No change to
`lib/integrations/action-gate.ts`, to any `production_allowed` value or to the runtime
Sheet switch. No production test record.

**Dependencies / sequencing.**

Standalone on S98, S159, S160 and S249 as delivered and as amended on November 12, 2026.
S277 labels the recommendation this suite reads. S285 supplies the working dates the
previews carry. S284 qualifies the batch.

**Standalone delivery contract.**

- **Deliverable now:** The Market value source, the prefilled forms, the pending list and
  the combined confirmation, with tests and Help rows, reaching `ALL_GATES_GREEN`.
- **Consumes, but does not assume:** The runtime Sheet switch. Off, the list previews
  only.
- **Externally blocked effect:** None. A protected path change, if the build finds one
  is needed, is reported to the owner and not made.
- **Produces for downstream suites:** A pending-updates projection the Dashboard list in
  S280 may link to.

**Verification and delivery contract.**

1. Before editing, prove BEH-S278-1, BEH-S278-3 and BEH-S278-4 fail on the starting
   state and record the preservation baseline separately.
2. Run focused unit and backend checks for every ARCH, BEH and AC row.
3. For an authorized candidate run `bash scripts/verify.sh` and `npm run test:e2e:core`,
   complete the scoped S284 qualification and follow the current release gates.
4. Report `ALL_GATES_GREEN` only for completed verification, `BUDGET_EXHAUSTED` only under
   an explicit budget, and `BLOCKED` only for an exact unavailable input or authority.

**Ordered prompt sequence.**

1. Re-verify the Market value source, the form defaults and the one-proposal rule.
2. Materialize the failing checks and the preservation baseline.
3. Change the Market value source, then the prefill, then the list, then the combined
   confirmation with its recheck and its stop rule.
4. Falsify, run focused and canonical checks, update Help and current docs.

**Deletion/merge recommendation.**

Keep active until the value source, the prefill, the list and the combined confirmation
are represented by verified code, tests and current facts.
