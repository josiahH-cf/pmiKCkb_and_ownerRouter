# Away Mode (Remote Autonomy Overlay)

This is a **temporary, reversible overlay** on top of the normal governance in
`AGENTS.md` and `docs/autonomous-agent-runner.md`. It is currently **inactive**. Keep the
file as a reference for the prior remote-autonomy posture and for any future explicit
reactivation.

<!-- The line below is machine-readable. scripts/check-budget-guard.mjs parses it. -->
<!-- Set it to INACTIVE (see the Return Checklist) to lift the overlay. -->

AWAY_MODE_STATUS: INACTIVE

## Status

- Status: **INACTIVE**
- Activated: 2026-06-09; converted to remote-autonomy posture on 2026-06-11.
- Deactivated: 2026-06-15; owner returned to active desk-side coordination.
- Owner posture: available/asynchronous; use normal approval gates for live/cloud/client
  actions.
- Durable budget cap: **$10 total** unless the owner explicitly changes it in writing.
  The guard constant is in `scripts/check-budget-guard.mjs`.

## Current Effect

This overlay grants no standing approval while inactive. Normal development may continue,
especially client-unblock docs, verification, migration readiness, and regression fixes.
Live Gmail access, external communications, client Drive writes beyond approved source
folder setup, cost-bearing cloud steps, deploys, imports, and system-of-record writes still
need the normal explicit approval path.

## Intent

When this overlay is explicitly active, run unimpeded on useful engineering, migration,
and setup work. Stop only when the next action is likely to:

- create unmanaged or unbounded cost;
- make a destructive, hard-to-rollback, or breaking change;
- expose secrets, customer records, raw Gmail/customer content, ledgers, bank data, SSNs,
  or full lease packets;
- send external communication or autonomous Gmail/notification output; or
- write to a system of record without an approved Action Registry entry and rollback plan.

Do not use inactive Away Mode as a reason to resurrect the remote queue. If the task is
reversible, bounded by the budget guard, and supported by active docs, proceed under the
normal governance path.

## Standing Autonomy

The unattended loop is authorized to do all of the following without waiting for the owner
to be physically present:

- build product code, tests, docs, scripts, UI, migration helpers, and runbooks;
- commit, push, and fast-forward/merge branches when the worktree is clean and validation
  is recorded;
- run local tests, emulators, build, dry-runs, falsification, and browser smokes;
- run non-destructive Google/Firebase/API setup commands when they are idempotent or
  safely retryable and their identifiers are recorded in `docs/environment-handoff.md`;
- enable APIs, create or reuse Firebase apps, deploy Firestore rules/indexes only after
  rules tests pass and rollback is recorded, seed app-owned metadata, and set up
  staging/demo infrastructure when the commands are reversible and cost-bounded;
- perform migration/cutover prep through APIs, including source manifests, source bucket
  and Agent Search planning, production preflights, scale-to-zero deploy planning, and
  approved small live smokes;
- use the sanctioned cheap-live path when needed: Flash model, budget guard passing,
  scale-to-zero Cloud Run, notifications off, and source/import scope recorded; and
- use `--allow-multiple-spaces` for bounded migration/setup when multiple Spaces are
  necessary, sources are approved, and expected spend remains below the $10 cap.

## Hard Stops

Stop and queue a remote-owner decision before any of these:

- billing-account changes, quota increases, cap increases, or any action expected to put
  total spend near or above $10;
- Pro model usage (`--allow-pro`) or any unmetered/unknown-cost model/API path;
- live Gmail/approval notification sends (`--allow-notifications`), external email, or
  client communication;
- deleting, replacing, or overwriting production/staging resources without a tested rollback
  path, including data stores, buckets, databases, domains, OAuth clients, IAM grants, or
  service accounts;
- schema/data migrations that cannot be rolled back or replayed safely;
- raw client data import, raw Gmail access, or use of secrets not already available through
  approved local/managed credential paths;
- downloadable service-account key creation unless a named exception and storage/rotation
  plan already exist; and
- system-of-record writes to RentVine, LeadSimple, DotLoop, QuickBooks, Boom, operating
  Sheets, banks, ledgers, client Drive folders, or Gmail unless the Action Registry says
  the exact action is `Approved for Execution`, documented, `production_allowed`, and the
  run has a preview plus rollback/correction plan.

## Cost Discipline

Run `npm run check:budget-guard` before live mode, deploy, import, indexing, source upload,
or notification work. The guard:

- passes for demo mode;
- passes for the cheap-live path;
- allows `--allow-multiple-spaces` in Away Mode for bounded migration/setup and prints a
  warning;
- refuses `--allow-pro` in Away Mode; and
- refuses `--allow-notifications` in Away Mode.

If a command does not have a deterministic cost guard, prefer dry-run or planning output
first. If the model cannot explain why the action stays below the cap, it must stop before
running it.

## Remote Owner Protocol

Do not wait for synchronous review unless a Hard Stop applies. When a decision is needed:

1. Record the exact action, cost exposure, environment, data touched, rollback path, and
   consequence of waiting in `docs/loop-state.md`.
2. Continue with other non-blocked work.
3. If no other non-blocked work remains, stop cleanly with current verification.

The owner being remote is not a reason to avoid useful setup. It is only a reason to keep
decisions crisp and cheap.

## Run Loop

At each slice boundary:

- update `docs/loop-state.md`;
- update `docs/status.md` after meaningful work;
- record non-secret environment identifiers in `docs/environment-handoff.md`;
- run verification proportional to the change; and
- keep going into the next readiness/migration/product slice unless a Hard Stop or quality
  failure fires.

`docs/loop-state.md` contains the current large-run queue. It is intentionally sized for a
large-context model and may span setup automation, migration tooling, e2e hardening,
non-executable Lease Renewal foundation, Gmail Inbox 0 foundation, and integration
readiness. Future models should use that queue as standing authorization to keep working
through multiple substantial batches.

## Expiry Handling

If the owner explicitly reactivates this file later, do **not** revert to the old local-only
posture. Use the remote-autonomy posture above until the owner uses the Return Checklist
again.

## Return Checklist

To restore normal non-overlay governance:

1. In this file, change `AWAY_MODE_STATUS: ACTIVE` to `AWAY_MODE_STATUS: INACTIVE`, and
   set Status to **INACTIVE** (or delete this file entirely; the budget guard treats a
   missing file as not-active).
2. In `AGENTS.md`, delete or update the temporary Away Mode block near the top.
3. In `docs/loop-state.md`, update the `Operating mode:` line and clear resolved remote
   decision queue items.

Completed on 2026-06-15.

The durable budget policy, budget guard script, CI guard, and `.gitignore` hardening stay.

## What Is Intentionally Not Changed

- `.codex/config.toml` remains open for unattended execution.
- Security rules still block secrets and raw customer/Gmail data in git.
- Human send authority is preserved.
- System-of-record writes still require explicit Action Registry readiness.
- Missing sources still produce visible uncertainty, not generic property-management
  answers.
