# S113 implementation and review evidence

Starting commit: `c9f46d8ff8718ff319a19581ff1119162d89c120` on main. Supplied work and all six
private template pages were preserved. Private PDFs, hashes and normalized source evidence remain
in the ignored September 10 pack; customer values and raw correspondence are not in Git.

## Current acceptance

F1-F5 implementation, actual backend paths and all 25 in-scope review findings pass acceptance.
The final compiled desk and guide pass with unchanged deadlines. Final documentation/contracts pass
241 checks, all policy/redaction checks pass and mechanical delivery passes. S113 00836a8 is pushed
with green exact CI and a verified zero-traffic candidate; browser assurance exposed the three
release findings below. Their corrections pass full ship verification; the new exact release remains pending.
Human verdicts remain NOT RUN.
No live customer effect is used to demonstrate completion.

| Gate                                          | Verified result                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full unit suite                               | `temp/s113-release-verify-r3.log`: 699 files / 6,488 tests passed, four existing skips.                                                                                                                                                                                                                                                                       |
| Actual backend paths                          | `temp/s113-release-verify-r3.log`: all 34 files / 201 backend tests pass, including actual GET receipt/status readbacks with no additional provider effects.                                                                                                                                                                                                  |
| Final policy/oracle/receipt/read-order checks | `temp/s113-final-focused-r4.log`: 11 files / 179 passed.                                                                                                                                                                                                                                                                                                      |
| Final correction/UI/documentation checks      | `temp/s113-affected-r10.log`: 13 files / 260 passed, including the new visibility regression.                                                                                                                                                                                                                                                                 |
| Final history controls and assurance boundary | R19 passes 52 affected UI/guide/route checks. `temp/s113-owner-get-guard-r20.log` passes 85 guard, policy, observation, receipt and watcher checks. The state-changing GET test fails before the guard correction and passes afterward.                                                                                                                       |
| Core HTTP E2E                                 | `temp/s113-canonical-r9.log`: 8 files / 31 passed; 18 Firestore-dependent cases intentionally skipped in this no-Firestore group. The separate backend suite passes.                                                                                                                                                                                          |
| Canonical ship verification                   | Accepted npm install, formatting, lint, types, full units/backend, router, falsification, current-doc paths/traceability/freshness, copy, redaction, budget and build phases across R7-R9. Final affected tests and lint pass; R28 production build and 45 affected role/read-only/freshness checks pass with the final workspace read-scheduling correction. |
| Compiled guide                                | R29 passes all 42 semantic steps with required correction/resource controls visible and exact desk return; conditional availability is reported separately.                                                                                                                                                                                                   |
| Other compiled browser checks                 | Navbar, Dashboard assistant, theme, maintenance blockers and maintenance intake pass in the retained compiled-browser logs.                                                                                                                                                                                                                                   |
| Desk browser                                  | R29 full-cohort smoke passes sorting/filtering, inspection refusal, active dashboard/sections, exact term parity/return, browser Back, keyboard, targets, narrow containment and zoom checks. All deadlines remain unchanged.                                                                                                                                 |
| Mechanical delivery                           | Complete 217-file patch extracted, reverse-checked against the worktree and checked against a clean starting Git index. Exact final extraction repeats after documentation closure.                                                                                                                                                                           |

## Release-correction closure

Canonical R2 passed clean install, formatting, full lint and types. Its first full unit run exposed
the two exact inventory omissions recorded under finding 24. R3 repeats formatting, affected lint,
types and every unit/backend test, then passes router, falsification, freshness, active paths,
traceability, copy, redaction, budget and production build. Result: 6,488 unit PASS (four existing
skips), 201 backend PASS, and all 25 findings closed. No assertion, timeout or role boundary was
weakened. The exact predecessor diagnostic and strict exception regression pass. New exact-SHA CI,
candidate assurance, promotion, observation and serving/backend readback remain required.

## Backend evidence and limits

Actual mounted controls call the owning routes, Firestore stores, transaction claims, S20 ledgers and
HTTP adapters. Deterministic adapters provide external effects; these are not live customer writes,
Gmail creations, legal-form/signature effects or production release proof.

- Fresh journey: typed Sheet proposal, exact execution, claim, receipt/readback and reload; explicit
  RentCast comp/trend calls, real metering and persisted observations; failed lookup retains prior
  evidence. Explicit owner terms, blank/saved resources, exact v2 publication, reviewed tenant copy,
  conditional charges/signature and denied-clipboard selectable fallback pass mounted controls.
- Disconnected Gmail refuses before claim. Reconnect uses the retained preview and creates one rich
  unsent draft through the real governed execution path with receipt/readback. Ambiguous attempts
  retain their exact RFC identity and immutable MIME; recovery cannot create another draft.
- Fresh and underway Editor journeys persist activity, counter/reapproval, non-renewal, staff
  completion, reopening and the owning desk projection. The independent release oracle reads the
  persisted manual head too. Staff completion never enters provider-verified completion inputs.
- Source integrity covers current/future intent, exact heads, charge inventory, row/header/cell
  representation, stale facts, formulas, ambiguity, duplicate claims and separately confirmed
  correction. Pending Sheet synchronization is visible and only an actual receipt verifies it.
- Normal S106/S34 continuation uses Editor preparation, Admin review and actual S20 queue/ledger
  paths. The HTTP adapter creates/reads a loop, retains its own receipt, downloads/uploads exact
  S21 bytes and recovers a missing projection without another effect. Changed publication refuses
  before claim; document metadata remains presence-only.

## Adversarial findings

1. Old-cycle comp/manual state could survive a cycle change. Current-cycle filtering, remounting
   and fresh same-cycle heads close the fail-before regressions; approvals/completion never carry.
2. A client import reached a server-only error module and caused a real-browser 500. The existing
   client-safe error owner fixes it. A separate lint-induced missing process binding was restored;
   types and all eight owning workspace tests pass without removing assertions.
3. Desk/release/guide checks described six-phase navigation. The five-section contract now checks
   every named region/link, exact targets and retained historical URLs. The captured predecessor
   keeps its complete legacy contract. Required fields cannot pass as conditional absences.
4. Packet recovery requires its own retained receipt, not a matching name. Exact participant refs,
   duplicate/orphan refusal, S21 bytes and changed-head checks are verified. Source outages preserve
   history without manufacturing a new effect.
5. Gmail recovery retains the original attempt across changed terms/cycles. Disconnection refuses
   before claim; publication/resources/current source are checked at claim; delayed ambiguity cannot
   replace a successful outcome. The unsupported default-account Gmail URL was removed in favor of
   the existing managed-mailbox instruction; the unchanged router boundary passes.
6. Conditional N/A requires reviewed applicability, an existing policy/predicate and reason.
   Unknown remains unfinished; changed terms reopen dependent work; explicit owner approval remains.
7. Resource validation rejects placeholder/local/reserved destinations. Blank insurance, information
   and seven legal-form locations are accepted pending-team inputs. A saved location does not publish
   legal content; unverified values never become customer links.
8. The normal packet executor initially violated S66's provider-free truth directory. The unchanged
   sentinel rejected it; the executor now lives under `lib/lease-renewal/execution/` with the same
   exact S20 gate, claim and receipt. Truth evaluation constructs no provider effect.
9. Correction/resource role denials lacked S83 access-request handoffs. Existing exact capabilities
   are now registered/rendered, preserving roles and the shared 44-pixel action target.
10. Browser enrollment closed before asynchronous verification settled. Three `return await`
    corrections preserve context lifetime and catch failures. Both deferred tests failed before
    and passed afterward, with 11 auth checks passing. This is the sole protected implementation
    change, authorized by the explicit local auth/release scope; no credentials/challenges are entered.
11. Owner-directed Admin-only browser acceptance is bound into strict version 4 receipts as
    `owner-admin-2026-09-10`; Editor is `not_run`. Backend Editor restrictions remain. Exact origin,
    SHA/revision/configuration, source reconciliation, one-use receipt, rollback and observation gates
    are preserved. The CLI actor and existing monitoring recipient remain separately bound.
12. The S51 oracle omitted manual heads and mistyped the numeric lease-id regex. It now reads real
    numeric lease details and strict persisted manual schema/identity, includes state in drift
    detection, independently derives next activity/completion/pending updates and checks exact anchors.
    An old manual head cannot reactivate a definitively skipped lease. Tests and backend readback pass.
13. Serial independent reads exceeded the existing desk budget. Sheet and supporting reads now start
    with the lease read; packet data waits for that exact snapshot. No stale fallback, Sheet cache or
    freshness relaxation was added. Warm real read improved from 28.509 to 16.359 seconds; the final
    browser remains the acceptance gate rather than that timing alone.
14. The guide found the actual correction form nested inside a collapsed advanced-history disclosure.
    The real-component regression failed on visibility before the fix and passes afterward. The form
    is directly visible; one history disclosure stays collapsed. The rebuilt 42-step guide confirms
    correction fields and all required resource boxes are visible.
15. Rehearsal lacked the production party-filter binding; the app correctly hid owner/tenant filters.
    Readback identified the existing Secret Manager binding. The ignored launcher reads that exact
    key into memory; no key/rotation/configuration or privacy assertion changed. An initial cold
    sign-in timed out; subsequent readiness returned 200 in 11 ms, and the guide passed. The desk
    repeats on that ready runtime, preserving the failed attempt as evidence.
16. Desk table links speculatively fetched unused filter and lease destinations during sorting.
    The request trace recorded six desk and two workspace prefetches. The rendered-link regression
    fails before the correction; table links now opt out of prefetch while selected destinations
    retain fresh source reads. No source cache, freshness floor or browser deadline changes.
17. Rehearsal inherited the Windows-mounted Cloud SDK path. The same approved WSL store and account
    pass refresh through the existing native Linux SDK. Fresh Sheet timing drops from 13.135 to
    2.298 seconds; the ready desk probe loads in 2.914 seconds. This is a local executable-path
    correction, not an identity, credential, source-cache or runtime production configuration change.
    Mounted-filesystem cold route startup remains separately observed and is not called browser PASS.
18. A reachable inspection-only workspace was incorrectly assumed to contain the active dashboard.
    The real page returned source facts and the correct action refusal. The new selector regression
    fails before correction. Candidate/guide checks now select actionable or tracked-incomplete
    workflows; the full-cohort desk smoke separately verifies inspection facts and absence of
    workflow/draft controls. Full five-section, term parity, return and budget checks remain mandatory.
19. Plain fragment anchors create a browser history entry without Next.js route state. The actual
    history trace shows an empty state on the section entry; Back restores the lease URL while the
    desk DOM remains. Section links now use Next.js navigation with prefetch disabled and preserve
    the existing explicit focus/scroll behavior. The rebuilt R21 browser trace verifies route state
    on the fragment entry and immediate restoration of the dashboard after Back; the full unchanged
    desk smoke remains the acceptance gate.
20. The approved owner account retains ordinary Admin authority, so assurance cannot claim the
    dedicated canary accounts' server restriction for it. The guarded browser now applies the
    existing shared state-changing GET refusals in addition to its GET/HEAD-only method firewall.
    Dotloop callback, comp-screenshot reconciliation and unparseable destinations fail before
    dispatch; genuine status reads remain. The new test fails before and all 85 affected checks
    pass afterward. No account, role, claim or server authorization changes.

21. R21 active-workspace and R23 inspection navigation exceeded 20 seconds. The R24 bodyless
    trace identified a 16.124-second complete fresh Sheet-context rebuild starting after the
    dashboard read; charge inventory took 1.173 seconds. The existing fresh rebuild now starts
    with the other independent page reads after both access guards, and is awaited only after
    dashboard projection. The actual page-function regression fails before this wait-order fix
    and passes afterward. No reader, cache, freshness floor, source-update path or browser deadline
    changes. R28 passes 45 affected checks, lint,
    router and build; R29 passes the complete unchanged desk and 42-step guide. R22b's full 201-test
    backend repeat passed unchanged; the earlier R22 transaction-race timeout is retained.

22. The predecessor selector waited on an absent modern row attribute before trying its legacy
    link. The actual selector regression failed first and passes after checking presence; the new
    candidate retains its strict active-workspace selector. The corrected predecessor diagnostic
    passes all 13 landmarks and has only the approved blocked My Work defect.
23. Browser diagnostics counted canceled same-origin Next.js page prefetch GETs as loaded-route
    failures. Only non-navigation fetches carrying next-router-prefetch:1 and net::ERR_ABORTED,
    outside API/static paths, are excluded. Actual navigation/API/other failures remain fatal.
24. Candidate workspace mounting used POST for genuine durable RentVine status; the guard blocked
    it. RentVine and analogous Sheet status now use GET with the same access/environment checks,
    strict parameters, actor-bound Sheet context header and private/no-store responses. Mutation
    operations remain POST and exact-confirmed. All 123 initial affected tests and type checking
    pass. Full ship/backend verification follows the final adversarial test additions.
    The first full unit run passed 6,486 tests and failed two exact inventories: the new GET methods
    and their local response-header updates were unclassified. Both methods now map to the existing
    read_workspace permission; only those exact harmless header operations enter the reviewed
    sentinel list. All assertions remain intact. The corrected full suite passes: 6,488 unit tests and all 201 backend tests.
25. The new exception serializer compared field count and values without requiring own properties.
    A deterministic adversarial check demonstrated that an inherited approved field could admit an
    unknown own field. The serializer now requires every approved field as an own property; the
    same check passes and a unit regression covers it. The runtime exception remains exact and
    does not change candidate or post-promotion acceptance.

The owner approved only the exact blocked legacy My Work reconcile exception on captured
predecessor d243911 / pmi-kc-app-rmtkmhj1z-8855e4c6dbfb at the canonical origin. Version 4 receipts
retain Admin `failed_known_legacy_defect`, Editor `not_run`, and exact blocked-request evidence.
The guard must successfully abort the single POST /api/work body {action:reconcile} before dispatch;
all route landmarks, monitoring and other diagnostics must pass. The candidate and post-promotion
checks still require zero mutation attempts. No business write is allowed by this exception.

The actual serving predecessor diagnostic confirms the exact exception: all 13 landmarks pass;
one blocked attempt, one matching request failure and one matching browser console error; zero
dispatched writes. The original report remains failed. Evidence:
`temp/s113-predecessor-exception-check.log`. No promotion is implied by that diagnostic.

S113 commit `00836a82b26aedf4d439fec6280c54ab7548cdd4` is pushed to main. Exact CI run
34525701558 passed all five jobs: 6,460 unit tests (four existing skips) and 201 backend tests.
The first backend lane had one mounted-journey wait timeout; its unchanged rerun passed.
Zero-traffic candidate `pmi-kc-app-rmtvz9r9f-10904b929fad` passed build, exact version/configuration,
anonymous smoke and domain gates. It failed browser assurance and remains unpromoted. Production
still serves `d243911cb20ffb01773072c0e27c723648eeea34` / `pmi-kc-app-rmtkmhj1z-8855e4c6dbfb`.
Release corrections pass full verification and adversarial review; a new green commit and candidate are required.

## Scope, authority and downstream handoff

Frozen ARCH-S113-1–9, BEH-S113-1–12, AC-S113-1–13 and H1–H8 remain the acceptance map. The initial
preservation set passed 98 checks; fail-first source/dashboard/intent checks and later focused
correction/content/manual tests remain in their retained logs. Explicitly amended requirements are
six-phase inspection, provider-only manual advancement, blanket normal Sheet refusal and the
owner-directed Editor-browser prerequisite. Other source/role/receipt/send boundaries remain.

No `production_allowed` value changes, new account/IAM/claim, client send, row deletion or historical
proof rerun is included. Secret/private-tree checks pass. The reviewed metadata update changes only
the two Sheet descriptions, preserving the 48-entry/16-open live Registry. Its read-only preview
passes; no metadata mutation has run. Existing source patches and new files are included in the
mechanical extraction; scratch/private files remain excluded.

S106/S34 normal controls and backend continuation are implemented. Actual approved catalog/forms,
participant mappings, managed credentials/consent/selection and the two exact closed keys retain
separate gates. The public API provides preparation/upload and human signature handoff; no signature
send/status API or legal content is invented. Missing links/forms do not block S113 manual delivery.

The exact supplied owner and tenant v2 internal templates were published and read back approved at
20:08:16–17 UTC September 10, with the existing Admin approver and exact immutable hashes. Owner:
`fab7ca03561df86c58cf0f8d5925768d8312e70a3b086594fa3f3652979d4989`; tenant:
`b30878953d8e38baa9414ddfde998353ef0528444dbc25ccc6d657a25a16f5fd`.
Bodyless evidence: `temp/s113-publication-readback.log`. Old review-only versions are not relabeled.
Production readback at 20:13:18 UTC reconfirms both approved hashes and no S113 workspaces, preparations, drafts or resource entries; no fake
completion is seeded. The three-page training guide and one-page meeting brief were visually checked.

Approved CLI/ADC refresh and human-completed canonical Admin enrollment pass. The old watcher was
stopped at its unchanged unpromoted assurance checkpoint to serialize this release; its state will
be retained as superseded when the exact new green main SHA is initialized. The separate 24-hour
longevity proof is unverified. Candidate-origin assurance, exact CI, candidate/configuration/domain
readback, promotion, 300,000 ms observation and serving/backend readback remain release gates.
