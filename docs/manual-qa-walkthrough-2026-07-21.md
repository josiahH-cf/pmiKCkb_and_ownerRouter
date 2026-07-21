# PMI KC KB — Manual QA Walkthrough (deep, per-process verification)

**Who this is for:** you, clicking through the real app and confirming that **every process on every
page does exactly what it should.** This is the explicit, stepwise version: for each process you get
where to go, the numbered steps to perform, and an itemized list of what should happen (with the exact
on-screen text you should see), plus the error you should see when you do the wrong thing.

## How to use this

Each process is a block in this shape:

> ### P&lt;n&gt; — &lt;what the process is&gt; ✅
>
> **Where:** the route and the exact spot on the page.
>
> **Steps:**
>
> 1. do this
> 2. then this
>
> **What should happen:**
>
> 1. the first thing you should see (with exact on-screen text in quotes)
> 2. the next thing, and the concrete end-state it produces
>
> - [ ] works as intended
> - changes:

How to fill it in:

- If the process did exactly what "What should happen" says, tick **`- [ ] works as intended`** and
  leave **`- changes:`** empty.
- If anything is wrong, missing, confusing, or should behave differently, write it on the
  **`- changes:`** line, right there under the process. Leave the tick empty. Write as much as you want
  after `changes:`.
- When you send this file back to me, I read **every `- changes:` line that has text after it** as a work
  item, group them by page, and turn each into a fix. Empty `- changes:` lines are ignored.
- **`⚠ Known gap:`** notes are pre-filled by me from the code — a spot that is stubbed, capped, or
  misleading today. You do not have to "discover" these; they are already tracked in `docs/whats-next.md`.
  You can still add a `- changes:` note if you want one prioritized.

**Legend:** ✅ wired end to end · ⚠ partial or stubbed · ⛔ built but not reachable from the UI yet.

---

## 0. Before you start

- [ ] **Environment.** Use the deployed Cloud Run app for a real customer test (production serves the
      current build). A local `npm run dev` is only a preview.
- [ ] **Accounts you need:**
  1. An **Admin** account (a verified `@pmikcmetro.com` Google Workspace account with the Admin role).
     You do everything below as Admin unless a step says otherwise.
  2. Optionally, a **second staff account** so you can watch a role/scope change take effect (those
     changes only apply on the person's next sign-in).
  3. The **Summit Plumbing Test Vendor** (you provision this from Admin in §10) for the Vendor section.
- [ ] **What "pass" means:** the process produces the stated end-state, the screen makes the next action
      obvious, and nothing reads as broken or off-brand.
- **Roles at a glance:** **Editor** = read, edit, and workflow-linked send. **Approver** = Editor plus
  approve and resolve placeholders. **Admin** = everything, plus manage users and soft-delete. **Space
  scopes** (`renewals`, `maintenance`) narrow which tabs a person sees; **no scope set = all spaces**.

---

## 1. Console / Ask (`/` and `/ask` — the same screen)

Both URLs render the same Console. After sign-in you land here. The purpose line reads **"Ask about a
property, lease, or process, then hand the work to the right place."** A read-only user sees only the
Ask box and the attention deck — no process picker, no test runs (those need `edit`).

**The Ask box**

### P1.1 — Ask a source-backed question (happy path) ✅

**Where:** Console (`/`) → the **"Question"** textarea (placeholder **"For example: when does the lease
at 1234 Oak St renew?"**), on the left of the two-column panel.

**Steps:**

1. Click into the **"Question"** box.
2. Type a real question, for example `When does the lease renewal process start?`
3. Click the **"Get answer"** button.
4. Read the result panel on the right.

**What should happen:**

1. While it works, the button reads **"Working"**.
2. The right panel fills in, top to bottom, with: a **source-state banner**, an **"Answer"** heading and
   text, optionally a **"Handling Steps"** numbered list, a **"Sources"** list of clickable citations,
   and (when the answer includes one) a **"Draft"** block whose first line is the exact banner
   **"Draft — Review before sending"**.
3. A well-sourced question shows the green **"Verified Source"** banner with at least one citation link.
4. The answer is grounded in real PMI KC sources — it never makes up a generic property-management answer.

- [ ] works as intended
- changes:

### P1.2 — Get an honest "no source" answer (this is a feature) ✅

**Where:** Console → the Question box.

**Steps:**

1. Ask something with no approved source behind it, for example `give me a generic answer about pricing`.
2. Click **"Get answer"**.

**What should happen:**

1. The banner reads **"No Reliable Source Found"** (not a confident answer).
2. The answer text is exactly **"No approved PMI KC source is configured for this question in the
   scaffold yet."**
3. A **"Capture Task"** block appears under the answer so you can log the gap (see P1.7).
4. The app never invents an answer to fill the gap.

- [ ] works as intended
- changes:

⚠ Known gap: the "…in the scaffold yet" wording is honest but reflects that the Ask engine is still
scaffold/demo-backed for many questions.

### P1.3 — Empty or too-short question is blocked (error probe) ✅

**Where:** Console → the Question box.

**Steps:**

1. Leave the Question box empty and click **"Get answer"**.
2. Now type one or two characters and click **"Get answer"** again.

**What should happen:**

1. The browser blocks the submit (the field is required and needs at least 3 characters) — no request is
   sent, and you get the browser's own "please fill in this field" prompt.
2. If a too-short question ever reaches the server, the muted status line shows **"Invalid Ask request."**

- [ ] works as intended
- changes:

### P1.4 — Too many questions is rate-limited (error probe) ✅

**Where:** Console → the Question box.

**Steps:**

1. Submit questions rapidly, more than ~15 in a quick burst.

**What should happen:**

1. Once the limit is hit, the status line shows **"Too many questions right now. Please wait a moment and
   try again."**
2. After a short wait, asking works again.

- [ ] works as intended
- changes:

### P1.5 — Slash input is treated as a plain question (expectation-setter)

**Where:** Console → the Question box.

**Steps:**

1. Type `/help` (or `/ask something`) and click **"Get answer"**.

**What should happen:**

1. The text is sent to the answer engine **as a literal question** — there is no `/` command handling
   anywhere in this flow.
2. So `/`-prefixed input just asks that string as a question; it is not a command.

- [ ] works as intended
- changes:

⚠ Known gap: if you expected slash-commands (e.g. `/renewal`) or a command palette, they do not exist
yet. Add a `- changes:` note if you want one.

**Voice dictation**

### P1.6 — Dictate a question by voice ✅

**Where:** Console → the **"Dictate"** button next to the "Question" label.

**Steps:**

1. Click **"Dictate"** and allow the microphone when the browser asks.
2. Speak your question.
3. Click **"Stop recording"**.
4. Read the transcript that appears in the Question box.

**What should happen:**

1. The button cycles through **"Dictate" → "Stop recording" → "Stopping…" → "Processing…"**.
2. The transcript is **appended** to whatever is already in the box, with the note **"Transcript appended
   to your question. Review it before submitting."**
3. If nothing was said: **"No speech was detected. Your typed question was preserved; try again or keep
   typing."**

- [ ] works as intended
- changes:

⚠ Known gap: on Safari/iPhone you get **"This browser (Safari/iPhone) records audio in a format we can't
transcribe yet. Use Chrome on this device, or type instead."** Test dictation on Chrome.

**Process detection + test runs (edit-capable users only)**

### P1.7 — Capture a task from an unsourced answer ✅

**Where:** Console → after an answer with a "Partial Source", "Open Placeholder", or "No Reliable Source
Found" banner, the **"Capture Task"** block below the answer.

**Steps:**

1. Ask a question that returns one of those three banners (e.g. the P1.2 question).
2. In the **"Capture Task"** block, pick a **"Space"** from the dropdown.
3. Click **"Create Capture Task"**.

**What should happen:**

1. The button reads **"Creating"** briefly, then you see **"Capture task created."**
2. A real Firestore placeholder (an Open task) is created in the space you chose.
3. Note: "Verified Source" and "Conflict Found" answers do **not** offer a Capture Task — that is by
   design.

- [ ] works as intended
- changes:

### P1.8 — Auto-detect the process for free (deterministic) ✅

**Where:** Console → with the Process picker visible (edit users), leave it on **"Just ask (no process)"**.

**Steps:**

1. Type at least 6 characters that mention a workflow, for example `broken hvac needs repair`.
2. Watch the area just under the Question box.

**What should happen:**

1. A hint appears: **"Looks like &lt;process name&gt;."** with a **"Use &lt;process name&gt;"** button.
2. Clicking **"Use &lt;process name&gt;"** selects that process with **no** network call.
3. The submit button changes to **"Get answer + start a test run"**.

- [ ] works as intended
- changes:

⚠ Known gap: the free matcher only knows synonyms for the process ids `lease-renewal` and
`maintenance-work-order-intake`. If the real definition id differs, only the process's literal name words
are matched.

### P1.9 — Detect the process with AI (model call) ✅

**Where:** Console → when no free hint appears, the **"Detect process with AI"** button under the Question
box.

**Steps:**

1. Type a question the free matcher does not recognize.
2. Click **"Detect process with AI"** (it reads **"Detecting…"** while it runs).

**What should happen:**

1. Either a process is auto-selected for you, or you see **"No matching process found for this
   question."**, or (if you hammer it) **"Too many classification requests. Please wait a moment and try
   again."**
2. It never invents a process that is not in the list.

- [ ] works as intended
- changes:

### P1.10 — Start a test run from the Console ✅

**Where:** Console → after picking a process, the submit button and result panel.

**Steps:**

1. Pick a process (via P1.8, P1.9, or the manual picker). The submit button now reads **"Get answer +
   start a test run"** and a note appears: **"Starting this process runs a test only. Nothing is sent, and
   nothing is written to a system of record."**
2. Click **"Get answer + start a test run"**.

**What should happen:**

1. You get the normal answer on the right, and below it a **"Test run started"** block.
2. That block shows **`&lt;process name&gt;: &lt;status&gt;`**, an optional **"Next: &lt;action&gt;"** line, and a
   **"View the test run"** link that opens `/workflow-runs/&lt;id&gt;`.
3. Nothing is sent and no system-of-record write happens — it is a test.

- [ ] works as intended
- changes:

**The attention deck (below the Ask box)**

### P1.11 — The three attention cards deep-link correctly ✅

**Where:** Console → the **"What needs your attention"** group of three cards.

**Steps:**

1. Read the three cards: **"Needs your decision"**, **"Connections to set up"**, **"Space coverage"**.
2. Click the link at the bottom of each card.

**What should happen:**

1. Each card shows a count, up to 3 preview rows, and then a **"See all N"** or **"Open"** link.
2. **"Needs your decision"** → `/approval-queue` (empty state: **"Nothing needs your decision right
   now."**).
3. **"Connections to set up"** → `/connections` (empty: **"Every connector is set up."**).
4. **"Space coverage"** → `/spaces` (empty: **"Every space has its process and connections."**).

- [ ] works as intended
- changes:

### P1.12 — Approve an item inline from the deck (Approver/Admin) ✅

**Where:** Console → a "Needs your decision" row that shows an **"Approve"** button (only on eligible
low/medium items).

**Steps:**

1. Find a "Needs your decision" row with an **"Approve"** button.
2. Click **"Approve"**.

**What should happen:**

1. The button reads **"Approving…"**, then is replaced by muted **"Approved."**
2. The queue item flips to **Approved** — this records an app decision only; no external send and no
   system-of-record write.
3. If you try this on a **High-risk** item it is refused with **"High-risk approval requires explicit
   confirmation."** — handle High-risk items on the full Approval Queue instead.

- [ ] works as intended
- changes:

⚠ Known gap (Console): the **"Anticipated work"** zone is populated only in a test workspace; a plain
production Admin sees it empty by design.

---

## 2. Notifications

**The bell (top-right of every internal page)**

### P2.1 — The unread count and tab title ✅

**Where:** Top nav → the bell icon.

**Steps:**

1. With unread notifications present, look at the bell badge.
2. Look at the browser tab title.

**What should happen:**

1. The bell shows a numeric badge (it caps visually at **"9+"**), and its accessible label reads
   **"Notifications, N unread"** with the true number.
2. The browser tab title is prefixed **"(N) "** while there are unread items.
3. The count refreshes on its own every 60 seconds and whenever you refocus the tab.

- [ ] works as intended
- changes:

⚠ Known gap: the badge caps at "9+" while the label and tab title show the true number (minor mismatch),
and the PMI favicon red-dot is deferred until you supply the artwork.

### P2.2 — Open a notification (marks it read) ✅

**Where:** Bell → the popover list.

**Steps:**

1. Click the bell to open the popover.
2. Click any unread notification in the list.

**What should happen:**

1. It navigates you to the linked item (approval rows go to `/approval-queue?item_id=…`).
2. That notification is marked read, so on the next refresh the badge decrements and the tab-title count
   updates.

- [ ] works as intended
- changes:

### P2.3 — Mark all read ✅

**Where:** Bell popover → the **"Mark all read"** button (shown only when there are unread items).

**Steps:**

1. Open the bell popover.
2. Click **"Mark all read"**.

**What should happen:**

1. Every unread **event** notification flips to read; the badge and tab-title count clear.
2. Standing **set-up** signals (Connections, Space coverage, Team review) intentionally remain — those
   clear only when you actually fix the underlying state.

- [ ] works as intended
- changes:

⚠ Known gap: approval-queue notifications are produced by a batch job, not the instant an item becomes
ready — expect a delay, and note that approving or denying an item does not itself clear its bell
notification (open it, or Mark-all-read).

### P2.4 — Mute a notification family ✅

**Where:** Bell popover → the **"Notification types"** disclosure.

**Steps:**

1. Open the bell popover and expand **"Notification types"**.
2. Untick a family, e.g. **"Maintenance tickets"**.

**What should happen:**

1. That family stops appearing in your notifications.
2. The preference is saved to your own account and persists across sessions.

- [ ] works as intended
- changes:

### P2.5 — The full notification hub (`/notifications`) ✅

**Where:** Bell popover → **"See all notifications"** → `/notifications`.

**Steps:**

1. Click **"See all notifications"**.
2. Read the page top to bottom.

**What should happen:**

1. Intro: **"Everything that needs your attention, newest first…"**
2. Sections in order: **Team review** (Admin only), **"Needs your decision"**, **"Recent activity"** (the
   event log, newest first), a **"Test attention and owning-record handoffs"** panel, and a **"Set-up"**
   section (Connections + Coverage).
3. This page is read-only — there is no "mark read" control here.

- [ ] works as intended
- changes:

---

## 3. Sign-in, navigation, and the safety nets around every page

**Signing in**

### P3.1 — Sign in with a pmikcmetro.com Google account (happy path) ✅

**Where:** `/sign-in`, heading **"Sign in to continue."** → the **"Sign in with Google"** button.

**Steps:**

1. Open the app while signed out (you should be sent to `/sign-in`).
2. Click **"Sign in with Google"**.
3. In the Google popup, choose a verified `@pmikcmetro.com` account.

**What should happen:**

1. The button cycles **"Checking session…" → "Opening Google…" → "Signing in…"**.
2. You are redirected to the Console (`/`).
3. A brand-new person defaults to the **Editor** role with all-spaces access, and gets an 8-hour session.

- [ ] works as intended
- changes:

### P3.2 — A non-pmikcmetro account is refused (error probe) ✅

**Where:** `/sign-in` → **"Sign in with Google"**.

**Steps:**

1. Click **"Sign in with Google"**.
2. In the popup, pick a personal account (e.g. an `@gmail.com` address).

**What should happen:**

1. The sign-in is rejected on the server and you see **"This Google account is not authorized for PMI KC
   KB."**
2. Because the hard block is server-side, you may briefly see "Signing in…" before the refusal — that is
   expected.

- [ ] works as intended
- changes:

### P3.3 — Demo mode is dev-only (expectation-setter)

**Where:** `/sign-in`.

**Steps:**

1. Look for a **"Continue in local demo mode"** button under the Google button.

**What should happen:**

1. On the deployed app you should **not** see it — demo mode is force-disabled in production.
2. It appears only in non-production when explicitly enabled; if present it signs you in as a demo Admin
   (`local-demo@pmikcmetro.com`, all spaces).

- [ ] works as intended
- changes:

**Navigation and access**

### P3.4 — The top nav shows the right tabs for the role and scope ✅

**Where:** The top navigation bar, on any page.

**Steps:**

1. As an Admin, read the top nav.
2. Sign in as a **renewals-only** user and read the nav again.
3. Sign in as a **maintenance-only** user and read the nav.

**What should happen:**

1. The Admin sees all tabs: **Console · Spaces · Lease Renewal · Maintenance · Approval Queue ·
   Communications · Connections · Admin**.
2. The renewals-only user sees Console, Spaces, Lease Renewal, Approval Queue, Communications, Connections
   — but **not** Maintenance and **not** Admin.
3. The maintenance-only user sees Maintenance but **not** Lease Renewal or Approval Queue.
4. Only Admins ever see the **Admin** tab.

- [ ] works as intended
- changes:

**Security: session timeout**

### P3.5 — Idle warning at 28 minutes, auto sign-out at 30 ✅

**Where:** Any signed-in page.

**Steps:**

1. Sign in and then leave the app completely idle — no mouse, keyboard, or scrolling.
2. Wait ~28 minutes.
3. When the dialog appears, either click **"Stay signed in"** or keep waiting to 30 minutes.

**What should happen:**

1. At ~28 minutes a focus-trapped dialog appears: **"Are you still active?"** with a live countdown
   **"Signing out in m:ss."**
2. Moving the mouse during the countdown does **not** dismiss it (deliberate) — only **"Stay signed in"**
   resets the clock.
3. If you ignore it, at 30 minutes total you are signed out and sent to `/sign-in`.

- [ ] works as intended
- changes:

### P3.6 — Sign out ✅

**Where:** Top-right → **"Sign out"**.

**Steps:**

1. Click **"Sign out"**.

**What should happen:**

1. The button reads **"Signing out…"** briefly.
2. Both the browser session and the server cookie are cleared, and you are sent to `/sign-in`.

- [ ] works as intended
- changes:

**Reporting problems (and the error safety nets)**

### P3.7 — File a support report from any page ✅

**Where:** The **"Report an issue"** button, bottom-right of every internal page.

**Steps:**

1. On any page, click **"Report an issue"**.
2. Optionally type into the **"What went wrong?"** box (you can also leave it blank).
3. Click **"Send report"**.
4. Then, as Admin, go to `/admin` and open the **"Reported Issues"** panel.

**What should happen:**

1. You see **"Thanks. Your report was filed to the support queue for review."**
2. A real record is written (it captures the page path, viewport, and the identity of the last element you
   touched — never the page text or the query string).
3. The report appears in **Admin → "Reported Issues"**.
4. If the write fails you get the honest **"We received your report but could not file it to the support
   queue yet. Please try again in a moment."** — never a fake success.

- [ ] works as intended
- changes:

⚠ Known gap: reports go to the in-app queue, not email (email delivery is a separate, unbuilt send path).
The 30-per-minute rate limit is per-server-instance, not global.

### P3.8 — The error boundary offers a report path (error probe) ✅

**Where:** Any page that hits an unexpected error.

**Steps:**

1. If you can trigger an error, observe the error screen.
2. Click **"Report this problem"**.

**What should happen:**

1. You see **"Something went wrong on this page"** with **"Try again"** and **"Report this problem"**
   (which becomes **"Report filed"**).
2. Even a full crash shows **"The app hit an error"** with the same working report path.

- [ ] works as intended
- changes:

⚠ Known gap (chrome): a hardcoded **"V1 application · Live and Test records are labeled by data mode ·
provider status and signoffs are advisory"** banner shows on every signed-in page regardless of
environment — cosmetic, on the cleanup list.

---

## 4. Spaces (the workspace directory)

**The card grid**

### P4.1 — Open Spaces and read the cards ✅

**Where:** Top nav → **Spaces** (`/spaces`). Page heading: **"Spaces"**.

**Steps:**

1. Sign in as an Admin (or any all-spaces user).
2. In the top navigation bar, click **Spaces**.
3. Look at the grid of cards.

**What should happen:**

1. The URL is `/spaces` and the heading reads **"Spaces"**.
2. You see a grid of up to **12** cards, in this order: Lease Renewals · Owner Renewal Outreach · Tenant
   Renewal Notice · Maintenance Work Order Intake · Vendor Assignment Handoff · Daily Inbox Triage ·
   Fathom Training · Escalation Rules · Move-In · Move-Out + Deposit Disposition · Owner Onboarding ·
   Workflow Communications.
3. Each card is one clickable tile (the whole card is a link) — there are no separate buttons inside a
   card.
4. Each card shows the space name, a category line under it, and a colored state pill (see P4.3).

- [ ] works as intended
- changes:

### P4.2 — Scope filtering (expectation-setter) ⚠

**Where:** `/spaces` as a scoped (non-all-spaces) user.

**Steps:**

1. Sign in as a **renewals-only** user.
2. Open **Spaces**.

**What should happen:**

1. You see **only one card** — Lease Renewals.
2. This is because only two spaces carry a scope tag today (`lease-renewals` = renewals,
   `maintenance-work-order-intake` = maintenance), so a scoped user does not see the un-scoped renewal,
   move-in, or onboarding cards.

- [ ] works as intended
- changes:

⚠ Known gap: scoped users under-see the launch-planning and move-in/move-out spaces (those have no scope
tag). Worth deciding whether they should surface for scoped users.

### P4.3 — Card status pills reflect real state ✅

**Where:** `/spaces` → each card's colored pill.

**Steps:**

1. Read the pill on each card.

**What should happen:**

1. Each pill is one of: **"Connections needed"** (amber), **"Needs a process"** (red), **"Process ready"**
   (green), **"Planned"** (neutral), **"Status unavailable"** (neutral — shown when the definitions read
   failed), or **"Reference (read-only)"** (purple).
2. The Lease Renewals card also shows a **"N waiting on you"** pill when its renewal queue has items.
3. The color and the label always agree (so the state is clear even without color).

- [ ] works as intended
- changes:

**Opening a space**

### P4.4 — Navigate from a space card ✅

**Where:** `/spaces` → click a card.

**Steps:**

1. Click the **Lease Renewals** card.
2. Go back, click the **Maintenance Work Order Intake** card.
3. Go back, click the **Workflow Communications** card.
4. Go back, click a reference card such as **Escalation Rules**.

**What should happen:**

1. Lease Renewals → the Renewal Desk at `/lease-renewal`.
2. Maintenance Work Order Intake → the Maintenance desk at `/maintenance`.
3. Workflow Communications → Communications at `/gmail-hub`.
4. A reference card → a Space detail page at `/spaces/&lt;id&gt;` with an **Overview / Process** sub-tab (the
   Process tab appears only when the space carries a process definition).
5. An unknown `/spaces/foo` shows a 404; a scoped user deep-linking to another scope's space is redirected
   to their own primary desk (not a 403 page).

- [ ] works as intended
- changes:

### P4.5 — Per-space draft cards (draft-only) ✅

**Where:** `/spaces/&lt;id&gt;` → Overview tab → the domain card.

**Steps:**

1. Open the **Move-In** space and read the welcome-draft card.
2. Open **Move-Out + Deposit Disposition** and read the evidence-packet card.
3. Open a renewal space and read the notice-rule + sample draft cards.

**What should happen:**

1. Move-In → a **"Welcome draft (email + Portal Chat)"** where every unknown fact shows as **"Needs
   Verification: …"** and fees appear as the literal pointer **"see RentVine"** (never a computed number).
2. Move-Out → a **"Deposit deduction: evidence packet"** labeled **"Suggested deduction — SUGGESTION ONLY,
   owner approval required"** ($0.00 when empty; any line ≥ $500 flagged **"Needs owner sign-off"**); it
   never posts to any ledger or QuickBooks.
3. Renewal spaces → notice-timing rules (all "Needs Verification" until confirmed) and sample email drafts,
   each carrying the **"Draft — Review before sending"** banner.

- [ ] works as intended
- changes:

⚠ Known gap: these drafts are synthetic (seeded from one sample lease), and "Dan" is hardcoded as the
owner/approver name in several renewal and move-out strings — cosmetic, on the cleanup list.

---

## 5. Lease Renewal — front to back (the focal feature)

**Read this first.** The desk and the per-lease workspace run on **sample data** and never touch Gmail.
The reconciliation runs and the live review write **Firestore governance records only** (resolutions and
approvals) — never the tracking sheet, never a send. The **only** surface that produces something
external is `/lease-renewal/live/notices`, which creates a **real unsent Gmail draft**. Keep that map in
mind as you test.

**The Renewal Desk (`/lease-renewal`)**

### P5.1 — Read the desk ✅

**Where:** Top nav → **Lease Renewal** (`/lease-renewal`).

**Steps:**

1. Open the Renewal Desk.
2. Read the header, the metric row, the "Needs your attention" fold, and the "Your queue" list.

**What should happen:**

1. Header **"Renewals"**, subtitle **"7 leases in your current renewal window"**, and a **"Sample data"**
   chip.
2. Metric row reads **Actionable 3 · Needs review 1 · Skipped 2 · Out of window 1**.
3. A **"Needs your attention"** fold shows two cards: **Walnut** ("1 source conflict to resolve before you
   can continue" → **"Resolve conflicts"**) and **Maple** ("Get the owner's rent decision" → **"Get the
   owner decision"**).
4. A **"Your queue"** list of three actionable lease cards (Maple, Walnut, Cedar).

- [ ] works as intended
- changes:

### P5.2 — The "what's next" signal on each lease ✅

**Where:** `/lease-renewal` → the "Your queue" cards.

**Steps:**

1. Read each queue card's stepper and its "Next:" line.

**What should happen:**

1. Each card has a 4-step **Stepper** (Data check → Owner decision → Tenant offer → Build docs), a
   **"Next: …"** line, and an **"Open"** button.
2. Walnut → **"Next: Confirm the rent before drafting"** with a red **"1 source conflict"** pill; Maple →
   **"Next: Get the owner's rent decision"**; Cedar → **"Next: Review the tenant offer drafts"**.
3. This "Next:" line is the app's guidance for what to do next.

- [ ] works as intended
- changes:

⚠ Known gap: the **"Live renewal notices (compose drafts)"** button (the real draft flow) and the **"View
live review →"** link are shown to **Admins only**, even though the notices page itself only needs `edit`.
An Editor has permission but no visible link — they must know the URL.

### P5.3 — The set-aside groups ✅

**Where:** `/lease-renewal` → the collapsible groups below the queue.

**Steps:**

1. Expand **"Needs review (1)"**, then **"Skipped (2)"**, then **"Out of window (1)"**.

**What should happen:**

1. Needs review → "77 Birch Ln, Unit 1" tagged **"Off-cycle end date"**.
2. Skipped → "540 Oak Dr" (**"Month-to-month"**) and "915 Pine St" (**"Program lease"**).
3. Out of window → "12 Elm Ct" (**"Outside this window"**).
4. Each classification is deterministic and its reason is shown.

- [ ] works as intended
- changes:

**Work a lease (sample, read-only)**

### P5.4 — Walk the four steps on the Cedar lease ✅

**Where:** `/lease-renewal` → "Your queue" → **"Open"** on **"318 Cedar Ave, Unit 7"**.

**Steps:**

1. Click **"Open"** on the Cedar lease card.
2. Read each of the 4 stepper panels in turn: Data check, Owner decision, Tenant offer, Build docs.

**What should happen:**

1. **Data check** — both rows show an **"Agrees"** pill (RentVine $1,180 / 2026-09-30, both Verified).
2. **Owner decision** — facts populated (comp range, suggested number), a draft with the **"Draft — Review
   before sending"** banner, and a **"Preview the owner email"** disclosure.
3. **Tenant offer** — three tabs (Email / Portal chat / Text), because the owner decision is recorded in
   this seed.
4. **Build docs** — a readiness checklist of 7 items, each marked OK / Flag / Needs input.
5. Note: only the 3 actionable leases have a workspace; opening a skipped lease's URL shows **"This
   renewal is unavailable."**

- [ ] works as intended
- changes:

### P5.5 — See a data-check conflict ✅

**Where:** `/lease-renewal/lease/lease-1207-walnut-2` (the Walnut lease).

**Steps:**

1. Open the Walnut lease (via its "Resolve conflicts" card or the URL).
2. Read the Data check step.

**What should happen:**

1. A conflict row shows a **"Needs your decision"** pill: RentVine **$1,250 (Verified)** versus Sheet
   **$1,289 (Needs Verification)**.
2. The stepper sits at Data check with **"Next: Confirm the rent before drafting."**
3. The actual resolve controls live on the reconciliation run (see §5c), not this sample workspace.

- [ ] works as intended
- changes:

### P5.6 — "Prepare owner/tenant email" is preview-only (expectation-setter) ⚠

**Where:** A lease workspace → the **"Prepare owner email"** / **"Prepare tenant email"** button.

**Steps:**

1. Click **"Prepare owner email"** (or **"Prepare tenant email"**).

**What should happen:**

1. You see an on-screen preview and the reason **"Sample renewal data is preview-only. Do not send;
   connect a real authorized renewal run and verified owner recipient first."**
2. The recipient shows as **"Needs Verification: owner/tenant email"**, there is **no** Copy button, and
   **no** Gmail draft is created.
3. This is the deliberate "looks actionable but no-ops externally" control — real drafts are made on the
   live notices desk (§5e).

- [ ] works as intended
- changes:

⚠ Known gap: the "Renewal-notice draft" card in this workspace is an inert empty-state that tells you to
use the live desk but gives no link to it — you must navigate back and (if Admin) use the desk button.

**The reconciliation run (`/lease-renewal/runs/<id>`)**

### P5.7 — Open the sample reconciliation run ✅

**Where:** `/lease-renewal` → diagnostics → "View the raw reconciliation run", or `/lease-renewal/runs` →
**"Sample renewal run (synthetic)"**.

**Steps:**

1. Open the sample reconciliation run.
2. Read the flag cards.

**What should happen:**

1. A **Test-only** banner, then flag cards: a **High** rent conflict (Casey Rivers: Sheet $1,300 vs
   RentVine $1,400), a **High** renewal-date conflict, a **High** lawn-care legal conflict, a **Medium**
   inspections-cadence conflict, and a **Blocked** "no precedence rule" item (Jordan Maple).
2. Fields where the sources agree produce no flag.

- [ ] works as intended
- changes:

### P5.8 — Resolve a High conflict (Admin) ✅

**Where:** A **High** flag card → the resolve form.

**Steps:**

1. As **Admin**, on a High flag set **Resolution = "Pick a source"** and choose RentVine.
2. Type a **Reason** (required).
3. Click the resolve button, then **"Confirm resolution"** in the dialog.

**What should happen:**

1. A confirmation dialog **"Confirm High resolution"** appears, noting it records the decision but **does
   not execute a write-back**.
2. A Firestore resolution and an append-only Activity row are written; the card now reads **"Resolved via
   Pick a source → Rentvine: &lt;your reason&gt;"**.
3. Error probes: an empty reason → **"A plain-English reason is required."**; a non-Admin sees **"An Admin
   must resolve High and Blocked flags."**

- [ ] works as intended
- changes:

### P5.9 — Approve a write-back proposal (Admin) ✅

**Where:** A flag that has a write-back proposal → **"Approve proposal"** (Admin only).

**Steps:**

1. Click **"Approve proposal"**.
2. Type a reason and confirm.

**What should happen:**

1. The proposal state becomes **"Approved: ready to write (not executed)"** and an Activity row is written.
2. The caveat holds: **"Approving records your authorization for the future append-only Sheet write. It is
   not executed here."**
3. No sheet cell is ever written from this screen.

- [ ] works as intended
- changes:

⚠ Known gap: the renewal tracking sheet stays read-only by owner decision — write-back is authorization
only, never an actual sheet mutation.

**Live review (Admin, real RentVine + Sheet)**

### P5.10 — Degraded states when sources aren't connected ✅

**Where:** `/lease-renewal/live` (Admin) — via the desk's "View live review →".

**Steps:**

1. Open the live review without RentVine/Sheets connected.

**What should happen:**

1. You get one of the honest panels: **"Live sources aren't connected"** (with "Open Connection Center"),
   **"Wrong RentVine account"**, **"Live read couldn't authenticate"**, or **"Live read didn't complete"**.
2. It never silently falls back to sample data.

- [ ] works as intended
- changes:

### P5.11 — Live flag resolution (when connected) ✅

**Where:** `/lease-renewal/live` with RentVine + Sheet connected.

**Steps:**

1. Open the live review; resolve a live flag using the same form as §5c.

**What should happen:**

1. Header **"Live renewal review"** with a **"Live data"** chip and "N item(s) need a human decision".
2. Resolving writes a Firestore resolution/approval + Activity.
3. The copy is explicit: **"Nothing here is sent and no record is changed. Review each item, then make the
   fix at the source."** — the actual source fix is manual.

- [ ] works as intended
- changes:

**The real draft flow (`/lease-renewal/live/notices`) — produces a Gmail draft**

### P5.12 — Compose and create a real tenant renewal draft ✅ (the money path)

**Where:** `/lease-renewal/live/notices` (Admin link on the desk, or the URL as an Editor). **Requires
RentVine connected.**

**Steps:**

1. Open the live notices desk and expand a lease whose summary says "tenant ready".
2. Set the channel to **"Tenant offer"**.
3. Set **Owner decision = "Increase rent"** and **Offered rent (monthly) = 1325**.
4. Click **"Preview draft"** and review the To / Subject / body.
5. Click **"Create Gmail draft"**.
6. Open your **Gmail → Drafts** folder.

**What should happen:**

1. Preview shows **"Preview only. Review it, then choose 'Create Gmail draft'."** with the To / Subject /
   body.
2. Create produces a **real unsent Gmail draft in your Drafts folder**: To = the RentVine-sourced tenant
   email, **Cc = the co-tenants**, body prefixed **"Draft — Review before sending"**.
3. On screen: **"Unsent Gmail draft created (id …). Open Gmail to review and send it to &lt;recipient&gt;
   yourself."**
4. In Gmail, the draft is there and unsent — **you** press Send; the app never sends.

- [ ] works as intended
- changes:

### P5.13 — A draft with no verifiable recipient is blocked (error probe) ✅

**Where:** `/lease-renewal/live/notices` → a lease with no verifiable tenant email.

**Steps:**

1. Fill the offer fields for such a lease and click **"Preview draft"**.

**What should happen:**

1. It is blocked under **"This draft is not ready:"** with **"Recipient tenant email needs
   verification."**
2. **"Create Gmail draft"** stays disabled and no draft is created.
3. Other block reasons you might see: "Lease end date was not found in the live RentVine lease.", "Offered
   rent must be greater than zero." Non-authoritative or non-routable addresses (e.g. `.invalid`) are
   refused even at create time.

- [ ] works as intended
- changes:

### P5.14 — Owner-channel drafts (expectation-setter) ⚠

**Where:** `/lease-renewal/live/notices` → set the channel to **"Owner notice"**.

**Steps:**

1. Fill the owner fields (market number, comp range low/high, comps reference).
2. Click **"Preview draft"**.

**What should happen:**

1. Today this almost always blocks with **"Recipient owner email needs verification."**

- [ ] works as intended
- changes:

⚠ Known gap: the owner contact is dropped when the live lease view is flattened, so owner-notice drafts
generally cannot resolve a recipient until the owner-join lands. Expect owner drafts to fail on live data.

**Property decision history (Admin)**

### P5.15 — Review a property's decision history ✅

**Where:** A lease workspace → **"View property decision history"** (Admin) → `/lease-renewal/property/<key>`.

**Steps:**

1. As Admin, click **"View property decision history"** from a lease workspace.

**What should happen:**

1. **"Property decision history"** lists the resolution decisions and write-back approvals for that
   property (each `{action} by {actor} at {time}` plus its reason).
2. A "Current decision and authorization state" panel summarizes the property.
3. It is read-only.

- [ ] works as intended
- changes:

> **One concrete front-to-back run (do this once, in order):**
>
> 1. `/lease-renewal` → read the metrics and the "Next:" signal.
> 2. **Open** the Cedar lease → walk the 4 steps (note the drafts here are preview-only).
> 3. Back to the desk → open the reconciliation run → resolve the High rent conflict (Admin, reason,
>    confirm) → approve its write-back proposal (authorization only).
> 4. The real finish: `/lease-renewal/live/notices` (needs RentVine) → compose a Tenant offer → **Preview**
>    → **Create Gmail draft** → open **Gmail Drafts** and confirm the unsent draft is there → **you** press
>    Send.
>
> The app signals "what's next" through the Stepper position, the "Next:" line on the desk, and the "open
> Gmail and send it yourself" end-state.
>
> - [ ] the end-to-end path is discoverable and obvious
> - changes:

---

## 6. Approval Queue (`/approval-queue`)

The page loads at `read`; each action checks its own permission at the moment you use it. **Terminal**
statuses are Approved, Completed, Cancelled, Disabled, Denied, Closed — any action on a terminal item
returns **"This queue item is already closed."**

### P6.1 — The landing inbox and "Other views" ✅

**Where:** Top nav → **Approval Queue** (`/approval-queue`).

**Steps:**

1. Open the Approval Queue.
2. Read the landing inbox.
3. Expand the **"Other views"** disclosure.

**What should happen:**

1. The landing is the value-free **"Needs your decision"** inbox: **"N thing(s) need your decision, most
   urgent first."** (empty: **"Nothing needs your decision right now."**).
2. Under **"Other views"** are three tabs: **All items / Renewal reviews (N) / Write-back proposals (N)**.
3. Only **"All items"** renders the full list, detail panel, filters, and bulk bar.

- [ ] works as intended
- changes:

### P6.2 — Approve a plain low/medium item ✅

**Where:** All items → select a row → the detail panel's **"Approve"** button.

**Steps:**

1. Open **"All items"** and select a non-high-risk item with no linked execution.
2. Click **"Approve"**.

**What should happen:**

1. One click, no reason required.
2. The status flips to **Approved**, an Activity row **"Approved"** is written, and the item collapses out
   of the active list.
3. No external send and no system-of-record write ("Approval changes this app decision only.").

- [ ] works as intended
- changes:

### P6.3 — Approve a High-risk item (confirm + reason probe) ✅

**Where:** All items → a **High** risk item → **"Approve"**.

**Steps:**

1. Select a High-risk item and click **"Approve"**.
2. Try to confirm without a reason, then add a reason.

**What should happen:**

1. A browser confirm appears: **"This is a High-risk approval. Approve this queue item?"**
2. A reason is required — missing → **"High-risk approval requires a reason."**
3. Approving without the confirmation is refused server-side: **"High-risk approval requires explicit
   confirmation."**

- [ ] works as intended
- changes:

### P6.4 — Approve for execution (linked item, Admin) ✅

**Where:** An item with a linked execution — its button reads **"Approve for execution"**.

**Steps:**

1. As Admin, open a linked-execution item and click **"Approve for execution"**.
2. Add a reason and confirm.

**What should happen:**

1. A reason is required; the execution ledger is set to **Approved** and an Activity row is written.
2. The panel states: **"Approval authorizes the exact execution preview. It does not make the provider
   attempt; execution remains a separate owning-workflow action."**
3. A non-Admin is blocked: **"Admin role is required for this consequential execution."**

- [ ] works as intended
- changes:

### P6.5 — Deny an item (terminal; reason required) ✅

**Where:** A review item (with no linked execution) → **"Deny"**.

**Steps:**

1. Click **"Deny"** with the reason empty.
2. Add a reason and deny.

**What should happen:**

1. Empty reason → **"Deny requires a reason."**
2. With a reason → status **Denied** (terminal, no further actions), reason logged in Activity.
3. A linked-execution item cannot be denied here: **"Use Disable Action to reject a linked execution."**

- [ ] works as intended
- changes:

### P6.6 — Return for revision (reason) ✅

**Where:** An item → **"Return"**.

**Steps:**

1. Click **"Return"**, leave the reason empty, then add one and return.

**What should happen:**

1. Empty reason → **"Return for Revision requires a reason."**
2. Success → status **Returned** (non-terminal — it goes back to the submitter), reason logged.

- [ ] works as intended
- changes:

### P6.7 — Snooze (date + reason) ✅

**Where:** An item → **"Snooze"**.

**Steps:**

1. Click **"Snooze"**.
2. Set a **"Snooze until"** date and a reason; try leaving one blank first.

**What should happen:**

1. Both are required — missing either → **"Snooze requires a date and reason."**
2. Success → status **Snoozed** with the deferral date, reason logged.

- [ ] works as intended
- changes:

### P6.8 — Assign (Admin only) ✅

**Where:** An item → **"Assign"** (only shown to Admins).

**Steps:**

1. As Admin, click **"Assign"**.
2. Set an **Assignee** and/or a **Required approver**, then **"Save Assignment"**.

**What should happen:**

1. At least one field is required → **"Assign requires an assignee or required approver."**
2. If the item was **Blocked** and both are now set, it flips to **Ready for Approval** ("Unblocked" in
   Activity); otherwise the Activity shows "Assigned".
3. A non-Admin is blocked: **"Only Admins can assign or reassign queue items."**

- [ ] works as intended
- changes:

### P6.9 — Disable Action (Admin only) ✅

**Where:** An item → **"Disable Action"** (only shown to Admins).

**Steps:**

1. As Admin, click **"Disable Action"** and give a reason.

**What should happen:**

1. Reason required → **"Disable Action requires a reason."**
2. Status → **Disabled** (terminal), any linked execution is revoked, reason logged.
3. This is how you reject a linked execution (Deny is blocked for those).

- [ ] works as intended
- changes:

### P6.10 — Role gates (error probes) ✅

**Where:** Any item.

**Steps:**

1. Try to approve an item that is assigned to you.
2. Try to approve while signed in as an Editor.

**What should happen:**

1. You cannot approve your own assigned item — tooltip **"You cannot approve your own assigned item."**
   (server: **"You cannot approve your own queue item…"**).
2. Only the required approver or an Admin can approve — **"Only the required approver or an Admin can
   approve."**

- [ ] works as intended
- changes:

### P6.11 — Bulk actions ✅

**Where:** All items → tick multiple items → the bulk bar.

**Steps:**

1. Select several items (try to select more than 50).
2. Pick a bulk action from the dropdown and click **"Apply Bulk"**.

**What should happen:**

1. Selecting past 50 → **"Bulk actions are limited to 50 visible items."**
2. After Apply → **"Bulk action finished: X updated, Y skipped, Z failed."** with a per-item result list.
3. The **Execute** option is present but every item is **skipped** with **"Bulk execute is not available
   until approved executable external-action runtime exists. No external write was attempted."**

- [ ] works as intended
- changes:

⚠ Known gap: bulk **Execute** never does anything today (no executable runtime). A **"Close"** transition
exists server-side (Admin + reason) but has **no button** — it is direct-API only.

### P6.12 — Deep link and filters ✅

**Where:** `/approval-queue?item_id=<id>`, and the filter bar in "All items".

**Steps:**

1. Open a deep link like `/approval-queue?item_id=<id>`.
2. Click a different item.
3. Use the Status / Risk / Audience filters.

**What should happen:**

1. The deep link selects that item and auto-expands "Other views".
2. Clicking a different item updates the URL and the detail panel together.
3. Filters narrow the list; empty → **"Nothing is currently waiting for review"**; a Firestore failure →
   **"Approval Queue unavailable"** with **"Use Reset to retry."**

- [ ] works as intended
- changes:

---

## 7. Maintenance (`/maintenance`)

The page loads at `read` + the maintenance scope; the capture form needs `edit`.

**Create a ticket**

### P7.1 — Build a work-order draft and create a ticket ✅

**Where:** `/maintenance` → the Capture panel (top of the page).

**Steps:**

1. Type an **Issue**, for example `kitchen faucet leaking under the sink`.
2. In the **Unit / location** typeahead, start typing and pick a unit.
3. Optionally set a **Priority** (or leave it on **"Auto (infer from description)"**).
4. Click **"Build work-order draft"**.
5. Review the draft preview, then click **"Create ticket"**.

**What should happen:**

1. A draft preview appears: summary, priority, unit, photo count, blockers, an owner-notice draft, and a
   vendor-trade suggestion.
2. On Create, a real Firestore ticket is written at status **Open** in the `maintenance_tickets`
   collection.
3. You see **"Ticket created (Open). Reload to see it in the queue below."**

- [ ] works as intended
- changes:

### P7.2 — Voice-capture the issue ✅

**Where:** Capture → the **"Record voice"** button.

**Steps:**

1. Click **"Record voice"**, allow the mic, speak, then stop.

**What should happen:**

1. The transcript is echoed as **"Transcript: …"** and folded into the issue text.
2. Errors: **"No speech detected. Try again a little closer to the mic."**, or **"Could not reach the
   transcription service. Type the note instead."**

- [ ] works as intended
- changes:

### P7.3 — Blockers stop a premature ticket (error probe) ✅

**Where:** Capture with missing fields.

**Steps:**

1. Click **"Build work-order draft"** with no issue text.
2. Then add an issue but do not match a unit.

**What should happen:**

1. **"Create ticket"** is disabled while any blocker exists.
2. Blocker messages: **"Add an issue description or voice note."**, **"Match the location to a unit."**,
   **"Confirm the matched unit (low-confidence match)."**
3. With no blockers you see **"No blockers. Ready for human review."**

- [ ] works as intended
- changes:

### P7.4 — Photo upload is gated off (expectation-setter) ⚠

**Where:** Capture → the photo area.

**Steps:**

1. Look for a file input in the Capture panel.

**What should happen:**

1. There is **no file input**. You see **"Photo storage is unavailable until the Drive action has
   owner-approved permission. Continue without a photo."**

- [ ] works as intended
- changes:

⚠ Known gap: photo upload is not wired in this build (the Drive action is gate-closed); the API refuses
before touching bytes. Owner Drive permission + a folder id would open it.

**The ticket queue**

### P7.5 — Filter and read the queue ✅

**Where:** `/maintenance` → the queue below Capture.

**Steps:**

1. Use the **Data** filter (All / Live only / Test only).
2. Tick **"Assigned to me"**.
3. Expand the **"Closed (N)"** group.

**What should happen:**

1. Open tickets list first; closed ones collapse into **"Closed (N)"**.
2. Statuses are **Open, Waiting on Response, Waiting on Vendor, Scheduled, Closed**, with pills bucketing
   to Needs Attention / Scheduled / Completed.
3. Empty state: **"No tickets yet. Build a work-order draft and create a ticket."**

- [ ] works as intended
- changes:

### P7.6 — Change status / close a ticket (reason) ✅

**Where:** A ticket card → the **Status** dropdown.

**Steps:**

1. On a ticket, change the **Status** dropdown to **Closed**.
2. Answer the reason prompt (try leaving it empty first).

**What should happen:**

1. A prompt **"Reason for closing this ticket?"** appears; an empty reason → **"A reason is required to
   close a ticket."**
2. With a reason → status **Closed** with the reason, an Activity "close" row, and a notification event.
3. Illegal transitions are refused (a closed ticket can only be reopened via the explicit Reopen action).

- [ ] works as intended
- changes:

### P7.7 — Reopen, assign, note, and history ✅

**Where:** A ticket card.

**Steps:**

1. **Reopen** a closed ticket (reason required).
2. Change the **Assignee** dropdown to a staff member.
3. Type into **"Add a note"** and click **"Add note"**.
4. Expand **History**.

**What should happen:**

1. Reopen → status **Open**, closed fields cleared.
2. Assignee is validated against the roster — an off-roster id → **"That user cannot be assigned
   maintenance tickets."**
3. Notes append to an activity trail.
4. History shows human-readable entries ("Ticket created", "Status set to …", "Closed: &lt;reason&gt;",
   "Note: …").

- [ ] works as intended
- changes:

**Vendor handoff**

### P7.8 — Test Vendor handoff (Summit Plumbing) ✅

**Where:** A **Test** ticket card → the "Test Vendor assignment" callout.

**Steps:**

1. On a Test ticket, click **"Assign Summit Plumbing Test Vendor"**.
2. Expand **"Vendor handoff"**.
3. Click **"Unassign Test Vendor"** to reverse it.

**What should happen:**

1. Assigning writes a vendor assignment record and an Activity row.
2. The handoff panel shows a bodyless projection ("Draft ready: Yes/No · Simulated replies: N") — no real
   message content.
3. Unassign reverses it cleanly.

- [ ] works as intended
- changes:

### P7.9 — Live vendor assignment (expectation-setter) ⛔

**Where:** A **Live** ticket card.

**Steps:**

1. On a Live ticket, look for a vendor-assign control.

**What should happen:**

1. There is **no UI control** to assign a live vendor.
2. If a `vendor_id` is already set the card just reads **"A Live Vendor is assigned."**
3. Live tickets instead show the Gmail linking panel (see §8's send flow) and a live-write boundary
   callout.

- [ ] works as intended
- changes:

⚠ Known gap: live vendor assignment is not wired (only the Test vendor lane is). The vendor suggestion is
heuristic trade-matching and never names a vendor ("Needs Verification: client vendor roster").

**Tenant intake**

### P7.10 — Public tenant maintenance request (expectation-setter) ⚠

**Where:** There is **no rendered public form** and **no UI to create the intake link**.

**Steps:**

1. To exercise it, mint a token (CLI `npm run intake:mint`, or the token API).
2. POST a test submission with a `summary` (required) and optional `description` / `contact` — there is
   **no photo field**.

**What should happen:**

1. The submission returns **202** with `{ status: "received", reference: <uuid> }`.
2. It lands in a **quarantine** collection, never a live ticket.
3. Error probes: reusing a single-use link → **"This intake link has already been used."**; exceeding the
   per-property daily cap (default 50; 15 for reusable signage links) → **"This property has reached its
   intake limit for today."**; an oversized body → **"Request too large."**

- [ ] works as intended
- changes:

⚠ Known gap: there is no tenant-facing form page and no UI to mint the link; public intake has no photo
field. Also set the intake IP-hash salt secret before enabling this in production (see `docs/whats-next.md`
§3.3).

### P7.11 — Triage unverified intake (promote / dismiss) ✅

**Where:** `/maintenance` → the **"Unverified intake (N)"** section.

**Steps:**

1. On a row, click **"Promote to Live app ticket"** (optionally confirm a unit first).
2. On another row, click **"Dismiss"** and give a reason.

**What should happen:**

1. Promote → a real `maintenance_tickets` **Open** ticket (labeled "Needs Verification" if the unit is
   unconfirmed) and **"Promoted to a Live app ticket (unit needs verification; no provider effect was
   created)."**
2. Dismiss → **"Dismissed."** with the reason logged.
3. An already-triaged row → **"That intake has already been reviewed."**

- [ ] works as intended
- changes:

---

## 8. Communications / Gmail Hub (`/gmail-hub`)

Heading **"Workflow Communications"** — "This is not a replacement inbox." All roles see the connection
workspace; the four governed tools are Admin-only.

### P8.1 — The Gmail connection workspace ✅

**Where:** Top nav → **Communications** (`/gmail-hub`).

**Steps:**

1. Open the Communications page.
2. Read the connection status line and the attention list.
3. Read the footer.

**What should happen:**

1. The status line shows **"Checking connection"** then either **"Connected as &lt;mailbox&gt;"** (connected)
   or **"Waiting on Gmail access"** / **"Gmail connection health could not be checked."** (not connected).
2. When connected, a **"Workflow communication attention"** list of bodyless linked-thread rows appears
   (empty: **"No linked renewal or maintenance communication needs attention."**).
3. The footer states: **"Inbox search, recent-inbox browsing, free-form compose, and arbitrary labels are
   not available here."**

- [ ] works as intended
- changes:

⚠ Known gap: the "Available / Action Required" words are internal styling attributes, not the visible pill
text — don't look for them literally on screen.

### P8.2 — Anticipatory draft composer (Admin) ✅

**Where:** `/gmail-hub` → Admin tools → **"Anticipatory draft"**.

**Steps:**

1. Pick a **Reply pattern**, set **Sender / Category / Subject / Facts to verify**.
2. Click **"Compose draft"**.
3. Click **"Copy draft"**.
4. Then try again with a hard-excluded **Category** (Owner money / Legal-notices / Tenant disputes).

**What should happen:**

1. A text draft appears in the draft box; its **first line is the exact banner "Draft — Review before
   sending"**, and any missing fact shows as **"Needs Verification: …"**.
2. **"Copy draft"** copies it (label → **"Copied"**). It **cannot send** — no mailbox is touched.
3. A hard-excluded category is refused **before** the model: **"Refused before the model: …"**.

- [ ] works as intended
- changes:

### P8.3 — Template workspace, thread summary, simulated chain (Admin) ✅

**Where:** `/gmail-hub` → Admin tools.

**Steps:**

1. In **"Template & triage workspace"**, paste facts and click **"Evaluate"**.
2. In **"Thread summary"**, paste thread text and click **"Summarize thread"**.
3. In **"Simulated email chain"**, add a reply, then refresh the page.

**What should happen:**

1. Evaluate → suggested labels (each "auto-apply eligible" or "suggest only") plus a draft preview, or
   **"No approved rule matched these facts."**
2. Summarize → a Summary / Waiting on / Suggested next action (or **"No summary was produced. Try
   re-pasting the thread."**).
3. Simulated chain → appends a browser-only reply that resets on refresh (**"no Gmail API, mailbox,
   database, or external delivery is involved"**).
4. None of these can send.

- [ ] works as intended
- changes:

### P8.4 — Send an exact-confirmed reply (live maintenance ticket) ✅ (the only in-app send)

**Where:** A **live** Maintenance ticket → the **"Linked Gmail communication"** panel.

**Steps:**

1. Open a live maintenance ticket and expand **"Linked Gmail communication"**.
2. Click **"Load linked communication"**, then **Open** the thread.
3. Click **"Request source-backed reply proposal"**.
4. Click **"Review exact linked reply"**.
5. Read every field on the confirmation card, then tick the confirmation checkbox.
6. Click **"Send exact linked reply"**.

**What should happen:**

1. The confirmation card **"Exact linked reply: not yet sent"** shows From / To / CC / BCC / Subject /
   Linked thread / Confirmation expires / **Exact reply body** — all resolved server-side from the real
   thread (never the AI text directly).
2. The required checkbox reads **"I reviewed the exact mailbox, recipient, subject, and reply body."**
3. Sending yields a **"Bodyless Gmail receipt"** (Message ID / Thread ID) and **"The exact linked reply
   was sent once."** A duplicate returns the existing receipt (no double-send).

- [ ] works as intended
- changes:

### P8.5 — An ambiguous send is not blindly retried (error probe) ✅

**Where:** The send flow, if Gmail returns an ambiguous result.

**Steps:**

1. If it occurs, observe the panel and click **"Reconcile ambiguous reply"**.

**What should happen:**

1. The Send button is replaced by **"The prior send outcome is ambiguous. Sending again is disabled until
   Gmail is checked for the unique message ID."** and a **"Reconcile ambiguous reply"** button.
2. Reconcile matches by message ID; if not found → **"No matching Gmail message was found. This reply
   remains blocked; do not retry."**

- [ ] works as intended
- changes:

### P8.6 — Confirm there is no autonomous / bulk / new-message send (safety check) ✅

**Where:** Anywhere in Communications.

**Steps:**

1. Look for a "compose new email", "send all", or bulk-send control.

**What should happen:**

1. There is none. Generic compose is refused server-side (**"New-message sending is not exposed by
   Workflow Communications; use an approved unsent workflow draft."**).
2. The Connection Center lists **"Gmail (legacy notification sender): Disabled"**.
3. Only exact single replies to an already-linked live thread can send, each with a one-time confirmation.

- [ ] works as intended
- changes:

⚠ Known gap: real drafts/sends need the Gmail DWD env plus the RentVine/Sheets data behind the ticket;
without them the connection sits at "Waiting on Gmail access". The renewal draft path (§5.12) and this
reply path are the only production-open Gmail writes; generic draft-create and message-send stay
gate-closed.

---

## 9. Connections (`/connections`)

### P9.1 — Read the connector grid ✅

**Where:** Top nav → **Connections** (`/connections`).

**Steps:**

1. Open the Connections page.
2. Read the metric row and each connector card.

**What should happen:**

1. A metric row: **Connected / Need attention / Not connected** counts.
2. One card each for RentVine, Google Sheets, Google Drive, Dotloop, LeadSimple, Gmail (legacy sender —
   "Disabled"), Gmail (workflow communications), QuickBooks.
3. Each card shows a status dot + label (**Connected / Needs attention / Ready to verify / Setup complete /
   Not connected**), a "powers" line, and a method badge (Google / OAuth / API key). Status is derived from
   which env vars are present.

- [ ] works as intended
- changes:

### P9.2 — "Set up <name>" is text-only (expectation-setter) ⚠

**Where:** A connector card (as Admin) → the **"Set up <name>"** disclosure.

**Steps:**

1. Expand **"Set up RentVine"** (or any connector).

**What should happen:**

1. You get **explanatory text only** — e.g. "How you'll connect: Add your API key. The app stores your
   credentials securely and checks the connection. No files to edit, no tests to run."
2. There is **no credential form, no OAuth button, and no wizard**. Actually connecting is a server-side
   env/Secret-Manager task.

- [ ] works as intended
- changes:

⚠ Known gap: this copy over-promises an in-app "store your credentials" flow that does not exist. A real
connect-and-save walkthrough is on the build list (`docs/whats-next.md` §2.2); an honesty-fix to the copy
is worth doing sooner.

### P9.3 — Verify a live connection (Admin; RentVine + Sheets only) ✅

**Where:** The RentVine or Google Sheets card (as Admin) → **"Verify connection"**.

**Steps:**

1. Click **"Verify connection"** on the RentVine or Google Sheets card.

**What should happen:**

1. A bounded read-only probe runs → **"&lt;name&gt; answered the live check."** (the card turns **Connected /
   "Verified and ready."**) or **"&lt;name&gt; did not pass the live check. See the card status for what to
   fix."**
2. A non-Admin calling it → **"Only an Admin can run a connection verification."**

- [ ] works as intended
- changes:

### P9.4 — Other connectors can't turn green (expectation-setter) ⚠

**Where:** The Drive / Dotloop / LeadSimple / QuickBooks cards.

**Steps:**

1. Note there is no "Verify connection" button on these cards.

**What should happen:**

1. These have no live probe, so even fully configured they cap at **"Setup complete"** with **"No bounded
   live verification check is available yet."** — they never show **Connected**.

- [ ] works as intended
- changes:

⚠ Known gap: the "Disabled" Gmail-legacy and QuickBooks cards still render "Not connected / Connect to
enable …", inviting connection of an intentionally-disabled/no-config connector — mildly confusing copy.

---

## 10. Admin (`/admin`)

Admin-only. Three sections: **People and Access**, **Activity and Logs**, **App Info and Readiness**.

### P10.1 — The Admin home ✅

**Where:** Top nav → **Admin** (`/admin`).

**Steps:**

1. Open the Admin page.
2. Skim the three sections.

**What should happen:**

1. **People and Access** — with the link **"Manage users and roles"**.
2. **Activity and Logs** — observability tiles, approval-queue depth, **"Reported Issues"**, and **"Access
   Changes"**.
3. **App Info and Readiness** — approval label, indexing, **"Open migration console"**, **"Open
   communication governance"**.

- [ ] works as intended
- changes:

**Make a teammate a maintenance user and scope them (the headline flow)**

### P10.2 — Change a teammate's role ✅

**Where:** `/admin` → **"Manage users and roles"** (`/admin/users`).

**Steps:**

1. Find the person's row in the roster.
2. Change the **Role** dropdown (Editor / Approver / Admin).
3. Type a **"Reason (required)"** (at least 3 characters).
4. Click **"Save role"** (confirm the extra dialog if you are granting/removing Admin).

**What should happen:**

1. Success message: **"&lt;email&gt; is now &lt;Role&gt;. They re-sign-in to refresh."** — the change is a Google
   custom claim and takes effect on their **next sign-in**.
2. Granting/removing Admin pops a confirm dialog first.
3. An append-only audit record is written **before** the claim (shown in "Access Changes").
4. Error probes: a reason under 3 chars → **"Add a short reason for the change."**; no role change → **"Pick
   a different role before saving."**

- [ ] works as intended
- changes:

⚠ Known gap (read this first): there is **no in-app "invite / create user"**. A teammate becomes a row
here only **after** they have signed in once with a `@pmikcmetro.com` Google account (creation lives in
Google Workspace). A brand-new hire is invisible on this page until their first sign-in.

### P10.3 — Scope a user to Maintenance ("put them in the group") ✅

**Where:** `/admin/users` → the person's row → the **"Space access"** sub-row.

**Steps:**

1. In the person's **"Space access"** sub-row, untick **"All spaces"**.
2. Tick **Maintenance**.
3. Type an **"Access reason (required)"**.
4. Click **"Save space access"**.
5. Have that teammate sign out and back in, then check their nav.

**What should happen:**

1. Success: **"&lt;email&gt; now has access to Maintenance. They re-sign-in to refresh."**
2. After they re-sign-in, their nav shows Maintenance but not Lease Renewal / Approval Queue, and they land
   on the Maintenance desk.
3. Error probe: unticking All-spaces with nothing selected → **"Choose at least one space, or choose All
   spaces."**

- [ ] works as intended
- changes:

### P10.4 — Last-Admin guard (error probe) ✅

**Where:** `/admin/users`.

**Steps:**

1. Try to demote the only remaining Admin to a lower role.

**What should happen:**

1. It is refused: **"Cannot remove the last Admin."**

- [ ] works as intended
- changes:

⚠ Known gap: the last-Admin guard is best-effort, not concurrency-safe — two simultaneous demotions could
still race to zero (recoverable only via the `firebase:set-role` break-glass script).

### P10.5 — Audit and reported-issues panels ✅

**Where:** `/admin` → **"Access Changes"** and **"Reported Issues"**.

**Steps:**

1. Read the **"Access Changes"** panel.
2. Read the **"Reported Issues"** panel.

**What should happen:**

1. Access Changes lists role/scope changes newest-first (what changed, target, actor, reason) — "Read-only
   history; nothing is emailed." Empty: **"No access changes recorded yet."**
2. Reported Issues lists everything filed via the "Report an issue" button (route, time, role, status,
   description). Empty: **"No reports yet."**

- [ ] works as intended
- changes:

**External Vendor lifecycle (Test)**

### P10.6 — Provision the Summit Plumbing Test Vendor ✅

**Where:** `/admin/users` → the **"External Vendors"** panel.

**Steps:**

1. Enter a provisioning reason.
2. Click **"Review exact Test setup"**.
3. Click **"Confirm and provision Test Vendor"**.
4. Copy the one-time setup link immediately.

**What should happen:**

1. A review card shows the exact effect; then a **one-time password-setup link is shown once**, with the
   warning **"Never paste, share, copy, save, log, or send this link…"**
2. Status message: **"Test Vendor created. Open the one-time link now, set its password, then enroll TOTP on
   first sign-in."**
3. The Vendor record is `pending_setup` and a bodyless audit entry is written.

- [ ] works as intended
- changes:

### P10.7 — Regenerate / reset / disable a Test Vendor ✅

**Where:** The External Vendors panel (each action is review-then-confirm-once).

**Steps:**

1. While pending, try **"Review new one-time setup link"** → confirm.
2. Try **"Review authentication reset"** → confirm.
3. Try **"Review Test Vendor disable"** → confirm.

**What should happen:**

1. Regenerate → a fresh one-time link, the record unchanged.
2. Reset → **rotates to a brand-new Firebase UID** (revokes sessions, clears password + TOTP), returns to
   `pending_setup` with a new link, and preserves the Test tickets.
3. Disable → **"Test Vendor disabled and Firebase sessions revoked."**
4. Note: there is **no "Enable" button** — re-enabling a disabled vendor is done via **Reset
   authentication**.

- [ ] works as intended
- changes:

### P10.8 — Migration and communication-governance consoles ✅

**Where:** `/admin/migration` and `/admin/gmail-inbox-zero`.

**Steps:**

1. Open **"Open migration console"** (`/admin/migration`).
2. Open **"Open communication governance"** (`/admin/gmail-inbox-zero`).

**What should happen:**

1. **"Migration Readiness"** — a read-only cutover-readiness mirror that makes **no cloud call** and
   honestly shows the production blockers that remain (owner-side items it cannot clear from the session).
2. **Workflow Communications Governance** — the three immutable approved artifacts plus a **synthetic**
   rule/template evaluator that "cannot make an action executable."

- [ ] works as intended
- changes:

---

## 11. External Vendor portal (`/vendor`)

⚠ Only the **Test Vendor** path is fully wired. Inviting a real (live) vendor is built but not reachable
from any UI.

### P11.1 — Vendor sign-in with password + TOTP ✅

**Where:** `/vendor/sign-in`, heading **"Vendor sign in"**.

**Steps:**

1. Open the one-time setup link and set a password.
2. At `/vendor/sign-in`, enter the **"Verified Vendor email"** + **"Password"** and click **"Continue"**.
3. First time only: add the **"Setup key"** to an authenticator app, enter the 6-digit code, click
   **"Verify"** — the app signs you out.
4. Sign in again with the email + password, then enter the authenticator code.

**What should happen:**

1. First-time enrollment ends with **"TOTP enrolled. Sign in again and complete the authenticator
   challenge."** and signs you out.
2. After the second sign-in with the code, you get a vendor session (max 1 hour) and land on `/vendor`.
3. A bad code → **"The TOTP code was rejected."** The footer states **"There is no self-registration. Use
   the one-time setup link from PMI KC first."**

- [ ] works as intended
- changes:

### P11.2 — Server enforcement (error probes) ✅

**Where:** The vendor session gate.

**Steps:**

1. Confirm (conceptually) that each gate holds: not a vendor account, unverified email, no TOTP, or a stale
   sign-in.

**What should happen:**

1. The server rejects unless the account is `vendor:true` (**"This account is not a Vendor account."**),
   email verified (**"Verify the Vendor email before continuing."**), TOTP used (**"TOTP verification is
   required."**), and the MFA sign-in is fresh within 1 hour (**"A recent Vendor MFA sign-in is
   required."**).

- [ ] works as intended
- changes:

### P11.3 — Assigned tickets only + isolation ✅

**Where:** `/vendor` and `/vendor/tickets/<id>`.

**Steps:**

1. As the vendor, confirm you see only assigned tickets.
2. Try to reach an internal page as a vendor.
3. As internal staff, try to reach `/vendor`.

**What should happen:**

1. **"Assigned maintenance tickets"** shows only tickets assigned to this vendor (empty: **"No assigned
   tickets"** / "Ask PMI KC to verify the assignment."). A guessed/unassigned ticket → 404.
2. A vendor cannot reach internal pages (sent to `/sign-in`); internal staff cannot reach `/vendor` (sent to
   `/vendor/sign-in`).
3. Test tickets show a **simulated** mailbox (draft/label/reply, never a real send: **"No email left the
   app."**).

- [ ] works as intended
- changes:

⚠ Known gap: the live vendor **invite** flow is built but wired to no route or button — you cannot invite a
real vendor from the running app today.

---

## 12. Processes & Workflow Runs (deep-link only)

These are reached by deep link (e.g. a Space's "View full process →"), not from the top nav.

### P12.1 — Process definitions and runs ✅

**Where:** `/processes`, `/processes/<id>`, `/workflow-runs/<id>` — e.g. from a Space's Process sub-tab.

**Steps:**

1. From a Space Process sub-tab, click **"View full process →"** to open `/processes/<id>`.
2. Open a test run from there (`/workflow-runs/<id>`).

**What should happen:**

1. `/processes` → the definition list.
2. `/processes/<id>` → the definition, its immutable version, steps, and recent test runs.
3. `/workflow-runs/<id>` → a run's timeline and step checks.
4. A scoped user deep-linking to another scope's process/run is redirected to their primary desk (not a 403
   page). Read failures degrade honestly ("… unavailable. Refresh Google credentials or check Firestore
   setup.").

- [ ] works as intended
- changes:

---

## Appendix A — Consolidated "don't be surprised" list (intentional gaps)

All are tracked in `docs/whats-next.md`. Hitting one is not a regression.

1. No in-app **invite/create user** (roster only shows people who have signed in) — P10.2.
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

- Fill in any **`- changes:`** line where a process failed, felt wrong, or should behave differently.
  Write as much as you want after `changes:`. Leave the tick and the `- changes:` line empty for anything
  that passed.
- When you send the file back, I read every **`- changes:` line that has text after it** as a work item,
  group them by page, and turn each into a verified fix slice (worktree → gate → adversarial pass → ship).
- The `⚠ Known gap` items are already on the backlog; you only need a `- changes:` note on the ones you
  want prioritized.
- For a hard bug (an error screen or a broken action), write the exact steps on the `- changes:` line and I
  will reproduce and fix it first.
