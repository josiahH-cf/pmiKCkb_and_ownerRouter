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

## Environment and Product Boundary

- S40’s target is independently provisioned Demo and Production environments using the same product
  routes/components/contracts. Production accepts Live only; Demo owns invented data/adapters/
  receipts and may expose a separate Live-read-only context with zero mutation/effect.
- Environment/context is validated server-side. Missing/unknown classification fails closed.
  Browser input cannot select environment/provider adapter, override authority/Registry/risk/
  evidence, or merge Demo and Live-read-only projection.
- Demo and Production must resolve different database/namespace, storage, queue/topic, secret/OAuth
  audience, runtime identity, and effect-credential boundaries.
- `F-PRODUCTION-DUAL-DATA-LANES` and missing-mode→Live remain honest current implementation facts
  until S40 migration; new code must not extend them as the target.
- Live provider activation is per action. Missing configuration degrades that action visibly and
  never falls back to Demo.
- The canonical `.invalid` Vendor auth lifecycle moves to Demo without losing its repeatable reset:
  preview binds UID/status/`inviteVersion`; execution rotates UID, clears factors, revokes sessions/
  confirmations, preserves matching Demo tickets/mailbox/receipts, and produces no Live effect.
  Partial failure remains disabled and exact-reset recoverable.

## UI and Retirement Boundary

- Shared shell: four daily destinations, primary Spaces knowledge destination, role-aware utilities,
  compact mobile disclosure, and plain task language.
- One owner renders each full collection; summaries/events use shared counts/links but do not copy
  full decisions, setup, workflow, or Space lists.
- Every actionable link carries exact entity/field/evidence/return context. External provider hrefs
  come from a reviewed HTTPS/host allowlist; a generic front door is labeled non-exact and never
  represented as evidence.
- Operator components may show point-of-use unavailability but not full Registry/readiness matrices
  or shipped developer simulators.
- Retirement is two-stage. A deletion ledger proves runtime/dynamic/route/script/rule/test/docs/
  provider/security/environment/rollback consumers; static reachability or file size alone is never
  sufficient.
- The page builder uses typed inert components/safe regions and imports no executor. It cannot alter
  fixed shell/routes, environment, role/scope, required workflow controls, Registry, or provider.

## External Execution

Every Live effect requires a documented contract/mapping, least-privilege identity, exact
target/effect preview, role-specific human confirmation or Admin decision, deterministic
idempotency, one atomic claim, bodyless receipt/readback, reconciliation, monitoring, and
rollback/correction. Ambiguous outcomes do not retry.

No autonomous, scheduled, bulk, event-triggered, or model-triggered send is permitted. Workflow
Gmail actions start from an authorized renewal/maintenance entity; there is no general inbox.

## Testing

- Unit: environment/context resolution, source/citation, permissions, schemas, preview/receipt, UI states,
  and negative imports.
- Firestore: server/client boundaries, transaction state, environment/context mismatch, and idempotency.
- E2E: roles, Production Live-only and Demo journeys, action confirmations, failure states, and zero
  Live-provider calls in Demo.
- Browser: authenticated desktop/390×844 whole tasks; header/overlay/first-action/focus/headings;
  exact field/provider/return links; Vendor password/TOTP/reset; resident token intake; Demo
  Maintenance to Done; Production Live-only; monitoring and rollback.
- Falsify cross-environment/context identity/assignment/adapter/receipt, unknown-mode→Live, shared
  resource identifiers, Demo provider construction, mixed Demo/Live-read-only counts, misleading
  generic links, duplicate rendered owners, unsafe compatibility redirects/deletion, duplicate
  claims, stale preview, changed
  source, wrong mailbox, guessed ticket, old Vendor UID/session/confirmation after reset, partial
  auth-reset failure, prepared-crash Admin reload/re-preview, live-lease different-reason refusal,
  post-expiry fresh-reason rebinding, claim-versus-completion bodyless audit ordering, abandoned UID
  reuse, forbidden replacement allocation, delayed old-owner completion against a takeover winner,
  disable/reset lifecycle interleaving, stale mailbox reads/writes after disable/deassignment/UID
  rotation/reset claim, and ambiguous provider results.

## Security and Secrets

- No secrets, setup links, resident bearer tokens, customer values, Gmail bodies, prompt payloads,
  or sensitive records in git/logs/URLs/audit. A Demo Vendor setup link exists only in the
  `no-store` Admin response that
  created it; the random reset password is never returned.
- Prefer ADC, attached service accounts, DWD, OAuth vault references, and workload identity; never
  download service-account keys.
- Personal Google identities are prohibited.
- Demo emails end in `.invalid`; Live recipients must come from authoritative workflow sources.

## Retention

Bodyless state, legal hold, bounded on-demand cleanup, and visible health are the V1 baseline.
TTL policies, additional indexes, and Scheduler automation are optional volume-driven changes.

## Definition of Done

- Behavior maps to `docs/facts.md`, `docs/plan.md`, the S40–S50 program, and product/spec docs.
- Tests cover happy, failure, cross-environment/context, exact-link, role, mobile, and deletion abuse
  paths.
- Focused checks and full verification pass.
- Production deployment, signed-in browser acceptance, monitoring, and rollback are verified when
  the task is a release.
- `docs/status.md` and `docs/loop-state.md` name the exact resulting state.
