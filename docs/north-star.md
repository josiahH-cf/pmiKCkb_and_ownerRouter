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

## Demo and Production

The S40 target is two independently provisioned environments running one product contract:

- **Demo** uses realistic invented Demo data and Demo-owned stores/adapters/receipts. It can complete
  the same product workflows with zero Live-provider effects. If separately configured, it may show
  an explicitly selected, persistently labeled **Live read-only** context; that context never mixes
  with Demo records/counts and cannot mutate, draft, send, execute, or write a receipt.
- **Production** contains Live data only. Missing/unknown classification fails closed. Production
  exposes no Demo/Test seed, mode selector, simulator, Sample control, or lab.
- Both environments share routes, components, roles, validation, preview, decision, and receipt
  shapes; they do not share databases/namespaces, storage, queues, secrets, OAuth audiences,
  runtime identities, external-effect credentials, or receipts.
- Blue/green is the Production candidate-revision promotion and rollback procedure, not the
  Demo/Production boundary.

`F-PRODUCTION-DUAL-DATA-LANES` remains an honest fact about the currently deployed application until
S40’s backed-up migration and owner-run cutover complete. It is no longer the product target.
Automated tests, fixtures, emulators, Demo adapters, security, and provider seams remain even though
shipped Test/developer tools are removed.

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
- Shipped developer/Test tools are removed in two stages. Static import reachability alone never
  proves a provider/security/rollback module is safe to delete.

## Safety Boundaries

- No secrets, tokens, customer records, Gmail bodies, bank data, SSNs, full leases, resident bearer
  tokens, or customer photos in git, URLs, manifests, release evidence, or value-minimized audit.
- Missing or weak sources produce visible uncertainty, not generic property-management answers.
- Demo and Production identities, records, assignments, adapters, stores, contexts, and receipts do
  not cross. Demo Live-read-only cannot create an app or provider effect.
- Personal Google identities never enter staff, connector, build, runtime, Firebase CLI, or cloud
  paths.
- Invented aliases use `.invalid` addresses/reserved IDs in Demo and cannot be contacted externally.
- Page/layout configuration cannot grant authority, change shell/roles/environment/provider gates,
  hide required controls, or invoke an executor.

## Operational Defaults

- Value-minimized retention records, legal hold, bounded cleanup, and visible health are the
  baseline. TTL, extra indexes, and Scheduler automation are added when the exact volume/operation
  warrants them.
- Readiness requires green deterministic verification, authenticated desktop/390×844 whole-task
  coverage, exact links, environment isolation, a pinned candidate revision, Production smoke,
  captured prior revision, and rollback readiness.
- Demo workflow evidence proves product behavior only; a lane-correct Live receipt/readback proves
  a provider. Provider activation remains per action and never changes the application’s product
  name.
- Preserve original specs in `docs/specs/`; current authority lives in `docs/facts.md`,
  `docs/loop-state.md`, `docs/ui-ux-recalibration-implementation-program-2026-07-28.md`, and active
  feature-suite specs.

## Success

The program succeeds when staff can understand every destination, complete renewal/approval/
Maintenance/communication work end to end, inspect exact source/provider destinations, and recover
from failures without hidden effects; residents can complete scoped Maintenance intake; Demo safely
rehearses the exact product; Production contains only Live work; and provider activations can ship
one action at a time without redesigning the application.
