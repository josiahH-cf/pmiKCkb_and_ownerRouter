# PMI KC Three-Product North Star

## Current Direction

PMI KC has purchased three related products that should now be governed from this
repository as one coordinated workstream:

| Product             | Purpose                                                                                         | Current implementation posture                                                                                          |
| ------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| PMI KC KB           | Source-backed knowledge, approval, and workflow-control app for operational Q&A and automation. | Existing Next.js/Firebase/Firestore/Vertex/Gemini runtime in this repo; production lift comes before automation writes. |
| Lease Renewal Agent | Dedicated agent track for lease renewal workflows and handoffs.                                 | Separate product lane; use the existing KB Lease Renewals workflow as reference only until requirements are confirmed.  |
| Gmail Inbox 0       | Gmail-native triage, drafting, and learning workflow for Dan's email.                           | Client-facing successor to Owner Router/Dan's AI Assistant; starts with Dan's mailbox and minimal labels.               |

The end state is a coordinated operating system for PMI KC Metro: source-backed answers,
approved backend workflow automation, repeatable renewal handoffs, and a visible Gmail
queue that keeps humans in control of approvals, sends, and system-of-record actions.

The operator-facing shape (recalibrated 2026-06-30, owner-directed — `A-IA-V2`): the **Console is the
front door**, each **Space carries its process** (Processes is not a separate tab), and every Space has
real "teeth" — built for a non-technical, process-oriented operator (simple, elegant, workflow-first,
less reading). Detail: `docs/feature-suites/ui-ia.md` and the V1 process Q&A
(`docs/products/v1-process-qa.md`).

## Decision Rules

- Current product routing lives in `AGENTS.md`, this file, `docs/products/`, and
  `docs/plan.md`.
- Verified external-tool roles, event model, build order, and the Action Registry model
  live in `docs/integration-architecture.md`, backed by
  `docs/research/integration-capability-2026-06.md`. Tools are not interchangeable: each
  has a distinct role, and Google Sheets is not a primary source of truth.
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
  hardening. Its target end state includes AI-started workflow automation, but production
  launch should happen before external write paths are added.
- Rentvine is the operational system of record; LeadSimple is workflow orchestration;
  Dotloop is the document-package layer; QuickBooks is the accounting layer downstream;
  Boom is an auxiliary resident rent-reporting/screening service; Google Sheets is an
  exception/control surface. The KB owns the central workflow-run record and references
  external systems through backlinks and Action Registry action records.
- Maintenance Work Order Intake is the first executable-write integration target, because
  Rentvine work-order writes and the LeadSimple Rentvine maintenance sync are documented.
  It is built inside the KB automation surface before lease-renewal writeback.
- Lease Renewal Agent is the first backend automation product lane after KB production. The
  KB Lease Renewals Space is useful source material and a demo reference, not enough by
  itself to identify external systems or write permissions. Renewal preparation can proceed
  read-only, but the Rentvine lease-renewal writeback is undocumented in the public API and
  stays non-executable until vendor confirmation and an approved per-action spec.
- Gmail Inbox 0 supersedes the client-facing Owner Router/Dan's AI Assistant naming.
  Existing Owner Router artifacts are reusable source material, but the active product
  lane starts with Dan's whole mailbox, not owner-email-only.
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
