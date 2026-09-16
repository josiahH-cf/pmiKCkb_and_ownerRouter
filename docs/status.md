# PMI KC current status

Last updated: 2026-09-16 (UTC).

## Current feature

The renewal operator hub bundle (S114-S120, owner request of 2026-09-15) is in progress. Feature 1 of 7,
S114 independent lease-information and process sidebars, is COMPLETE and DEPLOYED (implemented at
`24b0be59`, released 2026-09-16 as head `b7fd04d1` / `pmi-kc-app-rmu46blcc-af55ec317652` on its third
attempt). Feature 2 of 7, S115 plain-language section help and lower-noise workspaces, is COMPLETE and
DEPLOYED: implemented at `dffc4f71`, integrated on main with the owner-directed WSL enrollment fix
(`41fe8f4b`), the S113 journey budget (`dea16616`) and the watcher client-lifecycle fix (`14b486a0`),
and released 2026-09-16 as head `3ca35870` / `pmi-kc-app-rmu4awn6p-67bd97a8824e` on its second attempt
(attempt 1 rolled back with verification after the production canary raced the work board's loading
heading; the canary now settles a route before asserting its landmark). S116-S120 have not started.

S114 replaces the expanded workspace header summary and inline glossary with two independent fixed
slide-out panels: Lease information (property, lease, rent references, owners/clients, tenants and
source records, each value separately selectable with an explicit copy control, one-audience
"Copy all" controls and owner and tenant desk click-back links over opaque party tokens) and Process
guide (glossary entries with step needs plus the single "Renewal dashboard sections" navigation).
Both panels stay open independently, close on Escape or their close control and return focus to their
toggle. A refused clipboard keeps the selectable value on screen and says so; copying records nothing
and grants no send, approval or provider authority. The operator guide step table gained the two panel
toggles and the tenant audience copy control, and steps 8-10 now use the serving section labels.

Verification on the exact commit in the native checkout: format, lint, types, 6,575 unit tests
(711 files), 201 backend tests, every policy check and the production build passed; core E2E passed
with 8 files and 4 intentional skips. The eight S114 tests failed before the implementation and pass
after it. On 2026-09-16 both compiled browser checks passed on `b29185a3` against the native
Demo + Live-read-only rehearsal: the renewal desk check (full cohort, keyboard sort and filters,
opaque party shortcuts, workspace sections, term parity, return and Back, narrow and zoom budgets)
and the renewal guide check (all 45 steps located, conditional steps reported separately). The desk
check needs a local-only rehearsal party-filter key because the header filters render only when
that key resolves; no check was relaxed. No client message was sent and no live record was written.
Human verdict: NOT RUN.

S115 adds a small contrasting "i" control beside every renewal section heading and work-area card.
Named "About <heading>", it opens the shared InfoTip (hover after 600 ms on a fine pointer, focus,
click and touch; Escape closes and returns focus) over plain-language help from a pure content model
of 33 entries: what the area is for, the real steps where a sequence exists, what saving records and
where it goes, what does not happen and the next real control. The "Start here" descriptions and the
redundant procedural paragraphs moved into that help; blockers, paused and expired states, refusals,
the draft banner and every confirmation consequence stay visible. Receipted effects show their state
label instead of an action key; the no-proposal Sheet and RentVine panels name the actual input,
action, role and destination. Genuinely manual required fields carry the required cue beside their
label; section navigation never lands on a help trigger; opening help issues no request. The operator
guide gained rows 47-51 for the About controls and the walkthrough names them.

Verification on the integrated head `14b486a0` in the native checkout: format, lint, types, 6,586
unit tests (712 files), 201 backend tests, every policy check and the production build passed; core
E2E passed with 8 files and 4 intentional skips; the compiled renewal desk check passed on its second
attempt after the documented cold-compile timeout and the renewal guide check located all 50 steps
including the five About rows. Eight of the nine S115 tests failed before the implementation and all
nine pass after it; the 88-file preservation set (969 tests) passed unchanged apart from the S113
backend journey now asserting the visible state label. Two watcher driver tests were red before the
client-lifecycle fix and are green after it. No client message was sent and no live record was
written. Human verdict: NOT RUN.

S115 released on its second attempt as head `3ca35870` / `pmi-kc-app-rmu4awn6p-67bd97a8824e` (candidate
assurance on the first pass, promotion verified 16:32:54Z, observation with two checkpoints in
381,795 ms, complete 16:39:08Z, all 2026-09-16). Attempt 1 (`9d6258bb`, candidate
`pmi-kc-app-rmu49gnyi-9cf475eedd55`) promoted and then rolled back with verification at 16:13:37Z:
the production canary asserted the work board's exact heading 750 ms after navigation while the
board still showed its loading panel, which carries its own heading. The canary now waits for the
route to settle before asserting its landmark (`f3406f3d`, fail-first tests, pinned by the head).
The exact head passed CI on its first run; canonical and tagged versions, traffic, revision
configuration, receipts, the observation report and the authorized domains were read back.

## Serving release

Production serves `3ca35870b8adf561fb27d935cfba5a52c53cd43b` as `pmi-kc-app-rmu4awn6p-67bd97a8824e` at 100% traffic. Exact main [CI 35119806402](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/35119806402) passed on its first run. Candidate build, smoke, configuration, domains, Admin assurance (first pass), reconciliation, receipt-bound promotion and the 300,000 ms observation passed. Two successful checkpoints completed in 381,795 ms; all 311 source/projected/rendered records matched with zero missing records, duplicates, field mismatches or invalid destinations. Monitoring reported zero candidate 5xx and unresolved live effects. Canonical/tagged versions, traffic, authorized domains and the reviewed runtime configuration were independently read back.

Canonical: https://pmi-kc-app-kq6wuvpiva-uc.a.run.app. Captured predecessor: `pmi-kc-app-rmu46blcc-af55ec317652`.
Configuration fingerprint: `sha256:15843526497d71aa154071ba31d3e1792303ca18f5604c1602cb855f7c5d2840`. Production + Live, managed runtime identity,
eleven Spaces, enabled Sheet switch, false Demo flags, RentVine/RentCast bindings and allowance 50
were preserved and read back. Monitoring passed with its unchanged managed recipient.

## Completed scope and verification

S113 F1-F5 is COMPLETE / DEPLOYED: the full dashboard, typed corrections, supported Sheet/RentVine
updates, operator-triggered RentCast comp/trend preparation, approved rich/plain template copy,
governed unsent Gmail drafts and recovery, audited manual cycles and the integrated operator journey.

Persistent labeled insurance-flyer, renewal-information-form and seven legal-form location boxes accept blank pending-team inputs. Only output requiring a real verified resource waits; placeholders never become customer links or legal content.

All 33 in-scope adversarial findings are closed. Local verification passes 6,528 unit tests with
four existing skips, all 201 backend tests, policy checks and production build. Core HTTP E2E
passes 31 tests; 18 Firestore-dependent cases are intentionally covered in the separate backend
group. All seven compiled browser checks passed, including the 42-step guide and full-cohort desk.
Human review remains NOT RUN. See [review evidence](evidence/s113-implementation-review-2026-09-10.md).

Staff-recorded completion reports actual outside work and remains separate from provider-verified effects. Backend journeys use actual controls, routes, Firestore, claims, receipts and readbacks with deterministic external adapters; no live customer effect was created to demonstrate completion.

## Resulting backend state

Production readback: resource version 0, 0 configured entries, 0 verified resources; lease_renewal_workspaces=1, lease_renewal_workspace_cycles=1, renewal_resource_locations=0, renewal_message_preparations=0, renewal_message_draft_heads=0, renewal_message_draft_snapshots=0. Both supplied v2 owner/tenant publications remain approved. Actual serving GETs read the selected lease workspace, RentVine durable status and both publication states with zero mutation attempts. No production completion was seeded.

Read-only Registry inspection confirmed the prior S113 metadata remains aligned. The Registry
still contains 48 entries and 16 open keys. No Registry metadata or authority changed in Feature 1.
No customer draft/send, paid comp, source write, historical proof or signature effect ran for proof.

## Downstream and authentication limits

S106/S34 normal packet preparation, approval, exact S21 bytes, S20 queue/ledger execution and own-receipt recovery are implemented and deployed. Real approved forms/catalog/mappings, managed Dotloop credentials/connection/selection and separately authorized exact-key activation remain gates. Both Dotloop keys remain closed. Signature work is a human handoff; document presence and submitted content hashes do not prove signatures or provider-owned content verification.

B-FLOW1 and compiled-browser acceptance are closed. S100 resident-draft and B-MNT1 inputs remain
separate; S36 is queued behind complete S100. S87-S95 and S101 remain outside this scope.

The owner-approved v4 receipt records only the exact blocked predecessor My Work reconcile defect on `d243911cb20ffb01773072c0e27c723648eeea34` / `pmi-kc-app-rmtkmhj1z-8855e4c6dbfb` as `failed_known_legacy_defect`. The single request was aborted before dispatch; its matching browser failures remain recorded. Candidate and post-promotion checks passed with zero mutation attempts. Editor browser coverage is `not_run` under the owner-approved Admin-only policy; backend role restrictions remain.

The owner enrolled WSL CLI/ADC at 2026-09-16T01:11Z; that session expired at about 10:01Z with Google
requiring reauthentication for every gcloud and ADC refresh, so observed authentication longevity is
under nine hours, not 24. The owner re-enrolled at 13:59:18Z and `auth:ensure` at 14:01Z reported READY
for gcloud, ADC, env and gh with token refresh verified; the watcher's own preflight and cloud reads
succeeded throughout the S115 release. The enrolled Admin browser profile authenticated on the
candidate and canonical origins during every S114 and S115 assurance and predecessor baseline; one
momentary canonical session gap at about 16:23Z was closed at 16:27:11Z by the existing
`auth:enroll-canary` reusing the session with no human input. The isolated built-in browser pane holds
no application session and Google asks for an
email there; that is an owner step the release contract does not need. No password, code, passkey or
CAPTCHA was entered. No account, IAM, claim, store location, permission scope or security policy changed.

S114 released on its third attempt (attempt 1: interop gcloud runtime stalled the observer; attempt 2:
the owner's enrollment expired during observation; both rolled back with verification). S115 released
on its second attempt (`3ca35870`, candidate `pmi-kc-app-rmu4awn6p-67bd97a8824e`): attempt 1 rolled back with
verification at 16:13:37Z after the canary raced the work board's loading heading; attempt 2 passed
smoke, fingerprint, domains, candidate assurance on its first pass, promotion (verified 16:32:54Z)
and the observation (two checkpoints, 381,795 ms) and completed at 16:39:08Z. The watcher ran
natively on the same lock throughout and now carries the client-lifecycle fix. Every attempt's
receipts, reports and checkpoints are preserved outside Git; earlier checkpoints retain their actual
outcomes. Documentation-only closure does not deploy.
