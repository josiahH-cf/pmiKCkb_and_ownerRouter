<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: dashboard-assistant-v1 -->

# S91 — Canonical lease-renewal assistant query adapter

> Status: Specified and not implemented. Production has S78's canonical role-consistent live renewal
> worklist and six-step projection. S82's enriched table, one causal-blocker projection, and trusted
> blocker/source destination manifest are specified but not implemented.

**Goal.**

Answer bounded questions such as `Which leases renew next month?` and `Which renewals are blocked?`
from the same complete, current, role-scoped renewal projection as the canonical renewal desk, with
deterministic date interpretation, exact lease/table links, and explicit partial/unavailable truth.

**Current state / intended end state.**

The live renewal page currently orchestrates progress, notice policy, workflow-linked Gmail state,
dismissed follow-up keys, RentVine, and the operating Sheet before calling `loadLiveRenewalDesk`.
The current Dashboard instead performs an abbreviated 120-day load without progress or communication
inputs. Ask queries neither. S78 already provides stable lease ids, date/month/owner/tenant/workflow/
waiting/conflict query keys, `readComplete`, data currency, deterministic ordering, and workspace
links. It does not expose S82's future unified overall status and every causal blocker.

The intended adapter extracts the canonical page orchestration into one reusable server read service,
then applies the existing desk query/projection contracts. The assistant never reads RentVine or the
Sheet through a second ad hoc client, never treats a partial export as the portfolio, and never asks
the model to calculate a date window or decide what `blocked` means. Exact operational rows and links
are complete without model narration.

**Actors and entry conditions.**

- A managed user must satisfy the existing Renewals Space and `read_workspace` capability guards.
  Authentication and Space filtering occur before a live source read or row construction.
- RentVine remains the authoritative lease source, including the contractual lease end date and
  property-owner identity. The operating renewal Sheet remains a read source; no write is added.
- `renewal.window` can use current S78 fields. A complete `renewal.blocked` result consumes S82's
  exact causal-blocker projection when implemented; its absence is an explicit partial capability.
- A source result is complete only when every source required by the selected query succeeded, the
  RentVine paged read is complete, and current currency policy permits the claim.
- An actor without Renewals access receives the ordinary non-enumerating denial/S83 handoff contract;
  no lease count, label, owner, tenant, id, or existence enters the response.

**What it is / how it functions.**

### Canonical read service

Extract a server-only `renewal assistant source` from the existing canonical desk-page orchestration.
It must obtain, through the same owning services and actor:

- current renewal progress by stable lease id;
- current notice-rule snapshot;
- workflow-linked renewal communication state and links, with `unreadable` preserved;
- dismissed renewal follow-up attention keys;
- one canonical `loadLiveRenewalDesk` result over the requested bounded window; and
- S82's enriched overall-status/blocker/link projection when that contract is implemented.

The live desk page and assistant adapter consume the same orchestration result. Remove neither the
desk's route guard nor its independent render behavior. Request-level memoization may prevent
duplicate reads within one assistant request. The assistant may consume a cache entry only when the
requested read returns it synchronously without starting detached work. It must not enter the current
stale-while-revalidate branch because that branch starts a refresh without S89's `AbortSignal`; on a
stale entry the assistant uses the owning abortable direct-read path under its request deadline, while
the desk may retain its existing bounded refresh behavior. No cross-user row cache or unscoped
service-account result may be introduced. Provider failures return typed states; raw errors,
credentials, and provider payloads do not cross the boundary.

### Closed renewal intents and date semantics

S88 registers two renewal intents:

| Intent            | Supported filters                                                                        | Exact interpretation                                                                                                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `renewal.window`  | one required date form below, plus zero or one terminal S88 quoted owner/tenant modifier | Calendar boundaries are computed server-side in `America/Chicago`. `next month` is the first through last day of the next calendar month. A month without a year is its next nonpast occurrence. |
| `renewal.blocked` | zero or one date form below, plus zero or one terminal S88 quoted owner/tenant modifier  | Uses only S82's current causal-blocker projection. Conflict, missing/needs-verification, and other causes retain their exact S82 labels and destinations; stage age is not a blocker.            |

The complete V1 date grammar is: exact `this month`; exact `next month`; an English full month name
with optional four-digit year from 2000 through 2100; one valid ISO `YYYY-MM-DD` date; or exact
`next N days` with N from 1 through 120. Parsing is case-insensitive after S88 normalization. A valid
ISO date resolves to that one inclusive local calendar date; every accepted form is echoed as a
resolved inclusive date range and time zone in the S88 receipt. Invalid dates, numeric/slashed dates,
abbreviated months, weekdays, relative phrases outside the list, or extra date tokens ask for
correction rather than guessing locale or meaning. `October` in October resolves to the current
October; after October it resolves to October of the next year. `next 30 days` includes the resolved
local current date and the following 29 local calendar dates. The adapter never treats the current
S78 default first-of-month-plus-120-day desk window as the meaning of `next month`.

A `renewal.blocked` request with no explicit date form uses that existing canonical desk source
window exactly: `from` is the first day of the server's current `America/Chicago` month and `through`
is the server business date plus 120 calendar days, matching `buildRenewalDeskWindow`. Its owning desk
handoff omits only that default date range, which can exceed S82's explicit 120-day URL-filter limit;
it still emits the exact blocker/conflict filter required below. This default date window is shown in
the applied-filter receipt and is not called `all renewals`.

Property owner is not an internal staff assignee. Only S88's exact terminal syntax `for owner
"<label>"` or `for tenant "<label>"` applies a customer-label filter; unquoted labels clarify before
this adapter runs. The adapter compares the literal with the exact normalized property-owner or
tenant label rule already owned by the desk query and only against actor-authorized canonical
rows, returns all exact-label matches, and never uses substring/fuzzy matching or converts the label
to a person/record identity. A request for `my renewals` is unsupported until an authoritative staff-
assignment field/service is introduced; the adapter must not match the signed-in user's name to a
RentVine owner.

### Blocked versus needs-attention compatibility

Current S78 can deterministically list leases with source conflicts, due follow-up attention, and
early-stage next actions. Those are `Needs attention`; they are not all necessarily `Blocked`.
Before S82's causal-blocker projection exists, `renewal.blocked` returns `partial` with exact copy:
`Complete blocked status is not available from the current renewal projection.` It returns the
`renewal_known_source_conflicts` group described below, whose `matched_count` is the exact number of
current rows with `sourceConflictCount > 0` and may truthfully be zero. This is a usable aggregate over
the explicitly labelled known-conflict subset, never the total number of blocked renewals. It may link
to the canonical renewal desk, but it cannot relabel stage-zero/owner-decision work as blocked or
claim the subset is complete.

After S82 exists, the adapter consumes its blocker/status/link fields byte-for-byte and removes the
compatibility warning only when the projection reports complete coverage. The adapter does not
reimplement the six-step evidence engine, current-rent reconciliation, verification, or blocker
ordering.

### Completeness and degradation

The result maps source truth as follows:

- `complete`: required reads succeeded, RentVine `readComplete` is true, the data currency is not
  expired for the query, and no required S82/communication/policy source is unavailable. An exact
  filter matching zero leases is `complete` with `matched_count=0`, not a separate empty state;
- `partial`: the RentVine export hit its page cap, a required secondary source is unreadable, S82
  blocker coverage is unavailable, or the returned-row cap truncates a larger match;
- `unavailable`: live configuration/account/read status prevents a trustworthy result, or expired
  currency makes the requested present-tense claim unsafe; and
- `not_applicable`: a registered renewal adapter does not apply after a non-sensitive deterministic
  check; it never represents zero results, denial, or source failure.

Existing role/Space refusal occurs before the adapter and maps to S88 terminal `denied` with no
protected renewal read. A request that depends on a field with no authoritative mapping—including
staff assignment or arbitrary sale data—maps to S88 terminal `unsupported`; no adapter runs.

Communication unreadability makes a follow-up/contact question partial but does not make a simple
lease-end-date window unavailable when the complete RentVine end-date source succeeded. Sheet or S82
blocker unavailability makes blocker/current-rent verification questions partial/unavailable as
applicable. The evidence envelope lists each required source and its own outcome rather than reducing
all failures to one generic error.

### Result records and destinations

Order matches the existing desk query comparator, with stable lease id as the final tie-breaker.
Return at most 50 rows under S88's V1 adapter ceiling; include authoritative total-match count only
when the source is complete, plus returned count and truncation. A 51-or-more match is `partial`,
shows the safest canonical desk destination described below, and never implies the 50 visible rows
are all matches.

The closed S88 manifest is:

```text
group_key:
  "renewal_window" | "renewal_blocked" | "renewal_known_source_conflicts"

item_kind: "renewal_lease"

RenewalLeaseAssistantDataV1 {
  schema_version: "assistant-renewal-lease-data-v1"
  source_label: trimmed NFC source-owned address label, 1..240 code points
  renewal_date_iso: YYYY-MM-DD | null
  stage_id: "verify-renewal" | "owner-decision" | "tenant-decision" |
            "document-packet" | "signatures-follow-up" |
            "compliance-close" | null
  status_key: "needs_verification" | "blocked" | "complete" | "waiting" |
              "ready" | "needs_review" | "current_stage" | null
  status_label: trimmed NFC source-owned label, 1..120 code points | null
  blocker_coverage: "complete" | "known_source_conflicts_only" | "not_requested"
  blocker_count: nonnegative integer | null
  blocker_labels: 0..8 distinct source-owned labels, each 1..160 code points
  blockers_truncated: boolean
  next_action_label: trimmed NFC source-owned label, 1..240 code points | null
  owner_labels: 0..8 exact authorized labels, each 1..160 code points
  tenant_labels: 0..8 exact authorized labels, each 1..160 code points
  party_labels_truncated: boolean
}
```

`source_label` is the current trimmed `addressLabel`; only when that is absent may the current trimmed
`propertyNameLabel` be used. If neither exists, that row is not serializable and the group cannot be
complete. `status_key` uses S82's exact overall-status key when present; before S82, an evaluated S78
stage uses `current_stage` and its exact stage label. `blocker_coverage=complete` is legal only with
S82's current causal-blocker projection. The compatibility group uses
`known_source_conflicts_only`; a window result that did not ask for blockers uses `not_requested`.
`blocker_count` is the exact count in the declared coverage, never a guess at total blockers.

Owner/tenant arrays are populated only when the corresponding quoted filter was requested or two
otherwise identical visible rows require disambiguation; they are empty otherwise. The producer
first retains at most the first eight values in owning canonical order and sets the corresponding
`*_truncated` flag when a source list is longer. It then applies this exact byte compaction before the
S88 envelope can observe the item:

1. serialize only `RenewalLeaseAssistantDataV1` with UTF-8 `JSON.stringify` and the flags reflecting
   every count truncation already performed;
2. when the value exceeds 4,096 bytes, remove the last label from the non-requested party array first,
   then the requested party array, then `blocker_labels`, reserializing after each removal. For an
   owner modifier the array order is tenant, owner, blockers; for a tenant modifier it is owner,
   tenant, blockers; with no party modifier it is tenant, owner, blockers;
3. set `party_labels_truncated=true` on the first owner/tenant removal and
   `blockers_truncated=true` on the first blocker removal. Continue until the serialization is at most
   4,096 bytes. The fixed scalar maxima with all three arrays empty are required by a boundary fixture
   to fit, so the algorithm never clips a label, splits a Unicode code point, drops a scalar, or emits
   an over-limit item; and
4. any source-count or byte-driven removal makes the group `partial`, adds exactly
   `renewal.item_details_truncated`, retains the item's workspace route and group desk recovery, and
   leaves `blocker_count` as the exact count for the declared coverage rather than the visible-label
   count.

A consumer validates both the field schema and final 4-KiB byte bound. An un-compacted combination
that independently fits the field maxima but exceeds the byte ceiling is not a legal producer output.

The public `applied_filters` registry is exact. Every S91 group emits these records in this order:

1. `from`, label `From`, exact resolved ISO date;
2. `through`, label `Through`, exact resolved ISO date;
3. `time_zone`, label `Time zone`, exact enum value `America/Chicago`;
4. for a post-S82 `renewal.blocked` result only, `blocked_only`, label `Blocked only`, boolean `true`;
5. for the pre-S82 compatibility group only, `blocker_coverage`, label `Blocker coverage`, enum value
   `known_source_conflicts_only`;
6. when an owner/tenant modifier was applied, `party_filter_applied`, label `Party filter`, boolean
   `true`, then `party_kind`, label `Party type`, enum value `owner` or `tenant`.

Steps 4 and 5 are mutually exclusive. A window result omits both. A query without a customer
modifier omits steps 6. The public receipt never carries the raw/displayed party label, opaque party
key, source id, question text, or URL.

S91 may emit only these S88 notices, in table order after exact-code de-duplication. Each code has one
kind, exact message, and recovery requirement; every required recovery is the group's canonical
`renewal_desk` route. There are no free-text or provider-error variants.

| Code                                      | Kind          | Exact message                                                                           | Recovery              | Exact trigger                                                                                                  |
| ----------------------------------------- | ------------- | --------------------------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------- |
| `renewal.blocker_coverage_partial`        | `partial`     | `Complete blocked status is not available from the current renewal projection.`         | renewal desk required | pre-S82 `renewal_known_source_conflicts`, always                                                               |
| `renewal.source_partial`                  | `partial`     | `Some renewal sources are unavailable, so this list may be incomplete.`                 | renewal desk required | at least one required source is unavailable while a trustworthy usable subset remains                          |
| `renewal.source_unavailable`              | `unavailable` | `Renewal data is temporarily unavailable.`                                              | renewal desk required | a non-currency configuration, account, or read failure leaves no trustworthy required source result            |
| `renewal.currency_expired`                | `unavailable` | `Renewal data is too old to answer this request.`                                       | renewal desk required | otherwise trustworthy required reads exist, but currency policy alone rejects the result                       |
| `renewal.rows_truncated`                  | `truncated`   | `More renewals match. Open Renewals to see the full filtered list.`                     | renewal desk required | a trustworthy match exceeds the 50-row return cap                                                              |
| `renewal.item_details_truncated`          | `truncated`   | `Some lease details are summarized. Open Renewals to review the complete current view.` | renewal desk required | at least one returned item loses a label to the source cardinality caps or the 4-KiB byte-compaction algorithm |
| `renewal.customer_filter_key_unavailable` | `information` | `Open Renewals and choose the owner or tenant filter there.`                            | renewal desk required | the assistant applied the exact party match but S82 cannot issue a current opaque desk-filter key              |

A complete zero-match result has no partial/unavailable/truncated notice. An unknown code, wrong
kind/copy, missing or extra recovery, duplicate, or notice whose trigger is false fails the envelope.
`renewal.source_unavailable` takes precedence when a non-currency required-source failure is present;
`renewal.currency_expired` is emitted only for the currency-only unavailable case, so the pair never
co-occurs for one group.
The group-label registry is exact: `renewal_window` has label `Renewals in requested window`,
`renewal_blocked` has label `Blocked renewals`, and `renewal_known_source_conflicts` has label
`Known source conflicts`. The compatibility group always carries
`renewal.blocker_coverage_partial`. A producer or consumer that substitutes request text, a
date-derived label, or any other label fails contract validation.

Every item has exactly one `renewal_lease_workspace` route ref. A complete S82 blocked item may add
zero through eight ordered `renewal_internal_blocker` route refs that S82 resolves to authenticated
same-origin phase/evidence targets; an external provider/Sheet URL is not an S88 route and remains
behind the guarded owning workspace. Every group has exactly one `renewal_desk` route ref. Public
item data contains no stable lease or provider id. The server-built per-lease route may contain only
the canonical percent-encoded opaque lease id in its path because that exact current route requires
it; this exact authenticated same-origin workspace/blocker path segment is the sole provider-derived
identifier exception in an S91 public route and is never duplicated into item data, labels, filters,
notices, or model input. The v2 desk query may contain only S82's derived opaque `ownerKey` or
`tenantKey`. No route contains any other provider id, displayed owner/tenant value, raw customer
filter, question, or action authority. The model receives only S89 result-local ordinal references,
not record ids, route refs, opaque party keys, customer labels, or URLs.

S91 registers exactly this closed S88 route table; labels are literal server copy and never derive
from a lease, party, blocker label, question, or model value:

| `destination_key`          | Exact label          | Typed builder / eligibility                                                                                                                           |
| -------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `renewal_lease_workspace`  | `Open lease renewal` | S82 canonical `/lease-renewal/live/desk/lease/{encodedLeaseId}` from the current authorized private row binding                                       |
| `renewal_internal_blocker` | `Open blocking step` | one authenticated same-origin phase/evidence route returned by S82's closed destination manifest for the current causal blocker; no fallback guessing |
| `renewal_desk`             | `Open Renewals`      | S82 canonical `/lease-renewal/live/desk` plus only the exact group-specific v2 state below                                                            |

Every dynamic id passes its owning S82 validator and one-component encoding. Registry parity rejects
an unknown key, altered label, stored/raw href, unsupported query key, external target, or blocker
whose destination manifest cannot resolve; an unresolved blocker stays visible as text and contributes
no route ref.

The per-lease destination is the canonical live workspace route for that stable id. The all-results
destination is produced only by S82's v2 serializer under this closed group mapping:

- `renewal_window` emits exact `from` and `through` plus the applicable `ownerKey` or `tenantKey`; it
  emits no blocker/status/conflict filter;
- post-S82 `renewal_blocked` emits `blocked=blocked`, the applicable party key, and exact `from` and
  `through` only when the user supplied a date form. Its date-less canonical-desk window omits the date
  pair because the default desk source window is identical, but it never omits `blocked=blocked`;
- pre-S82 `renewal_known_source_conflicts` emits `conflicts=with`, the applicable party key, and exact
  `from` and `through` only when the user supplied a date form. Its date-less canonical-desk window
  omits the date pair but never omits `conflicts=with`; and
- every nondefault mapping emits `v=2`; S82 alone owns canonical parameter order and default omission.

A displayed party label is never placed in an href, browser history, or `deskView`. If S82's party-key
configuration is unavailable, omit only that customer filter and emit
`renewal.customer_filter_key_unavailable`; date and exact blocker/conflict state remain intact.
Individual lease workspace links remain exact. S93 opens one deliberately activated result in a new tab with safe attributes.
No bulk popup or automatic tab opening exists. Every destination reruns its current guard and source
checks.

### Private renewal action binding for S94

An individually current row may also produce the one closed, request-scoped private binding consumed
by S94. The S91 producer places the binding beside the validated adapter item; S88 creates the public
query-local `item_ref`, stamps that ref onto the private binding, and strips the binding before the
public envelope, observer, model, telemetry, or stream sees the item. The resulting server-only type
is:

```text
AssistantRenewalActionBindingV1 {
  schema_version: "assistant-renewal-action-binding-v1"
  item_ref: exact query-local S88 renewal item ref
  source_type: "renewal_lease"
  source_id: exact opaque canonical RentVine lease id
  action_source_version: "renewal-term-v1:" + base64url SHA-256 without padding
  space_id: "lease-renewals"
  preview_fingerprint_input: {
    schema_version: "assistant-renewal-preview-input-v1"
    source_label: exact public source_label
    renewal_date_iso: exact public non-null renewal_date_iso
    stage_id: exact public stage_id
    status_key: exact public status_key
    status_label: exact public status_label
    blocker_coverage: exact public blocker_coverage
    blocker_count: exact public blocker_count
    blocker_labels: exact public blocker_labels
    blockers_truncated: exact public blockers_truncated
    next_action_label: exact public next_action_label
  }
}
```

The action-version digest input is UTF-8 of ECMAScript `JSON.stringify` over an object inserted in
this exact order and containing no other keys or whitespace:
`{ "lease_id": <exact canonical RentVine lease id>, "end_date": <YYYY-MM-DD> }`. Both values are JSON
strings and use standard JSON escaping. Read/observation time, actor, status, progress, blocker,
labels, Sheet state, and model text are excluded, so rereading one lease term is stable and a changed
authoritative end date creates a new version.

The producer emits a binding only when the actor may see the row, the canonical RentVine lease id and
end date are present and nonconflicted, source currency is not expired, every displayed preview field
has its declared truthful coverage, the public item validates, and no item-detail truncation can hide
a preview fact. Aggregate result `partial` does not by itself suppress a binding when the missing
material is explicitly outside that row and its preview. A conflicted/missing term, unknown preview
coverage, malformed/private oversize value, or unavailable exact row yields no binding; it never
downgrades the read-only public result or substitutes a route/item id as authority. At most 50
bindings can enter S88's private carrier, in canonical public-item order; S94 inspects at most the
first 20 and owns all task lookup, token, Review, Confirm, idempotency, and readback behavior.

**In scope / out of scope.**

In scope: canonical orchestration extraction; upcoming/month/date intent; exact Kansas City calendar
semantics; S78 query reuse; S82 blocker compatibility/integration; completeness/currency/source
states; bounded ordered rows; minimized renewal facts; canonical lease/table/evidence links; role/
Space protection; exact closed S88 group/item/data/notice manifest; private stable renewal-action
binding for S94; model-independent fallback; adversarial source/link/date tests.

Out of scope: a second blocker/status algorithm; staff lease assignment; sale data; generalized
RentVine query; direct provider URLs guessed from ids; RentCast search; offered-rent decision; draft
creation or send; workflow progress write; RentVine/Sheet write; automatic refresh/background
monitor/reminder; bulk tab opening; S82 table/workspace implementation; S93 presentation; S94 actions.

**Open questions & assumptions.**

- Decision: `blocked` is S82's exact causal blocker state, not a synonym for every lease needing
  attention. Until S82 is implemented, the adapter labels only known source conflicts and reports
  blocker coverage partial.
- Decision: all relative date phrases use `America/Chicago`; the response shows the resolved inclusive
  range so a user can verify the interpretation.
- Decision: RentVine owner means property owner. `My renewals` is not supported without a verified
  internal staff-assignment source.
- Decision: result links open one at a time in a new tab; no `open all` popup action is added.
- Assumption: the stable S78 live desk and workspace routes remain the canonical destinations while
  S82 changes their presentation rather than route identity.

**Cross-product impacts.**

Canonical live renewal page orchestration; S78 desk model/query/link behavior; S72 process evidence;
S75 follow-up/communication truth; S82 enriched table/blocker destinations; S88 query/link envelope;
S89 privacy/cost controls; S92 narration; S93 result UI; S94 action projection; S95 anticipated/
live-panel removal. No provider, action-key, role, production-data, or source-write change.

**Authority and evidence map.**

| Input                                                               | Classification                   | Use and limitation                                                                                                                                              |
| ------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Router, `docs/facts.md`, S72/S75/S78 code/tests and live-desk route | Authority / implementation truth | Establish canonical RentVine/Sheet reads, stable ids, six-step/query/currency/completeness behavior, and closed write/send gates.                               |
| S82                                                                 | Specified dependency             | Owns enriched table rows, overall status, every causal blocker, persistent filters, and validated blocker/evidence destinations; not current production.        |
| S88-S90 and S92-S95                                                 | Active bundle contracts          | Own generic query envelope/limits, telemetry, adjacent adapters, narration, UI, actions, and final Dashboard placement without duplicating renewal logic.       |
| Dashboard AI integration notes                                      | Intent evidence                  | Require next-month and blocked-renewal questions with clickable results; do not authorize invented assignments, bulk tabs, provider writes, or background work. |
| Future internal lease-assignment source                             | Missing dependency               | Required before `my renewals` can be mapped to a staff actor.                                                                                                   |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S91-1** — One actor-scoped server orchestration supplies the canonical desk and assistant,
  including progress, policy, workflow-linked communication, dismissed attention, RentVine, Sheet,
  and S82 compatibility outcomes. Parity tests fail if either consumer omits a required input.
- **ARCH-S91-2** — A pure date/filter resolver owns `this month`, `next month`, month/year, and bounded
  rolling-window semantics in `America/Chicago`; injected-clock tests fail on any model/client date
  computation or unreported range.
- **ARCH-S91-3** — `renewal.blocked` consumes S82 causal blocker truth or returns the exact partial
  compatibility state. Inventory checks reject a second blocker algorithm or stage-age inference.
- **ARCH-S91-4** — Completeness derives only from explicit source outcome, `readComplete`, currency,
  S82 compatibility, and returned-row truncation; per-source failure can never become valid empty.
- **ARCH-S91-5** — Rows are minimized, stably ordered, actor-filtered, capped, and linked only through
  S88 route builders and the current desk serializer. Model output cannot add a field, lease, link,
  destination, count, or status.
- **ARCH-S91-6** — One exact private action-binding producer derives the stable renewal-term version
  only from the current canonical lease id/end date, binds it to the S88-generated item ref, and
  exposes it only through S88's registered S94 carrier. Public-schema, observer, model, log, and stream
  scans fail on any private field or authority leak.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S91-1** — `Which leases renew next month?` shows the exact resolved next-calendar-month range,
  ordered matching leases, complete/partial truth, and one safe link per lease plus the filtered desk.
- **BEH-S91-2** — `Which renewals are blocked?` shows only S82 causal blockers when available; before
  then it plainly reports partial coverage and never relabels all attention/early-stage work.
- **BEH-S91-3** — A partial, stale, expired, missing, wrong-account, or failed source produces the
  mapped recovery and never a false zero/all-clear or fabricated record.
- **BEH-S91-4** — Owner/tenant filters use exact authorized source labels, while `my renewals` and unknown
  dimensions are refused rather than inferred.
- **BEH-S91-5** — Every visible row and link remains useful when narration fails, discloses no
  unauthorized lease, and opening it performs no write or workflow transition.
- **BEH-S91-6** — An eligible current row can later offer S94's inert `Create my task` candidate using
  a stable renewal-term binding; a missing/conflicted term or incomplete preview fact offers no
  candidate and never weakens the read-only answer.

**Human litmus outcome.**

### Open next month's renewals from one answer

**If this was built correctly:** A Renewals user asks for next month's leases, sees the exact date
range and source coverage, then opens any listed lease or the matching renewal table in a new tab.
The same filters and ordering match the canonical renewal desk.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

### Trust a blocked-renewal answer

**If this was built correctly:** A user sees only current causal blockers with the next exact place to
act. If blocker coverage or a source is unavailable, the answer says so and never substitutes a
broader `needs attention` list while calling it complete.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

### Recover from incomplete live data

**If this was built correctly:** A partial portfolio read, expired snapshot, or unreadable secondary
source is visibly different from zero matching leases and offers the same safe renewal/connection
recovery the owning surface supports.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

**Requirement-to-outcome traceability.**

| Requirement                                 | Architecture outcome | Behavior outcome | Human litmus                   | Deterministic evidence / falsification                                                                                                                          |
| ------------------------------------------- | -------------------- | ---------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canonical source parity                     | `ARCH-S91-1/4`       | `BEH-S91-1/2/3`  | All                            | Page/adapter orchestration parity, injected source-outcome matrix, and no-second-direct-provider-read spies.                                                    |
| Exact date-window interpretation            | `ARCH-S91-2/5`       | `BEH-S91-1/4`    | Open next month's renewals     | Clock/time-zone/DST/month-year/invalid-date fixtures compared with serialized desk filters and ordering.                                                        |
| Exact blocked semantics and S82 integration | `ARCH-S91-3/4/5`     | `BEH-S91-2/3`    | Trust a blocked-renewal answer | S82 present/absent, conflict-only, verification, early-stage-not-blocked, and blocker-link parity tests.                                                        |
| Complete/partial/unavailable truth          | `ARCH-S91-1/4`       | `BEH-S91-1/3/5`  | Recover from incomplete data   | Complete/partial-page/stale/expired/unreadable/unconfigured/account-mismatch/read-error fixtures reject false empty.                                            |
| Authorized minimized clickable results      | `ARCH-S91-5`         | `BEH-S91-1/4/5`  | Open next month's renewals     | Role/Space/filter/cap/link/new-tab/model-injection/provider-write sentinels and destination reauthorization.                                                    |
| Stable private renewal action binding       | `ARCH-S91-6`         | `BEH-S91-6`      | Open next month's renewals     | Canonical-hash, reread stability, changed-term, missing/conflicted field, actor binding, truncation, carrier isolation, and public/model/log/stream leak tests. |

**Preservation set.**

Keep S78 canonical worklist, current-month-plus-120 default desk behavior, exact URL query parsing/
serialization, stable ordering, data currency and partial-export truth, retention, source conflict,
six-step progress, S75 follow-up, role/Space guards, S82 future table/filter/blocker ownership,
workspace/evidence links, current-rent and offer separation, unsent-draft/human-send boundaries,
RentVine/operating-Sheet read-only posture, Action Registry gates, and existing cache/allowance rules.

**Adversarial acceptance checks.**

- **AC-S91-1** — `ARCH-S91-1/4` injects every progress/policy/communication/dismissal/RentVine/Sheet
  success and failure combination; any desk/adapter projection drift, second direct provider read,
  hidden failure, false zero, or complete claim on a capped/expired source fails.
- **AC-S91-2** — `ARCH-S91-2` and `BEH-S91-1/4` cover end-of-month/year, leap year, daylight-saving,
  explicit/past month without year, next 30 days, invalid date, and server/client clock disagreement;
  the displayed range and desk query must be exact.
- **AC-S91-3** — `ARCH-S91-3` and `BEH-S91-2` fail if a data-check/owner-decision stage alone becomes
  blocked, a known-conflict subset is called complete, an S82 blocker/link is changed, or missing S82
  is hidden.
- **AC-S91-4** — Wrong role/Space, hidden lease, ambiguous identity, partial export, stale/expired
  currency, missing account/config, and unreadable communication disclose no forbidden row/count and
  provide only the owning safe recovery.
- **AC-S91-5** — A tenant/property/source field containing prompt instructions, markup, an external
  URL, or another lease id is escaped data only; it cannot change filters, status, completeness,
  links, actions, model instructions, or rendered structure. Query/link activation causes zero
  progress, draft, provider, RentVine, or Sheet writes. ASCII and four-byte-Unicode boundary fixtures
  at every list/scalar maximum prove deterministic removal order, truthful partial/truncation notice,
  exact blocker count, whole-code-point labels, and a final serialized `data` value no larger than
  4,096 UTF-8 bytes.
- **AC-S91-6** — Exact fixtures for `Which leases renew next month?`, `Which renewals are blocked?`,
  `Which leases renew next month for owner "Example Owner"?`, and `Which renewals are blocked for
tenant "Example Tenant"?` match S88's closed grammar and this adapter's exact filters. Unquoted,
  nonterminal, owner-plus-tenant, owner-only window, unsupported-date, and fuzzy-label variants
  clarify or refuse before a read. Producer, coordinator, renderer, and snapshot fixtures preserve
  the exact `Renewals in requested window`, `Blocked renewals`, and `Known source conflicts`
  group-label registry; request wording and resolved dates cannot alter those labels.
- **AC-S91-7** — Stable-source fixtures prove byte-identical action versions across rereads and token-
  key rotation, a changed end date yields a different version, exact JSON/key order controls the
  digest, and missing/conflicted/expired/truncated preview inputs emit no binding. A 50-binding result
  stays private and ordered; S88 public envelopes, observer milestones, S89 model inputs/telemetry,
  and S93 stream captures contain none of its ids, versions, labels, or fingerprint fields.

**Forbidden actions / hard gates.**

Do not create a second renewal worklist or blocker algorithm; query RentVine/Sheet outside the
canonical service; infer staff assignment, end date, owner/tenant identity, blocker, source status,
rent, or action; expose raw provider records, emails/phones/messages, hidden counts, secrets, or
unvalidated URLs; auto-open/bulk-open tabs; advance progress; create a draft; send; write RentVine or
the operating Sheet; trigger RentCast; change an action key; or let model output select a lease,
filter, URL, status, source, or effect.

**Dependencies / sequencing.**

Implement S88/S89 and S82 first. The canonical S78/S82 window adapter, exact public manifest, private
S94 binding, and explicit S82-absent rollback compatibility state can then land. The queued S91
completion consumes S82 rather than reimplementing it and must prove complete blocked-renewal behavior. S92 narration follows
deterministic parity. S93 renders links/states. S94 may consume only the private current verified
bindings declared here. S95 may remove the duplicate Dashboard anticipated/live panels once the
current guarded canonical renewal route and this adapter are reachable; that relocation does not wait
for S82, while complete blocker answers remain partial until S82 exists.

**Standalone delivery contract.**

- **Deliverable now:** Canonical orchestration extraction; exact date/window adapter and v2 range link;
  complete source/currency/blocker states; ordered/capped/minimized lease links; S82-absent rollback
  compatibility; role/Space/privacy/cancellation/zero-effect tests can reach `ALL_GATES_GREEN` without
  a provider write or model after the queued S82 prerequisite is green.
- **Consumes, but does not duplicate:** S82 enriched blocker/status/link and opaque party-filter
  projection. Its absence remains a tested partial rollback state, never the queued desired terminal.
- **Externally blocked effect:** none. Missing live sources render S88's truthful unavailable/partial
  runtime state; they do not authorize another blocker algorithm or provider write.
- **Produces for downstream suites:** Reusable canonical renewal read service, deterministic renewal
  intent/filter receipts, exact public source-completeness/group/item/notice envelope, verified lease/
  table/blocker route refs, and private `AssistantRenewalActionBindingV1` inputs for S94.

**Verification and delivery contract.**

1. Freeze the canonical desk orchestration, S78 query/order/currency/partial behavior, current
   Dashboard abbreviated calls, actor guards, workspace links, and zero-write/provider-effect counts.
2. Add fail-first page/adapter parity, date resolver, source matrix, S82 present/absent, blocked
   semantics, minimization, route, role/Space, malicious-data, and no-effect checks.
3. Run focused renewal model/query/live-desk/adapter/route tests with injected clocks and sources;
   prove the current desk output is unchanged and the assistant never turns an incomplete read into
   all-clear.
4. Run `bash scripts/verify.sh`, inspect the diff, and audit secrets/PII, provider constructors,
   RentVine/Sheet/RentCast/Gmail calls, roles/Spaces, action gates, cache/allowance behavior, and route
   compatibility before authorized delivery.
5. Report one implementation terminal state: `ALL_GATES_GREEN`; `BUDGET_EXHAUSTED` only if a future
   user supplies an explicit budget; or `BLOCKED` only for one exact unavailable input/authority after
   every independent fail-closed path is complete. Adapter partial/unavailable is runtime truth, not a
   custom implementation status.

**Ordered prompt sequence.**

1. Re-verify current S78/S82 implementation state and freeze canonical desk orchestration/output.
2. Materialize failing orchestration-parity, date, completeness, route, authorization, and zero-effect
   checks.
3. Extract the shared server read and add window queries, then the exact S82 compatibility/integration
   path without changing the owning renewal projection.
4. Falsify dates, source failures, partial/expired data, roles/Spaces, malicious fields, link targets,
   and model outage; run canonical verification and update current docs to verified truth.

**Deletion/merge recommendation.**

Remove S91 when the live desk and assistant share one tested canonical source, window and blocked
queries pass with S82's exact projection, all completeness/link/authorization gates are code-owned,
and current facts describe only the deployed result.
