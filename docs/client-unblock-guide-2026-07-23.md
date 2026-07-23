# What the App Needs From You to Unlock the Rest

**For: PMI KC Metro (owner). Date: 2026-07-23.**

This is the single list of things only you can provide to switch on the remaining features. The app is
already built for every item below. Each one is a short, specific step: a key, an endpoint, a setting, a
file, or a decision. Once you provide it, we finish the last connection and the feature goes live.

**How to read this.** Every item is written the same way:

- **What it unlocks** - the feature you get, in plain terms.
- **What we need from you** - the exact thing to provide.
- **Where you do it** - the console, portal, or person.
- **What happens once you provide it** - what we do next.
- **Status** - Open (waiting on you), Confirmed (answered, small build step left), or Done.

**Our safety promises, which none of this changes.** No email or message is ever sent to an owner,
tenant, or vendor without a person reviewing the exact message and confirming it. Only internal notices
to your own staff can send automatically. No passwords, keys, or private customer data are ever written
into this document or into our code. The app only ever signs in with your company Google account, never
a personal one. A real spending cap stays switched on the whole time.

---

## Status at a glance

| #   | Item                                      | Type            | Status    | What we need from you                              |
| --- | ----------------------------------------- | --------------- | --------- | -------------------------------------------------- |
| 1.1 | RentCast rent comparables                 | Integration key | Open      | Sign up (free tier), give us the key               |
| 1.2 | RentVine write-back                       | Integration     | Open      | The documented write endpoint from RentVine        |
| 1.3 | LeadSimple connector                      | Integration     | Open      | An API key and a confirmed endpoint list           |
| 1.4 | Dotloop e-signature                       | Integration     | Open      | Register a Dotloop app, give us the app details    |
| 1.5 | Gmail inbox reply watch                   | Integration     | Confirmed | Nothing more; one build step remains               |
| 1.6 | Google Sheets write-back                  | Access grant    | Done      | Nothing; scope granted and proven                  |
| 1.7 | Maintenance owner-notice send             | Confirmation    | Confirmed | Nothing; a reviewed build step remains             |
| 2.1 | Firestore backups (data safety)           | Cloud setup     | Open      | Turn on backups before real data lands (important) |
| 2.2 | Maintenance intake safety value           | Cloud setup     | Open      | Add one secret value before public intake          |
| 2.3 | New-Space provisioning permission         | Cloud setup     | Open      | Run one permission command (billing already ok)    |
| 2.4 | Spending kill switch                      | Cloud setup     | Done      | Nothing; verified live                             |
| 2.5 | Production sign-in check                  | Cloud check     | Done      | Nothing; confirmed at last deploy                  |
| 3.1 | Keep or remove the practice mode          | Decision        | Open      | One choice                                         |
| 3.2 | Which tenant is the main contact          | Confirmation    | Open      | One answer (Dan)                                   |
| 3.3 | RentVine field names                      | Confirmation    | Open      | Confirm the field names (Dan)                      |
| 3.4 | New-staff access rule                     | Build go-ahead  | Open      | Approve the build and its one-time migration       |
| 4.1 | PMI logo, colors, and fonts               | Brand files     | Open      | Send the official brand files                      |
| 5.1 | Sign-in refresh and deploy (each release) | Routine step    | Ongoing   | Two short commands when we ship                    |

---

## 1. Live connections (each one switches a feature on)

### 1.1 RentCast rent comparables

- **What it unlocks.** Automatic rent comparables for a renewal. The app pulls comparable local listings
  and shows a mid-point number, with its sources, next to the renewal. That number can become a
  suggested renewal rent, but only after an Admin approves that exact number, and a person still sends
  the notice. Without this key the app still works, but the comparables are entered by hand.
- **What we need from you.** A RentCast API key. RentCast has a free tier that covers our use (the
  long-term rental listings search).
- **Where you do it.** Sign up at rentcast.io, create the key, and hand it to us so we place it in
  Google Secret Manager (never in a document or in the code).
- **What happens once you provide it.** We switch the comparables source from hand-entry to live
  RentCast. The suggested rent still needs per-number Admin approval, and a person still sends.
- **Status.** Open. Provider confirmed 2026-07-23.

### 1.2 RentVine renewal write-back

- **What it unlocks.** Writing an approved renewal back into RentVine, so you do not re-key it. Today
  the app reads from RentVine; it does not write.
- **What we need from you.** The documented RentVine write endpoint and its rules (what fields it
  accepts and how). In our testing the RentVine API was read-only, so this needs confirmation from
  RentVine that a write endpoint exists.
- **Where you do it.** With RentVine (their support or API documentation).
- **What happens once you provide it.** We finish the write connection. Every write shows you an exact
  preview first, waits for your confirmation, records a receipt, and can be undone.
- **Status.** Open. You are checking with RentVine.

### 1.3 LeadSimple connector

- **What it unlocks.** A working LeadSimple connection for the workflows that use it.
- **What we need from you.** Two things: an API key that your LeadSimple admin enables, and a short
  confirmation of which LeadSimple endpoints and fields we should use (the endpoint list).
- **Where you do it.** The key comes from the LeadSimple admin settings. The endpoint confirmation comes
  from LeadSimple support or their API docs.
- **What happens once you provide it.** We switch the connector from its stand-in to live, behind the
  same preview-and-confirm safeguards.
- **Status.** Open.

### 1.4 Dotloop e-signature

- **What it unlocks.** Sending renewal documents for e-signature through Dotloop, and getting a signal
  back when they are signed.
- **What we need from you.** Register a Dotloop application in their developer console, then give us its
  three connection values (the app id, the app secret, and the return address we tell you). We store
  these in Secret Manager, never in a document. Then you authorize the connection once.
- **Where you do it.** The Dotloop developer console (registration), then a one-time authorize step in
  the app.
- **What happens once you provide it.** We finish the e-signature connection, including the
  signed-and-complete notification.
- **Status.** Open.

### 1.5 Gmail inbox reply watch

- **What it unlocks.** The app noticing replies to workflow emails and raising a follow-up for your
  team. This is read-only. It never sends anything on its own.
- **What we need from you.** Nothing more. The mailbox notification channel is already set up (the
  topic, publisher, and subscription all exist, and the scheduler service is switched on).
- **Where you do it.** Already complete on your Google Cloud project.
- **What happens once you provide it.** One remaining piece is a scheduled job that keeps the watch
  renewed. We create it when we build this feature; it needs no further action from you.
- **Status.** Confirmed. Set up on 2026-07-23; one build step remains on our side.

### 1.6 Google Sheets write-back

- **What it unlocks.** Writing proposed renewal values into your team tracking sheet. This is
  add-only: it writes into empty "KB Proposed" columns and never changes a cell your team owns, and only
  after a confirm-the-target step.
- **What we need from you.** Nothing. The write permission was added to the reader account on
  2026-07-23, and a safe test proved all seven write-backs on a throwaway sheet. Your real sheet was not
  touched.
- **Where you do it.** Already complete.
- **Status.** Done (2026-07-23).

### 1.7 Maintenance owner-notice send

- **What it unlocks.** Sending the maintenance owner notice (today the app prepares the draft; this is
  about turning on the send). Every send is still reviewed and confirmed by a person.
- **What we need from you.** Nothing new. You confirmed on 2026-07-23 that the property owner email on
  the portfolio record is the right recipient and that every send is human-confirmed.
- **Where you do it.** Already confirmed.
- **What happens next.** Turning the send on is a small reviewed change on our side, after the draft
  screen ships.
- **Status.** Confirmed (2026-07-23).

---

## 2. Google Cloud and Workspace setup (safety and provisioning)

These are console steps on your Google Cloud project, not code. The app is already built to use them.
They are the difference between "works in testing" and "safe with real customer data."

### 2.1 Firestore backups (data safety) - important

- **What it unlocks.** A way to restore your data if something is ever deleted or corrupted. Right now
  there is no backup, so there would be no restore.
- **What we need from you.** Turn on scheduled backups (and point-in-time recovery) for the app's
  database, before any real client data is entered. This is the single most important step before real
  data lands.
- **Where you do it.** The Google Cloud console (Firestore), or we can draft the exact command for you
  to run.
- **What happens once you provide it.** Real client data becomes safe to enter, with a restore path.
- **Status.** Open. Highest priority before real data.

### 2.2 Maintenance intake safety value

- **What it unlocks.** Safely opening the public maintenance request form. The form limits repeat and
  abusive submissions using a private hashed value.
- **What we need from you.** Add one secret value (a randomly generated string we describe, you
  generate) to Secret Manager before the public form is enabled. We never see or store the value.
- **Where you do it.** Google Secret Manager.
- **What happens once you provide it.** The public intake form can be turned on safely.
- **Status.** Open. Needed before public intake.

### 2.3 New-Space provisioning permission

- **What it unlocks.** The self-service "add a new Space" feature actually creating the new workspace,
  instead of only printing the steps.
- **What we need from you.** Run one permission command that grants the app's runtime account the
  ability to create a new search store. Billing for this is already approved. The command grants the
  create-store role to the runtime account
  `pmi-kc-kb-runtime@pmi-kc-kb-prod.iam.gserviceaccount.com`; we give you the exact line to run.
- **Where you do it.** The Google Cloud console or a one-line command in your terminal.
- **What happens once you provide it.** Adding a Space provisions the new workspace, behind a
  cost-confirm step so nothing is created without your say-so.
- **Status.** Open (billing approved 2026-07-23; the permission grant remains).

### 2.4 Spending kill switch

- **What it unlocks.** A real cap that halts spending, not just an email alert, if costs ever run up.
- **What we need from you.** Nothing. It was verified live on 2026-07-23 (the budget triggers a function
  that stops billing).
- **Status.** Done.

### 2.5 Production sign-in check

- **What it unlocks.** Confidence that the live site enforces sign-in and does not allow the practice
  login.
- **What we need from you.** Nothing. Confirmed at the last deploy (the live site forces sign-in and the
  practice mode is off in production). We re-confirm this at every deploy.
- **Status.** Done.

---

## 3. Quick decisions and confirmations

Short answers that unblock the most. Each has a recommended default, so you can reply "go with the
default" or correct it.

### 3.1 Keep or remove the practice mode

- **The choice.** The app keeps a safe "practice" mode and clear "this is a test" labels so a mistaken
  click can never send a real message. An earlier note asked to remove practice mode and make everything
  live. These are two different directions.
- **Recommendation.** Keep the practice mode. If you want a live-only app, we do it as its own reviewed
  project, keeping the "a person confirms every send" rule. That way we do not accidentally turn a safe
  draft into a real send.
- **What we need from you.** One choice: keep practice mode (default), or start the live-only change as
  its own project.
- **Status.** Open.

### 3.2 Which tenant is the main contact

- **The question (for Dan).** The renewal notice is addressed to the first tenant on the lease, with any
  co-tenants copied. Is the first tenant reliably the main contact?
- **Recommendation.** Keep addressing all tenants (main tenant on the "to" line, co-tenants copied),
  since co-tenants are on the lease and should receive the notice.
- **What we need from you.** Confirm the first tenant is the right main contact, or tell us the rule to
  use.
- **Status.** Open.

### 3.3 RentVine field names

- **The question (for Dan).** The renewal desk reads the recipient and rent from specific RentVine lease
  fields. Those field names were mapped from one export, not confirmed by the data owner.
- **Recommendation.** Have Dan confirm the field names against a couple of real leases before the first
  live renewal draft.
- **What we need from you.** A "confirmed," or the corrected field names.
- **Status.** Open.

### 3.4 New-staff access rule

- **The choice.** Today a brand-new staff sign-in defaults to seeing all Spaces. Your ruling is that a
  new person should see nothing until an Admin assigns them access.
- **Recommendation.** Build it, with a firm safeguard: existing already-set-up people (including you and
  Dan) keep their access, and only brand-new accounts start with no access. We ship it behind a one-time
  migration so no one is locked out.
- **What we need from you.** A go-ahead to build it. We handle the code, tests, and safety check; you
  approve the migration and deploy.
- **Status.** Open.

---

## 4. Brand files

### 4.1 PMI logo, colors, and fonts

- **What it unlocks.** The app and its guides showing your official PMI logo, exact brand colors, and
  brand fonts. Right now we only have the brand book cover reference, which confirms the "pmi." wordmark
  and the tagline but does not include the logo files, the exact color values, or the font files. So the
  app uses clean, accessible default styling and the "pmi." name as text, and does not guess a logo or a
  color.
- **What we need from you.** The official brand files: the logo artwork (SVG or PNG), the exact brand
  color values, and the brand fonts. Per your earlier note, the small "report an issue" control stays a
  plain button, not the logo.
- **Where you do it.** Send us the files.
- **What happens once you provide it.** We wire the real logo, favicon, colors, and fonts into the app
  and the client guide, replacing the default styling.
- **Status.** Open.

---

## 5. Every release

### 5.1 Sign-in refresh and deploy

- **What it is.** Each time we ship an update, the Google sign-in for deploying needs a fresh refresh
  that only you can do, and the deploy itself is run by you.
- **What we need from you.** Two short commands in your terminal when we are ready to ship:

  ```bash
  npm run auth:session
  ```

  ```bash
  npm run deploy -- --budget-confirmed --allow-multiple-spaces
  ```

- **Where you do it.** Your own terminal, when we tell you a release is ready.
- **Status.** Ongoing (normal for every release).

---

## Appendix - where the detail lives, and internal cross-reference

Plain-language names above map to the internal build items, for the developer's cross-reference. Full
detail lives in the internal docs.

| Plain name (above)                | Internal reference                                     |
| --------------------------------- | ------------------------------------------------------ |
| 1.1 RentCast rent comparables     | S28b / `Q-RENTCAST-ENDPOINT`, `F-MARKET-COMP-PROVIDER` |
| 1.2 RentVine write-back           | S30 / `D-RENTVINE-ENDPOINT`                            |
| 1.3 LeadSimple connector          | S35                                                    |
| 1.4 Dotloop e-signature           | S34                                                    |
| 1.5 Gmail inbox reply watch       | S31 / `Q-GMAIL-WATCH-OWNER`                            |
| 1.6 Google Sheets write-back      | Sheets WRITE scope on the reader delegation grant      |
| 1.7 Maintenance owner-notice send | S38b / `F-MAINT-OWNER-DRAFT-REACHABLE`                 |
| 2.1 Firestore backups             | env-LR-01                                              |
| 2.2 Maintenance intake value      | maint-LR-02 (`MAINTENANCE_INTAKE_IP_HASH_SALT`)        |
| 2.3 New-Space provisioning        | S36                                                    |
| 2.4 Spending kill switch          | env-LR-02 / `F-BUDGET-1`                               |
| 2.5 Production sign-in check      | auth-LR-05 / `F-PROD-CLOUD-MODEL`                      |
| 3.1 Keep or remove practice mode  | `Q-CUTOVER-POSTURE`                                    |
| 3.2 Main tenant contact           | `F-LEASE-6`                                            |
| 3.3 RentVine field names          | `F-LEASE-3`                                            |
| 3.4 New-staff access rule         | `F-AUTH-1`                                             |
| 4.1 Brand files                   | brand pack (`docs/brand_pack/`)                        |

- Full build program and owner-dependency list: `docs/roadmap-unblock-2026-07-23.md`.
- Fact ledger and open questions: `docs/facts.md`.
- Decisions and recommendations: `docs/whats-next.md`.
- Current state and history: `docs/loop-state.md`, `docs/status.md`.
