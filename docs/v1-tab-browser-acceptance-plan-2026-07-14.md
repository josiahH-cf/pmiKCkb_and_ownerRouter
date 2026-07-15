# V1 tab and browser acceptance plan

Date: 2026-07-15. Status: **final revision deployed and machine-accepted; private human Test Vendor
walkthrough pending**.

V1 acceptance proves that the deployed application can be used end to end. It does not require every
future external provider to be Live. Provider activation is inventoried independently, and an
unconfigured provider must appear honestly as unavailable while the production Test workspace proves
the corresponding application workflow without contacting that provider.

Run each applicable surface at desktop (1440×900) and phone (390×844). Verify keyboard focus,
readable state, no horizontal dead end, no secret/customer content in URLs or audit, and an always-
visible `Live` or `Test` marker wherever a record or action can write.

## Acceptance identities and records

- Internal Admin and scoped Editor accounts use `pmikcmetro.com` Firebase sign-in.
- Test Maintenance uses unit `unit:test-maple-204`, displayed as
  `TEST — 204 Maple Court Unit 2`.
- Test Vendor uses `vendor:test-summit-plumbing`, displayed as
  `Summit Plumbing Test Vendor`, with the non-routable address
  `service@summit-plumbing.example.invalid`.
- The Vendor id is stable workflow identity; the Firebase UID is a replaceable authentication
  generation. Never capture either the password setup link or MFA material in evidence.
- Test records persist in production Firestore and may reach Done. Every Test receipt says no provider
  was contacted and is not eligible as Live-provider proof.
- A Live action requires an exact target-labeled preview and human confirmation. Exercise a Live write
  only when that exact provider action is enabled and configured.

## Surface walkthrough

| Surface                 | Working V1 path                                                                                                                                                 | Required failure/recovery path                                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Console                 | Show Live operational data and the isolated Test workspace together, with freshness/provenance and a clear mode badge                                           | Provider outage is visibly unavailable; no Test fallback is presented as Live                                                                      |
| Spaces / Ask            | Open an authorized Space; return a cited source-backed answer; show `No Reliable Source Found` when unsupported                                                 | Wrong Space or missing source fails closed without a generic property-management answer                                                            |
| Approval Queue          | Open an item, review exact action/target/reason, and approve/return/snooze within role                                                                          | Stale, revoked, returned, or blocked work cannot execute or silently self-heal                                                                     |
| Workflow Communications | Open a workflow-linked thread/artifact, review source-visible content, and exact-confirm a permitted action                                                     | Wrong mailbox/thread/recipient, expired confirmation, duplicate click, or ambiguous send refuses                                                   |
| Lease Renewal           | Run the production Test journey through the typed actions and receipts; show each separately activated Live provider                                            | Unavailable provider stays named/unavailable; Test completion never marks that provider Live-proven                                                |
| Maintenance             | Seed the canonical Test ticket, move intake through assignment/status/activity/notes/receipts to Done                                                           | Cross-mode assignment, stale state, invalid file, or unavailable Live provider refuses with correction guidance                                    |
| Connections             | Show each provider's independent state and the action keys it enables                                                                                           | Missing contract, credential, mapping, health, or scope closes only the dependent Live action                                                      |
| Admin                   | Manage staff roles, source policy, Test Vendor provision/disable/reset, Test workspace, and release/provider status with reasons                                | Editor/Vendor denied; external Vendors stay out of People and Access; prepared-crash reload re-previews safely and remains busy until lease expiry |
| Notifications           | Open a relevant item into its exact governed workflow                                                                                                           | Cross-Space, stale, missing target, or read-state failure does not leak or dead-end                                                                |
| Vendor portal           | Complete Test password setup/TOTP, assigned-ticket mailbox, disable, Admin reset, UID rotation, and fresh password/TOTP access; Live OAuth activates separately | Old password/TOTP/session/action link/UID confirmation and guessed/deassigned/cross-mode access fail; Test cannot start OAuth                      |

## Write acceptance

For both Lease and Maintenance, exercise preview, role/risk, exact confirmation or approval,
one-attempt receipt, duplicate click, stale-state refusal, ambiguous-result reconciliation, and
correction. For Test mode, assert `provider_contacted=false` and `live_proof_eligible=false` on every
receipt. For a Live action, assert the named target, provider reference, and read-after-write result.

No acceptance step permits generic inbox browsing, free-form compose, autonomous/scheduled/bulk/
model-triggered sends, a guessed provider endpoint, QuickBooks post/pay, or destructive photo
replacement/deletion.

## Completion record

Capture bodyless evidence: commit/revision, route, role, viewport, mode, action key, timestamp,
expected/actual state, receipt hash, provider contacted yes/no, rollback result, and for Vendor reset
only `UID rotated: yes|no` plus preserved/invalidated state booleans. Never record either UID value,
password/setup link, TOTP material, session cookie, confirmation token, mailbox body, or customer
content. A business or technical owner may record observations, but a missing named signature does
not make a working app unready.

Application acceptance is complete when the deployed core surfaces and production Test journeys pass
and rollback is rehearsed. Each Live provider advances separately from unavailable/test-ready to
live-configured/live-proven/enabled after its own bounded proof; inactive future providers do not reopen
V1 application readiness.

## 2026-07-15 execution record

- Current production serves `38ebcf530e3fe193547806bace91246ccea20c0b` as
  `pmi-kc-kb-demo-rmrm9mp6v-04c897acee28` at 100% traffic.
- Fresh delayed desktop and 375px-phone loads covered Ask, Spaces, Approval Queue, Workflow
  Communications, Connections, Admin, Lease Renewal, and Maintenance with the expected headings, no
  horizontal overflow, and zero console errors.
- The acceptance sweep caught a real Approval Queue hydration mismatch: an implicit server/browser
  time-zone formatter emitted different initial text. The application now formats timestamps
  explicitly in `America/Chicago`; its regression test and the final fresh-route sweep are green.
- Signed-in Ask returned a Verified Source answer with citations on the exact final revision.
- The normal Lease Test journey reached refresh-safe Done with 11 receipts/attempts and zero provider
  calls; the persistent Maintenance Test ticket reached Closed; the Admin workspace passed Vendor
  11/11, Lease 11/11, and Maintenance 19/19 with zero Live calls.
- Traffic was moved 100% from `rmrm9mp6v-04c897acee28` to its captured predecessor
  `rmrm8t6y7-d250f83ddfee`, then restored 100% to the final revision. Both public sign-in surfaces,
  the protected unauthenticated redirect, and the existing signed-in Console boundary stayed healthy;
  the restored final-revision ERROR-log query was empty.
- The deployed revision adds canonical Test Vendor reset/re-enable and rejects any
  `vendor`, `vendor_id`, or `data_mode` claim evidence from internal People/Access and staff sessions,
  even when a value is false/empty/malformed.
- The canonical Test Vendor's private password/TOTP/assigned-ticket/mailbox/disable/reset/fresh-
  enrollment walkthrough is the only remaining human browser scenario. It must prove that the stable
  Vendor id, Test tickets/assignments/mailbox/receipts survive UID rotation while old authentication
  artifacts fail and no Live/OAuth/provider path is constructed.
- Automated browser/component acceptance must also interrupt at `prepared`, reload the normal Admin
  page, and prove only the original reason returns the same UID-free preview while the lease is live.
  After expiry, enter a fresh reason and prove it safely rebinds the validated original source, records
  a distinct bodyless recovery-claim audit, and uses a fresh non-abandoned UID without duplicating the
  prepared invite increment/canonical reset audit or allowing a delayed-old-owner effect.
- Interleave Admin disable with reset: claimed/prepared returns a no-side-effect conflict and recovery
  guidance; disable-first stales the old reset confirmation and a fresh disabled-state reset works;
  completed reset does not block disable.
- Force post-claim reset and setup-link failures. The bodyless claim event must remain, the completion
  event must be absent, and no audit/UI/log may expose the target/replacement Firebase UID, setup link,
  plaintext reason, password, TOTP material, or mailbox content.
- After reset claim, UID rotation, disable, and deassignment, retry a stale Vendor mailbox read, draft/
  label write, confirmation, and reply commit. Every operation must recheck current active UID,
  assignment, Test ticket/thread/mailbox, and reset state before returning content or changing state.
