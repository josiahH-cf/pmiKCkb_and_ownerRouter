---
spec_id: spec-4
document_type: Implementation and Meta-Implementation Spec
version: v1
status: implementation-ready
governs: spec-1-technical-spec.md (PMI KC KB), spec-2-technical-spec.md (Owner Router)
operating_north_star: spec-3-operating-north-star-spec.md
---

# Spec 4 — Implementation and Meta-Implementation Spec

This document tells the implementer how to take the four specs in this project and turn them into two running products, plus how to keep them running and aligned afterward. It is the procedural counterpart to Spec 3 (the operating north star). Where Spec 3 governs what is allowed, this document governs how the build proceeds.

This spec is also the binding handoff to a coding-capable model (or a human implementer using one). It explains where to look, what to read first, what to scaffold in what order, how to wire the configuration, when to stop and verify, and how to ship without breaking the north star.

If an implementer or model can finish reading this document and the four specs it points at, and then proceed without further questions, the spec set is complete. If a question remains, it is captured in §16 (Open Questions) — not invented in code.

---

## 1. Purpose

The four-spec set serves a single end-to-end deliverable: two implementation-ready, aligned products for PMI KC Metro.

The four specs work together as follows:

| Spec | Role | Audience |
|---|---|---|
| Spec 1 — PMI KC KB | Authoritative technical spec for the KB web app | Implementer (full read), model (build from), Dan / Bailey / Chastity (acceptance) |
| Spec 2 — Owner Router | Authoritative technical / configuration spec for the Gmail-native owner-email workflow | Implementer (full read), Dan / Bailey (acceptance and operation) |
| Spec 3 — Operating North Star | Business / behavioral contract binding both products | All readers; consulted before any edit |
| Spec 4 — This document | Build sequence, scaffold, runbook, configuration, handoff, and maintenance | Implementer (full read), model (build from) |

The implementer reads all four. The model that scaffolds code reads Spec 1, Spec 2, and Spec 4, with Spec 3 loaded as the alignment guardrail. Acceptance reviewers read Spec 3 and the relevant product spec.

---

## 2. Implementation Philosophy

### 2.1 Three rules that govern every implementation decision

1. **Simplest thing that could possibly work — without losing a single feature.** When two designs satisfy the spec, pick the one with fewer moving parts. This is a tie-breaker among compliant designs, not a permission to skip features. Every functional requirement, every acceptance test, every decision point, and every cross-spec rule must be preserved. If the implementer is tempted to drop a feature on simplicity grounds, the answer is no — re-read the spec and pick a simpler design that still satisfies it.
2. **Setup must be repeatable in 4–6 hours by a single implementer.** If a step does not fit into the runbook in §7 in plain language with copy-pasteable commands, the design is wrong, not the documentation.
3. **Nothing in either product is allowed to violate Spec 3.** No prompt change, no model swap, no permission upgrade, no integration addition, no feature deletion can quietly violate the north star. Every change is reviewed against §8 (Cross-Spec Consistency Rules) and §9 (North-Star Principles) of Spec 3 before it ships.

### 2.2 What the implementer is optimizing for

- **Time to first useful Ask in the KB.** Once the implementer can ask the KB a real PMI KC Metro question and get a verified-source answer with a citation, the architecture is correct. Everything else is content.
- **Time to first labeled and human-sent owner email through the Router.** Once Bailey can label, verify, draft, edit, and send an owner email from Gmail mobile using the Router pattern, the workflow is correct. Everything else is content and edge cases.
- **Zero hallucinations under adversarial test.** The eval set in Spec 1 §15.2 and the acceptance tests in Spec 2 §16.2 are not negotiable.
- **One implementer, two products.** The same person sets up and administers both. This is by design (Spec 3 seam 4) and informs everything below.

### 2.3 What the implementer is **not** optimizing for

- Framework purity, exotic architectures, or showcase code. The stack in Spec 1 §12 and the surface in Spec 2 §14 are chosen for the team's reality, not the implementer's preferences.
- New features beyond v1. Decision points in Spec 1 §17 and Spec 2 §18 list everything deferred; nothing else is contemplated.
- A reusable platform. This is a single-tenant build for one Workspace domain. Multi-tenancy is out of scope.

---

## 3. Project Scaffold

### 3.1 Repository layout

The two products live in two separate repositories. Single-repo would couple deployments and violate Spec 3's separate-implementations rule.

```
pmi-kc-kb/                            # PMI KC KB repo (Spec 1)
├── README.md
├── SETUP.md                          # Spec 1 Appendix B runbook
├── .env.template
├── docs/
│   ├── spec-1-technical-spec.md
│   ├── spec-3-operating-north-star-spec.md
│   └── spec-4-implementation-meta-implementation-spec.md
├── infra/                            # Terraform or gcloud scripts
│   ├── main.tf
│   ├── vertex_search.tf
│   ├── firestore.tf
│   ├── cloudrun.tf
│   └── iam.tf
├── app/                              # Next.js App Router
│   ├── (auth)/
│   ├── ask/
│   ├── spaces/
│   ├── approval-queue/
│   ├── admin/
│   └── api/
│       ├── ask/
│       ├── sops/
│       ├── placeholders/
│       └── notify/
├── lib/
│   ├── auth/                         # Firebase Auth + hd enforcement
│   ├── retrieval/                    # Vertex AI Search wrappers
│   ├── llm/                          # Gemini prompt assembly + JSON validation
│   ├── firestore/                    # Data access + security rule helpers
│   ├── citations/                    # Citation validation against grounding metadata
│   └── notify/                       # Gmail send-only client for KB Approval emails
├── components/
│   ├── ask/
│   ├── source-state-banner/
│   ├── space/
│   ├── approval-queue/
│   └── admin/
├── styles/
│   └── tokens.css                    # Brand palette (verified at setup)
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/                          # Playwright critical flows
│   └── eval/                         # ≥ 50 question/expected-state pairs
├── firestore.rules
├── firestore.indexes.json
└── .github/
    └── workflows/
        ├── ci.yml                    # lint, typecheck, unit, integration, eval, build
        └── deploy.yml                # auto-deploy main → staging, manual → production
```

```
pmi-kc-owner-router/                  # Owner Router repo (Spec 2)
├── README.md
├── SETUP.md                          # Router setup runbook (this spec §7.2)
├── docs/
│   ├── spec-2-technical-spec.md
│   ├── spec-3-operating-north-star-spec.md
│   └── spec-4-implementation-meta-implementation-spec.md
├── drive-package/                    # Source-controlled templates for the six canonical files
│   ├── 01-reply-patterns-approved.md
│   ├── 02-dan-voice-and-tone-examples.md
│   ├── 03-routing-rules.csv          # Imported into the Drive sheet
│   ├── 04-source-links-and-sop-inventory.csv
│   ├── 05-open-gaps-and-unsupported-cases.csv
│   └── 06-admin-setup-and-operating-instructions.md
├── gem-and-prompt-pack/
│   ├── owner-router-gem-system-prompt.md
│   └── owner-router-prompt-pack.md   # Fallback if Gems unavailable
├── apps-script/                      # Optional, scoped (Spec 2 §9.11)
│   ├── README.md
│   ├── create-labels.gs
│   ├── populate-sheet-headers.gs
│   └── weekly-health-check-digest.gs
├── gmail-filters/
│   └── owner-sender-filter.xml       # Importable Gmail filter export
└── tests/
    ├── dry-run-historical-threads/   # 10 historical-thread dry run records
    └── acceptance-tests-checklist.md # 14 acceptance tests from Spec 2 §16.2
```

### 3.2 Why two repos

- The KB has a Cloud Run deployment, CI pipeline, automated tests, schema migrations. The Router has none of these — its "build" is configuration plus content.
- Coupling them in a single repo would force the Router's lightweight artifacts through the KB's CI pipeline, slow iteration on Router content, and blur the runtime boundary that Spec 3 §9.5 enforces.
- Both repos reference the same Spec 3 (north star) and the same Spec 4 (this document); the duplication in each repo's `docs/` is deliberate so each repo is self-contained for an outside reader.

### 3.3 What is intentionally not in either repo

- No shared library between KB and Router. They share vocabulary and approval discipline, not code.
- No CI cross-deployment job between the two products.
- No shared environment variables. Each product has its own `.env.template`.
- No shared GCP service account. The KB's Cloud Run service identity is separate from any Apps Script identity used by the Router.

---

## 4. Documentation Map

The implementer should know exactly where each piece of information lives. Duplication is intentional where it serves an outside reader's path of least resistance.

| Topic | Authoritative location | Where else it appears |
|---|---|---|
| What each product does | Spec 1 §1, Spec 2 §1, Spec 3 §1–3 | This spec §1 |
| Why the two are separate | Spec 3 §4 (four seams), §9.5 (separation principle) | Spec 1 §3.1–3.2, Spec 2 §3.1–3.2 |
| Approval anchors (Dan, Bailey, Chastity) | Spec 3 §8.2 | Spec 1 §11.1, Spec 2 §4 |
| Canonical names (PMI KC KB, Owner Router) | Spec 3 §8.1 | Spec 1 frontmatter and §1, Spec 2 frontmatter and §1, Spec 4 throughout |
| Anti-hallucination vocabulary (`Needs Verification: <fact>`, `Draft — Review before sending`) | Spec 3 §8.1 | Spec 1 §9.2, Spec 2 §12.4 |
| Decision points and v1 defaults | Spec 1 §17 (D-1 to D-16), Spec 2 §18 (D1 to D21) | Cross-referenced in §11 of this spec |
| Functional requirements (KB) | Spec 1 §11 (F-1 to F-33) | Spec 1 §15.5 acceptance maps each F-# to an A-# |
| Acceptance criteria (KB) | Spec 1 §15.5 (A-1 to A-17) | This spec §9 acceptance gates |
| Acceptance tests (Router) | Spec 2 §16.2 (14 tests) | This spec §9 acceptance gates |
| Setup runbook (KB) | Spec 1 Appendix B (sections B.1–B.11) | This spec §7.1 (sequence) |
| Setup runbook (Router) | This spec §7.2 (drawn from Spec 2 §17 Launch-Readiness) | Spec 2 §17 (raw checklist) |
| Build sequence | This spec §6 | Implied in launch gates of Spec 1 §16 and Spec 2 §17 |
| Configuration toggles | This spec §8 | Spec 1 §5 (defaults), Spec 2 §18 |
| V1.5 hooks | Spec 1 §17 D-10 (full V1.5 email-approval spec) | This spec §11.4 |
| Failure modes and recovery | Spec 3 §10 | This spec §13 |
| Maintenance and update process | This spec §14 | Spec 3 §13 (how this spec is used) |
| Open questions | This spec §16 | Spec 3 §12 (none blocking) |

### 4.1 Reading order for a new implementer

A fresh implementer (human or model) reads in this order:

1. **Spec 3 — Operating North Star.** Establishes what cannot be violated. ~20 minutes.
2. **This spec (Spec 4)** through §10. Establishes how the build proceeds. ~25 minutes.
3. **Spec 1 — PMI KC KB.** Full read for KB build. ~45 minutes.
4. **Spec 2 — Owner Router.** Full read for Router setup. ~30 minutes.
5. **Return to this spec §11 onward** for ongoing operations, V1.5, and maintenance.

Total cold-start reading time: about two hours. After that, the implementer should be able to scaffold the KB repo in one sitting and begin Router setup in parallel.

---

## 5. File and Artifact Locations

A consolidated index of every artifact the project produces.

### 5.1 PMI KC KB artifacts (what gets created)

| Artifact | Type | Where it lives |
|---|---|---|
| Next.js application | Code | `pmi-kc-kb/` repo |
| Production URL | DNS + Cloud Run | `kb.bluespringspropertymanagementinc.com` |
| Staging URL | DNS + Cloud Run | `kb-staging.[implementer_enterprise_domain]` |
| GCP project (staging) | Cloud project | `pmi-kb-test` (implementer-named) |
| GCP project (production) | Cloud project | `pmi-kb-prod` |
| Firestore database | Native mode | One per GCP project, `us-central1` |
| Vertex AI Search data stores | One per Process Space (12 total) | Discovery Engine in the same GCP project |
| Drive folders (KB-owned, 11) | Drive | Named `KB / [Space Name]` |
| Drive folder (Router-owned, read-only seam) | Drive | `Owner Router - PMI KC Metro` (read-only for KB service identity) |
| Firebase Auth project | Identity Platform | One per GCP project |
| OAuth client | OAuth 2.0 | Scopes: `openid`, `email`, `profile`, `drive.readonly`, `gmail.send` |
| `KB Approval` Gmail label | Workspace label | Created at setup on each Approver's account |
| Brand tokens | `tokens.css` | `pmi-kc-kb/styles/tokens.css` |
| Eval set (≥ 50 pairs) | Test corpus | `pmi-kc-kb/tests/eval/` |
| Daily Firestore backups | GCS bucket | 14-day retention |

### 5.2 Owner Router artifacts (what gets created)

| Artifact | Type | Where it lives |
|---|---|---|
| Drive folder | Workspace folder | `Owner Router - PMI KC Metro` (renamed from `Owner Inbox Router - PMI KC Metro` if it exists under the old name) |
| `01 Reply Patterns - Approved` | Google Doc | In the Drive folder |
| `02 Dan Voice and Tone Examples` | Google Doc | In the Drive folder |
| `03 Routing Rules` | Google Sheet | In the Drive folder |
| `04 Source Links and SOP Inventory` | Google Sheet | In the Drive folder |
| `05 Open Gaps and Unsupported Cases` | Google Sheet | In the Drive folder |
| `06 Admin Setup and Operating Instructions` | Google Doc | In the Drive folder |
| 9 Gmail labels (`Owner Router / *`) | Workspace labels | On Dan's and Bailey's Gmail accounts |
| Owner-sender Gmail filter(s) | Workspace filters | On Dan's and Bailey's Gmail accounts |
| Owner Router Gem | Workspace Gem | If Gems available; otherwise the prompt-pack doc |
| Owner Router Prompt Pack | Google Doc | Fallback in the Drive folder; required when Gem unavailable |
| Apps Script project (optional) | Workspace Apps Script | Created in the implementer's workspace; scope limited per Spec 2 §9.11 |

### 5.3 Cross-product seam artifacts (Spec 3 §4)

| Seam | Artifact realizing it |
|---|---|
| KB indexes Router folder | Vertex AI Search data store bound to `Owner Router - PMI KC Metro` Drive folder, plus KB service identity granted Viewer on that folder. |
| Shared vocabulary | Hardcoded strings in KB code (`lib/llm/`) and in Owner Router Gem / prompt pack: `Needs Verification: <fact>`, `Draft — Review before sending`. Each tested as part of acceptance. |
| Shared user identity | Both products use Google Workspace `pmikcmetro.com` accounts. KB enforces hd via Firebase Auth; Router relies on the Workspace login itself. |
| Common operator | One human (the implementer) is Admin in both. No code artifact — operational only. |

---

## 6. Build Sequence

Build sequencing is by **launch gate**, not by calendar date. Each phase ends when its gate passes; subsequent phases may overlap once their predecessor gate is met.

### 6.1 Phase A — Foundation (implementer alone)

**Goal:** Both products can be set up and torn down repeatably.

| Step | Belongs to | Detail |
|---|---|---|
| A1 | Both | Read all four specs in the order in §4.1. |
| A2 | KB | Provision staging GCP project, enable APIs (Spec 1 Appendix B.2), create Firestore in Native mode. |
| A3 | KB | Stand up the Next.js skeleton with Firebase Auth, the `ALLOWED_HD` enforcement, and an empty Ask page that returns "No Reliable Source Found" for every query. |
| A4 | KB | Deploy to Cloud Run staging with a custom subdomain on the implementer's enterprise. |
| A5 | KB | Set up Firestore Security Rules + IAM. Run integration tests that demonstrate Editor cannot mark Approved. |
| A6 | Router | Create the `Owner Router - PMI KC Metro` Drive folder in the implementer's sandbox; if a folder exists under the old name `Owner Inbox Router - PMI KC Metro`, rename it. Populate the six canonical files as empty templates (matching `drive-package/` in §3.1). |
| A7 | Router | Create the nine `Owner Router / *` labels on the implementer's sandbox Gmail (manually or via the optional Apps Script). |
| A8 | Router | If Apps Script is in use: deploy and run in the sandbox. Verify it cannot send mail, cannot change labels on existing threads, and cannot write outside the Router Drive folder. |

**Gate A:** The KB returns `No Reliable Source Found` for every question (correctly, because no content is indexed). The Router Drive folder, labels, and (if used) Apps Script exist in sandbox. The implementer can repeat A1–A8 from clean state in under 6 hours.

### 6.2 Phase B — Brand and acceptance scaffolding

**Goal:** The KB looks right and has a working acceptance bar.

| Step | Belongs to | Detail |
|---|---|---|
| B1 | KB | Verify brand tokens against `bluespringspropertymanagementinc.com` (Spec 1 §8.2) and update `tokens.css`. Redeploy. |
| B2 | KB | Author the eval set (≥ 50 question/expected-state pairs covering Verified, Multi-source concur, Partial, Placeholder, Conflict, No Source, Prompt injection, PII leakage, Generic-PM trap, Stale-source). |
| B3 | KB | Wire the eval set into CI. CI fails on any hallucination violation, any prompt-injection bypass, any PII leak, and any generic-PM answer. |
| B4 | KB | Write the Playwright e2e tests for the critical flows in Spec 1 §15.3. |
| B5 | Router | Write the historical-thread dry-run plan: identify 10 candidate owner threads (5 with Bailey, 5 with Dan) spanning the six categories plus at least two edge cases. |

**Gate B:** CI is green on the eval set with zero hard failures. e2e tests pass on staging. The dry-run plan is signed off by Dan and Bailey.

### 6.3 Phase C — P0 capture (KB) and pattern authoring (Router)

**Goal:** Both products carry enough real content to be testable end-to-end.

| Step | Belongs to | Detail |
|---|---|---|
| C1 | KB | Provision the 11 KB-owned Drive folders and create one Vertex AI Search data store per Space, plus the read-only seam to `Owner Router - PMI KC Metro` (= the 12th, Owner Email, Space). |
| C2 | KB | Bailey drops P0 source docs into each Space's Drive folder (Lease Renewals, Owner Renewal Outreach + Comp Lookup, Tenant Renewal Notice + DotLoop Follow-Up, Maintenance Work Order Intake, Vendor Assignment Handoff, Daily Inbox Triage, Fathom Training, Escalation Rules). |
| C3 | KB | Bailey, Dan, Chastity edit the SOP pages inline; mark each one `In Review` or `Approved` per Spec 1 §11. |
| C4 | KB | Approvers (Dan, Bailey, Chastity) clear the Approval Queue for P0. |
| C5 | Router | Bailey authors the six approved reply pattern sections in `01 Reply Patterns - Approved` (Spec 2 §10). Dan signs off on each. |
| C6 | Router | Bailey and Dan populate `02 Dan Voice and Tone Examples` with 25–50 approved sent-email examples. |
| C7 | Router | Bailey populates `03 Routing Rules` (one row per category, every column filled per Spec 2 §9.7). |
| C8 | Router | Bailey populates `04 Source Links and SOP Inventory` (aligned with the Sheets the team actually uses). |
| C9 | Router | Bailey creates the empty headered `05 Open Gaps and Unsupported Cases`. |
| C10 | Router | Implementer writes `06 Admin Setup and Operating Instructions` from the runbook in §7.2 below. |
| C11 | Router | Implementer creates the Owner Router Gem with the four approved knowledge files attached. If Gems unavailable on Dan's surface, create the prompt-pack doc instead (see §7.2.6). |

**Gate C:** Every P0 KB SOP is `Approved` or carries explicit owned placeholders. All six Router Drive files exist with their required content. Dan-signoff on each Router reply pattern is recorded.

### 6.4 Phase D — P1 capture and cross-product seam verification

**Goal:** Cross-product behavior demonstrably works.

| Step | Belongs to | Detail |
|---|---|---|
| D1 | KB | Bailey completes P1 Spaces (Move-In, Move-Out + Deposit Disposition, Owner Onboarding). |
| D2 | KB | Verify acceptance test A-16 (Owner Email Space surfaces the Router's Reply Patterns and Routing Rules as cited sources). |
| D3 | Router | Bailey runs 5 historical owner threads through the workflow end-to-end. Dan runs 5 historical owner threads. |
| D4 | Both | Cross-product behavior check (Spec 3 §7 five "look-for" questions). |

**Gate D:** Spec 1 acceptance test A-16 passes. Spec 2 §15.2 historical-thread dry runs pass for both Dan and Bailey. The five "look-for" questions in Spec 3 §7.1 all return the expected answers on staging.

### 6.5 Phase E — Usability and final acceptance

**Goal:** Real users can use both products without the implementer.

| Step | Belongs to | Detail |
|---|---|---|
| E1 | KB | Chastity, Estelle, Shane each complete their usability tasks unassisted (Spec 1 §15.4). |
| E2 | KB | All 17 acceptance criteria A-1 through A-17 pass on staging. |
| E3 | Router | All 14 acceptance tests in Spec 2 §16.2 pass. |
| E4 | Both | Implementer demonstrates: no autonomous send exists in either product; no rule, filter, Gem, script, add-on, prompt, or feature can send mail without an explicit human click. |
| E5 | Both | Implementer demonstrates: no write to RentVine, LeadSimple, DotLoop, QuickBooks, Boom, or any operational Sheet from either product. |

**Gate E:** All acceptance criteria and all acceptance tests pass on staging. Usability tasks complete. No autonomous send demonstrated.

### 6.6 Phase F — Production cutover

**Goal:** Both products are live in the team's actual Workspace.

| Step | Belongs to | Detail |
|---|---|---|
| F1 | KB | Provision production GCP project (Spec 1 Appendix B.9). |
| F2 | KB | Configure `ALLOWED_HD=pmikcmetro.com`; map `kb.bluespringspropertymanagementinc.com`. |
| F3 | KB | Re-grant Drive folder permissions to the production service account, including read-only access to `Owner Router - PMI KC Metro`. |
| F4 | KB | Re-run smoke tests on production URL. First end-user sign-in (Dan or Bailey) and first Ask succeed. |
| F5 | Router | Recreate labels and filters on Dan's and Bailey's production accounts. Create the production Drive folder (or migrate the sandbox folder into the production Workspace per the implementer's preference). |
| F6 | Router | Re-run two historical-thread dry runs on production accounts to confirm parity. |
| F7 | Both | Sign-off by Dan, Bailey, and Chastity. |

**Gate F:** Smoke tests pass on production for both products. First production Ask returns a verified-source answer. First production owner email is labeled, drafted, edited, and sent by Dan or Bailey end-to-end.

### 6.7 What is intentionally not in the build sequence

- **No code shared between repos.** No shared library, no shared CI pipeline.
- **No calendar deadlines.** Each phase ends when its gate passes. Internal date tracking is the implementer's and Dan's prerogative outside the spec.
- **No staging-to-production data migration.** Each environment is set up from scratch; no Firestore migration runs between staging and production. The KB's content lives in Drive folders that the team populates directly in production.

---

## 7. Setup Instructions (Runbook)

Two runbooks: one for the KB (delegated to Spec 1 Appendix B), one for the Router (defined here).

### 7.1 KB setup runbook

The KB runbook is Spec 1 Appendix B (sections B.1–B.11). The implementer reads it once, runs through B.1–B.8 in the staging environment (target wall-clock: ~2.5 hours), and then B.9 for the production cutover (target: 30 minutes). No content is duplicated here; Spec 1 Appendix B is the authoritative source.

### 7.2 Owner Router setup runbook

The Router runbook is below in its entirety. Target wall-clock: ~3 hours including content authoring kickoff (excluding Bailey's content time, which runs in parallel during Phase C).

#### 7.2.1 Prerequisites (5 min)

- Admin on the PMI KC Metro Google Workspace (`pmikcmetro.com`) or on the implementer's sandbox Workspace for staging.
- Dan's, Bailey's, and the implementer's Google accounts identified.
- 2FA enabled on all three accounts.
- Workspace admin can confirm Gemini eligibility on Dan's and Bailey's accounts.

#### 7.2.2 Create the Drive folder (5 min)

1. In Drive, search for `Owner Inbox Router - PMI KC Metro`. If it exists, rename it to `Owner Router - PMI KC Metro`. If it does not exist, create a folder named `Owner Router - PMI KC Metro`.
2. Set sharing: Dan and Bailey as **Editor**; implementer as **Editor**; Chastity as **Viewer** (Spec 2 §13.1).
3. Copy the six canonical file templates from `pmi-kc-owner-router/drive-package/` into the folder. Convert each to its Google Docs / Sheets equivalent.

#### 7.2.3 Create the labels (10 min, manual or scripted)

Manual path:

1. On Dan's Gmail, create labels exactly: `Owner Router / New`, `Owner Router / Dan Decision`, `Owner Router / Bailey Review`, `Owner Router / Draft Ready`, `Owner Router / Needs Verification`, `Owner Router / Waiting on Owner`, `Owner Router / Waiting on Team`, `Owner Router / Route to LeadSimple`, `Owner Router / Closed`.
2. Repeat on Bailey's Gmail.

Scripted path (optional, per Spec 2 §9.11):

1. Open the Apps Script project in `apps-script/`.
2. Run `create-labels.gs`. Verify all nine labels appear on both accounts.
3. Confirm the script's manifest scopes are limited to `gmail.labels`; the script cannot send mail.

#### 7.2.4 Create the Gmail filters (15 min)

1. Bailey provides an owner-sender list (export from RentVine owner contacts or her current routing).
2. Implementer creates a filter on each account: `From: [list of owner addresses or domains] → apply label "Owner Router / New", skip Inbox: no, mark important: no`.
3. Save filter export as `gmail-filters/owner-sender-filter.xml` in the repo for repeatability.
4. Verify the filter against at least three recent owner threads.

#### 7.2.5 Populate the six canonical files (Bailey-led, runs in parallel)

Bailey is the owner of this work during Phase C. Implementer's role is to ensure structure and acceptance, not to author content.

- `01 Reply Patterns - Approved`: six category sections per Spec 2 §10. Each section: required fields, hard rules, one Dan-approved example.
- `02 Dan Voice and Tone Examples`: 25–50 sent-email examples Dan and Bailey have reviewed.
- `03 Routing Rules`: one row per category, every column filled (Spec 2 §9.7).
- `04 Source Links and SOP Inventory`: links to the Sheets the team uses today (renewals, onboarding, move-in, move-out, payments, bills, vendor, late-tenant, tenant scorecard).
- `05 Open Gaps and Unsupported Cases`: header row only at setup.
- `06 Admin Setup and Operating Instructions`: implementer writes; covers labels, filters, prompts, smart-feature settings, mobile setup, rollback, and Apps Script status.

#### 7.2.6 Create the Owner Router Gem (or the prompt pack fallback) (30 min)

1. Confirm Gems are available on Dan's and Bailey's Workspace surface.
2. If yes: create a Gem named `PMI KC Metro Owner Router` with the system prompt in `gem-and-prompt-pack/owner-router-gem-system-prompt.md`. Attach `01 Reply Patterns - Approved`, `02 Dan Voice and Tone Examples`, `03 Routing Rules`, and `05 Open Gaps and Unsupported Cases` as knowledge sources.
3. If no: create a Google Doc named `Owner Router Prompt Pack` in the Drive folder. Paste the six category prompts from `gem-and-prompt-pack/owner-router-prompt-pack.md`. Link from `06 Admin Setup and Operating Instructions`.
4. Run a smoke test: paste a real owner thread into the Gem (or the prompt pack), verify it returns a summary, a category guess, a routing recommendation, and a draft or `Needs Verification` placeholder — and that it does not invent any facts.

#### 7.2.7 Apps Script (optional, scoped) (15 min)

Skip this section if not using Apps Script.

1. Deploy `apps-script/` to the implementer's Workspace.
2. Configure the script's saved-search digest to run weekly and email Bailey (using Bailey's own account, with her permission) with the count of threads in `New > 48h`, `Needs Verification > 5d`, and `Waiting on Owner > 14d`.
3. Verify the script manifest scopes are exactly: `gmail.labels`, `spreadsheets.currentonly` (limited to the Router Drive folder's sheets), and `gmail.send` only for the digest to Bailey's own address. **No** scope for sending external mail, mutating non-script-created labels on existing threads, or writing to non-Router files.
4. Document the script status in `06 Admin Setup and Operating Instructions`: enabled / disabled, scope, how to disable.

#### 7.2.8 Onboard Dan and Bailey (30 min each)

1. Walk each operator through `06 Admin Setup and Operating Instructions`.
2. Verify they can apply / change Owner Router labels on web and mobile.
3. Verify they can locate the Owner Router Gem (or the prompt pack) and run it on a recent thread.
4. Confirm rollback procedure: how to disable filters; how to disable the Gem; how to revert to manual operation.

#### 7.2.9 Run historical-thread dry runs (60 min)

Per Phase D step D3 above. 10 threads total, 5 with each operator, spanning the six categories plus at least two edge cases. All 14 acceptance tests in Spec 2 §16.2 must pass.

#### 7.2.10 Total Router setup wall-clock

| Sub-step | Time |
|---|---|
| Prerequisites | 5 min |
| Drive folder | 5 min |
| Labels | 10 min |
| Filters | 15 min |
| Canonical files structure (excluding Bailey content time) | 15 min |
| Gem or prompt pack | 30 min |
| Apps Script (if used) | 15 min |
| Operator onboarding (both) | 60 min |
| Historical dry runs | 60 min |
| **Total to ready-for-pilot** | **~3.5 hours** (plus parallel Bailey content authoring) |

---

## 8. Configuration and Toggles

The two products use a small, well-defined set of configuration switches. Every switch lives in exactly one place and is documented here.

### 8.1 KB configuration (`.env` plus Admin UI)

| Toggle | Default | Where set | Effect |
|---|---|---|---|
| `ALLOWED_HD` | `pmikcmetro.com` (prod) / `[implementer_enterprise_domain]` (staging) | `.env` per environment | Restricts Google sign-in to the named Workspace domain. |
| `GEMINI_MODEL_ANSWER` | `gemini-2.5-pro` | `.env` | Model used for grounded answers and drafts. |
| `GEMINI_MODEL_CLASSIFY` | `gemini-2.5-flash` | `.env` | Model used for audience / channel / source-state hinting. |
| `GROUNDING_CONFIDENCE_THRESHOLD` | Per Vertex AI Search default; configurable | `.env` | Below this threshold, the system returns `No Reliable Source Found` without calling the answer model. |
| `SPACE_DRIVE_FOLDER_IDS` | JSON map of Space name → Drive folder ID, including the read-only entry for `Owner Router - PMI KC Metro` | `.env` | Wires Spaces to their Drive folders. |
| `KB_APPROVAL_LABEL` | `KB Approval` | `.env` | Gmail label applied to outgoing Approver notifications. |
| `DRAFT_BANNER` | `Draft — Review before sending` | Hardcoded constant, not env-configurable | Spec 3 §8.1 makes this verbatim and immutable. |
| `UNVERIFIED_PLACEHOLDER` | `Needs Verification: <fact>` | Hardcoded constant, not env-configurable | Spec 3 §8.1 makes this verbatim and immutable. |
| Per-user role | Editor / Approver / Admin | Firebase Auth custom claims; managed via Admin UI | Determines permissions. |
| Per-source sensitivity | Low / Medium / High | Firestore `sources_meta`; High excluded from retrieval | Sensitivity-aware retrieval. |

### 8.2 Owner Router configuration (Drive folder + Admin Setup doc)

| Toggle | Default | Where set | Effect |
|---|---|---|---|
| Owner sender list (Gmail filter) | Bailey's starter list | Gmail filter, exported to `gmail-filters/owner-sender-filter.xml` | Determines which threads receive `Owner Router / New`. |
| Approved reply pattern set | Six categories in Spec 2 §10 | `01 Reply Patterns - Approved` | Binding source of pattern behavior. |
| Routing rules per category | Per Spec 2 §9.7 | `03 Routing Rules` sheet | Binding source of routing behavior. |
| Categories Bailey can answer without Dan | Per Spec 2 §18 D4 | `03 Routing Rules` column `Default reviewer` | Determines Bailey send authority. |
| Categories that always require Dan | Per Spec 2 §18 D3 and D6 | `03 Routing Rules` column `Must escalate when` | Determines Dan-only categories. |
| Owner Router Gem knowledge sources | The four approved Drive files | Gem configuration | Determines what the Gem can ground on. |
| Apps Script status | Enabled (default per E1=a) / disabled | `06 Admin Setup and Operating Instructions` | Operational accelerator only. |
| Chastity access | Drive Viewer; no Gmail label sharing; no send authority (v1) | Drive permissions + `06 Admin Setup and Operating Instructions` | Role separation per Spec 3 §8.5. |

### 8.3 What is not a toggle

- The four seams in Spec 3 §4 are not configuration. They are structural; changing them requires a Spec 3 revision.
- The verbatim placeholder and draft banner strings are constants. They appear in code, prompts, and acceptance tests verbatim.
- The product names (`PMI KC KB`, `Owner Router`) are constants. They appear in repos, deployment names, Drive folder names, and acceptance tests verbatim.

---

## 9. Acceptance Gates (Verification)

Both products must pass their respective acceptance gates before production cutover. Phase F (Production cutover) cannot start until both products' Phase E gates have been signed off.

### 9.1 KB acceptance gates

- All 17 acceptance criteria A-1 through A-17 (Spec 1 §15.5) pass on staging.
- Eval set in CI passes with zero hard failures (Spec 1 §15.2).
- Critical-flow e2e tests pass in CI on staging (Spec 1 §15.3).
- Chastity, Estelle, and Shane complete their usability tasks unassisted (Spec 1 §15.4).
- Brand tokens verified against `bluespringspropertymanagementinc.com` and present in `tokens.css`.
- Cloud Run service identity verified: `drive.readonly` only on KB-managed and Owner Router folders; `gmail.send` only; no other write scopes.
- KB Approval Gmail notifications successfully deliver to Dan, Bailey, and Chastity.

### 9.2 Owner Router acceptance gates

- All 14 acceptance tests (Spec 2 §16.2) pass.
- 10 historical-thread dry runs (5 Dan, 5 Bailey) pass (Spec 2 §15.2).
- Six canonical Drive files complete and Dan-signed off (Spec 2 §17).
- Owner Router Gem or prompt pack tested on a real owner thread without inventing facts.
- Apps Script (if in use) scope-verified: cannot send, cannot mutate existing threads' labels, cannot write outside the Router Drive folder.
- Demonstration to Dan and Bailey: no autonomous send exists.
- Chastity access set to Drive Viewer only; her KB Approver role does not transfer.

### 9.3 Cross-product acceptance gates

- Spec 3 §7 five "look-for" questions all return the expected answer when run against staging.
- KB indexing of the Owner Router Drive folder is read-only and verified by attempting (and failing) a write from the KB service identity.
- KB Ask for an owner-email question returns citations into `Owner Router - PMI KC Metro` files.
- Vocabulary strings (`Needs Verification: <fact>`, `Draft — Review before sending`) appear verbatim in both products' outputs.

### 9.4 What blocks production cutover

Any single one of the following blocks cutover until resolved:

- An acceptance criterion or test fails.
- A hallucination is found in any KB eval-set run.
- A Router draft sent with an unverified fact during dry runs.
- A KB write attempt to the Owner Router folder succeeds (IAM misconfiguration).
- The Router Gem produces a category recommendation outside the six approved categories without surfacing an Open Gaps entry.
- A role-transfer violation: a KB Editor or Approver gains Router authority without Dan + Bailey signoff (or vice versa).

---

## 10. Early-Deployable Components

A practical breakdown of what an implementer can ship and start using early, in service of the "simplest thing that could possibly work" principle while honoring the no-feature-loss rule.

| Component | Shippable independently? | Why useful early | Risk if shipped early |
|---|---|---|---|
| KB staging environment with empty Spaces | Yes | Lets Bailey and the team see the UI and start populating Drive folders | None; returns `No Reliable Source Found` correctly until content arrives |
| KB Approval Queue (without Ask) | No | Approval Queue is meaningful only when content exists | N/A; do not ship in isolation |
| Owner Router Drive folder with empty templates | Yes | Lets Bailey author content in parallel with KB code work | None; no Gmail filters or labels active yet |
| Owner Router labels and filters | Yes (after templates exist) | Lets Bailey and Dan start labeling real owner mail manually | If filters are too broad, may misroute mail; tested before live use |
| Owner Router Gem | No (depends on Drive content) | Requires the approved knowledge files | N/A; do not ship in isolation |
| Apps Script (optional) | Yes (after labels exist) | Saves setup labor on label and sheet header creation | If misscoped, could mutate state; mitigated by scope verification in §7.2.7 |
| KB read-only seam to Router folder | Yes (after Router Drive folder exists) | Lets the team verify cross-product alignment early | None; read-only |

### 10.1 Recommended early-deploy order

1. KB staging environment, empty Spaces, brand tokens.
2. Owner Router Drive folder with empty templates.
3. Owner Router labels and filters on a sandbox account.
4. KB Drive folder bindings to Vertex AI Search.
5. Bailey starts populating Drive folders for both products.
6. Owner Router Gem or prompt pack.
7. Cross-product seam (KB indexes Router folder).
8. KB Approval Queue, Approval notifications, Admin UI.
9. Full acceptance run on staging.
10. Production cutover.

---

## 11. Model Handoff Instructions

This section is written for an external coding model (or a human using one) that is being asked to scaffold the KB and configure the Router. If the model is reading this, it is the implementer of record for the duration of the build.

### 11.1 What to read, in order

Already specified in §4.1. Re-stated here for any model that lands on this section first:

1. Spec 3 (north star).
2. Spec 4 (this document) through §10.
3. Spec 1 (KB).
4. Spec 2 (Router).
5. Return to Spec 4 §11 onward.

### 11.2 What to build first

The KB scaffold. Specifically: Phase A and Phase B above. The Owner Router is mostly configuration plus content (not code), and its content depends on Bailey's domain knowledge; it cannot be fully scaffolded by a code model alone.

For the Router, the model produces:

- The repository layout in §3.1.
- The drive-package templates (6 files) per Spec 2 §10 and §9.7.
- The Owner Router Gem system prompt per Spec 2 §9.5 and §12.3.
- The fallback prompt-pack doc per Spec 2 §9.5.
- The Apps Script files per Spec 2 §9.11 (if Apps Script is in use).
- The `06 Admin Setup and Operating Instructions` doc from the runbook in §7.2.

The model does **not** produce the substantive content of `01 Reply Patterns - Approved` or `02 Dan Voice and Tone Examples`. Those are Bailey-and-Dan-authored.

### 11.3 What never to do during the build

Drawn from Spec 3 §9 and Spec 2 §20, restated here as model-actionable constraints:

- Do not introduce an autonomous send anywhere in either product, including any background job, Apps Script, Gem behavior, or webhook.
- Do not give the KB write access to the Owner Router Drive folder.
- Do not call the KB Ask API from the Owner Router (or from any Apps Script in the Router).
- Do not rename or alter the verbatim strings `Needs Verification: <fact>` or `Draft — Review before sending`.
- Do not introduce a generic property-management answer fallback in the KB. When retrieval is weak, return `No Reliable Source Found`.
- Do not bundle the two products into a single repository, deployment pipeline, or service account.
- Do not add Drive files beyond the six canonical ones in the Router folder.
- Do not add Gmail labels beyond the nine in Spec 2 §7 without Dan + Bailey approval and a Routing Rules update.
- Do not pull tenant or vendor email into the Router pilot.
- Do not promote any user to a role they do not have in the spec (e.g., do not give Chastity Router operator authority).
- Do not add calendar-week deadlines to the build sequence; gates are gates, not dates.

### 11.4 V1.5 hooks the model must leave room for

Per Spec 1 §17 D-10:

- The Firestore `change_log` schema includes an `actor_via_email_token` field reserved for V1.5 approve-by-email.
- The `KB Approval` Gmail label is created at setup (it doubles as the V1.5 routing label).
- The OAuth grant for the Cloud Run service identity already includes `gmail.send`, which is sufficient for V1.5.
- The approval notification email template is structured so V1.5 only needs to add a signed approval URL block; the v1 email is otherwise final.

Per Spec 1 §17 D-15: the KB does not ingest Gmail content directly in v1. The model leaves no scope or code for Gmail content ingestion; if Phase 2 adds it, it is a separate scoped feature.

### 11.5 How the model knows it is done

Every functional requirement F-1 through F-33 (Spec 1) maps to one or more acceptance criteria A-1 through A-17. Every Router acceptance test in Spec 2 §16.2 has a clear pass condition. When the model can demonstrate every A-# passing and every Router test passing, with the eval set green, the model's build is complete.

If the model believes it cannot satisfy a requirement, it does not silently drop it. It captures the obstacle in §16 (Open Questions) and brings it to Dan or the implementer.

---

## 12. Cross-Spec Alignment Process

How the four specs stay aligned over time.

### 12.1 Single source of truth per concern

For any concern, exactly one of the four specs is authoritative. The mapping is in §4 (Documentation Map). When an edit is proposed, the editor identifies the authoritative spec and updates it there. Other specs may reference the change but never restate it as authoritative.

### 12.2 Cross-spec consistency check (run on every spec edit)

Before any spec change is merged, the editor runs this five-point check:

1. **Does the change conflict with Spec 3 §8 (Cross-Spec Consistency Rules)?** If yes, the change is rejected unless Spec 3 is also updated with explicit Dan + Bailey signoff.
2. **Does the change conflict with Spec 3 §9 (North-Star Principles)?** If yes, the change is rejected.
3. **Does the change introduce a new cross-product seam beyond the four in Spec 3 §4?** If yes, the change is rejected unless Spec 3 §4 is also updated.
4. **Does the change rename a verbatim string (`Needs Verification: <fact>`, `Draft — Review before sending`, product names, Drive folder name, Gmail labels)?** If yes, the change must include a coordinated update across all four specs, the eval set, the acceptance tests, and the production environment.
5. **Does the change add a calendar deadline?** If yes, the change is rejected.

### 12.3 Naming sweep (a hygiene step)

Whenever an old name is detected in any artifact, the editor performs a regex/diff sweep to replace it. The current deprecated → canonical mappings are:

| Deprecated | Canonical |
|---|---|
| `Bailey Knowledge Transfer Assistant`, `Bailey KTA`, `PMI KC Metro Knowledge Base`, `Knowledge Transfer Assistant`, `KTA` | `PMI KC KB` |
| `Dan Owner Inbox Router`, `Owner Inbox Router`, `Dan Email Triage`, `Owner Inbox Triage` | `Owner Router` |
| `Owner Inbox Router - PMI KC Metro` (Drive folder) | `Owner Router - PMI KC Metro` |

The naming sweep runs across all four specs, the two repositories, the Drive folder names, the Gem name, the Apps Script project name, the email notification templates, and the eval set. Any artifact in `pmi-kc-kb/` or `pmi-kc-owner-router/` that references an old name is updated, and the change-log entry records the rename.

### 12.4 Cross-spec edit log

Each repo's `docs/` carries a `CHANGELOG.md` recording cross-spec edits. Entries note: which spec was authoritative, what changed, why, who approved (Dan + Bailey for cross-product changes; implementer-only edits permitted for typos and clarifications that do not change behavior).

---

## 13. Verification Process

### 13.1 Per-build verification (CI)

Each KB CI run:

- Lints and typechecks the codebase.
- Runs unit tests (source-state classification, citation validation, prompt assembly, permission checks, Firestore validators).
- Runs integration tests (API routes, Firestore Security Rules, Vertex AI Search response parsing).
- Runs the eval set (≥ 50 question/expected-state pairs). **Hard failure on any hallucination, prompt injection, PII leak, or generic-PM answer.**
- Builds the production image; smoke-tests it against staging.

The Router has no CI (it is configuration plus content). Verification of Router changes is by the historical-thread dry run framework in Spec 2 §15.2 and the acceptance tests in Spec 2 §16.2.

### 13.2 Per-deploy verification (smoke tests)

After every deploy of either product to staging or production, the implementer runs the five "look-for" questions from Spec 3 §7.1. If any fails, the deploy is rolled back.

### 13.3 Per-week verification (operational)

- Bailey reviews label counts on `Owner Router / New`, `Owner Router / Dan Decision`, `Owner Router / Draft Ready`, `Owner Router / Needs Verification` each morning.
- Bailey runs the three Router health-check saved searches each week (manually or via the optional Apps Script digest).
- Approvers (Dan, Bailey, Chastity) clear the KB Approval Queue. The trend in queue depth is the leading operational metric.
- Open Gaps count is reviewed by Bailey each week.

### 13.4 Per-quarter verification (alignment)

Once per quarter (and on any significant team change), the implementer runs a full alignment audit:

1. Re-run the Spec 3 §7 five "look-for" questions on production.
2. Run the eval set against production.
3. Run two historical-thread dry runs against the Router production setup.
4. Audit IAM: KB service identity has only `drive.readonly` and `gmail.send`; Router Apps Script (if in use) is scope-limited.
5. Confirm naming sweep is clean (no old names present in any artifact).
6. Update the changelog with audit results.

---

## 14. Deployment / Rollout Assumptions

### 14.1 KB deployment assumptions

- The KB ships on Cloud Run with autoscaling and scale-to-zero. Cost stays near zero outside business hours.
- The KB has two environments: staging (in the implementer's sandbox or the implementer's enterprise) and production (`kb.bluespringspropertymanagementinc.com`).
- Daily Firestore exports go to a GCS bucket with 14-day retention.
- Cloud Logging retains audit logs for 365 days.
- Production-image build size, Cloud Run cold-start latency, and Gemini token costs all stay within the guardrails in Spec 1 §18.4.

### 14.2 Owner Router rollout assumptions

- The Router rolls out as a Workspace configuration change, not a code deployment. It has no "deploy" event; it has a "go-live" event when Dan and Bailey begin handling real owner email through the labeled queue.
- If a Workspace-wide setting changes (Gemini eligibility, smart features toggle, Workspace plan change), the implementer is notified by the Workspace admin and verifies the Router workflow is unaffected.
- The Router has no SLO target; it is a manual workflow with AI assistance. Mobile parity is the closest thing to an SLO and is verified each setup.

### 14.3 Rollback assumptions

- KB rollback: re-point DNS to staging, disable production OAuth client. Drive folders untouched. Owner Router unaffected.
- Router rollback: disable filters, stop applying Owner Router labels to new threads. Existing labeled threads remain labeled. The Drive folder, the labels, the filters, and the Gem all remain in place for reuse. KB unaffected.

### 14.4 Inter-product failure independence

- The KB can be down for an extended period without affecting the Owner Router. The Router operates from Gmail + Drive + Gem/prompt pack; none of those depend on the KB.
- The Owner Router can be down (Gmail outage, Gem unavailable, smart features disabled) without affecting the KB. The KB's "Owner Email" Space is a read-only mirror; it continues to serve the last-indexed view of the Router's Drive folder.
- Workspace-wide outages affect both. There is no mitigation for that.

---

## 15. Maintenance and Update Process

### 15.1 Ongoing maintenance ownership

- **KB content (SOPs, templates, tools, placeholders):** Bailey, Dan, Chastity own per Space. Day-to-day maintenance is via the KB itself.
- **KB code, infra, eval set:** Implementer. Future implementers consult §11 for handoff.
- **Owner Router content (the six canonical Drive files):** Bailey owns; Dan approves. Chastity contributes via comments during pilot; her contribution status post-pilot is Dan + Bailey's decision.
- **Owner Router labels, filters, Gem, Apps Script (if used), Admin Setup doc:** Implementer.
- **Naming sweep and spec hygiene:** Implementer.

### 15.2 Common maintenance tasks

| Task | Trigger | Who | How |
|---|---|---|---|
| Add a new KB Space | Team identifies a new process worth capturing | Admin + Approver | Create Drive folder; create Vertex AI Search data store; add row to `spaces` collection; populate SOP. |
| Deprecate a KB SOP | SOP no longer reflects how the team operates | Approver | Set status to `Deprecated`; SOP is excluded from retrieval but preserved. |
| Update brand tokens | Marketing redesign or palette change | Implementer | Update `tokens.css`; redeploy. |
| Update eval set | New failure mode identified; new category added | Implementer | Add pairs; re-run CI; verify zero hard failures. |
| Add a Router reply pattern | Open Gaps row resolved with a new pattern | Bailey + Dan | Update `01 Reply Patterns - Approved`; update `03 Routing Rules`; verify the Gem still grounds correctly. |
| Add a Router label | Workflow needs a new state | Dan + Bailey | Create label; update `03 Routing Rules`; update `06 Admin Setup`; verify mobile parity. |
| Onboard a new user (KB) | New team member | Admin | Add user; assign role; share orientation. |
| Onboard a new user (Router) | New owner-email operator | Dan + Bailey | Explicit approval recorded in Admin Setup; permission changes propagate per Spec 3 §8.5. |
| Run quarterly alignment audit | Quarterly | Implementer | Per §13.4. |
| Rotate secrets | Annually or per security policy | Implementer | Update Secret Manager; redeploy. |
| Restore from backup | Data loss event | Implementer | Restore Firestore from GCS backup; verify content; re-run smoke tests. |

### 15.3 Update process for the specs themselves

When the project's reality changes (a team member's role expands, a new tool becomes a source of record, a category is split into two), the relevant spec is updated using the process in §12 (Cross-Spec Alignment Process). The four specs remain co-equal; no spec is owner-of-record without an authoritative concern from §4.

### 15.4 When to retire or rebuild

The product is healthy as long as:

- The five "look-for" questions in Spec 3 §7 pass.
- The acceptance criteria and tests continue to pass after material changes.
- The team uses both products as a habit rather than an exception.

If any of these stops being true for an extended period, the product is reviewed. Retirement (or partial retirement) is governed by Spec 3 — specifically, the product can be paused without violating the north star, because the north star is about behavior, not feature presence.

---

## 16. Q&A and Resolved Gaps

| # | Question | Decision | Rationale |
|---|---|---|---|
| Q-1 | One repo or two? | **Two repos.** | The KB has code, CI, deploys, tests. The Router has configuration and content. Coupling them slows both and blurs the runtime boundary. |
| Q-2 | Single implementer or split? | **Single implementer.** | Spec 3 seam 4 (common operator). One mental model for setup and maintenance. |
| Q-3 | Calendar deadlines or gates? | **Gates only.** | Calendar dates pressure scope and quality. The team can track dates internally without binding the spec. |
| Q-4 | Build sequence: KB first, Router first, or in parallel? | **Mostly parallel after Phase A.** The KB code can be scaffolded while Bailey populates Router Drive files. | Both products' Phase C content depends on Bailey, which is the binding constraint. Code work parallel to it is free progress. |
| Q-5 | Apps Script for the Router: yes or no? | **Yes, optional, scoped (per Spec 2 §9.11).** | Saves implementer time; zero operational risk if scoped correctly. Fallback (skip the script) is fully functional. |
| Q-6 | V1.5 KB email approval: built or hooked? | **Hooked, not built.** | One forward-compatible field, one Gmail label, one OAuth scope, one email template — all reserved in v1. V1.5 ships with no migration debt. |
| Q-7 | KB sends email at all in v1? | **Only internal `KB Approval` notifications.** | Drafts copy-to-clipboard for everything else, per Spec 1 §5 D-9. |
| Q-8 | Router calls KB? | **No.** | Spec 3 §4.3: removing the seam would create a runtime dependency and a possible cross-product failure. |
| Q-9 | KB writes to Router folder? | **No.** | Spec 3 §8.3: enforced in IAM (`drive.readonly` only on that folder). |
| Q-10 | Naming sweep: what is canonical? | **PMI KC KB** and **Owner Router**, plus the Drive folder `Owner Router - PMI KC Metro`. | One name per product; old names deprecated wherever they appear. |
| Q-11 | Spaces at launch: 11 or 12? | **12** (11 KB-owned + Owner Email read-only). | Spec 1 §7.1 and Appendix A.1; the Owner Email Space is the realization of Spec 3 §4 seam 1. |
| Q-12 | Where does the "simplest thing that works" principle live? | **Spec 4 §2.1 and Spec 3 §8.8.** It is a tie-breaker among compliant designs, not a license to drop features. | A feature can be implemented in a simpler or more complex way; the simpler way wins. A feature cannot be dropped on simplicity grounds. |

---

## 17. Open Questions

There are no open questions blocking build or launch. Specific items deferred by design (not by uncertainty) are tracked in their respective specs and re-listed here for the implementer's convenience:

- **KB phase-2 / V1.5** (Spec 1 §17): D-9 Gmail draft creation; D-10 email-based approval (specified and hooked, built in V1.5); D-15 Gmail content ingestion; D-16 Router-to-KB calls.
- **Router phase-2** (Spec 2 §19): LeadSimple write-back; RentVine write-back; DotLoop generation; tenant-comm automation; lease-doc automation; vendor or maintenance approval automation; AI Inbox; Gmail Live; offshore staff onboarding to Router; Chastity as an active Router operator.

If the implementer encounters a question not on either list, the question is added to this section, captured in the changelog, and resolved before the affected work proceeds.

---

## 18. Traceability Notes (Source Basis)

This spec was synthesized from:

- The original conversational meta-instructions (`doc4-meta-instructions.md`): the framing of "implementation-ready handoff," the orientation toward a single implementer, and the priority of acceptance gates over fixed dates. This document preserves that intent and adds the file-by-file, phase-by-phase precision required for a model or external implementer to scaffold both products.
- **Spec 1 (PMI KC KB)**: provided the runbook reference (Appendix B), the functional requirements / acceptance criteria mapping, the eval-set scope, the V1.5 hooks, and the configuration toggles.
- **Spec 2 (Owner Router)**: provided the Router runbook structure, the six canonical files, the Apps Script scope, the historical-thread dry-run framework, and the launch-readiness checklist.
- **Spec 3 (Operating North Star)**: provided the binding behavioral contract that this spec serves and the cross-spec consistency rules that govern every edit.
- **Deep-research alignment documents**: provided the canonical product names, the explicit cross-product boundary, the shared vocabulary, the role-separation principle, and the explicit "no calendar deadlines" stance.
- **Transcripts and analysis** (`pmi_-_call_1.md`, `pmi_-_call_2.md`, `transcript_analysis.md`): provided business context for sequencing decisions — Bailey is the binding content authoring constraint, Dan is the binding approval constraint, RentVine is the binding system-of-record constraint.

This spec is the procedural counterpart to Spec 3. If Spec 3 describes the destination, Spec 4 describes the road. Both can be updated; both supersede the original conversational documents from which they were derived.

---

*End of Spec 4.*
