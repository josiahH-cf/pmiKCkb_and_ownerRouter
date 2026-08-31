<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: long-term-ui-ux-v1 -->

# S96 — Safe connector disconnect and reconciliation

> Status: Specified and not implemented. The deployed Admin connector control still dispatches its
> destructive request on first activation; S96 is the first executable suite and the sole owner of
> closing audit finding UX-005 before any visual-expansion suite begins.

**Goal.**

Make disconnecting an app-managed connector an Admin-only, exact-target, cancel-first operation that
can survive concurrency, response loss, partial failure, and a fresh browser session without a blind
second credential-destruction attempt or a false success state.

**Current state / intended end state.**

`ConnectorSetupActions` currently sends `POST /api/connections/[connectorId]/disconnect` on the first
Disconnect activation. The route destroys the configured secret and then deletes the connection
record. The store exposes one mutable connection record, the vault destroy boundary does not report a
verifiable outcome, and there is no durable pending or revoked state. A missed click, store failure,
or lost response can therefore destroy credential material without informed confirmation or leave
the application unable to prove what happened.

The intended operation has a non-mutating preview, an accessible cancel-first exact-phrase dialog,
one version-bound revocation operation, a transactional `connected -> revocation_pending -> revoked`
lifecycle, an immutable redacted receipt, and an Admin-only recovery path. A configured vault must
prove `destroyed` or `already_absent`; otherwise the operation fails closed. A new connection is a
new generation and cannot be targeted by any earlier request.

**Actors and entry conditions.**

- Only a current managed Admin with `manageAdmin` may preview, start, adopt a recoverable legacy
  pending record, recover, or inspect a revocation receipt.
- The connector must be app-managed and allow-listed by the current connector catalog. Group-managed,
  unsupported, absent, or caller-invented connectors remain non-disconnectable.
- The server derives actor, catalog entry, current lifecycle, and exact record version. The client may
  submit only the projected connector id, operation id, observed version, mode, and exact phrase.
- Opening the dialog, cancelling, navigating, focusing, or typing performs no vault, store, provider,
  action-registry, or connection-state effect.

**What it is / how it functions.**

### Preview and confirmation

The existing connection projection continues to expose only non-secret connector id/name, method,
source-backed status, and freshness. For a `manageAdmin` viewer only, it also exposes this bounded
disconnect view:

```text
state: "connected" | "revocation_pending" | "legacy_pending" | "revoked"
record_version: opaque bounded version token
operation_id: canonical UUID only for revocation_pending/revoked
requested_at: ISO timestamp only when known
completed_at: ISO timestamp only for revoked
destroy_outcome: "destroyed" | "already_absent" only for revoked
recovery_available: boolean derived by the server
```

No projection, response, receipt, DOM node, log, metric, fixture, or source-controlled artifact may
contain a credential, `secretRef`, or reversible representation of either.

For `connected`, first activation opens a dialog and creates one lowercase canonical UUID operation id
in browser memory; it makes no disconnect request. The dialog:

- names the exact connector and method;
- says stored connection credentials will be removed and connector-dependent work may stop;
- links to the existing setup/reconnection destination without opening it automatically;
- requires the exact case-sensitive code-point sequence `Disconnect <connector name>`, with no trim or
  normalization; and
- initially focuses Cancel. Confirm remains unavailable until the phrase is exact.

For `revocation_pending`, the Admin sees `Disconnecting — needs recovery`; `Retry disconnect` opens
the same consequence dialog and uses the projected operation id and record version. For `revoked`,
the UI shows the exact redacted receipt and fresh setup handoff and dispatches no destroy. A non-Admin
sees only the ordinary connection status and no operation id, receipt, or recovery control.

### Canonical version and lifecycle contract

`record_version` is an opaque concurrency token, never authority. New lifecycle records contain one
canonical lowercase UUID `generation_id` and one positive integer `revision`; their projected token
is `g:<generation_id>:<revision>`. Every accepted lifecycle transition increments `revision` exactly
once. Fresh setup after revocation creates a new `generation_id` with `revision=1`.

A current legacy connected record is projected as `legacy:<updatedAt>` using its exact stored ISO
timestamp. A start transaction accepts that token only while the record is still legacy connected
and `updatedAt` is byte-identical, then materializes the versioned lifecycle. A stale legacy token is
refused. A legacy pending record that still holds one opaque reference but has no operation id is
projected as `legacy_pending` with `recovery_available=true`; it cannot use normal start or recover.
The Admin-only `adopt_legacy` mode binds one new operation id to that exact unchanged legacy pending
version transactionally and then follows the normal recovery path. A legacy pending record without
an opaque reference, exact version, or safely classifiable state remains `recovery_available=false`
and names manual Admin investigation; no route guesses or reconstructs a credential.

The server-only active record is exactly one of:

- `connected`: connector/method, opaque secret reference, connected actor/time, generation id,
  revision, and update time;
- `revocation_pending`: the same opaque reference plus operation id, requested actor/time, generation
  id, revision, and update time; or
- `revoked`: connector/method, operation id, requested actor/time, completion time, destroy outcome,
  generation id, revision, and update time, with no secret reference.

The store also retains one immutable redacted receipt per connector id plus operation id. Fresh setup
may replace the active `revoked` tombstone with a new `connected` generation only after that receipt
is durably stored and read back. The old receipt remains queryable to Admin recovery/readback code
under the existing application audit-retention authority; this suite invents no automatic deletion
schedule. Replaying an old operation returns its matching receipt and can never act on the active new
generation.

### Exact request, effect order, and recovery

The strict request is one of:

```text
start:        { mode: "start", operationId, connectorId, observedVersion, confirmationPhrase }
adopt legacy: { mode: "adopt_legacy", operationId, connectorId, observedVersion, confirmationPhrase }
recover:      { mode: "recover", operationId, connectorId, observedVersion, confirmationPhrase }
```

Unknown fields, malformed UUIDs, absent or mismatched values, wrong mode/state pairs, stale versions,
wrong phrases, unauthorized actors, and unsupported connectors are refused before a new store or
vault effect. The server executes this order:

1. Recheck actor, catalog, request schema, exact phrase, lifecycle/mode, and vault capability. A vault
   reporting `not_configured`, unknown, or the current no-op default refuses before claim.
2. Transactionally claim the exact connected generation as `revocation_pending`, adopt only the exact
   eligible legacy pending record, or read the already-matching pending operation. Two operations
   cannot own one generation.
3. Call the vault once for that operation's exact server-held opaque reference. The contract returns
   only `destroyed` or `already_absent`; timeout/throw/unknown is not success.
4. Transactionally complete only the same operation/generation as `revoked`, write its immutable
   redacted receipt, and read both back.
5. Return success only when operation id, connector id, generation, revision, completion time, and
   destroy outcome match the readback. The public receipt is `{ connectorId, disconnected: true,
operationId, completedAt }` plus no secret material.

A failure before claim leaves `connected` (or the unchanged legacy pending record). A failure after
claim leaves `revocation_pending` and a recoverable Admin projection. If the destroy succeeded but
completion failed, a later recovery receives `already_absent` and completes the same operation. If a
response is lost, a new browser reads pending or revoked state and either recovers that operation or
shows its receipt. Recovery never creates a replacement operation id for an existing pending record,
never changes pending back to connected, and never blindly repeats a completed operation.

### Setup compatibility

Setup refuses while `revocation_pending` or unresolved `legacy_pending`. After verified revocation,
the existing setup flow may create `revoked -> connected` only with a new generation id and revision
1, while preserving the old immutable receipt. An operation bound to any earlier generation is stale
even if connector id and method match. S96 changes no connector setup authority, credential source,
catalog eligibility, action key, or provider behavior.

**In scope / out of scope.**

In scope: app-managed connector Disconnect preview, cancel-first exact confirmation, Admin projection,
strict request union, versioned lifecycle, transactional compare-and-set, legacy compatibility and
adoption, vault outcome contract, redacted receipt/readback, response-loss recovery, setup-over-
tombstone generation safety, accessibility, and deterministic tests.

Out of scope: connector checks, connection grouping, role requests, general dialog primitives,
provider writes, credential backup/restore, automatic reconnection, live credential destruction as a
test requirement, new connector types, new action keys, or broad Admin visual redesign.

**Open questions & assumptions.**

- Decision: UX-005 closes before visual expansion. S96 is not a visual dependency and uses the current
  tested in-app dialog/focus conventions plus current accessible tokens.
- Decision: recovery is idempotent completion or fresh setup after verified revocation. There is no
  Undo because destroyed credential material cannot be reconstructed.
- Decision: legacy pending records are adopted only through the exact Admin-only transition above;
  malformed/unrecoverable legacy state remains a truthful manual blocker.
- Assumption: the current connection/audit retention authority can retain redacted revocation
  receipts. If live readback disproves that assumption, only the durable receipt store is `BLOCKED`;
  the non-mutating preview and fail-closed route work still proceeds.

**Cross-product impacts.**

Connections Admin UI, connector projection, disconnect API, connection store interface and
implementation, vault interface and configured adapters, connector setup compatibility, Admin audit/
receipt readback, focused route/store/component tests, and S86/S87 preservation. No provider, source,
role, Space, action-registry, notification, or client-communication change.

**Authority and evidence map.**

| Input                                                                    | Classification                   | Use and limitation                                                                                    |
| ------------------------------------------------------------------------ | -------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `AGENTS.md`, committed code/tests, live readback, and `docs/facts.md`    | Authority / implementation truth | Establish current Admin/catalog guards, one-record store, vault behavior, closed effects, and safety. |
| `docs/evidence/ui-ux-audit-2026-08-31.html` and approved audit direction | Intent/audit evidence            | Establish UX-005 and its required precedence; they do not authorize a live credential effect.         |
| Configured vault outcome/readback                                        | External operational evidence    | Required only before a live disconnect proof; never guessed or replaced by the no-op adapter.         |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S96-1** — One strict Admin-only preview/request boundary binds exact actor, catalog connector,
  operation id, lifecycle mode, observed version, and phrase; component/route tests fail against the
  current first-click POST behavior and pass only with zero preview/cancel effects.
- **ARCH-S96-2** — One transactional active-record lifecycle and immutable receipt boundary owns
  version, generation, compare-and-set, legacy adoption, setup replacement, and replay behavior;
  store race tests fail against current blind set/delete behavior.
- **ARCH-S96-3** — One vault boundary reports only configured/not-configured capability and
  destroyed/already-absent result, never a secret; configured/unconfigured and response-loss tests
  prove effect ordering and fail-closed recovery.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S96-1** — First activation opens an exact consequence dialog with Cancel focused; only an
  exact phrase permits one strict request, and non-Admins cannot see or invoke recovery.
- **BEH-S96-2** — Success appears only after the same operation's revoked tombstone and immutable
  receipt read back; stale, duplicate, concurrent, unsupported, and replacement-generation requests
  cannot destroy a credential.
- **BEH-S96-3** — Every partial failure has one truthful state: connected before claim, recoverable
  pending after claim, completed receipt after readback, or explicit manual blocker for malformed
  legacy state. A fresh client can continue without browser memory.

**Human litmus outcome.**

### Disconnect one connector without an accidental or blind effect

**If this was built correctly:** An Admin activates Disconnect, reads which connector and consequence
are involved, can cancel safely, and must type the exact connector phrase before anything is removed.
If the response is lost or completion is partial, reloading shows the same operation and its safe next
step. Success appears only with a verified redacted receipt. An Editor cannot see recovery details.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

**Requirement-to-outcome traceability.**

| Requirement                                  | Architecture outcome | Behavior outcome | Human litmus             | Deterministic evidence / falsification                                                          |
| -------------------------------------------- | -------------------- | ---------------- | ------------------------ | ----------------------------------------------------------------------------------------------- |
| Non-mutating cancel-first exact confirmation | `ARCH-S96-1`         | `BEH-S96-1`      | Disconnect one connector | DOM/network/effect spies prove preview and Cancel are inert; phrase/role/catalog matrices pass. |
| Versioned atomic lifecycle and replacement   | `ARCH-S96-2`         | `BEH-S96-2/3`    | Disconnect one connector | Transaction/race/legacy/setup/replay fixtures prove one generation and immutable old receipt.   |
| Verifiable vault result and readback         | `ARCH-S96-3`         | `BEH-S96-2/3`    | Disconnect one connector | Configured/no-op/timeout/already-absent/store-failure/response-loss matrices prove exact order. |
| No secret or unauthorized state disclosure   | `ARCH-S96-1/2/3`     | `BEH-S96-1/2`    | Disconnect one connector | Projection/schema/DOM/log/metric/fixture scans reject secret refs and non-Admin operation data. |

**Preservation set.**

Keep current Admin and catalog eligibility, connection setup destinations, server-held opaque secret
references, unrelated connection/check behavior, role/Space gates, Action Registry and permanent-send
boundaries, environment identity, user-owned data, and all non-connector actions. Keep existing dialog,
focus, route, store, and vault tests as a separate gate; no passing S96 check may average away a
preservation failure.

**Adversarial acceptance checks.**

- **AC-S96-1** — First activation, opening/closing the dialog, invalid phrase, and Cancel produce zero
  disconnect POSTs, store writes, vault calls, provider calls, or action effects; focus and accessible
  naming pass keyboard/touch/zoom/reduced-motion checks.
- **AC-S96-2** — The route refuses malformed/duplicate fields, wrong actor/catalog/id/mode/state/
  phrase/version, stale legacy state, second owner, and replacement generation before vault effect.
- **AC-S96-3** — Store tests prove exact legacy-connected materialization, exact eligible legacy-
  pending adoption, one claim, monotonic revision, immutable receipt, setup-over-revoked generation,
  and stale-operation refusal under concurrent transactions.
- **AC-S96-4** — Unconfigured/no-op/unknown vault refuses before claim; throw/timeout after claim stays
  pending; `destroyed` or `already_absent` alone can proceed to matching tombstone/receipt readback.
- **AC-S96-5** — A new browser after response loss reads and completes or displays the same operation;
  completed replay returns the same receipt and invokes no second logical revocation.
- **AC-S96-6** — Non-Admin projections omit operation id/version/receipt/recovery, and automated scans
  find no credential value or opaque reference in public output, logs, metrics, fixtures, or Git.

**Forbidden actions / hard gates.**

No live disconnect proof until the selected configured vault proves exact-reference idempotent
destroy and an authorized Admin deliberately exercises the exact target. No credential read/echo/
backup/log, guessed connector or endpoint, new action key, provider/source write, autonomous retry,
client send, role/Space change, or protected auth/action-gate/budget edit. Do not use deletion of the
connection record as success, convert pending back to connected, retry an ambiguous operation with a
new id, or call a no-op vault successful.

**Dependencies / sequencing.**

S96 consumes only current Admin/catalog/setup/connection-store/vault contracts and has no S82-S95
prerequisite. It is the first executable suite after the documentation readiness gate. S85 visual
expansion and S86 interaction migration cannot begin until S96 reports `ALL_GATES_GREEN`, is delivered
through the project release path, and exact deployed readback proves first activation is inert. S86
then preserves S96 rather than reimplementing its lifecycle; S83 and S87 may compose its state without
changing ownership.

**Standalone delivery contract.**

- **Deliverable now:** preview/dialog, strict route union, versioned store/vault boundaries, legacy
  compatibility, redacted receipt, setup-generation protection, fail-closed recovery, accessibility,
  and all injected tests can reach `ALL_GATES_GREEN` without a live credential effect.
- **Consumes, but does not assume:** a configured production vault. When absent, all destructive
  attempts refuse and the live proof remains separately blocked.
- **Externally blocked effect:** an actual credential-destruction proof requires the selected vault's
  verified contract and an exact authorized Admin target. This does not block the code/refusal/
  reconciliation implementation terminal.
- **Produces for downstream suites:** the sole connector disconnect lifecycle, public/Admin projection,
  recovery/receipt contract, and UX-005 closure evidence consumed by S86/S83/S87.

**Verification and delivery contract.**

1. Before implementation edits, record the current first-click POST, route/store/vault behavior,
   catalog/role guards, setup replacement behavior, and effect counts; materialize focused checks that
   fail only because S96 is absent.
2. Run component, route, projection, transaction, configured/unconfigured vault, legacy, concurrency,
   replacement, response-loss, accessibility, secret/PII, and preservation tests for every declared
   architecture, behavior, and acceptance row.
3. Run `bash scripts/verify.sh` and `npm run test:e2e:core`; inspect the mechanical diff; audit secrets,
   PII, exact action gates, protected paths, runtime configuration, effect order, and scope before any
   authorized delivery.
4. For served code, use the existing zero-traffic candidate, exact-commit smoke, promotion, readback,
   and predecessor rollback contract. Do not run a live destroy to prove the local implementation.
5. Report one implementation terminal state: `ALL_GATES_GREEN`; `BUDGET_EXHAUSTED` only if a future
   user supplies an explicit budget; or `BLOCKED` only for one exact unavailable input/authority after
   every independent fail-closed path is complete. Record the live vault/Admin proof separately.

**Ordered prompt sequence.**

1. Re-verify component, route, store, vault, setup, and authorization truth and freeze preservation.
2. Add fail-first preview/effect, lifecycle, legacy, race, recovery, readback, secret, and accessibility
   checks.
3. Build the strict preview/request boundary, transactional lifecycle/receipt, and verifiable vault
   adapter contract.
4. Add legacy adoption, setup replacement, response-loss recovery, and Admin projection without a live
   credential effect.
5. Falsify every state/effect order, run canonical gates, deliver only when authorized, and read back
   first-click inertness before the queue advances.

**Deletion/merge recommendation.**

Remove S96 from the active tree only after current code/tests/facts own the versioned lifecycle,
fail-closed vault contract, exact confirmation, receipt/readback, setup compatibility, and deployed
UX-005 closure evidence. A separately blocked live credential proof may remain in an operational
readiness contract and never justifies retaining duplicate S86 ownership.
