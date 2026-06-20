# Move-In & Move-Out — Process Reference (Sanitized, Source-Grounded)

Status: **Reference** — discovery/process documentation, **not a build authorization**.
Sensitivity: **Low** (sanitized — no customer identifiers, no credentials, no real-person
dollar figures).
Cleaned: 2026-06-20.

Sources (this doc's only grounding; every process statement traces to one of these):

- [`lease-renewal-spreadsheet-map.md`](lease-renewal-spreadsheet-map.md) — the operational
  sheet's tab-by-tab map (**Tab 1 = Move-In Checklist**, **Tab 2 = Move-Out Checklist** are
  the primary sources here).
- [`lease-renewal-discovery-reference.md`](lease-renewal-discovery-reference.md) — renewal
  flow + the shared document/build-out mechanics that move-in and move-out reuse.
- [`lease-renewal-connector-design.md`](lease-renewal-connector-design.md) — the read-only
  connector, conflict reconciliation, tool-role map, and the §4.0 write-back controls.
- [`lease-renewal-agent.md`](lease-renewal-agent.md) — product-lane gates, the confidence
  ladder, and the "Do Not Build Yet" list.
- [`pmi-kc-kb.md`](pmi-kc-kb.md) — the production Spaces (Move-Out + Deposit Disposition and
  Owner Onboarding already exist as Spaces).

> **Certainty markers** (same convention as the discovery reference). **[CERTAIN]** =
> grounded in a source doc above. **[TENTATIVE]** = implied/partial in the sources.
> **[OPEN]** = not yet documented in the sources — explicitly flagged, never guessed.
> Spreadsheet column references quote the map's verbatim header text where the map quotes it.

---

## 1. Purpose & Scope

**Purpose.** A clean, source-safe reference for PMI KC's tenant **Move-In** and **Move-Out**
lifecycles and how they connect to **Lease Renewal**. It exists so move-in/move-out are
documented as standalone processes — the discovery reference deliberately scoped them only as
_shared/branch_ steps off renewal ("Move-in/move-out are not documented as standalone
processes" — discovery-ref §Scope). This doc fills that gap from the same grounded sources,
without inventing steps.

**Scope.** End-to-end move-in and move-out as encoded in the operational tracking spreadsheet
(map Tab 1, Tab 2) plus the shared build-out/Dotloop mechanics the discovery reference
documents (discovery-ref §1 steps 11–15, marked _shared with move-in_). PadSplit per-room
move-in/move-out (map Tabs 4, 5) is **out of scope** here except by reference; credential
tabs **4 and 7 are hard-excluded and are not described** (map top warning; connector-design
§1.2).

**What this is / isn't.** This is process documentation for discovery, mirroring the agent.md
**"Do Not Build Yet"** gate: no runtime behavior, no system-of-record writes, no autonomous
sends are authorized by this doc (agent.md "Do Not Build Yet"; connector-design §1.2 "Read-only
design; no execution"). Where a process detail is not in the sources, it is marked **[OPEN]**.

---

## 2. Lifecycle Overview

The tenant lifecycle is a multi-system chain the team manages through one constantly-edited
Google Sheet, **"Tenant Move In/Out/Renewal Checklist"** (owner `dan@pmikcmetro.com`), which
functions as the team's operational **database of truth / cross-team dashboard** — not a side
artifact (discovery-ref §A; map line 3, §A). The lifecycle:

```
Move-In  ──►  Renewal(s)  ──►  Move-Out
 (Tab 1)       (Tab 3)          (Tab 2)
```

- **[CERTAIN]** The shared join key across Move-In → Renewals → Move-Out is the
  **tenant/lease name** (the lease lifecycle); name formats are inconsistent, so matching is
  unreliable (map §5).
- **[CERTAIN]** The spreadsheet is the **control plane**: each lifecycle is one tab of
  yes/blank completion flags plus free-text state, with rows hyperlinked back to Rentvine
  (map §1, §3; discovery-ref §A). In the integration tool-role map, **Sheets = exception /
  control plane, not authoritative; Rentvine stays read-authoritative** (connector-design §5.1).
- **[CERTAIN]** The handoff between lanes is explicit in the sheet: Renewals → Move-Out when a
  tenant has **"decided to move out"** (map §5; discovery-ref §1 step 7 "Moving out → move row
  to the move-out sheet"). Move-In and Renewals both **"add them to the Inspection Tracker"**
  (Tab 17), tying the lifecycle to the ongoing inspection cadence (map §5).
- **[CERTAIN]** Both lifecycles already exist as product Spaces in scope: **Move-Out + Deposit
  Disposition** is a first production Space, and **Owner Onboarding** is the likely fourth
  Space (pmi-kc-kb.md "first production Spaces"; agent.md notes the run-page pattern "should
  later apply to Maintenance and Move-Out").

---

## 3. Move-In Process

Grounded in **Tab 1 — Move-In Checklist** (~112 rows, 22 columns; map §1, §2 Tab 1) plus the
_shared with move-in_ build-out mechanics (discovery-ref §1 steps 11–15). Tab 1 is one row per
move-in capturing onboarding steps: fees, docs, inspection, keys, welcome (map line 29).

> **Header caution (high risk).** Do not trust Tab 1 headers literally: the **`Move in date`
> column holds tenant emails, not dates** (header/data mismatch), and the `f` column holds
> timestamps (map §2 Tab 1, §7). Any reader must key on content, not header text
> (connector-design §2.5).

### 3.1 Numbered steps (grounded in Tab 1 + shared build-out)

1. **[CERTAIN] Intake form / tenant info.** A move-in **Google Form** gathers tenant info
   (occupancy, contacts); this feeds lease fields. Tab 1 carries a `form` yes-flag, and the
   discovery reference confirms the Google Form as tenant intake that "feeds lease fields"
   (map §2 Tab 1 "form" flag, §6 "Document set: Google Form → lease/PMA docs"; discovery-ref
   §3 Google form row; §1 step 13 "occupancy/ages + emergency contact (from the move-in form)").
2. **[CERTAIN] Collect onboarding documents & screening.** Tab 1 tracks yes-flags for
   **processing fee, driver's license (DL), paystub, PetScreening,** and **utility proof**
   (map §2 Tab 1). PetScreening is the third-party pet/service-animal verification used across
   the lifecycle (map §4; discovery-ref §3 "Pet-registration third party").
3. **[CERTAIN] Build the lease document set (build-out hand-off).** _Shared with renewal._ The
   lease package is built in **Dotloop** by the build-out admin ("Leah" in the sheet's free
   text); a named loop is created, tenant parties added (name/email/phone, role = tenant), the
   lease-agreement template selected, and the document set assembled per the
   "it-depends" logic (discovery-ref §1 steps 11–12; map §4 "Dotloop/'Leah'"). See §5 for the
   shared document-set and error-prone-field detail.
4. **[CERTAIN] Deposit / deposit-replacement posture.** Tab 1 records a **`Guarantors Policy
locking them in?`** flag — i.e., whether a deposit-**replacement** policy (The Guarantors /
   Rhino) covers the tenant rather than a cash deposit (map §2 Tab 1; discovery-ref §2 "Rhino /
   The Guarantors are deposit-**replacement** coverage … not renters insurance"). _(Missouri
   security deposit = 2× monthly rent is the documented policy fact — discovery-ref §2.)_
5. **[CERTAIN] E-signature gate.** `Have all documents been signed electronically?` is the
   **signature gate** on Tab 1; signing is via **Dotloop** e-signature only (map §2 Tab 1
   "signature gate"; discovery-ref §1 step 15 "Send for signature via Dotloop (e-signature
   only)").
6. **[CERTAIN] Certified-funds (money) gate.** `Have we received certified funds...` is the
   **money gate** on Tab 1 — move-in is not completed until funds are confirmed (map §2 Tab 1
   "money gate").
7. **[CERTAIN] Inspection setup.** Tab 1 includes an **inspection-tracker add** (cross-tab to
   Tab 17) and a **zInspector link** (map §2 Tab 1; map §4 lists zInspector among the
   cross-system references). This mirrors the renewal/owner-onboarding pattern of adding the
   unit to the inspection cadence (map §5).
8. **[CERTAIN] Key handoff.** Tab 1 records a **key handoff** step (map §2 Tab 1). Per-property
   key location/copies/Kwikset status live in the separate **Key Tracker** (Tab 13), keyed by
   address (map §1 Tab 13, §5). **[OPEN]** smart-lock provisioning detail — see §3.3.
9. **[CERTAIN] Welcome communication (multi-channel).** Tab 1 sends a **welcome letter "by
   email and by Portal Chat"** (map §2 Tab 1; map §6 "Move-In (welcome 'email + Portal Chat')").
   This is consistent with the tenant-comms multi-channel rule (§3.2).
10. **[CERTAIN] Disable the listing.** Tab 1 ends move-in with a **listing-disable** step (turn
    off the active listing once the unit is filled) (map §2 Tab 1 "listing disable").

### 3.2 System connections (Move-In)

- **[CERTAIN] Google Form** — tenant intake feeding lease fields (step 1; discovery-ref §3).
- **[CERTAIN] Rentvine** — read-authoritative system of record for lease/party/property
  context; building-level data (year built → lead paint, lock counts, utilities/lawn-care
  responsibility, inspection info) lives at the **building level** and flows down into the lease
  (discovery-ref §1 step 14; §2; map §4). Move-in does **not** propose any Rentvine write here.
- **[CERTAIN] Dotloop** — document package + e-signature; **home of executed signed leases**
  (steps 3, 5; discovery-ref §2, §3).
- **[CERTAIN] Gmail + Rentvine portal chat** — welcome letter goes out "by email and by Portal
  Chat" (step 9; map §2 Tab 1). The renewal lane's documented multi-channel rule (Gmail +
  portal chat + SMS) is the broader tenant-comms pattern (discovery-ref §1 step 6, §2);
  **[TENTATIVE]** whether move-in welcome additionally uses SMS is not stated for Tab 1
  specifically (map records only "email and Portal Chat").
- **[CERTAIN] zInspector** — referenced as the move-in inspection link/tool (step 7; map §2
  Tab 1, §4).
- **[OPEN] Smart-lock / keys system** — see §3.3.

### 3.3 Under-documented in Move-In

- **[OPEN] Smart-lock / TTLock / Kwikset provisioning.** The sheet stores Kwikset/lock status
  in **Tab 18 (Property Attributes — `Updated to Kwickset Smart Locks` (sic))** and key
  locations in **Tab 13 (Key Tracker)**, and TTLock appears only inside the **excluded
  credential tabs (4 & 7)** (map §1, §2 Tab 18; connector-design §1.2). The exact move-in
  smart-lock setup / code-provisioning workflow is **not documented** and must not be inferred
  from the credential tabs.
- **[OPEN] Move-in inspection workflow detail** (what zInspector captures, who reviews, SLA) —
  not in the sources.
- **[OPEN] Processing-fee / move-in fee amounts** — variable by property; the sources require
  treating fee values as "see Rentvine/system" placeholders, never hard-coded
  (discovery-ref §2 "Charge/fee values are variable by property").
- **[OPEN] Move-in timing/SLA** (e.g., how far before move-in the form/funds/keys are due) —
  no cadence is documented for move-in (the documented cadence is renewal-only — discovery-ref
  §1 Cadence).

---

## 4. Move-Out Process

Grounded in **Tab 2 — Move-Out Checklist** (~80 rows, 28 columns; map §1, §2 Tab 2) plus the
discovery-ref branch step (discovery-ref §1 step 7). Tab 2 sequence: **notice → inspection →
deposit disposition → relisting** (map line 30).

> **Header caution.** Tab 2's `Name` column is **[PII]**; scheduled vs actual vacate dates use
> mixed formats; status lives in free text inside cells (map §2 Tab 2, §7).

### 4.1 Numbered steps (grounded in Tab 2 + discovery-ref branch)

1. **[CERTAIN] Notice / exit trigger.** `Have they put in their notice?` records the exit
   trigger, with values `yes` / a date / **`eviction`** / **`abandonment`** (map §2 Tab 2). The
   move-out row originates by handoff from Renewals when a tenant "decided to move out"
   (discovery-ref §1 step 7; map §5).
2. **[CERTAIN] Scheduled vs actual vacate dates.** Tab 2 tracks **scheduled** and **actual**
   vacate dates (map §2 Tab 2; map §6 lists Move-Out `Scheduled Move out date` as a
   cadence/timing field).
3. **[CERTAIN] Move-out document set (Dotloop).** Tab 2 carries **Dotloop move-out
   instructions** (map §2 Tab 2). _Shared Dotloop mechanics — see §5._ **[OPEN]** the **exact
   move-out Dotloop document set** is not enumerated in the sources (the discovery ref details
   the _renewal/move-in_ document set, not move-out's).
4. **[CERTAIN] Conditional coordination charge.** A **conditional "4265 coordination charge"**
   applies **"if they are in one of our lease docs"** (map §2 Tab 2; the same "4265
   coordination charge" phrase is a Move-Out fingerprint anchor in connector-design §2.4). The
   charge is conditional on lease-document status; the literal amount/label is treated as a
   sheet token, not a hard-coded fee (discovery-ref §2 fee-placeholder rule).
5. **[CERTAIN] Move-out inspection.** Tab 2 sends an **inspection email via the portal, cc Dan**
   (map §2 Tab 2). This is the move-out inspection notice to the tenant. **[OPEN]** the
   inspection scheduling/turnaround detail (Tab 9 "Inspection Scheduling Outreach" and Tabs
   17/18 hold cadence, but the move-out-specific inspection SLA is not documented — map §1).
6. **[CERTAIN] Rentvine lease close / charge & reporting changes.** Tab 2 records explicit
   **RentVine actions**: `Turn off Auto Charges`, `Disable Credit reporting + close lease`, and
   **stop the Second Nature filter program** (the sheet shows this as an email to a Second
   Nature contact) (map §2 Tab 2; map §4 "Second Nature (filters/RBP)"). **[CERTAIN]** these are
   recorded as steps the team performs in Rentvine; **no Rentvine write is proposed as
   executable by the app** (connector-design §1.2; agent.md "Do Not Build Yet").
7. **[CERTAIN] Lock change + owner charge.** Tab 2 records a **lock change with an owner
   charge** (map §2 Tab 2). Owner-billing for property work is gated elsewhere too (e.g.
   Tab 17's `$130 charge to owner ... added to the invoice sheet?` is an **owner-billing gate**
   — map §2 Tab 17); the move-out lock-change owner charge follows the same owner-billing
   pattern. **[OPEN]** exact lock-change cost/vendor flow (not documented; lock detail lives in
   Tab 18 and the excluded credential tabs).
8. **[CERTAIN] Deposit disposition (deposit gate).** `Deposit disposition sent` is the
   **deposit gate** on Tab 2 (map §2 Tab 2). This is the core of the existing **"Move-Out +
   Deposit Disposition"** Space (pmi-kc-kb.md). It is one of the connector's named
   **approval-gate candidates** ("deposit disposition sent") (map §6). **[OPEN]** the
   deposit-disposition calculation/itemization workflow (charges back, timelines) is not
   documented.
9. **[CERTAIN] Deposit-replacement claim (conditional).** `Submit Rhino Claim` appears on
   Tab 2 — i.e., if a deposit-replacement policy (Rhino / The Guarantors) was in force, file the
   claim (map §2 Tab 2; map §6 "Move-Out (… Rhino claim)"). Conditional on the tenant having had
   such a policy. **[OPEN]** the end-to-end deposit-replacement **claim workflow** (evidence,
   submission portal, timelines) is not documented (Rhino is also noted as "largely phased out"
   — discovery-ref §3).
10. **[CERTAIN] Collections.** Tab 2 records a **collections** step for unpaid balances
    (map §2 Tab 2). **[OPEN]** the collections process/vendor detail is not documented.
11. **[CERTAIN] Final gate / relisting.** `everything finalized?` is the **final gate** on
    Tab 2 (map §2 Tab 2; an approval-gate candidate "everything finalized?" in map §6). The
    move-out tab's stated purpose ends in **relisting** (map line 30). **[OPEN]** the explicit
    relisting/turn steps for a standard (non-PadSplit) unit are not enumerated in Tab 2;
    PadSplit room-turn/relisting lives in the out-of-scope Tab 5 (map §1).

### 4.2 System connections (Move-Out)

- **[CERTAIN] Rentvine** — lease close, auto-charge off, credit-reporting off; read-authoritative
  SoR (step 6; map §2 Tab 2, §4; connector-design §5.1).
- **[CERTAIN] Dotloop** — move-out document instructions; signed-doc home (step 3; map §2 Tab 2;
  discovery-ref §2).
- **[CERTAIN] Gmail / Rentvine portal** — inspection email via portal, cc Dan (step 5; map §2
  Tab 2). Tenant communication channels = email + portal chat (map §6; discovery-ref §1 step 6).
- **[CERTAIN] Second Nature** — filter/RBP program stopped at move-out via a contact email
  (step 6; map §2 Tab 2, §4).
- **[CERTAIN] Rhino / The Guarantors** — deposit-replacement claim if applicable (step 9; map §6;
  discovery-ref §3).
- **[OPEN] Lock-change vendor / smart-lock reset** and **collections vendor** — not documented.

### 4.3 Under-documented in Move-Out

- **[OPEN]** Exact **Dotloop move-out document set** (step 3).
- **[OPEN]** **Deposit-disposition** itemization/timeline workflow (step 8).
- **[OPEN]** **Deposit-replacement (Rhino/Guarantors) claim** workflow end-to-end (step 9).
- **[OPEN]** **Lock-change** cost/vendor + smart-lock reset detail (step 7).
- **[OPEN]** **Collections** process (step 10).
- **[OPEN]** **Relisting/turn** steps for standard units, and any **SLAs/timing** for the whole
  move-out chain (no move-out cadence is documented — contrast renewal's documented cadence,
  discovery-ref §1 Cadence).

---

## 5. Shared Mechanics with Lease Renewal

The discovery reference marks several renewal steps **_(shared with move-in)_** — they apply to
move-in (lease execution) and inform move-out (lease close / hardware). Cross-referenced here
rather than duplicated; see [`lease-renewal-discovery-reference.md`](lease-renewal-discovery-reference.md)
§1 steps 11–15 and §2 for the authoritative detail.

- **[CERTAIN] Dotloop document-set logic ("it depends").** Existing in-system tenant / simple
  case → keep the minimal set (extension + insurance program addendum) and archive the rest;
  **inherited lease** → run the **entire** set. Conditional addenda: Independence addendum;
  Kansas City addendum; **lead-based-paint disclosure** (pre-1978 buildings and on non-KCR
  contracts); pet registration + service-animal verification; shared-utility-meter addendum;
  standard addenda (bed bug, mold, broker agency) (discovery-ref §1 step 12, §2). This is the
  logic behind the **move-in** document build; the **move-out** document set is **[OPEN]** (§4
  step 3).
- **[CERTAIN] Error-prone lease fields (manual, frequently missed).** Landlord **LLC** name vs
  owner's personal name; real-property items (appliances); property address;
  fixed-vs-month-to-month checkbox; assigning all tenants + initialing pages; new monthly rent;
  **prorated** rent for mid-month starts; **security deposit (+ pet deposit)**; the
  **deposit-replacement** checkbox/amount; owner-paid utility one-offs; occupancy/ages +
  emergency contact (from the move-in form); and lawn/snow/trash responsibility (landlord vs
  tenant vs HOA) (discovery-ref §1 step 13, §4 QC example). Prorated rent = (monthly rent ÷ days
  in month) × days occupied (discovery-ref §2). These same fields gate a clean **move-in**.
- **[CERTAIN] Building-level data flows down.** Year built (→ lead paint),
  lawn-care/utilities responsibility, inspection info, and **entry-door/lock counts (move-out
  hardware)** live at the **building** level in Rentvine and should flow down (discovery-ref
  §1 step 14) — explicitly tying building data to move-out hardware.
- **[CERTAIN] E-signature tracking + closeout.** Send for signature via **Dotloop**
  (e-signature only); track signers by required party (tenant/owner/admin); color-coded sheet
  status (green = all signed); hide the row when complete (discovery-ref §1 step 15). Each
  checklist — Move-In, Renewals, **and** Move-Out's document steps — uses the same
  `Have all documents been signed electronically?` signature flag (map §6 "Signature tracking").
- **[CERTAIN] Build-out hand-off.** The build-out admin assembles the Dotloop package and
  performs the Rentvine lease change; the renewal lane flags the exact Rentvine click-path as
  **[OPEN]** pending an admin-led demo (discovery-ref §1 step 10). The analogous move-in lease
  creation and move-out lease close click-paths are likewise **[OPEN]** (§3 step 3, §4 step 6).

---

## 6. Connections That Matter Now

System → role for move-in/move-out, consistent with the integration tool-role map
(connector-design §5.1; discovery-ref §3; README §Rules). No interchangeability: each system
has one role.

| System                                                    | Role for move-in / move-out                                                                                                                                                                                           | Grounding                                                         |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Rentvine**                                              | **Read-authoritative system of record** — lease dates, party/property context, building-level fields; move-out lease close / auto-charge off / credit-reporting off are recorded steps, **not app-executable writes** | discovery-ref §2–3; map §2 Tab 2, §4; connector-design §1.2, §5.1 |
| **Dotloop**                                               | **E-signature + home of executed signed leases** — move-in document package; move-out document instructions                                                                                                           | discovery-ref §2–3; map §2 Tabs 1–2, §4                           |
| **Tracking spreadsheet** (Google Sheets)                  | **Operational control plane / cross-team dashboard** — Tab 1 move-in, Tab 2 move-out; status flags + free-text state; **exception surface, not authoritative**                                                        | discovery-ref §A; map §A, §1; connector-design §5.1               |
| **Gmail**                                                 | Owner/tenant/contact email (welcome letter, inspection email cc Dan, Second Nature stop email); fields filled from the sheet                                                                                          | map §2 Tabs 1–2, §6; discovery-ref §3                             |
| **Rentvine portal chat**                                  | In-portal tenant channel (welcome "Portal Chat", inspection email via portal)                                                                                                                                         | map §2 Tabs 1–2, §6; discovery-ref §1 step 6                      |
| **Google Form**                                           | Tenant move-in intake → feeds lease fields                                                                                                                                                                            | discovery-ref §3; map §6                                          |
| **Second Nature**                                         | Renters-insurance/filter (RBP) program — set up at move-in, stopped at move-out                                                                                                                                       | map §2 Tabs 1–2, §4; discovery-ref §3                             |
| **Rhino / The Guarantors**                                | Deposit-**replacement** coverage — move-in posture, move-out claim                                                                                                                                                    | discovery-ref §2–3; map §6                                        |
| **PetScreening**                                          | Pet / service-animal screening (move-in)                                                                                                                                                                              | map §2 Tab 1, §4                                                  |
| **zInspector**                                            | Move-in inspection link/tool                                                                                                                                                                                          | map §2 Tab 1, §4                                                  |
| **Key Tracker / Property Attributes** (sheet tabs 13, 18) | Key location/copies + lock/Kwikset status (keyed by address)                                                                                                                                                          | map §1, §2 Tab 18, §5                                             |
| **Credential tabs 4 & 7**                                 | **HARD-EXCLUDED** — never read, echoed, or described (WiFi/platform/TTLock creds)                                                                                                                                     | map top warning; connector-design §1.2                            |

**[CERTAIN] Read-only connector + approval-gated write-back applies to these lifecycles too.**
The same constraints from the connector design govern move-in/move-out: the connector is
**read-only** and **augments** the sheet, never replaces it; the **only** new write surface is
the Phase-2 spreadsheet write-back, which stays **admin-enabled (off by default), permission-
scoped to console users, and suggest-then-button-press for every write** — deterministic,
structurally re-anchored, read-after-write verified, `Blocked`-on-uncertainty, with **no trust
level that converts a suggestion into an automatic write** (connector-design §4.0; §1.2). No
Rentvine/Dotloop/Gmail writes are proposed as executable (agent.md "Do Not Build Yet";
connector-design §1.2).

---

## 7. Open Questions / Under-Documented Gaps

What is **not** yet captured in the sources, so future discovery knows what to fill. (Each
also appears inline above as `[OPEN]`.)

**Move-In**

1. **[OPEN]** Smart-lock / TTLock / Kwikset move-in provisioning workflow (creds live only in
   the excluded tabs 4 & 7 — must not be inferred from them).
2. **[OPEN]** Move-in inspection workflow detail (zInspector capture, reviewer, turnaround).
3. **[OPEN]** Move-in fee/processing-fee amounts (placeholders only — variable by property).
4. **[OPEN]** Move-in timing/SLA (form, certified funds, key handoff sequencing); no move-in
   cadence is documented.

**Move-Out** 5. **[OPEN]** Exact **Dotloop move-out document set** (Tab 2 references "move-out instructions"
but does not enumerate the documents). 6. **[OPEN]** **Deposit-disposition** itemization/calculation/timeline workflow. 7. **[OPEN]** **Deposit-replacement (Rhino / The Guarantors) claim** workflow end-to-end
(evidence, submission, timelines; Rhino noted as largely phased out). 8. **[OPEN]** **Lock-change** owner-charge cost/vendor flow + smart-lock reset. 9. **[OPEN]** **Collections** process and vendor. 10. **[OPEN]** **Relisting / unit turn** steps for standard (non-PadSplit) units, and the
full move-out chain's **SLAs/timing**.

**Shared / cross-cutting** 11. **[OPEN]** Exact **Rentvine click-paths** for move-in lease creation and move-out lease
close (the renewal click-path is already flagged for an admin-led demo — discovery-ref
§1 step 10). 12. **[OPEN]** The conditional **"4265 coordination charge"** trigger rule ("if they are in one
of our lease docs") — the precise lease-doc condition and amount handling. 13. **[OPEN]** Whether move-in welcome comms use **SMS** in addition to email + Portal Chat
(renewal uses three channels; Tab 1 records only email + Portal Chat). 14. **[OPEN]** Which move-in/move-out **approval gates** become formal queue items (candidates
already named: certified funds, deposit disposition sent, owner inspection charge,
"everything finalized?" — map §6).
