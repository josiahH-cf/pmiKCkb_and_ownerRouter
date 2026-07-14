---
spec_id: spec-1
product: PMI KC KB
version: v1
status: implementation-ready
companion_spec: spec-2-technical-spec.md (Owner Router)
operating_north_star: spec-3-operating-north-star-spec.md
implementation_meta: spec-4-implementation-meta-implementation-spec.md
---

# Spec 1 — PMI KC KB (Technical Specification)

> Current governance note, 2026-06-03: this document remains the KB runtime technical
> spec. The broader repository is no longer KB-only; it now governs PMI KC KB, Lease
> Renewal Agent, and Gmail Inbox 0 through `docs/north-star.md` and `docs/products/`.
> Statements below that describe a separate Owner Router repository are legacy repo
> topology. The safety boundaries still apply unless an active product doc changes them.
> Current product-facing decisions in `docs/products/pmi-kc-kb.md` supersede older role,
> approver, account, and notification examples below.

This document is the authoritative source of truth for building and deploying **PMI KC KB**, the standalone internal knowledge and handoff web application for PMI KC Metro. It is one of four aligned specifications in this project. It defines the KB product end-to-end at a level an outside implementer can scaffold, build, test, and ship from without further interpretation.

The KB is a **separate implementation** from the **Owner Router** (Spec 2). The two products share users, anti-hallucination vocabulary, and review discipline, but they do not share runtime, do not share send authority, and do not merge. Cross-product behavior is governed by Spec 3 (north star) and Spec 4 (implementation meta).

---

## 1. Purpose

Capture PMI KC Metro's operational knowledge into an internal, source-backed, editable Q&A application so the team — Chastity, Estelle, Shane, Leia, Dan, and Bailey — can:

- Find process answers without interrupting Bailey.
- Generate response drafts grounded only in approved sources.
- Locate the right tool, sheet, template, or Fathom recording behind any documented process.
- Visibly track where documentation is missing or weak.
- Move approved knowledge through a simple review/approval queue.

**End-state behavior at launch.** On launch day, signed-in users at `kb.bluespringspropertymanagementinc.com` can:

1. Sign in with their company Google account (`pmikcmetro.com`).
2. Ask any operational question and receive either a cited, source-backed answer with handling steps and an editable draft, **or** a clearly labeled "No Reliable Source Found" response with a one-click capture task for Bailey or Dan.
3. Find the SOP, tool, spreadsheet, template, or Fathom recording behind any P0 process by browsing the relevant **Space** or searching.
4. Drop a document into a Space's Drive folder and have it become searchable within minutes, with no developer involvement.
5. See every open placeholder Bailey, Dan, or another owner still needs to fill, prioritized and dated.
6. See every SOP awaiting approval in the **Approval Queue**, visible to all, actionable by Approvers (Dan, Bailey, Chastity).

**Non-negotiable product principle.** The KB **never** auto-sends, **never** auto-writes to a system of record, and **never** invents a process when one is not documented. When source coverage is weak, it produces a **visible placeholder** with a named owner, not a generic property-management answer.

---

## 2. Scope

### 2.1 In scope (v1)

| Capability | Requirement |
|---|---|
| Source-backed internal Q&A | Answers grounded in approved sources, with citations and a visible source state. |
| Editable SOP pages | Editors update content inline; every save creates a change-log entry. |
| One Drive folder per Space | Source files live in Drive; Vertex AI Search indexes them automatically. |
| Templates and tool directory | Per-Space templates and a tool list with real links. |
| Placeholders and gap tracking | Missing knowledge is recorded as a first-class entity with owner, priority, and due date. |
| Approval Queue | Workflow-control list of approval packages, process changes, blockers, and related review items; Admins see all, while non-Admins see assigned/relevant items. |
| Copyable drafts | Generated drafts can be copied; the KB never sends. |
| Internal approval notifications | Gmail send-only notifications to Approvers with the `KB Approval` label. |
| Owner Email Space (read-only) | Indexes the Owner Router's restricted Drive folder read-only so KB users can cite owner-email reply patterns and routing rules without leaving the KB. |
| Eval set and anti-hallucination regression | ≥ 50 question/expected-state pairs run in CI. |
| Audit, backup, and observability | Daily Firestore export, change log, Cloud Logging, Admin dashboard with usage indicators. |

### 2.2 Out of scope (v1)

| Excluded | Reason |
|---|---|
| Direct writes to RentVine, LeadSimple, DotLoop, QuickBooks, Boom, Google Chat, or operational Sheets | No write-back to systems of record in v1. |
| Gmail draft creation from the KB | Drafts are copy-to-clipboard only; the KB does not call Gmail compose. |
| Direct Gmail content ingestion | If an email thread should become a KB source, it is exported to Drive as a file. |
| Owner-email triage as a KB feature | Live owner email lives in the Owner Router (Spec 2). |
| Write-back to the Owner Router's Drive folder | The Owner Email Space is read-only. |
| Ingestion of high-sensitivity records | Raw screening reports, bank statements, NACHA files, full lease packets, complete tenant ledgers, Plaid raw output, credit reports, SSNs are excluded. |
| External-facing surfaces | Tenants, owners, vendors, applicants never see this product. |
| Approve-by-email in v1 | A V1.5 hook is reserved (§17); the v1 system sends one-way notifications only. |
| Multi-tenant operation | The KB is single-tenant: one Workspace domain. |

### 2.3 Non-goals (restated for the implementer)

The KB is internal operational memory and handoff, **not** autonomous operations. It retrieves, summarizes, cites, drafts, organizes, and flags gaps. It does not decide, send, overwrite records, approve tenants, assign vendors, or alter ledgers.

---

## 3. Relationship to the Owner Router (Spec 2)

The KB and the Owner Router are aligned but separate. Spec 3 (north star) governs the business boundary; this section restates what an implementer must respect.

| Concern | PMI KC KB (this spec) | Owner Router (Spec 2) |
|---|---|---|
| Surface | Standalone web app at `kb.bluespringspropertymanagementinc.com` | Gmail web + mobile + restricted Drive package |
| Primary job | Find / capture / edit / approve process knowledge; generate drafts for any internal audience | Triage owner email; draft owner replies; route to LeadSimple/RentVine/Sheet manually |
| Knowledge layer | Firestore + indexed Drive folders (one per Space) | Six canonical files in `Owner Router - PMI KC Metro` Drive folder |
| Roles | Editor, Approver, Admin | Operating roles: Dan (Approver), Bailey (operator), Chastity (view-only on Drive in v1); no general team access |
| Approval surface | In-app Approval Queue + Gmail `KB Approval` notifications | Gmail labels (`Owner Router / Dan Decision`, `Owner Router / Draft Ready`, etc.) |
| Outbound behavior | Copy-to-clipboard drafts only | Human-edited, manually sent owner email only |
| Shared vocabulary | Source states (Verified / Partial / Placeholder / Conflict / No Source); `Needs Verification: <fact>` placeholder wording; `Draft — Review before sending` banner | Same |

### 3.1 Cross-product interoperation in v1

- **KB indexes the Owner Router's Drive folder read-only.** The KB exposes an "Owner Email" Space whose Vertex AI Search data store is bound to `Owner Router - PMI KC Metro`. KB users (Editors and above) can ask the KB "what's the owner renewal email template" and receive the Router's `01 Reply Patterns - Approved` doc as a citation.
- **The Owner Router's six canonical files remain canonical and editable only inside that folder.** The KB never writes to them. This is enforced by IAM (read-only Drive scope on that folder for the KB service identity), not just by convention.
- **The Owner Router does not depend on the KB.** If the KB is down, the Owner Router keeps working from Gmail + the Drive folder + the Gem/prompt pack.
- **Anti-hallucination rules are identical** in vocabulary and outcome. A KB Placeholder is the analogue of a Router Open Gap entry; both surface unresolved facts as visible, owned work.
- **Operator authority does not transfer between products.** A KB Editor role does not grant Owner Router labels, send authority, or Router Drive access. Authority changes in either product require explicit Dan + Bailey approval, recorded in the affected spec.

### 3.2 V1.5 hook (specified now, not built in v1)

When an item enters the KB Approval Queue, the assigned actor/required approver receives in-app attention through Console/Notifications. The legacy event-driven Gmail sender is hard-disabled. A future human-confirmed notification-draft lane requires a new approved spec; no automatic email or approve-by-email path is reserved as V1 authority. See §17 D-10.

---

## 4. Confirmed Context

These facts inform the build and are treated as fixed.

- PMI KC Metro is a ~160-door PMI franchise based in Blue Springs, MO. Owner: Dan Hilgedick (`dan@pmikcmetro.com`).
- Public brand site: `bluespringspropertymanagementinc.com` (visual identity reference).
- Google Workspace domain for auth and integrations: `pmikcmetro.com`.
- Team (KB users): Dan, Bailey, Chastity (in-office); Leia, Shane, Estelle (offshore, Philippines).
- Operational knowledge lives across Bailey's memory, Fathom recordings, Google Sheets, Gmail, RentVine, LeadSimple, DotLoop, Boom/Boompay, QuickBooks-adjacent flows, Google Chat, and ad-hoc templates.
- Google Sheets is the team's de facto operational source of truth.
- RentVine, DotLoop, Boom, Plaid contain sensitive PII and financial data — **not ingested in v1**.
- The Owner Router (Spec 2) is being built in tandem and shares Dan, Bailey, and the Owner Router Drive folder.

---

## 5. V1 Decisive Defaults

These decisions remove blocking ambiguity. Each is a low-risk, deployable choice; reversibility is captured in §17 where the answer is reversible.

| Decision | V1 Default | Why |
|---|---|---|
| Hosting platform | Next.js (App Router) on **Cloud Run** with custom domain mapping. | Single-command deploy from a git push; Google-native; one less vendor than Vercel. |
| Database (editable layer) | **Firestore** (Native mode). | Zero schema setup, real-time updates, Google IAM integration, generous free tier. |
| Retrieval (search & grounding) | **Vertex AI Search** with one **Data Store** per Process Space, plus one general data store for cross-Space content. Backed by Google Drive folders. | Indexing is automatic; drop a file in Drive, it's searchable in minutes. No custom chunking, embedding pipeline, or nightly indexing job to operate. |
| LLM | **Vertex AI Gemini.** `gemini-2.5-pro` for grounded answers and draft generation. `gemini-2.5-flash` for cheap classification (audience inference, source-state hinting). | Native Vertex AI Search grounding (citations come back as part of the API response). Same provider, same auth. |
| Authentication | **Firebase Authentication / Identity Platform** with Google provider, hosted-domain (`hd`) restriction enforced server-side after callback. | Native Google IAM; no separate password store; managed sessions. |
| File storage for uploads (Fathom transcripts, exports) | **Google Drive folders** (per Space). The KB does not run its own object store. | "Drop a file in the Space's folder and it indexes itself" is the user mental model. |
| Production domain | `kb.bluespringspropertymanagementinc.com` | Matches the brand the team recognizes. Auth allowed-domain is still `pmikcmetro.com`. |
| Allowed sign-in domain | `pmikcmetro.com` (production). Configurable via `ALLOWED_HD` env var to test on the consultant's enterprise first, then swap. | Single environment variable change at cutover. |
| Drafts | Copy-to-clipboard. No Gmail-draft creation in v1. | Eliminates a write scope and matches Owner Router pattern. |
| Other tool integrations (RentVine, LeadSimple, DotLoop, Boom, QuickBooks, Google Chat, PadSplit, Z-inspection) | Hyperlinks only in the Tool Directory. No API calls. | API availability unverified; data is sensitive; outside v1 scope. |
| Email notifications to Approvers | Sent via Gmail API from a workspace-scoped service identity. Notifications include a `KB Approval` Gmail label. | One-way notifications only in v1; approve-by-reply is V1.5 (D-10). |
| PII / sensitive data policy | Do not ingest raw screening reports, bank data, NACHA files, full tenant ledgers, or full lease documents. Index only SOP-relevant metadata, links, and approved excerpts. | Removes the largest privacy/compliance risk. |
| Brand palette | PMI navy primary + warm gold accent + neutral grays/white. Exact hex values confirmed during setup per §B. | Matches `bluespringspropertymanagementinc.com`. |
| Approver assignment | Dan, Bailey, **and Chastity** are Approvers. Editors: Estelle, Shane, Leia. | Three Approvers ensures continuity through any one person's absence. See §11.1. |

---

## 6. Core Product Principle

The KB is **internal operational memory and handoff**, not autonomous operations. It retrieves, summarizes, cites, drafts, organizes, and flags gaps. It does not decide, send, overwrite records, approve tenants, assign vendors, or alter ledgers.

When source coverage is weak, the assistant produces a **visible placeholder**, not a generic property-management answer. This anti-hallucination contract is shared verbatim with the Owner Router so the team learns one vocabulary, not two.

---

## 7. Information Architecture (4 areas)

The whole product reduces to four areas. There are no other top-level surfaces in v1.

### 7.1 Spaces

A **Space** is a process. Each Space is the home for one operational topic. Each Space contains:

- A **canonical SOP page** (structured per §13.7, editable inline).
- A **Drive folder** (per Space) — drop any document in, it gets indexed automatically.
- A **template list** scoped to that process (audience × channel × use case).
- A **tool list** (links to RentVine, LeadSimple, etc., as relevant).
- An **open-placeholder list** for missing details.
- A **change log** (auto-rendered from `change_log` collection).

**Adding knowledge to a Space is "drop a file in its Drive folder" or "edit the SOP page in the app."** Nothing else is required for content to become searchable.

### 7.2 Ask

One search/Q&A surface. Type a question; optionally tag audience and channel. Gemini retrieves from the relevant Spaces' Vertex AI Search data stores, generates a grounded answer with citations, and (if applicable) drafts a response. See §10.1 for the flow.

### 7.3 Approval Queue

A single list, visible to all signed-in users, actionable only by Approvers (Dan, Bailey, Chastity).

What goes here:
- SOPs marked "In Review" (created or edited by an Editor, awaiting Approver signoff).
- Placeholders that have been filled and need final approval.
- Newly added templates awaiting approval.

What does **not** go here:
- Owner email triage state — that lives in Gmail labels via the Owner Router.
- Read access decisions — everyone signed in can read everything in v1.

### 7.4 Admin

Visible only to Admins (the builder/consultant; Dan if Dan is granted Admin). Contains:

- Integration setup (Drive folders per Space, OAuth status).
- User management (assign Editor / Approver / Admin roles).
- Tenant/domain configuration (the `ALLOWED_HD` toggle).
- Indexing status (last index time per data store, error states).
- Cost/usage indicators (Vertex AI Search query volume, Gemini token spend).

A regular Editor or Approver never sees this area.

---

## 8. Brand Tokens

The app's visual identity matches `bluespringspropertymanagementinc.com`. Encoded as CSS variables in `tokens.css`.

### 8.1 V1 default palette (verify at setup per §B)

```css
:root {
  /* Primary — PMI navy */
  --color-primary-900: #0E2A4A;   /* darkest navy, headers, buttons */
  --color-primary-700: #1B3A5C;   /* default primary */
  --color-primary-500: #2C5282;   /* hover, accents */
  --color-primary-100: #E6EEF7;   /* tinted backgrounds */

  /* Accent — PMI gold (guarantee badges) */
  --color-accent-700:  #A47B2A;
  --color-accent-500:  #C49B3E;
  --color-accent-100:  #F6EBD0;

  /* Source-state semantic colors */
  --state-verified:    #2F855A;   /* green */
  --state-partial:     #C49B3E;   /* gold (matches accent) */
  --state-placeholder: #2C5282;   /* primary */
  --state-conflict:    #B7791F;   /* amber */
  --state-no-source:   #9B2C2C;   /* deep red */

  /* Neutrals */
  --color-bg:          #FFFFFF;
  --color-surface:     #F7FAFC;
  --color-border:      #E2E8F0;
  --color-text:        #1A202C;
  --color-text-muted:  #4A5568;

  /* Typography */
  --font-sans: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-heading: var(--font-sans);
}
```

### 8.2 Verification step (during setup)

The implementer opens `bluespringspropertymanagementinc.com` in DevTools, inspects the header background and the "FREE RENTAL ANALYSIS" button, copies the actual hex values from computed styles, and replaces the placeholder values in `tokens.css`. The runbook walks through this in 5 minutes. Until verified, the default palette above ships.

### 8.3 UI principles

- **Clarity over density.** One primary action per screen.
- **Source state visible in the same eye-line as every answer.** Color-coded strip.
- **Edit feels like editing a document, not a database.** Inline editing, autosave (debounced 1.5s).
- **No silent failures.** Empty, loading, error states are always explicit.
- **Accessible by default.** WCAG 2.1 AA contrast; keyboard navigation; visible focus.
- **Responsive.** Laptop (1366×768) and tablet landscape are primary. Phone is supported.

---

## 9. Source-Backing and Anti-Hallucination Policy

These rules are **shared verbatim** with the Owner Router. Same labels, same vocabulary, same enforcement.

### 9.1 Source states

| State | Trigger | Assistant behavior |
|---|---|---|
| **Verified Source** | An Approved SOP, Approved template, or two or more concurring Approved sources cover the answer. | Answer fully; cite each source; produce a draft if applicable. |
| **Partial Source** | Source evidence exists but is incomplete. | Answer only what is supported; list missing pieces; offer to create a placeholder. |
| **Open Placeholder** | A relevant SOP exists with an open placeholder covering the asked question. | Refuse to answer the gap; surface the placeholder; offer one-click capture task. |
| **Conflict Found** | Two or more retrieved sources disagree on a material fact. | Show both, cite both, do not pick a winner; route to the appropriate Approver. |
| **No Reliable Source Found** | No usable source returned by retrieval. | Decline to answer; offer one-click capture task; suggest escalation owner. |

### 9.2 Unresolved-fact wording (cross-product convention)

Where a draft would otherwise include a fact that has not been verified from an approved source, the KB inserts the exact placeholder string `Needs Verification: <fact>` — identical to the Owner Router's wording. The same convention drives Placeholder creation when the user accepts the capture-task action.

### 9.3 Non-negotiable rules

- Never produce a generic property-management answer in place of a missing PMI KC Metro process.
- Never infer legal deadlines, fees, approval rights, screening rules, vendor rules, or financial procedures unless they appear in Approved sources.
- Never present raw Fathom transcript content as final SOP wording; transcript-derived answers are labeled and surfaced for review.
- Never invent links, sheet names, template names, owners, tool settings, or integration capabilities.
- Never smooth over uncertainty; mark it visibly.
- When in doubt, create a placeholder.

### 9.4 Enforcement in code (not just prompts)

Vertex AI Search's grounding API returns citation metadata identifying which indexed documents supported the answer. Server-side enforcement is:

1. If grounding returns zero supporting documents above the confidence threshold, the server returns `source_state = "No Reliable Source Found"` **without** calling the answer model.
2. The Gemini prompt is constructed to require JSON output matching a strict schema (`answer`, `handling_steps`, `source_state`, `citations`, `escalation_owner`, `draft`).
3. JSON parsing failures retry once, then fall back to `No Reliable Source Found`.
4. Citation IDs in the LLM output are validated against the grounding metadata. Citations not present in the grounding response are stripped before display. An answer reduced to zero valid citations is downgraded to `No Reliable Source Found`.
5. Every output draft carries the verbatim banner `Draft — Review before sending`. The banner is not configurable.

---

## 10. Core User Flows

### 10.1 Ask flow

1. User opens **Ask**, types or pastes a question.
2. User optionally sets Audience (Tenant/Owner/Applicant/Vendor/Internal/Unknown), Channel (RentVine/Gmail/LeadSimple/Internal Note/Phone Script/Other), Urgency. Defaults are sensible.
3. User clicks **Get Answer**.
4. Server calls Vertex AI Search across the relevant data stores (filterable by Space).
5. If grounding confidence is below threshold → return `No Reliable Source Found`.
6. Otherwise pass grounded results to Gemini with the strict-JSON system prompt.
7. Server validates output, strips bad citations, persists the interaction (`ask_logs`).
8. UI shows: color-coded source-state banner; direct answer; handling steps; cited sources (each linking to the Drive doc, SOP page, transcript, or template); draft (if applicable, with `Draft — Review before sending` banner and Copy button); escalation note if applicable; and a "Send capture task to [owner]" button if state is Placeholder or No Source.

### 10.2 Find-in-Space flow

1. User opens **Spaces** from nav, picks a Space (e.g., "Lease Renewals").
2. Space landing page shows: SOP summary, recent docs in the Drive folder, template list, tool list, open placeholders, change log.
3. User clicks the Drive folder link → opens in Drive directly to drop files.
4. User clicks the SOP title → enters inline-edit view (Editors and above).

### 10.3 Capture flow

Capture happens in two ways:

- **Quick capture from Ask:** When the result is `No Reliable Source Found` or `Open Placeholder`, the "Send capture task to [owner]" button opens a one-screen form pre-filled with the original question. The owner fills the short answer, links to relevant Drive docs/sheets/Fathom recordings, picks the Space, and saves. The system creates or updates the SOP in that Space.
- **Direct Space edit:** A user with Editor or higher role opens a Space, clicks the SOP, edits inline. Autosaves every 1.5s.

The target capture budget is "under 5 minutes per item."

### 10.4 Placeholder resolution flow

1. Approver opens **Approval Queue** → "Placeholders" tab.
2. Sees placeholders sorted by priority (P0/P1/P2) then due date.
3. Opens one, fills the missing fields, sets status to Resolved, saves.
4. The SOP that referenced it is updated automatically. Change-log entry written.

### 10.5 Approval Queue flow

1. Editor saves an SOP / template / source / process change inside their Space and configured root.
2. S21 validates root/scope/type/size/malware/sensitivity and structure. A passing save creates an
   immutable version, atomically becomes Active, writes audit, and creates no routine approval item.
3. Validation failure/Blocked state, an approval package, external-action readiness, automation failure,
   or source/fact conflict creates an Approval Queue item for the permitted assignee/approver.
4. The actor reviews source/diff/preview and uses the server-derived S20 action. Editor executes enabled
   Low/Medium; consequential High requires Admin, who may self-approve; technical Blocked stays closed.
5. State changes write append-only Activity and in-app attention. No event-driven Gmail notification is sent.

### 10.6 Admin / Setup flow

This is the implementer's flow, not the team's. See `SETUP.md` and §B for the full runbook. In brief:

1. Implementer signs in as Admin in their test enterprise.
2. Creates each Process Space (one form: name, description, Drive folder ID).
3. The KB auto-connects the Drive folder to a Vertex AI Search data store.
4. Drops seed docs into each folder (or just lets Bailey do it).
5. Adds users with email + role.
6. Switches `ALLOWED_HD` to `pmikcmetro.com` at production cutover.

### 10.7 First sign-in (orientation)

1. User opens `kb.bluespringspropertymanagementinc.com`, signs in with Google.
2. Server enforces the allowed domain.
3. Lands on a one-screen orientation: "What this is, how to ask, how to trust answers, how to escalate." Three example questions are shown.
4. Dismissible; reachable from the user menu anytime.

---

## 11. Functional Requirements

Each requirement has an ID. Each is testable; acceptance is in §15.

### 11.1 Authentication and authorization

- **F-1.** Google sign-in via Firebase Auth / Identity Platform, restricted to the domain in `ALLOWED_HD` (default `pmikcmetro.com`; configurable for test enterprise). Domain check enforced server-side after callback.
- **F-2.** Three roles: **Editor**, **Approver**, **Admin**.
- **F-3.** Default role for a new user is **Editor**.
- **F-4.** Permissions:

| Capability | Editor | Approver | Admin |
|---|:--:|:--:|:--:|
| Sign in, ask questions, view all content | ✅ | ✅ | ✅ |
| Create / edit SOPs, templates, placeholders | ✅ | ✅ | ✅ |
| Mark items Approved or Reject | ❌ | ✅ | ✅ |
| Resolve placeholders | ❌ | ✅ | ✅ |
| Manage users, integrations, indexing, `ALLOWED_HD` | ❌ | ❌ | ✅ |
| Soft-delete SOPs or sources | ❌ | ❌ | ✅ |

**Initial assignments:**
- **Approvers:** Dan, Bailey, Chastity.
- **Editors:** Estelle, Shane, Leia.
- **Admin:** Implementer (acting as builder; same person in both products per Spec 4).

### 11.2 Retrieval and answer generation

- **F-5.** Retrieval uses Vertex AI Search with grounding. One data store per Space, plus one general data store. Search may be scoped to one Space or run across all.
- **F-6.** Retrieval excludes sources marked `Deprecated` (per the Firestore source metadata).
- **F-7.** Answer generation uses `gemini-2.5-pro` with the prompt rules in §9.4. The output schema is validated server-side.
- **F-8.** Citations must reference real grounding source IDs. Invalid citations are stripped server-side.
- **F-9.** If grounding returns zero supporting documents above the threshold, the system returns `No Reliable Source Found` without calling the answer model.
- **F-10.** Every Ask interaction is persisted in Firestore (`ask_logs`): question, audience, channel, urgency, grounding source IDs, answer, source state, citations, draft, user feedback.

### 11.3 Spaces, SOPs, templates, tools

- **F-11.** Each Space has: one SOP page, one Drive folder, a template collection, a tool list, a placeholder list, a change log.
- **F-12.** SOPs follow the structured template in §13.7. Required fields cannot be empty for `Approved` status.
- **F-13.** Inline edit with autosave (debounced 1.5s). Each save creates a change-log entry.
- **F-14.** Status transitions: `Placeholder → Draft → In Review → Approved → Deprecated`. Approver-only into `Approved`.
- **F-15.** Soft delete only.

### 11.4 Sources via Drive

- **F-16.** Each Space is bound to one Drive folder. New files in the folder are indexed by Vertex AI Search automatically (per Vertex AI Search data store sync policy).
- **F-17.** Admin can trigger a manual re-index from the Admin / Spaces screen.
- **F-18.** Source metadata (approval status, sensitivity, last reviewed) is stored in Firestore, keyed by the Drive file ID, and shown alongside the source in answers.
- **F-19.** Sources marked `sensitivity = High` are excluded from retrieval. The exclusion list is enforced at query time as a Vertex AI Search filter.

### 11.5 Owner Router Drive folder integration

- **F-20.** The KB indexes the Owner Router's Drive folder (`Owner Router - PMI KC Metro`) **read-only** as the "Owner Email" Space.
- **F-21.** The KB never writes to that folder. Edits to the six Owner Router files happen in Drive only.
- **F-22.** Vertex AI Search picks up changes to those files automatically.
- **F-22a.** The KB service identity has `drive.readonly` scope on the Owner Router folder; it has **no** write scope on that folder. Enforced in IAM, not just by convention.
- **F-22b.** The "Owner Email" Space's SOP page in the KB is a thin pointer to the Router's `01 Reply Patterns - Approved` doc and is itself read-only inside the KB (no inline edit).

### 11.6 Placeholders

- **F-23.** A placeholder can be created from Ask, from a Space page, or from the Approval Queue.
- **F-24.** Each placeholder has owner, priority (P0/P1/P2), and optional due date.
- **F-25.** Placeholders sort by priority then due date in the Approval Queue.

### 11.7 Approval Queue

- **F-26.** Server-created `approval_queue_items` appear for approval packages, validation-failed or blocked process-definition changes, failed/blocked automation, external-action readiness, and source/fact conflicts. Under S21, validation-passing Editor content/process changes publish immediately with immutable version/rollback/audit rather than creating an approval item. SOP/template/placeholder review appears only when a queue producer creates a corresponding queue item.
- **F-27.** Admins can view all queue items. Non-Admins can view only queue items where they are the assignee or required approver.
- **F-28.** Queue transitions use server-side actions and append `approval_queue_activity` entries with actor, timestamp, previous/new state, source trigger, and required reasons.
- **F-29.** Queue notification behavior follows the active Approval Queue plan: V1 delivery is in-app through Console/Notifications. The legacy event-driven Gmail sender is hard-disabled; unresolved important `Blocked` or overdue items escalate in-app. Any future email lane is separately approved and human-confirmed.

### 11.8 Integrations (v1)

- **F-30.** Google Workspace OAuth uses minimum required scopes: `openid`, `email`, `profile`, plus `drive.readonly` (scoped to KB-managed Space folders and the Owner Router folder), `gmail.send` (for outgoing approval-queue notifications only — no `gmail.modify`, no `gmail.compose`).
- **F-31.** Gmail label ingestion is **not** in v1. The KB does not read Gmail content. (If Gmail content needs to be indexed, the user exports it to a Drive folder as a file.)
- **F-32.** Indexing health is shown in Admin: last sync time per Space, error states, doc counts.

### 11.9 Analytics

- **F-33.** Admin dashboard shows: 7- and 30-day Ask counts, top processes asked, open-placeholder count by owner, Approval Queue depth by item type, indexing health by Space. No external analytics provider.

---

## 12. System Architecture

### 12.1 Components (Google-native)

1. **Web app:** Next.js 14+ (App Router), React, deployed on **Cloud Run**.
2. **Database (editable layer):** **Firestore** in Native mode for SOPs, templates, tools, placeholders, ask logs, change log, users, sources metadata.
3. **Retrieval:** **Vertex AI Search** with one Data Store per Space, backed by Drive folders. Grounding API used at query time.
4. **LLMs:** **Vertex AI Gemini.** `gemini-2.5-pro` for grounded answers and drafts. `gemini-2.5-flash` for audience/channel inference and source-state hinting.
5. **Auth:** **Firebase Authentication / Identity Platform**, Google provider, hosted-domain restriction.
6. **Email:** **Gmail API** with a workspace-scoped service identity, used **send-only** for Approval Queue notifications.
7. **Domain mapping:** Cloud Run custom domain for `kb.bluespringspropertymanagementinc.com`. Managed SSL.
8. **Monitoring:** Google Cloud Logging + Cloud Monitoring + Error Reporting. No third-party error monitoring in v1.

### 12.2 Why this stack is intentionally simple to set up

- No vector database to operate. Vertex AI Search owns indexing, chunking, embeddings, and retrieval.
- No object storage to manage. Drive folders hold source files.
- No third-party providers. Single Google Cloud project = entire stack.
- Schema-less editable layer. Firestore documents validate at the application boundary, not at the DB.
- One auth provider, one billing surface, one IAM model.
- The setup runbook in §B targets 4–6 hours by an implementer who has used GCP before.

### 12.3 Data flow for an Ask interaction

1. Client posts `/api/ask` with `{ question, audience, channel, urgency, draft_enabled, space?: string }`.
2. Server logs the interaction (status: pending) to Firestore.
3. Server calls Vertex AI Search Conversational Search or Search API with grounding enabled, filtered to the chosen Space's data store (or all data stores).
4. If grounding returns zero results above threshold → write `source_state = "No Reliable Source Found"`, return.
5. Otherwise, pass grounded results to Gemini 2.5 Pro with the strict-JSON system prompt and the user's audience/channel/urgency.
6. Server validates JSON, strips invalid citations against the grounding metadata, persists final response and `source_state`.
7. If `source_state ∈ {Partial, Conflict, No Source}`, also write to the Review Queue collection.
8. Return result.

### 12.4 No-write boundary (enforced in IAM)

The application has **no code paths** that write to RentVine, LeadSimple, DotLoop, QuickBooks, Boom, Google Chat, the Owner Router Drive folder, or any active operational Google Sheet. The Cloud Run service identity has:

- `drive.readonly` scope (KB-managed Space folders + the Owner Router folder; no `drive.file`, no `drive`).
- `gmail.send` scope (no `gmail.modify`, no `gmail.compose`, no `gmail.readonly`).
- Firestore IAM access for the KB project only.

This is enforced by IAM, not just by convention.

---

## 13. Data Model

Firestore collections. Document IDs are UUID v7 unless noted. Timestamps are server-generated.

### 13.1 `spaces`

| Field | Type | Notes |
|---|---|---|
| id | string PK | |
| name | string | "Lease Renewals", "Move-Out", etc. |
| process_category | string | enum: Renewals, Move-In, Move-Out, Maintenance, Screening, Bookkeeping, Onboarding, Inbox, PadSplit, Training, Escalation, Owner Email. |
| drive_folder_id | string | Google Drive folder ID. |
| vertex_data_store_id | string | Vertex AI Search data store name. |
| canonical_sop_id | string FK → `sops` | The SOP page that represents this Space. |
| read_only | boolean | True for the Owner Email Space (sourced from the Owner Router's folder). |
| created_at | timestamp | |

### 13.2 `sops`

| Field | Type | Notes |
|---|---|---|
| id | string PK | |
| space_id | string FK | |
| title | string | |
| owner_uid | string FK → `users` | |
| backup_owner_uid | string FK | |
| status | string | enum: Placeholder, Draft, In Review, Approved, Deprecated. |
| source_state_hint | string | enum from §9.1. |
| sensitivity | string | enum: Low, Medium, High. |
| body_md | string | Markdown content per §13.7. |
| last_reviewed_at | timestamp | Required when status = Approved. |
| created_at, updated_at, deleted_at | timestamp | |

### 13.3 `templates`

| Field | Type | Notes |
|---|---|---|
| id | string PK | |
| space_id | string FK | |
| name | string | |
| audience | string | Tenant/Owner/Applicant/Vendor/Internal/Unknown. |
| channel | string | RentVine/Gmail/LeadSimple/Internal/Phone/Other. |
| body | string | |
| approved_by_uid | string FK | |
| last_reviewed_at | timestamp | |
| status | string | Draft / In Review / Approved / Deprecated. |

### 13.4 `tools`

| Field | Type | Notes |
|---|---|---|
| id | string PK | |
| name | string | unique |
| url | string | Real URL only; never invented. |
| purpose | string | |
| primary_owner_uid | string FK | |
| integration_status | string | Link only / Read-only / Draft-only / Blocked / Deferred. |
| sensitivity | string | Low/Medium/High. |
| notes | string | |

### 13.5 `placeholders`

| Field | Type | Notes |
|---|---|---|
| id | string PK | |
| space_id | string FK | |
| related_sop_id | string FK | optional |
| missing_detail | string | |
| source_hint | string | |
| owner_uid | string FK | |
| priority | string | P0/P1/P2 |
| due_date | string (ISO date) | |
| status | string | Open / In Review / Resolved / Deferred |
| resolution | string | |

### 13.6 `sources_meta`

Stores Firestore metadata about Drive-indexed files. Keyed by Drive file ID.

| Field | Type | Notes |
|---|---|---|
| drive_file_id | string PK | |
| space_id | string FK | |
| approval_status | string | Unreviewed / Transcript-derived / Approved / Deprecated |
| sensitivity | string | Low / Medium / High (High → excluded from retrieval) |
| last_reviewed_at | timestamp | |
| reviewer_uid | string FK | |

### 13.7 SOP page structure (Markdown, stored in `body_md`)

```markdown
# SOP: [Title]

Status: [Placeholder/Draft/In Review/Approved/Deprecated]
Primary owner: [User]   Backup: [User]   Escalation: [User]
Audience: [...]   Channel: [...]   Related tools: [...]

## When to use this
Plain-language trigger.

## When not to use this
Boundaries and escalation conditions.

## Required tools and links
- Tool: [name] — [URL]
- Related sheet / doc / Fathom: [link]

## Source evidence
- Source: [name] — [Drive link] — Approval: [status]
- Last reviewed: [date]   Approved by: [user]

## Step-by-step
1. ...
2. ...

## Required fields / data inputs
- Field — Where found — Where entered — Owner

## Templates / approved wording
- [Linked template(s)]

## Edge cases and exceptions

## Do not do

## Placeholders / missing details
- [BAILEY TO CONFIRM — ...]

## Change Log
(auto-rendered from change_log collection)
```

### 13.8 `ask_logs`, `change_log`, `users`

Standard supporting collections.

**`ask_logs`**: `id`, `user_uid`, `question`, `audience`, `channel`, `urgency`, `grounding_source_ids[]`, `answer`, `source_state`, `citations[]`, `draft`, `escalation_owner`, `user_feedback`, `created_at`.

**`change_log`**: `id`, `entity_type` (sop/template/tool/placeholder/source/user), `entity_id`, `editor_uid`, `action` (create/update/approve/reject/deprecate), `diff` (or before/after snippet), `note`, `created_at`. Supports a forward-compatible `actor_via_email_token` field reserved for V1.5 D-10.

**`users`**: `uid`, `email`, `name`, `role` (Editor/Approver/Admin), `created_at`, `last_active_at`.

---

## 14. Auth, Privacy, Security

### 14.1 Authentication

- Google sign-in via Firebase Auth / Identity Platform with Google as the only provider.
- Hosted-domain restriction enforced server-side after the OAuth callback.
- `ALLOWED_HD` env var controls the allowed domain. Default for production: `pmikcmetro.com`. Configurable for the implementer's test enterprise.
- Session length: 8 hours active, 12 hours absolute. Refresh handled by Firebase.

### 14.2 Authorization

- Firebase Auth custom claims encode `role` (Editor / Approver / Admin).
- Firestore Security Rules enforce role-based access on the database directly. The client cannot read or write outside its role's allowed paths, even by hand-crafting a request.
- All mutating API routes additionally re-verify the role server-side from the verified ID token.

### 14.3 Privacy

- All data lives in Google Cloud and Google Workspace under the customer's tenancy. No external processors except Vertex AI (within the same GCP project).
- **Excluded from ingest:** raw screening reports, bank statements, NACHA files, full lease packets, complete tenant ledgers, Plaid raw output, credit-report content, SSNs.
- **Allowed:** SOPs, templates, Fathom transcripts, indexed Google Sheets, indexed Google Docs in approved Drive folders.
- Sensitivity tagging on sources is enforced at query time: High-sensitivity sources are excluded from retrieval.
- A short Privacy Notice page is linked from the user menu, listing what is collected, why, and the GCP services used.

### 14.4 Security

- HTTPS-only with HSTS.
- All secrets in Secret Manager; nothing in the repo. Service account keys avoided in favor of workload identity.
- Rate limiting on `/api/ask` (60/min/user) and on the OAuth callback.
- Audit log retention: 365 days (Cloud Logging).
- Daily Firestore backups with 14-day retention.
- Dependabot / Renovate enabled; CI fails on Critical CVEs.

---

## 15. Testing and Acceptance

### 15.1 TDD baseline

- **Unit tests** for: source-state classification, citation validation, prompt assembly, permission checks, Firestore data validators.
- **Integration tests** for: API routes (`/api/ask`, SOP CRUD, placeholder CRUD), Firestore Security Rules, Vertex AI Search grounding response parsing.
- **End-to-end tests** (Playwright) for the critical flows below.
- **Smoke tests** after every deploy against staging.

### 15.2 Eval set (anti-hallucination regression)

A set of **≥ 50 question / expected-state pairs** covering P0 processes and deliberate gaps, run in CI. Categories: Verified, Multi-source concur, Partial, Placeholder, Conflict, No Source, Prompt injection, PII leakage, Generic-PM trap, Stale-source.

**Hard failures (block deploy):** any hallucinated answer in a No-Source case; any prompt-injection bypass; any PII leakage; any generic-PM answer for a missing PMI process.

### 15.3 Critical end-to-end flows

1. Sign in with `ALLOWED_HD` Google account → land on Ask. Sign in with another domain → rejected.
2. Ask a question with strong source support → `Verified Source` + citations + draft.
3. Ask a question with no source → `No Reliable Source Found` + "Send capture task" action works.
4. Editor creates an SOP and saves `In Review` → appears in Approval Queue. Approver marks Approved. Editor cannot mark Approved.
5. Drop a new doc into a Space's Drive folder → it appears as a citable source within one indexing cycle (verify within 10 minutes for a small doc).
6. Edit an SOP → change-log entry created.
7. Resolve a placeholder → status updates, referenced SOP updates, change-log written.
8. Approval Queue email notification arrives in Approver's Gmail with `KB Approval` label, containing the item link.

### 15.4 Usability tests (pre-launch)

- Chastity completes five real renewal/maintenance/inbox lookups in ≤ 3 minutes each.
- Estelle completes work-order and tenant-comms lookups.
- Shane completes a screening/leasing lookup.
- Bailey completes five capture entries in ≤ 5 minutes each.

### 15.5 Acceptance criteria (must all pass)

- **A-1.** Sign-in restricted to `ALLOWED_HD`.
- **A-2.** Search "lease renewal" surfaces the renewal SOP, linked Drive docs, Fathom recordings, templates, tools, open placeholders.
- **A-3.** Search "maintenance photo" surfaces work-order intake SOP, RentVine link, photo-request template, escalation rule.
- **A-4.** Question with no documented answer → `No Reliable Source Found` + capture task. Never an invented answer.
- **A-5.** Bailey adds a new process detail in under 5 minutes per item, no developer help.
- **A-6.** Each cited source is clickable and opens the actual file/SOP.
- **A-7.** Required approver or Admin can mark eligible queue items Approved; unrelated Editors cannot approve or view unrelated queue items.
- **A-8.** Source-state distinctions are visible in the data model and the UI.
- **A-9.** No external email/message sent automatically. Drafts are copy-to-clipboard.
- **A-10.** No write to RentVine, LeadSimple, DotLoop, QuickBooks, Boom, or any operational Sheet.
- **A-11.** Sensitive sources (bank, screening, full lease) absent from index.
- **A-12.** All P0 SOPs are Approved or carry explicit, owned placeholders.
- **A-13.** Critical-flow e2e tests pass in CI on the deployed staging environment.
- **A-14.** Eval set passes with zero hallucination-rule violations.
- **A-15.** Chastity, Estelle, Shane each complete their usability tasks unassisted.
- **A-16.** Owner Email Space surfaces the Owner Router's Reply Patterns and Routing Rules as cited sources when asked owner-email-related questions.
- **A-17.** Indexing latency: a new Drive file is searchable within 10 minutes.

---

## 16. Launch Capture Plan

Sequenced by launch gates, not calendar weeks. Each phase ends when its gate passes; the next phase may overlap.

**Phase 1 — Foundation (implementer).** Provision GCP project, deploy to test enterprise, create Spaces, configure Drive folders, connect Vertex AI Search, run smoke tests. (See §B SETUP.md.)
Gate: smoke tests pass on staging; Admin can add users and create Spaces.

**Phase 2 — P0 capture (Bailey + Approvers).** Bailey works through the P0 processes (Lease Renewals, Owner Renewal Outreach, Tenant Renewal Notice + DotLoop Follow-Up, Maintenance Work Order Intake, Vendor Assignment Handoff, Daily Inbox Triage, Fathom Training, Escalation Rules). For each: drops Drive docs into the Space, edits the SOP page, links the relevant Fathom recordings.
Gate: every P0 SOP is `Approved` or has explicit, owned placeholders.

**Phase 3 — P1 capture + Owner Router cross-reference.** Move-In, Move-Out + Deposit Disposition, Owner Onboarding, plus Owner Email Space verifying that the Owner Router's `01 Reply Patterns - Approved` and `03 Routing Rules` are indexed and citable.
Gate: A-16 passes.

**Phase 4 — Review and usability.** Run usability tests, eval set, acceptance criteria. Resolve failures as placeholders or source updates.
Gate: A-1 through A-17 all pass on staging.

**Phase 5 — Production cutover.** Swap `ALLOWED_HD` to `pmikcmetro.com`, map `kb.bluespringspropertymanagementinc.com` to Cloud Run, smoke test, sign-off.
Gate: smoke tests pass on production URL; first end-user successful sign-in and Ask.

---

## 17. Defined Decision Points

Each lists the question, v1 default, and what changes if different. These supersede any prior versions of the spec.

| # | Question | V1 Default | What changes if different |
|---|---|---|---|
| D-1 | Which platform hosts the editable knowledge base? | Cloud Run + Firestore. | If team prefers Notion or another wiki, the schema in §13 migrates but Ask retrieval still queries Vertex AI Search over Drive. |
| D-2 | Which Google account owns Spaces and Drive folders? | `dan@pmikcmetro.com` until/unless a dedicated `kb@pmikcmetro.com` is provisioned. | One-time re-grant of folder ownership. |
| D-3 | Which Drive folders feed each Space? | One folder per Space, named `KB / [Space Name]`. Plus the existing Owner Router folder for the Owner Email Space. | Configurable per Space in Admin. |
| D-4 | Which Fathom recordings get ingested? | Bailey uploads transcripts (VTT/SRT/TXT) into the relevant Space's Drive folder. | If Fathom API/export confirmed later, a connector can be added in phase 2. |
| D-5 | RentVine / LeadSimple / DotLoop / Boom API integration? | Hyperlink-only in v1. | Each can be assessed in phase 2 and added with read-only ingestion. |
| D-6 | Which Sheets are canonical vs. historical? | Admin tags each indexed Sheet in `sources_meta` as Canonical / Historical / Excluded. | Single-field update per source. |
| D-7 | Which SOPs need Dan approval vs. Bailey or Chastity? | Screening, Vendor Assignment, Move-Out Deposit Disposition, Owner Onboarding, Bookkeeping → Dan. All others → any of Dan, Bailey, Chastity. | Per-SOP field; reassignable. |
| D-8 | Who owns ongoing maintenance after Bailey's leave or transition? | Dan, Bailey, and Chastity remain Approvers; Chastity is the in-office Editor primary. | Reassign by changing the SOP `owner_uid` field; role changes via Admin. |
| D-9 | Does v1 create Gmail drafts directly? | No. Copy-to-clipboard only. | Phase 2 via opt-in OAuth scope. |
| **D-10** | **Email-based approval (post-V1 only)** | **Superseded for V1:** Approval Queue delivery is in-app; the legacy event-driven Gmail sender is hard-disabled. Existing forward-compatible fields are inert and grant no authority. | Any later email notification or approval-link lane needs a new human-confirmed spec, artifact, action key, exact permission, tests, audit, and explicit activation. It cannot inherit authority from S19/S24 workflow communication. |
| D-11 | Color tokens from `bluespringspropertymanagementinc.com` | Default PMI navy + gold palette; verified by implementer during setup. | Hex updates in `tokens.css`. |
| D-12 | Test enterprise vs. production cutover | Build and pilot on implementer's enterprise (set `ALLOWED_HD=[implementer_enterprise_domain]`). At cutover, change one env var to `pmikcmetro.com`, update domain mapping, re-deploy. | If multi-tenant testing is needed, two Cloud Run services with two env configs. |
| D-13 | Should Chastity be Editor or Approver? | **Approver in v1.** | One-field downgrade post-pilot if Dan + Bailey disagree after observation. |
| D-14 | Should the offshore team have any Approval rights? | No. Editor only. | One-field upgrade if Dan agrees. |
| D-15 | Does the KB ingest Gmail content directly? | **No.** Removed from v1 to reduce scope and overlap with Owner Router. If Gmail content (e.g., a gold response thread) needs to be indexed, it is exported as a Drive file. | Phase 2 can add scoped Gmail label ingestion with the `gmail.readonly` scope. |
| D-16 | Does the Owner Router know about the KB? | **No.** The Owner Router operates standalone per Spec 2. The KB indexes the Owner Router's Drive folder but the Owner Router does not call the KB. | If the Owner Router needs KB lookups in V2, a small Apps Script could query the KB's public Ask API. Not in v1. |

---

## 18. Deployment and Operational Expectations

### 18.1 Environments

- **Production:** `kb.bluespringspropertymanagementinc.com` on Cloud Run, `ALLOWED_HD=pmikcmetro.com`.
- **Staging / Implementer Test:** `kb-staging.[implementer_enterprise_domain]` on Cloud Run, `ALLOWED_HD=[implementer_enterprise_domain]`.
- **Local:** `.env.local`, Firestore emulator, Vertex AI calls mocked or pointing at a sandbox GCP project.

### 18.2 CI/CD

- GitHub Actions: lint → typecheck → unit tests → integration tests → eval set → build.
- Auto-deploy `main` → staging on Cloud Run. Manual promote staging → production.
- Firestore Security Rules deployed via `firebase deploy --only firestore:rules`.
- Vertex AI Search data store configuration is checked into the repo as Terraform or `gcloud` scripts.

### 18.3 Operational SLOs

- Sign-in to interactive UI: p95 ≤ 3 s.
- Ask response (including Gemini call): p95 ≤ 12 s; p99 ≤ 25 s.
- Drive indexing latency: new doc searchable within 10 minutes (Vertex AI Search-bound).
- Uptime target: 99% during business hours (8a–6p CT).

### 18.4 Cost guardrails

- Vertex AI Search free tier covers the v1 corpus size easily.
- Gemini API: budget alert at $200/month, hard cap at $750/month.
- Cloud Run: scale-to-zero; expected monthly cost < $10.
- Firestore: free tier covers v1 traffic.
- **Total expected monthly run cost: under $250 at v1 scale.**

### 18.5 Backups

- Daily Firestore exports to a GCS bucket, 14-day retention.
- Drive folders are backed up by Google Workspace policy (not the KB's responsibility).
- Rebuild from repo + Firestore export: under 1 hour.

---

## 19. Implementation Guidance (binding)

1. **Anti-hallucination is enforced in code.** Citation IDs validated against grounding response. Source-state never inferred by the model alone — confidence threshold is server-side.
2. **All five source states are first-class** in the schema and UI.
3. **No write paths to external systems.** Cloud Run service identity has read-only Drive scope and send-only Gmail scope. Verified in IAM, not just convention.
4. **Source links preserved verbatim.** Drive URLs are not rewritten.
5. **Soft delete only.**
6. **Server-side permission checks on every mutation.** Firestore Security Rules + API route checks (defense in depth).
7. **Drafts always carry `Draft — Review before sending`.** Verbatim. Not configurable.
8. **No PII in logs, error reports, or LLM metadata.** Use stable UUIDs only.
9. **Every feature maps to an F-# and an A-#.** Else it's out of v1.
10. **Tests first.**
11. **The KB never writes to the Owner Router Drive folder.** Read-only.
12. **Brand verification is part of setup**, not an afterthought.
13. **Launch gates bind, not calendar dates.** Cut scope, never anti-hallucination, never source-state visibility, never human-in-the-loop on drafts.
14. **The simplest thing that works.** When two designs both satisfy the spec, the implementer picks the one with fewer moving parts.

---

## 20. Edge Cases and Error Handling

| Condition | Expected behavior |
|---|---|
| Grounding returns 0 supporting docs | `No Reliable Source Found`; do not call Gemini; offer capture task. |
| Gemini returns malformed JSON | Retry once with stricter prompt; if still malformed, fall back to `No Reliable Source Found`. |
| Gemini cites a doc not in the grounding response | Citation stripped. If all citations stripped, downgrade to `No Reliable Source Found`. |
| Vertex AI Search unavailable | Show in-UI banner "Search is temporarily unavailable"; Ask disabled; Spaces still browsable. |
| Drive folder unreachable for indexing | Admin sees error in indexing status; affected Space marked degraded. |
| User signs in with non-`ALLOWED_HD` domain | Rejected at OAuth callback; clear error page. |
| Editor attempts to mark a doc Approved | Server returns 403; UI greys the action. |
| Two concurrent edits to same SOP | Last-write-wins on field level (Firestore semantics); change log shows both edits. |
| Placeholder owner is removed from the system | Placeholder reassigned to the Admin until manual reassignment. |
| Drive file deleted after indexing | Vertex AI Search removes it on next sync; KB shows a "source removed" indicator on any cited answer. |
| Gmail notification fails to send | Logged to Cloud Logging; queue item still marked correctly; Admin sees error. |

---

## 21. Acceptance Checklist (Verification)

This is the implementer's pre-launch checklist. Each item must pass before production cutover.

- [ ] GCP project provisioned for staging; APIs enabled (Vertex AI, Discovery Engine, Firestore, Cloud Run, Identity Platform, Gmail API, Drive API, Secret Manager, Cloud Logging).
- [ ] GCP project provisioned for production with the same API set.
- [ ] Firebase Auth / Identity Platform configured with Google provider on both projects.
- [ ] `ALLOWED_HD` env var set correctly on staging (test enterprise) and on production (`pmikcmetro.com`).
- [ ] Firestore database created (Native mode, `us-central1`).
- [ ] Cloud Run service deployed on staging; custom domain mapped.
- [ ] Drive folders created for all 12 Spaces, including read-only Viewer grant to the KB service account for `Owner Router - PMI KC Metro`.
- [ ] Vertex AI Search data stores created and bound, one per Space.
- [ ] OAuth client created with scopes: `openid`, `email`, `profile`, `drive.readonly`, `gmail.send`. No other scopes.
- [ ] Brand tokens verified against `bluespringspropertymanagementinc.com` and written into `tokens.css`.
- [ ] All P0 SOPs are `Approved` or have explicit, owned placeholders.
- [ ] Acceptance criteria A-1 through A-17 pass on staging.
- [ ] Eval set passes in CI with zero hard failures.
- [ ] Usability tasks completed by Chastity, Estelle, Shane unassisted.
- [ ] Production domain mapping (`kb.bluespringspropertymanagementinc.com`) configured and SSL active.
- [ ] First end-user successful sign-in and Ask on production.
- [ ] Rollback plan documented (re-point DNS to staging Cloud Run; disable production OAuth client).

---

## 22. Traceability Notes (Source Basis)

This spec was synthesized from the following inputs:

- **Old technical KB spec** (`Bailey_Knowledge_Transfer_Assistant_V1_1_Spec.md`): provided the bulk of technical detail — architecture, data model, functional requirements F-1 through F-33, acceptance criteria A-1 through A-17, decision points D-1 through D-16, brand tokens, setup runbook, deployment plan, cost guardrails.
- **Deep-research KB summary** (`deep-research-gpt-Bailey_Knowledge_Transfer_Assistant_Source_of_Truth.md`): provided the refined alignment framing, the cross-product boundary table, the explicit scope/non-scope matrix, and the cross-spec uncertainty handling convention (`Needs Verification: <fact>`).
- **Spec 3 (north star)**: governs the business boundary between the KB and the Owner Router; this spec implements that boundary at the runtime level.
- **Spec 4 (implementation meta)**: governs build sequence, launch gates, and configuration; this spec satisfies those gates.
- **Transcripts and analysis** (`pmi_-_call_1.md`, `pmi_-_call_2.md`, `transcript_analysis.md`): used as background context for team roles, workflows, and operational realities; not used as authoritative source for technical decisions.

### Cross-spec consistency rules respected in this document

- The KB indexes the Owner Router's Drive folder **read-only** (per A1 = (c) in clarification).
- Approvers are Dan, Bailey, **and Chastity** (per B1).
- No calendar-week deadlines; only launch gates (per C1).
- V1.5 email approval hook fully specified, not built (per D1).
- The KB role is canonically named **PMI KC KB** (per G1).
- 11 KB-owned Process Spaces + 1 read-only Owner Email Space = 12 total at launch (per H1 + A1 reconciliation).

### Open questions remaining

None blocking. Open items for V1.5 or later are tracked under D-9, D-10, D-15, D-16.

---

# Appendix A — Seed Content at Launch

### A.1 Process Spaces (12)

1. **Lease Renewals**
2. **Owner Renewal Outreach + Comp Lookup**
3. **Tenant Renewal Notice + DotLoop Follow-Up**
4. **Maintenance Work Order Intake**
5. **Vendor Assignment Handoff**
6. **Daily Inbox Triage**
7. **Fathom Training**
8. **Escalation Rules**
9. **Move-In**
10. **Move-Out + Deposit Disposition**
11. **Owner Onboarding**
12. **Owner Email** (read-only; indexed from the `Owner Router - PMI KC Metro` Drive folder)

Each Space has: a Drive folder named `KB / [Space Name]` (except Owner Email which points at the Owner Router folder), a canonical SOP page (Approved or Placeholder), a Vertex AI Search data store bound to the folder, a tool list.

### A.2 Tools (15)

RentVine, LeadSimple, Gmail, Google Sheets, Google Drive / Docs, Fathom, DotLoop, Boom / Boompay, QuickBooks, Google Chat, PadSplit, Z-inspection, PMI Free Rental Analysis, Zillow, Second Nature.

### A.3 Escalation routing (encoded per SOP)

| Issue type | Escalate to |
|---|---|
| Vendor assignment / owner-sensitive maintenance | Dan |
| Process detail / Bailey-owned workflow | Bailey, then Chastity |
| Lease document accuracy | Dan, with Leia context |
| Tenant screening decision | Dan / Shane |
| Financial / accounting handling | Dan / Leia |
| Tenant communication / work orders | Estelle → Bailey / Dan |
| Leasing / applicant communication | Shane → Dan |
| No source or conflict | Process owner |

---

# Appendix B — Implementer SETUP.md (the runbook)

A separate companion file `SETUP.md` ships in the repo. This appendix specifies what it must contain so the implementer can stand up the system in 4–6 hours.

### B.1 Prerequisites (15 min)

- A Google Cloud billing account.
- Admin on a Google Workspace domain (the implementer's test enterprise initially).
- `gcloud` CLI installed and authenticated.
- Node 20+, `npm`, and `git`.
- A GitHub account with access to the KB repo.

### B.2 One-time GCP setup (30 min)

1. `gcloud projects create pmi-kb-test --name="PMI KB Test"` (and an equivalent for production).
2. Enable APIs: Vertex AI, Discovery Engine (Vertex AI Search), Firestore, Cloud Run, Identity Platform, Gmail API, Drive API, Secret Manager, Cloud Logging.
3. Configure Firebase Auth / Identity Platform with Google provider; set the authorized domain.
4. Create the Firestore database in Native mode, region `us-central1`.
5. Create the Cloud Run service shell with a placeholder image.

A Terraform module (`infra/`) does all of the above in `terraform apply`. The runbook walks through both manual and Terraform paths.

### B.3 Drive folder bootstrap (15 min)

The runbook includes a Drive folder hierarchy and a permissions script:

```
KB / Lease Renewals
KB / Owner Renewal Outreach + Comp Lookup
KB / Tenant Renewal Notice + DotLoop Follow-Up
KB / Maintenance Work Order Intake
KB / Vendor Assignment Handoff
KB / Daily Inbox Triage
KB / Fathom Training
KB / Escalation Rules
KB / Move-In
KB / Move-Out + Deposit Disposition
KB / Owner Onboarding
```

Plus a **Viewer grant** to the Cloud Run service account for the existing `Owner Router - PMI KC Metro` folder. If the Owner Router's Drive folder is currently named `Owner Inbox Router - PMI KC Metro`, the runbook includes a rename step (one-line); KB configuration uses the canonical name `Owner Router - PMI KC Metro`.

The folder IDs go into `.env` as `SPACE_DRIVE_FOLDER_IDS` (JSON map).

### B.4 Vertex AI Search bootstrap (30 min)

For each Space's Drive folder, create a Vertex AI Search Data Store via `gcloud discoveryengine`:

```bash
gcloud alpha discoveryengine data-stores create \
  --data-store-id=kb-renewals \
  --display-name="KB / Lease Renewals" \
  --industry-vertical=GENERIC \
  --solution-types=SOLUTION_TYPE_SEARCH \
  --content-config=CONTENT_REQUIRED
```

Then bind each data store to its Drive folder. The runbook has the exact command sequence; a `make spaces:create` target does it from the env config.

### B.5 App deploy (30 min)

```bash
git clone <repo>
cp .env.template .env
# Fill in: GCP_PROJECT, ALLOWED_HD, OAUTH_CLIENT_ID/SECRET, etc.
make build
make deploy
make domain:map  # binds kb-staging.[domain] to Cloud Run
```

### B.6 First sign-in and user setup (15 min)

- Implementer signs in (lands as Editor by default).
- Runs `make grant-admin EMAIL=implementer@enterprise.com` to flip themselves to Admin via Firebase custom claim.
- Adds Dan, Bailey, Chastity (as Approvers), Estelle, Shane, Leia (as Editors) in the Admin UI per §11.1.

### B.7 Brand token verification (5 min)

- Open `bluespringspropertymanagementinc.com` in DevTools.
- Inspect header background, primary button.
- Copy actual hex values into `tokens.css` (file is in the repo, named comments tell you which variable maps to which UI element).
- Redeploy.

### B.8 Smoke tests (15 min)

The runbook lists the 17 acceptance tests (A-1 through A-17) with click-through reproduction steps. Implementer ticks each.

### B.9 Production cutover checklist (30 min)

1. Provision production GCP project (repeat B.2 with `pmi-kb-prod`).
2. `ALLOWED_HD=pmikcmetro.com`.
3. Add `kb.bluespringspropertymanagementinc.com` as a Cloud Run domain mapping.
4. DNS: CNAME `kb` → `ghs.googlehosted.com` (or per Cloud Run's instructions).
5. Re-grant Drive folder permissions to the prod service account.
6. Re-run smoke tests on production URL.
7. Sign-off on the launch readiness checklist.

### B.10 Rollback

If anything goes wrong post-cutover:

- Re-point DNS to the staging Cloud Run service.
- Disable the production OAuth client.
- The Drive folders are untouched; the Owner Router keeps working unaffected.

### B.11 Total expected wall-clock time

| Phase | Time |
|---|---|
| Prerequisites | 15 min |
| GCP setup | 30 min |
| Drive folders + permissions | 15 min |
| Vertex AI Search data stores | 30 min |
| App deploy | 30 min |
| Users + brand verification | 20 min |
| Smoke tests | 15 min |
| **Total to working test pilot** | **~2.5 hours** |
| Production cutover (later) | 30 min |

---

*End of Spec 1.*
