# Engineering Guidance

## Stack and Ownership

- Next.js App Router, React, strict TypeScript, npm.
- Firestore Native mode for app/workflow state.
- Firebase Auth/Identity Platform for staff Google auth and external Vendor password/TOTP.
- Vertex AI Search/Gemini for grounded retrieval and proposals.
- Gmail API for workflow-linked communication only.
- Cloud Run for production.

`app/` owns routes, `components/` owns UI, `lib/auth/` owns identity/roles,
`lib/firestore/` owns persistence, `lib/retrieval/` and `lib/citations/` own grounding,
`lib/llm/` owns model seams, and `lib/external-execution/` owns typed external action
identity/preview/claim/receipt/reconciliation.

## Working-App Boundary

- Production contains explicit Live and Test records.
- Legacy missing mode resolves to Live.
- Test uses reserved aliases, always-visible labels, and no-client adapters. It may write app/
  Firestore state and reach Done but cannot contact a provider or produce Live evidence.
- Live provider activation is per action. Missing configuration degrades that action visibly and
  never falls back to Test.
- Browser input cannot select or override a provider lane, authority object, Registry state, risk,
  or evidence.

## External Execution

Every Live effect requires a documented contract/mapping, least-privilege identity, exact
target/effect preview, role-specific human confirmation or Admin decision, deterministic
idempotency, one atomic claim, bodyless receipt/readback, reconciliation, monitoring, and
rollback/correction. Ambiguous outcomes do not retry.

No autonomous, scheduled, bulk, event-triggered, or model-triggered send is permitted. Workflow
Gmail actions start from an authorized renewal/maintenance entity; there is no general inbox.

## Testing

- Unit: data-lane resolution, source/citation, permissions, schemas, preview/receipt, UI states,
  and negative imports.
- Firestore: server/client boundaries, transaction state, lane mismatch, and idempotency.
- E2E: roles, Live/Test journeys, action confirmations, failure states, and zero provider calls in
  Test.
- Browser: desktop/phone, signed-in primary tabs, Vendor password/TOTP, Maintenance Test to Done,
  monitoring, and rollback target.
- Falsify cross-lane identity/assignment/adapter/receipt, duplicate claims, stale preview, changed
  source, wrong mailbox, guessed ticket, and ambiguous provider results.

## Security and Secrets

- No secrets, setup links, customer values, Gmail bodies, prompt payloads, or sensitive records in
  git/logs/URLs/audit.
- Prefer ADC, attached service accounts, DWD, OAuth vault references, and workload identity; never
  download service-account keys.
- Personal Google identities are prohibited.
- Test emails end in `.invalid`; Live recipients must come from authoritative workflow sources.

## Retention

Bodyless state, legal hold, bounded on-demand cleanup, and visible health are the V1 baseline.
TTL policies, additional indexes, and Scheduler automation are optional volume-driven changes.

## Definition of Done

- Behavior maps to `docs/facts.md`, `docs/plan.md`, product/spec docs, and the Live/Test contract.
- Tests cover happy, failure, and cross-lane abuse paths.
- Focused checks and full verification pass.
- Production deployment, signed-in browser acceptance, monitoring, and rollback are verified when
  the task is a release.
- `docs/status.md` and `docs/loop-state.md` name the exact resulting state.
