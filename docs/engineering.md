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

- Production is Live-only on the `pmi-kc-app` Cloud Run service at
  <https://pmi-kc-app-kq6wuvpiva-uc.a.run.app>. It exposes no Demo/Test records, fixture seeder,
  simulator, or product rehearsal tools.
- Rehearsal is local. Its server-owned descriptor resolves exactly to
  `environmentKind:"demo"`, `dataContext:"live_readonly"`, and `source:"explicit"`; persistence,
  route mutations, server actions, drafts, sends, write-backs, and provider effects must refuse.
- A separately hosted Demo environment and its product fixture seeder are deferred. Do not
  provision, seed, or infer them from the local `demo` environment kind.
- Environment/context is validated server-side. Missing/unknown classification fails closed.
  Browser input cannot select environment/provider adapter, override authority/Registry/risk/
  evidence, or widen local Live-read-only authority.
- Live provider activation is per action. Missing configuration degrades that action visibly and
  never falls back to a synthetic adapter.
- Synthetic Vendor identities and workflow records are deterministic automated-test helpers only.
  Product runtime paths use authoritative Live assignments and must not construct or expose those
  helpers.
- The former Production Live+Test lane and hosted/seeded Demo designs are dated historical evidence,
  not current engineering instructions.

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
- E2E: roles, Production Live-only journeys, local Live-read-only effect refusals, action
  confirmations, failure states, and zero provider-effect calls from local rehearsal.
- Browser: authenticated desktop/390×844 whole tasks; header/overlay/first-action/focus/headings;
  exact field/provider/return links; Live Vendor invite/setup/TOTP/assignment/disable boundaries;
  resident token intake; local read-only navigation and effect refusal; Production Live-only;
  monitoring and rollback.
- Falsify cross-environment/context identity/assignment/adapter/receipt, unknown-mode→Live, shared
  resource identifiers, local provider-effect construction, mixed context counts, misleading generic
  links, duplicate rendered owners, unsafe compatibility redirects/deletion, duplicate claims, stale
  preview, changed source, wrong mailbox, guessed ticket, Live invite-generation drift, delivery versus
  disable races, stale mailbox reads/writes after disable/deassignment, and ambiguous provider results.
- Keep the UID-rotating reset/takeover/recovery cases as deterministic automated coverage of the
  retired Test Vendor contract only. They are not browser acceptance for a real Live Vendor.

## Security and Secrets

- No secrets, setup challenges, resident bearer tokens, customer values, Gmail bodies, prompt
  payloads, or sensitive records in git/logs/audit. A Live Vendor invite is exact-confirmed and
  delivered through governed Gmail; the setup challenge moves from the URL fragment into a body-only
  request and never enters a receipt, cache, log, or persisted lifecycle record.
- Prefer ADC, attached service accounts, DWD, OAuth vault references, and workload identity; never
  download service-account keys.
- Personal Google identities are prohibited.
- `.invalid` addresses are automated-test data only; Live recipients must come from authoritative
  workflow sources.

## Retention

Bodyless state, legal hold, bounded on-demand cleanup, and visible health are the V1 baseline.
TTL policies, additional indexes, and Scheduler automation are optional volume-driven changes.

## Definition of Done

- Behavior maps to `docs/facts.md`, `docs/plan.md`, the completed S55/S56 outcome, and product/spec
  docs.
- Tests cover happy, failure, cross-environment/context, exact-link, role, mobile, and deletion abuse
  paths.
- Focused checks and full verification pass.
- Production deployment, signed-in browser acceptance, monitoring, and rollback are verified when
  the task is a release.
- `docs/status.md` and `docs/loop-state.md` name the exact resulting state.
