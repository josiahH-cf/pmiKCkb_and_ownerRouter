# Legacy: Owner Router Separate Repository Plan

> Superseded on 2026-06-03. The active client-facing product is now Gmail Inbox 0,
> governed from this monorepo through `docs/products/gmail-inbox-zero.md`.
>
> This document is preserved for historical setup details and source material only. Do
> not use it as the active routing model for new work.

Recommended repository name: `pmi-kc-owner-router`.

No standalone app belongs in that repository. The Owner Router is Gmail, Drive, Sheets,
Docs, a Gem or prompt pack, and optional scoped Apps Script. It must not share runtime,
deployment, database, service account, or CI pipeline with `pmi-kc-kb`.

## Sequencing

Start this repo after the KB live retrieval boundary is underway (KB M3a), and before
final KB acceptance. The KB cannot pass A-16 until the Router's canonical Drive folder
exists and the KB can index it read-only as the Owner Email Space.

This repo may be scaffolded before Bailey and Dan provide final owner-email content.
The implementer-owned artifacts are templates, prompts, setup instructions, scripts,
filters, and acceptance checklists. Bailey and Dan own substantive reply patterns,
voice examples, routing rules, and historical-thread dry runs.

## Naming

- Product: `Owner Router`
- Drive folder: `Owner Router - PMI KC Metro`
- Gem: `PMI KC Metro Owner Router`
- Required first label: `Owner Router / New`

## Repository Structure

```text
pmi-kc-owner-router/
├─ AGENTS.md
├─ docs/
│  ├─ spec.md
│  ├─ specs/
│  │  ├─ spec-2-technical-spec.md
│  │  ├─ spec-3-operating-north-star-spec.md
│  │  └─ spec-4-implementation-meta-implementation-spec.md
│  ├─ plan.md
│  ├─ implement.md
│  └─ status.md
├─ drive-package/
│  ├─ 01-reply-patterns-approved.md
│  ├─ 02-dan-voice-and-tone-examples.md
│  ├─ 03-routing-rules.csv
│  ├─ 04-source-links-and-sop-inventory.csv
│  ├─ 05-open-gaps-and-unsupported-cases.csv
│  └─ 06-admin-setup-and-operating-instructions.md
├─ gem-and-prompt-pack/
│  ├─ owner-router-gem-system-prompt.md
│  └─ owner-router-prompt-pack.md
├─ apps-script/
│  ├─ README.md
│  ├─ create-labels.gs
│  ├─ populate-sheet-headers.gs
│  └─ weekly-health-check-digest.gs
├─ gmail-filters/
│  └─ owner-sender-filter.xml
└─ tests/
   ├─ dry-run-historical-threads/
   └─ acceptance-tests-checklist.md
```

## Initial Files To Copy From This Repo

- `docs/specs/spec-2-technical-spec.md` to `docs/spec.md`.
- `docs/specs/spec-2-technical-spec.md` to `docs/specs/`.
- `docs/specs/spec-3-operating-north-star-spec.md` to `docs/specs/`.
- `docs/specs/spec-4-implementation-meta-implementation-spec.md` to `docs/specs/`.
- `docs/router-repo-template/README.md` as the seed README if useful.

## Required Labels

- `Owner Router / New`
- `Owner Router / Dan Decision`
- `Owner Router / Bailey Review`
- `Owner Router / Draft Ready`
- `Owner Router / Needs Verification`
- `Owner Router / Waiting on Owner`
- `Owner Router / Waiting on Team`
- `Owner Router / Route to LeadSimple`
- `Owner Router / Closed`

## Non-Negotiable Boundaries

- No standalone app.
- No autonomous send.
- No custom database.
- No KB API dependency.
- No writes to RentVine, LeadSimple, DotLoop, QuickBooks, operational Sheets, or the KB.
- No Chastity Router operator authority in v1.
- No labels beyond the nine listed above without Dan + Bailey approval.

## Creation Steps After The Repo Exists

1. Initialize the repo as a sibling of this repo:

   ```text
   C:\Users\josia\Documents\github-windows\pmi-kc-owner-router
   ```

2. Copy Spec 2, Spec 3, and Spec 4 into `docs/specs/`; copy Spec 2 to `docs/spec.md`.
3. Create the `drive-package/`, `gem-and-prompt-pack/`, `apps-script/`,
   `gmail-filters/`, and `tests/` folders.
4. Ask Codex to scaffold the Router package from `docs/spec.md` and the preserved
   specs, with no app runtime.
5. Verify the six canonical Drive file templates, nine labels, prompt pack, optional
   Apps Script scope, and 14 acceptance tests.

## Initial Scaffold Acceptance

- `AGENTS.md` routes future sessions to Spec 2, Spec 3, Spec 4, and repo-local
  status/plan docs.
- `README.md` says this is a Gmail/Drive-native configuration repo, not a web app.
- `drive-package/` contains templates for all six canonical files:
  - `01-reply-patterns-approved.md`
  - `02-dan-voice-and-tone-examples.md`
  - `03-routing-rules.csv`
  - `04-source-links-and-sop-inventory.csv`
  - `05-open-gaps-and-unsupported-cases.csv`
  - `06-admin-setup-and-operating-instructions.md`
- `gem-and-prompt-pack/` contains the Owner Router Gem system prompt and fallback
  prompt pack.
- `apps-script/` contains only optional setup/health scripts and a README explaining
  the no-send/no-thread-mutation limits.
- `gmail-filters/owner-sender-filter.xml` is a placeholder export template, not a
  committed client sender list.
- `tests/acceptance-tests-checklist.md` tracks the 14 Spec 2 acceptance tests.
- `tests/dry-run-historical-threads/` contains a template for the 10 historical-thread
  dry runs.

## KB Linkage Step

After the Router Drive folder exists:

1. Grant the KB service identity Viewer/read-only access to
   `Owner Router - PMI KC Metro`.
2. Configure the KB `owner-email` Space with that folder ID and a Vertex AI Search data
   store ID.
3. Verify an owner-email Ask response cites `01 Reply Patterns - Approved` or
   `03 Routing Rules`.
4. Re-run the KB Router boundary check:

   ```bash
   npm run verify:router-boundary
   ```

The Router still does not call the KB, share a database, or share a service account.
