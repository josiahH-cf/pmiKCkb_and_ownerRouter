---
spec_id: spec-3
document_type: Operating North Star
version: v1
status: implementation-ready
governs: spec-1-technical-spec.md (PMI KC KB), spec-2-technical-spec.md (Owner Router)
implementation_meta: spec-4-implementation-meta-implementation-spec.md
---

# Spec 3 — Operating North Star

This document is the authoritative business-and-behavior contract that governs both **PMI KC KB** (Spec 1) and the **Owner Router** (Spec 2). It is one of four aligned specifications. Where Spec 1 and Spec 2 define **how** each product is built, this document defines **what each product is for, how the two work together, what they may never do, and how a human or model verifies that both stay aligned over time**.

This spec does not introduce new features. It binds the two products to a single operating model so that no implementation decision in either product can quietly violate the team's intent. If a future edit to Spec 1 or Spec 2 conflicts with this document, this document wins and the offending edit is rolled back.

---

## 1. Purpose

PMI KC Metro needs two distinct, separately-implemented products that together change how knowledge and owner communication flow through the business:

1. **PMI KC KB** captures, organizes, edits, approves, and serves the team's operational knowledge as a source-backed, internal Q&A application.
2. **Owner Router** triages, verifies, drafts, and routes owner email inside Gmail with explicit human send authority.

The north star is not "ship two AI products." The north star is:

> **The team's operational knowledge is captured, source-backed, and easy to find; owner communication is faster and verifiable; Bailey is no longer a single point of failure; no decision, send, or system-of-record change is ever made without a human in the loop.**

Every choice in Spec 1 and Spec 2 must serve this outcome. If a feature would speed something up by removing the human or by inventing facts to fill gaps, it does not ship.

---

## 2. Business Operating Model

### 2.1 What the business looks like today (baseline)

- ~160 doors across the Kansas City metro, run primarily out of Blue Springs, MO.
- Operating knowledge lives across Bailey's memory, Fathom recordings, Google Sheets, Gmail, RentVine, LeadSimple, DotLoop, Boom, QuickBooks-adjacent flows, and ad-hoc Google Docs.
- Bailey is the operational gravity well. New questions, edge cases, and process clarifications route through her.
- Dan's stated single largest time drain is owner email.
- Google Sheets is the de facto operational source of truth; the team trusts it more than the underlying SaaS systems.
- The team rejects fully autonomous behavior for owner communication, lease-document review, vendor selection, screening, and financial actions.
- Existing AI helpers in the stack (Rent Engine showings assistant, LeadSimple delinquency cadence) are welcomed because they augment specific tasks, not because they replace judgment.

### 2.2 What the business looks like at end-state of these two products

- Any team member can answer a process question without interrupting Bailey. If the answer is not yet captured, the question becomes a visible, owned placeholder rather than an invented response.
- Dan opens his phone, sees a labeled owner queue, drafts and edits with confidence, sends with one click. The volume of "Dan reads it from scratch" emails drops sharply.
- Bailey's knowledge for owner communication lives in six canonical files in a shared Drive folder, version-controlled, and is referenced from both products.
- Bailey's process knowledge lives in the KB as approved SOPs, templates, tool links, and Fathom recordings.
- Chastity, Estelle, Shane, Leia, and Bailey have a single internal product (the KB) to find process answers — and the KB and the Router speak one anti-hallucination vocabulary.
- The two products operate independently at runtime. The KB can go down without affecting owner email. The Router can go down without affecting knowledge.

### 2.3 How the two products serve the operating model

| Concern | PMI KC KB | Owner Router |
|---|---|---|
| Primary audience | Whole team (Dan, Bailey, Chastity, Estelle, Shane, Leia) | Dan and Bailey (Chastity view-only on Drive in v1) |
| Primary unit of work | A question, an SOP, a template, a tool link, a placeholder | An owner email thread |
| Output | A cited answer, an editable draft, or an explicit "No Reliable Source Found" with capture task | A labeled, source-backed, human-edited reply ready to send |
| System of record? | No. Sources of record stay where they are (RentVine, Sheets, LeadSimple, DotLoop, etc.). | No. Owner email lives in Gmail; tenant comms stay in RentVine. |
| Decision authority | None. Surfaces information; humans decide. | None. Drafts replies; humans send. |

---

## 3. End-State Behavior (Definition of Done for Both Products)

### 3.1 End-state behavior for the KB

- Signed-in users at `kb.bluespringspropertymanagementinc.com` can ask any operational question and receive either a cited, source-backed answer with handling steps and an editable draft, **or** a clearly labeled "No Reliable Source Found" response with a one-click capture task for Bailey, Dan, or another owner.
- The whole team can browse Spaces, drop a Drive doc into a Space's folder, and have it become searchable within minutes.
- Approvers (Dan, Bailey, Chastity) can move SOPs, templates, and resolved placeholders through the in-app Approval Queue.
- Approval-queue activity reaches Approvers via Gmail with the `KB Approval` label. A V1.5 hook is reserved for one-click approve-by-email.
- The KB indexes the Owner Router's Drive folder read-only; KB users can cite the Router's `Reply Patterns` and `Routing Rules` when answering owner-email questions.

### 3.2 End-state behavior for the Owner Router

- Every owner email entering Dan's Gmail receives an `Owner Router / *` state label, either automatically by filter or manually.
- Dan and Bailey can summarize, classify, draft, verify, and label owner threads from Gmail web and Gmail mobile.
- Every reply is drafted with AI assistance (Gemini in Gmail, Help me write, Suggested Replies, the Owner Router Gem, or the prompt pack), edited by a human, and sent manually.
- Any factual claim in a draft is traceable to the Gmail thread, an approved Drive doc, an approved Sheet, RentVine, LeadSimple, DotLoop, or a logged human verification — otherwise the draft is marked `Needs Verification`.
- The six canonical files (`01 Reply Patterns - Approved`, `02 Dan Voice and Tone Examples`, `03 Routing Rules`, `04 Source Links and SOP Inventory`, `05 Open Gaps and Unsupported Cases`, `06 Admin Setup and Operating Instructions`) exist, are version-controlled in the Drive folder, and have at least one Bailey-authored entry per supported category.

### 3.3 Cross-product end-state behavior

- The KB and the Owner Router operate independently at runtime. Either can be down without affecting the other.
- The KB **reads** the Owner Router's Drive folder via Vertex AI Search; it never writes to it. This is enforced in IAM, not just by convention.
- The Owner Router never calls the KB. The Router operates entirely from Gmail + the Router's Drive folder + the Gem / prompt pack.
- Operator authority does not transfer between products. A KB role does not grant Owner Router authority and vice versa.
- The team uses **one anti-hallucination vocabulary**: `Needs Verification: <fact>` is the verbatim placeholder string in both products. KB Source States (Verified / Partial / Placeholder / Conflict / No Source) exist only inside the KB's Ask flow, but the underlying contract is identical.
- Drafts in both products always carry the verbatim banner `Draft — Review before sending`.

---

## 4. How the Two Applications Work in Tandem

The KB and the Owner Router are **separate implementations, joined at four narrow seams**. Each seam is one-way, read-only, or vocabulary-only. Together, the seams provide alignment without coupling.

### 4.1 The four seams

| # | Seam | Direction | Mechanism |
|---|---|---|---|
| 1 | The KB reads the Owner Router's Drive folder | KB ← Router (read-only) | KB's "Owner Email" Space binds a Vertex AI Search data store to the `Owner Router - PMI KC Metro` Drive folder. KB service identity has `drive.readonly` scope on the folder. |
| 2 | Shared anti-hallucination vocabulary | None (convention) | Both products use `Needs Verification: <fact>` as the verbatim placeholder string; both use `Draft — Review before sending` as the verbatim draft banner. |
| 3 | Shared user identity and approval discipline | None (convention) | Both products require Google sign-in within the `pmikcmetro.com` Workspace. Both rely on Dan, Bailey, and Chastity as the human approval anchors for content they each control. |
| 4 | Common operator (the implementer) | None (operational) | The same person builds, configures, and administers both products. This is an operational seam, not a runtime one. |

### 4.2 The seams in plain language

- **The KB can quote the Router; the Router cannot quote the KB.** A KB user can ask "what's the renewal follow-up template?" and see the Router's `01 Reply Patterns - Approved` as a citation. A Router user asking a similar question reads `01 Reply Patterns - Approved` directly in Drive. The Router does not call the KB.
- **Both products refuse to invent facts the same way.** If a KB answer or an Owner Router draft would have to assert an unverified fact, both products produce the same visible placeholder: `Needs Verification: <fact>`. Drafts in both products carry the same banner: `Draft — Review before sending`.
- **A user's role in one product does not grant authority in the other.** Chastity, for example, is an Approver in the KB and view-only in the Router. Bailey is an Approver in both, but with different categories of send authority in each. Permission changes happen in the product that owns them.
- **The same builder runs both products.** Single operator means single mental model for setup and maintenance, but the products themselves never share runtime, deploy together, or fail together.

### 4.3 What the seams explicitly are not

- The seams are **not** a microservices boundary, a shared event bus, or a synced database. There is no message queue, no webhook, no shared schema.
- The seams **never** transmit owner PII from the Router into the KB beyond what the Router has already chosen to write into its own Drive folder. The KB indexes only what the Router has published as canonical knowledge.
- The seams are **not** an excuse to merge the products. If a future change feels like "we should just put the Router state inside the KB," the answer is no — the boundary is the product, and removing it removes the safety properties (independent failure, role separation, scope discipline).

---

## 5. User-Facing Examples

Examples below are illustrative and treated as canonical for the alignment they demonstrate. Each example walks through the same situation as the team would experience it.

### 5.1 KB scenario: a known process

> Estelle is processing a maintenance work order and is unsure how to handle photo requests from the tenant.

1. Estelle opens the KB, types: *"How do I request photos for a maintenance work order from a tenant?"*
2. The KB grounds against the "Maintenance Work Order Intake" Space, returns:
   - Source state: **Verified Source**.
   - Direct answer with handling steps.
   - Citations: the approved SOP, the RentVine link, and the photo-request template.
   - Editable draft of the tenant message (copy-to-clipboard).
3. Estelle copies the draft, opens RentVine, pastes, edits names/property, sends from RentVine.

This example demonstrates: a source-backed answer; a copy-to-clipboard draft; the KB never sending; the tenant message staying in RentVine (the team's operational reality, not bypassed by the AI).

### 5.2 KB scenario: a gap

> Shane is screening a new applicant and asks the KB about a niche income-verification edge case Bailey has not yet documented.

1. Shane types: *"How do we handle income verification when an applicant works two part-time jobs and pays one in cash?"*
2. The KB grounds against the Screening / Leasing Space. No source exceeds the confidence threshold.
3. The KB returns: source state **No Reliable Source Found**. No invented answer. A "Send capture task to Dan" button is presented.
4. Shane clicks the button, fills the short capture form. A Placeholder is created in the Screening Space. The placeholder appears in the Approval Queue.
5. Dan opens the Approval Queue, fills in the answer, marks Approved. Next time Shane asks the same question, the KB returns a **Verified Source** with Dan's answer cited.

This example demonstrates: refusal to invent; visible owned placeholder; the Approval Queue as the path from gap to knowledge; the team learning the same anti-hallucination behavior in plain experience.

### 5.3 Owner Router scenario: a routine renewal follow-up

> An owner whose lease is up in 60 days replies "yes, raise the rent."

1. Filter labels the thread `Owner Router / New`.
2. Bailey opens the thread on Gmail mobile.
3. Gemini in Gmail summarizes; AI Overview confirms the renewal decision.
4. Bailey classifies the thread as "Owner renewal decision request" per the Routing Rules.
5. Bailey verifies the proposed rent against the Renewals sheet and RentVine.
6. Bailey uses Help me write with a prompt that includes property address, current rent, proposed rent, and decision deadline. The draft references the approved Renewal Follow-up reply pattern.
7. Bailey edits two lines. Sends.
8. Bailey applies `Owner Router / Waiting on Team` (LeadSimple task created manually) and `Owner Router / Closed` once the LeadSimple task is in place.

This example demonstrates: mobile parity; AI-assisted drafting; verified facts from RentVine and the Renewals sheet; human send; manual downstream action in LeadSimple; the Router never writing to LeadSimple or RentVine.

### 5.4 Owner Router scenario: a maintenance approval that must wait for Dan

> An owner emails: "I need to know what you decided about the HVAC bid."

1. Filter labels `Owner Router / New`.
2. Bailey opens; Gemini summary shows the owner is asking about cost approval.
3. Routing Rules: any reply involving cost approval, vendor selection, scope, or schedule → `Dan Decision`.
4. Bailey applies `Owner Router / Dan Decision`. No draft is generated, because the hard rule for maintenance approval is "do not draft a cost statement without Dan's approval."
5. Dan opens the thread on his phone, makes the decision, drafts via Help me write referencing the approved Maintenance Approval reply pattern, sends.

This example demonstrates: routing to `Dan Decision` instead of generating a draft; hard-rule enforcement before drafting; mobile send by Dan.

### 5.5 Owner Router scenario: an accounting question that must wait for verification

> An owner emails: "What was the disbursement amount on March 15? It looks low."

1. Filter labels `Owner Router / New`.
2. Bailey opens; Gemini summary identifies an accounting question.
3. Routing Rules: any owner question involving a specific dollar amount → verify before reply. Default: route to Leia for confirmation.
4. Bailey applies `Owner Router / Needs Verification`. Drafts a reply with the dollar amount as `Needs Verification: <fact>`. The draft says: "I'm pulling the exact figures and will follow up shortly."
5. Bailey sends the holding reply. Applies `Owner Router / Waiting on Team`.
6. Leia confirms the figure; Bailey drafts the actual reply with the verified amount; Bailey sends; applies `Owner Router / Closed`.

This example demonstrates: the `Needs Verification` placeholder protecting against an invented dollar figure; an explicit team handoff; the holding-reply pattern; final label after the chain completes.

### 5.6 Cross-product scenario: a KB user asking an owner-email question

> Chastity, who is a KB Approver but not a Router operator, wants to know what the standard renewal-follow-up template looks like.

1. Chastity opens the KB Ask page.
2. She types: *"What's the standard owner renewal follow-up template?"*
3. The KB grounds against the "Owner Email" Space (read-only mirror of `Owner Router - PMI KC Metro`).
4. The KB returns: source state **Verified Source**, with the relevant section of `01 Reply Patterns - Approved` cited.
5. The KB displays the answer and an editable draft (copy-to-clipboard).
6. Chastity reads the pattern. She does **not** send the email — she has no Router operator authority and the KB never sends.

This example demonstrates the four seams in action: the KB reads the Router's folder (seam 1); the anti-hallucination vocabulary is shared (seam 2); roles do not transfer (seam 3); the same admin manages both (seam 4, not visible to Chastity).

---

## 6. Model-Facing Examples (Model Alignment Guide)

This section is the binding behavior contract for any LLM, agent, or AI feature used inside either product, including future models the team adopts. The examples are written for a model to read; humans verifying behavior should compare model output against them.

### 6.1 KB Ask model behavior

**Prompt situation:** A grounded retrieval against the Lease Renewals Space returns two approved sources discussing the renewal outreach cadence.

**Correct behavior:**
- `source_state = "Verified Source"`
- `answer` summarizes the cadence in 2–4 sentences.
- `citations` references both source IDs, both present in the grounding metadata.
- `handling_steps` lists the operational steps.
- `draft` provides an editable owner-facing message starting with `Draft — Review before sending` and using only facts present in the retrieved sources.
- No claim is made that is not supported by a cited source.

**Incorrect behavior (any of these is a hallucination violation):**
- Citing a third source not in grounding metadata.
- Asserting a specific notice window, fee, or rent amount not present in retrieved sources.
- Producing a generic property-management answer when retrieval was weak instead of returning `No Reliable Source Found`.
- Omitting the draft banner.

### 6.2 KB Ask model behavior on a missing source

**Prompt situation:** A grounded retrieval returns zero documents above the confidence threshold.

**Correct behavior (enforced before the answer model is called):**
- `source_state = "No Reliable Source Found"`
- `answer` is a brief, neutral acknowledgement that the question has no documented answer.
- `escalation_owner` is the appropriate person (per the SOP escalation routing).
- `draft` is empty or omitted.

**Incorrect behavior:**
- Generating a confident answer.
- Citing sources that were not returned by grounding.
- Refusing to surface the capture task.

### 6.3 Owner Router model behavior (Gemini in Gmail, Gem, or prompt pack)

**Prompt situation:** An owner has emailed asking whether their HVAC bid was approved. The retrieved Drive context includes the Maintenance Approval reply pattern, which states "do not approve vendor, cost, timeline, or scope unless Dan or an approved source confirms; default label: `Dan Decision`."

**Correct behavior:**
- The model summarizes the thread.
- The model classifies the category as "Owner maintenance approval."
- The model **does not produce a draft that approves the bid**. Instead, it produces a draft asking for time to confirm with Dan, or produces no draft at all and signals `Dan Decision`.
- The model marks any cost figure as `Needs Verification: <fact>`.

**Incorrect behavior (any of these triggers a pilot pause per Spec 2 §16.1):**
- Drafting "Yes, you're approved" because the email seems to imply prior agreement.
- Inventing a bid amount, vendor name, or schedule.
- Producing a draft that asserts cost or vendor without Dan's explicit prior approval.
- Omitting the `Needs Verification` placeholder for an unverified figure.

### 6.4 Owner Router model behavior on unrecognized categories

**Prompt situation:** An owner emails about a category not covered by the six approved reply patterns.

**Correct behavior:**
- The model does **not** invent a routing recommendation.
- The model recommends `Owner Router / Dan Decision` or `Bailey Review` (per the General/Edge Case pattern) and recommends an Open Gaps entry.
- The draft, if any, sticks to clarifying questions and contains no operational commitments.

**Incorrect behavior:**
- Inventing a new category.
- Drafting a substantive response.
- Marking the thread `Closed` or `Draft Ready` without source basis.

### 6.5 Model alignment contract (binding across both products)

The following rules apply to every model call in either product. They are encoded in prompts, validated server-side where possible, and reviewed by humans where not.

1. Never assert a fact that is not present in the retrieved sources (KB) or in the thread / approved Drive files / verified system of record (Router).
2. Never invent a citation, a source, a sender, an owner, a property address, a rent amount, a fee, a deadline, a vendor name, a vendor cost, a tenant status, a payment status, a document status, a legal deadline, a maintenance approval, or an owner commitment.
3. Always include the verbatim banner `Draft — Review before sending` on any draft. The banner is not configurable.
4. Always use `Needs Verification: <fact>` (verbatim) for any unsupported factual placeholder.
5. Never produce a confident answer when retrieval / source is weak; downgrade explicitly to `No Reliable Source Found` (KB) or to `Dan Decision` / `Needs Verification` (Router).
6. Never produce a generic property-management answer in place of a missing PMI KC Metro process or pattern.
7. Never send mail. Never apply or change a label on an existing thread. Never write to a system of record (RentVine, LeadSimple, DotLoop, QuickBooks, operational Sheets, the Owner Router Drive folder from the KB side).
8. Treat tone examples as the only authoritative source of voice. If tone examples are absent, do not stylize.
9. Treat attachments as unread until a human reads them. Do not assume the model's interpretation of an attachment is authoritative.

If a model output violates any of these rules, the violation is recorded as a regression and the eval set is extended to prevent recurrence (see §8).

---

## 7. Human Verification Guide

This section equips Dan, Bailey, Chastity, or any future reviewer to verify that both products are still aligned with this north star, without reading the technical specs.

### 7.1 The five "look-for" questions

A human reviewer can verify alignment by checking, in order:

1. **Does every answer cite a source or say there isn't one?** Open the KB. Ask five questions, including one you know has no documented answer. Confirm: every answer either lists clickable sources or says `No Reliable Source Found` with a capture task. If a confident answer appears without a source, alignment has broken.
2. **Does every reply have a human send?** Open the Owner Router state in Gmail. For five recent `Closed` threads, confirm: the reply was sent by Dan or Bailey, edited from a draft, and the draft origin (Gemini, Gem, prompt pack, or pattern) is identifiable. If any reply was sent without a human edit, alignment has broken.
3. **Is the boundary visible?** Ask the KB an owner-email question. Confirm: it cites the Router's `Reply Patterns` or `Routing Rules` doc. Then ask the Router (via Gemini in Gmail) a non-owner question. Confirm: it does not invent a KB-style response; it either declines or sticks to the owner-email frame.
4. **Is the placeholder vocabulary intact?** Look at a recent KB answer where the source state is Partial or Placeholder. Look at a recent Router draft that has unverified facts. Confirm: both use `Needs Verification: <fact>` verbatim. If the wording diverges, vocabulary alignment has broken.
5. **Is the Open Gaps / Approval Queue depth shrinking, growing, or flat?** Count `Open Gaps` rows and `In Review` items each week. Trend should be downward as the team captures knowledge. Sustained growth signals capture isn't keeping up; a flat line for many weeks signals the products may be under-used.

If any of the five questions fails, this north star is the recovery contract — return the offending product to compliance, not the other way around.

### 7.2 What the human reviewer does **not** need to verify

- Code quality, framework choice, or hosting provider — all governed by Spec 1 and Spec 4.
- Specific Vertex AI Search settings, Gemini model versions, or Cloud Run configuration — governed by Spec 1 and Spec 4.
- Gmail filter syntax or label naming — governed by Spec 2 and Spec 4.
- Exact eval-set composition — governed by Spec 1 and Spec 4.

The human reviewer's job is to verify the **behavior contract**, not the implementation details.

### 7.3 What to do when alignment breaks

1. **Pause the affected product if the violation is on the send / write side.** Specifically: any reply sent with an invented fact, any KB answer asserting an uncited claim, any system-of-record write from either product.
2. **Capture the failure as a regression case.** Add it to the KB eval set (if KB) or to the Open Gaps sheet (if Router).
3. **Repair the source basis.** If the violation came from a missing source, the gap is filled in the appropriate product. If it came from a model behavior change, the prompt or the model parameters are corrected.
4. **Re-run the five "look-for" questions.** Resume operation only when all five pass.
5. **Update this north star or one of the four specs only if the violation reveals a missing rule.** Do not update the docs to retroactively permit a violation.

---

## 8. Cross-Spec Consistency Rules (Binding)

These rules apply across Spec 1 and Spec 2. They are the structural integrity of the system.

### 8.1 Naming and vocabulary

- The KB product is canonically named **PMI KC KB**. Short form: **KB**. Old names (Bailey Knowledge Transfer Assistant, Bailey KTA, PMI KC Metro Knowledge Base) are deprecated; if found in any artifact, they are replaced.
- The Router product is canonically named **Owner Router**. Old names (Dan Owner Inbox Router, Owner Inbox Router) are deprecated and replaced wherever they appear, including in the Drive folder name (the folder becomes `Owner Router - PMI KC Metro` at setup).
- The verbatim placeholder string is `Needs Verification: <fact>` in both products.
- The verbatim draft banner is `Draft — Review before sending` in both products.

### 8.2 Approval anchors

- **Approvers:** Dan, Bailey, Chastity.
  - In the KB, all three can mark items Approved.
  - In the Router, Dan is the final approver and primary sender; Bailey is the operator and sender for pre-approved categories; Chastity is view-only on the Drive folder in v1 with no Router operator authority.
- A change to who is an Approver in either product requires Dan + Bailey approval and is recorded in the affected spec.

### 8.3 Send and write boundaries

- The KB never sends owner, tenant, vendor, or applicant email. It sends internal `KB Approval` notifications only.
- The Owner Router never sends mail without an explicit human send. The Router never writes to RentVine, LeadSimple, DotLoop, QuickBooks, or any operational Sheet.
- The KB has `drive.readonly` scope on the Router's Drive folder. It has **no** write scope there. Enforced in IAM.
- The Router does not call the KB. The KB reads the Router's Drive folder; the Router does not depend on the KB.

### 8.4 Source-state and verification

- KB source states are: Verified Source, Partial Source, Bailey Placeholder, Conflict Found, No Reliable Source Found.
- The Router does not use this enum at runtime, but it follows the underlying contract: any unsupported fact is replaced with `Needs Verification: <fact>`, and unsupported categories route to `Dan Decision` or `Bailey Review` and are logged in Open Gaps.
- An eval set of ≥ 50 question/expected-state pairs runs in CI for the KB. The Router has 14 acceptance tests in Spec 2 §16.2 that play the equivalent role.

### 8.5 Roles do not transfer between products

A user's role in one product does not grant authority in the other. Examples:

- Chastity is a **KB Approver** and a **Router view-only-on-Drive** participant in v1. The KB role does not promote her to Router operator.
- A KB Editor (Estelle, Shane, Leia) has no Router authority. They may benefit from KB answers that cite Router files, but they do not act on Router threads.
- The implementer is **Admin** in both products. This is the only cross-product role; it is operational (setup and maintenance), not a runtime permission elevation.

### 8.6 V1.5 hooks

- Email-based KB approval is reserved as V1.5. The forward-compatible pieces are specified in Spec 1 §17 D-10 (`change_log.actor_via_email_token` field reserved; `KB Approval` label created at setup; `gmail.send` scope already granted; email template structured for V1.5).
- The Router has no V1.5 hook beyond the optional Apps Script weekly health-check digest.

### 8.7 Launch gates, not calendar dates

- Each product launches by **gate**, not by date. The gates are defined in Spec 1 §16 and Spec 2 §17.
- No calendar-week deadline appears in any of the four specs. Sequencing is governed by Spec 4.

### 8.8 Simplest thing that works

- When two designs both satisfy the spec, the implementer picks the one with fewer moving parts.
- Nothing in this north star authorizes the implementer to drop a feature on simplicity grounds. Simplicity is a tie-breaker, not a scope reducer.

---

## 9. North-Star Principles (Five Rules That Govern Every Edit)

If any future change to either product or to any of these four specs would violate one of these rules, the change is rejected.

### 9.1 Source-backed or stop

Neither product produces a confident answer or a draft based on a fact the system cannot back to an approved source. When source is weak, the system surfaces a visible placeholder and an owned next action — never a fabricated answer.

### 9.2 Human review before external communication

Nothing leaves either product to an owner, tenant, vendor, or applicant without explicit human edit and send. The Router has no autonomous send. The KB has no external send at all. Internal `KB Approval` notifications are the only auto-generated email in either product.

### 9.3 Existing systems of record stay in place

RentVine, LeadSimple, DotLoop, QuickBooks, Boom, Sheets, Gmail, Drive — these remain authoritative. Neither product replaces them, syncs to them, or duplicates their state. Both products read manually, route manually, and ask humans to make the change in the system that owns the data.

### 9.4 Dan-only judgment stays with Dan

Vendor selection, maintenance approval, lease-document substance, screening decisions, financial actions — these are Dan's. The Owner Router routes them to `Dan Decision`; the KB does not produce confident drafts on these without Dan-approved source basis. Bailey, Chastity, the offshore team, and any AI feature in either product respect this boundary.

### 9.5 Separate implementations stay separate

The KB and the Owner Router are two products that share a team and a vocabulary, not a runtime. The four seams in §4 are narrow on purpose. Future requests that would merge the products are rejected at this contract level.

---

## 10. Failure Modes (What Misalignment Looks Like)

If any of these patterns appears, alignment has broken and must be repaired before further use.

| Failure mode | What it looks like | First response |
|---|---|---|
| **Confident hallucination in KB** | A KB answer asserts a fact (rent, fee, deadline, vendor) with no source attached. | Pause the Ask flow; add the failed prompt to the eval set; verify retrieval and prompt are intact; do not ship a "looser" prompt as a fix. |
| **Owner reply sent with an invented fact** | A Router reply quotes a dollar amount, vendor name, or deadline that was not in source. | Pause the Router pilot; recover the affected owner relationship manually; add the failure as an Open Gaps entry; verify the category's hard rules in Routing Rules. |
| **KB writes to Router folder** | A KB action mutates a file in `Owner Router - PMI KC Metro`. | Revoke the KB service identity's write access to that folder (which should not exist in the first place); audit IAM; restore the Router files from Drive version history. |
| **Router calls KB at runtime** | A scheduled job, Apps Script, or Gem call queries the KB Ask endpoint. | Remove the call; the Router does not depend on the KB. The KB Ask endpoint is for in-app use only. |
| **Operator authority crosses products** | A KB Editor begins acting on Router threads without Dan + Bailey approval. | Revoke the authority; restore the Router permission model; capture the misstep in Admin Setup. |
| **Vocabulary drift** | A draft says "TBD" instead of `Needs Verification: <fact>`, or a banner is missing. | Restore the verbatim wording; update prompts; add a vocabulary test to the eval set. |
| **Calendar-date constraints reappear** | A spec edit reintroduces a "must be done by [date]" requirement. | Reject the edit; the project operates on gates, not dates (per Spec 3 §8.7). |
| **Tenant or vendor email pulled into Router pilot** | A tenant thread receives an `Owner Router / *` label. | Remove the label; the Router is owner-email-only in v1. |
| **Standalone-app drift in Router** | An implementer begins building a UI on top of Gmail for the Router. | Stop; the Router is Gmail-native (Spec 2 §20). The Drive folder is the canonical state alongside Gmail labels. |
| **Generic property-management answers** | Either product returns a plausible-sounding answer not derived from PMI KC Metro sources. | Treat as a hallucination violation; restore source-backed-or-stop. |

The cost of misalignment in any of these modes is much higher than the cost of slowing down. The recovery sequence is always: stop, verify, repair, resume.

---

## 11. Q&A and Resolved Gaps

This section records the cross-spec questions that were open before alignment, and the decisions taken.

| # | Question | Decision (v1) | Rationale |
|---|---|---|---|
| Q-1 | Should the KB and Router merge into one product? | **No.** Separate implementations, joined at the four seams in §4. | The boundary is the product. Removing it removes the safety properties: independent failure, role separation, scope discipline. |
| Q-2 | Should the KB index the Router's Drive folder? | **Yes, read-only.** | Lets KB users cite Router knowledge without leaving the KB, while preserving the Router as the single source of truth for owner-email patterns. |
| Q-3 | Should the Router call the KB Ask API? | **No.** The Router operates standalone. | Eliminates a runtime dependency and a possible failure mode. Router users open `01 Reply Patterns - Approved` directly. |
| Q-4 | Is Chastity an Approver in both products? | **KB Approver. Router view-only on Drive in v1, no operator authority.** | She is a trusted in-office reviewer for knowledge content; promoting her to Router operator before Dan and Bailey have evaluated would introduce permission risk. The Router permissioning may upgrade post-pilot with explicit approval. |
| Q-5 | Does the project run on calendar deadlines? | **No.** Launch gates only. | A specific date would force scope or quality compromises. The team can track dates internally; the specs do not bind to them. |
| Q-6 | Does the KB send email? | **Only internal `KB Approval` notifications.** Drafts are copy-to-clipboard. | Keeps the KB's outbound surface trivially small and preserves Dan / Bailey / Chastity as the actual senders for any external communication. |
| Q-7 | Is V1.5 email-based KB approval built in v1? | **No, but specified.** Schema, label, scope, and email template are forward-compatible. | The future feature is one frontend + one API route away; v1 implementer does nothing extra, but leaves no migration debt. |
| Q-8 | Is Apps Script used for the Router? | **Yes, optional, scoped.** Setup-time label creation, sheet header population, and a weekly health-check digest. No send, no thread mutation, no external writes. | Saves implementer time, no operational risk if scoped correctly. The fallback (skip the script) is fully functional. |
| Q-9 | What is the canonical name for each product? | **PMI KC KB** and **Owner Router**. | One product, one name. Old names are deprecated everywhere. |
| Q-10 | Are the canonical names case-sensitive in code? | Yes. The verbatim placeholder `Needs Verification: <fact>` and banner `Draft — Review before sending` are case-sensitive. Product names appear as written. | Avoids subtle drift in eval sets and acceptance tests. |
| Q-11 | What is the Drive folder name for the Router? | `Owner Router - PMI KC Metro`. If the folder currently exists under the old name `Owner Inbox Router - PMI KC Metro`, it is renamed during setup. | One canonical name; KB configuration relies on it. |
| Q-12 | How many KB Process Spaces ship at launch? | **12.** 11 KB-owned Process Spaces plus the read-only Owner Email Space sourced from the Router's Drive folder. | Permissive v1: capture everything the team needs from day one without losing the cross-product seam. |

---

## 12. Open Questions

There are no open questions blocking v1 build or launch of either product. Items deferred by design (not by uncertainty) are tracked in their respective specs:

- KB phase-2 / V1.5 items: Spec 1 §17 (D-9 Gmail draft creation, D-10 email-based approval, D-15 Gmail content ingestion, D-16 Router-to-KB calls).
- Router phase-2 items: Spec 2 §19 (LeadSimple write-back, RentVine write-back, DotLoop generation, tenant automation, lease automation, vendor automation, AI Inbox, Gmail Live, offshore-staff onboarding to Router, Chastity as active operator).

Anything not listed in those deferred-items sections is not contemplated for v2 yet, and adding it requires a new spec revision.

---

## 13. How This Spec Is Used

- **Before any edit to Spec 1 or Spec 2:** the editor reads §8 (Cross-Spec Consistency Rules) and §9 (North-Star Principles). If the proposed edit would violate either, the edit is rejected at the design level.
- **Before any model upgrade, prompt change, or new AI feature in either product:** the editor reads §6 (Model-Facing Examples) and ensures the new behavior conforms. The eval set is extended to cover the change before the change ships.
- **Before any role or permission change in either product:** the editor reads §8.5 (Roles do not transfer between products). Permission changes happen in the product that owns them, with explicit Dan + Bailey signoff.
- **Before any "wouldn't it be nice if the two products did X together" proposal:** the editor reads §4 (The Four Seams) and §9.5 (Separate implementations stay separate). Adding a fifth seam is allowed only with a new revision to this document approved by Dan, Bailey, and the implementer.
- **During verification:** human reviewers (Dan, Bailey, Chastity, or the implementer) use §7 (Human Verification Guide). Model reviewers (eval set runs, regression suites) use §6 (Model-Facing Examples).

---

## 14. Traceability Notes (Source Basis)

This north star was synthesized from:

- The original conversational north star (`doc3-north-star.md`): the framing of the two-product end-state, the five top-level principles, the orientation toward verifiable outputs over autonomous behavior. This document preserves all of that intent and adds technical precision and verifiability.
- **Spec 1 (PMI KC KB)**: provided the source-state vocabulary, the KB roles, the V1.5 hook semantics, and the read-only Drive folder seam.
- **Spec 2 (Owner Router)**: provided the labels, the six canonical Drive files, the source-verification model, the anti-hallucination contract, and the role separation in the Router.
- **Deep-research alignment documents** (`deep-research-gpt-Bailey_Knowledge_Transfer_Assistant_Source_of_Truth.md`, `deep-research-report-dan-email-triage-spec.md`): provided the cross-product boundary framing and the verbatim shared-vocabulary convention (`Needs Verification: <fact>`).
- **Transcripts and analysis** (`pmi_-_call_1.md`, `pmi_-_call_2.md`, `transcript_analysis.md`): provided business context — Dan's email pain, Bailey's role, RentVine as system of record, the team's explicit rejection of fully autonomous behavior on owner communication, lease review, and financial actions.

This document supersedes any earlier north-star phrasing where it conflicts. The four specs in this project are co-equal in authority; this one resolves cross-product conflicts.

---

*End of Spec 3.*
