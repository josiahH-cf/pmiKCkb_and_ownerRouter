# Working-App V1 Production Evidence — 2026-07-15

State: production working-app evidence checkpoint plus a locally verified hardening candidate. Core
desktop/phone browser acceptance and the rollback/restore rehearsal are complete. The canonical Test
Vendor reset/re-enable candidate still needs deployment; its secret-bearing human enrollment,
assigned-ticket, disable, reset, and fresh-enrollment acceptance remains pending.

This artifact records non-secret, bodyless production evidence. It contains no credentials, setup
links, TOTP material, Gmail content, customer data, or provider payloads.

## Release Layers

| Item                               | Value                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------- |
| Current serving commit             | `7ccd9f213d51d6723d1a6467fe656f3b4724d6a5`                                |
| Current serving Cloud Build        | `840e3b52-ae0e-43b8-bcbf-a25045d5705a`                                    |
| Current serving revision           | `pmi-kc-kb-demo-00026-cxk` at 100% traffic                                |
| Current serving image              | `sha256:1012dde4878af0c582c5c00f6fc1d5ad3374391ebfc1e2ae2e0747453b03a1ac` |
| Current serving predecessor        | `pmi-kc-kb-demo-00025-mhw`                                                |
| Local hardening candidate pins     | Verifier complete; pending commit, build, image digest, and revision      |
| Historical browser/rollback commit | `f02112d9f5ea3dd5a223a46bcc76a96a5c314b97` / `00025-mhw`                  |
| Historical rollback target         | `pmi-kc-kb-demo-00024-6b2`                                                |
| Firestore ruleset                  | `63b31613-59ba-495c-9ef3-455a5c593f51`                                    |

## Confirmed Production Application Evidence

The browser and rollback rows below were captured against the historical
`f02112d / pmi-kc-kb-demo-00025-mhw` checkpoint and remain valid as bounded evidence for that release.
They are not silently reassigned to the current local candidate; repeat the relevant checks and capture
that candidate's own prior revision after deployment.

| Surface                  | Evidence                                                                                                                                                        | Qualification                                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Persistent Lease Test    | Run `test-renewal-019f6599-af50-7451-88ea-e2592fc001a2` reached Done with 11 receipts, 11 attempts, state preserved after reload, and zero Live/provider calls. | Production app/Firestore Test-lane proof only; it is not Live-provider proof.                                         |
| Admin Test workspace     | Vendor 11/11, Lease 11/11, and Maintenance 19/19 completed with zero Live calls.                                                                                | Isolated invented-alias harness evidence.                                                                             |
| Desktop/phone browser    | All eight internal surfaces loaded signed-in; direct phone loads at 390x844 showed no horizontal overflow, visible alerts, or reproducible console errors.      | A one-off React hydration warning during an artificial rapid-navigation loop did not reproduce on clean direct loads. |
| Runtime logs             | The checked `00025-mhw` window contained zero Cloud Run ERROR entries.                                                                                          | Windowed operational evidence, not a claim that errors can never occur.                                               |
| Vendor MFA configuration | Identity Platform global MFA is ENABLED; the TOTP provider is ENABLED with adjacent interval `1`.                                                               | Human password/TOTP enrollment and challenge acceptance remains pending.                                              |
| Rollback/restore         | Traffic moved 100% to `pmi-kc-kb-demo-00024-6b2`; the unauthenticated redirect and signed-in Console remained healthy; traffic returned 100% to `00025-mhw`.    | Service and revision history remained intact; no data or provider action was changed.                                 |

## Locally Verified Candidate Hardening

This section describes the exact current local candidate and does not change the serving-checkpoint
record above.

- An Admin reason plus exact UID/status/invite-version preview resets only the canonical `.invalid`
  Test Vendor from `pending_setup`, `active`, or `disabled`.
- Completion rotates the Firebase UID and invalidates the old password, TOTP factors, sessions,
  action links, and UID-bound confirmations while preserving the stable Vendor id, Test tickets,
  assignments, mailbox history, and completed receipts.
- Prepared/completed recovery markers keep duplicate, concurrent, and partial reset states disabled
  and fail-closed. A winning initial claim writes bodyless
  `test_vendor_authentication_reset_claimed`; a successful UID-swap writes one canonical bodyless
  `test_vendor_authentication_reset` per invite increment. Post-claim/pre-swap failure retains claim
  evidence only. Reset constructs no delivery, OAuth, Gmail, vault, provider, Registry, or Live effect.
- A prepared-crash Admin reload binds the original source UID/status/invite-version tuple without
  returning UID. While the lease is live, only the original reason reproduces the confirmation; a
  different reason/takeover refuses. After expiry, a fresh Admin reason may rebind the validated tuple
  and atomically writes distinct bodyless `test_vendor_authentication_reset_recovery_claimed` evidence.
  The takeover quarantines every abandoned source/record/resolved UID, requires a distinct fresh UID,
  preserves one canonical reset audit and invite increment plus the separate recovery-claim audit, and
  remains unchanged when delayed old-owner work resumes.
- Disable/reset serialization refuses disable during claimed/prepared recovery before Firebase/audit,
  stales an old reset preview when disable wins first, accepts a fresh disabled-state reset, and does
  not let a completed marker block disable.
- Every Test mailbox read, draft/label write, confirmation creation, and reply commit transactionally
  revalidates the current active Vendor UID, active assignment, Test ticket/thread/mailbox join, and no
  claimed/prepared reset. Disable, deassignment, UID rotation, or reset claim revokes stale access
  before mailbox state, content, or receipt changes.
- Setup-link regeneration writes bodyless `test_vendor_setup_link_regeneration_claimed` at the winning
  claim and bodyless `test_vendor_setup_link_regenerated` only at successful completion. A
  post-claim/pre-completion failure retains claim evidence only. These lifecycle audits contain no
  target/replacement Firebase UID, setup link, plaintext reason, password, TOTP, secret, or
  mailbox/customer content; actor UID remains the authorized audit principal.
- The internal People and Access roster now requires both the configured hosted domain and a clean
  internal claim class. Any present `vendor`, `vendor_id`, or `data_mode` claim key—including false,
  empty, or malformed values—fails closed from the roster, Admin count, role/scope mutation,
  all-Spaces display, internal ID-token path, and internal session cookie. Canonical Vendor auth still
  requires the exact valid three-claim tuple plus its separate record/TOTP checks.
- After a successful revision creation, the deploy wrapper promotes that exact named revision to 100%
  traffic (never floating `LATEST`) and uses
  the supported `--no-invoker-iam-check` public-shell setting without adding an `allUsers` binding.

The frozen Vendor/synthetic focused suite passed 19 files/138 tests with typecheck, scoped lint, and
Prettier green. The final all-in-one wrapper independently covers the complete candidate below.

## Final Candidate Verification

The final candidate completed `bash scripts/verify.sh` after a clean `npm ci` installed 1,130 packages
and audited 1,131:

| Gate                                      | Result                                            |
| ----------------------------------------- | ------------------------------------------------- |
| Formatting                                | Passed                                            |
| Lint                                      | 0 errors; 8 known non-blocking warnings           |
| Strict TypeScript                         | Passed                                            |
| Unit                                      | 306 files / 2,178 tests passed                    |
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

- [x] Complete clean signed-in desktop/phone browser acceptance, including Workflow Communications,
      on the historical `f02112d / 00025-mhw` checkpoint.
- [ ] Deploy the locally verified reset/re-enable candidate and record its commit/build/revision/
      digest/prior plus automatic exact-revision promotion.
- [ ] Complete the human Test Vendor password/TOTP/assigned-ticket/mailbox/disable/reset/fresh-
      enrollment journey, recording no secret-bearing value.
- [x] Rehearse historical `00025-mhw → 00024-6b2 → 00025-mhw` traffic rollback/restore.
- [ ] Repeat signed-in desktop/phone acceptance and bounded rollback/restore against the deployed
      current candidate and its own captured predecessor.
- [x] Record the final current-candidate verifier result and synchronize the human HTML walkthrough/
      status evidence.

## Advisory Live-Action Activation

Live provider activation is per exact action. A missing provider contract, credential, authoritative
mapping, or Live Vendor mailbox setup keeps only that dependent Live action unavailable; it does not
invalidate the working application or its isolated Test workflow. Native TTL, additional indexes,
and Scheduler remain optional until measured volume warrants them.
