<!-- spec-shape: overhaul-v1 -->

# S53 — Green-light activation and gate integrity

> New 2026-07-29. Implements owner decisions D02 (framing), D29, D30, D31, D32, D34, D36 (phase-blocking),
> records D33 and D35 as deliberate non-grants, and carries D37 as a loop-only authorization that adds no
> named key (its Scheduler job is created by the loop, not the owner). Controlled by the Production Phase Authorization in
> `AGENTS.md` and by `F-GREENLIGHT-NAMED-KEYS` in `docs/facts.md`. This is the suite that actually turns
> capabilities on. Cost-bearing steps obey the production cost ceiling defined by S52; the retired flat
> cap is not an input to anything here.

**Goal.** PMI KC's green light is a short, owner-written list of named Action Registry keys — each with a
one-line justification — and nothing else. There is no category grant, no readiness-tier grant, and no
"everything that is ready" grant, because `lib/integrations/action-gate.ts` resolves a per-key lookup
against the committed seed and has no category concept at all; a category-shaped grant would be expanded
into specific keys by the runner rather than by the owner, which is precisely the reviewed decision the
gate exists to force (D02). Before any key flips, the one live path that already writes to the client's
system of record — the Google-Sheet renewal write-back — is routed back through the gate that is supposed
to govern it and fenced by the environment descriptor, because today it executes without consulting
either (D32). Alongside the flips, this suite closes the class of defect where a capability is recorded as
LIVE but is silently inert: a value the owner provisioned that the deploy wrapper never forwards, a
preflight guard keyed to the wrong feature's flag, and a spec-documented flag that does not exist in the
code. When S53 is done, every capability that reports itself active is active, every capability that is
not granted refuses observably, and the owner can read the full activation surface off one table.

**What it is / how it functions.**

- **The one systemic constraint every activation obeys.** `scripts/deploy-demo-cloud-run.mjs` builds the
  Cloud Run environment with `formatGcloudMapFlag("--set-env-vars", runtimeEnv)`, and `--set-env-vars`
  REPLACES the service's entire env map. `runtimeEnv` comes from `readRuntimeEnv(...)`, a fixed literal
  allowlist of roughly thirty names. Secrets are wired by `readRuntimeSecrets(...)`, which binds exactly
  `RENTVINE_API_KEY` and `RENTVINE_API_SECRET` (`RENTVINE_RUNTIME_SECRETS`) and only when
  `RENTVINE_API_BASE_URL` is present. Therefore **no pending credential or value can reach the running
  service without a paired code change to the deploy wrapper.** Creating a Secret Manager secret, setting
  a value in `.env.local`, or granting a scope is necessary and never sufficient. Values are also read
  through `mergedEnv = { ...localEnv, ...env, ... }` where `localEnv = readLocalEnv()`, so a value set only
  by a direct `gcloud run services update` is reverted by the next deploy. Every activation row below
  therefore names its wrapper change, or states NONE and proves it with a test. The wrapper is
  security-sensitive and every env/secret change stays paired with its forwarding/refusal tests, but it
  is not one of D12's six protected paths.

- **Gate-integrity defects this suite closes before it grants anything.**
  - **G1 — the live Sheet write-back bypasses its own gate.** `app/api/lease-renewal/writeback-execute/route.ts`
    calls `prepareOrCommitWriteback` (`lib/lease-renewal/sheet-writeback-service.ts`), which calls
    `commitWritebackAtRow` (`lib/lease-renewal/sheet-writeback-execution.ts`) and performs a real
    `writer.updateValues(...)` against the operational spreadsheet. Nothing in that chain calls
    `assertActionExecutable` or `isActionExecutable`, and nothing consults `lib/environment/descriptor.ts`.
    The only guards are `requireCapabilityInSpace("manageAdmin", "renewals")`, an Approved
    `LeaseRenewalWritebackApprovalRecord`, and `isSheetWritebackEnabled()` reading
    `LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED`. Meanwhile the seed row for
    `google_sheets.renewal_checklist.writeback` reads `readiness: "Planned"`,
    `production_allowed: false`. So the single path that writes the client's system of record is outside
    the control that governs every other external effect, and its Registry row states the opposite of
    reality. Fix: call `assertActionExecutable("google_sheets.renewal_checklist.writeback")` and
    `assertLiveProviderActionAllowed(descriptor)` at the top of `prepareOrCommitWriteback`, ahead of
    every writer call, AND in `app/api/lease-renewal/writeback-execute/route.ts` ahead of the
    `buildLiveWritebackDeps()` call that constructs `GoogleSheetsApiWriter` — today the route builds
    the deps before it enters the service, so a service-only check cannot precede the construction.
    Keep the existing append-only/compare-and-set/read-after-write guards, and only then flip the
    Registry row.
  - **G2 — a correct guard keyed to the wrong feature's flag.** `scripts/preflight-production-cutover.mjs`
    requires `KB_APPROVAL_SENDER` to be present, non-placeholder, and `@pmikcmetro.com` — but only inside
    `if (readBoolean(env.KB_APPROVAL_NOTIFICATIONS_ENABLED, false))`. That is the KB approval-digest flag,
    not the internal transactional notice. `internal.transactional_notice.send` is already
    `production_allowed: true` (S39.3, `F-INTERNAL-NOTIFY`) and `GmailInternalTransactionalSender` refuses
    when its sender address is blank, so the guard that would have caught the empty mailbox never fires and
    the preflight instead emits the warning "notification delivery is not part of this cutover" while a
    live internal auto-send exists. Fix: key the requirement on the resolved gate state of
    `internal.transactional_notice.send` (and on any other executable key that needs the identity), not on
    an unrelated flag. This re-keying is the generalizable half of D29 — it is what stops this class of
    silent inertness from recurring on the next flip.
  - **G3 — a flag the spec tells the owner to set does not exist.** `SPACE_PROVISIONING_ENABLED` appears
    only in `docs/feature-suites/space-self-provisioning.md`; it is absent from `lib/config/server.ts` and
    from `readRuntimeEnv`. An owner following S36 today would set a variable that nothing reads and that
    the deploy would drop anyway.
  - **G4 — a visible, always-failing control on the live renewal desk.**
    `components/lease-renewal/RenewalProgressControls.tsx` (lines 339-352) renders the "Comps screenshot
    (optional)" file input unconditionally, while `app/api/lease-renewal/comp-screenshot/route.ts` returns
    409 `action_not_production_allowed` from `renewalCompScreenshotClosedResponse()` because
    `google_drive.renewal_comp_screenshot.store` is closed. Operators can click it and it can only fail.
  - **G5 — the environment descriptor is never explicit in Production.** `.env.example` defines
    `ENVIRONMENT_KIND` and `DATA_CONTEXT`, but `readRuntimeEnv` does not forward either, and
    `scripts/preflight-production-cutover.mjs` never reads the descriptor at all. Production therefore runs
    on the `legacy-node-env` bridge in `resolveEnvironmentDescriptor`, which makes the docstring claim in
    `lib/environment/descriptor.ts` ("The Production cutover preflight refuses `legacy-node-env`") untrue
    today. The G1 descriptor fence is only meaningful once the descriptor is explicitly configured, so G5
    is fixed in the same slice.

- **Table A — the named Action Registry keys eligible for this phase.** This table is the outer bound
  of the green light: a key not listed here is not granted, whatever its readiness or evidence status
  says. A listed key is still kept closed until its exact row has the full action contract required by
  the standing safety invariants: immutable preview binding, exact human confirmation, one-attempt
  idempotency, durable bodyless receipt, provider readback/reconciliation, and a tested correction or
  rollback. Every completed flip applies the standard recipe: set
  `readiness: "Approved for Execution"`, `evidence_status: "Documented"`, and
  `production_allowed: true` in `lib/integrations/action-registry-seed.ts`; add the key to BOTH
  `EXECUTABLE_ALLOWLIST` copies (`scripts/seed-action-registry.ts` and
  `lib/admin/migration-readiness.ts`); and move the pinned tests in the same review package. D12
  protects the seed's `production_allowed` change; the paired allowlist/test edits travel with that
  protected activation but are not independently protected paths.

| Named key                                    | What it does (justification)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Owner input required                                                                                                                                                                                                                   | Paired deploy-wrapper change                                                                                                                                                                                                                                                                                                       | Pinned tests that move with the flip                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `google_sheets.renewal_checklist.writeback`  | Appends one approved value to one empty `KB Proposed — <field>` cell. The local immutable contract is built, but activation stops before provider construction because the D32 transaction provider does not exist yet. Fixed-A1/value compare-and-set is insufficient. That provider must expose one globally key-bound payload ledger with atomic stable-row mutation at the exact confirmed A1, exact status, atomic tombstone-if-absent, immutable effect evidence, and a current-cell generation invalidated by every edit (including same-value ABA). | Approve/provision the concrete D32 transaction broker + protected target/ledger ranges described in `docs/client-asks-2026-07-29.md`; create the `KB Proposed — Comp basis` column; and confirm the exact spreadsheet id and tab name. | Already forwards `LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED`, `RENEWAL_SHEET_ID`, `SHEETS_IMPERSONATE_SA`, `SHEETS_DWD_SUBJECT`. ADD `ENVIRONMENT_KIND` and `DATA_CONTEXT` so the new descriptor fence is explicit, not inferred from `NODE_ENV`; the broker deployment id/secret is added only after its documented interface exists. | `tests/unit/action-registry-schema.test.ts`, `tests/unit/seed-action-registry-allowlist.test.ts`, `tests/unit/migration-readiness.test.ts`, `tests/unit/execution-risk-policy.test.ts`, `tests/unit/google-sheets-write-client.test.ts`, `tests/unit/sheet-writeback-contract.test.ts`, `tests/unit/sheet-writeback-service.test.ts`, `tests/unit/sheet-writeback-ui-contract.test.tsx`, `tests/unit/sheet-writeback-runtime-boundary.test.mjs`, `tests/unit/lease-renewal-sheet-writeback-execution.test.ts`, `tests/unit/lease-renewal-writeback-safety.test.ts`, and `tests/firestore/lease-renewal-writeback-execution-store.test.ts` |
| `google_drive.renewal_comp_screenshot.store` | Stores one operator-selected comp screenshot in an in-boundary Drive folder. The current first POST uploads immediately and has no immutable preview, idempotent receipt, readback, or trash rollback, so the key remains closed and the closed control may be hidden. Activation waits for the complete AC-S53-13 contract.                                                                                                                                                                                                                                | NONE new for the folder. Owner chose to reuse the existing maintenance photo folder rather than create a second one (D31); that choice does not waive the action contract.                                                             | Forward `RENEWAL_COMP_DRIVE_FOLDER_ID` (absent from `readRuntimeEnv` today) so an explicit override survives a deploy. `lib/config/server.ts` resolves `renewalCompImageFolderId` to `RENEWAL_COMP_DRIVE_FOLDER_ID ?? ""` with NO fallback today; this suite ADDS the fallback to `MAINTENANCE_PHOTO_DRIVE_FOLDER_ID` (D31).       | `tests/unit/action-registry-schema.test.ts`, `tests/unit/seed-action-registry-allowlist.test.ts`, `tests/unit/migration-readiness.test.ts`, `tests/unit/execution-risk-policy.test.ts`, `tests/unit/renewal-comp-screenshot.test.ts`, `tests/unit/server-config.test.ts`, `tests/unit/cutover-readiness-golden.test.mjs`, `tests/unit/live-cost-scripts.test.mjs`, plus the preview/receipt/reconcile/trash-rollback tests in AC-S53-13                                                                                                                                                                                                   |
| `vendor.account.invite`                      | Creates one scoped Firebase Vendor principal and delivers one setup link after Admin exact confirmation. Justification: without it there is no live vendor at all, and the invite path is currently unreachable (QA-24).                                                                                                                                                                                                                                                                                                                                    | Name one vendor company and one vendor contact address in the owner packet — never in git, never in this file (D34).                                                                                                                   | NONE new. The setup-link delivery reuses the already-forwarded internal transactional identity `KB_APPROVAL_SENDER`; a test asserts this row adds no name to `readRuntimeEnv`/`readRuntimeSecrets`.                                                                                                                                | `tests/unit/action-registry-schema.test.ts`, `tests/unit/seed-action-registry-allowlist.test.ts`, `tests/unit/migration-readiness.test.ts`, `tests/unit/execution-risk-policy.test.ts`, `tests/unit/vendor-invite.test.ts`, `tests/unit/vendor-lifecycle.test.ts`, `tests/unit/maintenance-vendor-executors.test.ts`                                                                                                                                                                                                                                                                                                                      |
| `vendor.assignment.change`                   | Assigns or removes exactly one Vendor on exactly one maintenance ticket. Justification: an invited vendor with no assignment path cannot receive work; live assignment is unwired today (QA-24).                                                                                                                                                                                                                                                                                                                                                            | Same first-vendor naming as above; no separate input.                                                                                                                                                                                  | NONE new (asserted by the same wrapper-allowlist test).                                                                                                                                                                                                                                                                            | `tests/unit/action-registry-schema.test.ts`, `tests/unit/seed-action-registry-allowlist.test.ts`, `tests/unit/migration-readiness.test.ts`, `tests/unit/execution-risk-policy.test.ts`, `tests/unit/vendor-assignment-boundary.test.ts`, `tests/unit/vendor-bodyless-audit.test.ts`, `tests/unit/maintenance-vendor-executors.test.ts`                                                                                                                                                                                                                                                                                                    |
| `vendor.account.disable`                     | Disables one Vendor principal, revokes sessions, and denies assigned-ticket access. Justification: an activation with no off switch is not reversible; this is the rollback for the two rows above.                                                                                                                                                                                                                                                                                                                                                         | Same first-vendor naming as above; no separate input.                                                                                                                                                                                  | NONE new (asserted by the same wrapper-allowlist test).                                                                                                                                                                                                                                                                            | `tests/unit/action-registry-schema.test.ts`, `tests/unit/seed-action-registry-allowlist.test.ts`, `tests/unit/migration-readiness.test.ts`, `tests/unit/execution-risk-policy.test.ts`, `tests/unit/vendor-lifecycle.test.ts`, `tests/unit/vendor-auth.test.ts`, `tests/unit/maintenance-vendor-executors.test.ts`                                                                                                                                                                                                                                                                                                                        |

- **Table B — configuration activations that grant NO action key.** These make an already-granted or
  app-plane capability actually work. None of them changes `production_allowed` for anything. They are
  listed here because each one is a place where "provisioned" has been mistaken for "active".

| Config activation                                                    | What it does (justification)                                                                                                                                                       | Owner input required                                                                                                                                                                                                                                                                                                                                               | Paired deploy-wrapper change                                                                                                                                              | Pinned tests that move with it                                                                                                                                                                                                        |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `KB_APPROVAL_SENDER`                                                 | The internal transactional sender identity. `internal.transactional_notice.send` is LIVE but every send refuses because the address is empty (D29).                                | Reuse an existing managed `@pmikcmetro.com` DWD subject only when that exact mailbox is discoverable from approved non-secret configuration; otherwise leave the sender inert and request the exact owner value. Never infer an address.                                                                                                                           | Already in `readRuntimeEnv` defaulting `""`. ADD a deploy-plan error when a key requiring the identity is executable and the resolved value is empty.                     | `tests/unit/cutover-readiness-golden.test.mjs`, `tests/unit/live-cost-scripts.test.mjs`, `tests/unit/internal-transactional-sender.test.ts`, `tests/unit/report-issue-route.test.ts`                                                  |
| `MAINTENANCE_INTAKE_TOKEN_SECRET`, `MAINTENANCE_INTAKE_IP_HASH_SALT` | The HMAC signing secret and the IP-hash salt for the public tokenized resident intake. Without the secret the route returns 503 for every reporter (D30, `F-MAINT-INTAKE-PUBLIC`). | Create both in Secret Manager and grant the Cloud Run runtime SA `roles/secretmanager.secretAccessor`. Cost eligibility is determined by S52; this table makes no zero-cost claim.                                                                                                                                                                                 | ADD both to `readRuntimeSecrets` via `--set-secrets` (today it binds only the RentVine pair, and only when `RENTVINE_API_BASE_URL` is set). This is the whole activation. | `tests/unit/maintenance-intake-public-route.test.ts`, `tests/unit/maintenance-intake-token-route.test.ts`, `tests/unit/maintenance-intake-token.test.ts`, `tests/unit/live-cost-scripts.test.mjs`, `tests/unit/server-config.test.ts` |
| `SPACE_PROVISIONING_ENABLED` + `roles/discoveryengine.admin`         | Lets an Admin self-provision a Space behind a per-Space cost confirm. The IAM grant is the only owner step S36 was waiting on (D36).                                               | Grant `roles/discoveryengine.admin` to the runtime service account named in the owner packet, then set the flag true.                                                                                                                                                                                                                                              | The flag must first EXIST in `lib/config/server.ts` (it does not, G3) and then be ADDED to `readRuntimeEnv`, or the deploy silently drops it.                             | `tests/unit/server-config.test.ts`, `tests/unit/live-cost-scripts.test.mjs`, plus the S36 provision-route test when that slice lands                                                                                                  |
| `ENVIRONMENT_KIND`, `DATA_CONTEXT`                                   | Makes the S40 descriptor explicit in Production instead of derived from `NODE_ENV`, so the new write-back fence and every other descriptor guard rest on configuration (G5).       | NONE. These are deployment configuration, not a credential or a grant.                                                                                                                                                                                                                                                                                             | ADD both to `readRuntimeEnv`, and make `scripts/preflight-production-cutover.mjs` refuse a `legacy-node-env` source or any pair other than `production` + `live`.         | `tests/unit/environment-descriptor.test.ts`, `tests/unit/cutover-readiness-golden.test.mjs`, `tests/unit/live-cost-scripts.test.mjs`                                                                                                  |
| Gmail-watch scheduler config (S31)                                   | Arms the read-only Gmail watch auto-renew. D37 reclassifies S31 as loop-only and authorizes the build plus this one named Cloud Scheduler job.                                     | NONE after the exact managed OIDC service account/audience are documented. The runner may create/update only this job after S52 has a non-null verified ceiling, auth and budget preflights pass, the print-only plan is reviewed, and rollback/delete is captured. The Pub/Sub topic, publisher, and push subscription already exist (`F-OWNER-DEPS-2026-07-23`). | ADD the scheduler service-account and audience names to `readRuntimeEnv` when S31 lands, exactly as `GMAIL_PUBSUB_AUDIENCE` is forwarded today.                           | S31's own gate list; S53 asserts only that S31 introduces NO new named key (it reuses the already-executable `gmail.mailbox.read`)                                                                                                    |

- **Table C — explicitly NOT granted this phase, with the reason.** Recording the non-grants is part of the
  green light: it stops a later reader from treating an ungranted key as an oversight.

| Not granted                                                                                                                                                                            | Reason                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gmail.renewal_notice.send`, `gmail.maintenance_owner_notice.send`                                                                                                                     | D33. There is no live sending code behind either gate — the seed's own evidence for the paired draft key says "code never sends" — so flipping them would be meaningless or dangerous. Draft-into-Gmail with a human sending from Gmail IS the end state, not a waypoint; the roadmap wording that called it interim is corrected. |
| `gmail.message.send`                                                                                                                                                                   | Generic non-workflow send stays Registry-closed permanently. It is not a candidate in any phase.                                                                                                                                                                                                                                   |
| `vendor.gmail.connect`, `vendor.gmail.revoke`, `vendor.gmail.health`, `vendor.gmail.thread.read`, `vendor.gmail.draft.create`, `vendor.gmail.thread.reply`, `vendor.gmail.label.apply` | D34 flips three of the ten Vendor keys — the account/assignment ones. The seven mailbox keys require per-Vendor OAuth consent that no vendor has given.                                                                                                                                                                            |
| Trusted live publication scanning (S21)                                                                                                                                                | D35. No content-scanner provider exists: `lib/publication/provider.ts` returns `UnavailablePublicationScanner` outside the local-demo fence, and `lib/publication/scanners.ts` states production deliberately has no fallback. Declared deferred this phase and said so here.                                                      |
| Every other currently closed seed key                                                                                                                                                  | Remains `production_allowed:false`. The previously executable set is not closed by this suite; absence from Table A grants no new activation.                                                                                                                                                                                      |

- **Buildable now (app-plane).** G1's gate call and descriptor fence with their refusal tests; G2's re-keyed
  preflight requirement; G3's `SPACE_PROVISIONING_ENABLED` addition to `lib/config/server.ts` defaulting
  false; G4's conditional render of the comps-screenshot control from
  `getRenewalCompScreenshotActionView().executable`; G5's descriptor refusal in the cutover preflight; the
  deploy-forwarding sentinel that fails when a named activation value is not in `readRuntimeEnv` or
  `readRuntimeSecrets`; and the readiness projection change that reports a capability active only when its
  gate AND its resolved runtime value are both present.

- **Build to the seam (live provider).** The live `VendorLifecycleProvider` implementation behind
  `VendorLifecycleExecutor` (`lib/maintenance/execution/providers.ts`), which today is constructed only in
  `lib/release/synthetic-execution.ts`. QA-24 stands: live Vendor invite is unreachable, live Vendor
  assignment is unwired, and S46 removes the Test Vendor selector that is the only path working now
  (`AC-S46-2` in `docs/feature-suites/maintenance-operator-workspace.md` removes the Test vendor/action
  selector and fake assignment). **S53 must land the reachable live path before S46 removes the old one** —
  ordering, not preference. The provider carries the full contract: preview with the exact vendor identity
  and ticket, Admin exact confirmation against a payload hash, one attempt per idempotency key, a bodyless
  receipt, reconcile-by-key, and `vendor.account.disable` as the documented rollback.

- **Owner dependency (the one flip per row).** The six named inputs in Tables A and B are: (1) the D32
  transaction broker/protected-range deployment; (2) the `KB Proposed — Comp basis` column and exact
  sheet/tab confirmation; (3) the pmikcmetro.com DWD subject mailbox for `KB_APPROVAL_SENDER`; (4) two
  Secret Manager secrets plus the accessor binding; (5) one vendor company and contact address; and
  (6) one `roles/discoveryengine.admin` grant. Cross-cutting S52 eligibility and the
  protected `production_allowed` review still apply. The Sheet and Drive rows additionally remain
  closed on their named local action-contract work in AC-S53-12/13; those are build prerequisites,
  not owner inputs.

**Open questions & assumptions.**

- _Answered 2026-07-29 (D02):_ activation is per named key with a one-line justification. Category,
  readiness-tier, and "everything ready" grants are refused as unimplementable against a per-key seed lookup.
- _Answered 2026-07-29 (D32), refined by implementation falsification:_ the `KB Proposed — Comp basis`
  column and exact sheet/tab confirmation are required, but are not sufficient. The action also requires
  the concrete D32 transaction broker/protected-range contract: stable-row mutate, exact status, atomic
  absent-key tombstone, immutable effect evidence, and a current-cell generation invalidated by every
  edit including same-value ABA. Routing through the gate is already complete; the key remains closed
  until all provider semantics are documented and proven.
- _Answered 2026-07-29 (D31):_ reuse `MAINTENANCE_PHOTO_DRIVE_FOLDER_ID` for comp screenshots and do
  not request a second Drive folder. The folder choice does not override the standing preview,
  confirmation, idempotency, receipt, reconciliation, and rollback invariants; the key stays closed
  until AC-S53-13 is built.
- _Answered 2026-07-29 (D34):_ flip three of the ten Vendor keys (invite, assignment change, disable).
- _Answered 2026-07-29 (D33):_ draft-into-Gmail with a human sending from Gmail is the end state.
- _Answered 2026-07-29 (D35):_ trusted publication is deferred this phase for want of a scanner provider.
- _Answered 2026-07-29 (D37):_ S31 is loop-only; its build plus the Scheduler job are authorized and it
  introduces no new named key.
- _Assumption:_ the `KB Proposed — Comp basis` column header string is exactly
  `KB Proposed — Comp basis` (em dash), matching `COMP_BASIS_FIELD_LABEL` in
  `lib/lease-renewal/writeback-proposal.ts` and the `APPEND_ONLY_COLUMN_PREFIX` join in
  `lib/lease-renewal/sheet-writeback-service.ts`. A mismatched header makes the write block, not misfire.
- _Assumption:_ the vendor setup link is delivered through the existing internal transactional Gmail
  identity rather than a new transport, so no new external scope or credential is introduced. If the live
  provider needs a different delivery path, that becomes a separate named row rather than an in-flight
  substitution.
- _Assumption:_ the two `EXECUTABLE_ALLOWLIST` copies stay deliberately non-identical — the seed script's
  copy already lists `gmail.message.send` as an allowlist entry while its seed record remains
  `production_allowed:false`, so the allowlist is a ceiling, not a state. Do not "fix" the divergence by
  flipping a record.
- _Open:_ whether the readiness projection should surface an unforwarded-value capability as `inert` or as
  `blocked`. Default for this phase: `inert`, with the missing variable named. Record as a `Q-`/`A-` row in
  `docs/facts.md` at build time.
- Decision-complete at the product layer. The D32 broker architecture is recorded as the safe proposed
  default in the owner packet; provisioning its managed identity/deployment and protected ranges is the
  named external dependency. The six named owner inputs and routine reviewed flips remain.

**Cross-product impacts.** Touches `lib/lease-renewal/sheet-writeback-service.ts`,
`lib/lease-renewal/sheet-writeback-contract.ts`, `lib/lease-renewal/sheet-writeback-policy.ts`,
`lib/firestore/lease-renewal-writeback-executions.ts`,
`lib/lease-renewal/sheet-writeback-execution.ts`, `app/api/lease-renewal/writeback-execute/route.ts`,
`components/lease-renewal/flag-actions.tsx`, `components/lease-renewal/RenewalProgressControls.tsx`,
`app/api/lease-renewal/comp-screenshot/route.ts`, `lib/lease-renewal/comp-screenshot-action.ts`,
`lib/integrations/action-registry-seed.ts`, `lib/integrations/action-gate.ts`,
`lib/admin/migration-readiness.ts`, `scripts/seed-action-registry.ts`,
`scripts/preflight-production-cutover.mjs`, `scripts/deploy-demo-cloud-run.mjs`, `lib/config/server.ts`,
`lib/environment/descriptor.ts`, `lib/maintenance/execution/providers.ts`,
`lib/maintenance/execution/matrix.ts`, `lib/execution/risk-policy.ts`,
`lib/notifications/internal-transactional-sender.ts`, `app/api/maintenance/intake/public/route.ts`,
`app/api/admin/spaces/request/route.ts`, and `.env.example`. Interacts with `F-GREENLIGHT-NAMED-KEYS`
(this suite owns its activation table), `F-EXTERNAL-ACTION-GATE`, `F-SEND-AUTHORIZED`,
`D-AUTOMATION-LINE`, `F-INTERNAL-NOTIFY` (whose LIVE claim is honest about the gate and silent about the
empty mailbox), `F-MAINT-INTAKE-PUBLIC` (fail-closed until the secret exists), `F-DRIVE-DWD` (the Drive
scope is already authorized, so the comp-screenshot flip needs no new grant), `F-OWNER-DEPS-2026-07-23`
(the `roles/discoveryengine.admin` grant is the still-open item this suite closes), and
`F-COST-CEILING-S52` (every cost-bearing step reads its ceiling from S52, never from the retired flat
figure). Sequencing: **S53 lands the reachable live Vendor path before S46 removes the Test Vendor
selector.** Delete-on-supersede when built: the `readiness: "Planned"` / `production_allowed: false`
posture of `google_sheets.renewal_checklist.writeback`; the roadmap wording that calls draft-into-Gmail an
interim step toward autonomous send (D33); the docstring claim in `lib/environment/descriptor.ts` that the
Production cutover preflight refuses `legacy-node-env`, which becomes true only when G5 ships; and the
S36 spec's instruction to set a flag that did not exist. Record each with a `docs/facts.md` Supersede Log
marker. Governance: no `firestore.rules` shape change; a `production_allowed` seed change is the D12
protected path prepared for owner review. Its paired allowlist, deploy-wrapper, and test edits travel in
the same activation review package but are not independently D12-protected.

**Adversarial acceptance checks.**

- **AC-S53-1** — With `google_sheets.renewal_checklist.writeback` closed, `POST /api/lease-renewal/writeback-execute`
  with `confirm:true`, a valid Admin session, and a matching Approved approval returns HTTP 409 with
  `error_type: "action_not_production_allowed"`, and the injected `SheetsValuesWriter` records ZERO
  `updateValues` calls and zero `getValues` calls (the refusal precedes every writer call, and in the route
  it precedes `buildLiveWritebackDeps`). Flipping
  a fake registry entry in the test seam is the only way to reach the write. _Verify:_
  `npm test -- tests/unit/sheet-writeback-service.test.ts`; keep
  `tests/unit/lease-renewal-sheet-writeback-execution.test.ts` and
  `tests/unit/lease-renewal-writeback-safety.test.ts` green.
- **AC-S53-2** — From a `demo`+`demo` or `demo`+`live_readonly` descriptor the same confirmed call refuses
  with an `EnvironmentContextError`-shaped response naming the environment, before any Sheets client is
  constructed; only `production`+`live` reaches the writer. A descriptor whose source is `legacy-node-env`
  is refused by the cutover preflight rather than silently accepted. _Verify:_
  `npm test -- tests/unit/sheet-writeback-service.test.ts`,
  `npm test -- tests/unit/environment-descriptor.test.ts`,
  `npm test -- tests/unit/cutover-readiness-golden.test.mjs`.
- **AC-S53-3** — After each completed row's flip, `npm run seed:action-registry -- --dry-run` prints
  exactly the completed Table A keys plus the previously executable set and no others; incomplete
  Table A rows remain `production_allowed:false`. It THROWS when any executable record is missing
  from `EXECUTABLE_ALLOWLIST`. Both allowlist copies and the seed agree on every flipped Table A key.
  _Verify:_ `npm test -- tests/unit/seed-action-registry-allowlist.test.ts`,
  `npm test -- tests/unit/action-registry-schema.test.ts`,
  `npm test -- tests/unit/migration-readiness.test.ts`.
- **AC-S53-4** — Provisioned-but-unforwarded cannot be reported active. A test enumerates every name in
  Tables A and B and asserts each appears in `readRuntimeEnv` or `readRuntimeSecrets` in
  `scripts/deploy-demo-cloud-run.mjs`; when a name is present in the local env but absent from the wrapper,
  `buildDemoDeployCommand` returns `ok:false` with that variable named in `errors`, and the readiness
  projection renders the capability as inert with the missing variable named rather than as active.
  Removing a forwarded name from the wrapper turns this check RED. _Verify:_
  `npm test -- tests/unit/live-cost-scripts.test.mjs`,
  `npm test -- tests/unit/migration-readiness.test.ts`.
- **AC-S53-5** — With `internal.transactional_notice.send` executable and `KB_APPROVAL_SENDER` blank,
  `npm run preflight:production` exits non-zero and its output names `KB_APPROVAL_SENDER`, and
  `buildDemoDeployCommand` returns `ok:false`. The refusal fires with `KB_APPROVAL_NOTIFICATIONS_ENABLED`
  set to `false`, proving the guard is keyed to the gate rather than to the unrelated digest flag. With a
  valid `@pmikcmetro.com` subject mailbox set, filing one support report produces exactly one delivered
  internal notice and one receipt. _Verify:_ `npm test -- tests/unit/cutover-readiness-golden.test.mjs`,
  `npm test -- tests/unit/live-cost-scripts.test.mjs`,
  `npm test -- tests/unit/internal-transactional-sender.test.ts`; keep
  `tests/unit/report-issue-route.test.ts` green.
- **AC-S53-6** — `POST /api/maintenance/intake/public` returns 503 with the generic body
  "Maintenance intake is not available." while `MAINTENANCE_INTAKE_TOKEN_SECRET` is absent, and returns 202
  with a fresh random reference (never the document id or the jti) for a validly minted token once both
  secrets are provisioned AND bound by `--set-secrets`. A secret that exists in Secret Manager but is
  missing from `readRuntimeSecrets` fails the deploy plan rather than shipping a still-closed route.
  _Verify:_ `npm test -- tests/unit/maintenance-intake-public-route.test.ts`,
  `npm test -- tests/unit/maintenance-intake-token-route.test.ts`,
  `npm test -- tests/unit/live-cost-scripts.test.mjs`; keep `tests/unit/route-auth-boundary.test.ts` green.
- **AC-S53-7** — While `google_drive.renewal_comp_screenshot.store` is closed, the renewal desk
  renders NO comps-screenshot file input (today it renders one that can only 409). With no
  `RENEWAL_COMP_DRIVE_FOLDER_ID` set,
  `readServerConfig().renewalCompImageFolderId` resolves to
  `MAINTENANCE_PHOTO_DRIVE_FOLDER_ID`; with neither set, preview/commit both return the safe setup
  refusal without constructing Drive. This acceptance check does not open the key; AC-S53-13 is the
  separate action contract required before activation. _Verify:_
  `npm test -- tests/unit/renewal-comp-screenshot.test.ts`,
  `npm test -- tests/unit/server-config.test.ts`, `npm run verify:copy-voice`.
- **AC-S53-8** — An Admin-reachable, non-Test path previews and — only after exact confirmation against the
  payload hash — executes `vendor.account.invite` and `vendor.assignment.change` through the live
  `VendorLifecycleProvider`, producing a bodyless receipt and a reconcilable idempotency key; a repeat with
  the same key yields one effect and one receipt. `vendor.account.disable` reverses it. The seven
  `vendor.gmail.*` keys still return 409. A negative-import test proves the reachable path does not import
  `lib/release/synthetic-execution.ts` or `lib/maintenance/test-workflow.ts`, so S46's removal cannot break
  it. _Verify:_ `npm test -- tests/unit/vendor-lifecycle.test.ts`,
  `npm test -- tests/unit/maintenance-vendor-executors.test.ts`,
  `npm test -- tests/unit/vendor-assignment-boundary.test.ts`,
  `npm test -- tests/unit/vendor-invite.test.ts`; keep `tests/unit/vendor-bodyless-audit.test.ts` and
  `tests/unit/vendor-auth.test.ts` green.
- **AC-S53-9** — `readServerConfig()` exposes `SPACE_PROVISIONING_ENABLED` resolving false by default, the
  deploy plan forwards it, and the S36 provision route returns 503 while it is false, 403 without
  `manageAdmin`, and 400 without `confirm:true`. Grepping the repository for `SPACE_PROVISIONING_ENABLED`
  returns code hits, not documentation-only hits. _Verify:_ `npm test -- tests/unit/server-config.test.ts`,
  `npm test -- tests/unit/live-cost-scripts.test.mjs`.
- **AC-S53-10** — Every Table C key is still `production_allowed:false` after this suite, including both
  client-facing send keys, generic `gmail.message.send`, and the seven `vendor.gmail.*` keys; an attempted
  trusted publication in a production descriptor returns the scanner-unavailable refusal rather than
  publishing. No test in the repository asserts a Table C key is executable. _Verify:_
  `npm test -- tests/unit/action-registry-schema.test.ts`,
  `npm test -- tests/unit/seed-action-registry-allowlist.test.ts`, plus the publication authority tests.
- **AC-S53-11** — The Production deploy plan contains explicit `ENVIRONMENT_KIND=production` and
  `DATA_CONTEXT=live` entries in its `--set-env-vars` map, and `npm run preflight:production` exits
  non-zero when the resolved descriptor source is `legacy-node-env` or the pair is anything other than
  `production`+`live`. _Verify:_ `npm test -- tests/unit/live-cost-scripts.test.mjs`,
  `npm test -- tests/unit/cutover-readiness-golden.test.mjs`,
  `npm test -- tests/unit/environment-descriptor.test.ts`.
- **AC-S53-12** — Sheet write-back confirmation is immutable, one-attempt, recoverable, and
  correctable. Resolve returns a server-issued preview/hash binding actor, run/trigger, canonical
  property/field, exact approval id/version/source/value, spreadsheet/tab/A1, structural row identity,
  and environment. Commit requires the byte-identical unexpired hash; the winning Firestore claim
  transaction re-reads the exact Approved decision and queued resolution so revocation,
  same-value/different-source, wrong-field, and target drift refuse before mutation. The target header
  and row identity must each resolve exactly once across the grid.

  The live provider contract is ONE globally scoped idempotency-key/payload ledger with THREE required
  operations: (1) atomically bind the key/payload, resolve the unique logical row, require the exact
  human-confirmed A1/current value, apply once, and return immutable effect id/A1/time/result evidence;
  (2) return exact status for that same key/payload; and (3) atomically tombstone an absent key so a
  claim-before-provider crash becomes terminal and every delayed mutation refuses. A missing lookup,
  blank cell, timeout, pending, or unknown result never proves absence and never permits a successor.
  Applied evidence from any cell other than the exact confirmed A1 is rejected. Duplicates and
  concurrent reconcilers converge on one bodyless receipt.

  Correction has its own exact preview/claim and may clear only the current generation of the original
  provider effect. Every intervening edit by any collaborator/API must invalidate that generation,
  including clear-and-retype of the identical value; value hash alone never proves provenance. Durable
  status/reconcile/correction remains visible after approval return, while a fresh write requires a
  different exact approval version. Recovery may terminalize provider idempotency state but creates no
  Sheet/customer effect. Recovery is a control-plane mutation, not a read-only operation, when it
  terminalizes an absent provider key. The live Google writer intentionally implements none of the
  three provider operations, the Registry row stays `Needs Connection`/`Undocumented`/closed, and a
  static sentinel confines raw fixed-A1 calls to synthetic smoke.

  _Verify:_ `npm test -- tests/unit/google-sheets-write-client.test.ts`,
  `npm test -- tests/unit/sheet-writeback-contract.test.ts`,
  `npm test -- tests/unit/sheet-writeback-service.test.ts`,
  `npm test -- tests/unit/sheet-writeback-ui-contract.test.tsx`,
  `npm test -- tests/unit/sheet-writeback-runtime-boundary.test.mjs`,
  `npm test -- tests/unit/lease-renewal-writeback-route.test.ts`,
  `npm test -- tests/unit/lease-renewal-sheet-writeback-execution.test.ts`,
  `npm test -- tests/unit/lease-renewal-writeback-safety.test.ts`, and `npm run test:firestore`
  (the wrapper runs the full Firestore suite, including
  `tests/firestore/lease-renewal-writeback-execution-store.test.ts`; it does not accept a focused path).

- **AC-S53-13** — Comp screenshot storage is a two-step action, never an upload-on-first-POST shortcut.
  Preview validates the file without Drive construction and hashes the exact bytes plus actor UID,
  renewal/comp record, approved folder id, media type, size, and environment. Commit requires the
  byte-identical unexpired hash and a winning idempotency key, uploads once, persists a durable
  bodyless receipt, reads back the Drive file id/metadata, and returns the same receipt on retry.
  Reconcile distinguishes delivered, absent, and ambiguous without re-uploading; rollback moves only
  that receipted file to Drive trash after its own exact confirmation and verifies the trashed state.
  While any part is absent, the key stays `production_allowed:false` and the Production control stays
  hidden. _Verify:_ `npm test -- tests/unit/renewal-comp-screenshot.test.ts`,
  `npm test -- tests/unit/renewal-comp-screenshot-route.test.ts`,
  `npm test -- tests/unit/action-registry-schema.test.ts`.
- **AC-S53-14** — Full gates pass: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`,
  `npm run test:firestore`, `npm run test:e2e:core`, `npm run verify:copy-voice`,
  `npm run verify:redaction`, `npm run verify:spec-traceability`, `npm run verify:context-freshness`, and
  `npm run build`; keep the action-gate, auth-identity, route-auth-boundary, provider-construction,
  redaction, environment-descriptor, and cutover sentinels green.

**Forbidden actions / hard gates.** No autonomous CLIENT-facing send — internal-staff notification
auto-send is permitted per `D-AUTOMATION-LINE`, and the vendor setup link, being external-facing, stays
Admin exact-confirmed. Generic non-workflow `gmail.message.send` stays Registry-closed permanently; this
suite adds no generic-send flip. No personal account in any auth path; the internal identity is the
pmikcmetro.com domain mailbox only. No secret, credential, token, customer name, PII, or guessed endpoint
in git, this file, a test fixture, a log line, or an owner packet body — the first vendor's company and
contact address live in the owner packet, never in the repository, and `npm run verify:redaction` still
forbids `golden-data/` and `docs/client_docs/` content. Every live effect stays one-attempt, idempotent,
receipted, reconciled, and reversible; every client-facing send AND every system-of-record write stays
human-confirmed. Cost-bearing steps obey the production cost ceiling defined by S52 — the retired flat cap
is not an input, and no step may assume the old figure. Routine application deploy, smoke, and traffic
promotion may run under D05 only after the full gate, fresh auth and budget preflights, prior-revision
capture, and rollback smoke pass. Credential creation, IAM/billing changes, scope grants, and destructive
operations stay owner-run. Suite-specific hard stops: (1) NEVER grant by category, readiness tier,
evidence status, or "everything that is ready" — only by a key that appears verbatim in Table A, and adding
a key to Table A is an owner decision, never a runner inference; (2) NEVER flip
`google_sheets.renewal_checklist.writeback` before its gate/descriptor fences, immutable
preview/transactional-current-approval claim, and all provider guarantees in AC-S53-12 are documented
and proven: stable-row exact-A1 mutation, global key/payload binding, exact status, atomic absent-key
tombstone, immutable effect evidence, and same-value-ABA-safe cell generation. Local contract code
alone never licenses the flip; NEVER flip
`google_drive.renewal_comp_screenshot.store` while a first POST can upload or before AC-S53-13's
receipt/reconcile/trash-rollback contract is complete; (3) NEVER report a capability as
active on the strength of the gate alone; the resolved runtime value must be present, and a
provisioned-but-unforwarded value is inert by construction; (4) NEVER hand the owner a "create the secret"
step without the paired deploy-wrapper change in the same packet, because the wrapper's `--set-env-vars`
replaces the whole map and a value outside its allowlist cannot reach the service; (5) NEVER remove the
Test Vendor path (S46) before the live Vendor path proves reachable under AC-S53-8; (6) the D12 paths are
exactly `firestore.rules`, `lib/integrations/action-gate.ts`, `lib/auth/**`, Action Registry
`production_allowed` changes, `scripts/check-budget-guard.mjs`, and `infra/budget-guardrail/**` — prepare,
verify, and surface those changes for owner review rather than pushing them under the standing grant. A
wrapper or allowlist change paired with a protected activation travels in the same review package. Park
that activation and continue any dependency-independent slice; a protected review stops the whole loop
only when every remaining safe slice depends on it.

**Ordered prompt sequence.**

1. _Discovery:_ read `lib/integrations/action-gate.ts`, the Table A entries in
   `lib/integrations/action-registry-seed.ts`, both `EXECUTABLE_ALLOWLIST` copies, the write-back chain
   (`route.ts` → `sheet-writeback-service.ts` → `sheet-writeback-execution.ts`),
   `lib/environment/descriptor.ts`, `readRuntimeEnv`/`readRuntimeSecrets` in
   `scripts/deploy-demo-cloud-run.mjs`, and `scripts/preflight-production-cutover.mjs`. Confirm G1-G5 still
   reproduce before changing anything; a defect that no longer reproduces is recorded as MOOT, not fixed.
2. _Understanding:_ write the resolved activation matrix — for each Table A and Table B row, the current
   gate state, the current runtime value, the wrapper status, and the exact pinned tests. Prove which rows
   are inert versus closed. Do not proceed on a row whose current state you cannot state from code.
3. _Build:_ close G1 — add `assertActionExecutable` and `assertLiveProviderActionAllowed` to the
   write-back service ahead of `buildLiveWritebackDeps`, with refusal tests that assert zero writer
   calls (AC-S53-1, AC-S53-2). The gate stays closed in this step; only the refusal path changes.
4. _Build:_ replace boolean-only Sheet confirmation with AC-S53-12's immutable server-preview hash,
   one-attempt idempotency, receipt/readback/reconcile, and guarded correction. The gate remains closed.
5. _Build:_ close G5 and G3 — forward `ENVIRONMENT_KIND`/`DATA_CONTEXT`, refuse `legacy-node-env` in the
   cutover preflight, and add `SPACE_PROVISIONING_ENABLED` (default false) to `lib/config/server.ts` and to
   `readRuntimeEnv` (AC-S53-9, AC-S53-11).
6. _Build:_ close G2 — re-key the `KB_APPROVAL_SENDER` requirement to the resolved gate state of
   `internal.transactional_notice.send`, and generalize it so any executable key that needs an identity or
   secret is checked the same way (AC-S53-5).
7. _Build:_ land the deploy-forwarding sentinel and the readiness inertness projection (AC-S53-4). This is
   the check that makes every later row honest, so it ships before any flip.
8. _Build:_ close G4 safely — hide the control while its key is closed, add the folder fallback, then
   replace upload-on-first-POST with AC-S53-13's preview/confirm/idempotency/receipt/reconcile/trash
   rollback contract. The key remains closed throughout this build step.
9. _Build:_ implement the live `VendorLifecycleProvider` behind `VendorLifecycleExecutor` with preview,
   exact confirmation, one-attempt idempotency, bodyless receipt, reconcile, and disable-as-rollback, plus
   the negative-import proof that it does not depend on anything S46 removes (AC-S53-8).
10. _Owner:_ hand back ONE redacted packet with six named inputs: (1) approval/provisioning for D32's
    transaction broker and protected target/ledger ranges; (2) the `KB Proposed — Comp basis` column
    plus confirmed spreadsheet id and tab name; (3) the pmikcmetro.com DWD subject mailbox for
    `KB_APPROVAL_SENDER`; (4) `MAINTENANCE_INTAKE_TOKEN_SECRET` and
    `MAINTENANCE_INTAKE_IP_HASH_SALT` in Secret Manager plus the accessor binding; (5) one vendor
    company and contact address; and (6) the `roles/discoveryengine.admin` grant on the runtime service
    account. Each input names the wrapper change that ships with it.
11. _Gate:_ only after each row's own contract and owner input are green, apply the flip recipe for
    that row. AC-S53-12 completes the local Sheet contract and never licenses a flip by itself.
    Write-back may flip only after the separate D32 adapter and authenticated synthetic-workbook proof
    demonstrate stable-row mutate, exact status, atomic absent-key tombstone, immutable effect evidence,
    protected ranges/current-cell generation, and rollback; then fresh auth confirms the operational
    column/id/tab. Comp screenshot waits for AC-S53-13; each Vendor key waits for AC-S53-8. Update the
    seed, both `EXECUTABLE_ALLOWLIST` copies, and pinned
    tests in one reviewed change per row. Prepare these for owner review because each row changes the
    protected `production_allowed` field; the allowlist/test changes travel with that package.
12. _Verify:_ run AC-S53-1 through AC-S53-14 and explicitly falsify: an ungated write-back call, a
    Demo-descriptor write attempt, boolean-only or stale-hash Sheet confirmation, approval/cell drift,
    a duplicate Sheet update, an upload on screenshot preview, a duplicate screenshot upload, missing
    receipt/readback, unsafe Drive rollback, a category-shaped grant, a flipped key missing from an
    allowlist copy, a provisioned-but-unforwarded value reported active, a blank sender with the
    internal gate live, a missing intake secret, a closed-gate screenshot control, a Table C key
    reported executable, and a Vendor path that imports a surface S46 deletes.
13. _Context update:_ promote the shipped work to `docs/facts.md` `F-*` rows citing the `AC-S53-*` ids
    satisfied, record the Supersede Log markers for the four now-false claims listed under Cross-product
    impacts, record the `Q-`/`A-` row for the inert-versus-blocked projection wording, and advance
    `docs/loop-state.md` at each slice boundary.

**Deletion/merge recommendation.** KEEP this spec as the durable activation contract: Table A is the
green light of record, Table B is the anti-inertness register, and Table C is the standing list of
deliberate non-grants. Do not merge it into S52 (cost) or S54 (verification parity) — those govern
different failure modes. MERGE nothing into it; other suites cite its rows rather than restating them.
No working packet exists on disk today (`docs/temp/greenlight-activation-plan.md` is absent, verified
2026-07-29); if a build slice creates one at that path, it is disposable and is DELETED once each row's
outcome is recorded as a `docs/facts.md` fact. When a future phase grants another key, the change is a new Table A row here
plus its pinned-test move — never a category, and never a runner-authored addition.
