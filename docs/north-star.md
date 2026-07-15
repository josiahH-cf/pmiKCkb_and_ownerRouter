# PMI KC Working-App North Star

## Outcome

PMI KC V1 is the stable production application people can use now. It is not a demo shell,
a read-only preview, or a promise that every optional vendor integration is already active.

| Product lane            | What V1 does                                                                                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PMI KC KB               | Source-backed answers, Spaces/processes, approvals, roles, attention, administration, trusted publication, and explicit execution controls.                                                  |
| Lease Renewal Agent     | Reconciles renewal sources, supports review and decisions, and exercises the complete action graph through production Test records; configured Live actions activate independently.          |
| Workflow Communications | Works only from authorized renewal or maintenance context for linked-thread reads, governed labels, drafts, and exact-confirmed replies. It is not a general inbox.                          |
| Maintenance + Vendor    | Creates and manages Live in-app tickets, runs a complete invented Test ticket to Done, and includes Firebase password/TOTP Vendor access, assigned-ticket authorization, and a Test mailbox. |

The Console is the front door. Each Space carries its process. Operators should see what
needs attention, understand the effect of a button, and complete work without learning the
underlying provider architecture.

## Live and Test

Production deliberately contains two server-owned data lanes:

- **Live** records use authoritative app/provider data. Any external write shows the exact
  action, target, effect, actor requirement, and confirmation before one idempotent attempt.
- **Test** records use reserved invented aliases, are always visibly labeled, write real
  app/Firestore workflow state, and may progress to Done. Their adapters contain no Live
  client, make zero external calls, and cannot produce Live-provider evidence.
- A missing Live provider connection affects only that action's activation state. It does
  not make the rest of the application unfinished.

Provider activation is reported per action as unavailable, Test-ready, Live-configured,
Live-proven, enabled, or suspended. Test workflow success proves the app; only a lane-correct
receipt proves a Live provider.

## Product and Execution Rules

- Rentvine is the operating system of record; LeadSimple orchestrates work; Dotloop holds
  document packages; QuickBooks is accounting; Boom is auxiliary; Sheets is an
  exception/control surface. The app owns workflow state and references provider records.
- No guessed endpoint, credential, source value, or customer fact may be used for a Live
  action. An unknown provider contract leaves that one action unavailable while its Test
  workflow remains usable.
- Low/Medium enabled work follows role and exact-confirmation policy. Consequential High
  work requires the exact Admin decision. Technical blockers cannot be approved away.
- Sends are always human-initiated and exact-confirmed. No background, scheduled, bulk,
  or model-triggered send is a V1 capability.
- Every external execution has one claim, idempotency, a bodyless receipt, safe error state,
  reconciliation before correction, and a documented kill switch.

## Safety Boundaries

- No secrets, tokens, customer records, Gmail bodies, bank data, SSNs, or full leases in git,
  logs, URLs, manifests, or bodyless audits.
- Missing or weak sources produce visible uncertainty, not generic property-management
  answers.
- Live/Test identities, records, assignments, adapters, and receipts cannot cross lanes.
- Personal Google identities never enter staff, connector, build, runtime, Firebase CLI, or
  cloud paths.
- Test aliases use `.invalid` email addresses and reserved IDs; they cannot be mistaken for
  a customer or contacted externally.

## Operational Defaults

- Bodyless retention records, legal hold, bounded on-demand cleanup, and visible cleanup
  health are the V1 default. TTL, extra composite indexes, and Scheduler automation are
  optional optimizations when volume justifies them.
- Application readiness is established by green verification, a pinned production deploy,
  signed-in browser coverage, rollback readiness, and complete Live/Test workflow behavior.
  Stakeholder signoffs remain visible metadata, not a switch that changes application truth.
- Preserve original specs in `docs/specs/`; put current execution truth in `docs/facts.md`,
  `docs/loop-state.md`, `docs/plan.md`, and the active feature-suite specifications.

## Success

V1 succeeds when staff and the canonical Test Vendor can sign in, understand every primary
tab, create and finish work, see source and data-lane state, safely exercise provider-shaped
actions, and recover from failures without hidden external effects. Live integrations can then
be activated one action at a time without redesigning the app.
