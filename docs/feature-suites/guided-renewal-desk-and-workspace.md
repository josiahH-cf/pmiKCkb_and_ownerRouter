<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-ui-guidance-v2 -->

# S82 — Table-first renewal desk and guided lease workspace

> Status: Reopened for active, unreleased conformance remediation. The original baseline was deployed
> on 2026-09-01 through commit
> `da91e5cc7e3a85db7f4bcf9c7aa036bca554e76c`, exact-SHA CI `33575465575`, zero-traffic candidate
> `pmi-kc-app-rmtjd24ee-17d334db377f`, bounded candidate smoke, normalized runtime parity excluding
> only image, exact `APP_COMMIT_SHA`, and the one specified `RENEWAL_DESK_PARTY_FILTER_KEY`
> binding, exact promotion, and repeated canonical readback. Focused desk/query/continuation/
> guidance/destination/access-return/table/copy suites, the real-Chromium production-build matrix,
> canonical verification, and core E2E passed; the party-filter secret and its runtime-SA accessor
> were created and read back without printing the value. Navigation performs no verification,
> progress, source write, draft, send, or role change. The remediation below is implemented in the
> current working tree but is not deployed; production closure remains pending.

**Goal.**

Let a renewal operator land on one data-rich table, sort and filter the exact leases relevant to the
work at hand, follow any current blocker directly, and retain that view while working inside a lease,
while the lease workspace itself remains focused on one safe next action.

**Current state / intended end state.**

The deployed 2026-09-01 baseline supplies the sortable semantic table, persistent desk query,
clickable phase/blocker navigation, and phase-selected workspace. Exact validated source
destinations and the other corrections below are not part of that deployed baseline. A later
adversarial conformance review found bounded gaps between the baseline and this contract's
source-truth, failure-state, filter, and action-placement requirements. The current remediation
closes those gaps locally; it remains unreleased until the post-deployment closure gate below passes.

The intended desk is one sortable, filterable semantic table. Each lease appears once with its
location, authoritative owners and tenants, RentVine renewal date and current contractual base rent,
overall status, rent-verification state, and every current actionable blocker. Sort/filter controls
belong to their table columns; there is no separate search or filter panel. Verified categorical
values act as filter shortcuts. Lease/location links open the exact workspace only for
workspace-eligible actionable, review, and out-of-window rows; definitive skips stay plain and may
offer only an independently validated external source. Blocker links open the exact phase or trusted
source. Canonical URL state survives refresh, Back/Forward, copied links, lease work, and the
workspace's return link.

The lease workspace retains the earlier S82 direction: a clickable six-phase rail, one current-action
card, and one selected phase instead of the complete operational evidence engine on screen. This
iteration deliberately increases structured desk data while continuing to remove explanatory and
infrastructure prose.

### Post-deployment conformance remediation (active, unreleased)

The reopened slice implements these bounded corrections without changing S82 action authority:

- preserve missing RentVine current rent as `null` and require a finite positive source value before
  base-rent evidence can clear; never project missing rent as `$0`;
- use the same bounded live lease generation for desk assembly and current packet lookup, bulk-read
  current packet snapshots, and clear historical packet evidence when that auxiliary truth is
  unavailable;
- represent each supporting read as a typed available/failed/unavailable result, surface a symbolic
  notice, and disable only its dependent control instead of silently converting failure to empty,
  verified, or ready state;
- expose separate loaded, selected-scope, and matching totals; give invalid date/range input
  value-free feedback; keep filters in accessible GET forms; and provide owner/tenant header filters;
- derive protected RentVine destinations from validated source links and place RentVine and operating-
  Sheet proposal panels inside the verification phase rather than below every phase; and
- refresh the complete lease projection after a RentVine write or reversal and report partial or
  failed refresh honestly while preserving its durable receipt; and
- bind each displayed discrepancy, saved decision, queued proposal, Admin approval, preview, and
  durable Sheet claim to one current source-candidate fingerprint and resolution version, treating
  legacy, malformed, duplicated, or drifted records as stale across every consuming surface; and
- expose value-free source-currency, row-status, blocker/action, resolution-difference, workspace-
  eligibility, and destination-kind markers so the independent S51 oracle can verify exact rendered
  state and link cardinality without persisting customer values or importing the desk projection.

Closure requires focused unit/browser tests, canonical verification, the expanded S51/S54 managed
Admin/Editor candidate checks, exact RentVine/Sheet source reconciliation, promotion, monitoring
readback, and the required post-promotion observation. Until those gates pass and the serving
revision is read back, the remediation remains **ACTIVE / UNRELEASED** and must not be presented as
deployed.

**Actors and entry conditions.**

- A renewal operator is an authenticated managed staff user with Renewals Space access and the S80
  capability required for the requested control. Editor, Approver, and Admin distinctions remain
  unchanged.
- Entry starts from the canonical Live desk or one exact Live lease. Partial, unreadable, stale, or
  expired sources retain their existing visible fail-closed behavior.
- Desk data and navigation are read-only. Sorting, filtering, opening a lease, opening a blocker, or
  opening a source never records evidence, verifies a value, advances a step, grants a role, sends a
  message, or performs a provider write.
- S83 supplies the capability-guided self-service access destination. If it is unavailable, S82
  renders the current specific denial and safe Admin handoff without inventing authority.

**What it is / how it functions.**

### One shared desk and guidance projection

Extend the existing serializable S78 desk item with the fields the table needs, derived in the same
bounded load as the current process projection. The table, attention/urgency ordering, selected
phase, and workspace current-action card consume this one projection rather than recomputing status
or next-action copy in components.

For each lease, the projection must expose:

- stable lease id, exact address/property labels, all authoritative owner labels, and all
  authoritative tenant labels with their existing source references;
- RentVine lease end date, displayed as `Renewal date`, without creating a second date meaning;
- RentVine current contractual base rent as a finite money value or explicit missing state;
- source currency and portfolio-read completeness;
- rent-verification state and exact review destination;
- the current S72 process step, deterministic overall status, and actor-appropriate next action;
- every current causal blocker with short label, type, phase, trusted destination, and required
  capability; and
- the existing S75 due/waiting facts, cohort/retention facts, conflict count, and stable query/sort
  keys needed for backward compatibility.

The page performs one shared RentVine snapshot and one shared operating-Sheet read as today, plus
bounded bulk app-owned reads for progress, discrepancy resolutions, communications, and any current
packet/signature/compliance evidence needed to identify blockers. If a required app-owned source has
no bulk reader, add one bounded server aggregation rather than calling a per-lease reader from each
row. A failed auxiliary read marks only its dependent status `Unavailable`/`Needs verification` and
cannot turn missing evidence into `Ready` or fail the source-complete table silently.

Portfolio completeness, selected-scope completeness, and dependent-status completeness are distinct
facts. A failed auxiliary read never relabels an otherwise complete RentVine portfolio count as a
partial source read. When saved progress is unreadable, every possibly tracked out-of-window lease is
conservatively retained as `Needs verification`; the desk publishes no inferred phase, workflow
blocker, or progress-dependent action and directs the operator to refresh. Status-dependent filters
cannot claim an authoritative empty result until that supporting read recovers.

Current rent on the table is the tenant's contractual base rent from the documented RentVine lease
detail (`baseRentAmount`), applied to the shared lease view by the existing RentVine mapper under
S102; the export's `unit.rent` is the unit's listed rent and appears only as a labelled reference. It
is not a Sheet value, a human-reconciled replacement, recurring
charges, a RentCast estimate, an Admin-approved suggestion, or an owner/tenant renewal offer. Format
it as currency and label its source as RentVine. A missing/non-finite value renders `Needs
Verification`; never coerce it to zero. A Sheet disagreement does not replace the displayed RentVine
amount, but it does keep the rent-verification status and affected workflow blocked until the exact
existing reconciliation requirement is satisfied.

The table's rent-verification states are:

- `Verified`: the existing current-rent rule is satisfied by a finite positive value plus fresh
  RentVine/operating-Sheet agreement or one exact current discrepancy resolution;
- `Needs verification`: RentVine rent is missing, the Sheet row/value is missing, or sources disagree
  without an exact current resolution; and
- `Unavailable`: current source completeness/currency prevents the comparison from being evaluated.

Resolution currency is structural, not a label comparison. For every resolvable flag the server
derives one versioned, order-independent fingerprint over the exact canonical source/value
candidates. Read timestamps, display labels, and navigation URLs are not facts in that fingerprint;
adding, removing, or changing a candidate source/value is. A resolution control carries the exact
fingerprint the person reviewed, and the server rebuilds current source truth before persistence. A
missing or changed fingerprint refuses as stale and refreshes the review; it cannot silently apply
the same source-name choice to a value the person did not see.

A current `pick_source` resolution must name one present candidate and preserve that candidate's
exact canonical value. A `corrected_value` resolution must preserve its explicit source contract and
contain a finite positive rent. `flag_incorrect` may dismiss the flagged conflict but cannot select or
verify a rent value. Legacy, malformed, or fingerprint-mismatched records are stale. One
resolution-aware effective data-check projection then owns conflict counts, rent verification,
overall status, blockers, process evidence, desk, and workspace; source drift reopens all of those
views together.

The amount and the verification state remain separate fields. When an exact resolution verifies a
value different from the displayed RentVine amount, the verification cell says `Verified by
resolution · differs from RentVine` and links to that evidence; it does not silently replace the
RentVine table value. `Verified` is evidence-backed, not a button toggle, and clicking it does not
change either source.

When a current-rent resolution queues a Sheet proposal, the operator and Admin see that persisted
proposal's exact value and source, not a separately recalculated suggestion. Each approval control
uses a server-issued, value-free authorization token bound to the trigger, run, property, field,
value, source, candidate fingerprint, and resolution version. Bulk review carries one token per
item. Approval rereads the resolution transactionally and refuses a stale token. Current-approval
labels and final Sheet claims require the same nonempty fingerprint and resolution version; a same-
value re-resolution still requires a new approval, preview, and claim.

The deterministic overall-status precedence is:

1. `Needs verification` when current source completeness/currency prevents a safe process answer.
2. `Blocked` when one or more current causal S72 blockers prevent the current phase.
3. `Complete` when the current process has exact app-completion evidence and no newer source state
   invalidates it.
4. `Waiting` when the next movement depends on the owner, tenant, document coordinator, provider, or
   confirmed policy rather than a currently available operator action.
5. `Ready` when the current required control can be taken; lack of actor capability replaces that
   control with the exact S83 capability/Space handoff but does not change the lease's process truth.
6. `Needs review` for a loaded lease that is not currently actionable and has no stronger state.

`isBlocked` is true for `Blocked` and for a fail-closed `Needs verification` state that prevents
progress. It is false for a merely non-actionable/out-of-window row. Status, blocked filtering, row
styling, counts, attention ordering, and blocker links consume these exact fields.

The current-action rule remains deterministic:

1. Incomplete or expired source data wins and points to refresh/recovery.
2. Otherwise scan the applicable required substeps of the process-current phase in definition order
   and select the earliest incomplete causal substep.
3. Expose every blocker on that causal boundary in the table's Action cell; expose the single safe
   next control when unblocked.
4. A role/Space denial becomes an exact capability-guided access-request handoff and never masks an
   action-key, suspension, provider, quota, confirmation, or permanent-send denial.
5. Waiting and completion render truthful review destinations rather than fabricated work.

This projection is display state only. It does not persist a second workflow or become completion,
verification, approval, or provider evidence.

### Required table columns

The canonical desk renders one `<table>` with one row per loaded lease after the current S78 cohort
and selected filters are applied. Required columns, in order, are:

| Column              | Display contract                                                                                                                                                   | Sort/filter and click contract                                                                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Lease / location`  | Current address is the primary lease label; property name and exact lease id are secondary. Missing address remains `Needs Verification`.                          | Sort by normalized address/property then lease id. A column text filter covers only lease id, address, and property. Clicking the primary label opens that lease while retaining the desk view.                      |
| `Owner`             | Show every authoritative owner label from the existing exact source tier; never infer from email, neighboring rows, or property fragments.                         | Sort by the first authoritative normalized owner with stable lease-id tie-break. Header filter selects an exact projected opaque owner key. Each owner value applies that key, never the displayed name, to the URL. |
| `Tenant`            | Show every authoritative tenant label; missing values remain `Needs Verification`.                                                                                 | Sort by first normalized tenant. Header exact-value filtering replaces the tenant portion of global search. Each verified tenant value applies its projected opaque key, never the displayed name, to the URL.       |
| `Renewal date`      | Show the authoritative RentVine lease end date under the user-facing renewal label.                                                                                | Sort chronologically; filter by exact date, missing date, or calendar month. Clicking a present date applies that exact date filter.                                                                                 |
| `Current base rent` | Show the current finite RentVine contractual base rent and a concise RentVine source label.                                                                        | Sort numerically with missing last. No amount-range filter is required in this iteration. Clicking a present/missing value opens its exact rent-verification destination.                                            |
| `Overall status`    | Show exactly one labelled non-color status from the precedence above and the current phase label.                                                                  | Sort by the shared urgency rank then renewal date; filter by exact status and, within the header filter, the retained S78 phase/due/waiting criteria. Clicking the status applies its exact status filter.           |
| `Rent verification` | Show `Verified`, `Needs verification`, or `Unavailable`, including a text/icon distinction.                                                                        | Sort by needs-attention rank; filter by exact state. Clicking the state opens the exact rent comparison/resolution phase, not a mutation.                                                                            |
| `Action`            | If blocked, show every current causal blocker as a short link. Otherwise show the one current action, waiting review, completion evidence, or safe access handoff. | Header filter selects `Blocked`, `Not blocked`, or all. Each link opens its exact internal phase/component or trusted external source. There is no generic `Open` button.                                            |

There is no sale/property-sale column, query, provider, or workflow. The user's clarification was that
`sale data` meant lease data. Current rent and offers remain separate; a future proposed/approved
renewal offer is not added to this table by this suite.

The table is the only worklist. Remove the separate `Needs your attention` cards, metric grid,
card-based worklist, per-row stepper, renewal-authority panel, global search box, global controls card,
`Apply view`, `Clear search`, and single `Open` button. Keep concise matching, selected-scope, and
total-loaded counts, Live/source-age state, the existing refresh action, and distinct portfolio-read
and supporting-status notices because they change which counts, filters, and actions can be trusted.

### Column sort and filter contract

Column headers own their controls. A sortable header has a real button, visible direction, and
`aria-sort`; selecting the active header reverses direction. Only one primary sort is active at a
time. Missing values sort after present values in both directions, and exact lease id is the final
tie-break so rows never shuffle.

The public URL contract is `renewal-desk-query/v2`. Its exact parameters are:

| Key                | Accepted value and bound                                                                                                                                                                            | Default / canonical behavior                                                                                                  |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `v`                | Exact literal `2`.                                                                                                                                                                                  | Logical default is `2`. Emit `v=2` whenever any nondefault state is emitted; the completely default desk has no query string. |
| `q`                | Legacy-only text, trimmed and then truncated to the first 120 UTF-16 code units, using the existing bounded cross-field matcher.                                                                    | Empty. Parse from old bookmarks, emit only while active, label `Legacy search`, and never create it from the v2 UI.           |
| `lease`            | Lease/location text, trimmed and then truncated to the first 120 UTF-16 code units. It searches only lease id, address, and property through the existing normalization.                            | Empty.                                                                                                                        |
| `sort`             | `due`, `end_date`, `month`, `owner`, `tenant`, `workflow_step`, `waiting_on`, `conflicts`, `lease`, `base_rent`, `overall_status`, `rent_verification`, or `blocked`.                               | `due`. Existing values remain valid bookmark choices; new header controls emit the matching column value.                     |
| `direction`        | `asc` or `desc`.                                                                                                                                                                                    | `asc`.                                                                                                                        |
| `scope`            | `active`, `tracked`, or `all`.                                                                                                                                                                      | `active`.                                                                                                                     |
| `endDate`          | Empty, exact literal `missing`, or one real ISO calendar date `YYYY-MM-DD`; maximum 10 code units.                                                                                                  | Empty/all dates.                                                                                                              |
| `month`            | Empty or `YYYY-MM` with month `01` through `12`; maximum 7 code units.                                                                                                                              | Empty/all months.                                                                                                             |
| `due`              | `all`, `due`, `not_due`, `needs_verification`, `unset`, `disabled`, or `not_applicable`.                                                                                                            | `all`.                                                                                                                        |
| `ownerKey`         | Empty or exact `p1_` plus 43 unpadded base64url characters from the server-issued party-filter derivation below.                                                                                    | Empty/all owners. Display labels never enter a v2 URL.                                                                        |
| `tenantKey`        | Empty or exact `p1_` plus 43 unpadded base64url characters from the server-issued party-filter derivation below.                                                                                    | Empty/all tenants. Display labels never enter a v2 URL.                                                                       |
| `from`             | Empty or one real ISO calendar date `YYYY-MM-DD`; valid only with `through`.                                                                                                                        | Empty/no inclusive range.                                                                                                     |
| `through`          | Empty or one real ISO calendar date `YYYY-MM-DD`; valid only with `from`, not before it, and spanning at most 120 inclusive calendar dates.                                                         | Empty/no inclusive range.                                                                                                     |
| `step`             | Empty, `verify-renewal`, `owner-decision`, `tenant-decision`, `document-packet`, `signatures-follow-up`, `compliance-close`, or `needs_verification`; maximum 64 code units before enum validation. | Empty/all phases.                                                                                                             |
| `waiting`          | `all`, `owner`, `tenant`, `team`, `document_coordinator`, `unresolved_source`, `not_waiting`, or `needs_verification`.                                                                              | `all`.                                                                                                                        |
| `conflicts`        | `all`, `with`, or `without`.                                                                                                                                                                        | `all`.                                                                                                                        |
| `overallStatus`    | `all`, `needs_verification`, `blocked`, `complete`, `waiting`, `ready`, or `needs_review`.                                                                                                          | `all`.                                                                                                                        |
| `blocked`          | `all`, `blocked`, or `not_blocked`.                                                                                                                                                                 | `all`. `blocked` consumes the projection's exact `isBlocked`; it does not rederive blockers in the query parser.              |
| `rentVerification` | `all`, `verified`, `needs_verification`, or `unavailable`.                                                                                                                                          | `all`.                                                                                                                        |

Every key is scalar. If a URL repeats a key, the parser reads only the first occurrence. Filters
combine as described below; the URL never encodes an arbitrary JSON object or comma-separated list.
The date dimension is mutually exclusive: a valid `from`+`through` pair wins and drops `endDate` and
`month`; otherwise a valid nonempty `endDate` wins and drops `month`; otherwise `month` may apply.
Applying any date/month/range UI shortcut clears the other date representations before canonical
serialization. An incomplete/invalid range is dropped as a pair and does not suppress a valid exact
date or month.
Canonical serialization uses `URLSearchParams` percent-encoding, emits keys in the table order,
omits every default/empty value, and is stable regardless of interaction order. An absent `v` with
only the previously supported keys is parsed as a legacy bookmark and immediately normalizes to the
same v2 state. Legacy `owner`/`tenant` display-label values may be compared once against the authorized
projection to resolve one exact opaque key; ambiguous/missing labels are dropped, and neither label is
echoed into the canonical URL or app telemetry. The v2 UI never emits those legacy keys. An unknown
key is discarded. An unknown version or invalid enum/date/month/range/opaque-key
value falls back to that known key's default and is never echoed into the canonical URL; only the two
free-text keys use the explicit truncation behavior in the table.

Filters combine with logical AND across columns and OR within a multi-valued cell: an owner filter
matches a lease when any authoritative owner has the selected projected key. Categorical options come
only from the current serialized projection plus a currently selected legacy value. Text filters use
the current case/punctuation/diacritic-insensitive normalization and remain bounded. Unknown,
malformed, empty, or oversized URL values fall back safely and never throw.

The server projection creates `renewal-party-filter-key/v1` values deterministically. Bind
`RENEWAL_DESK_PARTY_FILTER_KEY` and optional rotation-only
`RENEWAL_DESK_PARTY_FILTER_PREVIOUS_KEY`; each is canonical unpadded base64url for exactly 32 random
bytes and distinct when both exist. Compute HMAC-SHA-256 over UTF-8 ECMAScript `JSON.stringify` of
the fixed-key-order object `{ "v":"renewal-party-filter-key/v1", "space_id":<exact Space id>,
"party_kind":"owner"|"tenant", "normalized_label":<the existing exact normalized label> }` with no
extra keys/whitespace. The URL token is literal `p1_` plus unpadded base64url of all 32 digest bytes.
The key material and normalized label are never logged or sent; only the derived token is public. The
parser accepts an active- or previous-key value only when
it resolves against a party already present in the current authorized result; an opaque key is not an
identity lookup or authority signal. Missing configuration fails the owner/tenant shortcut closed and
shows `Party filtering is unavailable` while the unfiltered table remains usable. Rotation keeps the
previous verifier through the existing rollback window, then old copied party-filter URLs degrade by
dropping only that filter with a visible notice; no display label is reconstructed from a key.

The table must support these canonical filter dimensions:

- lease/location text;
- exact owner and tenant;
- exact renewal date, missing date, renewal month, and an inclusive 1-through-120-day range used by
  the canonical assistant renewal handoff;
- overall status and blocked state;
- rent-verification state;
- existing active/tracked/all scope;
- existing workflow phase, due state, waiting-on state, and source-conflict state.

The S78 global `q` parameter remains parseable only for old bookmarks and links. When present, it
continues its existing bounded cross-field match, appears as an active `Legacy search` filter chip,
and can be cleared; the new UI never renders a global search box or creates a new `q` value.

At the top of the page, directly above the table, render:

- `Showing X of Y renewals` using high-contrast normal text;
- one chip per active filter with an individual remove control; and
- an always-present `Clear filters` control. It is disabled when no filters are active and otherwise
  removes every filter, including legacy `q`, while retaining the current sort/direction. A separate
  reset is not required.

Zero rows use one source-backed state; the table never reuses the current filtered-empty copy for
every zero:

- `Unfiltered empty` requires a complete canonical source read and a zero-row S78 cohort before any
  desk filter. Render one table-spanning row `No renewals are in the current worklist.` Keep the
  ordinary Refresh control; do not invent a create/import action. If filters happen to be present
  while the underlying cohort is zero, retain their chips and enabled Clear filters control, but do
  not claim clearing them will reveal a lease.
- `Filtered empty` requires a complete canonical source read, at least one row in the unfiltered S78
  cohort, at least one active desk filter, and zero matching rows. Render one table-spanning row `No
renewals match these filters.` The enabled `Clear filters` control is its recovery.
- A partial, unavailable, denied, or failed read cannot select either empty state or a zero-total
  claim. It renders the owning source/permission/error notice and exact S83 access handoff or safe
  retry while preserving valid filter state. Stale last-known rows appear only when the existing
  owning source contract already permits them and labels their timestamp.

Both empty rows preserve the table caption, column headers, result count, active chips, and semantic
table relationships; neither renders an empty card grid or hides source trust.

Changing a header sort, submitting a column filter, clicking a verified value, removing a filter, or
clearing filters navigates to one canonical GET URL and preserves every other valid key in the v2
table. Unknown keys are not preserved.
Categorical shortcut clicks apply immediately. Text/date controls use Enter or a labelled `Apply`
button within that column's header disclosure; there is no separate page-level apply step.

### Persistent desk view and return navigation

The canonical desk URL remains the source of truth for sort/filter state. Refresh, Back/Forward, and
a copied URL restore the same result set and row order. Defaults are omitted from canonical encoding;
query serialization is stable regardless of interaction order.

Every internal lease, phase, rent-verification, and blocker link that leaves a nondefault desk carries
one `deskView` value containing only the exact canonical v2 serialized desk-query string, without a
leading `?`, route, origin, fragment, or nested `deskView`. The decoded value is capped at 8,192 code
units, contains at most one occurrence of each v2 key, and must round-trip byte-for-byte through the
v2 parser/serializer. A default desk omits `deskView`. The workspace reconstructs only the canonical
internal desk route; an empty, noncanonical, oversized, repeated-key, unknown-key, unknown-version, or
legacy nested value falls back to the default desk and can never become an open redirect. The outer
URL uses ordinary `URLSearchParams` encoding exactly once for the `deskView` value. External source
links never receive `deskView` or any desk filter value.

The workspace's `Back to renewals` link returns to that exact view after app-owned changes, phase
navigation, refresh, or error recovery. Its own `step=<renewal-v1-step-id>` state remains independent
of `deskView`. Browser Back also restores the table naturally. Sort/filter state is never stored in a
lease/progress/provider record, sent to analytics/logs, or treated as user authority.

S82 atomically extends S83's shared access-return registry for only `renewal_desk` and
`renewal_workspace`. This access-return variant first removes the free-text `q` and `lease` keys from
the canonical v2 state; normal desk URLs and ordinary workspace `deskView` continuity remain unchanged.
`renewal_desk` then accepts exactly that privacy-bounded canonical v2 query. `renewal_workspace`
accepts exactly one allow-listed `step` and one canonical `deskView` value built from the same
privacy-bounded state, in its canonical query order. Owner/tenant display labels remain opaque keys.
When either removed text filter was active, the originating denial region renders exact adjacent text
`Your text search will be cleared in the access return link.` before the user chooses Request access.
The complete once-decoded return route must fit
S83's 32,768-UTF-8-byte bound; exhaustive maximum legal v2/Unicode fixtures must prove every value the
S82 access-return serializer can emit fits. If it does not, S82 must lower its own non-text canonical
field bound before delivery rather than truncate, drop, or persist state elsewhere. Thus a
capability/Space handoff from a filtered lease or phase returns to the exact workspace and preserves
every non-text desk filter; it never nests address/property/lease-search text inside `/admin/access`.
When this route is nested in an S88 assistant access handoff, S88's stricter complete-href 2,048-byte
ceiling applies after percent encoding: an over-limit handoff keeps capability/Space preselection but
omits the complete `return_to` under S83's deterministic fallback. S82 does not shorten or partially
restore desk state to satisfy the assistant ceiling, and the original assistant result remains in
its first tab.
No other S83
destination gains query acceptance, and a malformed continuation drops the complete preselection
rather than partially restoring a different lease/view.

The compatibility route `/lease-renewal/lease/[leaseId]` currently drops the lease id and redirects to
the desk. S82 intentionally upgrades it to the exact guarded canonical workspace
`/lease-renewal/live/desk/lease/[leaseId]`, preserving only validated v2 desk state and an allow-listed
`step`; malformed, unauthorized, or missing leases retain the canonical workspace's ambiguity-safe
fallback. Route tests must prove the id is neither dropped nor used to bypass the existing guard.

### Lease workspace contract

The default lease workspace contains, in order:

1. address, tenant/end-date context, Live/source-age state, and the desk-view-aware return link;
2. a clickable six-phase navigation rail;
3. one `Do this next` card, or one concise waiting/complete card when no action is possible; and
4. the selected phase's controls and current blockers.

The rail uses real links and stable URL state. `step=<renewal-v1-step-id>` selects a phase and the
stable target id is `renewal-step-<renewal-v1-step-id>`. No `step` selects the process-current phase;
an invalid/empty value falls back without an error. Back/Forward and copied URLs restore selection.

| Phase id               | Selected-phase destination and content boundary                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `verify-renewal`       | Current data check, exact source links, and discrepancy resolution controls when a blocking discrepancy exists.            |
| `owner-decision`       | Market evidence, owner decision, governed owner draft/contact state, and only the role-appropriate pricing control.        |
| `tenant-decision`      | Governed tenant offer/draft, linked communication refresh, and source-backed tenant outcome.                               |
| `document-packet`      | Current packet truth, its active blockers, and the approved document/provider readiness handoff.                           |
| `signatures-follow-up` | Current packet/signature and waiting/follow-up truth; unavailable provider work links to its honest readiness destination. |
| `compliance-close`     | Final required compliance items and app completion only when its server-side evidence predicate permits it.                |

Selecting a completed phase shows a compact read-only result and verified evidence links. An upcoming
phase shows its earliest unmet prerequisite and `Go to current phase`; it cannot enable a premature
control. The dense process-version panel, operational-substep disclosures, completion rules,
responsible-role suffixes, and renewal-authority panel do not appear in the normal desk or workspace.

### Clickable blocker, status, and evidence destinations

Use one validated destination manifest for phase, blocker, status, and evidence link types. Every
rendered interactive status resolves to exactly one authenticated internal target in the same tab or
one exact server-validated external `https` source in a new tab. When no trustworthy destination
exists, render a non-interactive status plus a specific internal fallback.

- `Needs verification` links to its exact in-app comparison/resolution target. Multiple sources get
  separately labelled links inside that target. A record-specific item that is resolved by Live
  review links to that exact actionable card/resolve control; an adjacent disposition-note form does
  not masquerade as the resolution that clears verification.
- A verified Sheet source links at minimum to the configured operating Sheet; exact tab/row may be
  used only from current Sheet metadata.
- RentVine opens externally only from a current source-provided hyperlink whose expected tenant host
  and parsed lease id match this row; otherwise use the in-app comparison.
- RentCast uses only its provider-returned source URL.
- Gmail links to workflow-bounded in-app communication context; do not synthesize a Gmail web URL.
- Dotloop/document status links externally only after an official exact mapping exists; otherwise use
  packet truth or Connections readiness.

External links use `target="_blank"` and `rel="noopener noreferrer"`, communicate the destination,
and never contain credentials, message bodies, customer values beyond the provider's validated
source URL, or unvalidated caller input. Clicking never changes status.

### Content, visual, and accessibility contract

- The desk increases structured lease data, not prose. Remove directives, role explanations,
  retention essays, process-version/evidence-engine terms, repeated governance banners, and `Next:`
  paragraphs. Keep only source trust, current blocker, disabled-action, unsent-draft, and error copy
  that changes a decision.
- Treat the rough 80-percent reduction as direction, not a numeric release gate. Deterministic copy
  acceptance instead snapshots the named pre-change desk/workspace blocks and requires absence of the
  separate attention cards, metric grid, card worklist, per-row stepper, renewal-authority panel,
  global search/controls cards, process-version panel, operational-substep disclosures, completion-
  rule prose, responsible-role suffixes, repeated governance banners, retention essays, evidence-
  engine terms, and training-style `Next:` paragraphs. It separately requires the preserved source-
  trust, blocker, disabled-action, unsent-draft, validation, error/recovery, label, status, and
  assistive-text roles. Word, paragraph, and DOM-node percentages cannot pass or fail the suite.
- Consume S85 semantic roles: selected/current primary actions use `--action-primary-*`; ordinary
  table navigation/filter controls use secondary/tertiary roles; blocked/error, waiting/verification,
  complete/verified, neutral, and reference states use their exact `--state-*-text/surface` pairs. No
  literal or official-brand claim is introduced.
- `Ready`, `Blocked`, `Waiting`, `Complete`, `Needs review`, `Needs verification`, and rent states have
  text plus icon/shape, never color alone. Active uses accent, blocked/error uses error, waiting and
  verification use caution, complete/verified uses verified, and neutral states remain neutral.
- Use semantic table markup with a descriptive caption, row/column headers, labelled header filters,
  accurate `aria-sort`, visible keyboard focus, logical tab order, and live result-count updates.
  Interactive targets are at least 44 by 44 CSS pixels.
- At 320 CSS pixels and 200-percent zoom, the table remains in a labelled contained horizontal-scroll
  region and does not create page-level overflow. The lease/location column remains identifiable
  while scrolling. Do not replace the required data table with inaccessible div rows.
- All normal text and controls meet WCAG AA contrast. Motion is optional, short, and disabled by
  `prefers-reduced-motion`; it never implies verification or completion.

**In scope / out of scope.**

In scope: shared table/guidance projection; RentVine current-base-rent display; rent-verification and
blocker projection; semantic table; integrated columns, sort, filters, value shortcuts, active chips,
clear filters, stable URL and return state; clickable phases/statuses/sources; desk/workspace content
cleanup; responsive/accessibility behavior; and preservation tests.

Out of scope: property-sale data; proposed/approved offer column; recurring-charge aggregation;
changing `renewal-v1` evidence predicates; changing S80 roles/action keys; S64; new provider reads or
endpoints; source writes; direct/automated sends; a whole-application redesign; durable saved-view
preferences outside canonical URLs; multi-column compound sorting; or treating a click as
verification.

**Open questions & assumptions.**

No material product question remains open. `Sale data` was clarified to mean lease data, so no sale
concept is introduced. `Lease price` was clarified as the current RentVine source-of-truth base rent;
offers and charges remain separate. The requested `needs verification from rent roll/rent line`
criterion maps to the existing `current_rent` RentVine-versus-operating-Sheet reconciliation, not a
new rent-roll integration. The existing S78 cohort, retained-incomplete behavior, and one primary sort
remain authoritative. User examples such as `pending` or `next` are interpreted through the
evidence-backed status vocabulary above rather than added as ungrounded states.

**Cross-product impacts.**

Canonical renewal route/query model; desk and workspace view models/loaders; RentVine export mapper;
operating-Sheet reconciliation and exact resolutions; S72 process/evidence; S75 due/waiting; S80
capability results; attention ordering; discrepancy UI; trusted source-link propagation; S81
Connections anchors; S83 access handoff; shared table/UI tokens; accessibility, URL, PII, copy, and
provider-call-count gates. No provider effect owns table state.

**Authority and evidence map.**

| Input                                                           | Classification            | Use and limitation                                                                                                                                                                              |
| --------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`, committed action registry, and `docs/facts.md`     | Authority / present truth | Live-only data, managed identity, draft-only messaging, S98's exact append plus fixed-row capability refusal, and per-key action gates remain unchanged; S82 navigation itself grants no write. |
| S72/S75/S78/S80/S81 and current code/tests                      | Implementation truth      | Supply six-step evidence, waiting truth, cohort/query compatibility, authority, and exact destinations. S82 extends their projection; it does not duplicate state.                              |
| Current RentVine export mapper and live desk/workspace loader   | Source truth              | Supply address/party/date and canonical `unit.rent` base rent. Missing facts remain missing; table enrichment cannot add per-row reads.                                                         |
| Current Sheet reconciliation/resolution and source-link readers | Verification truth        | Supply rent agreement/blocker and trusted link evidence without replacing the table's RentVine amount or writing either source.                                                                 |
| User's two renewal UI notes and clarification                   | Intent evidence           | Require a table-first verbose desk, no separate search, persistent filters, clickable values/blockers, a focused workspace, and RentVine lease-price truth; `sale` means lease.                 |
| Missing provider mapping or source URL                          | External dependency       | Use exact internal fallback; never guess a URL or block the independently implementable table/workspace slice.                                                                                  |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S82-1** — One pure serialized projection owns table facts, query keys, rent verification,
  overall status, blockers, and guidance for both desk and workspace. Real-shape parity tests fail
  against the current missing rent/blocker fields and separate static next-action rendering.
- **ARCH-S82-2** — One deterministic query contract owns integrated column filters, single-column
  sorting, legacy `q` compatibility, canonical serialization, active-filter removal, clear-filter
  behavior, opaque party-filter keys, inclusive bounded ranges, and stable lease-id ties. Exhaustive
  tables prove no interaction drops an unrelated key or emits a displayed party name in a v2 URL.
- **ARCH-S82-3** — One bounded desk-view continuation contract carries canonical query state through
  every lease/blocker/phase link and rebuilds only the canonical internal return route. Round-trip,
  malformed/oversized input, Back/Forward, and open-redirect tests fail first.
- **ARCH-S82-4** — One destination manifest maps each phase/blocker/status/evidence type to a real
  internal target or validated source. Target, URL scheme/host/lease identity, uniqueness, and
  fallback tests reject guessed or unsafe links.
- **ARCH-S82-5** — Existing loaders compose RentVine rent, Sheet comparison, resolutions, progress,
  communications, and packet/signature/compliance evidence in bounded shared/bulk reads. Table
  render/navigation adds no per-row provider or app-store call, mutation, action-key shortcut, or
  second workflow state.
- **ARCH-S82-6** — Primary portfolio, scope/retention, and dependent workflow completeness remain
  separate. An unreadable progress store retains possible tracked work and suppresses process/action
  projection rather than substituting an empty map as truth.
- **ARCH-S82-7** — One versioned source-candidate fingerprint and resolution version bind the
  displayed decision, persisted resolution, queued proposal, exact Admin review token, current-
  authorization projection, preview, and durable Sheet claim. Every server boundary rereads current
  truth and rejects legacy, malformed, missing, or drifted bindings before persistence or effect.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S82-1** — The front page has one data table and each lease once, with every required column,
  accurate partial/result counts, distinct complete unfiltered-empty and filtered-empty states, and
  no global search/control card, attention duplicate, card worklist, metric grid, stepper, authority
  panel, or generic Open button.
- **BEH-S82-2** — An operator can sort/filter by renewal date/month/bounded range, status, blocked state, rent
  verification, owner, tenant, lease/location, and retained S78 criteria; owner/tenant/date/status
  shortcuts apply exact filters through opaque party keys and Clear filters restores the unfiltered
  set without changing sort.
- **BEH-S82-3** — RentVine current base rent never conflates with Sheet, charges, suggestions, comps,
  or offers. Missing/mismatched/unavailable truth has a labelled state and exact review link.
- **BEH-S82-4** — Opening and working in a lease, selecting phases, refreshing, returning, browser
  navigation, and copying a URL preserve the same desk filters and ordering; invalid state fails to
  the canonical default without redirecting externally.
- **BEH-S82-5** — Every current blocker/action and trusted evidence status is directly reachable,
  while navigation itself causes no verification, progress, source write, send, or authority change.
  Review and out-of-window leases with a stable id remain inspectable; a definitive cohort `skip`
  exposes no link to a renewal workspace the server will reject.
- **BEH-S82-6** — Table density, header controls, state/action hierarchy, focus, keyboard semantics,
  announcements, contrast, zoom, and narrow layout remain usable without color or motion.
- **BEH-S82-7** — An individual workspace shows clickable six-phase navigation, one safe next action,
  one selected phase, and only current blockers instead of the full operational engine.
- **BEH-S82-8** — The desk and workspace classify the same lease against the same current 120-day
  window. Opening a review or out-of-window row cannot make it actionable, and a non-positive
  corrected rent cannot produce a Verified state.
- **BEH-S82-9** — An operator can resolve only the candidate snapshot currently displayed, an Admin
  can approve only the exact queued proposal displayed, and any intervening source or resolution
  change returns a stale-state recovery instead of reusing the old choice or authorization.

**Human litmus outcome.**

### Filter a month or owner from the renewal table

**If this was built correctly:** A first-time operator lands on Renewals, sees owner, tenant,
location, renewal date, current RentVine rent, status, verification, and action for every row, then
filters to October or clicks one owner to see only that owner's leases without using a separate
search panel.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

### Work a blocked lease without losing the table view

**If this was built correctly:** The operator filters to blocked leases, follows the exact blocker
for one lease, completes app-owned work, and returns to the same filtered/sorted table with a clearly
available Clear filters control.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

### Navigate one lease without operational clutter

**If this was built correctly:** The operator opens a lease, sees one next action, selects any of the
six phases, and follows verified evidence without interpreting backend evidence-engine prose.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

**Requirement-to-outcome traceability.**

| Requirement                                      | Architecture outcome                     | Behavior outcome         | Human litmus            | Deterministic evidence / falsification                                                                                                                                                                  |
| ------------------------------------------------ | ---------------------------------------- | ------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One data-rich, non-duplicated table              | `ARCH-S82-1`, `ARCH-S82-5`               | `BEH-S82-1`, `BEH-S82-3` | Filter a month or owner | Real export/process fixtures assert one row/lease, exact required cells, source refs, and absence of retired desk components/text.                                                                      |
| RentVine source-of-truth current base rent       | `ARCH-S82-1`, `ARCH-S82-5`               | `BEH-S82-3`              | Filter a month or owner | Fixtures separate RentVine rent, Sheet disagreement, resolution, charges, suggestion, and offer; displayed money stays exact RentVine or missing.                                                       |
| Sort/filter criteria live in columns             | `ARCH-S82-2`                             | `BEH-S82-2`              | Filter a month or owner | Query/component matrix covers every header control, opaque party key, bounded range, shortcut, AND/OR rule, direction, null-last behavior, stable tie, legacy `q`, and no displayed name in v2 URLs.    |
| Persistent state and obvious clear               | `ARCH-S82-2`, `ARCH-S82-3`               | `BEH-S82-2`, `BEH-S82-4` | Work a blocked lease    | Route/browser tests cover refresh, Back/Forward, copied URL, lease mutation/return, individual chip removal, Clear filters retaining sort, invalid/oversized deskView, and default entry.               |
| All current blockers/statuses directly clickable | `ARCH-S82-1`, `ARCH-S82-4`               | `BEH-S82-5`              | Work a blocked lease    | Destination tables cover every blocker and evidence source, missing fallback, new-tab security, and provider/store spies proving zero effects.                                                          |
| Guided phase-selected workspace                  | `ARCH-S82-1`, `ARCH-S82-3`, `ARCH-S82-4` | `BEH-S82-7`              | Navigate one lease      | Tests cover all six steps, current/selected/upcoming/completed states, exact back view, focus, and absence of dense process/authority prose.                                                            |
| Modern accessible table/workspace                | `ARCH-S82-2`, `ARCH-S82-4`               | `BEH-S82-6`, `BEH-S82-7` | All litmus entries      | Semantic table, keyboard, screen reader, contrast, target-size, zoom, contained-scroll, reduced-motion, retired-block absence, and preserved-copy-role checks fail first.                               |
| Fail-closed dependent reads and parity           | `ARCH-S82-1`, `ARCH-S82-5`, `ARCH-S82-6` | `BEH-S82-5`, `BEH-S82-8` | Work a blocked lease    | Progress failure, out-of-window open, exact resolution-link, and zero-rent fixtures prove retained rows, no invented phase/action, identical classification, and exact recovery.                        |
| Current decision and write authorization         | `ARCH-S82-7`                             | `BEH-S82-9`              | Work a blocked lease    | Render-to-decision, decision-to-approval, preview-to-claim, duplicate-record, legacy-record, and same-value/source re-resolution races all reject stale identity before persistence or provider effect. |

**Preservation set.**

S72 process/evidence/version/branch/invalidation; S75 contact/timing; S78 cohort, tracked-incomplete,
query compatibility, null ordering, and canonical routes; S80 role/Space/action parity; exact owner and
tenant source tiers; current-rent/base-charge separation; live-read completeness/currency;
discrepancy audit; packet truth; unsent-draft exact confirmation; source-write/send refusal;
connection status; PII/secret, copy, responsive, and provider-call gates remain green separately.

**Adversarial acceptance checks.**

- **AC-S82-1** — `ARCH-S82-1/5` reject row-order joins, neighboring lease values, guessed
  owner/tenant/date/rent, zero-for-missing rent, Sheet/offer/charge displayed as current rent, and
  per-row provider reads.
- **AC-S82-2** — `ARCH-S82-2` proves every exact v2 key/value/default/bound, fixed serialization order,
  first-value handling for repeated direct-URL keys, each filter/sort and combination, multiple
  owners/tenants, active/previous/missing party-key configuration, 1/120/121-day ranges,
  malformed/stale selected values, legacy no-version bookmarks and `q`, missing values, stable tie,
  clear-filter scope, source-array immutability, and no displayed party label in v2 URLs/logs/metrics.
- **AC-S82-3** — `ARCH-S82-3` rejects an absolute/relative path in `deskView`, unknown keys,
  a decoded value over 8,192 code units, repeated keys, noncanonical/altered state, open redirect,
  dropped query key, or ordinary workspace return link that resets a valid view. Separate S83 access-
  return fixtures prove `q`/`lease` are removed with the exact visible notice, every non-text filter is
  retained canonically, no customer/display text enters nested `return_to`, and the maximum legal
  once-decoded route remains under 32,768 UTF-8 bytes. Separate S88-import fixtures at 2,048 and 2,049
  assembled UTF-8 bytes prove the assistant handoff either preserves the complete return state or
  omits `return_to` whole while retaining exact capability/Space preselection; it never truncates.
- **AC-S82-4** — `ARCH-S82-4` rejects dead targets, unsafe schemes/hosts, mismatched RentVine lease,
  synthesized Gmail/Dotloop URLs, missing new-tab protections, and any click that changes status.
- **AC-S82-5** — `BEH-S82-1/2` prove one table row per lease, all required columns and shortcuts, one
  high-contrast count and top Clear filters control, and absence of every retired desk surface. A
  complete zero-row cohort renders exact unfiltered-empty copy with no invented action; a nonempty
  cohort filtered to zero renders exact filtered-empty copy and enabled Clear filters; partial,
  unavailable, denied, and failed reads cannot render either empty copy or an authoritative zero.
- **AC-S82-6** — `BEH-S82-6/7` pass keyboard/header-filter/focus/live-region/table semantics, AA
  contrast, non-color states, 44-pixel targets, 200-percent zoom, reduced motion, contained narrow
  scroll, phase selection, retired-block absence, and preserved-copy-role checks.
- **AC-S82-7** — Provider/store/action spies prove table/query/return/status/phase navigation performs
  zero progress, reconciliation, draft, send, source, action-key, or access mutations.
- **AC-S82-8** — Desk rows and the workspace loader use the same eligibility rule: review and
  out-of-window rows resolve, definitive skips expose no workspace-phase destination and resolve
  `not_found`, and production assurance selects only rows explicitly marked workspace-available.
  A route that retains a visible `aria-busy="true"` state past the bounded settle window fails the
  canary; the browser check also exercises a 340-CSS-pixel, device-scale-2 layout as the 200-percent
  reflow equivalent and refuses page-level overflow.
- **AC-S82-9** — S51 fixture and managed reconciliation fail when the root source-currency/read-
  completeness markers or any row's rent-verification, resolution-difference, overall/blocked,
  workspace-eligibility, blocker/action/destination-kind markers disagree with the external
  RentVine/Sheet/`live-review`/tracked-progress oracle and separately validated S72 process markers,
  including independently derived disposition and tracked-incomplete retention, or when an expected
  phase, access, blocker, or source link has the wrong cardinality or target. S72 markers prove
  process-to-guidance parity; they are not independent Gmail/policy/packet corroboration.
- **AC-S82-10** — A production-sized deterministic fixture loads and renders at least 320 unique
  leases within bounded budgets, with one row per lease and exact workspace/source-link cardinality.
  The bounded local browser smoke validates the full rendered cohort's count parity, unique ids and
  destinations, keyboard activation/focus, 44-pixel targets, and layout behavior without hardcoding a
  mutable live portfolio total.
- **AC-S82-11** — Render-to-resolution, resolution-to-approval, preview-to-claim, and same-value/source
  re-resolution races all refuse on fingerprint or resolution-version drift. Tests prove the exact
  queued proposal is displayed, bulk approval is bound per item, legacy records never appear
  current, one valid resolution clears every matching desk/workspace blocker, and source drift
  reopens every matching status and blocker.

**Forbidden actions / hard gates.**

No property-sale inference, offer/current-rent conflation, recurring-charge aggregation, guessed
party/date/rent/source/link, hidden completion, unsafe/open redirect, fake verification, client-side
guard substitution, new role/action/S64 authority, autonomous or in-app client send, RentVine/Sheet/
Dotloop/Drive write, action-key opening, customer value in logs/tests, literal official-brand claim,
or protected auth/Rules/gate push without exact owner direction.

**Dependencies / sequencing.**

S82 consumes S72 as process truth, S75 as waiting truth, S78 as cohort/query compatibility, S80 as
authority truth, S81 as connection navigation, S83 as the capability/Space request handoff, and
S85/S86 as visual/interaction foundations. Implement S85/S86 and S83
first in the full bundle so renewal authority can leave the desk. Table projection/query/navigation
and the workspace remain independently testable with an unavailable access handoff. Missing optional
provider links remain honest internal fallbacks and do not block the local slice.
The dedicated party-filter derivation key must be Secret Manager-bound and read back before v2 owner/
tenant shortcut exposure; missing configuration leaves only those filters unavailable rather than
leaking names or blocking all other table behavior.
The reopened remediation additionally joins the expanded S51 production-assurance and S54
verification contracts before release. That join does not reopen S97-S99 or widen any S100 effect.

**Standalone delivery contract.**

- **Deliverable now:** the deployed baseline plus the bounded conformance remediation: enriched
  projection, table, integrated sort/filter, legacy-query compatibility,
  filter persistence/clear behavior, trusted destinations, guided workspace, copy/visual/accessibility
  contract, and all refusal/recovery paths can be implemented without provider activation or data
  migration. Full-surface `ALL_GATES_GREEN` requires S85/S86 presentation checks and the reachable S83
  authority handoff before the old authority panel is removed.
- **Consumes, but does not assume during fail-first projection work:** S85/S86 visual/interaction
  foundations, S83 capability-guided access requests, and optional source/provider URLs. Their absence
  preserves the current presentation or produces a specific unavailable/Admin/internal fallback,
  never dead controls or fabricated links.
- **Externally blocked effect:** none. Missing external inputs keep their exact operational substep
  blocked but do not block the read-only table/navigation implementation.
- **Produces for downstream suites:** stable enriched desk/guidance projection, column-query and
  deskView contracts, phase/destination manifest, and measurable workspace-copy contract.

**Verification and delivery contract.**

1. Before implementation, capture current desk/workspace DOM, one-button/card/duplicate rendering,
   query behavior, lost return state, absent rent/blocker fields, source-read counts, and S72/S75/S78/
   S80 preservation. Add fail-first table, projection, query, deskView, destination, and copy checks.
2. Run focused real-shape model/query/component/route tests for desk, refresh, attention, cohort,
   identity, current rent, resolutions, process/follow-up, workspace, source links, UI primitives,
   copy, and new table/return contracts.
3. Exercise source state × process state × actor × table filter/sort × destination matrices, then
   browser keyboard, Back/Forward, refresh, copied URL, phase return, new tab, focus, zoom, and narrow
   contained-scroll checks.
4. Run `bash scripts/verify.sh`, inspect the mechanical diff, and audit secrets/PII, source values and
   links, query logs, exact action gates, runtime config, provider-call counts, protected paths, and
   traceability before authorized delivery.
5. Report `ALL_GATES_GREEN` only when projection, table, filters, persistence, links, workspace,
   accessibility, preservation, S51/S54 candidate assurance, promotion, observation, and exact served
   readback pass. Local green evidence alone does not close the reopened remediation. `BLOCKED` names
   only an exact protected-path issue after all independent work is complete.
6. Report one implementation terminal state: `ALL_GATES_GREEN`; `BUDGET_EXHAUSTED` only if a future
   user supplies an explicit budget; or `BLOCKED` only for one exact unavailable input/authority after
   every independent fail-closed path is complete. Human review and live provider effects remain
   separate evidence.

**Ordered prompt sequence.**

1. Re-verify the current real projection, query/route/back behavior, RentVine rent, Sheet comparison,
   resolutions, process/authority models, and every link target.
2. Freeze preservation and materialize fail-first table/projection/query/deskView/destination/copy and
   accessibility tests.
3. Extend the pure bulk projection and query/destination contracts without adding provider calls or
   state.
4. Replace the desk with the semantic table and persistent return flow; finish the phase-selected
   workspace and remove renewal authority only after S83 is reachable.
5. Falsify every source/process/actor/query/link/error state, run focused/browser/canonical gates, and
   ship only through the authorized release path.

**Deletion/merge recommendation.**

Retain while the conformance remediation is active. Remove only after its exact serving revision,
managed authenticated checks, source reconciliation, monitoring readback, and observation window are
green and durable product documentation/tests own the corrected projection and failure contracts.
