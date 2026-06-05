# Owner Router Artifact Source

> Legacy source package for Gmail Inbox 0 only. Active product direction lives in
> `docs/products/gmail-inbox-zero.md`, `docs/north-star.md`, and `AGENTS.md`.

## Local Package

- Local path:
  `C:\Users\josia\Documents\github-windows\pmi-kc-owner-router`
- Current observed state on 2026-06-05: the path exists locally and contains an
  Owner Router package, but the sibling repo has no commits yet.
- Do not assume this local path exists on another machine. If it is needed for handoff,
  record where the package is committed, archived, or copied after that decision is
  made.

## When To Read It

Read this source package only when the active work is one of these:

- Gmail Inbox 0 artifact migration, naming, prompt, label, template, or test planning.
- Demo-safe Gmail Inbox 0 walkthroughs that still reference old Owner Router or
  Dan's AI Assistant materials.
- Historical comparison against the old separate Owner Router plan.

Do not read or import it for PMI KC KB or Lease Renewal Agent work unless an active doc
explicitly requests that historical context.

## Source Map

| Sibling repo area                 | Use as source material for                                     | Notes                                                                            |
| --------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `README.md`                       | Original package overview and non-negotiables.                 | Historical context; active Gmail Inbox 0 doc wins on conflicts.                  |
| `AGENTS.md`                       | Original boundary list for Gmail/Drive-only Owner Router work. | Do not treat as the active router for this monorepo.                             |
| `docs/spec.md` and `docs/specs/`  | Preserved Owner Router specs.                                  | Mine requirements only after mapping them to Gmail Inbox 0.                      |
| `docs/demo-runbook.md`            | Demo-safe Gmail segment flow.                                  | Rename or explain old Owner Router/Dan's AI Assistant labels.                    |
| `docs/positioning.md`             | Customer-facing wording candidates.                            | Use only after aligning with current product names.                              |
| `drive-package/`                  | Draft source/rule/template package ideas.                      | No raw client secrets or live Gmail content should be added to git.              |
| `gem-and-prompt-pack/`            | Prompt-pack source material.                                   | Preserve human send authority and missing-fact placeholders.                     |
| `gmail-filters/`                  | Gmail label/filter setup ideas.                                | Final labels and filters require Gmail Inbox 0 approval first.                   |
| `apps-script/`                    | Optional setup or health-check helper ideas.                   | Setup-only unless future active docs approve more.                               |
| `tests/`                          | Historical dry-run and acceptance scenario ideas.              | Use sanitized or safe-thread scenarios only.                                     |
| `scripts/verify-owner-router.ps1` | Legacy package validation.                                     | Useful for source-package checks; not a substitute for this repo's verification. |

## Safety Rules

- The active product lane is Gmail Inbox 0 in this monorepo.
- The sibling repo is source material, not active governance.
- Do not revive the separate Owner Router product direction.
- Do not add autonomous send.
- Do not read, label, draft, or modify live Gmail from this repo without explicit
  approved scope.
- Do not treat the old nine-label model as final unless `docs/products/gmail-inbox-zero.md`
  approves it.
- Do not commit secrets, raw Gmail content, customer records, or source packets.
- If the sibling repo conflicts with active docs, update the active docs or record a
  blocker; do not silently follow the legacy package.

## Fresh-Agent Behavior

When a user says "let's plan the next feature cycle" and Gmail Inbox 0 artifact work is
the selected lane, a fresh agent should:

1. Read `AGENTS.md` and `docs/autonomous-agent-runner.md`.
2. Read `docs/products/gmail-inbox-zero.md`.
3. Read this artifact-source map.
4. Inspect the local sibling package only for the specific artifacts needed by the
   cycle.
5. Promote durable decisions into active docs and keep scratch planning in `docs/temp/`.

If the local package is missing and the cycle depends on it, record the missing package
as a concrete blocker. If the cycle can continue without it, continue with active docs
and list the missing package as a follow-up.
