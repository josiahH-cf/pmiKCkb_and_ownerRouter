# PMI KC current status

Last updated: 2026-09-15 (UTC).

## Current feature

September 14 Feature 4 (RentCast failure repair) is implemented on
`codex/renewal-rentcast-repair`; full verification passed. It is not yet pushed, merged or deployed.
Features 1-3 remain deployed; Features 5-6 have not started.

The retained reported lookup records HTTP 400. Replaying its exact query returned RentCast's
insufficient-comparables error. Keeping every subject attribute unchanged, 2- and 5-mile requests
failed; a 10-mile request returned HTTP 200 with 15 comparables and an estimate. Raw responses and
customer values remain outside Git. These diagnostic reads made one billable successful request;
no customer draft/send or system-of-record write ran.

The repair distinguishes that provider refusal, exposes an operator-selected positive radius and
retains the actual radius through the query/cache/observation/market basis. Each lookup remains one
operator-triggered request; no automatic radius fallback occurs. Source attributes, property-type
omission, base-rent provenance and separate recurring charges remain intact. The initial 2-mile
radius remains; historical lookup display no longer claims a fresh request occurred on page load.
Provider guidance: https://developers.rentcast.io/reference/property-valuation.
Existing focused tests passed (65); the actual private failure/success responses passed adapter replay.
Full verification passed: 6,532 unit tests, 201 backend tests, policies and production build.
The existing PR/CI/serialized production release remains to complete Feature 4.

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
