# PMI KC current status

Last updated: 2026-09-16 (UTC).

## Current feature

The renewal operator hub bundle (S114-S120, owner request of 2026-09-15) is in progress. Feature 1 of 7,
S114 independent lease-information and process sidebars, is COMPLETE and DEPLOYED (implemented at
`24b0be59`, released 2026-09-16 as head `b7fd04d1` / `pmi-kc-app-rmu46blcc-af55ec317652` on its third
attempt). Feature 2 of 7, S115 plain-language section help, is COMPLETE and DEPLOYED (implemented at
`dffc4f71`, released 2026-09-16 as head `3ca35870` / `pmi-kc-app-rmu4awn6p-67bd97a8824e` on its second
attempt). Feature 3 of 7, S116 exact source links, reliable Sheet matching and complete contact emails,
is COMPLETE and DEPLOYED: implemented at `7a19d338` and released 2026-09-16 as head `33ef3039` /
`pmi-kc-app-rmu4eoy5u-c8c2682e9102` (first attempt, one assurance_unverified retry). Live email-column synchronization remains a named setup
dependency until the Sheet manager adds the two headers. Feature 4 of 7, S117 master lease facts, rent and charges with confirmed source updates, is
implemented and integrated on main at `bc559602`; its serialized release is next. S118-S120 have not
started.

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

S116 makes the renewal hub open the exact source record and stops an existing Sheet row from
being treated as absent. The actual cause of the reported missing-row defect was measured read-only
on 2026-09-16 with a counts-only inspection (no cell value, name or id): the operating tab carries
146 of its RentVine links as rich text attached to the cell, 1 as a bare URL and none as a formula, so
the formula-only read saw no link and offered an append; 110 of those rows reference current
leases, 34 lease ids are referenced by more than one row and 200 current leases have no linked row.
The Sheets reader now reads the attached-link layer (fields-limited, never values) and the exact
join merges the three layers; one fresh server-owned association (exact link, app note, confirmed
absence, or ambiguous with its reason: multiple rows, conflicting identity, unit-only link, a
plausible unlinked row carrying the tenant's name, or an incomplete read) governs the Sheet panel,
the append preview and the saved proposal; an ambiguous state is explained in plain English with the
row numbers to look at and offers neither append nor update. The RentVine record destination comes
from the validated lease id on the configured host and no longer depends on a Sheet link; a source
badge without a known destination is a plain badge, never a same-page loop; the scoped RentVine view
is named unavailable beside the record link; the created-draft link is labeled as the Drafts folder.
Every owner on lease.owners[] is addressed, a same-audience party without an email is named as
incomplete and refuses the final addressed draft, and the preparation shows and copies the complete
To/Cc set. Owner emails and Tenant emails (accepted Q3A) resolve as exact headers, are kept out of the
free-typed editor, and are prepared only from the RentVine roster through the existing
exact-confirmed field update with a missing-column setup state that names the two headers and the
tab; the app creates no column. The independent release reconciliation reads the same link layer,
reports duplicate rows as ambiguous like the app, and expects the record destination for every lease.

Verification on the exact integrated head `7a19d338` in the native checkout: format, lint, types, 6,635
unit tests (718 files), 201 backend tests, every policy check and the production build passed; core
E2E passed with 8 files and 4 intentional skips; the compiled renewal desk check passed on attempt
2 and the renewal guide check located all 53 steps including the three new rows. Every S116 test
was red before its implementation (6 link-layer, 11 association, 8 panel, 6 recipients, 8 audience
email, 6 destinations) and green after it; intentional contract changes: the desk exposes the lease
record destination without a Sheet link, the recipient resolution carries an `incomplete` list, the
supported Sheet field count is 21, the panel takes an association instead of a row flag, and the
independent projection reports duplicate rows as ambiguous instead of aborting. No client message was
sent, no live record was written and no column was created. Human verdict: NOT RUN.

S116 released as head `33ef3039` / `pmi-kc-app-rmu4eoy5u-c8c2682e9102` (first attempt, one assurance_unverified retry; candidate assurance receipt
18:14:48Z, promotion verified 18:15:08Z, observation with two checkpoints in 383,960 ms,
complete 18:21:47Z, all 2026-09-16). The exact head passed CI; canonical and tagged versions, traffic,
revision configuration, receipts, the observation report and the authorized domains were read back.
Live email-column synchronization is not verified: the two headers do not yet exist on the tab.

S117 makes Rent and charges the one working area for rent and charge facts. The card shows the
contractual base rent, the lease total and the unit-listed reference with their sources, every
recurring charge with its account-derived classification and schedule, the two intents (correct a
current fact; prepare future approved rent) and a per-destination status list for the app, the Sheet
and RentVine (saved, prepared, applied with receipt, read back, declined, needs reconciliation,
unavailable with its retained reason, or charge applied with the lease base rent still differing).
The fact editor, the future-rent control and both provider review panels sit inside that area and
Data check follows. One typed intent module builds the exact request bodies: a current correction
never carries the future-rent intent and a future preparation never produces a Sheet body or a
current-base correction. A known RentVine value is prefilled with its source shown; the source or
reason stays a manual required input. Both review panels show a dense exact preview at the decision
point (lease, source system, field or charge label, current and proposed values in business words,
effective timing, what the confirmation changes); receipt hashes stay on the receipt line. After a
succeeded current-base charge update the refreshed contractual base rent is compared with the applied
amount; a difference is a fresh mismatch under the effect and in the status list, never a completed
rent change, and the charge amount or lease total is never substituted for it. A future-rent effect
can be confirmed only while the owner's approved terms are current and the tenant's acceptance of that
exact terms revision is recorded: the route refuses before claiming the attempt, the live service
re-check agrees and the panel names the wait. This is a deployed behavior change required by the
specification's entry conditions. No key, route, role, executor, column or protected path changed.

Verification on the exact integrated head `bc559602` in the native checkout: format, lint, types, 6651
unit tests (722 files), 205 backend tests (35 files), every policy check and the production
build passed; core E2E passed with 8 files and 4 intentional skips; the compiled renewal desk check
passed on attempt 1 and the renewal guide check located all 60 steps including the seven new rows.
Every S117 test was red before its implementation (typed intents 5, outcomes 3, working area 3,
previews 5, backend route 4) and green after it; intentional contract changes: the RentVine review
preview reads in business words (two pinned lines), the S113 future-rent journey records the tenant's
acceptance before the Admin confirmation, and the page loads attempt records beside the attempt
summary. The full gate failed twice at the pre-existing S113 sheet-route journey race (the same
assertion that failed CI on the S116 closure): while a lookup is pending the button is named
Looking up… and the journey waited the default one second after the stubbed provider failure while
the route recorded the attempt in the emulator. The measured fix gives those two waits the same
ten-second budget the journey already uses for its other emulator-backed steps; the assertion is
unchanged and no product code changed for it. No client message was sent and no live record was
written. Human verdict: NOT RUN.

## Serving release

Production serves `33ef303959766f67bbf62878fe2ce283785c7eac` as `pmi-kc-app-rmu4eoy5u-c8c2682e9102` at 100% traffic. Exact main [CI 35131326258](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/35131326258) passed. Candidate build, smoke, configuration, domains, Admin assurance, reconciliation, receipt-bound promotion and the 300,000 ms observation passed. Two successful checkpoints completed in 383,960 ms; all 311 source/projected/rendered records matched with zero missing records, duplicates, field mismatches or invalid destinations. Monitoring reported zero candidate 5xx and unresolved live effects. Canonical/tagged versions, traffic, authorized domains and the reviewed runtime configuration were independently read back.

Canonical: https://pmi-kc-app-kq6wuvpiva-uc.a.run.app. Captured predecessor: `pmi-kc-app-rmu4awn6p-67bd97a8824e`.
Configuration fingerprint: `sha256:e6069b7017bb1b96dc1b2df20085211ebd472a1177065382569d4fbe167e3aaa`. Production + Live, managed runtime identity,
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

S116 released as head `33ef3039` (candidate `pmi-kc-app-rmu4eoy5u-c8c2682e9102`, first attempt, one assurance_unverified retry) through the same serialized
watcher: smoke, fingerprint, domains, candidate assurance, promotion and the 300,000 ms observation
passed and the release completed at 18:21:47Z. S115 released on its second attempt and S114 on its
third; every earlier attempt rolled back with verification and keeps its receipts, reports and
checkpoints outside Git. Documentation-only closure does not deploy.
