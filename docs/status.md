# PMI KC current status

Last updated: 2026-09-15 (UTC).

## Current feature

September 14 Feature 4 (RentCast failure repair) is IMPLEMENTED / PUSHED / MERGED, but its
production release FAILED OBSERVATION and was ROLLED BACK. Features 1-3 remain deployed;
Features 5-6 have not started. Remain on Feature 4.

Implementation `32d3ab5566f4a6e4a46672c298e44491fca1a923` was pushed on
`codex/renewal-rentcast-repair` and merged through PR #89 as
`4ece4ba11e5cb35c0f6703fd19d586a423d57697`. Existing focused tests passed (65), and full local
verification passed 6,532 units, 201 backend tests, policies and production build. PR CI 34929220447
passed after two failed-job retries: different waits in the existing mounted backend journey failed
before the unchanged job passed. Exact main CI 34929736602 passed all five jobs on its first attempt.

The reported retained lookup records HTTP 400. An exact-query diagnostic returned the provider's
insufficient-comparables error. Keeping all subject attributes unchanged, 2- and 5-mile requests
failed; a 10-mile request returned HTTP 200 with 15 comparables and an estimate. Raw responses and
customer values remain outside Git. Diagnostic reads made one successful billable request; no
customer draft/send or system-of-record write ran. The adapter passed replay of both actual responses.
The repair explains this refusal and exposes an operator-selected radius, retaining that radius
through the query, cache, observation and saved market basis. Source provenance, contractual base
rent, separate recurring charges, provider order and existing quota/action controls remain intact.
Provider guidance: https://developers.rentcast.io/reference/property-valuation.

Candidate `pmi-kc-app-rmu26u6xc-9a156b302dac` passed build, smoke, configuration, domains and eventual
v4 assurance, then promotion at 05:00:16 UTC. Earlier aggregate assurance failures remain in the
watcher log; separate Admin and reconciliation diagnostics passed without establishing their cause.
Production observation failed after 417,350 ms with one successful checkpoint: Dashboard navigation
timed out at 30,006 ms, with one request failure and missing landmark. All 311 records reconciled;
monitoring reported zero candidate 5xx and unresolved effects. No auth mismatch or mutation occurred.
The existing process required rollback and verified Feature 3 restored at 100% traffic. Independent
canonical/tagged version and runtime readback confirmed that restoration at 05:09:18 UTC.

The checkpoint is terminal `rolled_back_verified`, not complete. The watcher process was stopped
between attempts to prevent documentation closure from requeuing the same failed runtime. Its
scheduled task and release lock file remain intact. Resume Feature 4 from the preserved failure;
do not start Feature 5 or clear the failed receipt/checkpoint. Automatic approved authentication works.

## Serving release

Production serves `a5852eaf8b19c1af48295ec8fff77814a91a10c7` as `pmi-kc-app-rmu2508wj-67ca3e173ab5` at 100% traffic. Exact main [CI 34926252129](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/34926252129) passed on its first attempt. Candidate build, smoke, configuration, domains, Admin assurance, reconciliation, receipt-bound promotion and the 300,000 ms observation passed. Two successful checkpoints completed in 386,528 ms; all 311 source/projected/rendered records matched with zero missing records, duplicates, field mismatches or invalid destinations. Monitoring reported zero candidate 5xx and unresolved live effects. Canonical/tagged versions, traffic and the reviewed runtime configuration were independently read back.

Canonical: https://pmi-kc-app-kq6wuvpiva-uc.a.run.app. Captured predecessor: `pmi-kc-app-rmu21dwpb-3ea232a8339f`.
Configuration fingerprint: `sha256:3dd4b046d1a1b00f8233801bf80605978242ef348698bd0b9cdf4268cd53b28a`. Production + Live, managed runtime identity,
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

September 15 automatic browser OAuth renewal restored the approved WSL ADC identity binding.
CLI/ADC readiness and enrolled Admin browser authentication on both origins passed. No password,
code, passkey or CAPTCHA was entered. No account, IAM, claim, store location, permission scope or
security policy changed. Separate 24-hour authentication longevity remains unverified.
Earlier checkpoints retain their actual passed, failed or unpromoted outcomes; 919a2ae was promoted then rolled back after failed observation. Documentation-only closure does not deploy.
