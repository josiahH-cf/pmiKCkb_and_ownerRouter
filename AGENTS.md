# PMI KC Product Agent Router

This is the only authority-bearing runner-neutral router for this repository. Read it before acting.
Current implementation truth lives in `docs/facts.md`; the resume pointer is
`docs/loop-state.md`. Historical documents removed during the 2026-08-26 context reset remain
recoverable in Git at commit `1356918`, but they are not active guidance.

## Truth precedence

When two sources disagree, use this order:

1. this router for authority and safety;
2. live readback plus committed code/tests for implementation truth;
3. `docs/facts.md` for the concise verified ledger;
4. `docs/loop-state.md` and `docs/plan.md` for current work;
5. an active file listed in `docs/feature-suites/README.md`;
6. Git history for provenance only.

Never revive a historical blocker, Demo/Test policy, action grant, or provider claim without checking
the current code and live service. Date-stamped history is not authority.

## Present production truth — 2026-09-02

- Project: `pmi-kc-kb-prod`; Cloud Run service: `pmi-kc-app`; region: `us-central1`.
- Canonical URL: `https://pmi-kc-app-kq6wuvpiva-uc.a.run.app`.
- Serving revision: `pmi-kc-app-rmtkmhj1z-8855e4c6dbfb`, 100% traffic.
- Deployed code: `d243911cb20ffb01773072c0e27c723648eeea34`.
- The 2026-08-27 rollback rehearsal moved 100% traffic to predecessor
  `pmi-kc-app-rmtafuqbg-4e2e4ffe0f48`, passed exact version and bounded-route smoke, restored the
  then-current `pmi-kc-app-rmtbh280n-61b78ef991cc` revision, and passed the same smoke again. The
  current release captured `pmi-kc-app-rmtkgn08q-db89a37c43dc` as its immediate rollback target.
- Runtime: explicit `ENVIRONMENT_KIND=production` and `DATA_CONTEXT=live`.
- Production is Live-only. Product Demo/Test records, seeders, simulations, and fake provider effects
  are not production features.
- Local rehearsal is explicit Demo + Live-read-only and must refuse every persistence/provider effect.
- S96 connector disconnect/reconciliation is deployed. Production currently has no
  `connector_connections` records, so its served inertness gate used the specified no-target path and
  no credential or vault effect ran.
- S85's theme/Appearance system is deployed with the OFFICIAL PMI brand values. The owner ruled
  (2026-09-02) the published PMI Brand Style Guide 071525 the approved source; its extracted
  values (PMI Orange #ff6d00, Black #000000, White #ffffff, Poppins) drive the brand source layer
  with contrast-derived accessible tones where official orange fails a floor. `brand_conformance`
  is resolved.
- S86's shared action/link/icon/help/busy/notice/dialog/page-state and transient-layer system is
  deployed. Its migrated consequential actions use exact cancel-first in-app confirmation and
  returned-state feedback without widening routes, permissions, action keys, or provider effects.
- S83's capability-guided access-request workflow is deployed. Every managed staff user can inspect
  and request additive role/Space access; only a different current Admin can deny or exact-confirm
  application, and Firebase directory readback is required before a request becomes applied. The
  Firestore Admin mirror matches the authoritative 48-key/16-open registry.
- S84's grouped navbar navigation is deployed. One actor-filtered manifest renders the My Work,
  Operations, and Admin disclosure groups with descriptive rows over unchanged routes and guards;
  visible navigation/landing terminology is Dashboard and Internal Processes while `/`, `/ask`,
  `/spaces`, internal Console/Space contracts, and stored provenance values are unchanged.
- S82's original table-first renewal desk and guided workspace are deployed. Its canonical
  `renewal-desk-query/v2` URL carries owner/tenant filters only as opaque Secret Manager-derived
  `p1_` tokens, and navigation performs no verification, progress, source write, or send. A current
  adversarial review reopened S82 conformance: nullable rent, typed auxiliary-read failure,
  desk/workspace evidence parity, source destinations, phase-local controls, freshness, filter
  discoverability, and browser-assurance corrections are active in the worktree but are not deployed.
- S97 is COMPLETE and deployed. Each exact key passed its own bounded serial live proof on the
  owner-designated test lease 115 (property 84) before its protected activation: dates
  forward/readback/duplicate-replay/restore; charge create with honest ambiguity reconciliation,
  receipt-bound DELETE, delete-reconciliation, and a durable approved update-target charge; charge
  update with a restore whose hash equals the original creation receipt. The three keys are open
  in the committed seed and both executable allow-lists with proof citations; every execution
  still requires the runtime-suspension term, Admin role, exact preview/confirm, one-attempt
  claim, receipt, readback, and reversal-by-new-confirmation. The permanent labeled TEST row in
  the operating Sheet (below a spacer at the tab tail) anchors the designated lease.
  That historical proof used the then-serving bounded contract; it does not authorize current
  normal-product attribution from matching observations. Generation-bound replay, fresh duplicate
  after-state verification, and fail-closed ambiguous-create handling are active in the worktree but
  are not deployed: without provider-owned causality, a matching charge cannot mint a success receipt
  or receipt-bound delete authority.
- S98's proof-qualified baseline is deployed: both exact operating-Sheet keys are open, its write
  switch is on, and the temporary proof row was deleted and read back absent. The serving revision
  still exposes its historical fixed-row update/delete contract. An active unreleased correction
  keeps normal server-derived row append but refuses normal field update and every fixed-row
  delete/restore before writer construction because the current Google Sheets integration has no
  provider-owned stable-logical-row, expected-generation, idempotency/status, and tombstone seam.
  Historical proof receipts remain evidence and the completed proof runner must not mutate again.
- S99 is COMPLETE and deployed. Its exact RentVine work-order read, create, and status-update keys
  passed bounded live proofs and are executable. Proof work order 1731 is in its final Cancelled
  state; Vendor assignment, attachments, chat posting, provider notifications, and sends remain out
  of scope.
- S100's closed-safe implementation is deployed, and `rentvine.work_order.chat.sync` passed its live
  proof and is executable. `gmail.maintenance_resident_reply.draft_create` remains closed and S100
  remains BLOCKED on one exact runtime input: a synchronized resident message mapped to a verified
  resident email. No eligible record currently exists on the designated proof thread.
- Eleven production Spaces are configured.
- The operating renewal Sheet is a read source and an exact human-confirmed write target. Its
  write-back runtime switch and two exact Registry keys are on; that configuration never overrides
  the operation-level capability refusal described for the active S98 correction.
- RentCast is selected, allowance-capped at 50 requests per measured period, and its exact read key is
  open.
- RentVine read credentials are Secret Manager-bound. The retired S30 broad proof identifier
  remains closed; the S97 proof runner and the three proven exact keys supersede it.
- Budget controls are live: $25 alert-only budget, $100 project hard stop, $100 account backstop, and
  active Node.js 22 guardrail with `KILL_SWITCH_CAP_USD=100`.
- S36 has not started because its S100 prerequisite is incomplete. S82 conformance, S97 integrity,
  S98 append/receipt integrity plus fixed-row capability refusal, and expanded S51/S54 production
  assurance are committed (`e6b76f9`) and deployed as zero-traffic candidate
  `pmi-kc-app-rmtlsgy0i-ffb8a132da84` from commit `ff200d30cafa8552a6e96718b2a288122ef24f80`;
  its anonymous smoke passed and promotion waits on the managed Admin/Editor browser profiles and
  the S51 monitoring resource set. The owner's 2026-09-03 renewal-completion program (S102-S111 and
  the rewritten S34) executes before S36 and the S88-S95 program; S102 is committed in
  `ff200d3`, carried by that candidate, and not promoted. S87-S95 and S101 remain specification-only desired behavior.

## Product boundary

PMI KC is one deployed application with three connected lanes:

- PMI KC KB: source-backed knowledge, Console, Spaces, processes, approvals, and Admin.
- Lease Renewal Agent: complete RentVine/Sheet reads, reconciliation, comps, reviewed drafts, and
  lease-specific work.
- Workflow Communications: workflow-linked Gmail reads, labels, replies, and unsent drafts. It is not
  a general inbox or autonomous messaging product.

Maintenance, resident intake, Vendor work, feedback, and staff work accountability are application
capabilities within those lanes, not separate Demo products.

## Standing authority

The owner has authorized the runner to:

- implement the full application to each real external seam;
- commit and push a green slice directly to `main`;
- deploy a zero-traffic Cloud Run candidate, smoke its exact commit/revision, promote the exact
  revision, and restore the captured predecessor when rollback proof is required;
- configure the application's GCP resources under a managed `pmikcmetro.com` or project service
  identity, including APIs, quotas, IAM required by the app, Pub/Sub, Scheduler, Cloud Run, Cloud
  Functions, budgets, alerts, authorized domains, and OAuth redirects;
- process live resident, owner, lease, and operational data in Production;
- apply a safe documented default and continue when a non-authority question is uncertain.

Every cloud mutation must be read back. Record verified non-secret outcomes in `docs/facts.md`.

## Permanent safety boundaries

- No autonomous, scheduled, bulk, or model-triggered client-facing send.
- Renewal and maintenance initiation ends with an unsent Gmail draft; a person sends from Gmail.
- Every live system-of-record write is human-initiated, exact-previewed, exact-confirmed,
  idempotent or at-most-once, receipted, read back, and reversible/correctable. The sole specified
  exception is S100's manual RentVine chat GET: the official provider marks retrieved manager
  messages read and documents no unread restoration. It therefore requires an explicit consequence
  warning and confirmation, one bounded page, honest ambiguous-state reporting, and no claim of
  rollback.
- No sample, synthetic, or test identity/data may become a live draft, send, provider write, or
  production record.
- Secrets, tokens, credentials, client exports, Gmail bodies, customer values, and raw evidence never
  enter Git.
- Staff, runner, Firebase, connector, Cloud Build, and runtime identities must be
  `pmikcmetro.com` or project service identities. Personal identities are forbidden.
- Do not guess provider endpoints, record identifiers, mappings, recipient addresses, policy, or
  customer values.
- Destructive production data work requires backup, dry-run, exact target, and rollback.
- Every live effect must be bounded and reversible/correctable, except the explicitly warned and
  confirmed S100 manager-read marker described above.

## Action authority

Production activation is per exact Action Registry key. Never infer a category grant.

Open keys as of 2026-09-02:

- `rentvine.work_order.create`
- `rentvine.work_order.read`
- `rentvine.work_order.update_status`
- `google_sheets.renewal_checklist.row_append`
- `google_sheets.renewal_checklist.field_update`
- `gmail.mailbox.read`
- `gmail.thread.reply`
- `gmail.label.apply`
- `gmail.renewal_notice.draft_create`
- `gmail.maintenance_owner_notice.draft_create`
- `rentcast.rental_listings.search`
- `internal.transactional_notice.send`
- `rentvine.lease.renewal_dates.update` (S97 proof-qualified activation, 2026-09-02)
- `rentvine.lease.recurring_charge.create` (includes only its receipt-bound reversal DELETE)
- `rentvine.lease.recurring_charge.update`
- `rentvine.work_order.chat.sync`

The other 32 keys are closed. In particular:

- `gmail.renewal_notice.send`, `gmail.maintenance_owner_notice.send`, and
  `gmail.message.send` remain permanently closed under D33;
- `gmail.maintenance_resident_reply.draft_create` remains closed pending its exact S100 live proof;
- the retired `rentvine.lease.renewal_writeback` compatibility identifier remains closed;
- `google_sheets.renewal_checklist.writeback` remains closed.

A runtime flag or open Registry key never outranks an operation-level provider-capability refusal.

### Owner-authorized activation program — current boundary

The owner directed on 2026-08-31 that the application graduate from categorical read-only posture
to exact human-confirmed source-of-truth updates. S97, S98, S99, and the S100 chat-sync action passed
their bounded per-key proof windows, mandatory close/readback, and separate final activations. An
open key is authority, not proof that the provider currently exposes every safety primitive. The
active S98 correction therefore refuses field update and fixed-row reversal even though their
historical keys/receipts remain registered. No activation is a generic method/path/body, bulk,
autonomous, model-triggered, or send grant.

The sole remaining activation-program key is
`gmail.maintenance_resident_reply.draft_create`. It may receive one bounded proof window only after
the S100 contract resolves a synchronized resident message to a verified resident email, followed by
mandatory close/readback and a separate protected activation only after proof. Its absence blocks
S100 completion and therefore S36, not the already delivered S97-S99 or chat-sync actions.

The broad `rentvine.lease.renewal_writeback` and
`google_sheets.renewal_checklist.writeback` compatibility keys remain closed and are retired rather
than activated as product or proof actions. Completed proof windows used only the exact new key under
proof plus its suite's required runtime switch, and every executed window was closed and read back
before final activation. Receipt-bound reversal under a create/append key is allowed only when that
suite defines the exact inverse operation and the current provider seam can bind it safely; it is not
general delete authority. S98's active correction finds no such fixed-row Sheet seam and refuses it.
`rentvine.work_order.assign_vendor`, RentVine chat posting, attachment upload, direct Gmail sends, and
every unlisted provider key remain closed. S36 separately authorizes one temporary, bounded Space
provision/import/readback/retirement pilot under its exact lifecycle; it is not Action Registry
category authority.

## Protected paths

Prepare and surface, but do not push without explicit owner direction:

- `firestore.rules`
- `lib/integrations/action-gate.ts`
- `lib/auth/**`
- any `production_allowed` change in `lib/integrations/action-registry-seed.ts`
- `scripts/check-budget-guard.mjs`
- `infra/budget-guardrail/**`

The owner-directed 2026-08-31 documentation reconciliation authorizes present-truth edits to this
router and `docs/facts.md`. The activation program above is also explicit owner direction for its
remaining resident-draft proof-window and final-activation patches at the gates stated above. It does
not authorize a new identity, safety exception, cost change, premature key opening, or any effect
outside that exact suite contract.

## Cost and cloud controls

The old claim that Production has a $10 hard stop is retired. Current verified controls are the $25
alert, $100 project hard stop, $100 account backstop, and guardrail cap 100. A protected legacy local
planning guard still has a conservative $10 fallback; it is not live Cloud Billing truth. Raising
headroom must move the applicable budget and guardrail together and be read back. Lowering/removing a
safety control, alert, domain in use, or guardrail still requires owner direction.

Routine deployments use the existing production service and reviewed production environment.
Preserve the runtime service account, eleven-Space configuration, secret bindings, Production+Live
descriptor, and enabled Sheet-write switch unless the requested change explicitly targets one of
them.

## Live-write proof policy

- Production remains Live-only. Do not create a fake person, lease, work order, provider record, or
  customer value for a proof.
- S97's designated-lease proofs, S98's temporary-row append/update/delete proof, S99's work-order
  proofs, and S100's chat-sync proof are complete. Their receipts and final readbacks govern; do not
  rerun or substitute a new proof target.
- Normal S97 and S99 effects remain bounded by their activated exact-key contracts. After the active
  S98 correction is released, only its server-derived normal row append reaches Sheets; field update,
  delete, and restore remain unavailable until a separately reviewed stable-row provider seam exists.
  S100 synchronization remains manual and discloses that the official read marks manager messages
  read. Missing or ambiguous mappings fail only the exact action.
- The remaining S100 resident-draft proof may use only a synchronized message with an exact mapped
  resident and verified email, and may create only an unsent draft in the signed-in managed mailbox.
  Until that runtime input exists and the key passes proof and activation, it remains unavailable.
- S36 may copy one already-approved source object byte-for-byte into its isolated temporary prefix,
  provision/import/read back one temporary store, retire it, delete only that copied object, and
  prove the original eleven-store/config state restored.
- Every proof and normal write remains exact-previewed, exact-confirmed, at-most-once where the
  provider lacks idempotency, receipted, read back, reversible or separately correctable, and bounded
  by its exact key and suite. S100's disclosed manager-read marker is the one non-reversible stateful-
  read exception above. Until a suite's prerequisites pass, its effects remain unavailable.

## Documentation hygiene

Active documentation is intentionally small. `docs/README.md` is the index.

- Update current documents in place; do not append a second contradictory history.
- `docs/status.md` is a current snapshot, not a changelog.
- `docs/facts.md` contains only present facts, active decisions, and genuinely open questions.
- `docs/loop-state.md` stays under 140 lines and contains only the current resume state.
- Completed program prompts, old audits, Demo/V1 packets, and superseded specs belong in Git history,
  not the active tree.
- If a document becomes false, rewrite or delete it in the same slice. Do not preserve false active
  prose with a warning banner.
- Ignored `docs/temp/` material is local scratch and must never be treated as evidence or read by
  default.
- New specs go only in `docs/feature-suites/`, use the template, and must be registered in its
  README.

## Execution loop

1. Read this file, `docs/facts.md`, and `docs/loop-state.md`.
2. Inspect committed code and live read-only state before accepting a stale claim.
3. Plan one bounded outcome and its falsification.
4. Implement with tests and preserve unrelated/user-owned changes.
5. Run focused adversarial tests, then `bash scripts/verify.sh` for a ship candidate.
6. Audit secrets, PII, gates, runtime config, and diff.
7. Commit/push only a green tree; deploy code changes through zero-traffic candidate smoke.
8. Update facts, status, plan, and loop state to the verified result.

No force-push, history rewrite, release tag, or branch deletion. Do not deploy documentation-only
changes unless they alter a served asset.

## Current routes

- Documentation index: `docs/README.md`
- Verified facts: `docs/facts.md`
- Current status: `docs/status.md`
- Resume point: `docs/loop-state.md`
- Current plan: `docs/plan.md`
- Product contract: `docs/spec.md`
- Active suites: `docs/feature-suites/README.md`
- Provider/action model: `docs/integration-architecture.md`
- Environment/release: `docs/environment-handoff.md`
- Security/engineering: `docs/engineering.md`
- Client/runtime inputs: `docs/client-checklist.md`

## Per-runner pointers

The repository is runner-neutral. Claude reads `CLAUDE.md`, which points here. Codex uses this file
directly and has no repo-tracked harness configuration. Runner-local settings never widen repository
authority.
