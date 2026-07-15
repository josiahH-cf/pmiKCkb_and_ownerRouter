# Working-App V1 Production Evidence — 2026-07-15

State: production working-app evidence checkpoint. Core desktop/phone browser acceptance and the
rollback/restore rehearsal are complete. Only the secret-bearing human Test Vendor enrollment and
assigned-ticket acceptance remains pending.

This artifact records non-secret, bodyless production evidence. It contains no credentials, setup
links, TOTP material, Gmail content, customer data, or provider payloads.

## Candidate Identity

| Item                    | Value                                                                     |
| ----------------------- | ------------------------------------------------------------------------- |
| Git commit              | `f02112d9f5ea3dd5a223a46bcc76a96a5c314b97`                                |
| Cloud Build             | `0be21660-bfe6-47e7-8e33-ff1b5b21bd10`                                    |
| Serving revision        | `pmi-kc-kb-demo-00025-mhw` at 100% traffic                                |
| Image digest            | `sha256:23e75a9dc7ee22258794814e986dece1ba8303609f7d516ca5d58148109e4625` |
| Captured prior revision | `pmi-kc-kb-demo-00024-6b2`                                                |
| Firestore ruleset       | `63b31613-59ba-495c-9ef3-455a5c593f51`                                    |

## Confirmed Production Application Evidence

| Surface                  | Evidence                                                                                                                                                        | Qualification                                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Persistent Lease Test    | Run `test-renewal-019f6599-af50-7451-88ea-e2592fc001a2` reached Done with 11 receipts, 11 attempts, state preserved after reload, and zero Live/provider calls. | Production app/Firestore Test-lane proof only; it is not Live-provider proof.                                         |
| Admin Test workspace     | Vendor 11/11, Lease 11/11, and Maintenance 19/19 completed with zero Live calls.                                                                                | Isolated invented-alias harness evidence.                                                                             |
| Desktop/phone browser    | All eight internal surfaces loaded signed-in; direct phone loads at 390x844 showed no horizontal overflow, visible alerts, or reproducible console errors.      | A one-off React hydration warning during an artificial rapid-navigation loop did not reproduce on clean direct loads. |
| Runtime logs             | The checked candidate window contained zero Cloud Run ERROR entries.                                                                                            | Windowed operational evidence, not a claim that errors can never occur.                                               |
| Vendor MFA configuration | Identity Platform global MFA is ENABLED; the TOTP provider is ENABLED with adjacent interval `1`.                                                               | Human password/TOTP enrollment and challenge acceptance remains pending.                                              |
| Rollback/restore         | Traffic moved 100% to `pmi-kc-kb-demo-00024-6b2`; the unauthenticated redirect and signed-in Console remained healthy; traffic returned 100% to `00025-mhw`.    | Service and revision history remained intact; no data or provider action was changed.                                 |

## Final All-in-One Verifier

`bash scripts/verify.sh` completed successfully after a clean `npm ci` installed 1,130 packages and
audited 1,131. The release results are:

| Gate                                      | Result                                            |
| ----------------------------------------- | ------------------------------------------------- |
| Formatting                                | Passed                                            |
| Lint                                      | 0 errors; 8 known non-blocking warnings           |
| Strict TypeScript                         | Passed                                            |
| Unit                                      | 304 files / 2,089 tests passed                    |
| Router, falsification, context, redaction | Passed                                            |
| Spec traceability                         | 124 acceptance criteria across 14 specs           |
| Production Next build                     | 76 of 76 pages/routes built                       |
| Firestore                                 | 17 files / 59 tests passed                        |
| Core E2E                                  | 32 passed / 18 intentionally prerequisite-skipped |
| Cutover rehearsal                         | `cutover:dry-run` fully green                     |
| Full dependency audit                     | 3 Moderate; 0 High; 0 Critical                    |
| Runtime dependency audit                  | `npm audit --omit=dev`: 0 findings                |

All three Moderate findings are in the development-only
`firebase-tools → @google-cloud/pubsub → @opentelemetry/core` chain. They do not appear in the
production dependency tree and retain the documented 2026-08-15 recheck.

Verifier reliability was hardened without relaxing any timeout: Vitest is bounded to eight workers
instead of the host CPU-count default, and the publication 393,233-byte round-trip assertion now performs
an exact byte-length and byte-compare check instead of a costly deep structural comparison.

## Pending Acceptance Checklist

- [x] Complete clean signed-in desktop/phone browser acceptance, including Workflow Communications.
- [ ] Complete the human Test Vendor password/TOTP/assigned-ticket/mailbox/disable journey.
- [x] Rehearse traffic rollback to the captured prior revision, verify health, and restore the final
      candidate.
- [x] Record the final verifier result and synchronize the human HTML walkthrough/status evidence.

## Advisory Live-Action Activation

Live provider activation is per exact action. A missing provider contract, credential, authoritative
mapping, or Live Vendor mailbox setup keeps only that dependent Live action unavailable; it does not
invalidate the working application or its isolated Test workflow. Native TTL, additional indexes,
and Scheduler remain optional until measured volume warrants them.
