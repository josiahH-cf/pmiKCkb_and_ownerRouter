# PMI KC Product North Star

## Outcome

PMI KC is a stable full-suite product people use for source-backed knowledge, renewals,
Maintenance, decisions, and workflow-linked communications. It is not a demo shell, a read-only
preview, a developer lab, or a promise that every optional vendor integration is already active.

| Product lane            | End-state experience                                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PMI KC KB               | Source-backed Ask; primary Spaces knowledge directory; trusted content; role-aware shell; concise attention; task-based administration; explicit execution controls.                       |
| Lease Renewal Agent     | One desk and one per-unit workspace for Data check → Owner decision → Tenant offer → Build documents, with exact source comparison, evidence, drafts, receipts, and provider destinations. |
| Workflow Communications | Authorized renewal/Maintenance threads, governed labels/drafts, and exact-confirmed replies; never a general inbox, browser simulation, or generic compose surface.                        |
| Maintenance + Vendor    | Focused ticket work, tokenized no-second-login resident intake, scoped Vendor password/TOTP access, workflow communication, exact external actions, and safe close/reopen.                 |

Console is the front door for Ask and a bounded Work now summary. Approvals owns decisions,
Notifications owns event history/unread state, Connections owns provider setup, workflow desks own
work status, and Spaces is the primary knowledge destination. Operators should complete work
without learning Registry keys or provider architecture.

## Production and Local Rehearsal

- **Production** is Live-only on Cloud Run service `pmi-kc-app` at
  `https://pmi-kc-app-kq6wuvpiva-uc.a.run.app`. The former `pmi-kc-kb-demo` service is absent, and all
  28 governed collections contain zero explicit `data_mode:"test"` records.
- **Local rehearsal** resolves exactly `environmentKind:"demo"`,
  `dataContext:"live_readonly"`, and `source:"explicit"`. It may perform bounded Live reads, but it
  cannot persist, draft, send, claim, execute a provider effect, or write a receipt.
- The separately hosted Demo GCP project and fixture seeder are deferred. A zero-traffic tagged Cloud
  Run candidate is a Production release-validation surface, not a Demo environment.
- Deterministic invented fixtures, fake transports, emulators, and synthetic receipts remain only in
  automated tests/helpers. They never enter Production or count as Live-provider evidence.
- Blue/green is the Production candidate-revision promotion and rollback procedure.

## Product and Execution Rules

- RentVine is the operating system of record; LeadSimple orchestrates; Dotloop holds document
  packages; QuickBooks is accounting; Boom is auxiliary; Sheets is an exception/control surface.
  The app owns workflow state and verified provider backlinks.
- Every actionable item opens the exact field/evidence/next step and returns to its owning list.
  Use a verified record URL when documented; otherwise use an allowlisted provider front door
  explicitly labeled `Exact record link unavailable`. Generic navigation is not evidence.
- A missing provider contract blocks that Live action only. Build the app-plane, live provider, and
  full preview/confirmation/receipt/rollback contract to the documented seam; never guess an
  endpoint or preserve a fake provider as the finish line.
- Low/Medium enabled work follows role and exact-confirmation policy. Consequential High work
  requires the exact Admin decision. Technical blockers cannot be approved away.
- Client-facing sends and system-of-record writes are human-initiated and exact-confirmed. No
  scheduled, bulk, model-triggered, or autonomous client-facing send is a product capability.
- Every external execution has one claim, idempotency, a value-minimized receipt, safe error state,
  readback/reconciliation, monitoring, kill switch, and correction/rollback.
- The retired Production Test lane, seeders, simulators, Sample controls, and product fixture tools
  must not return. Static import reachability alone never proves a provider/security/rollback module
  is safe to delete.

## Safety Boundaries

- No secrets, tokens, customer records, Gmail bodies, bank data, SSNs, full leases, resident bearer
  tokens, or customer photos in git, URLs, manifests, release evidence, or value-minimized audit.
- Missing or weak sources produce visible uncertainty, not generic property-management answers.
- Local Live-read-only rehearsal cannot create an app or provider effect, and restored non-Live state
  fails closed rather than crossing into Production work.
- Personal Google identities never enter staff, connector, build, runtime, Firebase CLI, or cloud
  paths.
- Invented aliases use `.invalid` addresses/reserved IDs only in automated tests and cannot be
  contacted externally.
- Page/layout configuration cannot grant authority, change shell/roles/environment/provider gates,
  hide required controls, or invoke an executor.

## Operational Defaults

- Value-minimized retention records, legal hold, bounded cleanup, and visible health are the
  baseline. TTL, extra indexes, and Scheduler automation are added when the exact volume/operation
  warrants them.
- Readiness requires green deterministic verification, authenticated desktop/390×844 whole-task
  coverage, exact links, environment isolation, a pinned candidate revision, Production smoke,
  captured prior revision, and rollback readiness.
- Deterministic automated tests prove contract behavior, and local rehearsal proves Live-read-only
  projection/refusal behavior; only a lane-correct Live receipt/readback proves a provider. Provider
  activation remains per action and never changes the application’s product name.
- Preserve original specs in `docs/specs/`; current authority lives in `docs/facts.md`,
  `docs/loop-state.md`, `docs/ui-ux-recalibration-implementation-program-2026-07-28.md`, and active
  feature-suite specs.

## Success

The program succeeds when staff can understand every destination, complete renewal/approval/
Maintenance/communication work end to end, inspect exact source/provider destinations, and recover
from failures without hidden effects; residents can complete scoped Maintenance intake; local
rehearsal safely proves bounded Live reads and effect refusals; Production contains only Live work;
and provider activations can ship one action at a time without redesigning the application.
