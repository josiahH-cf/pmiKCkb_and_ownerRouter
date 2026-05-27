# Owner Router Separate Repository Plan

Recommended repository name: `pmi-kc-owner-router`.

No standalone app belongs in that repository. The Owner Router is Gmail, Drive, Sheets,
Docs, a Gem or prompt pack, and optional scoped Apps Script. It must not share runtime,
deployment, database, service account, or CI pipeline with `pmi-kc-kb`.

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

1. Initialize the repo as `pmi-kc-owner-router`.
2. Copy Spec 2, Spec 3, and Spec 4 into `docs/specs/`; copy Spec 2 to `docs/spec.md`.
3. Create the `drive-package/`, `gem-and-prompt-pack/`, `apps-script/`,
   `gmail-filters/`, and `tests/` folders.
4. Ask Codex to scaffold the Router package from `docs/spec.md` and the preserved
   specs, with no app runtime.
5. Verify the six canonical Drive file templates, nine labels, prompt pack, optional
   Apps Script scope, and 14 acceptance tests.
