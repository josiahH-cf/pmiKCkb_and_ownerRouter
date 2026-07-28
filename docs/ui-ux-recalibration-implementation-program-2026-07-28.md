# UI/UX Recalibration — Decision-Complete Implementation Program (2026-07-28)

> **Authority.** The owner reviewed all 42 findings in
> `docs/temp/ui-ux-recalibration-audit-2026-07-28.md`, accepted all nine workstreams, accepted ten
> recommended decisions, changed four, and then explicitly directed that the resulting specs be
> written for execution by the autonomous loop in a fresh context. This document imports that
> response into durable repository context. It is the controlling program for S40–S50.

```yaml
program_id: UIUX-RECALIBRATION-2026-07-28
decision_packet: UIUX-AUDIT-2026-07-28
spec_writing_allowed: true
loop_execution_allowed: true
implementation_status: NOT_STARTED
next_suite: S40
active_suites: S40-S50
runtime_action_gates_preflipped: false
```

The two `true` values above are the flags the owner asked to open. They authorize writing these
specs and executing them through the normal fresh-context loop. They do **not** pre-authorize a
credential grant, cloud mutation, deployment, external send, or undocumented provider action.
An implementation slice opens an action-level `production_allowed` gate as part of that slice only
when its documented endpoint, mapping, identity, and full S25/S26 contract are ready. A pure
app-plane feature has no Action Registry gate and ships when verified.

## 1. Required end state

The recalibrated product has one simple, role-aware shell; four daily work destinations; a primary
Spaces knowledge destination; one owner for each attention type; one canonical renewal desk and
per-unit workspace; one-card approvals on phone and desktop; a focused Maintenance workspace; a
tokenized resident intake; task-based Admin; provider-focused Connections; workflow-only
Communications; exact evidence/backlinks; and no shipped developer lab, sample-only control, or
duplicate compatibility surface.

The application is the same product in two isolated environments:

| Contract               | Demo environment                                                                                                                                                                            | Production environment                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Purpose                | Rehearse the exact product safely with realistic invented data; optionally inspect an explicitly selected Live read-only source.                                                            | Operate on real PMI KC data and enabled Live integrations only.                                                                 |
| Persisted product data | Demo data in Demo-owned stores. Existing `data_mode:test` records are migrated or compatibility-read as Demo data; new product copy says **Demo**, not Sample/Test.                         | `data_mode:live` only. A missing/unknown mode fails closed. Demo/Test records, seeders, and routes cannot render or write here. |
| Product shape          | Same routes, components, permissions, validations, previews, decisions, and receipts as Production. Demo effects terminate in Demo-owned state and never construct a Live provider client.  | Same product shape. Enabled external effects use the documented provider contract and human/authority gates.                    |
| Optional Live data     | Allowed only as a separately selected **Live read-only** context with a persistent banner. It never mixes with Demo records in one list, count, decision, or receipt and cannot send/write. | Live only; there is no data-mode selector.                                                                                      |
| Visual identity        | Every page says `Demo environment` and the selected data context. Demo data is visibly watermarked.                                                                                         | Every authenticated shell says `Production`; no Demo badge or controls exist.                                                   |
| Infrastructure         | Independent project/service/database/storage/queue/secret/OAuth redirect boundary. Exact resource identifiers are supplied during S40 provisioning, never invented in code or docs.         | Existing production resources remain the current serving boundary until S40 migration is verified.                              |

Environment separation and blue/green delivery are related but not interchangeable. **Demo vs
Production** separates data, identities, secrets, and effects. **Blue/green** is the Production
release procedure: deploy the candidate revision without traffic, smoke it against Production-safe
boundaries, deliberately promote traffic, and retain the prior serving revision for rollback.

## 2. Settled decision register

These decisions are final for spec and implementation work. A future executor must not reopen them
because an older suite or current implementation says otherwise.

| ID   | Settled decision and required interpretation                                                                                                                                                                                                                                                                                                                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D-01 | Split Demo and Production comprehensively. Demo has realistic invented data and may expose a separately selected Live **read-only** context; Production is Live-only. No mixed-context projection. Use blue/green revision promotion within Production.                                                                                                                                                                              |
| D-02 | The four daily destinations are Console, Renewals, Maintenance, and Approvals. Desktop also exposes Spaces as a distinct primary knowledge destination. Communications, Connections, and Admin live in role-aware More/utilities. Mobile keeps the four daily shortcuts and a compact disclosure whose first non-daily destination is Spaces.                                                                                        |
| D-03 | Console owns Ask plus a short Work now summary. Approvals owns decisions. Notifications owns event history and unread state. Connections owns setup attention. Workflow desks own work status. Share gathering/count logic, not duplicate rendered lists.                                                                                                                                                                            |
| D-04 | Spaces remains a primary product destination, but the equal-card catalog is retired. Use a searchable, grouped directory/list and a single-heading detail flow for knowledge, source, and process administration; never imply a desk is unavailable merely because process documentation is incomplete.                                                                                                                              |
| D-05 | Renewals converges on one desk and one per-unit workspace. The four stages are Data check, Owner decision, Tenant offer, and Build documents. Compare sources, decisions, draft/send status, evidence, and history remain in that unit context. Editor live-desk and draft access is implemented; action-specific send/write authority remains separate.                                                                             |
| D-06 | Every supported provider exposes an outbound destination. Prefer a verified record/deep link. Otherwise show the allowlisted provider front door with explicit copy such as `Open RentVine — exact record link unavailable`. A generic link is navigation, never evidence, and URLs are never guessed or derived from an undocumented pattern.                                                                                       |
| D-07 | One-card decision handling is canonical on desktop and mobile. Advanced filters and selection/bulk tools are secondary modes, never parallel primary views.                                                                                                                                                                                                                                                                          |
| D-08 | Delete shipped Test/developer tools that do not contribute to the end state: browser-only simulations, hard-coded actors, no-op Sample controls, duplicate readiness matrices, and lab-only handoffs. Do not create an Admin Test Lab to preserve them. Keep automated tests, deterministic fixtures, emulators, Demo environment adapters, security controls, and provider seams that directly verify or activate the real product. |
| D-09 | Admin becomes a small dashboard of task-based subroutes. Connections owns provider credentials, OAuth, health, generic provider links, action availability, and expandable diagnostics. Technical language is not primary operator copy.                                                                                                                                                                                             |
| D-10 | Resident maintenance is a no-second-login, tokenized conversation for troubleshooting, appropriate photos, and possible-charge acknowledgement, followed by staff review. Build the RentVine portal/text adapter to its seam; only the documented interactive endpoint/vendor confirmation blocks that activation.                                                                                                                   |
| D-11 | Stabilize the IA/routes/components through S40–S49 before implementing S37. S50 amends S37 so the builder cannot encode retired clutter or authority-bearing operator workflows.                                                                                                                                                                                                                                                     |
| D-12 | Removal is two-stage: hide/move/redirect and instrument first; delete only after consumer, role, route, test, and rollback proof. Static reachability alone is never deletion proof.                                                                                                                                                                                                                                                 |
| D-13 | Chasity’s updated renewal template is a versioned external content artifact. Build its validated slot, preview, version, approval, and rollback now; only activation of template-dependent output waits for the supplied artifact. Never invent its copy.                                                                                                                                                                            |
| D-14 | Daily copy uses plain task language: Demo environment, Production, Live data, Demo data, Compare sources, Needs decision, Ready to send, Sent, and provider/source names. `Test` is reserved for engineering verification. Registry keys, `production_allowed`, raw reconciliation, bodyless receipts, and Final-V1 wording stay in Advanced diagnostics or code.                                                                    |

## 3. Normalized interpretations of changed answers

### D-01 — “Demo can have live data too”

This means a Demo deployment may be configured with a **read-only Live source context**. It does not
mean Live and Demo records can be combined, that a Demo identity may use Production write
credentials, or that a Demo receipt counts as Live evidence. Context selection is server-owned,
explicit, persistent in the shell, and mutually exclusive. Switching context invalidates stale
confirmations and returns to an owning list.

### D-06 — “Always link to the provider”

The destination priority is:

1. verified exact record/deep link from a documented provider resolver;
2. verified source artifact link, such as an authorized Sheet/range link;
3. code-owned, allowlisted provider front door;
4. Connections setup only for an unsupported/unregistered provider.

All production-supported providers must have a reviewed front-door entry. A generic front door is
labeled honestly and never gets an `Exact record`, `Source evidence`, or equivalent claim.

### D-08 — “Delete all Test tools”

“Tool” means a shipped operator/Admin control or surface. The deletion instruction does not remove
unit/e2e tests, deterministic fixtures, emulators, fake transports used by tests, Demo-environment
adapters, dormant provider implementations awaiting one genuine setup dependency, security
controls, or rollback tooling. Those contribute directly to the end state. Production ships no
Demo/Test UI, and Demo ships the product workflow—not a developer lab.

## 4. Suite package and dependency order

| Order | Suite                                                       | Owns                                                                                              | Depends on                                         |
| ----- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 1     | S40 Environment and deployment separation                   | Demo/Production boundary, data classification, migration, environment banners, blue/green release | Existing S23/S25/S26 isolation and release tooling |
| 2     | S41 Shell, navigation, and vocabulary                       | Role-aware shell, mobile disclosure, daily/Spaces hierarchy, plain language                       | S40 environment vocabulary                         |
| 3     | S42 Attention ownership and Spaces flow                     | Console/Approvals/Notifications/Connections ownership; non-card Spaces directory/detail           | S41 shell                                          |
| 4     | S44 Evidence and provider backlinks                         | Exact anchors, provider destination resolver, generic-link truthfulness, return state             | S40/S41 route/context contract                     |
| 5     | S43 Canonical renewal workspace                             | One desk/unit flow, Editor access, template slot, redirects                                       | S40, S41, S44                                      |
| 6     | S45 Approval Queue consolidation                            | One-card decisions, exact links, secondary filters/bulk                                           | S40, S41, S44                                      |
| 7     | S46 Maintenance operator workspace                          | Focused list/detail, point-of-use action state, no lab UI                                         | S40, S41, S44                                      |
| 8     | S47 Resident maintenance intake                             | Token conversation, photos/acknowledgement, staff review, RentVine seam                           | S40, S44, S46                                      |
| 9     | S48 Communications, Connections, Admin, and tool retirement | Workflow-only communications, provider setup, task Admin, shipped-lab removal                     | S41, S42, S44, S46                                 |
| 10    | S49 Compatibility/code/QA retirement                        | Two-stage redirects/deletion, component decomposition, docs and browser-task proof                | S40–S48                                            |
| 11    | S50 No-code builder recalibration                           | Stable page schema and S37 amendment                                                              | S40–S49 stage-one baseline                         |

S44 intentionally precedes the desks that consume its contract. S43 and S45 may run in parallel only
after S40, S41, and S44 are green. S47 may build its app-plane before RentVine evidence arrives, but
its provider activation remains the one named external dependency. S50 cannot begin against the old
page taxonomy.

## 5. Finding-to-suite traceability

Every audit finding is in implementation scope:

| Suite | Findings                                |
| ----- | --------------------------------------- |
| S40   | F-013, F-016, F-025                     |
| S41   | F-001–F-006                             |
| S42   | F-007–F-012                             |
| S43   | F-013–F-022, F-021 explicitly           |
| S44   | F-006, F-018, F-019, F-026              |
| S45   | F-023–F-026                             |
| S46   | F-027, F-028                            |
| S47   | F-029, F-030                            |
| S48   | F-005, F-022, F-031–F-034, F-037        |
| S49   | F-020, F-024, F-025, F-032, F-035–F-041 |
| S50   | F-042                                   |

Overlap is deliberate where a foundation contract and its consuming surface need separate
acceptance evidence.

## 6. Global implementation invariants

- End-state behavior is mandatory; file names and component boundaries in specs are examples.
  The executor may choose equivalent locations after inspecting current code.
- Production contains Live data only. Unknown/missing data classification fails closed and never
  defaults to Live.
- Demo and Production share product behavior, not data stores, credentials, effect transports, or
  receipts. Demo code never constructs a Production provider client.
- No autonomous, scheduled, bulk, or model-triggered client-facing send. A client-facing send or
  system-of-record write remains human-initiated and exact-confirmed.
- Action-level `production_allowed` is flipped during the owning implementation slice when the
  documented dependency already exists. Never leave a finished provider preview-only by habit, and
  never flip an undocumented provider endpoint.
- Generic provider links come only from the code-owned allowlist, are safe external navigation, and
  do not prove source provenance.
- No secrets, customer content, guessed endpoints, or personal identity enter git or release
  evidence. Managed PMI KC/service identities remain mandatory.
- No big-bang deletion. Stage one retains a compatibility path and rollback; stage two needs proof.
- Each surface must pass authenticated Admin and Editor desktop plus 390×844 task coverage,
  keyboard/focus checks, heading hierarchy, first-action visibility, and fixed-overlay collision
  checks.
- Each slice adds behavior tests before or with behavior changes, runs focused falsification, then
  the deterministic full gate. Deployment and cloud provisioning remain owner-run after preflights.

## 7. Carried evidence and exact blockers

These items do not reopen the product decisions:

| Item                                   | Treatment                                                                                                                                                                                                       |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RentVine resident interactive endpoint | Sole external activation dependency for S47’s RentVine channel adapter. Build the tokenized app-plane and provider interface now; never guess the endpoint.                                                     |
| Chasity renewal template               | Sole content activation dependency for S43’s template-backed output. Build the versioned slot and refusal state now.                                                                                            |
| Exact provider record URLs             | Do not block S44. Ship allowlisted generic front doors; add exact resolvers only from verified documentation.                                                                                                   |
| Compatibility usage evidence           | Generated by S49 stage one. Until proof exists, hide and redirect rather than delete.                                                                                                                           |
| Unwired TOTP/verification primitives   | Existing Vendor TOTP remains. Do not invent a new self-registration product. Keep the primitives if they support a planned/security boundary; delete only under S49 proof or a later explicit onboarding suite. |
| Editor Live-desk contradiction         | Resolved: implement scoped Editor desk access and draft creation in S43. Provider-specific send/write/High-risk authority is unchanged.                                                                         |

## 8. Loop contract

The fresh-context executor starts with
`docs/meta-prompts/ui-ux-recalibration-unattended-loop.md`. Its mandatory Phase 0 checks managed
auth and the budget guard, preserves/maps the worktree, inventories every human/external blocker,
batches irreducible owner steps, and establishes a verified baseline before application-code edits.
It then incorporates `docs/fresh-context-ui-ux-recalibration-prompt-2026-07-28.md` as the locked
end-state contract, takes one bounded suite/slice, discovers current code before editing, writes
tests, implements, verifies and falsifies, updates the suite status/facts/loop state, and continues
in dependency order while safe work remains. It does not ask the owner to reconfirm D-01 through
D-14 or stop between routine safe slices.

Completion of this program means:

1. AC-S40 through AC-S50 are satisfied or the exact external dependency is recorded for the one
   affected activation;
2. Production is Live-only and Demo is independently provisionable with the same product behavior;
3. all nine approved workstreams have their stated end state;
4. obsolete UI/code has completed the two-stage proof or remains explicitly compatibility-retained;
5. S37 is implemented only against the new schema;
6. active governance, product docs, app guide/manual QA, facts, and loop state describe the shipped
   reality; and
7. the serving revision, smoke evidence, prior revision, and rollback result are recorded after the
   owner-run deployment.
