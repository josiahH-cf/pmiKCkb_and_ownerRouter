# PMI KC current status

Last updated: 2026-09-15 (UTC).

## Current feature

Feature 6 (global clarity and response times) is implemented on
`codex/renewal-clarity-response-times`; verification passed. It is not yet pushed,
merged or deployed. Features 1-5 remain deployed.

The shared navigation now describes each destination's purpose. The Dashboard and renewal table
explain where to start; lease sections name the work they contain and explain their inputs and saved
destinations. Market estimates, charge frequency, source notes and staff activity fields use plain
wording. Existing field identifiers, source provenance, value routing and draft/write boundaries remain.

The global Admin navigation previously loaded request rows and the managed-user directory just to
show a pending count. It now calls the existing count query after the same current-Admin check.
Independent Dashboard and shared decision-summary reads run together, retaining scope filtering,
source freshness and independent failure handling. No cache lifetime, policy or runtime setting changed.
These are observed code-path improvements; no numerical response-time claim is made.

Existing label assertions are aligned with the new copy. The release reader requires the captured
Feature 5 commit's old section labels and the candidate's new labels, preserving all section,
destination, visibility and safety checks. Full verification passed: 6,532 unit tests, 201 backend
tests, formatting, lint, types, policy checks and production build. Existing selectors were corrected
for the renamed sections; no test or deadline was added or weakened. Unit results are retained in
`/tmp/pmi-f6-verify-final.log`, backend results in `/tmp/pmi-f6-backend-rerun.log`, and remaining policy
and build results in `/tmp/pmi-f6-policy-build.log`. Push, merge and serialized production release remain.

## Serving release

Production serves `82a2cf80ab0e17c9a947a54204524f7cd282eb93` as `pmi-kc-app-rmu2a59tx-28c0417b4693` at 100% traffic. Exact main [CI 34935971798](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/34935971798) passed on its first attempt. Candidate build, smoke, configuration, domains, Admin assurance, reconciliation, receipt-bound promotion and the 300,000 ms observation passed. Two successful checkpoints completed in 374,876 ms; all 311 source/projected/rendered records matched with zero missing records, duplicates, field mismatches or invalid destinations. Monitoring reported zero candidate 5xx and unresolved live effects. Canonical/tagged versions, traffic and the reviewed runtime configuration were independently read back.

Canonical: https://pmi-kc-app-kq6wuvpiva-uc.a.run.app. Captured predecessor: `pmi-kc-app-rmu286tg6-b24d5e15315b`.
Configuration fingerprint: `sha256:0d835c222e2524b745142c79282e4bf779bcff497092b4a6f442ab47ee577cc5`. Production + Live, managed runtime identity,
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
