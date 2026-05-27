---
spec_id: spec-2
product: Owner Router
version: v1
status: implementation-ready
companion_spec: spec-1-technical-spec.md (PMI KC KB)
operating_north_star: spec-3-operating-north-star-spec.md
implementation_meta: spec-4-implementation-meta-implementation-spec.md
---

# Spec 2 — Owner Router (Technical Specification)

This document is the authoritative source of truth for building and deploying the **Owner Router**, the Gmail-native operating workflow for triaging, verifying, drafting, and routing owner email at PMI KC Metro. It is one of four aligned specifications in this project. It defines the Router product end-to-end at a level an outside implementer can configure, build content for, validate, and ship from without further interpretation.

The Owner Router is a **separate implementation** from the **PMI KC KB** (Spec 1). The two products share users, anti-hallucination vocabulary, and review discipline, but they do not share runtime, do not share send authority, and do not merge. Cross-product behavior is governed by Spec 3 (north star) and Spec 4 (implementation meta).

The Router is **not** a standalone web app, a custom database, or a custom dashboard. It is a Gmail-native workflow with a small Google Workspace source-of-truth package. The single biggest implementation risk is overbuilding — see §20.

---

## 1. Purpose

The Owner Router helps Dan process owner-related email faster, with less judgment load on Bailey, without creating a new inbox, a new app, or another tool the team must maintain.

**End-state behavior at launch (definition of done):**

- Every owner email entering Dan's Gmail receives an `Owner Router / *` state label, either automatically by filter or manually by Dan or Bailey.
- Dan and Bailey can summarize, classify, draft, verify, and label owner threads from Gmail web and Gmail mobile.
- Every reply is drafted with AI assistance (Gemini in Gmail when available, an approved prompt pack or Gem as fallback), edited by a human, and sent manually.
- Any factual claim in a draft is traceable to the Gmail thread, an approved Drive doc, an approved Sheet, RentVine, LeadSimple, DotLoop, or a logged human verification — otherwise the draft is marked `Needs Verification`.
- Bailey's knowledge for handling owner email is captured in six canonical files in a shared Drive folder.

The product is **successful only when** Dan can run it from Gmail on web and mobile, Bailey can maintain the source-of-truth materials, and every uncertain fact is either verified before send or labeled as an explicit gap.

---

## 2. Scope

### 2.1 In scope (v1)

| Capability | Hard requirement |
|---|---|
| Owner-thread intake | Gmail filters + manual labeling capture owner emails into the `Owner Router / *` label tree. |
| State labeling | Each handled thread has exactly one current state label from the taxonomy in §7. |
| Thread summary | Reviewer uses Gemini in Gmail's summary / AI Overview when available; manual summary acceptable when not. |
| Reply drafting | Reviewer uses Help me write, Suggested Replies, the Owner Router Gem, or an approved prompt-pack template. |
| Source verification | Any factual reply is traceable to the thread, a prior thread, an approved Drive doc, an approved Sheet, RentVine, LeadSimple, DotLoop, or a logged human verification. |
| Human send | Only Dan or Bailey sends. Nothing AI-initiated leaves the inbox. |
| Routing recommendation | Each handled thread indicates whether the next action belongs to Dan, Bailey, LeadSimple, RentVine, a Sheet, or another manual destination. |
| Open-gap capture | Unsupported or ambiguous categories are logged in the Open Gaps sheet. |
| Mobile usability | Dan can open a labeled thread, read a summary (where Gemini mobile supports it), draft or edit a reply, change state label, and send — all from Gmail mobile. |
| Web usability | Optional Multiple Inboxes layout, Gemini side panel, and Gems may augment desktop but cannot be required to complete the workflow. |
| Optional setup-time Apps Script | Implementer may use Apps Script to auto-create labels, populate sheet headers, and run the three weekly health-check searches as a digest. See §9.11. |

### 2.2 Out of scope (v1)

| Excluded | Reason |
|---|---|
| Standalone web app, custom database, or queue UI | Adds another place to check; conflicts with "no new operational surface." |
| Autonomous send of any reply | Violates the human-approval constraint; transcripts explicitly reject this for owner communication. |
| LeadSimple API write-back | Not validated in v1 evidence; manual handoff is safer and cheaper. |
| AI Inbox as a required surface | Google documents AI Inbox as beta, US/English-limited, restricted to Workspace Enterprise Plus + Gemini Alpha for work accounts, and unsupported for attachments, delegated inboxes, or encrypted email. Cannot be a v1 dependency. |
| Gmail Live as a dependency | Not needed for this workflow. |
| Tenant communication automation | Tenant communication remains in RentVine. |
| Lease-document review automation | Dan stays final reviewer; out of scope. |
| Financial ledger changes | No writes to RentVine, QuickBooks, bank, or owner ledger. |
| Renewal comp research automation (Zillow + PMI Free Rental Analysis) | Important but separate; routing yes, automation no. |
| Vendor selection or maintenance approval automation | Dan-only decisions; out of scope. |
| Adding Chastity as an active Router operator before Dan and Bailey approve | Permissions, send authority, and review boundaries are not defined yet. |
| Onboarding any user other than Dan and Bailey to the Owner Router labels and Drive folder | Reduces error surface. |

### 2.3 Non-goals (explicit; restated in §20 with reasons)

The Router covers owner email only. It does not add a standalone dashboard, database, or queue UI; it does not automate tenant communication; it does not automate lease-document review, vendor selection, maintenance approval, or financial ledger changes; and it does not write directly to LeadSimple, RentVine, DotLoop, QuickBooks, operational Sheets, or any other system of record. When follow-up work is needed in those systems, the Router identifies the next step and the reviewer completes the handoff manually in the existing destination system.

---

## 3. Relationship to the PMI KC KB (Spec 1)

The Owner Router and the KB are aligned but separate. Spec 3 (north star) governs the business boundary; this section restates what an implementer must respect.

| Concern | Owner Router (this spec) | PMI KC KB (Spec 1) |
|---|---|---|
| Surface | Gmail web + mobile + restricted Drive package | Standalone web app at `kb.bluespringspropertymanagementinc.com` |
| Primary job | Triage owner email; draft owner replies; route to LeadSimple/RentVine/Sheet manually | Find / capture / edit / approve process knowledge; generate drafts for any internal audience |
| Knowledge layer | Six canonical files in `Owner Router - PMI KC Metro` Drive folder | Firestore + indexed Drive folders (one per Space) |
| Operating roles | Dan (Approver / sender), Bailey (operator / sender within Dan-approved categories), Chastity (view-only on Drive in v1; not an operator) | Editor / Approver / Admin (Approvers = Dan, Bailey, Chastity) |
| Approval surface | Gmail labels (`Owner Router / Dan Decision`, `Owner Router / Draft Ready`, etc.) | In-app Approval Queue + Gmail `KB Approval` notifications |
| Outbound behavior | Human-edited, manually sent owner email only | Copy-to-clipboard drafts only |
| Shared vocabulary | Source states (Verified / Partial / Placeholder / Conflict / No Source) when reasoning about source coverage; `Needs Verification: <fact>` placeholder wording; `Draft — Review before sending` banner | Same |

### 3.1 Cross-product interoperation in v1

- **The KB indexes the Router's Drive folder read-only** as the "Owner Email" Space. KB users (Editors and above) can ask the KB owner-email questions and receive citations to the Router's `01 Reply Patterns - Approved` and `03 Routing Rules`. This is a KB-side read; the Router does not know about the KB.
- **The Owner Router does not depend on the KB.** If the KB is down, the Router keeps working from Gmail + the Drive folder + the Gem/prompt pack.
- **The Router never writes to the KB.** Cross-product alignment is one-way (KB reads from Router; Router does not call KB).
- **Operator authority does not transfer between products.** A KB Editor or Approver role does not grant Owner Router labels, send authority, or Router Drive access. Authority changes in either product require explicit Dan + Bailey approval, recorded in the affected spec.

### 3.2 What stays in the Owner Router (not the KB)

- Live owner-thread state (Gmail labels).
- Owner-thread-specific Open Gaps entries (`05 Open Gaps and Unsupported Cases`).
- Dan voice and tone examples (`02 Dan Voice and Tone Examples`).
- Dan-approved reply patterns by category (`01 Reply Patterns - Approved`).
- Routing rules per category (`03 Routing Rules`).
- Source inventory for owner email (`04 Source Links and SOP Inventory`).

The KB's Owner Email Space surfaces these as **citations**, not as Router state. The KB cannot change labels, route threads, or send mail.

---

## 4. Target Users and Roles

| User | Router role in v1 | Send authority | Notes |
|---|---|---|---|
| **Dan Hilgedick** | Primary reviewer, final decision-maker on owner-facing replies, pricing, maintenance, legal/financial statements. | Yes. | The product exists to make his email load tractable. |
| **Bailey Whiting** | Pilot operator. Triages owner email, drafts replies for Dan-approved categories, owns the reply patterns and routing rules, runs the source-of-truth folder. | Yes, only for categories Dan has pre-approved (see §10). | v1 must operate before her leave to validate the handoff; ongoing operator role continues on return. |
| **Chastity** | Backup operator, post-pilot only. | No, unless Dan and Bailey explicitly upgrade her permissions after pilot. | v1 default: view-only on the Drive folder; observes the workflow during pilot. (Note: Chastity is an **Approver in the KB** per Spec 1; this does not transfer to the Router.) |
| **Leia, Shane, Estelle** | Not pilot users. | No. | They may be the downstream destination of a manual handoff but the pilot does not change their daily systems. |
| **Implementer** | Sets up labels, filters, Drive folder, Gem/prompt pack, optional Apps Script. | No. | Same person who builds the KB (per Spec 4 F-Q). |

**No other users** receive access to the Owner Router labels, the Drive folder, or the Gem/prompt pack during v1.

---

## 5. Confirmed Context (Operational Reality)

These facts are drawn from the May 7 discovery transcripts and are treated as fixed for v1 design:

- **Email is Dan's stated #1 time drain.** "Emails, dude, emails."
- **Owner communication already happens in Gmail.** Bailey reaches out to owners by Gmail and CCs Dan. Owner replies come back to Gmail.
- **Tenant communication is intentionally kept in RentVine** for records. Tenant-facing replies generated from an owner thread must be handed off to RentVine, not sent from Gmail.
- **Google Sheets is the operational source of truth** the team trusts more than any of the underlying SaaS systems. Renewals, onboarding, move-in/out, payments, bills, and vendor tracking all live in Sheets.
- **Dan is the last reviewer on lease documents** (~100 pages each) and the sole decision-maker on vendor assignment for maintenance work orders.
- **The team uses LeadSimple as a shared inbox**, but Dan reports it is under-adopted by the Philippines staff and Bailey found LeadSimple's renewal workflow more cumbersome than her spreadsheet. The pilot does not change LeadSimple usage.
- **DotLoop and RentVine do not integrate.** Lease and renewal documents are rebuilt manually each time.
- **Existing AI in the stack is welcomed** (Rent Engine showings assistant, LeadSimple delinquency cadence). The team explicitly rejects fully autonomous behavior on owner communication, document review, and screening.
- **Door count is approximately 160** (inferred from "out of 160" in transcripts; treat as a sizing input, not a metric).

---

## 6. Core User Flow

The pilot operates as an 11-step loop, running entirely in Gmail with verification side-trips to Drive, Sheets, RentVine, LeadSimple, or DotLoop as needed.

| Step | Action | Surface | Required? |
|---|---|---|---|
| 1. Intake | Owner email arrives in Dan's Gmail and receives `Owner Router / New` via filter, or is manually labeled by Dan or Bailey if the filter misses. | Gmail filters + labels | Yes |
| 2. Open | Dan or Bailey opens the labeled thread. | Gmail | Yes |
| 3. Summarize | Reviewer uses Gemini summary / AI Overview if available; otherwise reads thread directly. | Gemini in Gmail (or manual) | Best-effort |
| 4. Classify | Reviewer assigns or confirms one owner-email category from the Routing Rules sheet. | Gmail label + Routing Rules sheet | Yes |
| 5. Source check | Reviewer verifies any facts the reply would assert against the required source for the category. | Gmail, Drive, Sheets, RentVine, LeadSimple, DotLoop | Yes when a fact is asserted |
| 6. Draft | Reviewer generates a draft using Help me write, Suggested Replies, the Owner Router Gem, or a copy-paste prompt from the prompt pack. Draft must use approved tone examples and approved reply pattern. | Gemini in Gmail / Gmail compose | Yes when a reply is needed |
| 7. Human edit | Reviewer edits the draft in Gmail compose/reply. Missing or unverified facts are replaced with `Needs Verification: <fact>` placeholders. | Gmail | Yes |
| 8. Send decision | Only Dan or Bailey sends, only for categories Dan has pre-approved for Bailey. Anything else stays in `Dan Decision` until Dan acts. | Gmail | Yes |
| 9. Route downstream | If operational action is needed (LeadSimple task, RentVine note, Sheet row update, DotLoop document, owner call), reviewer manually completes it in the existing tool. | Existing tools | Conditional |
| 10. Close or wait | Reviewer applies the final state label: `Waiting on Owner`, `Waiting on Team`, `Closed`, or `Needs Verification`. | Gmail label | Yes |
| 11. Gap capture | If the thread exposed an unclear policy, missing answer pattern, or new category, reviewer logs it in the Open Gaps sheet with thread link, owner, and unresolved question. | Open Gaps sheet | Conditional |

A thread must have **exactly one** current state label at all times. Label transitions are made manually by the reviewer.

---

## 7. State Labels (Owner Router Taxonomy)

The Gmail label tree below must be created exactly. Renaming requires a corresponding update to the Routing Rules sheet and the Admin Setup doc.

| Label | Meaning |
|---|---|
| `Owner Router / New` | In the pilot queue, not yet reviewed. |
| `Owner Router / Dan Decision` | Requires Dan's judgment before any reply or downstream action. |
| `Owner Router / Bailey Review` | Bailey can resolve or prepare a draft for Dan. |
| `Owner Router / Draft Ready` | Draft exists and needs human edit/send. |
| `Owner Router / Needs Verification` | Missing source or uncertain fact; do not send until checked. |
| `Owner Router / Waiting on Owner` | Reply sent; awaiting owner response. |
| `Owner Router / Waiting on Team` | Awaiting Bailey, Chastity, Leia, Shane, Estelle, or other internal action. |
| `Owner Router / Route to LeadSimple` | Requires a downstream LeadSimple task or assignment; signals the manual handoff has been done or is pending. |
| `Owner Router / Closed` | No further action needed. |

A thread may carry only one of the above at any time. Adding a new label requires Dan and Bailey approval and a Routing Rules sheet update.

---

## 8. UI/UX Requirements

The UI is Gmail, augmented by Gemini features when available and by approved templates when not. UX decisions are governed by three principles:

1. **Mobile-equivalent first.** Anything required to complete the workflow must work on Gmail mobile. Desktop-only conveniences are allowed only as accelerators.
2. **One state per thread, always visible.** A reviewer must be able to see what state any thread is in within one glance at the label list.
3. **Editable everything.** No draft, summary, or AI-generated content is ever sent without explicit human edit and send. There is no "approve and send" shortcut.

### 8.1 Gmail web

| Requirement | Detail |
|---|---|
| Owner queue | Owner Router labels visible in the Gmail sidebar. Optional Multiple Inboxes panes for `New`, `Dan Decision`, `Draft Ready`, and `Needs Verification`. |
| Thread summary | Use Gemini in Gmail summary or AI Overview when present. If absent, summary step is skipped without blocking the flow. |
| Draft | Help me write, Suggested Replies, the Owner Router Gem, or copy-paste from the prompt pack — in that order of preference. |
| Edit | Standard Gmail compose / reply. |
| Label transition | Apply / remove labels from the thread toolbar. |
| Send | Standard Gmail send. |
| Saved searches | The Admin Setup doc lists a saved Gmail search for each state label (e.g., `label:"Owner Router / New"`). |

### 8.2 Gmail mobile (iOS and Android)

| Requirement | Detail |
|---|---|
| Label access | Owner Router labels accessible from Gmail mobile's label list. |
| Summary | Use AI Overview / Gemini mobile features where available. If unavailable on Dan's phone, manual scan acceptable. |
| Draft / edit / send | Use Gmail mobile compose. Draft from the prompt pack via copy-paste if Gemini features are not present in Dan's mobile UI. |
| State update | Apply or change the Owner Router label from the thread menu. If a state cannot be set from mobile (rare), reviewer applies an interim state and finalizes from desktop. |
| No desktop-only dependency | Multiple Inboxes, side panel, or any desktop-exclusive feature cannot be required to complete the loop. |

### 8.3 State coverage: empty, loading, partial, error

The workflow does not run in a custom app, but the operator experience must still behave correctly in degraded conditions. The Admin Setup doc must document the expected behavior for each:

| Condition | Expected behavior |
|---|---|
| **Empty queue** (`Owner Router / New` is empty) | Reviewer sees the empty label view in Gmail. No action required. The reviewer's daily check ends. |
| **Filters did not catch an owner thread** | Reviewer applies the `Owner Router / New` label manually and adds the sender to the filter recipe in the Admin Setup doc as part of weekly maintenance. |
| **Gemini summary unavailable** (rollout, language, plan, smart-features off) | Reviewer skips step 3 and reads the thread manually. Workflow continues uninterrupted. |
| **Help me write / Suggested Replies unavailable** | Reviewer uses the Owner Router Gem; if Gems are not available on Dan's surface, copy-pastes the prompt-pack template into Gemini, ChatGPT, or Claude. Workflow continues. |
| **Owner Router Gem unavailable** | Fall back to the prompt-pack templates in the Drive folder. Workflow continues. |
| **Drive doc / Sheet not loading** | Reviewer pauses on Source Check (step 5) and labels the thread `Needs Verification`. Workflow does not produce a reply until the source is reachable. |
| **RentVine / LeadSimple / DotLoop unreachable** | Same as above. `Needs Verification` is set and the thread waits. |
| **Mobile mislabels or duplicates a label** | Reviewer cleans up on desktop. Threads do not get sent or routed until exactly one current state label is present. |

### 8.4 Onboarding the operators

Dan and Bailey have no learning curve beyond:

- Reading the `06 Admin Setup and Operating Instructions` doc once.
- Running through five historical owner threads each before the pilot (see §15.2).
- Knowing where to drop a question that the system did not handle (the Open Gaps sheet).

No formal training session is required. Total operator ramp time target: under 60 minutes per person.

---

## 9. Required Integrations

### 9.1 Gmail (primary surface)

| Requirement | Detail |
|---|---|
| Labels | Create the nine Owner Router labels in §7. |
| Filters | Create filters from Bailey's confirmed owner sender list (§18, decision point D2). At minimum: `From: contains any owner email or domain → apply Owner Router / New, skip Inbox = no, mark important = no.` |
| Manual override | Dan and Bailey can apply or change any Owner Router label on any thread. |
| Saved searches | One saved search per state label, documented in Admin Setup. |
| Multiple Inboxes (optional) | Desktop-only accelerator; cannot be required. |
| Mobile compatibility | Labels and filters function identically on Gmail mobile. |

### 9.2 Gemini in Gmail (AI assistance layer, never source of truth)

| Requirement | Detail |
|---|---|
| Plan eligibility | Workspace admin confirms Dan's and Bailey's accounts have eligible Gemini access in Gmail before launch. |
| Admin controls | Workspace admin enables required Gemini features for both accounts. |
| Smart features | Smart features in Workspace are enabled for both accounts; the Admin Setup doc notes that disabling them disables Gemini in Gmail experiences. |
| Language | English only for v1, to align with documented Suggested Replies personalization. |
| Draft verification | All AI-generated drafts are reviewed before send. The Admin Setup doc states explicitly that Gemini suggestions may be inaccurate and are never authoritative on legal, financial, medical, or other professional matters. |
| Sources inspection | When Gemini surfaces a Sources panel for a draft personalization or response, the reviewer inspects the cited messages or Drive files before relying on them. |
| Outage behavior | If Gemini is unavailable, the workflow falls back to the prompt pack. No step in the workflow may be blocked by Gemini outage. |

### 9.3 Help me write

| Requirement | Detail |
|---|---|
| Prompt specificity | The prompt always includes: owner-email category, requested action, tone instruction, and source basis. |
| Missing-fact handling | If the prompt lacks a verified fact, the resulting draft must contain a `Needs Verification: <fact>` placeholder rather than a guessed value. |
| Tone | The prompt requests Dan's brief, direct, practical owner-facing tone, drawing on the approved Tone Examples doc (§10). |
| Send | Reviewer edits before send. |

### 9.4 Suggested Replies

| Requirement | Detail |
|---|---|
| Treated as convenience, not core | Suggested Replies may be absent on any given thread depending on admin and plan; the workflow does not depend on them. |
| Always edit | Dan or Bailey edits before send. |
| Verify factual content | Any factual statement in a suggested reply is verified against an approved source before send. |
| Fallback | Help me write or the prompt pack. |

### 9.5 Owner Router Gem (preferred) or copy-paste prompt pack (fallback)

| Requirement | Detail |
|---|---|
| Name | `PMI KC Metro Owner Router`. |
| Knowledge sources | Attach only the approved Reply Patterns doc, the Routing Rules sheet, the Dan Voice and Tone Examples doc, and the Open Gaps sheet (read-only context). |
| Behavior contract (see §12.3) | Summarize the thread; identify owner-email category; extract requested action; identify missing facts; recommend one state label; draft a reply only when source basis is sufficient; mark missing facts as `Needs Verification`; never invent rent amounts, fees, deadlines, vendor decisions, maintenance approvals, or owner commitments. |
| Knowledge hygiene | Raw transcripts, unedited drafts, or unapproved notes are never attached. Only cleaned, Dan-approved content. |
| Versioning | Drive knowledge files are the live source; Gems use the current Drive version. |
| Fallback | If Gems are not available in Dan's Gmail surface, create the equivalent `Owner Router Prompt Pack` Google Doc with one copy-paste prompt per category. Same behavior contract applies. |

### 9.6 Google Drive (knowledge layer)

Folder: `Owner Router - PMI KC Metro`. Access restricted to Dan, Bailey, and the implementer. (Chastity is granted **Viewer** in v1 per §13.1; she does not receive label or send authority.)

If a Drive folder currently exists under the old name `Owner Inbox Router - PMI KC Metro`, the implementer renames it to `Owner Router - PMI KC Metro` during setup. This rename is reflected in the KB's `SPACE_DRIVE_FOLDER_IDS` and in the Admin Setup doc.

| File | Type | Owner |
|---|---|---|
| `01 Reply Patterns - Approved` | Doc | Bailey drafts; Dan approves. |
| `02 Dan Voice and Tone Examples` | Doc | Dan + Bailey. |
| `03 Routing Rules` | Sheet | Bailey. |
| `04 Source Links and SOP Inventory` | Sheet | Bailey. |
| `05 Open Gaps and Unsupported Cases` | Sheet | Bailey (during pilot). |
| `06 Admin Setup and Operating Instructions` | Doc | Implementer creates; Bailey maintains. |

No additional files in v1. Adding a file requires Dan and Bailey approval.

### 9.7 Google Sheets

Two pilot-critical sheets live in the Drive folder above:

**`03 Routing Rules` columns** (one row per approved category):

| Column | Required? | Notes |
|---|---|---|
| Category | Yes | One per row. |
| Description | Yes | Plain-language definition. |
| Common sender type | Yes | Owner, owner spouse, agent, vendor copied by owner, etc. |
| Required source before reply | Yes | Thread, prior thread, Drive doc, Sheet, RentVine, LeadSimple, DotLoop, human verification. |
| Default reviewer | Yes | `Dan` or `Bailey`. |
| Required next-state label | Yes | Must match §7. |
| Downstream action | Yes | None, LeadSimple task, RentVine note/check, Sheet update, DotLoop check, call owner. |
| Approved reply pattern link | Yes when available | Link to a section in `01 Reply Patterns - Approved`. |
| Must escalate when | Yes | Trigger conditions for `Dan Decision`. |
| Never say without approval | Yes | Per-category anti-hallucination guardrail. |
| Owner-fill gaps | Yes when unresolved | For unsupported categories. |

**`05 Open Gaps and Unsupported Cases` columns:**

| Column | Required? |
|---|---|
| Date logged | Yes |
| Gmail thread link | Yes |
| Owner / sender | Yes |
| Apparent category | Yes if guessable, otherwise `Unclear` |
| Unresolved question | Yes |
| Who needs to answer | Yes (Dan, Bailey, Leia, Dan + Bailey, etc.) |
| Resolution / decision | Filled at review |
| Status | `Open`, `In review`, `Resolved`, `Will not address` |

### 9.8 LeadSimple

| Requirement | Detail |
|---|---|
| No API write-back in v1 | No Zapier, no custom integration. |
| Manual handoff | When an owner thread requires execution, the reviewer creates or updates the LeadSimple task or shared-inbox assignment by hand, then sets the thread to `Owner Router / Route to LeadSimple` until the task is created, and updates the state label after. |
| Routing rules | Each category specifies whether a LeadSimple handoff is required. |
| Future integration | Direct LeadSimple write-back is a separate discovery item, not part of v1 (see §20). |

### 9.9 RentVine

| Requirement | Detail |
|---|---|
| Verification source | Any reply involving rent, lease dates, owner-ledger status, tenant status, maintenance ticket, or property details is verified in RentVine or the relevant Sheet before send. |
| No write-back in v1 | The Router never writes to RentVine. |
| Tenant boundary | If an owner thread results in a tenant message, the tenant message is sent from RentVine, not Gmail. |
| Source notation | The draft explicitly indicates `Verified in RentVine on <date> by <reviewer>` for ledger, rent, or maintenance facts. |

### 9.10 DotLoop

| Requirement | Detail |
|---|---|
| Verification source | If the owner asks about signed documents, renewal docs, lease docs, or signature status, the reviewer checks DotLoop before replying. |
| No document drafting automation | The Router never generates or edits DotLoop documents in v1. |
| No legal summarization | Drafts do not summarize lease terms or legal obligations unless Dan has reviewed and approved that specific summary. |

### 9.11 Apps Script (optional, scoped)

The implementer **may** create an Apps Script in the Workspace to reduce manual setup. The script's permitted scope is:

| Permitted | Forbidden |
|---|---|
| Auto-create the nine `Owner Router / *` labels at setup. | Sending mail of any kind. |
| Populate header rows in the `03 Routing Rules` and `05 Open Gaps` sheets at setup. | Applying or changing labels on existing threads. |
| Run the three weekly health-check searches (threads in `New` > 48h; threads in `Needs Verification` > 5d; threads in `Waiting on Owner` > 14d) and email a digest to Bailey **using Bailey's own account, not a service account, and only as an internal informational summary**. | Writing to RentVine, LeadSimple, DotLoop, QuickBooks, or any operational sheet outside the Router Drive folder. |
| Generate the saved-search URLs documented in §8.1. | Reading thread bodies, attachments, or thread content beyond label metadata. |

The Apps Script is **optional**: if the implementer skips it, all steps remain doable manually. The Admin Setup doc documents whether the script is in use and how to disable it.

---

## 10. Approved Reply Pattern Templates

The `01 Reply Patterns - Approved` doc must include one section per category below. Each section includes: required fields the draft must populate, hard rules, anti-hallucination guardrails, and at least one example sent email reviewed and approved by Dan.

### 10.1 Owner renewal decision request

**Required fields:** owner name; property address; current rent; lease end date; proposed rent or range; source for comp data; decision requested; response deadline; whether Dan must approve before send.

**Hard rule:** No rent amount, no increase recommendation, and no renewal/non-renewal statement may be generated without verified source data from the Renewals sheet, RentVine, comp screenshots, the PMI Free Rental Analysis output, or Dan/Bailey approval.

### 10.2 Owner renewal follow-up

**Required fields:** property address; prior outreach date; decision still needed; deadline basis; consequence of no response (if and only if Dan or Bailey pre-approved this language).

**Hard rule:** Do not invent urgency. Use only the deadline framing approved by Dan or Bailey.

### 10.3 Owner maintenance approval

**Required fields:** property address; work order or issue summary; vendor or bid details if available; tenant impact if source-backed; required owner decision; whether Dan must decide.

**Hard rule:** Do not approve vendor, cost, timeline, or scope unless Dan or an approved source confirms. Default label: `Dan Decision`.

### 10.4 Owner onboarding question

**Required fields:** owner name; property address; onboarding step; requested or missing item; source link to the onboarding sheet or PM agreement step.

**Hard rule:** Do not claim onboarding is complete unless the onboarding sheet or PM agreement confirms it.

### 10.5 Owner accounting / disbursement / bill question

**Required fields:** owner name; property or portfolio; question type; RentVine or Sheet verification needed; whether Leia must confirm.

**Hard rule:** Every accounting answer is marked `Needs Verification` until the relevant accounting source has been checked. Dollar amounts in the draft are placeholders until verified.

### 10.6 Owner general question / edge case

**Required fields:** owner question; known answer source; decision owner; escalation path.

**Hard rule:** If the question is not covered by an approved reply pattern, the draft routes to `Dan Decision` or `Bailey Review` and a row is logged in Open Gaps.

---

## 11. Data Model: Owner-Thread Record Fields

A thread "record" lives implicitly across the Gmail thread, its Owner Router label, and (when applicable) its Open Gaps row. The fields below are mandatory whenever a thread is being acted on.

| Field | Required? | Rule |
|---|---|---|
| Gmail thread link | Yes | Permalink to the source thread. |
| Owner name | Yes if available | Do not invent. Use `Owner unknown` if absent. |
| Property address | Yes if available | If absent, mark `Missing property source`. |
| Email category | Yes | Must match a row in `03 Routing Rules`. |
| Requested action | Yes | Extracted from the email or marked `Unclear`. |
| Decision owner | Yes | Dan, Bailey, Chastity (post-pilot only), Leia, Shane, Estelle, or an external party. |
| Deadline | Yes if explicit | Do not infer deadlines unless the source states them. |
| Source basis | Yes when a fact is asserted | Thread, prior thread, Drive doc, Sheet, RentVine, LeadSimple, DotLoop, or human verification with name and date. |
| Reply draft | Yes if replyable | Editable; placeholders for unverified facts (`Needs Verification: <fact>`). |
| Next-state label | Yes | Must match §7. |
| Downstream action | Yes | None, LeadSimple task, RentVine check/note, Sheet update, DotLoop check, call owner. |
| Open question | Yes if unresolved | Required whenever source is incomplete. |
| Sent? | Yes after close | Human-confirmed only. |

These are the only fields the implementer must support. No additional database or queue layer is built in v1.

---

## 12. Source Verification and Anti-Hallucination Rules

### 12.1 Allowed source types

| Source | When acceptable |
|---|---|
| Current Gmail thread | For what the owner asked, prior owner statements in the same thread, and direct owner instructions. |
| Prior Gmail thread | For owner history when surfaced by Gmail search or by Gemini's prior-message lookup. |
| `01 Reply Patterns - Approved` and `02 Tone Examples` | For reply pattern and tone only. |
| Other Drive docs (e.g., SOPs) | Only if listed in `04 Source Links and SOP Inventory` and approved for that category. |
| Google Sheets | Only the Sheets listed in `04 Source Links and SOP Inventory` (renewals, onboarding, move-in, move-out, payments, bills, vendor, scorecard). |
| RentVine | For tenant / property / lease / owner-ledger / work-order facts. |
| DotLoop | For document status, signature status. |
| LeadSimple | For shared-inbox task or delinquency status when relevant. |
| Human verification | For Dan / Bailey / Leia-confirmed facts not documented elsewhere. Logged with name and date in the draft and, when consequential, in Open Gaps. |

### 12.2 Hard source rules

1. The Router never fabricates a rent amount, lease date, fee, vendor name, owner instruction, tenant status, payment status, legal deadline, or document status.
2. Any factual claim that depends on RentVine, DotLoop, LeadSimple, or a Sheet is labeled `Needs Verification` until the reviewer checks it.
3. When Gemini surfaces a Sources list, the reviewer inspects each cited message or file before relying on it.
4. Attachments are manually opened and read in v1. AI Inbox is not used because it does not support attachments.
5. No legal, financial, or professional-advice wording from Gemini output is treated as authoritative. Google's own warning applies and is included in the Admin Setup doc.

### 12.3 Approval and behavior contract (non-negotiable)

1. The workflow is approval-only.
2. AI never sends email.
3. AI never creates owner commitments.
4. AI never approves pricing, maintenance scope, vendor assignment, legal action, financial adjustments, payment status, refund status, or document status.
5. AI never invents facts missing from the thread or approved sources.
6. Every reply is source-backed or explicitly marked `Needs Verification: <fact>`.
7. Drafts preserve Dan's owner-facing tone only after the Tone Examples doc has been populated and approved.
8. When confidence is low, the thread routes to `Dan Decision` or `Bailey Review` instead of producing a definitive answer.
9. Attachments are manually reviewed before any factual response that references them.
10. Unrecognized categories are logged in Open Gaps.

### 12.4 Cross-spec uncertainty wording

The Router uses `Needs Verification: <fact>` as the verbatim placeholder string for any fact requiring later confirmation. This wording is identical to the KB's placeholder convention (Spec 1 §9.2), so the team learns one vocabulary, not two. The Router does **not** use the KB's five-state retrieval enum (Verified / Partial / Placeholder / Conflict / No Source) at runtime — those states are KB Ask-flow constructs — but the underlying anti-hallucination contract is the same.

---

## 13. Permissions, Privacy, and Security

### 13.1 Permissions and ownership

| Area | Owner | Rule |
|---|---|---|
| Send authority | Dan and Bailey (Bailey only for Dan-pre-approved categories) | No one else sends Owner Router replies in v1. |
| Reply patterns | Bailey drafts, Dan approves | Reviewed before pilot. |
| Tone Examples | Dan + Bailey | Approved sent-email examples only. |
| Gmail filters | Implementer sets up; Bailey maintains | Documented in Admin Setup. |
| Label taxonomy | Dan + Bailey approve | No renames without updating Routing Rules. |
| Drive folder | Dan owns or delegates admin ownership | Access restricted to Dan, Bailey, and the implementer. |
| Owner Router Gem / prompt pack | Implementer creates; Bailey maintains | Approved Drive docs only. |
| Open Gaps | Bailey owns during pilot | Reviewed at end of pilot. |
| Chastity access | Dan + Bailey decide | v1 default: view-only on the Drive folder, no Gmail label sharing, no send authority. Chastity's KB Approver role does **not** transfer here. |
| LeadSimple, RentVine, DotLoop ownership | Existing process owners | v1 does not change their permissions. |

### 13.2 Privacy

- All owner emails, drafts, summaries, and source documents remain inside the existing PMI KC Metro Google Workspace. No external systems are introduced.
- Smart features must be enabled for Gemini features to function; the Admin Setup doc states this trade-off plainly.
- Sensitive content (financial details, tenant PII) is not extracted from Gmail into Drive in v1. References are linked, not copied.

### 13.3 Security

- 2FA enabled on Dan's, Bailey's, and the implementer's Google accounts.
- The Drive folder is restricted to those three users plus Chastity (view-only).
- No service account keys; no third-party connectors; no Zapier.

### 13.4 Rollback

If the Router needs to be paused at any point:

1. Disable the Gmail filters.
2. Stop applying Owner Router labels to new threads.
3. Pause the Gem / prompt pack from being used.
4. Existing labeled threads remain labeled (no data loss); reviewers process them manually outside the pilot.

Rollback never deletes the Drive folder, the labels, the filters, or the Gem. It only suspends new automation.

### 13.5 Observability

V1 has no metrics dashboard. Observability is manual and lightweight:

- Bailey reviews label counts each morning (one glance at the Gmail sidebar gives `New`, `Dan Decision`, `Draft Ready`, `Needs Verification` totals).
- Open Gaps row count is the leading indicator of category coverage gaps.
- The Admin Setup doc lists three saved searches that act as health checks: threads in `New` older than 48 hours, threads in `Needs Verification` older than 5 days, threads in `Waiting on Owner` older than 14 days. Each gets a weekly review. The optional Apps Script can compile these into a weekly digest (§9.11).

---

## 14. Architecture and Data Flow

The Router is intentionally lightweight. Gmail web and Gmail mobile are the only required operating surfaces. Gemini in Gmail may assist with summary and drafting when available, but the workflow must remain fully usable without any optional AI feature.

### 14.1 Components

| Component | Role | Required? |
|---|---|---|
| Gmail (web + mobile) | Operating surface | Yes |
| Owner Router label tree (9 labels) | Thread state model | Yes |
| Gmail filters | Initial intake routing | Yes |
| `Owner Router - PMI KC Metro` Drive folder | Knowledge layer (6 files) | Yes |
| Owner Router Gem | Convenience drafting aid | Optional (preferred when Gems available) |
| Owner Router Prompt Pack doc | Fallback drafting aid | Required when Gem unavailable; otherwise Optional |
| Gemini in Gmail | AI assistance layer | Optional |
| Help me write | AI assistance for drafts | Optional |
| Suggested Replies | AI assistance for one-tap drafts | Optional |
| Multiple Inboxes | Desktop visual layout | Optional |
| Apps Script | Setup helper + health-check digest | Optional |

### 14.2 Data flow for a single owner thread

```
Owner email arrives → Gmail filter matches sender →
  label = Owner Router / New →
  reviewer opens thread →
  (optional) Gemini summary →
  reviewer classifies category from Routing Rules →
  reviewer verifies facts against approved sources →
  (optional) Gemini drafts via Help me write / Gem / Prompt Pack →
  reviewer edits in Gmail compose (Needs Verification for any unverified fact) →
  reviewer applies new label (Draft Ready / Dan Decision / Needs Verification / etc.) →
  (optional) downstream manual action in LeadSimple / RentVine / DotLoop / Sheet →
  reviewer sends manually OR routes to Dan →
  reviewer applies final label (Waiting on Owner / Closed / etc.) →
  (conditional) reviewer logs row in Open Gaps if category or policy was missing
```

No data flows leave Google Workspace. No service writes to RentVine, LeadSimple, DotLoop, QuickBooks, or any other system. Every external action is a human in the existing system's UI.

---

## 15. Testing and Verification Strategy

The v1 build is configuration plus content, not application code, so "testing" means: (a) configuration verification, (b) historical-thread dry runs that act as the unit tests, and (c) live pilot acceptance.

### 15.1 TDD-style approach for configuration

For each configuration artifact, write the expected behavior first, then build the artifact to satisfy it, then verify by replay.

| Artifact | Test written first | Verification |
|---|---|---|
| Owner Router labels | "A test thread receives label `Owner Router / New` when manually applied." | Apply label to a test thread on Dan's and Bailey's accounts on web and mobile. |
| Owner sender filter | "A real owner email from sender X received in the last 30 days, replayed, would land in `New`." | Search Gmail for a known owner email; verify the filter rule would match it. |
| Routing Rules sheet | "Every approved category has a unique row with all required columns filled." | Sheet-level review by Bailey, signed off by Dan. |
| Reply Patterns doc | "Every approved category has a section with required fields, hard rules, and one approved example." | Dan reads and approves each section. |
| Gem / prompt pack | "Given a synthetic owner email from each category, the Gem produces a summary, a category guess, a routing recommendation, and a draft or `Needs Verification` — without inventing facts." | Run three historical threads per category through the Gem and inspect outputs. |
| Anti-hallucination behavior | "Given an owner email asking for a rent amount that is not in any source, the Gem refuses and recommends `Needs Verification` instead of guessing." | Synthetic adversarial test thread executed by implementer. |
| Mobile parity | "Dan can label, draft, edit, and send from his actual phone." | Implementer observes Dan completing one full loop on mobile. |
| Optional Apps Script | "Apps Script auto-creates the nine labels and populates the two sheets' headers but cannot send mail, change existing labels, or write outside the Router Drive folder." | Implementer runs the script in a sandbox account first; verifies scope. |

### 15.2 Historical-thread dry runs (pre-pilot acceptance)

Before pilot start, Dan and Bailey each run **five historical owner threads** through the workflow end-to-end (intake → label → summarize → classify → source-check → draft → edit → send → route → close). The threads must include at least one from each of the six categories in §10, plus at least two known edge cases.

A historical-thread dry run passes when:

- The state label progression matches what a reviewer would have chosen at the time.
- Every factual claim in the draft is traceable to an approved source.
- Any missing fact is marked `Needs Verification`.
- The downstream action (LeadSimple task, RentVine note, Sheet update, etc.) is identified correctly.

The pilot does not start until all 10 dry runs pass.

### 15.3 Live pilot acceptance criteria

During the pilot, the workflow is considered acceptable when the success criteria in §16 hold. If any criterion fails for two consecutive review windows, the pilot pauses for a corrective review.

---

## 16. Success Criteria and Acceptance Tests

### 16.1 Success criteria

| Criterion | Observable outcome |
|---|---|
| Dan reads fewer threads from scratch | ≥80% of handled owner threads were summarized by Gemini in Gmail or by an approved prompt before action. |
| Owner threads have visible next states | 100% of handled owner threads carry exactly one current `Owner Router` state label. |
| Drafting is faster but still reviewed | Every reply sent during the pilot has a documented draft origin (Help me write, Suggested Replies, Gem, prompt pack, or approved template) and was human-edited. |
| Unsupported facts are not invented | Zero replies sent during the pilot contain a rent amount, fee, deadline, vendor commitment, maintenance approval, or financial statement that was not source-verified. The pilot is paused if even one is found. |
| Bailey's knowledge is captured | All six canonical Drive files (§9.6) exist, are version-controlled, and have at least one Bailey-authored entry per supported category. |
| No new operational surface is added | No standalone app, no new database, no new dashboard. The workflow runs entirely inside Gmail + Drive + Sheets + Docs. |
| LeadSimple stays downstream, not duplicated | Each LeadSimple handoff during the pilot is a manual reviewer action, not an automated write. |
| Scope holds | The pilot handles only owner email. No tenant, vendor-only, lease-document, or financial-ledger automation is introduced. |

### 16.2 Acceptance tests (pass/fail)

| Test | Pass condition |
|---|---|
| Owner thread is filtered | A known owner email lands in `Owner Router / New` automatically. |
| Non-owner thread is not pulled in | Tenant, vendor-only, or general email is not labeled unless manually included. |
| Thread can be summarized | Gemini summary or AI Overview is available; if not, manual summary is acceptable and noted. |
| Draft can be generated | An editable reply is created via Help me write, Suggested Replies, Gem, or prompt pack. |
| Missing fact is flagged | A draft missing a verified rent amount, deadline, or vendor detail shows `Needs Verification`, not a guessed value. |
| Accounting question is blocked from premature send | A draft does not assert a ledger, payment, or disbursement value without source verification. |
| Maintenance approval is blocked from premature send | A draft does not approve cost, vendor, or scope without Dan or an approved source confirming. |
| Renewal thread routes correctly | An owner renewal response moves to the correct state label; if applicable, the renewal Sheet and RentVine next steps are noted. |
| LeadSimple handoff is manual and visible | Reviewer identifies when to create or update a LeadSimple task; no automation creates one silently. |
| Mobile parity | Dan can label, summarize (where available), draft, edit, change state, and send from his phone. |
| Open gap is captured | An unsupported owner email is logged in `05 Open Gaps and Unsupported Cases` with thread link, owner, and the unresolved question. |
| Rollback works | The implementer can disable filters and labels and the workflow stops cleanly with no data loss. |
| Tone consistency | Drafts use only tone elements present in `02 Dan Voice and Tone Examples`. |
| No autonomous send exists | The implementer demonstrates that no rule, filter, Gem, script, or add-on can send mail without explicit human action. |

All 14 tests must pass before the pilot begins.

---

## 17. Launch-Readiness Checklist

| Item | Owner | Required before pilot? |
|---|---|--:|
| Confirm Dan's and Bailey's Workspace / Gemini eligibility | Workspace admin | Yes |
| Confirm 2FA is enabled on Dan's, Bailey's, and implementer's Google accounts | Implementer | Yes |
| Enable required Workspace smart features | Workspace admin | Yes |
| Confirm Gmail Gemini features appear on Dan's and Bailey's web Gmail | Implementer | Yes |
| Confirm Gmail mobile feature availability on Dan's actual phone | Dan + implementer | Yes |
| Confirm Gmail mobile feature availability on Bailey's phone | Bailey + implementer | Yes |
| Create Owner Router labels on Dan's and Bailey's accounts | Implementer | Yes |
| Create owner sender / domain filter set from Bailey's list | Bailey + implementer | Yes |
| Create the `Owner Router - PMI KC Metro` Drive folder with all six files (rename existing folder if needed) | Implementer | Yes |
| Populate `01 Reply Patterns - Approved` with the six approved categories | Bailey | Yes |
| Dan signs off on each reply pattern | Dan | Yes |
| Add 25–50 approved sent-email examples to `02 Dan Voice and Tone Examples` | Dan + Bailey | Yes |
| Populate `03 Routing Rules` (one row per approved category, all columns filled) | Bailey | Yes |
| Populate `04 Source Links and SOP Inventory` | Bailey | Yes |
| Create empty but headered `05 Open Gaps and Unsupported Cases` | Bailey | Yes |
| Write `06 Admin Setup and Operating Instructions` (labels, filters, prompts, smart-feature settings, mobile setup, rollback procedure, Apps Script status) | Implementer | Yes |
| Create the Owner Router Gem with approved knowledge files | Implementer | Yes |
| If Gems unavailable, create the prompt-pack doc and link from Admin Setup | Implementer | Yes |
| (Optional) Run Apps Script in scoped sandbox first; verify it cannot send or mutate threads | Implementer | If Apps Script is in use |
| Run 10 historical owner threads (5 with Dan, 5 with Bailey) and pass all acceptance tests | Dan + Bailey + implementer | Yes |
| Demonstrate no autonomous send exists | Implementer | Yes |
| Define and document LeadSimple manual-handoff trigger conditions per category | Dan + Bailey | Yes |
| Define and document RentVine verification trigger conditions per category | Dan + Bailey | Yes |
| Define and document accounting verification rule (Leia involvement) | Dan + Bailey + Leia if needed | Yes |
| Define pilot review cadence | Dan + Bailey | Yes |
| Pilot scoped to owner email only | Dan + Bailey | Yes |
| Chastity access decision recorded (default: view-only on Drive, no send authority) | Dan + Bailey | Yes |

---

## 18. V1 Decision Points and Bounded Defaults

Every open question is resolved here with a recommended v1 default and a statement of what changes if the answer is different. The pilot does not wait for these; it runs on the default and adapts only where the default proves wrong.

| ID | Question | V1 Default | Why this default | What changes if different |
|---|---|---|---|---|
| D1 | What owner-email categories exist on day one? | The six categories in §10: Renewal Decision, Renewal Follow-up, Maintenance Approval, Onboarding Question, Accounting / Disbursement, General / Edge Case. | They map directly to the workflow areas confirmed in the transcripts. | Additional categories are added to Routing Rules with Dan + Bailey approval; not as a blocker. |
| D2 | What owner sender / domain list seeds the Gmail filters on day one? | Bailey supplies a starter list of known owner senders (export from RentVine owner contacts or her existing folder routing). Expect to miss 10–20% of senders the first two weeks. | Aligns with how Bailey already routes owner mail manually. | If RentVine export is unavailable, Bailey provides the list manually from her recent owner mail. |
| D3 | Which owner emails bypass Bailey and go straight to `Dan Decision`? | Maintenance approvals, vendor-cost approvals, lease-document decisions, owner termination notices, and any email from senders Dan tags as "Dan only." | These all touch Dan-only authority (vendor, legal, financial, scope). | Dan can expand or contract the bypass list at any time. |
| D4 | Which owner emails can Bailey answer without Dan? | Renewal follow-ups using approved templates, onboarding-status updates verifiable in the onboarding sheet, scheduling and availability replies, status confirmations sourced from RentVine or Sheets, and general clarification questions covered by an approved Reply Pattern. | These are the categories with established templates and a clear source basis. | Dan can pull any category back to `Dan Decision` at any time. |
| D5 | What accounting questions require Leia before reply? | Any owner question involving a specific dollar amount, ledger detail, disbursement, fee, refund, or batch payment allocation. Draft may be framed by Bailey; dollar figures are placeholders until Leia confirms. | Aligns with the manual reconciliation reality in the transcripts. | If Leia's availability changes, the verification can shift to Dan with the same hard rule. |
| D6 | What maintenance questions require Dan before reply? | Any reply involving cost approval, vendor selection, scope, or schedule. | Dan is the documented sole decision-maker. | Unchanged in v1. |
| D7 | Which onboarding questions can be answered from the onboarding sheet alone? | Status of utilities, insurance, keys, lockboxes, air filter sizes, lease takeover, deposits — when the onboarding sheet has a non-empty value. Anything still "red" routes to `Bailey Review`. | Sheet-backed answers are safe; missing values are not. | Dan and Bailey can tighten or loosen this per row. |
| D8 | Which Sheets are approved sources for owner replies? | Renewals, Onboarding, Move-in, Move-out, Payments-received, Bills/Invoice, Vendor, Late-tenant, and Tenant Scorecard sheets — all listed in `04 Source Links and SOP Inventory`. | These are the sheets the team already trusts as source of truth. | Adding or removing a sheet requires a `04 Source Links` update. |
| D9 | Which RentVine facts must be checked before reply? | Rent amount, lease end date, owner-ledger status, tenant status, work-order status, and any property fact not already in an approved Sheet. | RentVine is the CRM; these are the facts it owns. | Unchanged in v1. |
| D10 | Which DotLoop statuses can be reported to owners, and by whom? | Signature status and document existence may be reported by Bailey or Dan after a direct DotLoop check. Lease-term substance may not be summarized without Dan approval. | DotLoop is the only document signature source; lease substance is a Dan-review item. | Unchanged in v1. |
| D11 | Does LeadSimple need a task for every operational follow-up, or only some? | Create a LeadSimple task whenever the owner email triggers tenant-facing action, vendor outreach, accounting reconciliation, or document workflow. Pure informational replies do not require a task. | Matches the existing shared-inbox model without overloading it. | The rule can be tightened or loosened per category in Routing Rules. |
| D12 | Who maintains Reply Patterns while Bailey is unavailable? | Dan is owner. Edits during Bailey's absence are draft-only by Chastity (comments in Drive); Dan approves changes. | Preserves the approval chain through any Bailey absence. | If Dan delegates, the new approver is named in Admin Setup. |
| D13 | What role does Chastity have during v1 pilot? | View-only access to the Drive folder; no Gmail label sharing; no send authority. She observes the workflow but does not operate it. (She **is** a KB Approver per Spec 1; Router authority is separate.) | Avoids permissioning her into Router authority before Dan and Bailey have evaluated. | Permissions upgrade requires Dan + Bailey written approval and a Routing Rules update. |
| D14 | Does Dan's Workspace plan include all required Gemini features? | Verify before launch (Launch Readiness checklist). | Plan eligibility is precondition. | If features are missing, fall back to the prompt-pack flow; the workflow still works without Gemini. |
| D15 | Does Dan use iOS or Android primarily? | Verify on Dan's actual phone during Launch Readiness. The workflow must work on both. | The transcripts do not specify. | If a feature behaves differently across platforms, the Admin Setup doc documents the difference. |
| D16 | Are owner emails handled through delegated or shared inboxes? | v1 pilots only Dan's personal owner-facing Gmail and Bailey's Gmail. LeadSimple shared inbox is out of pilot scope. | The shared inbox is under-adopted; piloting both surfaces would dilute results. | If a delegated mailbox is later required, scope expansion is a separate decision. |
| D17 | Are attachments common in owner emails? Of what type? | Bailey samples 20 recent owner threads during setup and records typical attachment types in `04 Source Links`. v1 assumes PDFs, lease addenda, photos, and invoices may appear. | The transcripts do not quantify this. | If a specific attachment type dominates, it gets its own handling note in Admin Setup. |
| D18 | What is the fallback when Gemini is unavailable or wrong? | Use the Owner Router Gem; if Gems are unavailable, copy-paste from the prompt-pack doc into Gemini, ChatGPT, or Claude (Dan already uses each). If output is wrong, reviewer drafts manually from the approved Reply Patterns. | The workflow must never be blocked by AI unavailability. | If outages become frequent, the prompt pack becomes the primary path. |
| D19 | What pilot review cadence? | Mid-pilot review after two weeks of live operation; post-pilot review after four weeks. Trigger an early review if more than 3 new categories appear in Open Gaps in a single week. | Aligns with practical observation windows. | Dan and Bailey may extend by 1–2 weeks based on the mid-pilot review. |
| D20 | Does AI Inbox get tested at all in v1? | No. AI Inbox is out of scope per Google's documented limitations. | Eliminates a beta dependency. | Tested only after v1, and only as a convenience layer, never as the source of truth. |
| D21 | Is a small Apps Script used for label creation or housekeeping? | **Yes (optional, per §9.11).** Implementer creates and uses Apps Script for setup-time label creation, sheet header population, and a weekly health-check digest. Apps Script cannot send mail, change labels on existing threads without operator action, or write to RentVine / LeadSimple / DotLoop. | Saves implementer time, no operational risk if scoped correctly. | If skipped, all steps are still doable manually. |

---

## 19. Explicit Non-Goals (Restated, with Reasons)

To prevent scope drift, the following are confirmed out of scope for v1 and must not be added without a new spec revision approved by Dan and Bailey:

- Building a standalone web app, queue dashboard, or custom UI on top of Gmail.
- Any form of autonomous send, including "send after X seconds unless cancelled."
- LeadSimple API write-back, RentVine write-back, DotLoop document generation, or QuickBooks integration.
- Tenant-facing message generation in Gmail (tenant communication stays in RentVine).
- Renewal comp lookup automation against Zillow or the PMI Free Rental Analysis tool.
- Lease-document review automation.
- Vendor selection or maintenance approval automation.
- Owner-specific memory or profile fields beyond what fits in the Routing Rules and Reply Patterns.
- Meeting action-item extraction or Fathom integration.
- AI Inbox or Gmail Live as required surfaces.
- Onboarding offshore staff (Leia, Shane, Estelle) or the LeadSimple shared inbox into the pilot.
- Adding Chastity as an active Router operator before Dan and Bailey have approved her role.

Each of these is a real opportunity the team has discussed; each is a separate discovery item to be sequenced after v1 proves useful.

---

## 20. Implementation Guidance to Prevent Drift (binding)

This product is unusually easy to over-build. The following guidance is binding for the implementer:

1. **Do not build a standalone app.** The product is Gmail-native. If the implementer is tempted to build a queue UI, a dashboard, or a reviewer screen, stop and re-read §5 (Confirmed Context) and §14 (Architecture).
2. **Do not enable any rule, script, filter, add-on, or Gem behavior that can send mail without an explicit human click.** Demonstrate the absence of autonomous send in the Launch Readiness checklist.
3. **Do not add Drive files outside the six canonical ones.** Additional context goes in those files or in linked rows of the existing sheets, not in new files.
4. **Do not add Gmail labels outside the nine in §7** without a Routing Rules update and Dan + Bailey approval.
5. **Do not depend on Gemini for the workflow to function.** Every step must have a non-AI fallback. Test this by completing one full loop with Gemini disabled.
6. **Do not depend on AI Inbox, Gmail Live, or any beta feature** that Google does not document as generally available on Dan's plan.
7. **Do not pull tenant or vendor email into the pilot.** Adding a tenant filter or labeling a tenant thread breaks the boundary.
8. **Do not write to RentVine, LeadSimple, DotLoop, QuickBooks, or any operational system** from the Router. The Router only reads (manually) and routes (manually).
9. **Do not auto-process attachments.** Open them manually. Do not assume Gemini's interpretation of an attachment is authoritative.
10. **Do not onboard Chastity into Router operator authority** without an explicit Dan + Bailey signoff recorded in the Admin Setup doc.
11. **If a category is missing**, log it in Open Gaps; do not invent a routing path on the fly.
12. **If a tone example is missing**, do not generate one. Tone Examples doc must be Dan-approved before drafts are produced at scale.
13. **Treat the Routing Rules sheet and the Reply Patterns doc as the binding source of behavior.** The Gem is a convenience layer over them, not the other way around.
14. **Test on mobile, every time.** A change that breaks mobile parity is a regression even if it works on desktop.
15. **When in doubt, label `Needs Verification` and stop.** The cost of an unnecessary verification is far lower than the cost of a wrong owner-facing statement.
16. **The Apps Script (if used) is bounded by §9.11.** Any expansion of its scope requires updating this spec and Dan + Bailey approval.

The success of v1 is measured not by feature count but by whether Dan opens his phone, sees a labeled owner queue, drafts and edits with confidence, sends with one click, and the team can let the system hold steady.

---

## 21. Edge Cases and Error Handling

| Condition | Expected behavior |
|---|---|
| Filter misses an owner email | Reviewer manually applies `Owner Router / New` and adds the sender to the filter list. |
| Multiple state labels on one thread | Reviewer cleans up on desktop; thread does not proceed until exactly one label is current. |
| Owner replies to an already-`Closed` thread | Reviewer changes label back to `New` (or directly to `Dan Decision` / `Bailey Review` based on content). |
| Gemini outputs a citation that does not exist | Reviewer ignores the citation and either verifies the fact from an approved source or marks `Needs Verification`. |
| Owner asks about tenant matter | Reviewer composes the tenant message in RentVine, not Gmail; Gmail thread is labeled `Waiting on Team` until the tenant response cycles back. |
| Owner sends an attachment | Reviewer opens it manually. Drafts do not reference attachment content unless reviewer has read it. |
| Bailey is unavailable | Threads needing her review accumulate in `Bailey Review`. Dan may move any to `Dan Decision` and handle directly. Chastity (in v1) does not act on Router threads unless Dan + Bailey have approved an explicit operator upgrade. |
| Dan delegates a category to Bailey mid-pilot | Routing Rules sheet updated; Admin Setup doc updated; the change is dated. |
| A Drive file is unreachable | Reviewer pauses, labels `Needs Verification`, escalates to implementer or Dan. |
| Apps Script encounters an error | Script logs the error; no labels or sheets are mutated; reviewer is notified by the next health-check digest. |

---

## 22. Acceptance Checklist (Verification)

This is the implementer's pre-pilot checklist. Each item must pass before Dan and Bailey begin live use.

- [ ] Owner Router label tree created on both Dan's and Bailey's Gmail accounts (web verified, mobile verified).
- [ ] Gmail filters created from Bailey's owner-sender list; tested against ≥ 3 recent owner threads.
- [ ] `Owner Router - PMI KC Metro` Drive folder created (renamed from `Owner Inbox Router - PMI KC Metro` if applicable). All six canonical files present.
- [ ] `01 Reply Patterns - Approved` complete for all six categories; each section Dan-signed-off.
- [ ] `02 Dan Voice and Tone Examples` contains 25–50 approved sent-email examples.
- [ ] `03 Routing Rules` complete (one row per category, all required columns).
- [ ] `04 Source Links and SOP Inventory` complete and aligned with current Sheets the team uses.
- [ ] `05 Open Gaps and Unsupported Cases` exists with header row only.
- [ ] `06 Admin Setup and Operating Instructions` complete (labels, filters, prompts, smart-feature settings, mobile setup, rollback procedure, Apps Script status).
- [ ] Owner Router Gem created OR Owner Router Prompt Pack doc created (one of the two). Gem prefers the prompt pack as fallback.
- [ ] (If Apps Script is in use) Apps Script tested in sandbox; verified it cannot send, cannot mutate existing threads' labels, cannot write outside the Router Drive folder.
- [ ] 14 acceptance tests in §16.2 pass.
- [ ] 10 historical-thread dry runs (5 with Dan, 5 with Bailey) pass per §15.2.
- [ ] Demonstration to Dan and Bailey: no rule, filter, Gem, script, or add-on can send mail without an explicit human click.
- [ ] Chastity access set to Drive Viewer only; no Gmail label sharing; no send authority. KB Approver role is independent.

---

## 23. Traceability Notes (Source Basis)

This spec was synthesized from the following inputs:

- **Old technical Router spec** (`dan_email_triage_spec.md`): provided the bulk of behavioral detail — 11-step workflow, 9 labels, 6 reply pattern categories, 6 canonical Drive files, source-verification rules, 14 acceptance tests, Launch Readiness checklist, 21 decision points, 10 non-goals, 15 implementation guidance items.
- **Deep-research Router summary** (`deep-research-report-dan-email-triage-spec.md`): provided the refined alignment framing, the cross-product boundary statements (Router does not depend on KB; KB Editor/Approver role does not grant Router access), and the explicit cross-spec uncertainty wording (`Needs Verification: <fact>`).
- **Spec 1 (KB)**: defines how the KB reads the Router's Drive folder; this spec enforces the read-only direction.
- **Spec 3 (north star)**: governs the business boundary between the Router and the KB; this spec implements that boundary at the runtime level (Router does not call KB; KB cannot mutate Router state).
- **Spec 4 (implementation meta)**: governs build sequence, launch gates, and configuration; this spec satisfies those gates.
- **Transcripts and analysis** (`pmi_-_call_1.md`, `pmi_-_call_2.md`, `transcript_analysis.md`): used as background context for team roles, workflows, and operational realities — particularly the "emails, dude, emails" framing, the tenant-vs-owner channel separation, RentVine as system of record, and Bailey's renewal workflow detail.

### Cross-spec consistency rules respected in this document

- The Router's Drive folder is canonically named `Owner Router - PMI KC Metro` (renamed from `Owner Inbox Router - PMI KC Metro` if it exists under that old name).
- Anti-hallucination wording: `Needs Verification: <fact>` is identical to the KB's placeholder convention.
- Chastity is a **KB Approver** (Spec 1 §11.1) but **not** a Router operator in v1 (this spec D13).
- Apps Script is **kept** in v1 as a scoped, optional implementer accelerator (per E1 = (a) in clarification).
- The implementer is the same person who builds the KB (per F1 = (a) in clarification).
- No calendar-week deadlines; only launch gates (per C1).

### Open questions remaining

None blocking. Categories beyond the six in §10 are intentionally deferred to the Open Gaps mechanism per D1.

---

*End of Spec 2.*
