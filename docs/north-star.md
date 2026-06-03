# PMI KC Three-Product North Star

## Current Direction

PMI KC has purchased three related products that should now be governed from this
repository as one coordinated workstream:

| Product             | Purpose                                                                                             | Current implementation posture                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| PMI KC KB           | Source-backed knowledge and handoff web app for operational Q&A, SOPs, placeholders, and approvals. | Existing Next.js/Firebase/Firestore/Vertex/Gemini runtime in this repo.                                                |
| Lease Renewal Agent | Dedicated agent track for lease renewal workflows and handoffs.                                     | Separate product lane; use the existing KB Lease Renewals workflow as reference only until requirements are confirmed. |
| Gmail Inbox 0       | Gmail-native owner-email triage and drafting workflow.                                              | Client-facing successor to Owner Router/Dan's AI Assistant; owner-email-first in v1.                                   |

The end state is a coordinated operating system for PMI KC Metro: source-backed answers,
repeatable renewal handoffs, and a visible owner-email queue that keeps humans in
control of approvals, sends, and system-of-record actions.

## Decision Rules

- Current product routing lives in `AGENTS.md`, this file, `docs/products/`, and
  `docs/plan.md`.
- Older "KB-only" and "separate Owner Router repo" language is legacy unless a product
  doc explicitly preserves it as a runtime safety boundary.
- Preserve original specs in `docs/specs/`; mark conflicts instead of silently merging
  them into the new direction.
- Distinguish confirmed facts from discovery questions. Do not invent endpoints,
  credentials, permissions, timelines, sender lists, data stores, or client workflows.
- Human/client work and AI/engineering work should proceed in parallel whenever
  possible.

## Non-Negotiable Safety Boundaries

- No secrets, tokens, customer data, raw screening records, ledgers, bank data, SSNs,
  full lease packets, or live Gmail thread contents in git.
- No autonomous send.
- No system-of-record writes to RentVine, LeadSimple, DotLoop, QuickBooks, Boom,
  operating Sheets, banks, ledgers, or client Drive folders unless a future approved
  spec explicitly adds that product capability with tests and rollback.
- Missing or weak sources produce visible uncertainty such as
  `Needs Verification: <fact>` or `No Reliable Source Found`, not generic property
  management answers.
- Drafts that may be sent externally must preserve the human-review boundary:
  `Draft — Review before sending`.

## Product Relationship

- PMI KC KB is the current web app runtime and remains the first lane to production
  hardening.
- Lease Renewal Agent is not automatically "done" because a Lease Renewals KB Space
  exists. The KB Space is useful source material and a demo reference, not a confirmed
  standalone agent spec.
- Gmail Inbox 0 supersedes the client-facing Owner Router/Dan's AI Assistant naming.
  Existing Owner Router artifacts are reusable source material, but the active product
  lane is Gmail Inbox 0.
- Cross-product integrations must be explicitly documented before implementation. Until
  then, product lanes share governance, vocabulary, and source discipline, not hidden
  runtime dependencies.

## Success Criteria

- A future AI session can identify the next task without rediscovering the repo.
- Client blockers are listed as concrete asks with an owner and a verification method.
- Engineering work after admin access is executable from checklists and runbooks.
- Legacy docs are marked or moved so stale direction cannot override the three-lane
  plan.
- Every production cutover gate includes source approval, permission review, smoke
  tests, rollback notes, and status updates.
