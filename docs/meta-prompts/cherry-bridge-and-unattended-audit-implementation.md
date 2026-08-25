# Implementation meta-prompt — unattended human-audit lane + Cherry Bridge note specs

> Authored 2026-08-24 from the owner-approved three-outcome draft. Controlling decisions are locked
> in the **Locked decisions** table below; do not re-litigate them. This is a fresh-context launcher:
> read `AGENTS.md`, `docs/facts.md`, and `docs/loop-state.md` first, then this file.

## Scope

Two workstreams, one handoff.

- **W1 — unattended completion of the human side of model-audit run `20260817T104500Z-model-audit`.**
  Twelve human-only checks; `HV-001` and `HV-012` are terminal `pass`; ten are `not_run`. Canonical
  state lives in four working-tree files (human-response JSON, resume state, feedback index, S69).
  W1 supersedes the S69 hard gate that forbade a repository-owned browser controller, declares an
  HV triage table, and adds a runnable lane: bodyless evidence recorder, terminal-safe response
  merge writer, and per-item stop rules.
- **W2 — specification-complete coverage of the eleven "Cherry Bridge Renewal Fixes Needed" notes.**
  Six new sentinel specs (S70–S75) plus five recorded amendments (S24, S31, S43, S58, S62). W2
  writes specs. **W2 changes no product code and builds none of the eleven fixes.**

## Locked decisions

| Ref | Decision                                                                                                                                                                                                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | One meta-prompt covering both workstreams; W2 bounded to specification-complete.                                                                                                                                                                                              |
| Q2  | **C, then FALSIFIED 2026-08-24 before use.** The grant assumed each of `HV-002`/`HV-007`/`HV-009` had a real boundary and a provable reversal; none does. Net effect authority is **NONE** — all three are refused and escalated to the batch packet. See `FB-HVSESSION-014`. |
| Q3  | **Create test data.** `HV-002`'s write is exercised against seeded test data on the non-Production plane; Production advances only to the confirmation boundary and stops. See **Q3 collision**.                                                                              |
| Q4  | The runner's own in-app browser, with exactly one owner sign-in at the start, then unattended.                                                                                                                                                                                |
| Q5  | Bodyless allowlisted evidence only. No screenshots, no page bodies, no customer values. Visual perception stays ephemeral and is never written down.                                                                                                                          |
| Q6  | MKD: record the contradiction, no outreach-skip code. The +3.5% rule is a one-time Admin data entry on `portfolioID` 27, not a build.                                                                                                                                         |
| Q7  | Tenant Text copy: adopt the team's wording; render the past-tense channel-success clause only against recorded evidence that both channels went out.                                                                                                                          |
| Q8  | Six client-facing steps as the operator model, keyed on stable string ids, with a migration; reconcile the existing 8-stage vocabulary rather than adding a third.                                                                                                            |
| Q9  | "Not an active property": read-only live field discovery **and** an operator override with a recorded reason.                                                                                                                                                                 |
| Q10 | Auto-send: answered not-possible under D33 + the blanket no-autonomous-send invariant. Specify the permitted equivalent (waiting-on state, last-followed-up stamp, internal nudge, unsent draft).                                                                             |
| Q11 | Working tree only. No commit, no push, no deploy, no send.                                                                                                                                                                                                                    |

### Q3 collision — surface, do not silently resolve

"Create test data" collides with a standing invariant the owner themselves set: S69's hard gates, S56,
and `F-WORKING-APP-V1-LIVE-ONLY` all forbid an invented or Demo record entering **Production**. The
faithful reading of the owner's intent — take the write off a real client lease — is therefore
implemented as a split proof:

1. **Non-Production plane.** Seed a synthetic conflict fixture and drive the full resolve path
   end-to-end, including the High/Blocked confirmation dialog. This is where the write actually happens.
2. **Production.** Advance the real first unresolved card to its confirmation boundary and **stop**.
   Record bodyless form state. Do not press `Resolve`, confirm a dialog, or authorize write-back.

`HV-002` reaches terminal only when the owner, in the batch packet, either (a) names a real lease and
resolution to execute on Production, or (b) accepts the fixture proof as sufficient for this check.
Both options appear in the packet. **Do not create a record in Production to satisfy this item.**

## Preservation set — run separately, never averaged

`npm run format:check` · `lint` · `typecheck` · `npm test` · `verify:router-boundary` ·
`verify:falsification` · `verify:context-freshness` · `verify:spec-traceability` · `verify:copy-voice` ·
`verify:redaction` · `check:budget-guard` · `npm run build`

Named sentinels that must stay green:

- `tests/unit/mkd-outreach-skip-sentinel.test.ts`
- `tests/unit/offered-rent-writer-boundary.test.ts`
- `tests/unit/lease-renewal-tenant-draft.test.ts`
- `tests/unit/lease-renewal-owner-draft.test.ts`
- `tests/unit/feature-suite-spec-shape.test.mjs` (>= 225 assertions)
- `npm run verify:spec-traceability` (>= 568 acceptance ids)

Plus: `HV-001` and `HV-012` still read `pass` at the end of the run.

Known pre-existing red, **not** a regression: `test:e2e:core` fails 8 demo-mode tests
(`Q-E2E-DEMO-LANE-RED`).

Environment note: `node_modules` is installed for linux. Run any `tsx`/`esbuild` script through
`wsl -e bash -lc ...`; never `npm ci` on Windows.

## Architecture obligations (runnable, deterministic, fail-first)

- **A1** — `FB-HVSESSION-012` exists in the feedback index, preserves the owner instruction verbatim,
  names `FB-HVSESSION-003` as the premise it supersedes, and maps to at least one new `AC-S69-*` id.
  A `docs/facts.md` Fact Ledger row plus a Supersede Log row make the reversal durable.
  _Verify:_ `npm run verify:context-freshness`.
  _Known limit:_ the orphan-marker grep covers only `ACTIVE_GOVERNANCE`, which does **not** include
  `docs/feature-suites/`. The superseded sentence must therefore be **deleted from S69 by hand**; the
  gate will not catch it for you.
- **A2** — S69 declares `AC-S69-24`+ for the unattended lane, and its **Forbidden actions / hard
  gates** no longer forbids the authorized controller while still forbidding everything else.
  _Verify:_ `npm test -- tests/unit/feature-suite-spec-shape.test.mjs`; `npm run verify:spec-traceability`.
- **A3** — the resume state carries `custom_browser_controller_allowed: true` and an
  `unattended_run_mode` key, and Resume-and-pause contract items 4/5/8 are rewritten to match. No
  stale contradiction survives.
- **A4** — a declared **HV triage table** covers all twelve ids, each assigned exactly one class:
  `browser_executable_no_effect` | `owner_decision` | `second_party_required` | `hardware_required` |
  `effect_gated` | `terminal`. A missing or double-classified id fails.
- **A5** — the evidence recorder accepts **only** allowlisted bodyless fields: origin, pathname,
  allowlisted control/heading text, status codes, redirects, role/domain booleans, counts, timestamps,
  revision, environment labels, target-change boolean, error class. A seeded email, cookie, token,
  OAuth query, address, currency value, page body, or screenshot path fails the check **without
  echoing the fixture**.
- **A6** — the response writer merges by stable `HV-*` id, never downgrades a terminal result, and
  blocks on a conflicting terminal value with bodyless diagnostics. `HV-001:pass` fed a fabricated
  `HV-001:not_run` must **block**, not overwrite.
- **A7** — six new sentinel specs exist, each with all eight required sections, bold `AC-S<n>-<k>` ids
  matching its own suite number, a README table row, an `AGENTS.md` Route Table row, and a Project
  Map mention:

  | Suite | Path                                                               | Notes       |
  | ----- | ------------------------------------------------------------------ | ----------- |
  | S70   | `docs/feature-suites/renewal-queue-integrity.md`                   | N1, N2      |
  | S71   | `docs/feature-suites/lease-identity-and-address-truth.md`          | N3, N8      |
  | S72   | `docs/feature-suites/renewal-step-model-and-workspace-defaults.md` | N5, N7, N10 |
  | S73   | `docs/feature-suites/current-rent-truth-and-badge-integrity.md`    | N6          |
  | S74   | `docs/feature-suites/tenant-offer-copy-and-channel-truth.md`       | N9          |
  | S75   | `docs/feature-suites/renewal-follow-up-state.md`                   | N11         |

  Plus recorded amendments to S24 (artifact/copy), S31 (referenced by S75), S43 (stage count), S58
  (the `/lease-renewal/live` currency hole), and S62 (MKD contradiction + the Admin data-entry step).

- **A8** — every one of N1–N11 maps to at least one bold AC id. Deleting any one note's coverage fails
  the check **by name**.

New gates to author (none of these exist today):

- `tests/unit/audit-unattended-lane.test.mjs` — triage-table completeness, terminal no-downgrade,
  effect-boundary stop rule, recorder allowlist.
- `tests/unit/cherry-bridge-note-coverage.test.mjs` — N1–N11 → bold AC id coverage.
- `tests/unit/spec-registration.test.mjs` — `AGENTS.md` Route Table + Project Map registration for
  every sentinel spec. Verified absent today: zero `"Route Table"` hits under `tests/` or `scripts/`;
  only the README row is machine-checked.

## Behavior obligations (observable, deterministic, fail-first)

- **B1** — from 2 pass / 10 `not_run` against an authenticated Production target, the run terminates
  with every `browser_executable_no_effect` item carrying a status, non-empty bodyless evidence, and
  a named stop reason where applicable.
- **B2** — before any per-item work, the runner reads back the exact controlled target and refuses to
  proceed unless origin, pathname, managed-domain boolean, visible Admin role, and Demo-auth-off all
  match. A target on `/` or `/sign-in` produces a **named blocker, never a candidate Pass.** This is
  precisely the failure that burned four prior sessions.
- **B3** — an `effect_gated` item advances to its confirmation boundary and **stops**. A fixture that
  makes the confirm control reachable still produces `stopped at boundary`, not `confirmed`.
- **B4** — `HV-008` is refused outright citing D33 / `F-DIRECT-NOTICE-SEND-NEVER`. No fixture, flag,
  or prompt makes the runner send.
- **B5** — `HV-003` and `HV-006` terminate as `second_party_required` and `hardware_required` with
  their exact preconditions stated, not as fails.
- **B6** — the four `owner_decision` items (`HV-004`, `HV-005`, `HV-010`, `HV-011`) are emitted as
  **one** batch packet: for each, the question, prepared findings, a recommended answer, and the
  effect of each choice. Answering all four in one reply moves all four to terminal.
- **B7** — killing the run mid-item leaves the response JSON and resume state recoverable, with the
  interrupted item still `not_run` and no invented completion. A fresh run resumes without replaying
  a terminal Pass.
- **B8** — if browser control is unavailable, the runner emits **one** named blocker and exits
  cleanly: no keepalive, no browser process, no local server, no shell held open.
- **B9** — each new spec, read cold by an implementer with no access to the authoring conversation,
  states a distinct current state and intended end state, and its AC ids are **observable states**
  (rendered text, ordering, HTTP codes, persisted records, refusal types) rather than "implemented X".
- **B10** — S62's amendment records the MKD contradiction **without weakening `AC-S62-9`**.
  `tests/unit/mkd-outreach-skip-sentinel.test.ts` stays green.
- **B11** — S74 does not adopt a channel-success claim the app cannot support. Its AC ids tie the
  "sent out via email and rentvine chat" clause to recorded evidence that both channels went out.
- **B12** — S75 records the auto-send ask as answered-not-possible under D33 and specifies the
  permitted equivalent, without proposing a send path.
- **B13** — RETIRED 2026-08-24 as unsatisfiable. No watch-stop path exists anywhere in the product, so
  the reversal readback `HV-009` requires cannot be produced, and the item's expected pass state (watch
  active) contradicts the reversal state (stopped). `HV-009` is refused rather than committed.
- **B14** — the lane never claims a stop boundary where none exists. Where an effect-bearing control has
  no confirmation dialog on its severity path, the outcome is `no_safe_boundary` and the runner does not
  approach it; unknown severity assumes no boundary. See `AC-S69-33`.
- **B15** — evidence cannot be recorded without a verified target, and a refused effect-gated id still
  reaches the owner through the batch packet under the same four-field bar. See `AC-S69-35`.

## HV triage — authoritative classification

| Id       | Class                   | Disposition                                                                                 |
| -------- | ----------------------- | ------------------------------------------------------------------------------------------- |
| `HV-001` | `terminal`              | `pass`. Never replayed, never downgraded.                                                   |
| `HV-002` | `effect_gated`          | **Refused/escalated.** Boundary is severity-dependent; none exists on Low/Medium. See Q3.   |
| `HV-003` | `second_party_required` | Needs a second managed identity at their own keyboard. Terminal with preconditions stated.  |
| `HV-004` | `owner_decision`        | Batch packet.                                                                               |
| `HV-005` | `owner_decision`        | Batch packet.                                                                               |
| `HV-006` | `hardware_required`     | Needs a microphone. Terminal with preconditions stated.                                     |
| `HV-007` | `effect_gated`          | **Refused.** No reversal control on 4 of 5 legs; 2 legs touch real Live records. Escalated. |
| `HV-008` | `effect_gated`          | **Refused.** Blanket no-autonomous-send invariant + irreversible durable association.       |
| `HV-009` | `effect_gated`          | **Refused.** No watch-stop path exists; reversal unproducible. Escalated.                   |
| `HV-010` | `owner_decision`        | Batch packet.                                                                               |
| `HV-011` | `owner_decision`        | Batch packet.                                                                               |
| `HV-012` | `terminal`              | `pass`. Never replayed, never downgraded.                                                   |

## The eleven notes — what each one actually is

Grounded against the repository, not taken at face value.

- **N1 "not an active property"** — no active/inactive filter exists on the renewal read path.
  `cohort.ts` excludes only month-to-month / owner-authorized / program text signals; `status` and
  `leaseStatus` are read solely as substring haystacks for those three phrases. `moveOutDate` is the
  **last fallback** for the "Ends" date, so a moved-out lease renders a date and stays actionable.
  The authoritative RentVine field is **unknown in-repo** — no committed fixture carries one. → S70.
- **N2 "chronological order"** — there is no sort. Zero `sort`/`localeCompare` in `RenewalDesk.tsx`,
  `live-desk.ts`, or `cohort.ts`; the queue inherits export row order. The "Needs your attention" fold
  directly above it **does** sort by soonest end date (`attention.ts` `compareEndDate`) — two lists,
  two orderings, one page. Second-order: a card with an open conflict hides the date entirely (the
  conflict pill occupies the slot), so even a sorted queue will read as violating the order. → S70.
- **N3 "house numbers"** — `leaseAddressLabel()` walks
  `["streetName","address","addressLine1","propertyAddress"]` first-hit-wins.
  `property.streetName` is street-**name**-only (the number is `property.streetNumber`) and present
  305/305, so `streetName` always wins and the label is always street-only. Pure key-**order** defect;
  no truncation, no redaction rule. Duplicated in the Gmail owner-draft path
  (`renewal-notice-draft-service.ts` `addressOf`). The correct composer already exists twice
  (`console/rentvine-live-provider.ts` `unitAddress`, `maintenance/unit-matcher.ts`
  `composeUnitAddress`). Blast radius beyond cosmetics: `matchRenewalTarget` requires a numeric token,
  so the Ask box can never resolve a live renewal target; RentCast comps are queried on an ambiguous
  street-only address; outgoing owner emails name a street with no number. → S71.
- **N4 "MKD — no outreach, +3.5%"** — **split verdict.** The 3.5% half is already built and deployed
  (S62 `F-OWNER-POLICY-PRICING`, `owner_policy_rules`, `flat_percent_increase`, Admin-managed); MKD is
  `portfolioID` 27 (`F-MKD-PORTFOLIO-IDENTIFIED`, 39 leases, 3 owner records). The **rule record does
  not exist in production** — no seed, no fixture, no script creates it. That is one Admin data entry,
  not a build. The "no outreach" half re-asserts a premise the owner **withdrew 2026-08-06**
  (`A-MKD-NO-OWNER-OUTREACH-2026-08-05`) and is structurally forbidden by `AC-S62-9` +
  `tests/unit/mkd-outreach-skip-sentinel.test.ts`. Implementing it as written turns a green sentinel
  red. → S62 amendment, no new suite.
- **N5 "this link never changes"** — `infoFormUrl` is per-lease only, persisted at
  `lease_renewal_progress/{leaseId}.owner_decision.info_form_url`. No default exists anywhere. Three
  Admin-config precedents already exist to hold it. Also: the gated Gmail composer never sends
  `infoFormUrl` at all, so a constant alone would still be dropped there. → S72.
- **N6 "current rent is wrong"** — the highest-integrity finding. `confidence: "Verified"` beside
  Current rent is a **hardcoded string literal** in `owner-draft.ts` — not computed, not tied to
  reconciliation, not lowered when the same lease has an open High Current-rent conflict. The same
  page can flag the rent as a conflict and, a dozen lines below, badge the same number `Verified`.
  No draft path reads human resolutions; resolving all 20 conflicts changes not one character of the
  owner email. No draft path carries a read timestamp, so `Verified` can describe a 14-minute-old
  number. The 20 conflicts reproduce from the committed live capture. Four live explanations remain
  open and none is disproven from the repo: base-vs-total semantics; a lease-level `rent` key
  shadowing the documented `unit.rent` (the two in-repo extractors resolve in **opposite**
  precedence); a stale `unit.rent`; or up to 15 minutes of cache staleness. Separately,
  `/lease-renewal/live` bypasses the S58 currency cache entirely — no age banner, no refresh, no
  expired refusal. → S73 (+ S58 amendment).
- **N7 "comps must be first"** — confirmed. Rendered order is decision → offered rent → RBP/insurance
  → form URL → comps → screenshot → look-up → submit. Nothing pins visual order in code or tests
  (tests query by label), so a reorder is mechanically safe. Nothing enforces the sequencing claim
  either: the submit gate is decision + positive offered rent, client and server; no comp field is
  required anywhere. → S72.
- **N8 "tenant name is incorrect"** — most likely the **same root cause as N3**, not a separate name
  bug. Names resolve from `tenants[0]` only (elements 1..n never read; no primacy/active flag). But
  the desk card and workspace H1 identify a lease by the street-only label, so two leases on one
  street render an identical card and the address/resident pairing is unverifiable from the UI. No
  demo/seed contamination exists — the reported names appear nowhere in source, only in gitignored
  live-capture artifacts. Related asymmetry: recipients fan out to every co-tenant (To first, Cc rest)
  while the greeting names only `tenants[0]`. → S71.
- **N9 "change this message"** — all three channels render from one frozen constant,
  `TENANT_RENEWAL_V1_BASE_COPY`, registered as governed artifact `tenant-renewal:v1.0` with a
  `contentHash`. Email and Portal chat are byte-identical; only Text differs. The requested wording is
  a **past-tense channel-success claim**, which `AC-S24-4` permits only against real receipts. The
  receipt mechanism exists (`channelReceipts` → `bothChannelSuccess`) but no production caller
  populates it, and both portal-chat and SMS send keys are `production_allowed:false`. The copy is not
  editable in-app: the approved-template store has exactly one caller (move-in welcome), so every
  wording change is a code deploy. Editing the copy silently changes the artifact `contentHash` while
  it keeps claiming its 2026-07-14 v1.0 approval — `AC-S24-3`'s "modified artifacts fail closed" is
  not actually enforced against an in-repo edit. → S74 (+ S24 amendment).
- **N10 "align to our 6 steps"** — a 4-dot stepper over a 5-card page whose 4th card (the actual Gmail
  owner-email composer) belongs to no step at all. Against the client's six: **Step 1** partial and
  wrong-direction (two fields reconciled; pet info, deposit, Rhino, insurance, inspection collected
  nowhere; Sheet write-back is append-only, one field, Admin-gated, off in production). **Step 2**
  built but mis-stepped — the owner email lives in an unnamed card and steps 2–3 are fused into
  "Owner decision"; the client says "zillow comps" while S43 forbids Zillow and the app ships RentCast
  (a naming mismatch to raise, not silently satisfy). **Step 3** half — captured in Firestore, never
  written to the sheet. **Step 4** best covered and governance-correct (unsent draft, human sends from
  Gmail); channel labels differ from `AC-S43-13`. **Step 5 entirely missing** three ways: no
  tenant-response capture (`tenantResponded` hardcoded `false` in all three production callers), no
  hand-off composer, no stage to hang it on. **Step 6 mostly missing**: packet truth can't reach ready
  (no approved artifact catalog), no review state, Dotloop `production_allowed:false`, the
  "docs were sent" composer exists but is orphaned, the webhook route is not on disk. Structural:
  `markRenewalComplete` requires only that an owner decision exists, so a renewal can be marked
  complete having never drafted an offer or seen a signature. Two stage vocabularies already exist
  (4-step UI, 8-stage `constants.ts`); neither is the client's six. → S72 (+ S43 amendment).
- **N11 "waiting on? last follow-up? auto-send?"** — asks 1 and 2 are a small unblocked slice whose
  **engine is already built and starved**. `NoticeStatusCode` already contains `awaiting_response` and
  `follow_up_due` with human labels; the follow-up cadence is computed from `renewalLetterSentIso` +
  `tenantResponded` — and all three production callers hardcode those to `null`/`false`. The statuses
  are unreachable dead code; the "Follow-up due" line can never render. `planCallTasks` already
  suppresses a nudge when contact is on file within N days, and always sees "no contact on file."
  Ask 3 (auto-send) is **doubly barred**: the blanket "no autonomous, scheduled, bulk, or
  model-triggered client-facing send", plus D33's permanent closure of the renewal/maintenance send
  keys. Only a new explicit owner decision superseding D33 changes that. S31 (quiet-thread selector,
  "No reply in N days" prompt, watch auto-renew) is specified in full and **verified absent from disk**
  with no owner dependency — fully unblocked build work. Caveat: two follow-up clocks need reconciling
  (notice-rule `followUpIntervalDays` = 10 days, unverified; S31 `followUpAfterDays` = 3 business days,
  assumed). → S75 (+ S31 amendment).

## Delivery contract

Real file edits in the working tree of the primary checkout. Mechanical extraction via
`git diff` / `git status`. **No commit, no push, no deploy, no send.** `output/` and every gitignored
capture stay untouched.

`golden-data/captured/` and `temp/model-audit-*/out/` hold **real client names** and are correctly
gitignored. They must never be copied into evidence, a spec, or a note map. No spec, note map, or
evidence file authored under this meta-prompt may name a resident.

**Durability risk, stated loudly:** the entire audit currently lives in five untracked files plus four
modified-but-uncommitted ones. A single `git clean` destroys the canonical record of both passes. This
meta-prompt does not commit — but the owner should know the state being protected is unprotected.

## Terminal states

`ALL_GATES_GREEN` or `BUDGET_EXHAUSTED`. A genuine external blocker reports `BLOCKED` as an
exceptional stop. Cloud ceiling is S52: `$25` alert, `$100` hard stop.
