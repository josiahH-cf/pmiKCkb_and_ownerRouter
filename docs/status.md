# PMI KC current status

Last updated: 2026-08-31.

This is a present snapshot, not a changelog. Historical implementation detail remains in Git.

## Production

- URL: `https://pmi-kc-app-kq6wuvpiva-uc.a.run.app`
- Service/project/region: `pmi-kc-app` / `pmi-kc-kb-prod` / `us-central1`
- Serving revision: `pmi-kc-app-rmtg73suu-fe8734d35330`, 100% traffic
- Serving commit: `1d68c7fb0a4f3138b9d0ba410d221b44bfb5534c`
- Immediate rollback: `pmi-kc-app-rmtfzwn77-8153d75d1cd5`
- Descriptor: Production + Live; 11 Spaces; managed runtime identity
- Operating renewal Sheet: read source, write switch off
- Rehearsal Sheet and renewal-comp storage: not configured
- RentCast: reference reads selected, allowance 50
- RentVine renewal write: exact action non-executable; no live proof
- Direct client sends: closed; governed initiation ends with an unsent Gmail draft

The candidate for the serving commit passed exact identity and bounded root/sign-in/Ask/version smoke.
Its normalized runtime configuration matched the predecessor after excluding only the reviewed image
and `APP_COMMIT_SHA` identity. Promotion and stable canonical smoke/readback proved the exact revision
at 100% with the managed service account and all invariants preserved. The S30 action was reread
non-executable after promotion.

## Audited UI/UX and Dashboard initiative

- S82-S96 are complete implementation specifications and are not deployed behavior.
- `docs/feature-suites/README.md` is their single canonical queue. The first executable suite is S96,
  which closes the UX-005 connector-disconnect hazard before visual expansion.
- The queue then uses S85/S86 for visual and interaction foundations, S83 for access and authority
  relocation, S84 for primary navigation, S82 for renewal desk/workspace changes, S88-S94 for the
  bounded Dashboard assistant, S95 for atomic Dashboard cutover, and S87 for final product-wide
  content reconciliation.
- S94 executes once against strict S93-slot fixtures before S93; the later S93/S94 join is a
  verification gate only. S95 consumes S87's specified manifest while S87 implementation remains
  last, so the dependency graph is acyclic.
- The audit added exact privacy, URL-state, request-intent, notice/filter, citation/narration-size,
  cancellation, token, idempotency, compatibility, confirmation, recovery, and migration contracts.
- No P1-P3 priority is asserted because no task-frequency evidence is available. The audit HTML is
  repository evidence, not authenticated usability research or production certification.
- No production feature, cloud resource, action key, role, provider record, Sheet cell, draft, or
  client communication changed during this documentation-only audit.
- Documentation readiness uses two non-deploying commits: the complete specification closure must pass
  exact-SHA CI, then a pointer-only arming commit must record that evidence, point to S96, and pass its
  own exact-SHA CI. Until both are green, Gate 0 is pending rather than an implementation blocker.

## Renewal stabilization bundle

| Suite | Present outcome                                                                                                                                                                                                | Remaining external dependency                                                     |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| S77   | One browser/route/service draft preview, exact-confirm, one-attempt, and read-only reconciliation contract is deployed.                                                                                        | Client-approved copy still governs usable owner/tenant drafts.                    |
| S59   | Server-owned RentVine-to-RentCast query/evidence/cache provenance is deployed; base rent and reference comps remain separate.                                                                                  | Any future freshness/selection policy must be explicitly approved.                |
| S80   | One role/Space/effect matrix covers renewal pages, API methods, and controls; ordinary Editor work is separate from stronger approvals and exact actions.                                                      | None for the implemented matrix.                                                  |
| S72   | Immutable `renewal-v1` has six steps, detailed evidence/substeps, branches, reopening, legacy compatibility, and no effect authority.                                                                          | S66/Dotloop inputs and S30 live authority block only their exact substeps.        |
| S75   | One exact-identity waiting/contact/due projection drives renewal surfaces; targeted Gmail refresh is manual and read-only.                                                                                     | Confirmed timing values and override authority.                                   |
| S78   | One role-consistent Live desk owns identity, search/filter/sort/cohort/retention, progress, follow-up, and next-action truth.                                                                                  | None for the implemented desk.                                                    |
| S74   | Versioned owner/tenant copy, locked server facts/recipients, constrained prose, hashes, and channel-state separation are deployed review-only.                                                                 | Approved wording, mandatory/forbidden copy, and channel evidence.                 |
| S79   | One same-Space/lease receipt can bind one allowlisted image to deterministic Gmail draft MIME/readback behind a closed Drive key.                                                                              | Separate Drive configuration/authority for a live attachment.                     |
| S81   | Task-oriented Connections/Admin navigation is deployed without granting roles, actions, credentials, or provider effects.                                                                                      | None for the implemented navigation.                                              |
| S63   | Secure exact-four, source-read-only capture/baseline/evidence/report machinery is deployed with independent process/number/safety verdicts.                                                                    | Secure exact-four runtime/observation packets and real human review.              |
| S30   | The closed one-lease `endDate` proof runner is deployed with secure input, managed-actor proof, temporal freshness barriers, one-attempt forward/rollback, readback/reconciliation, and closed-state closeout. | Exact client designation and separate protected owner direction for a live proof. |

Every suite has a standalone architecture model, behavior model, human litmus, preservation set,
requirement traceability, explicit dependencies/non-goals, and deterministic delivery contract in
`docs/feature-suites/`. Green implementation is not presented as a live provider proof.

## S30 proof boundary

- Only one exact existing lease `endDate` is executable. The recurring-charge proof is unreachable
  because its exact provider readback seam has not been verified.
- Secure packets must remain in gitignored `temp/` or outside the repository. Tracked templates are
  intentionally invalid and refuse before credentials/provider access.
- Actor readback requires an enabled managed Google/Firebase Admin with Renewals scope and no
  vendor/test-lane claims.
- Source state is read twice. Actor, action, runtime, preview, and confirmation freshness are
  revalidated after each read immediately before writer construction.
- Forward and rollback have separate exact previews, execution ids, hashes, confirmations, durable
  one-attempt outcomes, and provider readbacks.
- RentVine provides no proven atomic compare-and-set or provider idempotency token. Ambiguous attempts
  never retry; reconciliation reports observed state without claiming causality.
- Closeout requires completed forward and rollback outcomes, committed seed false, and live action
  non-executable. No secure packet or live provider attempt has run.

See `docs/evidence/rentvine-one-record-proof-readiness-2026-08-30.md`.

## Verification

- Focused final S30 set: 22 tests passed, including the captured temporal-freshness failure and repair.
- Canonical local gate: 559 unit files passed plus one intentional skip; 5,064 tests passed plus four
  skips; 26 Firestore files/119 tests; all policy/static gates; 107-route production build.
- Production dependency audit: zero vulnerabilities. The complete development tree still reports six
  advisories (four moderate, two high), which are not production dependencies.
- Exact-SHA aggregate CI run `33330420327`: passed.
- Documentation/artifact closure commit `10dbdb007810aa9e38b0a524e1e15d983c98a7b6`: exact-SHA
  aggregate CI run `33335914690` passed; no deployment was performed because no served asset changed.
- Candidate/stable smoke, normalized configuration parity, traffic/Ready/runtime identity, and exact
  action readback: passed.
- Protected paths changed: none.
- Client/provider/data effects from S30 implementation/release: none.

## Product state available now

- Complete RentVine and operating-Sheet reads, source reconciliation, exact dispositions, current-rent
  confidence, RentCast reference comps, canonical renewal worklist, and lease workspaces.
- Six-step renewal progress and evidence with explicit blocked substeps rather than fabricated
  completion.
- Governed Gmail workflow reads, labels, replies, and exact-confirmed unsent drafts where the exact
  key and published copy permit; a person sends from Gmail.
- Manual linked-thread refresh and source-backed waiting/contact state; no continuous watch,
  Scheduler, autonomous follow-up, or model-triggered send.
- Console, 11 Spaces, processes, approvals, Admin, Maintenance, feedback, resident intake, Vendor
  boundaries, and work accountability.

## Exact external blockers

1. S63 secure exact-four runtime and observation packets plus owner review.
2. S30 exact one-lease/date designation plus separate protected one-key direction.
3. Client-approved owner/tenant wording, mandatory/forbidden copy, and channel-evidence rules.
4. Client-confirmed timing values and override authority.
5. Distinct rehearsal Sheet copy and blank proof cell.
6. S66 catalog and exact Dotloop OAuth/account/template/participant/field/signature/webhook/correction
   mappings; selected official contracts for other named provider seams.
7. Real human litmus verdicts. Model evidence never fills those fields.

## Locked safety

No autonomous or app client send, unconfirmed system-of-record write, operating-Sheet proof,
test-record substitution, guessed endpoint/identity/recipient/mapping/customer value, action-gate
inference, personal runtime identity, secret/client evidence in Git, or protected-path push without
exact owner direction.
