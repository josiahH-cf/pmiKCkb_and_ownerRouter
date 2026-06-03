# Lease Renewal Agent Product Lane

## Current State

Lease Renewal Agent is a purchased product track, but it does not yet have a confirmed
runtime spec. The existing KB Lease Renewals Space, demo source templates, and Ask
scenarios are useful reference material only. They do not make the standalone Lease
Renewal Agent complete.

## Planning Default

Treat Lease Renewal Agent as a separate product lane in this monorepo. Do not build
runtime behavior until discovery answers are recorded and acceptance gates are approved.

## Known Facts

- PMI KC has purchased a Lease Renewal Agent.
- The repo already contains a Lease Renewals KB demo workflow.
- Renewal work must remain source-backed and must not invent legal, fee, timing,
  owner-approval, tenant-notice, or system-of-record facts.

## Discovery Needed

- What triggers the agent: manual request, calendar date, RentVine status, report,
  email, or other source?
- What output is expected: checklist, owner email draft, tenant notice draft, internal
  handoff, status summary, or task recommendation?
- Which systems may be read, and are any writes allowed?
- Who approves owner-facing and tenant-facing outputs?
- What sources define timing, fees, notice language, legal constraints, exceptions, and
  escalation?
- What does successful cutover look like for the renewal team?

## AI Can Do Now

- Extract reusable renewal concepts from existing KB demo docs into a discovery brief.
- Build a source inventory template for renewal documents.
- Draft acceptance-test scenarios without assuming system access.
- Track unanswered questions in `docs/research-backlog.md`.

## Do Not Build Yet

- No automated renewal sender.
- No RentVine, LeadSimple, DotLoop, QuickBooks, Boom, Sheets, or bank write path.
- No runtime trigger, queue, agent, or API integration until v1 scope is approved.
- No confident renewal policy output without approved PMI KC sources.
