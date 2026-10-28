<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-novdec-2026-10-28 -->

# S237 — RentVine and Sheet updates with a visible terms basis and reconciled outcomes

> Status: IN PROGRESS (merged to main at bf0c03f9 by PR #158, not served) — R-S237-3 (plain RentVine outcome text) and R-S237-4 (the Sheet still-before result) are implemented with tests; R-S237-2 is amended to bind only the Working-value path, keeping the panel's direct correction; R-S237-1, R-S237-5, R-S237-6 and R-S237-7 remain. Originally finalized 2026-10-28 from the November/December renewal Clarify Features initialization (intake 104). Live RentVine/Sheet effects on a real lease stay ordinary staff work under the existing open exact keys; this file authorizes none. The ambiguous-attempt archive change stays an explicitly deferred owner decision.

**Goal.**

When staff prepare the RentVine and operating Sheet changes for a renewal, each preview shows the
exact fields, old/new/effective values and the terms basis they follow from. After each confirmed
effect the page shows what the provider read back, what still differs and the named recovery step,
in plain language. Nothing claims that an app save, or a pair of systems, is synchronized.

**Current state / intended end state.**

Inspected at `a1c0fe8c` (source read, not a production observation):

- Exact keys and payloads exist and stay unchanged: `rentvine.lease.renewal_dates.update`
  (`endDate`, `increaseEligibilityDate`; `startDate` copied from a fresh read),
  `rentvine.lease.recurring_charge.update` and `rentvine.lease.recurring_charge.create`
  (`accountID`, `amount` as a `0.00` string, `description`, `dayDue` 1–31, `frequency` 1–24,
  `startDate`/`endDate` MM/DD/YYYY), defined in `lib/lease-renewal/writeback/proposal-contract.ts`
  and `lib/integrations/rentvine/write-client.ts`. Effects run dates, then updates, then creates; no
  cross-effect atomicity is claimed.
- Each effect has its own exact confirmation, fresh before-state check, durable one-attempt claim
  (`lib/firestore/s97-renewal-writeback-claim.ts`), receipt and provider readback
  (`lib/lease-renewal/writeback/execution-service.ts`). Timeouts, 5xx and unreadable answers end
  `ambiguous` without retry. A matching charge after a lost create response is only correlation and
  never mints a receipt or reversal authority. Sheet append/field updates use
  `google_sheets.renewal_checklist.row_append` / `.field_update` with row note/anchor binding,
  protected identity/formula fields and the reviewed runtime switch.
- Future rent never overwrites today's contractual base: `lib/lease-renewal/writeback/future-rent-intent.ts`
  requires a future effective date and one non-overlapping schedule effect;
  `lib/lease-renewal/writeback/current-base-readback.ts` compares against the refreshed lease-detail
  `baseRentAmount` (`lib/integrations/rentvine/lease-mapper.ts`).
- Proposals come from Working values or typed values; owner approval, tenant acceptance and
  signatures are deliberately not prerequisites (`lib/lease-renewal/effective-terms.ts`; owner
  decision D-RENEWAL-STAFF-OPERATIONS in `docs/facts.md`). The preview does not show whether the
  recorded owner approval still covers the terms or whether an executed document exists.
- Displayed states: "Ready to confirm", "Awaiting a durable outcome", "Applied with receipt",
  "Needs reconciliation", "Declined by the provider" (Sheet: "Declined without change"),
  "Checking durable status"; outcome rows in `lib/lease-renewal/rent-charge-outcomes.ts`. The UI
  never labels an app save synchronized.
- Defects found by inspection: RentVine refusals surface raw codes such as
  `reconcile_not_proven` in "S97 renewal-writeback operation refused (…)" while the Sheet route has
  plain messages; the Sheet `reconcile_not_proven` message says the Sheet shows the proposed value
  although the same code is raised when the Sheet still shows the earlier value; the RentVine
  current-base amount arrives from the browser and is not bound server-side to the saved Working
  current rent (the Sheet claim binds its working value); after a Sheet update the page only
  reloads and lists no remaining difference; scope statements (what stays manual or unsupported)
  are scattered rather than stated once beside the updates.
- An ambiguous RentVine create or Sheet field update cannot settle in the app and locks that lease's
  proposal until a runner readback and manual clear (the existing "Uncertain Sheet field update"
  owner decision candidate in `docs/open-blockers.md`).

Intended: the same exact effects, plus a read-only terms basis in every preview, server-bound
current-base amounts, plain outcome text with a named next step for every refusal and ambiguity, a
post-readback list of remaining differences per source, one scope statement, and an honest locked
state for ambiguous attempts.

**Actors and entry conditions.**

Renewal staff with Editor or higher capability (`execute_source_write` is `edit`; Editors confirm
their own exact previews) on a lease in a Renewals-enabled Space, with RentVine/Sheet reads
available. The responsible financial approver for a real change is a client fact recorded per case
(C03/C13 in `docs/open-blockers.md`), not inferred from a title. Entry is blocked only for the
exact effect whose source read, target, value, runtime switch or key fails its existing check.

**What it is / how it functions.**

- **R-S237-1 — Terms basis in every preview.** Beside each RentVine or Sheet preview row, show the
  basis: the Working terms revision and saved time, the owner-approval coverage for exactly those
  fields as computed by `lib/lease-documents/owner-approval-binding.ts` (covered, no longer covers
  with its stale reason, or no recorded approval), and the executed-document status for the same
  lease cycle from S236 (or "Not recorded"). The basis is informational: it never becomes a
  prerequisite, never changes the effect, its hash or admission, and is recomputed whenever the
  preview is shown.
- **R-S237-2 — Server-bound current-base amount.** A `current_base` RentVine amount prepared from the
  Working value (an empty source note, stored as "Staff working value") is accepted only when it
  equals the saved Working current rent read on the server at preparation, and the claim re-checks
  it inside its transaction, mirroring the Sheet claim. A change after preview refuses with a plain
  "the working value changed; prepare a fresh preview" outcome and sends nothing new. The RentVine
  panel's direct "Correct current base-rent billing" entry, which carries its own staff evidence
  note, stays a deliberate staff path (amended 2026-10-28).
- **R-S237-3 — Plain outcome text for every RentVine code.** Every RentVine service refusal,
  decline, ambiguity and reconciliation result has one plain message naming what happened, what was
  not sent again and the next safe step, at parity with the Sheet route's message catalog. No raw
  code reaches the page.
- **R-S237-4 — Accurate Sheet reconciliation wording.** Reconciliation distinguishes "the Sheet still
  shows the earlier value" from "the Sheet shows the proposed value but this attempt cannot prove it
  wrote it" and from drift. Both stay uncertain and send nothing.
- **R-S237-5 — Remaining differences after readback.** After any confirmed effect, and on reload,
  list each tracked field — lease end date, increase-eligibility date, rent charge amount and
  schedule, and each recognized Sheet field touched by this renewal — with the Working or approved
  value, the latest provider/Sheet readback value and its read time, and whether they match. Partial
  success across effects is shown per effect, with the completed effects kept as recorded.
- **R-S237-6 — One scope statement.** State once, beside the updates, what the confirmed updates
  change (dates and recurring charges in RentVine; the recognized Sheet fields), what stays manual
  (one-time fees, deposits, ledger history, party changes, insurance enrollment, Sheet reversal) and
  what is unsupported (a general RentVine base-rent setter, cross-system atomic sync, Sheet row
  deletion).
- **R-S237-7 — Honest locked state for ambiguity.** A lease with an ambiguous effect shows the exact
  effect, that new proposals for that source are locked, that nothing is retried, and the named
  recovery route (engineering readback and manual clear from its receipt) until the owner decides
  the deferred archive question. No retry or archive control appears.

**In scope / out of scope.**

In scope: preview basis projection, server-side current-base binding, RentVine message catalog,
Sheet reconciliation wording, post-readback difference list, scope statement, ambiguous-state
display, and their tests. Out of scope: making approval or signatures a prerequisite (that would
reverse D-RENEWAL-STAFF-OPERATIONS and needs a new owner decision), any new action key or payload
field, generic or bulk writes, automatic retry, receipt-free reversal, Sheet reversal or row
deletion, a staff archive action for ambiguous attempts (deferred), registry or protected-path
changes.

**Open questions & assumptions.**

- Deferred owner decision (not part of this finalized scope): whether staff may archive an
  ambiguous Sheet field generation or RentVine create so the lease can accept a new proposal. The
  recommendation already recorded in `docs/open-blockers.md` is to allow archiving because the
  per-target claim still refuses a second write to the same target; until decided, R-S237-7 applies.
- Assumption (labeled): the executed-document status comes from S236's evidence record; when S236 is
  not delivered the basis reads "Not recorded" rather than guessing.
- No client value is needed to build this suite. Real effective dates, amounts, charge accounts and
  the financial approver are per-case runtime inputs (C06, C13).

**Cross-product impacts.**

`app/api/lease-renewal/rentvine-writeback/route.ts`, `app/api/lease-renewal/operating-sheet/route.ts`,
`lib/lease-renewal/writeback/execution-service.ts`, `lib/lease-renewal/sheet-writeback/execution-service.ts`,
`lib/lease-renewal/source-update-preview.ts`, `lib/lease-renewal/rent-charge-intent.ts`,
`lib/lease-renewal/rent-charge-outcomes.ts`, `components/lease-renewal/RentvineUpdatesPanel.tsx`,
`components/lease-renewal/OperatingSheetPanel.tsx`, `components/lease-renewal/RenewalCurrentRent.tsx`,
`components/lease-renewal/RenewalFutureRent.tsx`, `components/lease-renewal/RentAndCharges.tsx`, the
operator guide and this suite. Firestore claims keep their schemas except the added Working-revision
binding for `current_base`. Action Registry, runtime switch, Production/Live and protected paths are
unchanged.

**Authority and evidence map.**

| Input                                                                    | Classification                 | Use and limitation                                                                                                    |
| ------------------------------------------------------------------------ | ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md` live-write policy, D-RENEWAL-STAFF-OPERATIONS, open keys     | Authority                      | Exact preview/confirmation/claim/receipt/readback; no approval prerequisite; keys unchanged.                          |
| Committed code/tests at `a1c0fe8c`                                       | Implementation truth           | Present effects, states, defects listed above. Not a production observation.                                          |
| 2026-10-28 Clarify Features initialization and roadmap (Obsidian inbox)  | Intent evidence                | Requires visible before/after/basis, truthful partial/ambiguous outcomes and a synchronized/manual/unsupported split. |
| Real executed terms, charge accounts, financial approver for a real case | External dependency (C06, C13) | Hold only the real effect; engineering uses deterministic fixtures and never writes a live lease for proof.           |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S237-1** — One read-only terms-basis projection composed from the Working record revision,
  the owner-approval binding state and the S236 executed-document status is attached to both preview
  builders; it has no write path and is excluded from effect hashes and admission. Fail-first: the
  starting previews carry no basis.
- **ARCH-S237-2** — The RentVine `current_base` amount is bound to the server-read Working current
  rent revision at preparation and re-checked inside the claim transaction. Fail-first: a request
  whose body amount differs from the saved Working value is accepted at the start.
- **ARCH-S237-3** — Every RentVine service code maps through one message catalog, and Sheet
  reconciliation exposes whether the observed state is before, after or drift so its message is
  state-accurate. Fail-first: raw codes reach the RentVine response and the Sheet "before" case uses
  the "shows the proposed value" text.
- **ARCH-S237-4** — A post-readback difference projection compares Working/approved values with the
  latest RentVine and Sheet readbacks for the tracked fields, keyed by lease and cycle. Fail-first:
  no projection exists after a Sheet update.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S237-1** — A preview prepared after the owner's approved terms changed shows that the
  approval no longer covers these terms, and the update remains preparable and confirmable.
- **BEH-S237-2** — Changing the Working current rent after a current-base preview makes confirmation
  refuse with the plain message and no provider call.
- **BEH-S237-3** — Each RentVine refusal, decline, timeout and reconciliation shows plain text and a
  next step; a Sheet reconciliation that still reads the earlier value says so.
- **BEH-S237-4** — After a dates success and a charge failure, the page shows the dates as applied,
  the charge as not applied and the remaining difference list for both sources.
- **BEH-S237-5** — An ambiguous effect shows the locked state, no retry or archive control, and the
  engineering recovery route.

**Human litmus outcome.**

### Staff see why each update follows and what still differs

**If this was built correctly:** Before confirming, a staff member sees each field's current value,
the new value, when it takes effect and whether the owner's recorded approval still covers those
terms. After confirming, they see what RentVine and the Sheet now show, what still differs, and what
to do next if something did not apply. Nothing says the systems are in sync unless the readback shows
it.

- Model verdict: NOT RUN — to be completed by the implementation runner with evidence.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                        | Architecture outcome | Behavior outcome | Human litmus                                             | Deterministic evidence / falsification                                                                                                                        |
| ---------------------------------- | -------------------- | ---------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S237-1 terms basis in preview    | ARCH-S237-1          | BEH-S237-1       | Staff see why each update follows and what still differs | Extend `tests/unit/s97-rentvine-updates-panel.test.tsx` and `tests/unit/s98-operating-sheet-route.test.ts`: covered, stale and none variants; hash unchanged. |
| R-S237-2 server-bound current base | ARCH-S237-2          | BEH-S237-2       | Staff see why each update follows and what still differs | Extend `tests/firestore/s97-renewal-writeback-lifecycle.test.ts`: body/Working mismatch and post-preview change refuse before any provider call.              |
| R-S237-3 RentVine plain outcomes   | ARCH-S237-3          | BEH-S237-3       | Staff see why each update follows and what still differs | Extend `tests/unit/s97-rentvine-writeback-route.test.ts`: every service code maps to catalog text; no raw code in any response.                               |
| R-S237-4 Sheet reconcile wording   | ARCH-S237-3          | BEH-S237-3       | Staff see why each update follows and what still differs | Extend `tests/unit/s98-sheet-writeback-service.test.ts`: before, after and drift observations yield distinct messages; no receipt minted.                     |
| R-S237-5 remaining differences     | ARCH-S237-4          | BEH-S237-4       | Staff see why each update follows and what still differs | Extend `tests/unit/s117-rent-charge-outcomes.test.ts`: partial success, stale read and match/mismatch rows per source.                                        |
| R-S237-6 one scope statement       | ARCH-S237-4          | BEH-S237-4       | Staff see why each update follows and what still differs | Component test renders the changed/manual/unsupported statement beside both panels.                                                                           |
| R-S237-7 honest ambiguous lock     | ARCH-S237-3          | BEH-S237-5       | Staff see why each update follows and what still differs | Extend `tests/unit/s97-rentvine-updates-panel.test.tsx`: ambiguous create shows lock and route, no Retry or archive control.                                  |

**Preservation set.**

`tests/unit/s97-writeback-proposal-contract.test.ts`, `tests/unit/s97-writeback-execution-service.test.ts`
(timeout ambiguity, no second POST, correlation never a receipt, receipt-bound reversal),
`tests/unit/s113-future-rent.test.ts`, `tests/firestore/s117-rentvine-route.test.ts` (working terms
alone still reach execution), `tests/firestore/s98-sheet-writeback-claim.test.ts`,
`tests/unit/s159-release-sheet-switch.test.mjs` (both retired keys closed) and the canonical gate.

**Adversarial acceptance checks.**

- **AC-S237-1** — A preview whose Working terms changed after the recorded approval shows "no longer
  covers" with the stale reason, and its effect hash equals the hash without the basis (ARCH-S237-1,
  BEH-S237-1).
- **AC-S237-2** — A current-base request with an amount different from the saved Working current
  rent, or a Working change between preview and confirm, refuses before any provider request; the
  fake provider records zero calls (ARCH-S237-2, BEH-S237-2).
- **AC-S237-3** — Enumerate every RentVine service code and every Sheet reconcile observation; each
  yields its catalog message, none contains a raw code, and the before case never claims the
  proposed value is present (ARCH-S237-3, BEH-S237-3).
- **AC-S237-4** — Dates succeed, a charge create times out: the page shows dates applied with
  receipt, the create ambiguous and locked with the recovery route, the remaining differences per
  source, and no Retry (ARCH-S237-4, BEH-S237-4, BEH-S237-5).
- **AC-S237-5** — No UI string or API field rendered to staff says synchronized for an app-only save,
  and approval/signature status never blocks preparation (preservation of D-RENEWAL-STAFF-OPERATIONS).

**Forbidden actions / hard gates.**

No live RentVine or Sheet write by engineering for proof, no new or reopened key, no generic or bulk
write, no automatic retry, no receipt-free reversal or Sheet reversal, no protected-path or registry
change, no customer value in Git. Real effects remain staff-initiated, exact-previewed,
exact-confirmed, claimed, receipted and read back under existing keys.

**Dependencies / sequencing.**

Consumes S66 owner-approval binding states, S97/S98/S107/S113 effect machinery and, when delivered,
S236's executed-document status. Produces the reconciled facts that S232's desk and S238's
acceptance evidence read. No other suite waits on it to build.

**Standalone delivery contract.**

- **Deliverable now:** R-S237-1 to R-S237-7 with fixtures, focused tests, operator-guide wording and
  this suite's evidence.
- **Consumes, but does not assume:** S236 executed-document status (unset reads "Not recorded");
  owner-approval binding (unset reads "No recorded approval").
- **Externally blocked effect:** provider-functional evidence on a genuine November/December lease
  requires a staff-performed update under the owner's exact scope (C13) — `BLOCKED` until then;
  the archive decision stays deferred.
- **Produces for downstream suites:** per-lease remaining-difference rows and plain outcome states
  for the desk (S232) and the acceptance ledger (S238).

**Verification and delivery contract.**

1. Before edits, record the current readback, the preservation baseline and each ARCH/BEH check
   failing for the stated reason.
2. Run the focused checks for every ARCH, BEH and AC row; keep preservation separate.
3. Run `bash scripts/verify.sh` and `npm run test:e2e:core`; audit secrets, PII, keys, runtime
   configuration and diff scope before any authorized delivery.
4. Report `ALL_GATES_GREEN`, `BUDGET_EXHAUSTED` only under an explicit budget, or `BLOCKED` only for
   the named live effect after all fail-closed work is green.

**Ordered prompt sequence.**

1. Re-verify current code and the open keys read-only.
2. Materialize the ARCH/BEH checks, litmus and preservation baseline; record fail-first results.
3. Build the basis projection, binding, messages, difference list, scope statement and locked state.
4. Falsify, run focused and canonical tests, update the operator guide, and ship only when
   authorized.

**Deletion/merge recommendation.**

Remove this suite when its checks are represented by code, tests and current facts; fold the deferred
archive decision into its own owner-decided change rather than this file.
