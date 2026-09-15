# PMI KC current status

Last updated: 2026-09-15 (UTC).

## Current feature

September 14 Feature 2 (process glossary and guided completion) is IMPLEMENTED / PUSHED / MERGED / DEPLOYED.
Branch `codex/renewal-process-glossary`; implementation `6e77fd5`, rendering correction `a38a8cb`,
and release recovery repair `cc005df` merged through PRs #84, #85 and #86. Final merged/serving SHA
is `e689586ffd1a8b369a86df4c1a1bffa478bd609d`. The toggleable glossary explains actual steps, optionality, dependencies,
saved-value destinations and completion branches through independently expandable levels. Hidden entries
load on first expansion and remain mounted thereafter; existing editors and cycle-scoped saves remain.
Feature 1's unit/contact visibility and owner-filtered navigation remain deployed.

Full local verification passed 6,528 unit tests (four existing skips), all 201 backend tests, policy
checks and build. PR #86 CI 34919514189 passed on a failed-job retry; exact main CI 34919964550 passed
on its first attempt. Earlier asynchronous UI-wait failures retain their actual outcomes; no tests or
deadlines were added or relaxed.

The earlier `4e1a4a0` candidate `pmi-kc-app-rmu1zycgi-d28f58f32910` rolled back with verified recovery
after a missing observation report and an invalid retry schedule. Its failed report and terminal
checkpoint remain outside Git. The missing-report path now uses the existing durable exact-predecessor
rollback immediately; the original missing report's cause was not established. The fresh candidate's
missing reviewed env file was refused before deployment dispatch, reconciled after revision/traffic
readback, and resumed with the unchanged reviewed file. Fingerprint and assurance retries retain their
initial unverified outcomes. The fresh observation passed; no failed receipt was rewritten as a pass.

Feature 3 is next from newly inspected current main. Features 3-6 have not started. CLI/ADC and
Admin browser authentication passed automatically; unsent-draft and confirmed source-write boundaries remain.

## Serving release

Production serves `e689586ffd1a8b369a86df4c1a1bffa478bd609d` as `pmi-kc-app-rmu21dwpb-3ea232a8339f` at 100% traffic. Exact main [CI 34919964550](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/34919964550) passed on its first attempt. Candidate build, smoke, configuration, domains, Admin assurance, reconciliation, receipt-bound promotion and the 300,000 ms observation passed. Two successful checkpoints completed in 376,815 ms; all 311 source/projected/rendered records matched with zero missing records, duplicates, field mismatches or invalid destinations. Monitoring reported zero candidate 5xx and unresolved live effects. Canonical/tagged versions, traffic and the reviewed runtime configuration were independently read back.

Canonical: https://pmi-kc-app-kq6wuvpiva-uc.a.run.app. Captured predecessor: `pmi-kc-app-rmu1rxk29-9d8d576379d9`.
Configuration fingerprint: `sha256:98956b1e88c9a76d02c9a0fa97d33d6c4b255b760449db4e6c1f1d0b3474e831`. Production + Live, managed runtime identity,
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
