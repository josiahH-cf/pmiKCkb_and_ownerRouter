# PMI KC current status

Last updated: 2026-09-03.

This is a present snapshot, not a changelog. Historical implementation and proof detail remains in
Git and provider/app receipts.

## Production

- URL: `https://pmi-kc-app-kq6wuvpiva-uc.a.run.app`
- Service/project/region: `pmi-kc-app` / `pmi-kc-kb-prod` / `us-central1`
- Serving revision: `pmi-kc-app-rmtkmhj1z-8855e4c6dbfb`, 100% traffic
- Serving commit: `d243911cb20ffb01773072c0e27c723648eeea34`
- Immediate rollback: `pmi-kc-app-rmtkgn08q-db89a37c43dc`
- Descriptor: Production + Live; eleven Spaces; managed runtime identity
- Operating renewal Sheet: read source and exact S98 write target; write switch on
- Action Registry: 48 exact keys; 16 open and 32 closed; Firestore mirror 48/16 and non-authoritative
- RentCast: reference reads selected; allowance 50
- Direct client sends: closed; supported initiation ends with an unsent Gmail draft

The current serving release completed exact candidate identity/configuration, smoke, promotion, and
stable readback. The remediation slice below, the grounded renewal-completion suites, S102, the S51 preflight
identity-read fix, S103, S104, S105, S106, S34, S107, S108, S109, and S110 are committed through `5abf6dd` and deployed
as zero-traffic candidate `pmi-kc-app-rmtmuvjmp-b9f775e360aa` from commit
`5abf6ddae9f46b9ccc32c99bd70b2e9b3beb7455`; its
anonymous smoke passed at the exact commit, revision, tag, and service, traffic readback still shows
`pmi-kc-app-rmtkmhj1z-8855e4c6dbfb` at 100%, and it is not promoted.

## Delivered application baseline

- S85's official PMI Light/Dark theme and Appearance system, S86's shared interaction/recovery
  primitives, S83's capability-guided access requests/Admin review, and S84's grouped navigation are
  deployed.
- The original S82 table-first Renewal Desk and guided six-phase workspace are deployed. Party
  filters use opaque `p1_` URL tokens, and navigation alone cannot verify, advance, draft, send, or
  write a source.
- S97 is complete: the three exact RentVine renewal-date/recurring-charge keys passed bounded live
  proofs and are activated behind their exact human-confirmed contracts.
- S98's deployed baseline is proof-qualified: both exact keys are open, the temporary proof row is
  absent, and the runtime write switch is on. The serving revision still contains its historical
  fixed-row update/delete path. The current integrity remediation is not deployed: it makes normal
  product execution append-only, derives every append term server-side, generation-binds the
  lease-scoped one-attempt claim, preserves ambiguous recovery and immutable completed evidence,
  retires proof mutations, and refuses field update/delete/restore before writer construction until
  a provider-owned stable-row and expected-generation mutation seam exists.
- S99 is complete: exact work-order read/create/status-update keys passed bounded proofs and are
  activated. Proof work order 1731 is in its final Cancelled state.
- S100's closed implementation and manual chat sync are deployed. The chat-sync key passed its
  disclosed mark-read proof and is activated. No polling, webhook, RentVine chat post, or direct send
  is reachable.

## Committed, candidate-deployed, unpromoted remediation

Adversarial review reopened S82 conformance, added bounded S97/S98 write-integrity hardening, and
expanded S51/S54 assurance. The committed slice corrects nullable-rent display/draft behavior,
typed auxiliary-read degradation, desk/workspace packet parity, exact source destinations,
phase-local source-write panels, forced post-write source freshness, snapshot-bound discrepancy
decisions/approvals/Sheet claims, one resolution-aware blocker projection, visible scope/count/filter
behavior, loading/accessibility states, and browser coverage.

The same unreleased correction generation-binds S97 and S98 execution replay, verifies current
provider after-state before duplicate success, and leaves every ambiguous charge create unproven:
matching provider state cannot mint a success receipt or authorize deletion. It also removes browser
authority over Sheet row/value/source identity. Sheet proposals are scoped to the signed-in lease workspace and require the same current
server-derived lease/Sheet association through final claim and post-claim revalidation. The existing
field-update resolution/approval chain is preserved for historical compatibility but cannot reach a
writer. Only safe normal Sheet append remains actionable; the UI reports unavailable fixed-row
capabilities instead of offering a dead-end confirmation.
Completed S97/S98 proof windows are not reopened.

The assurance work adds deterministic evidence schemas and fixture coverage for managed Admin/Editor
read-only canaries, browser diagnostics, source/application reconciliation, monitoring readback,
fresh bound candidate/promotion receipts, exact rollback predicates, compensating rollback for a
promotion-side or ambiguous command failure, a versioned predecessor recovery gate, one-use receipt
authority, managed identity/emulator refusal, cancellable deadlines, and a complete five-minute post-
promotion observation with separated checkpoints. My Work entry and
navigation restoration also remain read-only until a user deliberately reconciles or records
activity. These changes are
not production behavior and cannot be called green until focused tests, the canonical verifier, core
E2E, exact-SHA CI, zero-traffic candidate checks, promotion, and live readback pass.

## Renewal-completion program (owner direction 2026-09-03)

The owner's specification package is grounded as S102-S111 plus the rewritten S34 and executes before
S36 and the assistant program. S102 (tenant current rent from the RentVine lease detail
`baseRentAmount`, with `unit.rent` kept only as a labelled reference) is committed in `ff200d3`,
carried by the current candidate, and not promoted. S103 (one lease-term projection over the exact
lease-detail `isMonthToMonth` signal, a `periodic_review` disposition with a 12-month review anchor,
a visible desk/workspace term with its own filter and scope, and an Editor-gated app-owned term
review bound to the lease view fingerprint) is committed in `0158c90` with exact-SHA CI green,
carried by the current candidate, and not promoted. S104 (one shared rent, term, and guidance
projection across the desk row and the lease workspace, with parity and view-continuation proofs) is
committed in `0f01353` with exact-SHA CI green, carried by the current candidate, and not promoted; production still uses the
heuristic skip signals and shows no term. Its local rehearsal browser smoke ran against live
read-only sources and also surfaced one pre-existing S84 behavior that is not changed here: because
the responsive navigation resolves on the client, a payload as large as the full desk briefly paints
the desktop navigation group at 320px and overflows horizontally until hydration completes. S105 (typed owner outcomes with reopening and non-renewal routing, a version-binding audit, and the
lifecycle and branch proofs) is committed in `13523c5` with exact-SHA CI green, carried by the
current candidate, and not promoted; its Dotloop phase link waits on S106 and S34. S106 (the Dotloop connection service, typed client, vault-backed tokens and refresh, selection
record, readiness projection, and health wiring) is committed in `af23da4` with exact-SHA CI green,
carried by the current candidate, and not promoted; only its live readiness check is blocked on the owner's OAuth application and a connected account. S34 (the concrete Dotloop provider, packet-snapshot-bound loop identity, durable loop link, readback,
and explicit signature handoff) is committed in `7b26107` with exact-SHA CI green, carried by the
current candidate, and not promoted; its live loop creation is blocked on
the owner's OAuth application, connected account, approved artifact content source, and key
activation, and both Dotloop keys remain closed. S107 (detached completion, read-only load-time
reconciliation of orphaned attempts, and one consolidated attempt summary) is committed in `ae93742`
with exact-SHA CI green, carried by the current candidate, and not promoted; it adds no job queue,
scheduler, worker, or automatic retry, so the recorded conflict with the owner package stands and an
uncertain attempt's next action is an exact re-confirmation by a person. S108 (the RentVine provider
snapshot on the work-order link, one waiting-on projection, the Admin-managed property preapproval,
preapproval-aware owner-approval routing, and the read-only blocker report) is committed in `03f7eee`
with exact-SHA CI green, carried by the current candidate, and not promoted; its rehearsal-browser
run proved the report, the waiting-on filter, and the cancel-first preapproval confirmation with no
provider call from a page render. Two constraints stay recorded rather than resolved: photo and
attachment synchronization into RentVine is closed, and the report links to the ticket because no
RentVine work-order dashboard URL is documented. S109 (structured resident intake, the deterministic
triage that owns urgency, evidence, copy, and completion, the reviewed troubleshooting catalog, the
suggestion-only model adapter, the promotion handoff, and the public report form) is committed in
`9b2c829` with exact-SHA CI green, carried by the current candidate, and not promoted; its
rehearsal-browser run proved the form is reachable with no session, that the token never enters a
request URL, and that a link with no token refuses. Public file upload stays forbidden, so the form
names the photos needed instead, and the owner still supplies the troubleshooting links and any
extension of the required-evidence table; their absence disables only the resource offer. S110 (the
closed three-intent assistant boundary, the work and renewal adapters, the extracted desk
orchestration, the result envelope, the route, and the Dashboard routing) is committed in `5abf6dd`
with exact-SHA CI green, carried by the current candidate, and not promoted; its rehearsal-browser
run asked all three questions plus an unsupported one and no write route was called. S111 remains
specified only. The S51
identity-read fix (bearer-only userinfo read) is committed and not yet exercised live.

## S111 integrated proof report (2026-09-04)

Each row is one integrated check, the command that produced it, and the outcome observed on commit
`5abf6dd` plus the uncommitted S111 slice. `BLOCKED` means an external input is absent; no blocked
row was converted into a human verification task, and none is reported as passed.

| Check                                                                                                      | Command                                                                  | Outcome                                                                                                    |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Foundation: lease rent separate from unit listed rent, month-to-month anchor derived or absent (S102-S104) | `npx vitest run tests/integration/s111-renewal-completion-proof.test.ts` | PASSED                                                                                                     |
| Owner outcomes: all four states, revision reopening, decline handoff (S105)                                | `npx vitest run tests/integration/s111-renewal-completion-proof.test.ts` | PASSED                                                                                                     |
| Dotloop connection and packet lifecycle against the provider fakes (S106, S34)                             | `bash scripts/verify.sh`                                                 | PASSED                                                                                                     |
| Dotloop live connect, refresh, revoke, reconnect, and loop create                                          | not run                                                                  | BLOCKED: the owner's Dotloop OAuth application and a connected managed account do not exist                |
| Continuation: orphan selection, read-only reconcile, uncertain next action (S107)                          | `npx vitest run tests/integration/s111-renewal-completion-proof.test.ts` | PASSED                                                                                                     |
| Maintenance: preapproval routing, provider status conflict, photo blocker handoff (S108, S109)             | `npx vitest run tests/integration/s111-renewal-completion-proof.test.ts` | PASSED                                                                                                     |
| Maintenance stores: preapproval versioning and the work-order snapshot (S108)                              | `npm run test:firestore`                                                 | PASSED                                                                                                     |
| Intake triage, promotion carry-over, and the S108 blocker (S109)                                           | `npm run test:firestore`                                                 | PASSED                                                                                                     |
| Troubleshooting resource offered to a normal report                                                        | not run                                                                  | BLOCKED: the owner has supplied no reviewed troubleshooting links, so the catalog is empty by design       |
| Preapproval routing against real property amounts                                                          | not run                                                                  | BLOCKED: an Admin has entered no property preapproval amounts yet; the record and its control ship in S108 |
| Assistant: blocked leases, month window, unavailable source (S110)                                         | `npx vitest run tests/integration/s111-renewal-completion-proof.test.ts` | PASSED                                                                                                     |
| Browser: maintenance blocker report, waiting-on filter, cancel-first preapproval                           | `npm run smoke:maintenance-blockers-browser`                             | PASSED                                                                                                     |
| Browser: public resident report form, fragment token cleared, no file input                                | `npm run smoke:maintenance-intake-browser`                               | PASSED                                                                                                     |
| Browser: three Dashboard questions plus one unsupported, no write route called                             | `npm run smoke:dashboard-assistant-browser`                              | PASSED                                                                                                     |
| Browser: every training-guide step located by visible text, desk to lease and back                         | `npm run smoke:renewal-guide-controls-browser`                           | PASSED (8 steps)                                                                                           |
| Canonical gate                                                                                             | `bash scripts/verify.sh`                                                 | PASSED (647 unit files, 6216 tests; 32 Firestore files, 168 tests)                                         |
| Core end-to-end suite                                                                                      | `npm run test:e2e:core`                                                  | PASSED (8 files, 31 tests, 4 files and 18 tests skipped)                                                   |

The operator training guide is `docs/products/renewal-operator-guide.md`, registered in
`docs/README.md`. Its step-to-control table is the input to the guide-control smoke, so a step that
names a control the application does not show fails the check rather than shipping.

## Blocked and queued work

- Promotion of the current candidate waits on two authenticated managed Admin/Editor browser
  profiles and a passing S51 monitoring resource set (currently `DRIFT`: one mismatched managed
  channel, no metric, no policies).

- S100 is BLOCKED only on `gmail.maintenance_resident_reply.draft_create`. Its exact proof requires a
  synchronized resident message mapped to a verified resident email in the signed-in managed
  mailbox; the designated proof thread currently has no eligible record. The key remains closed.
- S36 has not started. Its temporary Space pilot is queued behind complete S100 and must finish with
  the original eleven Stores, source/configuration, cleanup, and runtime flag restored.
- S88-S95 and S87 remain specification-only Dashboard assistant, Dashboard cutover, and product-wide
  decluttering behavior. S101 is a post-S87 specification-only read expansion. None is deployed.

## Current verification boundary

- Live `/api/version` and Cloud Run readback confirm the serving commit/revision and 100% traffic.
- Serving configuration confirms Production + Live and the enabled Sheet write switch.
- The committed registry contains 48 keys with 16 open; completed proof windows are closed.
- ADC is fresh and the established non-persistent access-token bridge can perform managed readback.
  The default gcloud refresh credential remains stale/noninteractive.
- No test totals, CI result, candidate result, or live assurance result for the current remediation is
  recorded here before it actually passes.

## Runtime inputs, not product questions

There are no unresolved product decisions. The S100 mapped resident/email, managed Admin/Editor
profiles and live services needed by S51, and the deterministic S36 source/pilot packet are exact
runtime inputs. Missing input blocks only its dependent gate and is never guessed or replaced with
Demo data, a personal identity, or a different production record.
