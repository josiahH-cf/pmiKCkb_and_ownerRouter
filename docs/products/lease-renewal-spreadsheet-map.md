# Renewal Spreadsheet — Sanitized Semantic Map

Source: Google Sheet **"Tenant Move In/Out/Renewal Checklist"** (owner `dan@pmikcmetro.com`,
shared to `josiah@pmikcmetro.com`), read 2026-06-20 via the (now pmikcmetro-authed) Drive
connector. Status: foundational reference for the connector/approval-queue design.
Sensitivity: Low — **sanitized**; zero client identifiers or credential values reproduced.

> **Why this exists.** The sheet is PMI KC's operational source of truth (see
> [`lease-renewal-discovery-reference.md` §A](lease-renewal-discovery-reference.md)). This map
> turns its implicit structure into explicit, deterministic knowledge for a read connector,
> conflict reconciliation, and template auto-draft — without copying any client data.
>
> ⚠️ **SECURITY FINDING — plaintext credentials in the sheet.** Tabs 4 (PadSplit WiFi) and 7
> (Platform Logins) contain **plaintext WiFi names+passwords and platform usernames/passwords/
> PINs** (TTLock, thermostats, Section 8 portal, Zillow, Gmail, HOA/health-dept portals, office
> WiFi). Any connector **must hard-exclude these tabs and never echo them.** Separately,
> recommend to Dan that these move to a password manager / Secret Manager out of a shared sheet.
> The raw export is a secrets-bearing document — never commit it.

## 1. Overview

The export flattens one Google Sheet's tabs into back-to-back tables (tab names not preserved;
identity inferred from headers/content). Single logical tabs were fractured across multiple
sub-tables wherever there were blank header rows, merged cells, or a column-count change — so
"tables" ≠ "tabs". Inferred logical tabs:

| #   | Inferred tab / section                       | Approx. rows | Purpose                                                                        |
| --- | -------------------------------------------- | ------------ | ------------------------------------------------------------------------------ |
| 1   | **Move-In Checklist**                        | ~112         | One row per move-in; onboarding steps (fees, docs, inspection, keys, welcome). |
| 2   | **Move-Out Checklist**                       | ~80          | Notice → inspection → deposit disposition → relisting.                         |
| 3   | **Renewals**                                 | ~120         | Pricing, owner approval, renewal docs, signatures.                             |
| 4   | **PadSplit WiFi / Garage / OG members**      | ~20          | Per-house WiFi creds (**secret**), garage spots, original-tenant tracking.     |
| 5   | **PadSplit Move-Out / Room Turn**            | ~28          | Per-room move-out + cleaning/relisting.                                        |
| 6   | **Vendor / Platform Contacts**               | ~10          | Support contacts per platform.                                                 |
| 7   | **Platform Logins**                          | ~9           | **Plaintext credentials/PINs (secret).**                                       |
| 8   | **Room-Turn Cleaning Pricing**               | ~25          | Cleaning charges by address/room + billing policy.                             |
| 9   | **Inspection Scheduling Outreach**           | ~7           | Properties pending inspection scheduling.                                      |
| 10  | **Sprinkler / Winterization / Heat Tracker** | ~30          | Per-property winterization outreach + vacant-heat checklist.                   |
| 11  | **Owner Onboarding**                         | ~40          | New owner: PMA docs, insurance, keys, deposits.                                |
| 12  | **Vendor Onboarding**                        | ~40          | New vendor: W9/agreement/insurance/workers-comp.                               |
| 13  | **Key Tracker**                              | ~175         | Per-property key location, copies, Kwikset status.                             |
| 14  | **Training Library**                         | ~55          | Training topics → video links → who-watched flags.                             |
| 15  | **"a/z" sort helper**                        | ~167         | `[MURKY]` single-column sort/dropdown scaffold — ignore.                       |
| 16  | **Task / Meeting-Action Log**                | ~977         | `TRUE/FALSE`-done + free-text action item (long blank tail).                   |
| 17  | **Inspection Tracker**                       | ~178         | Per-property inspection cadence, last/next, owner-charge flags.                |
| 18  | **Property Attributes / Unit Details**       | ~177         | Per-unit utilities, locks, lawn care, inspection cadence, appliances.          |

## 2. Per-tab column maps (key tabs)

### Tab 3 — Renewals (primary; formal header at export line 397)

| #   | Header (verbatim)                                                   | Meaning                            | Type                                   | Notes                                |
| --- | ------------------------------------------------------------------- | ---------------------------------- | -------------------------------------- | ------------------------------------ |
| 1   | `Have we confirmed pricing with the owner?`                         | **Owner pricing approval**         | yes/blank                              | **Approval gate.**                   |
| 2   | `Have we sent the renewal letter?`                                  | Renewal letter sent                | `yes <date>` / `Dont renew`            | Doubles as renew/not-renew decision. |
| 3   | `What is the Lease/Tenant name?`                                    | `<tenant name>`                    | free text **[PII]**                    | Inconsistent name formats.           |
| 4   | `Renewal Date`                                                      | Lease renewal/end date             | date (`MM-DD-YYYY`/`M/D/YY`)           | **Cadence driver.**                  |
| 5   | `Current Rent`                                                      | `$<amount>`                        | currency **[PII joined to tenant]**    |                                      |
| 6   | `Market Value`                                                      | `$<amount>`                        | currency                               | Pricing-decision input.              |
| 7   | `Is this renewal completed?`                                        | Status                             | yes / `Needs Renewed` / `not renewing` |                                      |
| 8   | `Have they responded if they are renewing or not?`                  | Tenant responded                   | yes / free text + staff name           | e.g. "ESTELLE WORKING ON".           |
| 9   | `Have we sent the google form to gather info?`                      | Info form sent                     | yes/blank                              |                                      |
| 10  | `Have they filled out the form?`                                    | Form returned                      | yes/no/blank                           |                                      |
| 11  | `Have the lease docs been sent out`                                 | Renewal docs sent                  | yes / `sent to Leah`                   | "Leah" = doc builder (Dotloop).      |
| 12  | `If they have a rhino policy is it renewed?`                        | Rhino renewed                      | `yes` / `no policy`                    | Deposit-alternative.                 |
| 13  | `Have they registered their pet if needed?`                         | Pet registration                   | yes/`no pet`/n/a                       |                                      |
| 14  | `Have all documents been signed electronically?`                    | E-sign complete                    | yes/blank                              | **Signature gate.**                  |
| 15  | `Have we verified that we are added as additional insured?`         | Additional-insured verified        | yes/`not added`                        |                                      |
| 16  | `Have we added the $11.95 charge ... starting on the renewal date?` | Add recurring insurance/RBP charge | yes/n/a                                | Recurring-charge automation.         |
| 17  | `Have we added them to the inspection sheet if needed?`             | Added to Tab 17                    | yes/blank                              | Cross-tab.                           |
| 18  | `Did we set up their Air filter delivery`                           | Second Nature filter setup         | yes/`already set up`/n/a               |                                      |
| 19  | `did we get proof that utilities are set up if need be?`            | Utility proof                      | yes/blank                              |                                      |

> The current working subset is a condensed 6-col Renewals fragment (`<tenant>` / Renewal Date /
> Current Rent / Market Value / completed-status / renewing-status), grouped by month-end renewal
> date with `-----` separator rows as month dividers.

### Tab 1 — Move-In Checklist (22 cols) — highlights

`f` (timestamp, `[MURKY]` header), `Move in date` (**holds tenant emails, not dates — header/data
mismatch [MURKY]**), `What is the Lease/Tenant name?` **[PII]**, processing-fee/DL/paystub/
PetScreening/form/utility-proof yes-flags, `Have all documents been signed electronically?`
(**signature gate**), `Have we received certified funds...` (**money gate**), inspection-tracker
add (cross-tab), zInspector link, `Guarantors Policy locking them in?`, key handoff, welcome
letter "by email and by Portal Chat", listing disable.

### Tab 2 — Move-Out Checklist (28 cols) — highlights

`Name` **[PII]**, scheduled/actual vacate dates, `Have they put in their notice?` (yes/date/
`eviction`/`abandonment`), Dotloop move-out instructions, conditional **4265 coordination charge**
"if they are in one of our lease docs", inspection email via portal cc Dan, RentVine actions
(`Turn off Auto Charges`, `Disable Credit reporting + close lease`, stop **Second Nature** filter
program — emails `ahassan@secondnature.com`), lock change + owner charge, deposit disposition sent
(**deposit gate**), `Submit Rhino Claim`, collections, `everything finalized?` (**final gate**).

### Tab 17 — Inspection Tracker (14 cols) — highlights

`Address` **[PII]**, `Lease Start` (mixed formats), `Inspections` (cadence rule, free text:
"1/2 per year"), `2024 Inspections` TRUE/FALSE, a `FALSE`-literal header `[MURKY]` (leaked checkbox
default), `Last inspection?`/`Next inspection` (`MM/YYYY`), `$130 charge to owner ... added to the
invoice sheet?` (**owner-billing gate**), `... made Leah aware`, tenant copy via RentVine, owner
copy via Gmail, `Has this sheet been updated?`.

### Tab 18 — Property Attributes / Unit Details (12 cols) — highlights

`Property` **[PII]**, `Unit`, `Updated to Kwickset Smart Locks` (sic), lock count/detail,
`Utilities Needed` (Spire/Evergy/KC Water/Trash; by tenant/owner), `Carpet`, **`Lawn Care`
(Owner/Tenant/Provided by HOA)** — the field behind the HOA-vs-tenant conflict, `Inspections`
(cadence — **duplicates Tab 17 → conflict risk**), `Appliances provided`, a blank-header
`TRUE/FALSE` "in RentVine?" flag `[MURKY]`, `Notes`.

(Owner Onboarding, Vendor Onboarding, Key Tracker, PadSplit Move-Out, Training Library, Pricing,
Sprinkler tracker, and the Task log are mapped in full in the working notes; columns follow the
same yes/blank-flag + free-text pattern. Tabs 4 & 7 are credential-bearing — excluded by policy.)

## 3. Status & color conventions

- **Yes/no completion flags** dominate; casing inconsistent (`yes`/`Yes`/`YES`). `n/a`/`N/A` =
  not applicable; combined `yes, n/a` is `[MURKY]` — treat as "addressed."
- **Boolean `TRUE/FALSE`** for checkbox columns (Task log, Inspection Tracker, Property Attributes,
  Sprinkler tracker). FALSE = unchecked/not-done.
- **Only explicit color rule:** Key Tracker — "_If no, flag red_" for missing key copies.
- **Workflow state lives in free text inside yes-cells:** `Yes, pending`, `working`, `completed`,
  `not added`, `not renewing`, `Dont renew`, `decided to move out`, `eviction`, `abandonment`.
- **Hidden-row / divider convention:** rows of repeated `.` and long `-----` dashes are visual
  separators between month/date groups; the `a/z`/`zzz` columns are hidden sort scaffolding.

## 4. Computed cells & hyperlinks

- **Hyperlinks:** Training tab is link-heavy (`loom.com`, `fathom.video`, `drive.google.com`,
  `docs.google.com`, a Gmail permalink). Platform-Logins/Vendor-Contacts hold platform URLs.
- **Cross-system references in text:** RentVine (lease status, work orders, charges, key counts),
  Dotloop/"Leah" (doc building/e-sign), Second Nature (filters/RBP), Rhino/Guarantors (deposit
  alternatives), PetScreening, PadSplit, RentEngine, Lead Simple, zInspector.
- **No live formulas survive export** (values flattened); the `TRUE/FALSE` columns and the leaked
  `FALSE` header indicate the original uses checkbox/data-validation columns. `Market Value` /
  `Next inspection` are manually entered.

## 5. Cross-tab relationships

- **Shared key = property address** across Key Tracker, Inspection Tracker, Property Attributes,
  Sprinkler tracker, Scheduling-outreach. **No stable ID; address strings inconsistent** → fuzzy
  joins.
- **Shared key = tenant/lease name** across Move-In → Renewals → Move-Out (lease lifecycle). Name
  formats inconsistent → unreliable matching.
- **Explicit cross-tab actions:** Move-In + Renewals "add them to the Inspection Tracker"; Owner
  Onboarding adds inspections. **Renewals → Move-Out handoff** when "decided to move out".
- **Inspection cadence appears in BOTH Tab 17 and Tab 18** — conflict risk.

## 6. Fields relevant to automation (connector + approval queue)

- **Cadence/timing:** Renewals `Renewal Date`; Inspection Tracker `Next/Last inspection`; Move-Out
  `Scheduled Move out date`; Scheduling lease-end dates.
- **Market value / pricing:** Renewals `Current Rent` + `Market Value`.
- **Owner approval gates (queue items):** Renewals col 1 (pricing); Owner Onboarding (PMA sent +
  signed); Inspection Tracker ($130 owner charge + Leah notified).
- **Tenant communication:** Renewals (letter/response/form); Move-In (welcome "email + Portal
  Chat"); Move-Out (inspection email); Sprinkler outreach. Channels = email + RentVine portal chat.
- **Deposit / Rhino / Guarantors:** Move-In (Guarantors), Renewals (Rhino renewed), Move-Out (SD
  disposition, Rhino claim), PadSplit (OG SD return).
- **Document set:** Google Form → lease/PMA docs (Dotloop, built by "Leah") → e-sign.
- **Signature tracking:** every checklist's `Have all documents been signed electronically?`.
- **Approval-gate candidates:** (1) owner pricing, (2) e-signature complete, (3) certified funds,
  (4) deposit disposition sent, (5) owner inspection-charge, (6) "everything finalized?".

## 7. Data-quality observations (feed deterministic rules)

- **Header/data mismatch (high risk):** Move-In `Move in date` holds emails; `f` holds timestamps;
  Inspection Tracker has a literal `FALSE` header; Property Attributes col 11 blank header;
  Owner-Onboarding first "header" row is a data row (off-by-one). **Do not trust headers blindly.**
- **Inconsistent date formats** in one column (`M/D/YYYY`, `M/D/YY`, `MM-DD-YYYY`, `September 15,
2023`, `MM/YYYY`, free text). Needs robust parsing + fallbacks.
- **Inconsistent boolean/status encoding** (`yes`/`Yes`/`YES`/`y`, `n/a`/`N/A`, `TRUE/FALSE`,
  `yes, n/a`); state often buried in appended free text + staff name.
- **Same fact in multiple columns (conflict risk):** inspection cadence (Tab 17 & 18); address
  duplicated across 5 tabs with no canonical form; Property `Property` vs `Unit` duplicate address.
- **Blank-heavy / pre-allocated rows** (Task log ~770 empty; `a/z` helper content-free).
- **Manual-workaround artifacts:** `.`/`-----` divider rows; `zzz`/`a`/`z` sort helpers; staff
  names embedded in status cells instead of a structured assignee field; multi-event cells.
- **Fractured tables:** group by header signature/content, not table position.
- **Secrets in-band:** plaintext WiFi + platform credentials/PINs (Tabs 4 & 7) — see top warning.

## 8. Implications for the connector design

- **Key on content, not position or headers.** Build a tab-fingerprint matcher (header signature)
  and a per-tab column schema; treat unmapped columns as `[MURKY]` → surface, don't guess.
- **Normalize at read time:** dates, yes/no/na, and "state-in-free-text" into structured fields;
  extract the embedded assignee into a real owner field.
- **Conflict reconciliation (discovery-ref §6.1) is real here:** inspection cadence and lawn-care
  responsibility are concrete cross-source conflicts to flag.
- **Hard-exclude credential tabs (4, 7)** at the connector boundary.
- **Approval-gate columns map directly to queue items** (§6) — the sheet already encodes the
  human approval points the app must mirror, with `awaiting → approved`-style states.
