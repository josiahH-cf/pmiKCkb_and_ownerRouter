# PMI KC current status

Last updated: 2026-09-15 (UTC).

## Current feature

Feature 4 is IMPLEMENTED / PUSHED / MERGED / DEPLOYED. PR #89 merged `32d3ab5` as `4ece4ba`.
Serving SHA `2bf21ffe3821c1d2d32e3bb31cee9ccabb218e72` / `pmi-kc-app-rmu286tg6-b24d5e15315b`
completed the resumed production release. Features 1-4 are deployed; Features 5-6 have not started.

The reported retained lookup records HTTP 400. The exact query returned an insufficient-comparables
error. With subject attributes unchanged, 2- and 5-mile requests failed; 10 miles returned HTTP 200
with 15 comparables. The repair explains this refusal and allows an operator-selected radius retained
through query/cache/observation/market basis. Base rent, separate recurring charges, source provenance,
provider order, quota and action controls remain. Historical results no longer claim a fresh request.
Provider guidance: https://developers.rentcast.io/reference/property-valuation.
One successful diagnostic read was billable; raw responses/customer values remain outside Git.
No customer draft/send or system-of-record write ran.

Existing focused tests passed (65); full local verification passed 6,532 units, 201 backend tests,
policies/build. PR CI 34929220447 passed after two failed-job retries at different existing journey
waits; no code or assertions changed. Main CI 34929736602 and final CI 34931918778 passed.
The resumed release passed v4 assurance/promotion and two observation checkpoints in 378,909 ms.
Independent serving/version/runtime readback passed at 05:47:39 UTC. The watcher is active and complete.

The earlier `4ece4ba` / `pmi-kc-app-rmu26u6xc-9a156b302dac` observation failed on a 30,006 ms
Dashboard navigation timeout and verified rollback. Failed evidence remains outside Git. Aggregate
assurance failures retain their actual outcomes without an inferred cause. The existing complete
assurance function passed during a private diagnostic with the watcher paused between attempts;
no code, deadline, route assertion or release gate was weakened. The watcher then promoted the exact
receipted revision and completed observation. Feature 5 starts next from freshly inspected main.

## Serving release

Production serves `2bf21ffe3821c1d2d32e3bb31cee9ccabb218e72` as `pmi-kc-app-rmu286tg6-b24d5e15315b` at 100% traffic. Exact main [CI 34931918778](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/34931918778) passed on its first attempt. Candidate build, smoke, configuration, domains, Admin assurance, reconciliation, receipt-bound promotion and the 300,000 ms observation passed. Two successful checkpoints completed in 378,909 ms; all 311 source/projected/rendered records matched with zero missing records, duplicates, field mismatches or invalid destinations. Monitoring reported zero candidate 5xx and unresolved live effects. Canonical/tagged versions, traffic and the reviewed runtime configuration were independently read back.

Canonical: https://pmi-kc-app-kq6wuvpiva-uc.a.run.app. Captured predecessor: `pmi-kc-app-rmu2508wj-67ca3e173ab5`.
Configuration fingerprint: `sha256:092e20a589aeceda9ea0dad5cd5a2727b027eef68b5dd775380eb762793e06a9`. Production + Live, managed runtime identity,
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
