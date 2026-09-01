<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-stabilization-v2 -->

# S78 — Renewal desk triage and canonical operator journey

> Status: Complete and deployed on 2026-08-30. The canonical Live desk is role-consistent,
> searchable, sortable, filterable, current-month aware, and backed by one deterministic projection;
> the legacy notices route now enters the same canonical experience.

**Goal.**

Give renewal-space staff one canonical Live worklist where they can find, prioritize, and open the
right lease without losing current-month or already-started incomplete work.

**Current state / intended end state.**

The canonical `/lease-renewal` path now enters one Live desk for Renewals-space Editors, Approvers,
and Admins. One serializable item projects exact lease, property/address, authoritative owner, all
tenant, end-date, conflict, six-step process, waiting-on, last-contact, timing/due, retention, and
next-action truth. URL-backed search, sort, and filters consume that same item set as the attention
fold. The legacy notices path performs the same read guard and redirects to the canonical desk; no
Production surface claims that renewal work uses sample data.

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
| Canonical route redirect, Live desk/page/component/model/cohort code, workspace, and legacy notices page | Verified implementation truth | One canonical role-consistent desk, exact identity projection, deterministic URL query state, and legacy redirect are deployed.                                                    |
| Desk/cohort/refresh/workspace/notices/role/attention tests                                               | Verification evidence         | They preserve Live read and identity behavior and prove projection, URL ordering, Editor access, route consolidation, and shared attention-source behavior.                        |
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

- Model verdict: PASS - exact-source identity fixtures, exhaustive query tables, role/route checks,
  accessibility-oriented component assertions, focused tests, the canonical gate, exact-SHA CI,
  candidate smoke/configuration readback, and stable production readback prove the stated outcome.
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

S78 consumes the deployed S72 process, S75 follow-up projection, and S80 authority matrix. Missing
source or unconfirmed timing values still use the contracts' explicit unset/Needs Verification
states; S78 does not duplicate or weaken their truth.

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
  used by attention, S82/S97 source-action handoff, and task-oriented navigation.

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

**Implementation and release evidence.**

- Fail-first checks captured the missing query module, first-of-month cohort, and canonical notices
  behavior before implementation.
- Focused adversarial verification passed 16 files and 138 tests. The canonical gate passed 537 unit
  files with one intentional skip (4,885 passing tests and four skips), all 115 Firestore tests,
  every policy/static gate, the production dependency audit, and the 106-route build.
- Exact commit `9912ef2ff27c9a73a37e71f1ad54ef754af5e8d5` passed aggregate CI run
  `33294476282`. Zero-traffic revision `pmi-kc-app-rmtfd7hvu-a310a0d0db6b` matched that commit,
  preserved the reviewed runtime configuration, passed exact candidate smoke, and was promoted and
  read back alone at 100% traffic.
- Immediate rollback target `pmi-kc-app-rmtf9wrzz-4c981bf57679` was captured before deployment.
  S78 changed no action grant, protected path, source record, provider state, Gmail draft/message, or
  client-facing effect.

**Deletion/merge recommendation.**

Retain as the active S78 acceptance and release contract until the renewal stabilization suite is
consolidated; do not recreate the retired legacy product story.
