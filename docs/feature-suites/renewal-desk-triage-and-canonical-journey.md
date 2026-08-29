<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-stabilization-v2 -->

# S78 — Renewal desk triage and canonical operator journey

> Status: Active; the Live desk is Admin-only, has a fixed chronological card list with limited
> identity/work state, and coexists with a stale Editor notices surface.

**Goal.**

Give renewal-space staff one canonical Live worklist where they can find, prioritize, and open the
right lease without losing current-month or already-started incomplete work.

**Current state / intended end state.**

The canonical `/lease-renewal` path redirects to an Admin-only Live desk. Cards show address, end
date, conflicts, four-step progress, and a next action, but not owner, tenant, waiting-on, last contact,
or policy-backed due state; there is no search or operator-selected sort/filter. A separate Editor
notices page still claims the desk uses sample data. The intended state is one role-consistent Live
desk and workspace, with complete source-backed triage facts, stable controls, and no contradictory
parallel product story.

**Actors and entry conditions.**

Editors, Approvers, and Admins with Renewals Space access may read the canonical desk/workspace.
Current Live RentVine/Sheet reads and their currency/completeness signals remain mandatory. An
incomplete or expired read stays visibly partial/too-old and cannot enable an effect.

**What it is / how it functions.**

The default cohort starts on the first day of the current calendar month and extends through 120 days
after today; a previously tracked incomplete renewal remains visible even outside that range with an
explicit overdue/out-of-window reason. The worklist supports normalized search across tenant, owner,
property/address, and lease id, plus stable sorting/filtering by end date, month, due state, owner,
tenant, workflow step, waiting-on, and source conflicts. Controls use explicit labels, preserve their
state in the URL, and never manufacture missing identity or timing facts. Desktop presentation favors
compact, scan-first rows/cards with stable columns and strong text/status grouping; narrow layouts may
stack content but must preserve the same facts, order, labels, target sizes, focus visibility, and
keyboard path. Color can reinforce status but is never the only signal.

**In scope / out of scope.**

In scope: canonical routing, Editor access alignment, desk projection, search/sort/filter, current-
month retention, visible work facts, accessible controls, and retirement/redirect/correction of the
stale notices surface. Out of scope: defining timing values (S75), changing process semantics (S72),
creating provider effects, global visual redesign, or Admin/Connections information architecture
(S81).

**Open questions & assumptions.**

Owner display may represent multiple authoritative owners. Missing owner/tenant/contact/timing data
renders Needs Verification or policy-unset; it is never guessed. The current 120-day future horizon is
preserved while the start boundary changes to the first of the current month.

**Cross-product impacts.**

Renewal routing, live desk/workspace loaders, cohort classification, progress store, S72 steps, S75
follow-up projection, AppShell navigation, notices compatibility route, and attention/work links.

**Authority and evidence map.**

| Input                                                                                                    | Classification                | Use and limitation                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md` Production+Live, Space, and no-effect boundaries                                             | Authority                     | The desk uses real current reads, never sample fallback, and search/sort/filter remains read-only.                                                                                 |
| Stabilization intake                                                                                     | User-approved intent evidence | It requires dense front-page visibility, current-month retention, owner/tenant search, due/waiting clarity, and clear controls; it does not authorize a whole-app visual redesign. |
| Canonical route redirect, Live desk/page/component/model/cohort code, workspace, and legacy notices page | Verified implementation truth | The current Admin-only fixed chronological cards and contradictory sample-data claim are measured defects.                                                                         |
| Desk/cohort/refresh/workspace/notices/role/attention tests                                               | Verification baseline         | They preserve Live read and identity behavior while new projection, deterministic URL-ordering, Editor-access, and route-consolidation checks fail first.                          |
| S72 and S75 projection contracts                                                                         | Compatible dependency         | Missing step/due/contact values must render explicit unset/Needs Verification and cannot be guessed for sorting or display.                                                        |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S78-1** — One serializable desk projection carries stable lease id, address/property,
  tenant, authoritative owner labels, end date, workflow version/step, conflicts, waiting-on, last
  contact, due state, and sort/search keys. Projection tests start from the real export shape.
- **ARCH-S78-2** — The canonical list and attention fold consume the same filtered/sorted source and
  stable comparator; route/query-state tests prove one URL produces one deterministic ordering.
- **ARCH-S78-3** — Page and API capability checks agree with S80: Renewals-space Editors can read and
  perform ordinary app-owned work, while Admin-only controls remain unreachable.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S78-1** — Search finds case/punctuation-insensitive tenant, owner, address/property, and exact
  lease-id matches; clearing search restores the selected sort/filter deterministically.
- **BEH-S78-2** — Each supported sort/filter has explicit missing-value behavior and a stable lease-id
  tie-break; current-month and tracked-incomplete leases cannot disappear because today advanced.
- **BEH-S78-3** — Every card exposes enough information to answer who/where/when/current step/waiting
  state/next action in a compact scan-first layout; every unavailable control explains the missing
  policy, data, role, or action, and status remains understandable without color.
- **BEH-S78-4** — `/lease-renewal` is the single product entry. The legacy notices path redirects or
  presents the same canonical experience and contains no Demo/sample claim.

**Human litmus outcome.**

### Find and prioritize a renewal

**If this was built correctly:** A renewal operator can search a tenant, owner, or address, include an
earlier lease from the current month, sort by the work that is due, and understand the next action
without opening several competing renewal pages.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

**Requirement-to-outcome traceability.**

| Requirement                                                  | Architecture outcome       | Behavior outcome         | Human litmus                                                         | Deterministic evidence / falsification                                                                                                                    |
| ------------------------------------------------------------ | -------------------------- | ------------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One complete lease-bound worklist projection                 | `ARCH-S78-1`               | `BEH-S78-3`              | Find and prioritize a renewal                                        | Real-shape fixtures prove every card/search value traces to exact source/progress/follow-up data; row-order coincidence and guessed nulls fail.           |
| Deterministic search, sort, filter, and cohort retention     | `ARCH-S78-2`               | `BEH-S78-1`, `BEH-S78-2` | Search owner/tenant/address and retain current-month/incomplete work | Query-state tables cover punctuation/case, every sort/filter, null ordering, URL round-trip, month boundary, 120-day horizon, and lease-id tie-break.     |
| Compact, explicit, accessible renewal UI                     | `ARCH-S78-1`, `ARCH-S78-2` | `BEH-S78-3`              | Understand next action without opening competing pages               | Component/accessibility checks cover labels, non-color status, focus, keyboard order, target size, desktop density, and narrow stacking with fact parity. |
| Editor-compatible canonical route with no stale sample story | `ARCH-S78-3`               | `BEH-S78-4`              | Use one renewal entry point                                          | Page/API/redirect tests cover Editor, Approver, Admin, denied users, direct legacy URL, and Production copy.                                              |

**Preservation set.**

Live read completeness/currency behavior, cohort reason classifications, stable lease identity,
attention-card links, Space isolation, Admin-only management controls, canonical routing, and existing
desk/workspace tests remain green separately.

**Adversarial acceptance checks.**

- **AC-S78-1** — `ARCH-S78-1` proves every displayed/searchable fact derives from the exact lease,
  progress, Gmail, or timing-policy source and never from neighboring row/order coincidence.
- **AC-S78-2** — `ARCH-S78-2` and `BEH-S78-2` prove every ordering, null rule, current-month boundary,
  URL state, and stable tie-break.
- **AC-S78-3** — `ARCH-S78-3` proves an Editor can reach the desk/workspace while Admin-only settings
  remain denied.
- **AC-S78-4** — `BEH-S78-4` proves no authenticated route tells a Production user that renewal work
  runs on sample data.
- **AC-S78-5** — Search/filter/sort changes no lease, progress, provider, or source-system record.

**Forbidden actions / hard gates.**

No guessed owner/tenant, sample Production fallback, client-side authority bypass, hidden
auto-completion, provider effect, automatic message, or broad navigation redesign.

**Dependencies / sequencing.**

S78 can implement its projection/controls independently with S72/S75 fields represented as explicit
unset states. Implement S72 and S75 before declaring the complete six-step/due experience finished;
S80 supplies the durable authority matrix.

**Standalone delivery contract.**

- **Deliverable now:** canonical routing, Live desk projection, first-of-month/120-day/tracked-
  incomplete cohort, deterministic query controls, compact/accessibility behavior, Editor read/ordinary
  access alignment, legacy-story retirement, and tests can reach `ALL_GATES_GREEN` alone.
- **Consumes, but does not assume:** S72 process and S75 follow-up fields use explicit version/unset/
  Needs Verification placeholders until their stable projections exist; no local duplicate truth is
  invented.
- **Externally blocked effect:** none for the read-only worklist. A protected auth-path correction may
  be `BLOCKED` under S80/AGENTS review rules, while all projection/UI/route work and a review-ready
  protected patch proceed.
- **Produces for downstream suites:** one serialized desk item/query contract and canonical lease URL
  used by attention, S63 review, and task-oriented navigation.

**Verification and delivery contract.**

1. Before editing, make the real-shape projection, query-state, current-month, Editor-route, and
   legacy-copy checks fail for their measured reasons; record Live-read/cohort/identity preservation.
2. Run `npm run test:direct -- tests/unit/renewal-desk-component.test.tsx tests/unit/renewal-desk-refresh.test.tsx tests/unit/lease-renewal-cohort.test.ts tests/unit/renewal-workspace-live.test.tsx tests/unit/live-notices.test.ts` plus new route/query/accessibility tests.
3. Run `bash scripts/verify.sh`, inspect the diff and protected paths, and audit sample fallbacks,
   customer values, guessed identities/timing, role/Space guards, URL leakage, source/effect calls, and
   desktop/narrow behavior.
4. Report `ALL_GATES_GREEN` only when projection, UI, route, role, and preservation gates pass;
   `BUDGET_EXHAUSTED` requires an explicit budget. Use `BLOCKED` only for an exact protected-delivery
   dependency, not for absent S72/S75 values already modeled as unset.

**Ordered prompt sequence.**

1. Capture current routing, role, cohort, card, and ordering behavior in fail-first checks.
2. Freeze live-read/cohort/Space/Admin preservation checks.
3. Build the projection, controls, current-month rule, role alignment, and route consolidation.
4. Test keyboard/screen-reader names, narrow layouts, null data, incomplete reads, and deterministic
   URLs before the canonical gate.

**Deletion/merge recommendation.**

Remove after the canonical Live desk is deployed, the legacy story is retired, and the durable
worklist contract lives in the renewal product documentation and tests.
