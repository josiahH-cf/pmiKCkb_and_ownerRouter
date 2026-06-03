# PMI KC KB Product Lane

## Current State

PMI KC KB is the existing source-backed web app runtime in this repository. It supports
Google sign-in boundaries, editable Spaces, SOP/template/tool/placeholder records,
Approval Queue behavior, Ask logging, source-state handling, citation validation,
Gemini answer validation, Admin observability, and demo/deploy scripts.

The current working demo is not production cutover. Production requires client-owned
Google resources, approved sources, and acceptance testing.

## Active Source Of Truth

- Product behavior: `docs/spec.md`, interpreted through `docs/north-star.md`.
- Milestones: `docs/plan.md`.
- Production runbook: `docs/client-production-cutover.md`.
- Google setup: `docs/google-setup.md` and `SETUP.md`.
- Current state: `docs/status.md`.

## What Can Proceed Now

- Keep verification green.
- Prepare source manifests and production preflight inputs.
- Improve docs, tests, and demo safety.
- Add production-hardening code only when it maps to the KB spec and current milestone.

## Current Blockers

- PMI KC-owned GCP/Firebase project access and billing.
- Production Firebase Auth authorized domains and role assignments.
- Approved production source folders/files by Space.
- Source sensitivity review and `sources_meta` decisions.
- Agent Search data-store IDs and source/data-store maps.
- Gmail send-only approval notification sender/recipient decision.
- Final smoke users and acceptance reviewers.

## Acceptance Gates

- `npm run preflight:production` passes against client-owned settings.
- Sign-in works for allowed-domain users and rejects wrong-domain users.
- At least one approved production Space returns cited answers from approved sources.
- Unsupported questions return `No Reliable Source Found`.
- Editors cannot approve; Approvers/Admins can approve/return/resolve.
- No writes occur to external systems or client Drive folders outside explicitly allowed
  production setup.
