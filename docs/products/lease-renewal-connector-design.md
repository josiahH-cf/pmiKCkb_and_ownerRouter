# Lease Renewal Sheet — Connector & Conflict-Resolution Design Spec

Status: **Read-only design only.** No runtime build. No system-of-record (SoR) writes proposed
as executable. The single new write surface — the Phase 2 approval-gated spreadsheet write-back
— stays approval-gated, deterministic, structurally re-anchored, read-after-write verified, and
`Blocked`-on-uncertainty. Tabs 4 (PadSplit WiFi) and 7 (Platform Logins) are hard-excluded at
the connector boundary and are never read, fingerprinted, normalized, reconciled, flagged,
logged, previewed, or written. The connector **augments** the team's spreadsheet; it does not
replace it.

Produced 2026-06-20 by a multi-agent design workflow (three design lenses → synthesis →
adversarial review); the review's corrections are applied below and listed in the changelog.

Grounded in (read fully): [`lease-renewal-spreadsheet-map.md`](lease-renewal-spreadsheet-map.md)
§1–8 · [`lease-renewal-discovery-reference.md`](lease-renewal-discovery-reference.md) §A, §1
Cadence, §2, §5, §6.1–6.2, §7–8 · [`lease-renewal-agent.md`](lease-renewal-agent.md)
(imported-fact confidence ladder, approval-queue v1, `Blocked`-on-uncertainty, KB-owned
workflow-run page, "Do Not Build Yet") · [`../integration-architecture.md`](../integration-architecture.md)
(tool-role map, Action Registry, production gate, preview validation, health checks) ·
[`../../AGENTS.md`](../../AGENTS.md) (Security + Identity + data-governance).

---

## 1. Goals & Constraints

### 1.1 Goals
1. **Decompose → read → reconcile → flag (Phase 1)**, then **approval-gated write-back
   (Phase 2)** (discovery-ref §A, §6.1) — each phase gated by *earned trust*, not calendar time.
2. **Augment the team's source of truth.** The non-technical, remote Philippines team trusts
   the sheet as their working dashboard (discovery-ref §A). The connector adds flags and
   approval items the team can verify; it never silently mutates their surface and never forces
   a tool switch.
3. **Be deterministic where correctness matters** (discovery-ref §6.1; agent.md "Deterministic
   checks, not model judgment alone"). Fingerprinting, header resolution, normalization,
   join-key derivation, reconciliation, severity, and the write-back cell map are rule-tables /
   regex — testable with fixtures. A model may *suggest* a mapping or a winner as a surfaced
   suggestion a human accepts; never an auto-bind, never an auto-resolution of a High/Blocked item.
4. **Degrade to `Blocked`, never guess.** Any unfingerprintable tab, unmappable column,
   unparseable value, ambiguous join, missing precedence rule, or unverifiable write surfaces as
   a flagged / `Needs Review` / `Blocked` artifact — it never silently coerces or writes.
5. **Catch what the team missed.** The trust currency is accurate flags (off-cycle renewal
   dates, stale `Needs Renewed`, the lawn-care / inspection-cadence conflicts, the discovery-ref
   §4 inherited-tenant deposit/lead-paint/LLC failure modes) that Dan reviews and finds correct.

### 1.2 Hard constraints
- **Read-only design; no execution.** The connector, reconciliation engine, queue wiring, and
  write-back are *specified, not implemented* (AGENTS.md; agent.md "Do Not Build Yet").
- **No SoR writes proposed as executable.** No writes to Rentvine, Dotloop, LeadSimple, Gmail,
  QuickBooks, Boom, or client Drive. "Fix in Rentvine" is a **non-executable flag** only.
- **The spreadsheet write-back is itself inside the AGENTS.md "operating Sheets" no-write
  clause** (Security Rules list "operating Sheets" alongside Rentvine/QuickBooks/banks). The
  operational sheet IS the team's database of truth (discovery-ref §A), so the write-back is
  **gated behind a future approved per-action spec** — it is not "automatically permitted
  because it isn't a classic SoR write." The registry `Planned` state + the Phase-1-trust
  milestone enforce that gate.
- **Credential tabs 4 & 7 hard-excluded by construction** — before any parsing, and re-scrubbed
  at emit. The reconciliation engine, queue, log, and write-back cell map are physically
  incapable of addressing them.
- **Approval-gated write-back: structurally re-anchored + read-after-write verified, or
  `Blocked`.** No partial/multi-cell batch that could partially apply.
- **Identity boundary.** Read only via the `josiah@pmikcmetro.com`-authed Drive/Sheets connector
  (AGENTS.md Identity Rules; discovery-ref §A). Never the personal account. The six identity
  systems do not cascade.
- **Data governance** (AGENTS.md, applied 2026-06-20; discovery-ref §5). Real previously-vetted
  client data **may be read and used as test/training input** and to drive read-only follow-up
  Rentvine/Dotloop queries — kept out of git, out of user-facing/model output without approval,
  inside the `pmikcmetro.com` boundary. We **train/test on** the data; we do not **emit/act on**
  it autonomously. (PII display *inside the authenticated app* to an approver is allowed and
  audited — see §6.1.)

---

## 2. Read / Ingest Model

Output is **`RenewalRecordFact` rows + a per-run `IngestManifest`** — never a write. Each fact
carries the agent.md confidence vocabulary (`Verified`/`Likely`/`Needs Review`/`Conflict`) plus a
**structural, cell-precise source coordinate** (including the sheet row index captured at read
time), which is what makes a future correct write-back possible (§4).

### 2.1 Deterministic, fail-closed pipeline
```
A. Acquire (read-only, pmikcmetro.com)        -> raw cell grid + cell coordinates (incl. row index)
B. Credential-tab hard-exclusion (pre-parse)  -> redacted grid (tabs 4 & 7 never materialized)
C. Table fracturing -> logical-tab segmentation
D. Content-keyed tab fingerprinting           -> tab_id + confidence (or UNRECOGNIZED)
E. Header resolution (position-independent)   -> column -> schema-field binding (or [MURKY])
F. Per-cell typed normalization               -> NormalizedValue + confidence + raw + cell ref
G. Record assembly (per logical row)          -> RenewalRecordFact
H. Fuzzy-join key derivation                  -> address/lease keys + candidates (NO merge)
I. Deterministic ingest checks + manifest     -> IngestManifest (counts/provenance only)
```
Each stage is **fail-closed**: a unit that cannot complete is marked and passed through as a
typed problem, never silently dropped. Stage I asserts every input row is accounted for.

### 2.2 Stage B — Credential-tab hard-exclusion (before any parsing)
Tabs 4 and 7 are plaintext-credential-bearing (map §1 top warning, §7). Because the export does
not preserve tab identity, exclusion is **content-signature-driven**, not position-driven:
1. **Position guard** — inferred tab indices are a hint, never the gate.
2. **Content-signature guard (authoritative)** — quarantine + drop any block whose header/content
   matches credential markers (header tokens `/(password|passcode|wifi|ssid|pin|login|username|
   credential|access\s*code)/i`; a credential-shape value such as a `WiFi`/`SSID` label adjacent
   to a high-entropy non-dictionary token; or known platform names *co-located with a
   password/PIN column*).
3. **Quarantine record** — manifest gets `{ excluded_block_id, reason: "credential-tab",
   signature_hits, row_count }`: **counts only, zero values, zero header strings echoed.**
4. **Over-redaction visibility (review fix #1).** Because the signature guard can false-positive
   on legitimate operational tabs (e.g. Tab 6 Vendor/Platform Contacts holds platform URLs; Tab 1
   references "Portal Chat"), the manifest's credential-exclusion census is **surfaced for a
   one-time human confirmation per workbook structure** — so a wrongly-quarantined real block is
   *visible*, not silently counted as "excluded."
5. **Emit-time tripwire (honest scope, review fix #2).** A final scrubber re-runs the credential
   regexes over outgoing fields and forces `REDACTED` + a hard error on any hit. This is a
   **label/marker tripwire**: a detached high-entropy password value has no regex signature, so
   **values-level containment rests entirely on Stage B**; an optional Shannon-entropy/format
   check may be added to the scrubber. Parallel recommendation to Dan (recommendation only): move
   these credentials to a password manager / Secret Manager.

### 2.3 Stage C — Table fracturing → logical-tab segmentation
Table position ≠ logical tab (map §1, §7). Split at fully-blank rows, column-count changes, and
pure divider-glyph rows. **Recognize-and-drop-but-count** scaffolding: `.`/`-----` month-separator
rows (map §3); `a`/`z`/`zzz` sort scaffolding and Tab 15. **Re-stitch** consecutive blocks that
fingerprint to the same logical tab (Stage D) with subset/superset columns, reassembling a
fractured tab before record assembly.

### 2.4 Stage D — Content-keyed tab fingerprinting
Identify each block by a content signature, not header text or position (map §8). Fingerprint =
weighted match of: (1) **header-token signature** (multiset of normalized tokens — strong, not
trusted alone); (2) **anchor-phrase signature** (near-unique verbatim headers, e.g. Renewals
`have we confirmed pricing with the owner?`, `if they have a rhino policy is it renewed?`;
Move-Out `have they put in their notice?`, the "4265 coordination charge" phrase; Inspection
Tracker `$130 charge to owner … added to the invoice sheet?`, the literal `FALSE` header;
Property Attributes `Updated to Kwickset Smart Locks` (sic — the misspelling is itself a stable
anchor)); (3) **column-shape signature** (column-count band + value-type profile, to catch
fragments whose header row was lost). Below-threshold/ties → `UNRECOGNIZED`, rows passed through
flagged `Needs Review`, never force-mapped. The condensed 6-col working Renewals fragment must
fingerprint to **Tab 3** via column-shape + anchors.

### 2.5 Stage E — Header resolution (position-independent, headers not trusted)
Central rule (map §7–8): do not trust headers. Defended pathologies: Move-In `Move in date`
header **holds emails**; `f` header holds **timestamps**; Inspection Tracker has a **literal
`FALSE` header**; Property Attributes has a **blank header** + a header-less `TRUE/FALSE` flag;
Owner-Onboarding first "header" row is a **data row (off-by-one)**. Algorithm: (1) bind by
anchor-phrase first; (2) if header is blank/`FALSE`/junk, bind by **data-profile inference** (a
mostly-email column → `tenant_email` regardless of its "Move in date" header); (3)
**header/data-mismatch detector** — disagreement → do not coerce; emit observed type, set
`confidence = Needs Review`, raise `header_data_mismatch` carrying both strings; (4) unmatched →
`[MURKY]` passthrough, surfaced never guessed.

### 2.6 Stage F — Per-cell typed normalization
Each cell becomes:
```
NormalizedValue {
  raw: string                  // verbatim (kept for read-after-write parity)
  normalized: <typed> | null   // null if unparseable
  type: date|currency|tristate|boolean|enum_status|name|email|address|text
  confidence: Verified | Likely | Needs Review | Conflict
  flags: string[]              // state_in_freetext, embedded_assignee, multi_event_cell, ...
  source: { tab_id, logical_row, sheet_row_index, column_field, sheet_cell_ref }  // structural coord
}
```
Normalizer specs (deterministic, documented fallbacks): **dates** (ordered explicit-format
attempts over the map's mixed formats; `MM/YYYY` → `month_only` flag, which matters for the
discovery-ref §1 "by the 15th / ≥30 days" cadence math; unparseable → `null` + `Needs Review`;
never locale-guessed); **currency** (strip `$`/commas; `Market Value` is manually entered — no
extra trust); **tristate** yes/no/na (`yes,n/a` → `addressed` + `combined_yes_na` flag per map
§3); **boolean** `TRUE/FALSE` (a `FALSE` *header* is a leaked default, not data); **enum status /
state-in-free-text** (controlled-vocabulary extractor for `working`/`Needs Renewed`/`not
renewing`/`Dont renew`/`decided to move out`/`eviction`/`sent to Leah`/…; `"yes <date>"` split
into `{status,date}`; `multi_event_cell` flagged); **embedded assignee** (lift "ESTELLE WORKING
ON"/"sent to Leah" into a structured `assignee` via a known-staff lexicon; unknown name-shapes →
`possible_assignee` + `Needs Review`); **name/email/address** ([PII] — normalized for internal
join keys only, never emitted outside the boundary). **Confidence:** clean+anchored → `Verified`;
fallback-parse or resolved-`[MURKY]` → `Likely`; unparsed/mismatch/ambiguous/unknown → `Needs
Review`. **`Conflict` is never set at ingest** — only by reconciliation (§3).

### 2.7 Stage G/H — Record assembly & the fuzzy-join problem
No stable ID across the 5+ property tabs (key = address as inconsistent free text) or the lease
lifecycle (key = tenant/lease name, inconsistent formats); Property Attributes duplicates address
across `Property` vs `Unit` (map §5). **Derive candidates; never auto-merge** (auto-merge would
manufacture the very conflicts §3 resolves). `address_key_strict`/`address_key_loose`
canonicalizers for blocking; `lease_key` (normalized name, internal only). Match tiers `exact` /
`likely` / `ambiguous`; ambiguous → `fuzzy_join_review` + `Needs Review`, **left unmerged**, with
the two candidate rows recorded as run evidence so an approver can verify. Cross-source hooks
(inspection cadence in Tab 17 **and** Tab 18; lawn-care in Tab 18) tagged `cross_source_candidate`
— ingest assigns no winner.

### 2.8 `RenewalRecordFact` + `IngestManifest`
Fact carries fields, `join_keys`, derived (not merged) `join_candidates`, `record_confidence`,
and `pii_fields`. Stage I emits the **`IngestManifest` (counts + provenance only, no client
values)**: row conservation (every raw row mapped/flagged/dropped-as-divider/excluded-as-credential
reconciles, else `Blocked`), credential-containment + the §2.2(4) over-redaction census, tab
coverage, header-mismatch census, unmapped-column census, parse-rate per type, fuzzy-join census,
cross-source flag inventory. Per-tab schema bindings come from map §2. The map §6/§8 approval-gate
columns map directly to queue items; ingest only reads/types them.

---

## 3. Conflict Reconciliation (Phase 1 — read + reconcile + flag, NO writes)

Runs once per renewal run, keyed to the **KB-owned workflow-run page** (agent.md).

### 3.1 Inputs & join
Reconcile spreadsheet facts (Tabs 1, 2, 3, 5, 6, 8–18 — **never 4 or 7**) against **Rentvine**
(read-authoritative SoR), Rentvine **building-level** fields (discovery-ref §1 step 14), and the
**Google Form** intake. Join on the §2.7 keys; below threshold → `Blocked` "ambiguous match",
human disambiguates, never auto-resolved.

### 3.2 Per-field reconciliation (deterministic)
Each reconcilable field → one `FieldReconciliation` { `field_key`, `candidates[]`
(`source_system`, `location_ref` deep link, `raw`, `normalized`, `read_timestamp`),
`agreement` (agree/conflict/single-source/missing), `suggested_winner` (§3.4 — suggestion only),
`severity` (§3.3), `confidence_for_draft` }. Only `conflict` (and `Blocked`-grade `missing` on a
gating field) raise a flag + queue item; `agree`/benign cases flow to the agent.md missing-facts
path (re-check only affected facts).

Worked cases:
- **Case A — inspection cadence (Tab 17 vs Tab 18 vs Rentvine building level).** Normalize cadence
  to `{per_year, raw}`; unparseable → `unparsed`, raw shown, never a guessed number. Classified
  **operational/internal → Medium** (review fix #7: inspection *scheduling* cadence is internal
  state; it does **not** carry tenant-notice/renewal-timing weight, so it does not trip the §3.3
  timing→High rule). If it implicates the missed-inspection $130 **owner charge** (financial,
  Tab 17) it escalates to High.
- **Case B — lawn-care responsibility (Owner/Tenant/HOA).** A legal/contractual lease term →
  **High → Admin (Dan/secondary approver) required.** The "enter corrected value" path is
  essential: the sheet may say Tenant, Rentvine say HOA, and *neither* be right (HOA dissolved /
  owner reassumed).

Same machinery covers address string, current rent (Rentvine vs Tab 3), and renewal/lease-end
date (**Rentvine lease-end vs Tab 3 `Renewal Date`** — note: Tab 17 `Lease Start` is a *start*
date and is **not** a lease-end/renewal-date source (review fix #11); it may only corroborate a
start date), and utilities responsibility.

### 3.3 Severity → approval-queue routing (agent.md risk vocabulary; first-match-wins)
1. Field is legal / financial / **tenant-notice-or-renewal timing** / owner-or-tenant-facing OR
   feeds an external write → **High** (Admin required even when another user proposes the
   resolution). Examples: lawn-care term, current rent, market value, renewal/lease-end date,
   owner decision, deposit type/amount, landlord LLC entity.
2. Any candidate `unparsed`, join below threshold, column unmapped, or **no precedence rule** →
   **Blocked** (never a guessed write); routes to failed/blocked automation; Admin triage if it
   also lacks a required approver/assignee (never inferred from starter/creator).
3. Affects workflow/internal state, no external system → **Medium** (parseable inspection
   cadence, utilities responsibility, tenant-intake facts).
4. Cosmetic/normalization → **Low** (status casing, `yes,n/a` → addressed).

Each queue item carries only the agent.md v1 fixed fields; conflicting values + sources + deep
links attach via source links / previews / `Activity` (no custom fields). Real values in evidence
stay inside the authenticated app (§6.1).

### 3.4 Source-precedence default table (SUGGESTION ONLY — discovery-ref §8 Q4; never auto-applied for High/Blocked)
| Field type | Default precedence (high → low) | Auto-apply? |
|---|---|---|
| Lease dates / renewal timing | Rentvine lease record > spreadsheet Tab 3 `Renewal Date` | No (timing = High) |
| Current rent | Rentvine > Tab 3 `Current Rent` | No (financial = High) |
| Market value | PMI Free Rental Analysis number > Zillow range (manual + approval) | No (pricing = High) |
| Property attributes — operational (inspection cadence, locks, appliances, carpet) | Rentvine building level > Tab 17 > Tab 18 | No (Medium → review) |
| Lease-contract terms (lawn/snow/trash + utilities, deposit type/amount, LLC entity) | Active lease doc / Rentvine building level > spreadsheet | No (legal = High) |
| Owner renewal decision | Owner email-of-record > spreadsheet Tab 3 | No (owner-facing = High) |
| Tenant intake (occupancy, contacts) | Google Form (latest) > spreadsheet | Review (Medium) |
| Address string (canonicalization) | Rentvine canonical address > spreadsheet strings | No (join-critical) |
| Status / workflow flags (yes/no/na, TRUE/FALSE) | Spreadsheet (it *is* the status surface) > inferred | Yes if Low after review |

**Unlisted field type → `Blocked` "no precedence rule"** → human decision; never guess.

### 3.5 The resolution loop (refined from discovery-ref §6.1)
1. **Flag (no writes):** one queue item per run/field (duplicates merge into one open item with
   history). Shows each value, its source, a **deep verification link**, severity, and the
   suggested winner with rationale (Dan's "where the team got it + how to verify it, in one
   place"). Owner-facing drafts blocked while any feeding fact is `Conflict`.
2. **Resolve — three paths (review fix #9):**
   - **pick a source**, or
   - **enter a corrected value** (pure A/B is insufficient — sometimes neither is right), or
   - **"flag is incorrect / the sheet is already right"** — closes the item, logs *why the
     deterministic rule misfired* (e.g. HOA dissolved so Rentvine's "HOA" is stale), and feeds the
     **false-positive rate** into the Phase-1 accuracy milestone (§5.3). This path is essential
     for the non-technical remote team: forcing "enter a corrected value equal to the existing
     value" when the connector is wrong erodes trust faster than a miss.
   A required plain-English reason is captured. High → Admin approver; users cannot approve their
   own proposed change unless Admin acting as approver. AI may *suggest* but cannot approve,
   close, execute, or override permission checks.
3. **Log (append-only, before any write):** decision → per-item `Activity` (who/why/source-or-
   value/prior values/timestamp/state transition; corrections add entries, never edit). A
   *proposed source correction* is generated — a suggested, approval-gated spreadsheet write (the
   exact §4 cell) and/or a non-executable "fix in Rentvine" flag.
4. **Correct-at-source:** the agreed value is queued for §4 write-back **performed by/after a
   human approval action visible in the sheet** (the `awaiting approval → approved` status the
   team already reads), never as a silent background reconciliation effect (review fix #10) —
   preserving discovery-ref §A's "never silently mutates their surface" at the UX level, not just
   the permission level.

---

## 4. Approval-Gated Write-Back (Phase 2 — only after Phase 1 is trusted)

The **first new write surface**; writes only the agreed value from a resolved conflict (or an
approved status update) back to the originating sheet cell. Writes nothing to Rentvine/Dotloop/Gmail.

### 4.1 Structural cell map (safety core; review fixes #5/#6)
```
WriteTarget {
  tab_fingerprint; tab_name(inferred);
  sheet_row_index;           // structural locator captured at read time — the row identity
  column_anchor; a1_cell;
  expected_prior_value;      // a SECONDARY compare-and-set check, NOT the row identity
}
```
- **Tab** by §2.4 content fingerprint, not position.
- **Row identity is the structural `sheet_row_index` captured at read** (re-resolved + re-validated
  immediately before write), **not** `expected_prior_value`. Many gate columns are low-cardinality
  (`yes`/blank/`TRUE`/`FALSE`), so two fuzzy-matched rows can share a prior value — relying on
  value-uniqueness for *location* would target the wrong row. `expected_prior_value` is only a
  compare-and-set guard on top of the structural locator.
- Anything other than an **exact unique** match on fingerprint + structural row + column → `Blocked`,
  never a guessed write. Tabs 4 & 7 are absent from the cell map by construction. Divider/scaffold
  rows are non-writable.

### 4.2 Approval state machine
```
Proposed -> Awaiting Approval -> Approved -> Writing -> Verifying -> Written
                 |                                          |
                 +-> Returned for Revision (reason)         +-> Blocked (verify/row-shift mismatch)
                 +-> Blocked (uncertainty / unmapped / ambiguous)
```
`Awaiting Approval` until the required approver (Admin for High) approves. **Preview before write**
shows `tab_name`, `a1_cell`, `expected_prior_value`, `new_value`, resolution reason, deep link —
constrained to *exactly* the declared fields via the integration-arch preview validator. One-action
**Approve** flips the originating queue item to unblocked, kicks it back to the team member, then
proceeds to `Writing`.

### 4.3 Re-anchor + read-after-write (the accuracy mechanism — and its honest limit, review fix #6)
1. **Re-resolve the structural row anchor immediately before write** (the sheet is
   *constantly edited* — discovery-ref §A — so rows can shift via insert/delete between approval
   and write). If the row anchor no longer resolves uniquely, or a neighboring-cell change alters
   the row's meaning → `Blocked` "row changed since approval"; create a fresh queue item linked to
   prior history (never silent reopen).
2. **Pre-write compare-and-set:** read the target cell; assert `== expected_prior_value`; mismatch
   → `Blocked`.
3. **Write** the single cell deterministically.
4. **Read-after-write:** re-read; assert `== new_value` → `Written`; mismatch → `Blocked`
   failed-automation, preserve attempted payload/error/target/timestamp; never blind-retry.
- **Atomicity:** one cell per target; no multi-cell batch that could partially apply. `Blocked` is
  always preferred over a partial/wrong write.
- **Honest scope:** this is a strong compare-and-set with structural re-anchoring, not an absolute
  guarantee against all concurrent edits on an unlockable Sheet; the residual row-shift race is
  mitigated by step 1 and bounded by single-cell atomicity, and is documented rather than claimed
  away.

### 4.4 Rollback
Every target carries a rollback note before approval. Sheets has no universal revert, so rollback =
re-write the stored `expected_prior_value` through the same verified path (correction-style
rollback). The original is preserved in append-only `Activity`.

---

## 5. Architecture Fit & Phasing

### 5.1 Where the connector sits
Not a new system of record — a **read source + reconciliation feeder** into surfaces the product
already owns. The **KB owns the single workflow-run page per renewal run**; sheet facts render
there as imported facts with `source`/`timestamp`/`confidence`. No competing dashboard — the sheet
stays the team's surface; the KB run page is the augmentation layer (the architectural answer to
discovery-ref §A adoption constraint). In the integration-arch tool-role map, **Sheets = exception
/ control plane, not authoritative**; **Rentvine stays read-authoritative.** The connector lives in
the Action Registry as **read-only** entries, not in any write chain.

### 5.2 Action Registry entries (metadata catalog only; registry executes nothing)
All start `production_allowed: false`.

| `key` | `expected_action` | `evidence_status` | `readiness` (start) | Notes |
|---|---|---|---|---|
| `google_sheets.renewal_checklist.read` | Read mapped tabs/columns (excl. 4 & 7) | `Documented` (Sheets read API + semantic map) | `Needs Connection` | The read connector. |
| `google_sheets.renewal_checklist.reconcile` | Deterministic field-reconciliation across sheet + Rentvine + form/building level | `Documented` (rules derive from map + §6.1) | `Planned` → `Ready for Test` | Produces flags, not writes. |
| `google_sheets.renewal_checklist.writeback` | Approval-gated, re-anchored + read-after-write single-cell write | **`Documented`** (Sheets write API is documented) | **`Planned`** (Phase 2 only) | The one new write surface. **Gated by `readiness: Planned` + the Phase-1-trust milestone + an approved per-action spec**, NOT by `Vendor-Confirmation-Required` (review fix #12: there is no vendor to confirm Sheets writes; mis-coding it `Vendor-Confirmation-Required` would permanently block the `Documented`-requiring production gate). |

Production gate inherited unchanged: `production_allowed = true` only when `readiness = Approved for
Execution` **and** `evidence_status = Documented` with non-empty `documented_evidence`. Two
registry refinements: (1) **tab-scoped permission** — the read entry's `required_permissions` names
the allowed tab set and lists tabs 4 & 7 as **denied at the connector boundary** (hard-exclusion is
an architectural property, not a runtime toggle); (2) **cell-addressed `preview_payload_schema`**
for write-back: `{ tab, row_key, column, before_value, after_value, source_of_value,
verification_link }`.

### 5.3 Phasing with trust milestones (trust gates each phase, not calendar time)
- **Phase 0 — Decompose & map (DONE):** the semantic map exists (prerequisite, discovery-ref §6.2).
- **Phase 1 — Read + reconcile + flag (NO WRITES):** read + reconcile reach `Ready for Test`;
  write-back stays `Planned`. **Exit milestone (gates write-back):** the connector demonstrably
  **catches what the team missed** with flags Dan reviews and finds **accurate** over a real
  sample, **zero false all-clear** on the discovery-ref §4 inherited-tenant failure modes, and an
  acceptably-low **false-positive rate** (fed by the §3.5 "flag is wrong" path).
- **Phase 2 — Approval-gated write-back (only after Phase 1 trusted):** still
  `production_allowed: false` until the full gate clears — requires an approved per-action spec, a
  before/after preview, a rollback note, ≥1 successful test run, and per-run human approval on top
  of action-type approval. **Exit milestone:** a sustained record of correct, re-anchored,
  read-after-write-verified writes with no wrong writes.
- **Phase 3 — Eventual backing DB (NOT now):** real DB + automatic Rentvine pull + team manages via
  the app — only after 1–2 are stable. **Replacing the sheet is the last milestone, never the first.**

### 5.4 What NOT to build yet
No executable SoR writes; "fix in Rentvine" is a flag only. No autonomous send (owner/tenant emails
are drafts). No spreadsheet write in Phase 1. No reading/echoing tabs 4 & 7. No competing dashboard.
No auto-applied High/Blocked reconciliation (precedence is a suggestion; §3.4 defaults are
themselves `[OPEN]`). No write without structural re-anchor + read-after-write.

---

## 6. Governance & Adoption

### 6.1 Data governance (AGENTS.md, applied 2026-06-20; discovery-ref §5)
- **May:** read the sheet (excl. 4 & 7) and use its vetted data to **build and validate the
  deterministic rules**; drive **read-only** follow-up Rentvine/Dotloop queries.
- **May NOT:** emit that data into git, user-facing output, or model output **without human
  approval**; nor act on it autonomously.
- **PII display vs emit carve-out (review fix #3):** "never emitted" means **never leaves the
  `pmikcmetro.com` boundary / never enters git, model output, or owner-facing drafts.** In-app
  display of `[PII]` (e.g. the two tenant names for an ambiguous-join disambiguation, or rent in a
  conflict card) **to an authenticated approver is allowed and audited** — otherwise the
  disambiguation UX (§3.5) would contradict the rule.
- **`Activity` audit export (review fix #8):** the append-only `Activity` log may store real values
  *inside the boundary*, but **audit export must redact/withhold `[PII]` fields or require
  approval** — closing the one sanctioned feature (agent.md "reasonable export") that could
  otherwise emit PII.
- Boundary stays inside `pmikcmetro.com` via the `josiah@pmikcmetro.com` Drive connector (never the
  personal account; identities do not cascade). Only sanitized/synthetic artifacts in git.

### 6.2 Adoption (non-technical, remote Philippines team — trust is the whole game)
1. A wrong write destroys the source of truth → Phase-1 no-writes; Phase-2 structural re-anchor +
   read-after-write + approval + `Blocked`-on-uncertainty.
2. A buggy/replacing dashboard gets abandoned → augment-first; the sheet stays the team's surface.
3. Opaque flags erode trust → every flag carries plain-English action + risk + deep verification
   links, written for a non-technical reader.
4. False positives are as corrosive as misses → `Needs Review` vs `Conflict` split, the §3.5 "flag
   is wrong / sheet is right" path, and a Phase-1 accuracy milestone Dan must find accurate.
5. Header/data chaos → content-keyed matching; surface-don't-guess.
6. Approval friction loses the remote workflow → one-action approve that unblocks the team member
   and writes the `awaiting → approved` status they already read.

### 6.3 Test corpus (governance-clean)
Fixtures reproduce each documented pathology (mixed dates, `yes,n/a`, `FALSE` header,
email-in-date-column, off-by-one Owner-Onboarding header, divider rows, two-tab cadence, lawn-care
conflict, low-cardinality duplicate prior values for the §4.1 row-identity test). Real client values
may be **local** test input under governance, but **fixtures committed to git must be
synthetic/sanitized.**

---

## 7. Open Questions / Decisions Needed
1. **Confirm the §3.4 source-precedence defaults** with Dan (discovery-ref §8 Q4) — shipped as
   suggestions pending confirmation.
2. **Secondary approver(s) + admin-unavailable rule** (discovery-ref §8 Q3).
3. **Rentvine renewal/field-write capability** stays vendor-confirmation-required; "fix in
   Rentvine" remains a non-executable flag.
4. **Phase-1-trusted threshold** — explicit Dan-visible accept criteria (accurate-flag record, zero
   false all-clear, acceptable false-positive rate) authorizing Phase 2.
5. **Canonical address/name normalization rules** to lift fuzzy-join confidence.
6. **Staff lexicon** for embedded-assignee extraction (partially known: Leah, observed names).
7. **Current approved owner/tenant/build-out templates** (~2026-06-23) — out of scope for the
   connector (they consume the field model), gate the §6.3 auto-draft work downstream.

---

## Adversarial review — corrections applied
This spec is the synthesis of three design lenses after an adversarial review (verdict: **sound —
needs fixes, no gate violations**). Fixes folded in: #1 over-redaction census; #2 honest emit-tripwire
scope; #3 PII display-vs-emit carve-out; #4 "operating Sheets" gate framing (§1.2); #5/#6 structural
row locator + concurrent-edit/row-shift honesty (§4.1, §4.3); #7 inspection-cadence severity made
consistent (Medium/operational; §3.2–3.4); #8 `Activity` export PII redaction; #9 "flag is wrong /
sheet is right" resolution path (§3.5); #10 write-is-a-visible-human-action; #11 Tab 17 `Lease Start`
dropped as a lease-end source; #12 write-back `evidence_status: Documented` (not
`Vendor-Confirmation-Required`, which would permanently block the gate).
