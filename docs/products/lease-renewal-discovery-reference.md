# Lease Renewal — Discovery & Design Reference (Cleaned + Refined)

Source status: Internal discovery & design reference — sanitized; tracked
Space: Lease Renewals
Sensitivity: Low (sanitized — no customer identifiers)
Cleaned: 2026-06-20 · Refined: 2026-06-20 (round 1 — spreadsheet context, conflict design,
cadence, governance, approval gates)
Source: Jun 19, 2026 live screen-share walkthrough (Dan Hilgedick → Josiah Hunter, Jon Eddy).
Raw transcript is **gitignored** (`docs/context_and_calls/lease_renewal/`), never committed;
retained locally only.

> **Purpose.** A clean, production-oriented, source-safe reference for PMI KC's lease
> renewal process and the design thinking around it, refined from the live walkthrough plus
> Josiah's clarifications (2026-06-20). Sanitized so it can be reused without poisoning
> future work. Companion to the product lane doc [`lease-renewal-agent.md`](lease-renewal-agent.md).
>
> **What this is / isn't.** §1–3 are clean process facts that could later be distilled into a
> KB **Ask source**; §4–8 are internal **design/analysis** content and should not be fed to
> the Ask. Kept together here as the single discovery reference.
>
> **Certainty markers.** **[CERTAIN]** = transcript- or user-confirmed; **[TENTATIVE]** =
> implied / partial; **[OPEN]** = unresolved. Transcript timestamps (e.g. `@00:14:12`) kept
> for traceability; **(JH 2026-06-20)** marks Josiah's clarification.
>
> **Related:** [`lease-renewal-agent.md`](lease-renewal-agent.md) ·
> [`../demo-source-templates/lease-renewals-sanitized-call-notes.md`](../demo-source-templates/lease-renewals-sanitized-call-notes.md) ·
> [`../source-corpus/lease-renewal-source-inventory.template.json`](../source-corpus/lease-renewal-source-inventory.template.json)
>
> **Scope.** Lease renewal end-to-end including shared document/Dotloop build-out mechanics
> _(shared with move-in)_. Move-in/move-out are not documented as standalone processes.

---

## A. The Renewal Tracking Spreadsheet — Operational Source of Truth (central, do not lose)

This is the single most important and previously-underweighted piece of context. **(JH 2026-06-20)**

- **What it is.** A constantly-edited Google Sheet that functions as the team's operational
  **database of truth** for in-flight work — multi-row, multi-tab, multi-account. It tracks
  move-ins, move-outs, and **lease renewals**, with color-coded status cells and rows
  hyperlinked back to Rentvine (@00:16:23, @00:17:31, @01:14:39).
- **Who uses it and how.** Dan reads it as his **status update** on where the team is across
  all accounts; the staff (incl. the **Philippines team**) use it as the working dashboard
  that shows Dan where each renewal stands. It is the **primary cross-team working surface**,
  not a side artifact. It appears stable/unchanged for a long time and is something Dan
  clearly **values as a business unlock**. **(JH 2026-06-20)**
- **Why it constrains the design.** The audience is **non-technical, remote, and
  distributed**. They trust and rely on the spreadsheet. A replacement dashboard — especially
  one that is buggy at launch — would not be adopted, and once distrusted would be abandoned.
  **So the app must augment the spreadsheet and earn trust before replacing any of it.**
  **(JH 2026-06-20)**
- **What we should do with it (direction, not a locked solution).** **(JH 2026-06-20)**
  1. **Decompose it** into core components: understand each tab/column/cell's meaning, the
     choices encoded, and where the data is murky — so deterministic rules and models can be
     improved.
  2. **Build a stable read connector** that reads the sheet and understands cell semantics.
  3. **Use it as a status/attention indicator** — detect when something needs attention,
     needs more context, or is off and should be reconsidered.
  4. **Approval-gated write-back that is extremely stable** — 100% correct cell, correct tab,
     verified (read-after-write), never a wrong write.
  5. **Use the previously-vetted data hidden in the spreadsheet as test/training data** to
     improve processes and to drive follow-up queries against the Rentvine and Dotloop APIs.
     (Now permitted — see Data Governance in §5.)
  6. **Eventual state:** once stable, trusted, and demonstrably catching things the team
     missed (with working approval gates Dan can see), build out a real backing database,
     pull from Rentvine automatically, and let the team manage information via the app.
- **Access status — RESOLVED 2026-06-20.** The Claude Drive connector was reconnected to
  `josiah@pmikcmetro.com` (see [`../auth-identity-and-access-strategy.md`](../auth-identity-and-access-strategy.md));
  the sheet — **"Tenant Move In/Out/Renewal Checklist"**, owner `dan@pmikcmetro.com` — is now
  readable. The link itself stays out of git (points to live client data). ⚠️ The sheet
  contains **plaintext WiFi + platform credentials/PINs** (tabs 4 & 7) — any connector must
  hard-exclude them.

> The column/cell **semantic map** is built →
> [`lease-renewal-spreadsheet-map.md`](lease-renewal-spreadsheet-map.md). It turns the murky,
> implicit knowledge in the sheet into explicit deterministic rules (18 tabs, header/data
> mismatches, cross-source conflicts, and the credential-tab exclusions).

## 1. Cleaned Lease Renewal Reference (process flow)

The renewal process is a multi-day, multi-system chain the team manages through the
tracking spreadsheet (§A). Observed end-to-end flow:

1. **Identify candidates.** In **Rentvine → Leases**, filter by lease **end date** (e.g.
   end of August, end of September). Watch for off-cycle end dates that don't fall in a
   standard month batch — these have been _missed before_ (@00:14:12). Exclude / handle
   manually: owner-authorized month-to-month, program leases, other atypical cases (@00:15:16).
2. **Log to the tracking sheet (§A).** Manually add real renewal candidates from Rentvine to
   the renewals tab (@00:16:23, @00:17:31).
3. **Determine current rent + market value.** Current rent from **Rentvine** (@00:21:50).
   Market value gathered two ways: the **PMI KC website Free Rental Analysis tool**
   (franchise-provided; the **authoritative number recorded on the sheet**), and **Zillow
   "price my rental"** (a comp **range** + active-listing "purple dots" as supporting
   context) (@00:18:28, @00:20:29, @00:33:35). **Fallback when the PMI tool is down: Zillow +
   manual verification, approval-gated** — no auto-accept of the number **(JH 2026-06-20)**.
4. **Owner outreach.** Gmail template with address, current rent, Zillow comp range, and a
   screenshot; the owner decides (keep / raise / adjust for tax/insurance). Owner response
   recorded on the sheet (@00:24:04, @00:27:14).
5. **Tenant outreach.** Renewal template: lease end date, intent-to-stay-or-leave ask,
   possible charges, and a Google form (@00:34:40).
6. **Multi-channel rule.** _Every_ tenant communication goes through **all** channels — Gmail
   - Rentvine portal **chat** (email + in-portal) + Rentvine **messages** (SMS) — so it lands
     even if a channel is missed or a staffer is out; replies route to the team + admin
     (@00:36:56, @00:37:51).
7. **Branch.** Moving out → move row to the move-out sheet. Renewing → renewal prep
   (@00:35:47, @00:41:09).
8. **Renewal prep / data gathering.** Confirm deposit posture — cash vs **deposit-replacement
   policy** (Rhino / The Guarantors); update inspection sheet; confirm pet registration;
   apply the current insurance change (Second Nature renters-insurance addendum)
   (@00:43:03–@00:50:42, @01:01:06).
9. **Hand off to build-out.** _(shared with move-in)_ Email the build-out admin a template:
   **renew or convert** with terms — 1-year term + start date, owner leasing fee, all
   charges, deposit type, create a named Dotloop loop, route for review (@00:51:56, @00:56:17).
10. **Rentvine renewal.** Build-out admin adds the renewal (renewal date, new start/end date,
    renewal fee) and applies the rent increase (flat amount). **[OPEN]** exact Rentvine
    click-path not fully demonstrated — flag for an admin-led demo (@00:53:18, @00:54:46).
11. **Dotloop package.** _(shared with move-in)_ Create loop, add tenant parties
    (name/email/phone, role = tenant), select the lease-agreement template, assemble the
    document set per §12 (@00:56:17, @00:58:45).
12. **Document-set logic ("it depends").** _(shared with move-in)_ Existing in-system tenant,
    simple renewal → keep just the **extension** + **insurance program addendum**, archive
    the rest. **Inherited lease** (previously managed elsewhere) → run the **entire** set.
    Conditional addenda: **Independence** addendum; **Kansas City** addendum;
    **lead-based-paint disclosure** only for **pre-1978** buildings and required on **non-KCR**
    contracts; **pet registration** + **service-animal verification** (third party);
    **shared-utility-meter** addendum; standard addenda (bed bug, mold, broker agency)
    (@01:00:08, @01:03:16, @01:18:43).
13. **Error-prone lease fields (manual).** _(shared with move-in)_ Frequently missed/wrong:
    landlord **LLC** name (vs owner's personal name), real-property items (appliances),
    property address, fixed-vs-month-to-month checkbox, assigning all tenants + initialing
    pages, new monthly rent, **prorated** rent for mid-month starts, **security deposit (+ pet
    deposit)**, the **deposit-replacement** checkbox/amount, owner-paid utility one-offs,
    occupancy/ages + emergency contact (from the move-in form), and lawn/snow/trash
    responsibility (landlord vs tenant vs HOA) (@01:04:24–@01:08:42).
14. **Building-level data.** _(shared with move-in)_ Year built (→ lead paint),
    lawn-care/utilities responsibility, inspection info, entry-door/lock counts (move-out
    hardware) live at the **building** level in Rentvine and should flow down (@01:08:42).
15. **Signature tracking + closeout.** Send for signature via **Dotloop** (e-signature only).
    Track signers by required party (tenant / owner / admin); color-coded sheet status
    (green = all signed); hide the row when complete (@01:14:39, @01:17:38).

### Gmail integration interpretation (2026-07-14)

The observed Gmail steps above define workflow communication purposes; they do not authorize a general
mailbox UI. The app may link only an authorized renewal run to the intended owner, tenant, or build-out
thread. Pub/Sub is only a change signal for an already-linked thread. A linked reply produces value-free
attention, and an authorized user may then request bounded, transient analysis. Extracted owner direction,
tenant intent, questions, and tasks remain `Needs Review` until a human confirms them.

Gmail delivery is evidence of one channel, not proof that tenant outreach or agreement is complete. The
portal-chat and SMS requirements in steps 6 and 15 remain separate checklist evidence. No Gmail-derived
interpretation writes the tracking sheet, Rentvine, LeadSimple, or Dotloop. Approved recipients and current
template versions remain open source dependencies; transcript wording is not a production template.

### Cadence (anchored to lease end date) — **(JH 2026-06-20)**

For a lease due for renewal in **~2 months** (ends on the last day of a month):

1. Create the row in the spreadsheet from Rentvine.
2. Build the owner package (info + screenshot, verify against Zillow).
3. Get **owner** approval.
4. Update the lease agreement and **send it to the tenant by the 15th** of the relevant
   month.
5. Continuous multi-channel comms until signed. Tenants need a **minimum 30 days** to sign
   (they may sign earlier, e.g. once funds are in; they are not required to sign before the
   30 days elapse).

## 2. Confirmed Facts and Requirements

- **[CERTAIN] Rentvine is the system of record** for lease dates, current rent,
  party/property context, and tenant messaging (@00:16:23, @00:21:50).
- **[CERTAIN] Renewal-timing source = Rentvine lease record; executed signed leases live in
  Dotloop** **(JH 2026-06-20)** (resolves the earlier "where do signed leases live" unknown).
- **[CERTAIN] Two-step approval gating:** owner direction precedes tenant-facing commitments;
  tenant agreement precedes document build-out (@00:27:14, @00:41:09).
- **[CERTAIN] Human review is mandatory** before sends and final execution; admin (Dan) is
  final approver. **A Dan-settable "secondary approver" is an admin function** **(JH 2026-06-20)**.
- **[CERTAIN] Multi-channel delivery** for every tenant communication (Gmail + portal chat +
  SMS) (@00:36:56).
- **[CERTAIN] Cadence:** ~2 months out create the row; owner approval first; tenant offer by
  the **15th**; ≥**30 days** for the tenant to sign **(JH 2026-06-20)** (see §1 Cadence).
- **[CERTAIN] Missouri security deposit = 2× monthly rent.** Rhino / The Guarantors are
  deposit-**replacement** coverage (owner-protecting insurance), **not** renters insurance;
  some coverage requires **annual renewal** (@00:43:03, @00:49:49).
- **[CERTAIN] Lead-based-paint disclosure** required for **pre-1978** buildings and on
  **non-KCR** contracts (@01:03:16, @01:18:43).
- **[CERTAIN] Document set depends on tenant origin** (simple renewal vs inherited full set)
  plus jurisdiction/condition addenda (@00:58:45, @01:00:08).
- **[CERTAIN] Prorated rent** for a partial first month = **(monthly rent ÷ days in that
  month) × days occupied**, added to the initial charges **(JH 2026-06-20)**.
- **[CERTAIN] Charge/fee values are variable by property** — the KB/app must treat RBP,
  insurance, leasing fee, processing fee as **"see Rentvine/system" placeholders**, never
  hard-coded amounts **(JH 2026-06-20)**.
- **[TENTATIVE → pending] Current approved templates** (owner / tenant / build-out) — Josiah
  is obtaining them **~Tue 2026-06-23** and will drop them into a PMI KC Drive source folder when
  ready; treat current transcript wording as outdated until then **(JH 2026-06-20)**.

## 3. Verified Links, APIs, Systems, and Dependencies

| System                                           | Role (observed/confirmed)                                                                                   | Notes / status                                                                                                                            |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Renewal tracking spreadsheet** (Google Sheets) | **Operational source of truth / cross-team dashboard** (§A)                                                 | Read connector + approval-gated stable write-back are the design center; link not committed; connector access blocked (account mismatch). |
| **Rentvine**                                     | System of record; lease dates, rent, messaging, renewal/rent-increase write, building/unit/portfolio levels | Read-authoritative; **renewal-writeback undocumented/gated**. Renewal-timing source.                                                      |
| **Dotloop**                                      | Document package + e-signature; **home of executed signed leases**                                          | Signature-state lifecycle TBD.                                                                                                            |
| **PMI KC website Free Rental Analysis tool**     | Authoritative market-value **number** on the sheet                                                          | Corporate-controlled; **was down**; **fallback = Zillow + manual verification + approval** (JH).                                          |
| **Zillow "price my rental"**                     | Comp **range** + active-listing map                                                                         | Free, public; supporting + fallback context.                                                                                              |
| **Gmail templates**                              | Owner / tenant / build-out hand-off; fields manually filled **from the spreadsheet**                        | Outdated; current versions arriving ~Tue 2026-06-23. Auto-draft from sheet data is the target (§6).                                       |
| **Rhino / The Guarantors**                       | Deposit-replacement coverage; team-activated via apply link                                                 | Annual renewals on some coverage; Rhino largely phased out.                                                                               |
| **Second Nature**                                | Third-party renters-insurance addendum                                                                      | Current insurance program on renewals.                                                                                                    |
| **Pet-registration third party**                 | Pet + service-animal verification                                                                           | Conditional addendum.                                                                                                                     |
| **Google form**                                  | Tenant intake (occupancy, contacts)                                                                         | Feeds lease fields.                                                                                                                       |

No credentials/endpoints/API behaviors asserted beyond what's supported. Rentvine
renewal-writeback remains **[OPEN]** / vendor-confirmation-required.

## 4. Observed Process vs. Intended Process

- **The spreadsheet IS their database (observed) vs a future app DB (intended).** The design
  must start by reading/augmenting the spreadsheet, not replacing it — adoption and trust for
  the non-technical remote team depend on it (§A). The eventual app-managed DB is an
  end-state, reached only after the connector + flags + approval gates are trusted.
- **Single source of truth (intended) vs data scattered (observed).** Data comes from
  Rentvine, the spreadsheet, move-in forms, and building-level fields, with real **conflicts**
  (e.g. lawn care HOA vs tenant) and frequent manual-entry errors (@01:08:42). See §6 for the
  recommended reconciliation design.
- **"Start small" matches the low-risk wins.** Market-value calc + drafting owner/tenant
  emails before if-then document logic (@01:11:07) — consistent with the product doc's
  read/gather-first staging and with the spreadsheet-augment-first strategy.
- **Renewal writeback: observed manual, intended gated.** Build-out admin does it in Rentvine
  manually; product doc keeps it non-executable until vendor confirmation — aligned.
- **Approvals: observed informal, intended structured.** Today approval is the admin
  eyeballing a large backlog; the design needs an explicit, **frictionless approval space**
  (§5) capturing real approval points (owner direction → tenant agreement → pre-send → final
  execution) (@00:40:15, @01:17:38).
- **QC example (sanitized).** An inherited-tenant renewal where staff first marked the deposit
  "not needed" (right for a plain renewal, wrong for a full inherited set); the build-out
  admin escalated to the full lease and caught the lead-paint addendum, the landlord entity,
  and the deposit amount — the exact failure modes the flag/approval design must guard
  (@01:15:25–@01:20:53).

## 5. Production Considerations

- **Auth/authorization (live).** KB on `pmi-kc-kb-prod` (Cloud Run), Firebase Google OAuth
  **locked to `pmikcmetro.com`**, HTTP-only session cookies, least-privilege runtime SA,
  build-env guard (`ASK_DEMO_MODE=false`). Only PMI staff read anything fed to the live Ask.
- **Approval space (Dan's explicit concern — build this in cleanly).** **(JH 2026-06-20)**
  Teams send items to the admin for approval; the admin unblocks them. Each approval item
  must be **virtually frictionless** for the admin and contain, in one place: what needs
  approving; **where the team got the information and how to verify it** (e.g. a deep
  Rentvine link to that specific client, the spreadsheet row/cell, the comp source); a
  one-action approve that **kicks the item back to the team member as unblocked**; and a
  **write to the spreadsheet** of the status (`awaiting approval` → `approved`). A
  Dan-settable **secondary approver** is an **admin function**.
- **Spreadsheet write-back reliability.** Any write to the sheet must be deterministic and
  **100% correct** (right tab, right cell), verified read-after-write, never guessed. Failure
  → a `Blocked` item, never a wrong write.
- **Data governance (APPLIED 2026-06-20 to AGENTS.md Security Rules).** **(JH 2026-06-20)**
  Real (previously-vetted) client data inside the operational spreadsheet **may be read and
  used as test/training input** to improve deterministic rules and models, and for read-only
  follow-up Rentvine/Dotloop queries — provided it stays out of git, stays out of
  user-facing/model outputs without human approval, and access stays within the authenticated
  `pmikcmetro.com` boundary. We may **train/test on** the data; we do not **emit/act on** it
  autonomously. No-customer-data-in-git, human-send authority, and approval-gated write-back
  remain in force.
- **API reliability.** PMI Rental Analysis tool is unreliable; production logic treats it as
  optional with the Zillow + manual + approval fallback.
- **System-of-record write gates.** No autonomous send; no writes to Rentvine, Dotloop,
  Gmail, etc. The first new write surface is the **approval-gated spreadsheet write-back**.
  Rentvine renewal-writeback stays non-executable until vendor-confirmed + per-action spec.
- **Auditability.** Approval decisions, owner direction, and conflict resolutions logged
  (append-only, matching the product-doc Activity model).
- **Demo→prod drift.** Transcript dollar figures and outdated templates labeled
  non-authoritative.

## 6. Improvement Opportunities & Recommended Designs

### 6.1 Data-conflict resolution — recommended design (critical issue)

> Full, review-hardened design (ingest, reconciliation, approval-gated write-back, phasing):
> [`lease-renewal-connector-design.md`](lease-renewal-connector-design.md).

Goal: when the same fact disagrees across sources (the lawn-care HOA-vs-tenant case),
resolve it once, safely, and **fix it at the source** so it stops recurring — without
asking the non-technical team to trust an opaque dashboard. Builds on the product doc's
existing conflict model (block on conflict; human picks source or enters a value; resolution
logged; corrected value spawns a source/process update).

**Phase 1 — read + reconcile + flag (no writes):**

- The connector reads Rentvine + the spreadsheet (+ forms/building level) and runs
  **deterministic field-reconciliation checks** per renewal run.
- A documented **source-precedence default** (e.g. building-level Rentvine > spreadsheet for
  property attributes; owner email-of-record > spreadsheet for the renewal decision) yields a
  **suggested** winner — but it is never auto-applied for high-severity (legal/financial/
  timing) fields.
- On conflict, raise a **flag** on the workflow-run page and as an **approval-queue item**
  showing each conflicting value + its source + a **deep verification link** (Rentvine
  client, spreadsheet cell/row, form), severity, and the suggested winner.
- Resolution is **flag → choose → correct-at-source** (your instinct, refined): the human
  **picks the winning source OR enters a corrected value**, with a required reason. A pure
  A/B button is insufficient because sometimes **neither** value is right — so always include
  an "enter correct value" path. High-severity → admin (Dan/secondary approver) required;
  low-severity → one-click after review.
- Two outputs: (1) the decision is **logged** (who/why/source/value/timestamp); (2) a
  **proposed source correction** is generated (initially a suggested, approval-gated
  spreadsheet write and/or a "fix in Rentvine" flag).

**Phase 2 — approval-gated write-back (after Phase 1 is trusted):**

- On resolution, write the agreed value to the **exact** spreadsheet cell with the
  `awaiting approval` → `approved` status, deterministically verified. This is the moment the
  app starts _correcting the source_ and closing the recurrence loop.

**Why this is the best fit:** it augments the spreadsheet rather than replacing it (preserves
trust/adoption); it is deterministic where correctness matters (matches the 100%-write
requirement); it centralizes evidence + verification links in the approval space (Dan's
need); and the correct-at-source loop reduces recurrence. It degrades safely (missing
map/source → `Blocked`, not a wrong write). It is the visible "catches what the team missed"
behavior that earns trust.

### 6.2 Spreadsheet connector & semantic map (foundational)

Decompose the sheet into tabs/columns/cells with documented meaning; build a stable read
connector; treat the sheet as a status/attention indicator. Prerequisite for 6.1's
reconciliation and 6.3's auto-drafting. **Built 2026-06-20 →**
[`lease-renewal-spreadsheet-map.md`](lease-renewal-spreadsheet-map.md). Key findings: 18 tabs
(far beyond renewals); pervasive header/data mismatches (so the connector must key on content,
not headers); concrete cross-source conflicts (inspection cadence in two tabs, lawn-care
responsibility) that drive §6.1; and plaintext-credential tabs (4 & 7) the connector must
hard-exclude.

### 6.3 Template auto-draft from spreadsheet data — **(JH 2026-06-20)**

Templates today are filled **manually from the spreadsheet** — ideal for automation.
Interim win: **draft** owner/tenant/build-out emails from sheet (+ Rentvine) data for human
verification. End state: a Gmail connector where the team runs a `/command` with the client

- process and gets the completed draft back for approval. Preserves human send authority.

### 6.4 Other proposed opportunities

- **Off-cycle end-date detector** so mid-month lease ends aren't missed.
- **Document-set recommender** encoding the if-then rules as a reviewable checklist.
- **Deposit-replacement renewal tracker** flagging annual-renewal coverage before it lapses.
- **Admin-led capture** of the exact Rentvine renewal + rent-increase steps before any
  writeback design.

## 7. Risks, Unknowns, and Conflicts

- **RESOLVED — raw transcript is gitignored, not committed.** `docs/context_and_calls/` is in
  `.gitignore`; the earlier "PII in git" concern does not apply. The raw `.txt` is kept
  locally (user decision). Residual: PII exists in non-git local copies only.
- **RESOLVED — placement.** This reference now lives in tracked `docs/products/`.
- **RESOLVED — governance.** AGENTS.md Security Rules amended (train/test-on-real-data, not
  emit); see §5.
- **RESOLVED — spreadsheet access.** Drive connector reconnected to `josiah@pmikcmetro.com`
  (2026-06-20); sheet read and mapped ([`lease-renewal-spreadsheet-map.md`](lease-renewal-spreadsheet-map.md)).
  The durable identity policy is in [`../auth-identity-and-access-strategy.md`](../auth-identity-and-access-strategy.md).
- **SECURITY — plaintext credentials in the sheet.** Tabs 4 & 7 hold plaintext WiFi +
  platform logins/PINs. Connectors must hard-exclude them; recommend moving them to a password
  manager / Secret Manager out of a shared sheet.
- **WRITE-BACK RISK.** A spreadsheet write to the wrong cell/tab would corrupt the team's
  source of truth and destroy trust. Mitigation: deterministic cell map + read-after-write
  verification + approval gate + `Blocked`-on-uncertainty.
- **ADOPTION RISK.** A buggy or replacing dashboard would be abandoned by the non-technical
  remote team. Mitigation: augment-first, earn trust via accurate flags.
- **CONFLICT — data sources disagree** (lawn care HOA vs tenant, etc.); no resolution rule
  today → addressed by §6.1.
- **UNKNOWN — Rentvine renewal-writeback** API capability (gated).
- **UNKNOWN — exact spreadsheet cell semantics** (the §6.2 map; blocked) and the current
  approved template wording (arriving ~Tue 2026-06-23).
- **DO-NOT-REUSE.** Transcript dollar figures and template wording (outdated/illustrative);
  any customer-specific identifiers; GCP billing-access troubleshooting; off-topic chat.

## 8. Open Questions for the Next Refinement Round

**Resolved this round:** market-tool fallback; conflict approach (§6.1); fee handling
(placeholders); prorated-rent rule; signed-lease location (Dotloop); secondary approver
(admin function); cadence; placement (`docs/products/`); governance amendment (applied).

**Still open:**

1. **Connector design from the map** — build the content-keyed tab/column schema and the §6.1
   reconciliation rules from [`lease-renewal-spreadsheet-map.md`](lease-renewal-spreadsheet-map.md)
   (the access blocker is resolved; map is built).
2. The current approved **owner/tenant/build-out templates** (arriving ~Tue 2026-06-23).
3. Who specifically can be the **secondary approver(s)**, and any rules for when the admin is
   unavailable?
4. Confirm the **source-precedence defaults** for §6.1 reconciliation (which source wins for
   which field type, before human override).
5. Should §1–3 be distilled into a separate sanitized **Ask source** now, or after the
   templates land?
