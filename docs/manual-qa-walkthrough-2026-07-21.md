# PMI KC KB — Manual QA Walkthrough (deep, per-process verification)

**Who this is for:** you, clicking through the real app and verifying that **every process on every page
does the exact thing it is supposed to produce.** This is the dense version: page by page, field by
field, with the verbatim on-screen text, the error you should see when you do it wrong, and the concrete
end-state each step is meant to produce.

**How to use it.** Work top to bottom. Each process is a block:

```
#### P<n> — <what the process is>
Where:    <route> → <exact location on the page>
Do:       <exact clicks / what to type>
Produces: <the concrete end-state, with the exact on-screen text you should see in quotes>
[ ] works as intended
- {note for changes: }
```

- Tick `[ ]` when the result matches. If it does not, or it works but feels wrong, write in the
  **`- {note for changes: }`** line right there. That line is deliberate and machine-readable: when you
  send this doc back to me, I read every non-empty `- {note for changes: ...}` as a work item and treat
  each as a weak/needs-improving process. Leave it empty for anything that passed.
- **`⚠ Known gap:`** lines are pre-filled by me from the code — a spot that is stubbed, capped, or
  misleading today. You do not need to test those to "discover" them; they are already on the backlog in
  `docs/whats-next.md`. Your `- {note for changes: }` line stays yours.
- **Error probes** are their own blocks — do the wrong thing on purpose and confirm the app fails safely
  with the exact message quoted.

**Legend:** ✅ wired end to end · ⚠ partial/stubbed · ⛔ built but not reachable from the UI.

---

## 0. Before you start

- [ ] **Environment.** Use the deployed Cloud Run app for a true customer test (production serves the
      current build; see `docs/loop-state.md`). A local `npm run dev` is a preview only.
- [ ] **Accounts.** An **Admin** `pmikcmetro.com` account (does everything below). Optionally a **second**
      staff account to watch role/scope changes take effect on next sign-in. The **Summit Plumbing Test
      Vendor** (provisioned from Admin) for the Vendor section.
- [ ] **What "pass" means:** the process produces the stated end-state, the screen guides you to the
      obvious next action, and nothing reads as broken or off-brand.
- **Roles/capabilities recap:** Editor = `read` + `edit` + workflow-linked `sendEmail`. Approver adds
  `approve` + `resolvePlaceholder`. Admin adds `manageAdmin` + `softDelete`. Space scopes (`renewals`,
  `maintenance`) narrow which tabs appear; **absent scopes = all spaces**.

---

## 1. Console / Ask (`/` and `/ask` — the same screen)

Both URLs render the identical `ConsoleView`; `/ask` is preserved for smoke tests. Header is `Console`;
the purpose line reads **"Ask about a property, lease, or process, then hand the work to the right
place."** A **read-only** user sees no process picker, no detect area, and no test-run option (those need
`edit`).

### 1a. The Ask box

#### P1.1 — Ask a source-backed question (happy path) ✅

- **Where:** Console → the **"Question"** textarea (placeholder **"For example: when does the lease at 1234 Oak St renew?"**).
- **Do:** Type a real question, e.g. `When does the lease renewal process start?`, click **"Get answer"**.
- **Produces:** On the right panel: a **source-state banner**, an **"Answer"**, optional **"Handling Steps"**,
  a **"Sources"** list of clickable citations, and (when generated) a **"Draft"** that begins with
  the exact banner **"Draft — Review before sending"**. A well-sourced question shows the
  **"Verified Source"** banner with at least one citation.
- [ ] works as intended

- {note for changes: }

#### P1.2 — Honest "no source" answer (this is a feature, not a bug) ✅

- **Where:** Console → Question box.
- **Do:** Ask something with no approved source, e.g. `give me a generic answer about pricing`.
- **Produces:** The **"No Reliable Source Found"** banner and the answer **"No approved PMI KC source is
  configured for this question in the scaffold yet."** — never an invented answer. A **"Capture
  Task"** block appears beneath the answer (see P1.7).
- [ ] works as intended

- {note for changes: }

⚠ Known gap: the answer literally says "…in the scaffold yet"; the Ask engine is still scaffold/demo-backed for many questions.

#### P1.3 — Empty / too-short question (error probe) ✅

- **Where:** Console → Question box.
- **Do:** Click **"Get answer"** with the box empty, then with 1–2 characters.
- **Produces:** The browser blocks submit (the field is `required`, min 3 chars) — no request is sent. If a
  short question reaches the server it returns **"Invalid Ask request."** in the muted status line.
- [ ] works as intended

- {note for changes: }

#### P1.4 — Rate-limit behavior (error probe) ✅

- **Where:** Console → Question box.
- **Do:** Fire many questions rapidly (>15 in a burst).
- **Produces:** **"Too many questions right now. Please wait a moment and try again."**
- [ ] works as intended

- {note for changes: }

#### P1.5 — There is NO slash-command router (expectation-setter)

- **Where:** Console → Question box.
- **Do:** Type `/help` or `/ask something`.
- **Produces:** It is treated as **literal question text** and sent to the answer engine — there is no `/`
  command handling anywhere in this flow. So `/`-prefixed input just asks that string as a question.
- [ ] works as intended

- {note for changes: }

⚠ Known gap: if you expect slash-commands (e.g. `/renewal`), they don't exist. Tell me if you want a command palette.

### 1b. Voice dictation

#### P1.6 — Dictate a question by voice ✅

- **Where:** Console → the **"Dictate"** button next to the Question label.
- **Do:** Click **"Dictate"**, allow the mic, speak, click **"Stop recording"**.
- **Produces:** The button cycles **"Dictate" → "Stop recording" → "Stopping…" → "Processing…"**, then the
  transcript is **appended** to whatever is already in the box with the note **"Transcript appended
  to your question. Review it before submitting."** Empty speech → **"No speech was detected. Your
  typed question was preserved; try again or keep typing."**
- [ ] works as intended

- {note for changes: }

⚠ Known gap: on Safari/iPhone you get **"This browser (Safari/iPhone) records audio in a format we can't transcribe yet. Use Chrome on this device, or type instead."** Test on Chrome.

### 1c. Process detection + test runs (edit-capable users only)

#### P1.7 — Capture a task from an unsourced answer ✅

- **Where:** Console → after an answer with banner "Partial Source", "Open Placeholder", or "No Reliable
  Source Found", the **"Capture Task"** block.
- **Do:** Pick a **"Space"** from the dropdown, click **"Create Capture Task"**.
- **Produces:** **"Capture task created."** and a real Firestore **placeholder** (an Open task) in that space.
  (Verified-Source and Conflict answers do **not** offer capture — by design.)
- [ ] works as intended

- {note for changes: }

#### P1.8 — Auto-detect the process (free, deterministic) ✅

- **Where:** Console → with a Process picker visible, leave it on **"Just ask (no process)"** and type ≥6
  characters mentioning a workflow, e.g. `broken hvac needs repair`.
- **Produces:** A hint **"Looks like <process>."** with a **"Use <process>"** button that selects it with no
  network call, and flips the submit button to **"Get answer + start a test run"**.
- [ ] works as intended

- {note for changes: }

⚠ Known gap: the free matcher only knows synonyms for process ids `lease-renewal` and `maintenance-work-order-intake`; if the real definition id differs, only its literal name words match.

#### P1.9 — Detect the process with AI (model call) ✅

- **Where:** Console → when no deterministic hint appears, the **"Detect process with AI"** button.
- **Do:** Type a question the free matcher misses, click **"Detect process with AI"** (label → **"Detecting…"**).
- **Produces:** It either auto-selects a process, or shows **"No matching process found for this question."**,
  or (if hammered) **"Too many classification requests. Please wait a moment and try again."** It
  never invents a process that isn't in the list.
- [ ] works as intended

- {note for changes: }

#### P1.10 — Start a test run from the Console ✅

- **Where:** Console → pick a process, note the button becomes **"Get answer + start a test run"** and the
  note **"Starting this process runs a test only. Nothing is sent, and nothing is written to a
  system of record."**
- **Do:** Submit.
- **Produces:** Below the answer, a **"Test run started"** block showing **`<process>: <status>`**, an optional
  **"Next: <action>"**, and a **"View the test run"** link to `/workflow-runs/<id>`.
- [ ] works as intended

- {note for changes: }

### 1d. The action deck (below the Ask box)

#### P1.11 — The three attention cards deep-link correctly ✅

- **Where:** Console → the **"What needs your attention"** group.
- **Do:** Read each card and click its link.
- **Produces:** **"Needs your decision"** → `/approval-queue` (empty: **"Nothing needs your decision right
  now."**); **"Connections to set up"** → `/connections` (empty: **"Every connector is set up."**);
  **"Space coverage"** → `/spaces` (empty: **"Every space has its process and connections."**).
  Each shows up to 3 preview rows then **"See all N"**/**"Open"**.
- [ ] works as intended

- {note for changes: }

#### P1.12 — Approve inline from the deck (Approver/Admin) ✅

- **Where:** Console → a "Needs your decision" row with an **"Approve"** button (only on eligible low/medium
  items).
- **Do:** Click **"Approve"**.
- **Produces:** Button → **"Approving…"** → replaced by **"Approved."**; the queue item flips to **Approved**
  (app-plane only — no external send, no system-of-record write). A **High-risk** item is refused
  here with **"High-risk approval requires explicit confirmation."** — handle those on the full
  Approval Queue.
- [ ] works as intended

- {note for changes: }

⚠ Known gap (Console): the **"Anticipated work"** zone is populated only in a test workspace; a plain
production Admin sees it empty by design.

---

## 2. Notifications

### 2a. The bell (top-right, every internal page)

#### P2.1 — Unread count + tab title ✅

- **Where:** Top nav → the bell.
- **Do:** With unread notifications present, look at the badge and the browser tab.
- **Produces:** A badge showing the count (visually capped at **"9+"**), the accessible label **"Notifications,
  N unread"**, and the browser tab title prefixed **"(N) "**. It refreshes every 60s and on tab
  focus.
- [ ] works as intended

- {note for changes: }

⚠ Known gap: the badge caps at "9+" while the label/tab-title show the true number (minor inconsistency). The PMI favicon red-dot is deferred (needs your artwork).

#### P2.2 — Open a notification (marks it read) ✅

- **Where:** Bell → click a notification in the popover.
- **Do:** Click any unread item.
- **Produces:** It navigates you to the linked thing AND marks that one read; on the next refresh the badge
  decrements and the tab-title count updates. (Approval rows link to `/approval-queue?item_id=…`.)
- [ ] works as intended

- {note for changes: }

#### P2.3 — Mark all read ✅

- **Where:** Bell popover → **"Mark all read"** (shown only when unread > 0).
- **Do:** Click it.
- **Produces:** All unread **event** notifications flip to read; the badge/title clear. Standing **set-up**
  signals (Connections, Space coverage, Team review) intentionally remain — they clear only when
  the underlying state is fixed.
- [ ] works as intended

- {note for changes: }

⚠ Known gap: approval-queue notifications are generated by a batch job, not the instant an item becomes ready — expect a delay, and note that approving/denying an item does not itself clear its bell notification (open it or Mark-all-read).

#### P2.4 — Mute a notification family ✅

- **Where:** Bell popover → **"Notification types"** disclosure.
- **Do:** Untick a family (e.g. "Maintenance tickets").
- **Produces:** That family stops appearing; the preference persists to your own record.
- [ ] works as intended

- {note for changes: }

⚠ Known gap: all 7 families are currently "available", so the "unavailable/waiting" branch of this menu is dead code today.

### 2b. The full feed (`/notifications`)

#### P2.5 — Review the full notification hub ✅

- **Where:** Bell → **"See all notifications"** → `/notifications`.
- **Do:** Read the page.
- **Produces:** Intro **"Everything that needs your attention, newest first…"**, then sections: **Team review**
  (Admin only), **"Needs your decision"**, **"Recent activity"** (the event log, newest first),
  a **"Test attention and owning-record handoffs"** panel, and a **"Set-up"** section (Connections + Coverage). This page is read-only (no mark-read here).
- [ ] works as intended

- {note for changes: }

---

## 3. Sign-in, navigation, and the safety nets around every page

### 3a. Sign in

#### P3.1 — Sign in with a pmikcmetro.com Google account (happy path) ✅

- **Where:** `/sign-in` → **"Sign in with Google"** (heading **"Sign in to continue."**).
- **Do:** Sign in with a verified `@pmikcmetro.com` account.
- **Produces:** An 8-hour session cookie and a redirect to the Console (`/`). A brand-new user defaults to
  **Editor** with all-spaces access. The button cycles "Checking session…" → "Opening Google…"
  → "Signing in…".
- [ ] works as intended

- {note for changes: }

#### P3.2 — A non-pmikcmetro account is refused (error probe) ✅

- **Where:** `/sign-in`.
- **Do:** Try to sign in with a personal `@gmail.com` account.
- **Produces:** The account is rejected server-side and you see **"This Google account is not authorized for
  PMI KC KB."** (Note: the Google picker itself is only hinted to the domain; the hard block is
  on our server, so you may briefly see "Signing in…" before the refusal.)
- [ ] works as intended

- {note for changes: }

#### P3.3 — Demo mode (dev only — expectation-setter)

- **Where:** `/sign-in`.
- **Do:** Look for a **"Continue in local demo mode"** button.
- **Produces:** It appears **only** in non-production with `LOCAL_DEMO_AUTH` enabled; in production it is
  force-disabled. If present, it signs you in as a demo Admin (`local-demo@pmikcmetro.com`, all
  spaces). On the deployed app you should NOT see it.
- [ ] works as intended

- {note for changes: }

### 3b. Navigation & role/scope gating

#### P3.4 — The top nav shows the right tabs for the role/scope ✅

- **Where:** Top nav, on any page.
- **Do:** As an Admin, confirm you see: **Console · Spaces · Lease Renewal · Maintenance · Approval Queue
  · Communications · Connections · Admin**. Then sign in as a **renewals-only** user.
- **Produces:** The renewals-only user sees Console, Spaces, Lease Renewal, Approval Queue, Communications,
  Connections — but **not** Maintenance and **not** Admin. A maintenance-only user sees
  Maintenance but not Lease Renewal / Approval Queue. Only Admins see **Admin**.
- [ ] works as intended

- {note for changes: }

### 3c. Session timeout (security)

#### P3.5 — Idle warning at 28 min, auto sign-out at 30 min ✅

- **Where:** Any signed-in page.
- **Do:** Leave the app idle (no mouse/keyboard). At ~28 minutes a dialog appears.
- **Produces:** A focus-trapped dialog **"Are you still active?"** with a live countdown **"Signing out in
  m:ss."** and a **"Stay signed in"** button. Moving the mouse during the countdown does NOT
  dismiss it (deliberate) — only the button resets the clock. At 30 min total you are signed out
  to `/sign-in`.
- [ ] works as intended

- {note for changes: }

#### P3.6 — Sign out ✅

- **Where:** Top-right → **"Sign out"**.
- **Do:** Click it.
- **Produces:** Both the Firebase client session and the server cookie are cleared, and you are hard-navigated
  to `/sign-in`. (Button reads "Signing out…" briefly.)
- [ ] works as intended

- {note for changes: }

### 3d. Report an issue + error safety nets

#### P3.7 — File a support report from any page ✅

- **Where:** Bottom-right of every internal page → **"Report an issue"**.
- **Do:** Click it; the **"What went wrong?"** field is optional — you can leave it blank or describe the
  problem — then **"Send report"**.
- **Produces:** **"Thanks. Your report was filed to the support queue for review."** and a real Firestore
  write to `support_reports`. It captures the page path, viewport, and the _identity_ of the last
  element you touched — never the page text or query string. It reaches you in **Admin → "Reported
  Issues"**. A write failure shows the honest **"We received your report but could not file it to
  the support queue yet. Please try again in a moment."** — never a fake success.
- [ ] works as intended

- {note for changes: }

⚠ Known gap: reports are filed to the in-app queue, not emailed (email delivery is a separate, unbuilt send path). The report-issue rate limit (30/min) is per-server-instance, not distributed.

#### P3.8 — The error boundary offers a report path (error probe) ✅

- **Where:** Any page that hits an unexpected error.
- **Do:** (If you can trigger one) observe the error screen.
- **Produces:** **"Something went wrong on this page"** with **"Try again"** and **"Report this problem"**
  (→ **"Report filed"**). Even a total crash (root error) shows **"The app hit an error"** with the
  same working report path.
- [ ] works as intended

- {note for changes: }

⚠ Known gap (chrome): a hardcoded **"V1 application · Live and Test records are labeled by data mode ·
provider status and signoffs are advisory"** banner shows on every signed-in page regardless of
environment — cosmetic, on the cleanup list.

---

## 4. Spaces (the workspace directory)

### 4a. The card grid

#### P4.1 — Open Spaces and read the cards ✅

- **Where:** Top nav → **Spaces** (`/spaces`), heading **"Spaces"**.
- **Do:** As an Admin, look at the grid.
- **Produces:** Up to **12** cards (Lease Renewals, Owner Renewal Outreach, Tenant Renewal Notice, Maintenance
  Work Order Intake, Vendor Assignment Handoff, Daily Inbox Triage, Fathom Training, Escalation
  Rules, Move-In, Move-Out + Deposit Disposition, Owner Onboarding, Workflow Communications). Each
  whole card is clickable.
- [ ] works as intended

- {note for changes: }

#### P4.2 — Scope filtering (expectation-setter) ⚠

- **Where:** `/spaces` as a scoped (non-all-spaces) user.
- **Do:** Sign in as a renewals-only user and open Spaces.
- **Produces:** You see **only one card** (Lease Renewals). Only two spaces carry a scope tag today
  (`lease-renewals`=renewals, `maintenance-work-order-intake`=maintenance), so a scoped user does
  not see the un-scoped renewal/move-in/onboarding cards.
- [ ] works as intended

- {note for changes: }

⚠ Known gap: scoped users under-see the launch-planning + move-in/move-out spaces (they have no scope tag). Worth deciding whether those should surface for scoped users.

#### P4.3 — Card status pills reflect real state ✅

- **Where:** `/spaces` cards.
- **Do:** Read each card's state pill.
- **Produces:** One of **"Connections needed"** (amber), **"Needs a process"** (red), **"Process ready"**
  (green), **"Planned"** (neutral), **"Status unavailable"** (neutral, when the definitions read
  failed), or **"Reference (read-only)"** (purple). The Lease Renewals card also shows a
  **"N waiting on you"** pill when the renewal queue has items.
- [ ] works as intended

- {note for changes: }

### 4b. Opening a space

#### P4.4 — Navigate a space card ✅

- **Where:** `/spaces` → click a card.
- **Do:** Click **Lease Renewals**, then **Maintenance Work Order Intake**, then **Workflow
  Communications**, then a reference card (e.g. **Escalation Rules**).
- **Produces:** Lease Renewals → `/lease-renewal`; Maintenance → `/maintenance`; Workflow Communications →
  `/gmail-hub`; others → `/spaces/<id>` with an **Overview / Process** sub-tab (Process tab only
  appears when the space carries a process definition). An unknown `/spaces/foo` → 404; a scoped
  user deep-linking to another scope's space → redirected to their primary desk.
- [ ] works as intended

- {note for changes: }

#### P4.5 — Per-space domain drafts (draft-only) ✅

- **Where:** `/spaces/<id>` Overview → the domain card.
- **Do:** Open **Move-In** (welcome draft), **Move-Out + Deposit Disposition** (evidence packet), and the
  renewal spaces (notice-rule + sample drafts).
- **Produces:** Move-In → a **"Welcome draft (email + Portal Chat)"** with every unknown fact shown as
  **"Needs Verification: …"** and fees as the literal pointer **"see RentVine"** (never a computed
  figure). Move-Out → a **"Deposit deduction: evidence packet"** labeled **"Suggested deduction —
  SUGGESTION ONLY, owner approval required"** ($0.00 when empty; lines ≥ $500 flagged **"Needs
  owner sign-off"**); it never posts to any ledger. Renewal spaces → notice-timing rules (all
  "Needs Verification" until confirmed) + sample email drafts, all carrying the **"Draft — Review
  before sending"** banner.
- [ ] works as intended

- {note for changes: }

⚠ Known gap: these domain drafts are synthetic (seeded from one sample lease) and "Dan" is hardcoded as the owner/approver name in several renewal/move-out strings — cosmetic, on the cleanup list.

---

## 5. Lease Renewal — front to back (the focal feature)

**Map first.** The desk and per-lease workspace run on **sample data** and never touch Gmail. The
reconciliation runs and the live review write **Firestore governance records only** (resolutions,
approvals) — never the sheet, never a send. The **only** surface that produces something external is
`/lease-renewal/live/notices`, which creates a **real unsent Gmail draft**. Keep that mental model as
you test.

### 5a. The Renewal Desk (`/lease-renewal`)

#### P5.1 — Read the desk ✅

- **Where:** Lease Renewal nav → `/lease-renewal`.
- **Do:** Look at the header, metric row, attention fold, and queue.
- **Produces:** Header **"Renewals"**, subtitle **"7 leases in your current renewal window"**, a **"Sample
  data"** chip. Metric row **Actionable 3 · Needs review 1 · Skipped 2 · Out of window 1**. A
  **"Needs your attention"** fold with two cards: **Walnut** ("1 source conflict to resolve before
  you can continue" → **"Resolve conflicts"**) and **Maple** ("Get the owner's rent decision" →
  **"Get the owner decision"**). A **"Your queue"** of three actionable lease cards.
- [ ] works as intended

- {note for changes: }

#### P5.2 — The "what's next" signal on each lease ✅

- **Where:** `/lease-renewal` → "Your queue" cards.
- **Do:** Read each card's stepper and "Next:" line.
- **Produces:** Each card shows a 4-step **Stepper** (Data check → Owner decision → Tenant offer → Build docs),
  a **"Next: …"** line, and an **"Open"** button. Walnut → **"Next: Confirm the rent before
  drafting"** (with a red **"1 source conflict"** pill); Maple → **"Next: Get the owner's rent
  decision"**; Cedar → **"Next: Review the tenant offer drafts"**. This "Next:" line IS the app's
  guidance for what to do next.
- [ ] works as intended

- {note for changes: }

⚠ Known gap: the **"Live renewal notices (compose drafts)"** button (the real draft flow) and the **"View
live review →"** link are shown to **Admins only**, even though the notices page itself only needs
`edit`. An Editor has permission but no link — they must know the URL. On the fix list.

#### P5.3 — The set-aside groups ✅

- **Where:** `/lease-renewal` → the collapsible groups.
- **Do:** Expand **"Needs review (1)"**, **"Skipped (2)"**, **"Out of window (1)"**.
- **Produces:** Needs review → "77 Birch Ln, Unit 1" tagged **"Off-cycle end date"**. Skipped → "540 Oak Dr"
  (**"Month-to-month"**) and "915 Pine St" (**"Program lease"**). Out of window → "12 Elm Ct"
  (**"Outside this window"**). Each classification is deterministic and explained.
- [ ] works as intended

- {note for changes: }

### 5b. Work a lease (sample, read-only) — `/lease-renewal/lease/<id>`

#### P5.4 — Walk the 4 steps on the Cedar lease ✅

- **Where:** `/lease-renewal` → "Your queue" → **Open** on **"318 Cedar Ave, Unit 7"**.
- **Do:** Read each of the 4 stepper panels.
- **Produces:** **Data check** — both rows show a **"Agrees"** pill (RentVine $1,180 / 2026-09-30, both
  Verified). **Owner decision** — facts populated (comp range, suggested number), a draft with the
  **"Draft — Review before sending"** banner, and a **"Preview the owner email"** disclosure.
  **Tenant offer** — three tabs (Email / Portal chat / Text) because the owner decision is recorded
  in the seed. **Build docs readiness** — a checklist of 7 items each marked OK / Flag / Needs
  input. (Note: only the 3 actionable sample leases have workspaces; opening a skipped lease's URL
  shows **"This renewal is unavailable."**)
- [ ] works as intended

- {note for changes: }

#### P5.5 — See a data-check conflict ✅

- **Where:** `/lease-renewal/lease/lease-1207-walnut-2` (the Walnut lease).
- **Do:** Open it and read the Data check step.
- **Produces:** A conflict row with a **"Needs your decision"** pill: RentVine **$1,250 (Verified)** vs Sheet
  **$1,289 (Needs Verification)**. The workspace shows the conflict but the actual resolve controls
  live on the reconciliation run (§5c). The stepper sits at Data check with **"Next: Confirm the
  rent before drafting."**
- [ ] works as intended

- {note for changes: }

#### P5.6 — "Prepare owner/tenant email" is preview-only (expectation-setter) ⚠

- **Where:** A lease workspace → **"Prepare owner email"** / **"Prepare tenant email"**.
- **Do:** Click either button.
- **Produces:** An on-screen preview and the reason **"Sample renewal data is preview-only. Do not send;
  connect a real authorized renewal run and verified owner recipient first."** The recipient shows
  as **"Needs Verification: owner/tenant email"** and there is **no** Copy button and **no** Gmail
  draft. This is the deliberate "looks actionable but no-ops externally" control — the real drafts
  are made on the live notices desk (§5e).
- [ ] works as intended

- {note for changes: }

⚠ Known gap: the "Renewal-notice draft" card here is an inert empty-state that tells you to go to the live
desk but gives no link to it — you must navigate back and (if Admin) use the desk button.

### 5c. The reconciliation run (`/lease-renewal/runs/<id>`)

#### P5.7 — Open the sample reconciliation run ✅

- **Where:** `/lease-renewal` → diagnostics → "View the raw reconciliation run", or `/lease-renewal/runs`
  → **"Sample renewal run (synthetic)"**.
- **Do:** Read the flags.
- **Produces:** A **Test-only** banner and flag cards: a **High** rent conflict (Casey Rivers: Sheet $1,300 vs
  RentVine $1,400), a **High** renewal-date conflict, a **High** lawn-care legal conflict, a
  **Medium** inspections-cadence conflict, and a **Blocked** "no precedence rule" item (Jordan
  Maple). Agreeing fields produce no flag.
- [ ] works as intended

- {note for changes: }

#### P5.8 — Resolve a High conflict (Admin) ✅

- **Where:** A **High** flag card → the resolve form.
- **Do:** As **Admin**: Resolution = **"Pick a source"** → choose RentVine; add a **Reason** (required),
  click resolve, then **"Confirm resolution"** in the confirmation dialog.
- **Produces:** A confirmation dialog **"Confirm High resolution"** with the note that it records the decision
  but **does not execute a write-back**; then a Firestore resolution + append-only Activity row,
  and the card shows **"Resolved via Pick a source → Rentvine: <your reason>"**. Error probes:
  empty reason → **"A plain-English reason is required."**; a non-Admin sees **"An Admin must
  resolve High and Blocked flags."**
- [ ] works as intended

- {note for changes: }

#### P5.9 — Approve a write-back proposal (Admin) ✅

- **Where:** A flag with a write-back proposal → **"Approve proposal"** (Admin only).
- **Do:** Click **"Approve proposal"**, add a reason.
- **Produces:** The proposal state becomes **"Approved: ready to write (not executed)"** and an Activity row is
  written. The repeated caveat holds: **"Approving records your authorization for the future
  append-only Sheet write. It is not executed here."** No sheet cell is ever written from this UI.
- [ ] works as intended

- {note for changes: }

⚠ Known gap: the renewal tracking sheet stays read-only by owner decision — write-back is authorization
only, never an actual sheet mutation.

### 5d. Live review (Admin, real RentVine + Sheet)

#### P5.10 — Degraded states when sources aren't connected ✅

- **Where:** `/lease-renewal/live` (Admin) — via the desk's "View live review →".
- **Do:** Open it without RentVine/Sheets connected.
- **Produces:** One of the honest panels: **"Live sources aren't connected"** (+ "Open Connection Center"),
  **"Wrong RentVine account"**, **"Live read couldn't authenticate"**, or **"Live read didn't
  complete"**. It never silently falls back to sample data.
- [ ] works as intended

- {note for changes: }

#### P5.11 — Live flag resolution (when connected) ✅

- **Where:** `/lease-renewal/live` with RentVine + Sheet connected.
- **Do:** Resolve a live flag (same form as §5c).
- **Produces:** **"Live renewal review"** with a **"Live data"** chip and "N item(s) need a human decision".
  Resolving writes a Firestore resolution/approval + Activity. The copy is explicit: **"Nothing
  here is sent and no record is changed. Review each item, then make the fix at the source."** —
  the source fix is manual.
- [ ] works as intended

- {note for changes: }

### 5e. The REAL draft flow — `/lease-renewal/live/notices` (produces a Gmail draft)

#### P5.12 — Compose and create a real tenant renewal draft ✅ (the money path)

- **Where:** `/lease-renewal/live/notices` (Admin link from the desk, or the URL as an Editor). **Requires
  RentVine connected.**
- **Do:** Expand a lease whose summary says "tenant ready". Channel = **"Tenant offer"**; **Owner
  decision** = "Increase rent"; **Offered rent (monthly)** = e.g. `1325`. Click **"Preview
  draft"**, review the To/Subject/body, then **"Create Gmail draft"**.
- **Produces:** Preview shows **"Preview only. Review it, then choose 'Create Gmail draft'."** with To/Subject/
  body. Create produces a **REAL unsent Gmail draft in your Drafts folder**, To = the
  RentVine-sourced tenant email, **Cc = co-tenants**, body prefixed **"Draft — Review before
  sending"**, and the on-screen confirmation **"Unsent Gmail draft created (id …). Open Gmail to
  review and send it to <recipient> yourself."** You send it from Gmail — the app never sends.
- [ ] works as intended

- {note for changes: }

#### P5.13 — A draft with no verifiable recipient is blocked (error probe) ✅

- **Where:** `/lease-renewal/live/notices` → a lease with no verifiable tenant email.
- **Do:** Fill the offer and click **"Preview draft"**.
- **Produces:** Blocked under **"This draft is not ready:"** with **"Recipient tenant email needs
  verification."** — "Create Gmail draft" stays disabled and no draft is created. Other block
  reasons you may see: "Lease end date was not found in the live RentVine lease.", "Offered rent
  must be greater than zero." Non-authoritative or non-routable addresses (`.invalid`, sample
  sources) are refused even at create time.
- [ ] works as intended

- {note for changes: }

#### P5.14 — Owner-channel drafts (expectation-setter) ⚠

- **Where:** `/lease-renewal/live/notices` → Channel **"Owner notice"**.
- **Do:** Fill the owner fields (market number, comp range, comps reference) and preview.
- **Produces:** Today this almost always blocks with **"Recipient owner email needs verification."**
- [ ] works as intended

- {note for changes: }

⚠ Known gap: the owner contact is dropped when the live lease view is flattened, so owner-notice drafts
generally cannot resolve a recipient until the owner-join lands. Expect owner drafts to fail on live data.

### 5f. Property decision history (Admin)

#### P5.15 — Review a property's decision history ✅

- **Where:** A lease workspace → **"View property decision history"** (Admin) → `/lease-renewal/property/<key>`.
- **Do:** Read the page.
- **Produces:** **"Property decision history"** listing resolution decisions and write-back approvals for that
  property (each `{action} by {actor} at {time}` + reason), plus a "Current decision and
  authorization state" panel. Read-only.
- [ ] works as intended

- {note for changes: }

> **Concrete front-to-back run (do this once, in order):** Desk (`/lease-renewal`) → read metrics and the
> "Next:" signal → **Open** Cedar → walk the 4 steps (note the drafts are preview-only) → back to the desk
> → open the reconciliation run → resolve the High rent conflict (Admin, reason, confirm) → approve its
> write-back proposal (authorization only) → then the **real** finish: `/lease-renewal/live/notices` (needs
> RentVine) → compose a Tenant offer → **Preview** → **Create Gmail draft** → open **Gmail Drafts** and
> confirm the unsent draft is there → **you** press Send. The UI's "next step" is signalled by the Stepper
> position and the "Next:" line on the desk, and by the "Open Gmail and send it yourself" end-state.
> [ ] the end-to-end path is discoverable and obvious
>
> - {note for changes: }

---

## 6. Approval Queue

The page loads at `read`; each mutation checks its own capability at the API. Terminal statuses are
**Approved, Completed, Cancelled, Disabled, Denied, Closed** — any action on a terminal item returns
**"This queue item is already closed."**

#### P6.1 — The landing inbox + "Other views" ✅

- **Where:** Approval Queue nav → `/approval-queue`.
- **Do:** Read the landing, then expand **"Other views"**.
- **Produces:** The value-free **"Needs your decision"** inbox with **"N thing(s) need your decision, most
  urgent first."** (empty: **"Nothing needs your decision right now."**). Behind **"Other views"**
  are tabs **All items / Renewal reviews (N) / Write-back proposals (N)**. Only "All items"
  renders the full list + detail + filters + bulk bar.
- [ ] works as intended

- {note for changes: }

#### P6.2 — Approve a plain low/medium item ✅

- **Where:** All items → select an item → **"Approve"**.
- **Do:** Click Approve on a non-high-risk item with no linked execution.
- **Produces:** One click, no reason needed → status flips to **Approved**, an Activity row **"Approved"** is
  written, and it collapses out of the active list. **No external send, no system-of-record
  write** ("Approval changes this app decision only.").
- [ ] works as intended

- {note for changes: }

#### P6.3 — Approve a High-risk item (error + confirm probe) ✅

- **Where:** All items → a **High** risk item → **"Approve"**.
- **Do:** Click Approve.
- **Produces:** A browser confirm **"This is a High-risk approval. Approve this queue item?"** and a **required
  reason**. Missing reason → **"High-risk approval requires a reason."** Approving without the
  confirm flag is refused server-side with **"High-risk approval requires explicit confirmation."**
- [ ] works as intended

- {note for changes: }

#### P6.4 — Approve for execution (linked, Admin) ✅

- **Where:** An item with a linked execution → button reads **"Approve for execution"**.
- **Do:** As Admin, approve with a reason.
- **Produces:** A reason is required; the execution ledger is set to **Approved** and an Activity row written.
  The panel is explicit: **"Approval authorizes the exact execution preview. It does not make the
  provider attempt; execution remains a separate owning-workflow action."** A non-Admin sees
  **"Admin role is required for this consequential execution."**
- [ ] works as intended

- {note for changes: }

#### P6.5 — Deny (terminal; reason required) ✅

- **Where:** A review item (no linked execution) → **"Deny"**.
- **Do:** Click Deny with an empty reason, then with a reason.
- **Produces:** Empty → **"Deny requires a reason."** With a reason → status **Denied** (terminal, no further
  actions), reason logged in Activity. A linked-execution item cannot be denied here: **"Use
  Disable Action to reject a linked execution."**
- [ ] works as intended

- {note for changes: }

#### P6.6 — Return for revision (reason) ✅

- **Where:** An item → **"Return"**.
- **Do:** Return with a reason (empty → **"Return for Revision requires a reason."**).
- **Produces:** Status **Returned** (non-terminal — it goes back to the submitter), reason logged.
- [ ] works as intended

- {note for changes: }

#### P6.7 — Snooze (date + reason) ✅

- **Where:** An item → **"Snooze"**.
- **Do:** Set a **"Snooze until"** date and a reason.
- **Produces:** Both required — missing → **"Snooze requires a date and reason."** Success → status **Snoozed**
  with the deferral date, reason logged.
- [ ] works as intended

- {note for changes: }

#### P6.8 — Assign (Admin only) ✅

- **Where:** An item → **"Assign"** (Admin only).
- **Do:** Set an **Assignee** and/or **Required approver**, **"Save Assignment"**.
- **Produces:** At least one field required (**"Assign requires an assignee or required approver."**). If the
  item was **Blocked** and both are now set, it flips to **Ready for Approval** ("Unblocked" in
  Activity); otherwise "Assigned". Non-Admin → **"Only Admins can assign or reassign queue items."**
- [ ] works as intended

- {note for changes: }

#### P6.9 — Disable Action (Admin only) ✅

- **Where:** An item → **"Disable Action"** (Admin only).
- **Do:** Disable with a reason.
- **Produces:** Status **Disabled** (terminal), a linked execution is revoked, reason logged. Reason required
  (**"Disable Action requires a reason."**). This is how you reject a linked execution.
- [ ] works as intended

- {note for changes: }

#### P6.10 — Role gates (error probes) ✅

- **Where:** Any item.
- **Do:** Try to approve an item assigned to you; try to approve as an Editor.
- **Produces:** You cannot approve your own assigned item (tooltip **"You cannot approve your own assigned
  item."**, server **"You cannot approve your own queue item…"**). Only the required approver or an
  Admin can approve (**"Only the required approver or an Admin can approve."**).
- [ ] works as intended

- {note for changes: }

#### P6.11 — Bulk actions ✅

- **Where:** All items → select multiple → the bulk bar.
- **Do:** Select items (up to **50**), pick a bulk action, Apply.
- **Produces:** **"Bulk action finished: X updated, Y skipped, Z failed."** with a per-item result list.
  Selecting past 50 → **"Bulk actions are limited to 50 visible items."** The **Execute** option is
  present but every item is **skipped** with **"Bulk execute is not available until approved
  executable external-action runtime exists. No external write was attempted."**
- [ ] works as intended

- {note for changes: }

⚠ Known gap: bulk **Execute** never does anything today (no executable runtime). A **"Close"** transition
exists server-side (Admin + reason) but has **no button** — it is direct-API only.

#### P6.12 — Deep link + filters ✅

- **Where:** `/approval-queue?item_id=<id>`, and the filter bar.
- **Do:** Open a deep link; use the Status/Risk/Audience filters.
- **Produces:** The deep link selects that item and expands "Other views"; clicking a different item updates
  the URL and detail together. Filters narrow the list; empty → **"Nothing is currently waiting
  for review"**; a Firestore failure → **"Approval Queue unavailable"** + **"Use Reset to retry."**
- [ ] works as intended

- {note for changes: }

---

## 7. Maintenance

Page loads at `read` + maintenance scope; the capture form is `edit`-gated.

### 7a. Create a ticket

#### P7.1 — Build a work-order draft and create a ticket ✅

- **Where:** `/maintenance` → the Capture panel.
- **Do:** Type an **Issue** (e.g. `kitchen faucet leaking under the sink`), pick a **Unit** via the
  typeahead, optionally a **Priority**, click **"Build work-order draft"**, then **"Create
  ticket"**.
- **Produces:** A draft preview (summary/priority/unit/photos/blockers), an owner-notice draft, a
  vendor-trade suggestion; then a real Firestore ticket in the **`maintenance_tickets`**
  collection at status **Open**, and the confirmation **"Ticket created (Open). Reload to see it
  in the queue below."**
- [ ] works as intended

- {note for changes: }

#### P7.2 — Voice-capture the issue ✅

- **Where:** Capture → **"Record voice"**.
- **Do:** Record, stop.
- **Produces:** The transcript is echoed as **"Transcript: …"** and folded into the issue. Errors:
  **"No speech detected. Try again a little closer to the mic."**, **"Could not reach the
  transcription service. Type the note instead."**
- [ ] works as intended

- {note for changes: }

#### P7.3 — Blockers stop a premature ticket (error probe) ✅

- **Where:** Capture with missing fields.
- **Do:** Click "Build work-order draft" with no issue, or without matching a unit.
- **Produces:** **"Create ticket"** is disabled while blockers exist: **"Add an issue description or voice
  note."**, **"Match the location to a unit."**, **"Confirm the matched unit (low-confidence
  match)."** No blockers → **"No blockers. Ready for human review."**
- [ ] works as intended

- {note for changes: }

#### P7.4 — Photo upload is gated off (expectation-setter) ⚠

- **Where:** Capture → the photo area.
- **Do:** Look for a file input.
- **Produces:** There is **no file input**; you see **"Photo storage is unavailable until the Drive action has
  owner-approved permission. Continue without a photo."**
- [ ] works as intended

- {note for changes: }

⚠ Known gap: photo upload is not wired in this build (Action Registry gate closed); the API 409s before
touching bytes. Owner Drive permission + folder id would open it.

### 7b. The ticket queue

#### P7.5 — Filter and read the queue ✅

- **Where:** `/maintenance` → the queue below Capture.
- **Do:** Use the **Data** filter (All / Live only / Test only) and **"Assigned to me"**.
- **Produces:** Open-first list with a collapsible **"Closed (N)"**. Statuses: **Open, Waiting on Response,
  Waiting on Vendor, Scheduled, Closed**. Pills bucket to Needs Attention / Scheduled / Completed.
  Empty → **"No tickets yet. Build a work-order draft and create a ticket."**
- [ ] works as intended

- {note for changes: }

#### P7.6 — Change status / close (reason) ✅

- **Where:** A ticket card → the **Status** dropdown.
- **Do:** Move a ticket to **Closed**.
- **Produces:** A prompt **"Reason for closing this ticket?"**; empty → **"A reason is required to close a
  ticket."** Success → status **Closed** with the reason, an Activity "close" row, and a
  notification event. Illegal transitions are refused (e.g. a closed ticket can only be reopened).
- [ ] works as intended

- {note for changes: }

#### P7.7 — Reopen, assign, note, history ✅

- **Where:** A ticket card.
- **Do:** **Reopen** a closed ticket (reason required), change **Assignee** (staff roster), **"Add
  note"**, expand **History**.
- **Produces:** Reopen → **Open**, closed fields cleared. Assignee validated against the roster (off-roster →
  **"That user cannot be assigned maintenance tickets."**). Notes append to an activity trail.
  History shows human-readable entries ("Ticket created", "Status set to …", "Closed: <reason>",
  "Note: …").
- [ ] works as intended

- {note for changes: }

### 7c. Vendor handoff

#### P7.8 — Test Vendor handoff (Summit Plumbing) ✅

- **Where:** A **Test** ticket card → the "Test Vendor assignment" callout.
- **Do:** Click **"Assign Summit Plumbing Test Vendor"**, then expand **"Vendor handoff"**.
- **Produces:** The Test vendor is assigned (a `vendor_ticket_assignments` write + Activity), and the handoff
  panel shows a bodyless projection ("Draft ready: Yes/No · Simulated replies: N") with no real
  message content. **"Unassign Test Vendor"** reverses it.
- [ ] works as intended

- {note for changes: }

#### P7.9 — Live vendor assignment (expectation-setter) ⛔

- **Where:** A **Live** ticket card.
- **Do:** Look for a vendor-assign control.
- **Produces:** There is **no UI control** to assign a live vendor. If a `vendor_id` is already set the card
  just reads **"A Live Vendor is assigned."** Live tickets instead show the Gmail linking panel
  (§8c) and a live-write boundary callout.
- [ ] works as intended

- {note for changes: }

⚠ Known gap: live vendor assignment is not wired (only the Test vendor lane is). Vendor suggestions are
heuristic trade-matching; the vendor is never named ("Needs Verification: client vendor roster").

### 7d. Tenant intake

#### P7.10 — Public tenant maintenance request (expectation-setter) ⚠

- **Where:** There is **no rendered public form** and **no UI to create the intake link**.
- **Do:** To exercise it, mint a token (CLI `npm run intake:mint` or the token API) and POST a test
  submission with `summary` (required), optional `description`/`contact` — **no photo field**.
- **Produces:** A **202** `{ status: "received", reference: <uuid> }`; the submission lands in a **quarantine**
  collection (`maintenance_unverified_intake`), never a live ticket. Error probes: reused link →
  **"This intake link has already been used."** (409); over the per-property daily cap (default
  50; 15 for reusable signage links) → **"This property has reached its intake limit for today."**
  (503); oversized → **"Request too large."** (413).
- [ ] works as intended

- {note for changes: }

⚠ Known gap: no tenant-facing form page and no UI to mint the link; public intake has no photo field. On
the build list. (Also: the public intake IP-hash salt secret should be set before enabling this — see
`docs/whats-next.md` §3.3.)

#### P7.11 — Triage unverified intake (promote / dismiss) ✅

- **Where:** `/maintenance` → the **"Unverified intake (N)"** section.
- **Do:** On a row, **"Promote to Live app ticket"** (optionally confirm a unit) or **"Dismiss"** (reason
  required).
- **Produces:** Promote → a real `maintenance_tickets` **Open** ticket (labeled "Needs Verification" if the
  unit is unconfirmed) and **"Promoted to a Live app ticket (unit needs verification; no provider
  effect was created)."** Dismiss → **"Dismissed."** with the reason logged. An already-triaged row
  → **"That intake has already been reviewed."**
- [ ] works as intended

- {note for changes: }

---

## 8. Communications / Gmail Hub (`/gmail-hub`)

Heading **"Workflow Communications"** — "This is not a replacement inbox." All roles see the connection
workspace; the four governed tools are **Admin-only**.

#### P8.1 — The Gmail connection workspace ✅

- **Where:** Communications nav → `/gmail-hub`.
- **Do:** Read the connection status and the attention list.
- **Produces:** A status line — **"Checking connection"** → **"Connected as <mailbox>"** (connected) or
  **"Waiting on Gmail access"** / **"Gmail connection health could not be checked."** (not). When
  connected, a **"Workflow communication attention"** list of bodyless linked-thread rows (empty:
  **"No linked renewal or maintenance communication needs attention."**). Footer: **"Inbox search,
  recent-inbox browsing, free-form compose, and arbitrary labels are not available here."**
- [ ] works as intended

- {note for changes: }

⚠ Known gap: the "Available / Action Required" words are internal styling attributes, not the visible pill
text — don't look for them literally on screen.

#### P8.2 — Anticipatory draft composer (Admin) ✅

- **Where:** `/gmail-hub` → Admin tools → **"Anticipatory draft"**.
- **Do:** Pick a **Reply pattern**, set **Sender / Category / Subject / Facts to verify**, click
  **"Compose draft"**, then **"Copy draft"**.
- **Produces:** A text draft in the draft box whose **first line is the exact banner "Draft — Review before
  sending"**, with any missing fact shown as **"Needs Verification: …"**. **"Copy draft"** copies
  it (label → **"Copied"**). It **cannot send** — the route touches no mailbox. Choosing a
  hard-excluded category (Owner money / Legal-notices / Tenant disputes) refuses **before** the
  model: **"Refused before the model: …"**.
- [ ] works as intended

- {note for changes: }

#### P8.3 — Template workspace + thread summary + simulated chain (Admin) ✅

- **Where:** `/gmail-hub` → Admin tools.
- **Do:** In **"Template & triage workspace"** paste facts and **"Evaluate"**; in **"Thread summary"**
  paste thread text and **"Summarize thread"**; in **"Simulated email chain"** add a reply.
- **Produces:** Evaluate → suggested labels (each "auto-apply eligible" or "suggest only") + a draft preview,
  or **"No approved rule matched these facts."** Summarize → a Summary / Waiting on / Suggested
  next action (or **"No summary was produced. Try re-pasting the thread."**). Simulated chain →
  appends a browser-only reply that resets on refresh (**"no Gmail API, mailbox, database, or
  external delivery is involved"**). None of these can send.
- [ ] works as intended

- {note for changes: }

#### P8.4 — Send an exact-confirmed reply (live maintenance ticket) ✅ (the only in-app send)

- **Where:** A **live** Maintenance ticket → the **"Linked Gmail communication"** panel.
- **Do:** **Load linked communication** → **Open** the thread → **"Request source-backed reply
  proposal"** → **"Review exact linked reply"** → tick the confirmation checkbox → **"Send exact
  linked reply"**.
- **Produces:** The confirmation card **"Exact linked reply: not yet sent"** with From / To / CC / BCC /
  Subject / Linked thread / Confirmation expires / **Exact reply body** — all resolved server-side
  from the real thread (never the AI text directly). The required checkbox reads **"I reviewed the
  exact mailbox, recipient, subject, and reply body."** Sending yields a **"Bodyless Gmail
  receipt"** (Message ID / Thread ID) and **"The exact linked reply was sent once."** A duplicate
  returns the existing receipt (no double-send).
- [ ] works as intended

- {note for changes: }

#### P8.5 — Ambiguous send is not blindly retried (error probe) ✅

- **Where:** The send flow, if Gmail returns an ambiguous result.
- **Do:** (If it occurs) observe the panel.
- **Produces:** The Send button is replaced by **"The prior send outcome is ambiguous. Sending again is
  disabled until Gmail is checked for the unique message ID."** and a **"Reconcile ambiguous
  reply"** button. Reconcile matches by RFC Message-ID; if not found → **"No matching Gmail message
  was found. This reply remains blocked; do not retry."**
- [ ] works as intended

- {note for changes: }

#### P8.6 — Confirm autonomous / bulk / new-message send is refused (safety check) ✅

- **Where:** Anywhere in Communications.
- **Do:** Confirm there is no "compose new email", no "send all", no bulk send.
- **Produces:** Correct. Generic compose is refused server-side (**"New-message sending is not exposed by
  Workflow Communications; use an approved unsent workflow draft."**), the Connection Center lists
  **"Gmail (legacy notification sender): Disabled"**, and every send consumes a single one-time
  confirmation token. Only exact single replies to an already-linked live thread can send.
- [ ] works as intended

- {note for changes: }

⚠ Known gap: real drafts/sends require Gmail DWD env + the RentVine/Sheets data behind the ticket; without
them the connection pill sits at "Waiting on Gmail access". The renewal draft path (§5e) and this reply
path are the only production-open Gmail writes; generic `gmail.draft.create` and `gmail.message.send`
stay gate-closed.

---

## 9. Connections (`/connections`)

#### P9.1 — Read the connector grid ✅

- **Where:** Connections nav → `/connections`.
- **Do:** Read the metric row and each connector card.
- **Produces:** **Connected / Need attention / Not connected** counts, and one card each for RentVine, Google
  Sheets, Google Drive, Dotloop, LeadSimple, Gmail (legacy sender — "Disabled"), Gmail (workflow
  communications), QuickBooks. Each shows a status dot + label (**Connected / Needs attention /
  Ready to verify / Setup complete / Not connected**), a "powers" line, and a method badge
  (Google / OAuth / API key). Status is derived purely from which env vars are present.
- [ ] works as intended

- {note for changes: }

#### P9.2 — "Set up <name>" is text-only (expectation-setter) ⚠

- **Where:** A connector card (Admin) → the **"Set up <name>"** disclosure.
- **Do:** Expand it.
- **Produces:** **Explanatory text only** — e.g. "How you'll connect: Add your API key. The app stores your
  credentials securely and checks the connection. No files to edit, no tests to run." There is
  **no credential form, no OAuth button, no wizard**. Actually connecting is a server-side
  env/Secret-Manager task.
- [ ] works as intended

- {note for changes: }

⚠ Known gap: this copy over-promises an in-app "store your credentials" flow that does not exist. A real
connect-and-save walkthrough is on the build list (`docs/whats-next.md` §2.2); consider an honesty-fix to
the copy in the meantime.

#### P9.3 — Verify a live connection (Admin; RentVine + Sheets only) ✅

- **Where:** RentVine or Google Sheets card (Admin) → **"Verify connection"**.
- **Do:** Click it.
- **Produces:** A bounded read-only probe → **"<name> answered the live check."** (card turns **Connected /
  "Verified and ready."**) or **"<name> did not pass the live check. See the card status for what
  to fix."** A non-Admin calling it → **"Only an Admin can run a connection verification."**
- [ ] works as intended

- {note for changes: }

#### P9.4 — Other connectors can't turn green (expectation-setter) ⚠

- **Where:** Drive / Dotloop / LeadSimple / QuickBooks cards.
- **Do:** Note there is no "Verify" button.
- **Produces:** These have no live probe, so even fully configured they cap at **"Setup complete"** with
  **"No bounded live verification check is available yet."** — they never show **Connected**.
- [ ] works as intended

- {note for changes: }

⚠ Known gap: the "Disabled" Gmail-legacy and QuickBooks cards still render "Not connected / Connect to
enable …", inviting connection of an intentionally-disabled/no-config connector — mildly confusing copy.

---

## 10. Admin (`/admin`)

Admin-only. Three sections: **People and Access**, **Activity and Logs**, **App Info and Readiness**.

#### P10.1 — The Admin home ✅

- **Where:** Admin nav → `/admin`.
- **Do:** Skim the three sections.
- **Produces:** People and Access (link **"Manage users and roles"**), Activity and Logs (observability tiles +
  Approval-queue depth + **"Reported Issues"** + **"Access Changes"**), and App Info and Readiness
  (approval label, indexing, **"Open migration console"**, **"Open communication governance"**).
- [ ] works as intended

- {note for changes: }

### 10a. Make a teammate a maintenance user and scope them — the headline flow

#### P10.2 — Change a teammate's role ✅

- **Where:** `/admin` → **"Manage users and roles"** (`/admin/users`).
- **Do:** Find the person's row, change the **Role** dropdown (Editor / Approver / Admin), type a
  **"Reason (required)"** (3+ chars), click **"Save role"**.
- **Produces:** Success **"<email> is now <Role>. They re-sign-in to refresh."** — the change is a Google custom
  claim that takes effect on their **next sign-in**. Promoting/removing Admin pops a confirm
  dialog. An append-only audit record is written **before** the claim (surfaced in "Access
  Changes"). Error probes: reason under 3 chars → **"Add a short reason for the change."**; no role
  change → **"Pick a different role before saving."**
- [ ] works as intended

- {note for changes: }

⚠ Known gap (read first): there is **no in-app "invite / create user"**. A teammate becomes a row here
only **after** they have signed in once with a `@pmikcmetro.com` Google account (creation lives in Google
Workspace). A brand-new hire is invisible on this page until their first sign-in.

#### P10.3 — Scope a user to Maintenance ("put them in the group") ✅

- **Where:** `/admin/users` → the person's **"Space access"** sub-row.
- **Do:** Untick **"All spaces"**, tick **Maintenance**, type an **"Access reason (required)"**, click
  **"Save space access"**.
- **Produces:** **"<email> now has access to Maintenance. They re-sign-in to refresh."** After they re-sign-in,
  their nav shows Maintenance but not Lease Renewal / Approval Queue, and they land on the
  Maintenance desk. Error probe: unticking All-spaces with nothing selected → **"Choose at least
  one space, or choose All spaces."**
- [ ] works as intended

- {note for changes: }

#### P10.4 — Last-Admin guard (error probe) ✅

- **Where:** `/admin/users`.
- **Do:** Try to demote the only remaining Admin.
- **Produces:** **"Cannot remove the last Admin."**
- [ ] works as intended

- {note for changes: }

⚠ Known gap: the last-Admin guard is best-effort, not concurrency-safe — two simultaneous demotions could
still race to zero (recoverable only via the `firebase:set-role` break-glass script).

#### P10.5 — Audit + reported-issues panels ✅

- **Where:** `/admin` → **"Access Changes"** and **"Reported Issues"**.
- **Do:** Read both.
- **Produces:** Access Changes lists role/scope changes newest-first (what changed, target, actor, reason —
  "Read-only history; nothing is emailed."). Reported Issues lists everything filed via the
  "Report an issue" button (route, time, role, status, description). Empty: **"No access changes
  recorded yet."** / **"No reports yet."**
- [ ] works as intended

- {note for changes: }

### 10b. External Vendor lifecycle (Test)

#### P10.6 — Provision the Summit Plumbing Test Vendor ✅

- **Where:** `/admin/users` → the **"External Vendors"** panel.
- **Do:** Enter a provisioning reason → **"Review exact Test setup"** → **"Confirm and provision Test
  Vendor"**.
- **Produces:** A review card (exact effect) then a **one-time password-setup link shown once**, with the
  warning **"Never paste, share, copy, save, log, or send this link…"**, and **"Test Vendor
  created. Open the one-time link now, set its password, then enroll TOTP on first sign-in."** The
  Vendor record is `pending_setup`; a bodyless audit is written.
- [ ] works as intended

- {note for changes: }

#### P10.7 — Regenerate / reset / disable a Test Vendor ✅

- **Where:** The External Vendors panel (each action is review-then-confirm-once).
- **Do:** Try **"Review new one-time setup link"** (while pending), **"Review authentication reset"**, and
  **"Review Test Vendor disable"**.
- **Produces:** Regenerate → a fresh one-time link, record unchanged. Reset → **rotates to a brand-new Firebase
  UID** (revokes sessions, clears password + TOTP), returns to `pending_setup` with a new link,
  preserving the Test tickets. Disable → **"Test Vendor disabled and Firebase sessions revoked."**
  There is **no "Enable" button** — re-enabling a disabled vendor is done via **Reset
  authentication**.
- [ ] works as intended

- {note for changes: }

#### P10.8 — Migration + communication governance consoles ✅

- **Where:** `/admin/migration` and `/admin/gmail-inbox-zero`.
- **Do:** Open each.
- **Produces:** **"Migration Readiness"** — a read-only cutover-readiness mirror that makes **no cloud call** and
  honestly shows the production blockers that remain (owner-side items it can't clear). **Workflow
  Communications Governance** — the three immutable approved artifacts + a **synthetic** rule/
  template evaluator that "cannot make an action executable."
- [ ] works as intended

- {note for changes: }

---

## 11. External Vendor portal (`/vendor`)

⚠ Only the **Test Vendor** path is fully wired. Inviting a real (live) vendor is built but not reachable
from any UI.

#### P11.1 — Vendor sign-in with password + TOTP ✅

- **Where:** `/vendor/sign-in` (heading **"Vendor sign in"**).
- **Do:** Open the one-time link, set a password. Enter **"Verified Vendor email"** + **"Password"** →
  **"Continue"**. First time: add the **"Setup key"** to an authenticator, enter the 6-digit code,
  **"Verify"** — the app signs you out (**"TOTP enrolled. Sign in again and complete the
  authenticator challenge."**); sign in again and enter the code.
- **Produces:** A vendor session cookie (max 1 hour) and a redirect to `/vendor`. Bad code → **"The TOTP code
  was rejected."** Footer: **"There is no self-registration. Use the one-time setup link from PMI
  KC first."**
- [ ] works as intended

- {note for changes: }

#### P11.2 — Server enforcement (error probes) ✅

- **Where:** The vendor session gate.
- **Do:** (Conceptually) confirm the gates.
- **Produces:** The server rejects unless `vendor:true` (**"This account is not a Vendor account."**), email
  verified (**"Verify the Vendor email before continuing."**), TOTP used (**"TOTP verification is
  required."**), and the MFA sign-in is fresh (≤1h; **"A recent Vendor MFA sign-in is required."**).
- [ ] works as intended

- {note for changes: }

#### P11.3 — Assigned tickets only + isolation ✅

- **Where:** `/vendor` and `/vendor/tickets/<id>`.
- **Do:** Confirm you see only assigned tickets; try to reach an internal page as a vendor, and `/vendor`
  as internal staff.
- **Produces:** **"Assigned maintenance tickets"** — only tickets assigned to this vendor (empty: **"No assigned
  tickets"** / "Ask PMI KC to verify the assignment."). A guessed/unassigned ticket → 404. A vendor
  cannot reach internal pages (sent to `/sign-in`); internal staff cannot reach `/vendor` (sent to
  `/vendor/sign-in`). Test tickets show a **simulated** mailbox (draft/label/reply, never a real
  send: **"No email left the app."**).
- [ ] works as intended

- {note for changes: }

⚠ Known gap: the live vendor **invite** flow (`inviteVendor`) is built but wired to no route or button —
you cannot invite a real vendor from the running app today.

---

## 12. Processes & Workflow Runs (deep-link only)

These are reached by deep link (e.g. a Space's "View full process →"), not from the top nav.

#### P12.1 — Process definitions + runs ✅

- **Where:** `/processes`, `/processes/<id>`, `/workflow-runs/<id>` (e.g. from a Space Process sub-tab).
- **Do:** Open a process definition and a run.
- **Produces:** `/processes` → the definition list. `/processes/<id>` → the definition, its immutable version,
  steps, and recent test runs. `/workflow-runs/<id>` → a run's timeline and step checks. A scoped
  user deep-linking to another scope's process/run is redirected to their primary desk (not a 403).
  Data-read failures degrade honestly ("… unavailable. Refresh Google credentials or check
  Firestore setup.").
- [ ] works as intended

- {note for changes: }

---

## Appendix A — Consolidated "don't be surprised" list (intentional gaps)

All are tracked in `docs/whats-next.md`. Hitting one is not a regression.

1. No in-app **invite/create user** (roster only shows people who've signed in) — P10.2.
2. New users are **ungated** (Editor + all spaces) on first sign-in; "no access until assigned" (F-AUTH-1)
   is decided but unbuilt — P3.1.
3. Role/scope changes take effect on the **next sign-in** — P10.2/P10.3.
4. **Scoped users see very few Spaces cards** (only scope-tagged spaces) — P4.2.
5. No **public tenant maintenance form** and no UI to mint the intake link; public intake has **no
   photo** — P7.10.
6. **Photo upload** in capture is gated off until Drive is configured — P7.4.
7. **Live vendor invite** + **live vendor assignment** are not wired (Test lane only) — P7.9, P11.3.
8. Renewal **"Prepare email" buttons never create a draft** (preview-only) — P5.6.
9. The **live-notices** real-draft link is Admin-gated though Editors have permission — P5.2.
10. **Owner-notice drafts** almost always block on a missing owner email — P5.14.
11. **Approval notifications** are batch-generated (a delay); approving/denying doesn't clear the bell —
    P2.3. Bulk **Execute** always skips; **Close** has no button — P6.11.
12. **Connection Center "Set up"** is text-only and over-promises; only RentVine + Sheets self-verify —
    P9.2/P9.4.
13. There is **no slash-command router** in the Ask box — P1.5.
14. Cosmetic leftovers: the **"V1 application"** banner and hardcoded **"Dan"** labels — P3/P4/P5.

## Appendix B — How to send this back to me

- Fill in any **`- {note for changes: }`** line where a process failed, felt wrong, or should behave
  differently. Leave the rest empty.
- When you send the file back, I read every non-empty `- {note for changes: ...}` as a work item, group
  them by page, and turn each into a verified fix slice (worktree → gate → adversarial pass → ship). The
  `⚠ Known gap` items are already on the backlog; you only need to note the ones you care about
  prioritizing.
- For a hard bug (error screen, broken action), jot the exact steps next to the box and I'll reproduce
  and fix it first.
