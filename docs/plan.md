# PMI KC Three-Product Plan

## Product Summary

This repo governs three purchased PMI KC products:

- PMI KC KB: existing source-backed web app runtime.
- Lease Renewal Agent: separate product lane; discovery and approval before runtime.
- Gmail Inbox 0: owner-email-first Gmail workflow, successor to Owner Router/Dan's AI
  Assistant.

Older KB-only and separate Owner Router repo plans are legacy unless this plan or a
product doc explicitly preserves a safety boundary.

## Current Audit Snapshot

- PMI KC KB has a working demo/runtime foundation: auth boundaries, editable API/UI
  paths, Approval Queue behavior, Admin observability, live retrieval boundaries, Gemini
  answer validation, Ask logging/capture, source-state handling, tests, demo scripts,
  and deployment helpers.
- The KB is not client-production complete. It still needs PMI KC-owned resources,
  approved production sources, auth/domain/role setup, source/data-store maps, Gmail
  notification decision, and final acceptance.
- Lease Renewal Agent is purchased but not specified. Existing Lease Renewals KB
  material is reference material, not a standalone product spec.
- Gmail Inbox 0 is the active client-facing name for the Owner Router/Dan's AI
  Assistant direction. The default v1 scope is owner-email-first and Gmail-native.
- The old sibling Owner Router artifact repo exists locally and may be mined for Gmail
  Inbox 0 source material, but active governance now lives in this monorepo.

## Cross-Product Phases

### P0 - Governance Realignment

Acceptance criteria:

- `AGENTS.md` routes to the three product lanes.
- `docs/north-star.md`, `docs/products/`, and cross-product checklists exist.
- Legacy separate-Owner-Router docs are moved or marked as superseded.
- `docs/status.md` records the realignment and next step.

Validation:

```bash
npm run format:check
git diff --check
```

### P1 - Discovery And Source Inventory

Acceptance criteria:

- Product owners and acceptance reviewers are named.
- Client answers the concrete asks in `docs/client-checklist.md`.
- `docs/research-backlog.md` is updated with answered, open, and blocked items.
- Each product lane distinguishes confirmed facts from assumptions.

Validation:

```bash
npm run format:check
```

### P2 - Access And Account Setup

Acceptance criteria:

- PMI KC-owned GCP/Firebase project and billing path are confirmed.
- Workspace domains, test users, and authorized domains are approved.
- Drive folder/source ownership is known.
- Gmail Inbox 0 setup authority and safe test approach are approved.
- No secrets or raw client data are committed.

Validation:

```bash
npm run host:check
npm run preflight:production -- --env-file=.env.production.local
```

### P3 - Integration Capability Verification

Acceptance criteria:

- KB production integrations are verified against client-owned or approved staging
  resources.
- Gmail Inbox 0 label/filter/Gem or prompt-pack capability is verified without touching
  live client mail unsafely.
- Lease Renewal Agent candidate integrations are classified as read-only, write-capable,
  unsupported, or blocked.
- Unverified capabilities remain in `docs/research-backlog.md`.

Validation:

```bash
npm test
npm run test:firestore
```

### P4 - Product V1 Scope Lock

Acceptance criteria:

- PMI KC KB production cutover scope is locked.
- Lease Renewal Agent has approved v1 inputs, outputs, trigger model, permissions,
  source requirements, and acceptance scenarios.
- Gmail Inbox 0 has approved label names, owner-email sender rules, human send model,
  source files, and live testing plan.

Validation:

```bash
npm run format:check
```

### P5 - Build And Migration Preparation

Acceptance criteria:

- KB production source manifests are prepared from approved PMI KC sources.
- Lease Renewal Agent implementation tickets and tests are created only after P4.
- Gmail Inbox 0 artifacts are migrated or renamed from Owner Router source material
  only after P4.
- Dry-runs exist for imports, setup scripts, seeders, and preflights.

Validation:

```bash
npm run corpus:plan -- --manifest=<approved-manifest> --project=<client-project-id> --location=us --dry-run
npm run seed:launch-skeletons -- --dry-run
```

### P6 - Testing, Training, And Acceptance

Acceptance criteria:

- KB production smoke covers auth, Ask, citations, no-source behavior, edits,
  approvals, and Admin visibility.
- Lease Renewal Agent acceptance scenarios pass once runtime exists.
- Gmail Inbox 0 test scenarios pass against approved safe threads or sanitized threads.
- Dan, Bailey, and named operators complete training and signoff tasks.

Validation:

```bash
npm run typecheck
npm test
bash scripts/verify.sh
```

### P7 - Production Cutover And Monitoring

Acceptance criteria:

- Go-live owner, support window, rollback owner, and monitoring owner are named.
- Production deploy/setup steps are executed from client-owned resources.
- Smoke tests pass after cutover.
- Exceptions and next iteration work are recorded in `docs/status.md`.

Validation:

```bash
npm run preflight:production -- --env-file=.env.production.local
bash scripts/verify.sh
```

## Product Lane Gates

### PMI KC KB

Current state: runtime exists; production cutover remains.

Key gates:

- Approved production sources and source-state metadata.
- Client-owned GCP/Firebase/Auth/Firestore/Agent Search setup.
- Production `APP_BASE_URL`, source maps, data-store maps, and role assignments.
- KB approval Gmail notification enabled only after sender/recipient approval, or
  explicitly disabled.

### Lease Renewal Agent

Current state: discovery required.

Key gates:

- Confirm trigger model, source systems, allowed actions, human review points, and
  acceptance scenarios.
- Confirm whether it is a web app feature, scheduled workflow, email assistant,
  internal queue, or another shape.
- No runtime work until scope is locked.

### Gmail Inbox 0

Current state: owner-email-first planning lane with reusable Owner Router artifacts.

Key gates:

- Confirm label names, owner sender rules, Drive source folder/files, Gem or prompt-pack
  path, and safe live testing approach.
- Preserve human send authority.
- No autonomous send, no unapproved Gmail read/modify runtime, and no system-of-record
  writes.

## Risks And Unknowns

- Client production resources and admin access are not yet available.
- Lease Renewal Agent could require integrations or permissions not yet known.
- Gmail Inbox 0 naming may require label migration from Owner Router language.
- Some historical demo/status/spec material still mentions Bailey Brain, Dan's AI
  Assistant, and Owner Router; those names must be read as demo/legacy context unless
  updated by product docs.
- Raw client source material must stay out of git.
- Google credentials on this host have recently required reauth for Google-backed demo
  paths.

## Recommended Development Sequence

1. Keep the KB demo and verification path green.
2. Complete P0 governance realignment and status update.
3. Use `docs/client-checklist.md` to collect client answers and access.
4. Update product lane docs as client answers arrive.
5. Complete KB production cutover readiness from `docs/client-production-cutover.md`.
6. Scope Lease Renewal Agent before any runtime implementation.
7. Rename/migrate Owner Router artifacts into Gmail Inbox 0 only after label/testing
   decisions are approved.
