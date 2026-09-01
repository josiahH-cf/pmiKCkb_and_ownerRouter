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

## Present production truth — 2026-09-01

- Project: `pmi-kc-kb-prod`; Cloud Run service: `pmi-kc-app`; region: `us-central1`.
- Canonical URL: `https://pmi-kc-app-kq6wuvpiva-uc.a.run.app`.
- Serving revision: `pmi-kc-app-rmtic5vib-8774cfecd0c8`, 100% traffic.
- Deployed code: `fb32194b5a15be11fd1e7e2dff7192d62dd947fc`.
- The 2026-08-27 rollback rehearsal moved 100% traffic to predecessor
  `pmi-kc-app-rmtafuqbg-4e2e4ffe0f48`, passed exact version and bounded-route smoke, restored the
  then-current `pmi-kc-app-rmtbh280n-61b78ef991cc` revision, and passed the same smoke again. The
  current release captured `pmi-kc-app-rmtg73suu-fe8734d35330` as its immediate rollback target.
- Runtime: explicit `ENVIRONMENT_KIND=production` and `DATA_CONTEXT=live`.
- Production is Live-only. Product Demo/Test records, seeders, simulations, and fake provider effects
  are not production features.
- Local rehearsal is explicit Demo + Live-read-only and must refuse every persistence/provider effect.
- S96 connector disconnect/reconciliation is deployed. Production currently has no
  `connector_connections` records, so its served inertness gate used the specified no-target path and
  no credential or vault effect ran.
- Eleven production Spaces are configured.
- The operating renewal Sheet is a read source. Its write-back runtime switch is off.
- RentCast is selected, allowance-capped at 50 requests per measured period, and its exact read key is
  open.
- RentVine read credentials are Secret Manager-bound. The S30 proof runner can target only one exact
  lease `endDate`, remains closed, and is live-unproven.
- Budget controls are live: $25 alert-only budget, $100 project hard stop, $100 account backstop, and
  active Node.js 22 guardrail with `KILL_SWITCH_CAP_USD=100`.

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

Open keys as of 2026-08-27:

- `gmail.mailbox.read`
- `gmail.thread.reply`
- `gmail.label.apply`
- `gmail.renewal_notice.draft_create`
- `gmail.maintenance_owner_notice.draft_create`
- `rentcast.rental_listings.search`
- `internal.transactional_notice.send`

The other 34 keys are closed. In particular:

- `gmail.renewal_notice.send`, `gmail.maintenance_owner_notice.send`, and
  `gmail.message.send` remain permanently closed under D33;
- `rentvine.lease.renewal_writeback` remains closed;
- `google_sheets.renewal_checklist.writeback` remains closed.

A runtime flag never outranks the committed per-key gate.

### Owner-authorized activation program — specified, not current

The owner directed on 2026-08-31 that the application graduate from read-only provider posture to
human-confirmed source-of-truth updates. That direction authorizes a future runner to prepare,
review, test, push, release, and read back two protected changes for each exact S97-S100 key: a
bounded temporary proof window after the suite's closed implementation and deterministic gates pass,
followed by close/readback; and final activation only after that key's applicable live proof and all
remaining suite gates pass. It does not make any key executable now and is not a generic
method/path/body, bulk, autonomous, or send grant.

- S97: `rentvine.lease.renewal_dates.update`,
  `rentvine.lease.recurring_charge.create`, and
  `rentvine.lease.recurring_charge.update`.
- S98: `google_sheets.renewal_checklist.row_append` and
  `google_sheets.renewal_checklist.field_update`.
- S99: `rentvine.work_order.read`, `rentvine.work_order.create`, and
  `rentvine.work_order.update_status`.
- S100: `rentvine.work_order.chat.sync` and
  `gmail.maintenance_resident_reply.draft_create`.

The broad `rentvine.lease.renewal_writeback` and
`google_sheets.renewal_checklist.writeback` compatibility keys remain closed and are retired rather
than activated as product or proof actions. S97-S100 proof windows use only the exact new key under
proof plus its suite's required runtime switch; each is closed and read back before another key's
window or the final activation patch. Receipt-bound reversal under a create/append key is allowed only
when that suite explicitly defines the exact inverse operation; it is not general delete authority.
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
future exact protected-path proof-window and final-activation patches at the gates stated above. It
does not authorize a new identity, safety exception, cost change, premature key opening, or any
effect outside those suite contracts.

## Cost and cloud controls

The old claim that Production has a $10 hard stop is retired. Current verified controls are the $25
alert, $100 project hard stop, $100 account backstop, and guardrail cap 100. A protected legacy local
planning guard still has a conservative $10 fallback; it is not live Cloud Billing truth. Raising
headroom must move the applicable budget and guardrail together and be read back. Lowering/removing a
safety control, alert, domain in use, or guardrail still requires owner direction.

Routine deployments use the existing production service and reviewed production environment.
Preserve the runtime service account, eleven-Space configuration, secret bindings, Production+Live
descriptor, and closed Sheet-write switch unless the requested change explicitly targets one of
them.

## Live-write proof policy

- Production remains Live-only. Do not create a fake person, lease, work order, provider record, or
  customer value for a proof.
- S97 may use only the one unmistakable owner-designated ended lease supplied through secure
  execution context. Its proof is one temporary one-calendar-day `endDate` change, exact readback,
  separately confirmed rollback, and exact final restoration. If the target or state drifts, stop;
  never substitute another record.
- S98 may append one temporary row at the end of the operating `Renewals` table using fresh real
  source values. Mark it visibly and in a cell note as a writeback proof, exclude it from every
  downstream projection, read it back, separately set its blank `current_rent` to the fresh source-
  backed value through the exact field-update key, then separately delete only that unchanged marked
  row and prove final absence. The retired rehearsal-copy route is not a prerequisite or fallback.
- S99 live effects require one staff-selected real work order or an exact staff-confirmed creation
  proposal; S100 synchronization is manually initiated and discloses that the official read marks
  manager messages read. Missing or ambiguous mappings fail only the exact action.
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
