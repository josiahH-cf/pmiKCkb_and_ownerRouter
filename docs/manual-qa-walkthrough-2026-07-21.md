# PMI KC KB — Manual QA Walkthrough (hand-test the built app)

**Who this is for:** you, clicking through the real app to confirm each macro feature works, makes
sense, and looks right for the customer. **How to use it:** work top to bottom. Each step says _where
to click, what to enter, and what should happen_. Tick the `[ ]` box when the result matches. When it
does not, jot what you saw next to the box — that list becomes the next build queue.

This guide is **honest about what is wired vs. stubbed**. Where a feature is intentionally not built
yet, you will see a **⚠ Heads-up** so you are not chasing a bug that is really a known gap (all of
those gaps are also collected, with recommendations, in `docs/whats-next.md`).

---

## 0. Before you start

- [ ] **Pick an environment.** Deployed app (Cloud Run) is the real thing; a local `npm run dev` is a
      preview. For a true customer-experience test, use the deployed URL. Note: production currently serves
      the pre-remediation build until the redeploy in `docs/whats-next.md` §1.1 lands.
- [ ] **Accounts you need:**
  - An **Admin** staff account (a `pmikcmetro.com` Google Workspace account with the Admin role). You
    do everything below as Admin unless a step says otherwise.
  - Optionally a **second staff account** to watch role/scope changes take effect (roles are Google
    custom claims — they only change on the _next_ sign-in).
  - The **Summit Plumbing Test Vendor** (provisioned from Admin) for the Vendor-portal section.
- [ ] **What "pass" means:** the step does what it says, the screen guides you to the obvious next
      action, and nothing looks broken or off-brand. You are grading _works_ **and** _is it obvious what to
      do next_.

---

## 1. Sign in and get oriented

1. [ ] Go to the app root. Unauthenticated, you should be redirected to **`/sign-in`**.
2. [ ] Click **"Sign in with Google"**. The Google popup should only accept a `pmikcmetro.com`
       account. A non-`pmikcmetro.com` account should be refused with "This Google account is not
       authorized."
3. [ ] After sign-in you should land on the **Console** (the home page, `/`). Expect an ask box plus a
       deck of cards: **"Needs your decision"**, **"Connections to set up"**, **"Space coverage"**, and a
       read-only process strip.
4. [ ] **Top navigation** across the top: **Console · Spaces · Lease Renewal · Maintenance · Approval
       Queue · Communications · Connections · Admin**. Click each and confirm it loads and the active tab
       highlights.
   - [ ] As **Admin** you see all of them (Admin appears only for Admins).
   - **Note:** Lease Renewal, Maintenance, and Approval Queue appear only for users whose space scope
     includes them (see §4). An Admin with all-spaces sees everything.
5. [ ] Top-right: a **notification bell**, your **role** label, a **Sign out** button, and (bottom-right
       of the page) a **"Report an issue"** button. A **release banner** sits under the nav.

---

## 2. Console (the front door)

1. [ ] On `/` (or `/ask` — same screen), type a property-management question into the ask box and
       submit. Expect a source-backed answer, or an honest "not enough sources" state — **not** a generic
       made-up answer.
2. [ ] Confirm the three deck cards show live counts and each links somewhere useful ("Needs your
       decision" → Approval Queue, "Connections to set up" → Connections, "Space coverage" → Spaces).
3. [ ] **Judgment call:** does the Console make it obvious what needs your attention right now? Note
       anything unclear.

---

## 3. Spaces (workspace directory)

1. [ ] Click **Spaces**. Expect a **grid of cards** (Lease Renewals, Maintenance Work Order Intake,
       Owner/Tenant renewal, Move-In, Move-Out, Owner Onboarding, Workflow Communications, and more).
   - **Note:** Spaces is a _card grid you navigate_, not a dropdown you switch modes with. There is no
     "current space" toggle.
2. [ ] Each card shows a state pill ("has a process" / "needs a process" / "reference"). Click a card:
   - [ ] **Lease Renewals** card → lands on the **Renewal Desk** (`/lease-renewal`).
   - [ ] **Maintenance** card → lands on the **Maintenance desk** (`/maintenance`).
   - [ ] **Workflow Communications** card → lands on **Communications** (`/gmail-hub`).
   - [ ] A "reference" card (e.g. Escalation Rules) → opens a Space detail page with an
         **Overview / Process** sub-tab.
3. [ ] Confirm scope filtering: a user scoped to Maintenance only should not see renewals-only cards
       (test in §4 after you scope someone).

---

## 4. Users, roles, and space access — "make a new maintenance user and put them in a group"

This is the Admin People-and-Access flow. Route: **Admin → "Manage users and roles"** (`/admin/users`).

**⚠ Heads-up (read first):** there is **no in-app "Invite" or "Create user" button** for staff.
Accounts are created by signing in with a `pmikcmetro.com` Google account (creation lives in Google
Workspace). The user roster **only lists people who have already signed in at least once.** So the real
sequence for "make a new maintenance user" is:

1. [ ] **Have the new teammate sign in once** at `/sign-in` with their `pmikcmetro.com` Google account.
       On first sign-in they default to **Editor** with **all-spaces** access.
   - **⚠ Heads-up:** today a brand-new user can immediately reach everything (Editor + all spaces).
     The "no access until an Admin assigns scope" behavior is decided but **not built yet** (F-AUTH-1 in
     `docs/whats-next.md` §2.1). Do not expect a "waiting for access" screen.
2. [ ] Back as **Admin**, open **`/admin/users`**. Find the teammate's row (shows email + last
       sign-in).
3. [ ] **Set their role:** change the **Role** dropdown (Editor / Approver / Admin), type a **Reason
       (required, 3+ chars)**, click **"Save role"**.
   - [ ] Granting/removing **Admin** pops a confirm dialog. Expect a status line: "`<email>` is now
         `<Role>`. They re-sign-in to refresh."
   - [ ] **Important:** the change takes effect on the target's **next sign-in** (custom claim). If you
         check in the same session, you will see no change — that is expected.
4. [ ] **Assign them to the Maintenance "group" (space scope):** in the same row's **Space access**
       sub-row, untick **"All spaces"**, tick **Maintenance**, type an **Access reason (required)**, click
       **"Save space access"**. Expect "`<email>` now has access to Maintenance. They re-sign-in to
       refresh."
5. [ ] **Verify the scoping worked:** have that teammate re-sign-in. Their top nav should now show
       **Maintenance** but **not** Lease Renewal or Approval Queue, and their landing should drop them at
       their Maintenance desk.
6. [ ] **Audit check:** go to **Admin → Activity and Logs → Access-change history**. Your role and
       scope changes should appear (actor, target, before→after, reason).

**Is it simple and intuitive?** Grade it: the role/scope controls are clear once you are on the page,
but (a) there is no invite button, and (b) new users are ungated. Note both if they matter to you.

---

## 5. "Send a ticket to myself for an issue on a page" — Report an issue

1. [ ] On any signed-in page, click the **"Report an issue"** button (bottom-right).
2. [ ] A dialog opens with an **optional** "What went wrong?" box. You can leave it blank. Type a note
       if you like, then click **"Send report"**.
3. [ ] Expect: **"Thanks. Your report was filed to the support queue for review."** (If Firestore is
       unreachable you get an honest "we could not file it, try again" — never a fake success.)
   - **Privacy note:** the report captures the page path, viewport, and the _identity_ of the last
     element you touched — never the page's text content or the query string.
4. [ ] **See where it lands:** go to **`/admin`** and find the **Support Reports** panel. Your report
       should be listed there.
   - **⚠ Heads-up:** this files to an in-app queue you review in Admin. It does **not** email you a
     ticket. Email delivery of reports is a separate, not-yet-built path (`docs/whats-next.md` §2.2).
5. [ ] **Bonus (error path):** if you ever hit an app error screen, it offers a "report this" panel
       that files to the same queue.

---

## 6. Notifications — "do they come up, and do they clear when I act?"

1. [ ] Click the **bell** (top-right). Expect an unread **badge** (a number, shown as "9+" above nine)
       and a popover listing recent unread items, with **"Mark all read"**, **"See all notifications"**,
       and (when relevant) **"Open Approval Queue"**.
2. [ ] While unread, the **browser tab title** should be prefixed with the count, e.g. "(3) …".
3. [ ] **Clear one by acting:** click a notification. It should mark itself read and navigate you to
       the thing. The badge count should drop.
4. [ ] **Mark all read:** click it; the list should clear.
   - **⚠ Heads-up (set expectations):**
     - Approval-queue notifications are generated by a **batch job**, not the instant an item becomes
       ready. So a freshly-ready item may **not** ping the bell immediately in a manual test.
     - **Approving or denying an item does not itself clear its bell notification** — you clear it by
       opening it or "Mark all read."
     - "Mark all read" clears activity items, but standing **set-up signals** (connections/coverage)
       stay until the underlying state is actually fixed. That is intentional.
5. [ ] Open **`/notifications`** (the full hub) via "See all notifications" and confirm sections: Team
       review (Admin), Needs your decision, Recent activity, Set-up.

---

## 7. Approval Queue — "does it work?"

Route: **Approval Queue** (`/approval-queue`). Needs the renewals scope; you view with read, act with
edit/approve.

1. [ ] Landing shows the value-free **"Needs your decision"** inbox. Behind an **"Other views"**
       disclosure are tabs: **All items / Renewal reviews / Write-back proposals**.
2. [ ] Open **All items** and select a row. The detail panel shows Data mode (Test/Live), Status, Risk,
       Assignee, Required approver, Due date, and action buttons: **Open Run, Approve, Return, Deny,
       Snooze**, plus (Admin) **Assign / Disable Action**.
3. [ ] **Approve (simple):** on a non-high-risk item with no linked execution, click **Approve** — one
       click, no reason needed. Status should move to Approved and the item collapses out of the active
       list.
4. [ ] **Approve (High-risk):** on a High-risk item, expect a confirm dialog **and** a required typed
       reason before it will approve.
5. [ ] **Deny (terminal):** click **Deny**, leave the reason blank, and confirm it is rejected with
       "Deny requires a reason." Enter a reason and deny. Status should show **Denied** (terminal, no
       further actions), and the Activity log should record the reason.
6. [ ] **Return / Snooze:** Return requires a reason; Snooze requires a date **and** a reason.
7. [ ] **Role gates:** confirm you cannot approve an item assigned to you, and that only the required
       approver or an Admin can approve. Linked-execution items require Admin and note that approval
       authorizes the exact preview but does **not** itself call any provider.
8. [ ] **Deep link:** open `/approval-queue?item_id=<id>` and confirm it selects that item; clicking a
       different item updates the URL and the detail together.

---

## 8. Email — "draft and send an email, and do drafts land in my Gmail Drafts folder?"

There are three drafting surfaces and one send surface, on purpose. The headline: **renewal notices
become real, unsent drafts in your own Gmail Drafts folder; actual sending is a separate,
exact-confirmed, human-only step.**

### 8a. Draft a renewal notice into your Gmail Drafts (the real path)

**Prerequisite:** RentVine and Gmail (per-user) must be connected in the environment (see §11). As
**Admin**, from the Renewal Desk click **"Live renewal notices (compose drafts)"** (this button shows
for Admins) → `/lease-renewal/live/notices`.

1. [ ] The page lists actionable **live** leases. Expand a lease to reveal the **Renewal-notice draft**
       composer.
2. [ ] Choose a channel: **"Tenant offer"** or **"Owner notice"**.
   - Tenant: pick the owner decision (Increase / Keep / Custom) and enter the offered rent.
   - Owner: enter the market number, comp range, and comps screenshot reference.
   - **Note:** you do **not** type the recipient — it is resolved server-side from the authoritative
     live RentVine record and cannot be edited in the UI (a safety guard).
3. [ ] Click **"Preview draft"**. Expect a To / Subject / body preview (or a "this draft is not ready"
       reason list). The body should carry the **"Draft — Review before sending"** banner.
4. [ ] Click **"Create Gmail draft"**. Expect: **"Unsent Gmail draft created (id …). Open Gmail to
       review and send it to <recipient> yourself."**
5. [ ] **Confirm it actually landed:** open **Gmail → Drafts**. The unsent draft should be there,
       addressed to the tenant/owner (and, for a multi-tenant lease, **Cc'ing the co-tenants** — that is
       the F-LEASE-6 behavior), with the banner in the body. **You** send it from Gmail; the app does not.

### 8b. The other draft surfaces (Communications / Admin tools)

1. [ ] **Communications** (`/gmail-hub`) shows a **"Workflow Communications"** workspace and a **Gmail
       connection** status. It is deliberately **not** a general inbox and has **no compose/send** here.
2. [ ] As **Admin**, the "governed workflow recovery tools" include an **Anticipatory draft composer**:
       pick a reply pattern, enter sender/subject/facts, click **"Compose draft"** → you get a text draft
       with a **"Copy draft"** button and "Review before sending." It never touches a mailbox.

### 8c. Actually sending (exact-confirmed, human-only)

**⚠ Heads-up:** the only in-app **send** path is wired into **live Maintenance tickets** (owner
replies), not into renewals. Renewals intentionally stop at an unsent Gmail draft.

1. [ ] On a **live** Maintenance ticket with a linked Gmail thread, use **Load linked communication →
       Open thread → Request source-backed reply proposal → Review exact linked reply.**
2. [ ] The confirmation card shows From / To / Cc / Bcc / Subject / thread / exact body. You must tick
       **"I reviewed the exact mailbox, recipient, subject, and reply body"** before **"Send exact linked
       reply"** is enabled.
3. [ ] Send. Expect a **bodyless receipt** (Message ID / Thread ID). If Gmail returns an ambiguous
       result, you should see **"Reconcile ambiguous reply"** instead of a blind retry.
4. [ ] **Confirm the safety posture (should all be true):** there is no bulk send, no "send all," no
       autonomous send anywhere; the Connection Center lists "Gmail (legacy notification sender): Disabled";
       and generic compose is refused.

---

## 9. Lease Renewal — "go end to end, start of lease to end, and is the next step obvious?"

Route: **Lease Renewal** (`/lease-renewal`, the Renewal Desk). Needs the renewals scope.

1. [ ] The desk header shows **"Renewals"** with a **"Sample data"** chip and links to the Test
       workspace and (Admin) live review. Expect **"Needs your attention"** cards, a metric row
       (Actionable / Needs review / Skipped / Out of window), and **"Your queue"** of lease cards.
2. [ ] Each lease card shows a **stepper** and a **"Next: <action>"** line, with an **Open** button.
       Click **Open** on one → `/lease-renewal/lease/<id>`.
3. [ ] The per-lease workspace walks a 4-step stepper: **Data check → Owner decision → Tenant offer →
       Build docs.** Walk it:
   - [ ] **Data check:** conflicts between RentVine and the tracking sheet are flagged "Needs your
         decision."
   - [ ] **Owner decision:** shows a draft owner notice (banner + "Preview the owner email").
   - [ ] **Tenant offer:** Email / Portal / Text tabs.
   - [ ] **Build docs:** readiness checks.
   - **⚠ Heads-up:** this workspace is **sample/preview data**. Its "Prepare tenant/owner email"
     buttons are **preview-only and never create a real draft** — the real draft flow is the live
     notices desk in §8a. The screen does tell you this, but the buttons look actionable.
4. [ ] **Live end-to-end** (Admin, RentVine + Sheet connected): open **"View live review →"**
       (`/lease-renewal/live`) to reconcile real RentVine leases against the tracking sheet, then use the
       **live notices desk** (§8a) to mint the real draft. That is the true start→finish path: live lease →
       review/decide → draft into Gmail → you send.
5. [ ] **Judgment call — is the next step obvious?** The "Next:" lines and attention cards are good.
       But the jump from the **sample desk** to the **real** draft flow is only sign-posted to **Admins**
       (the live-notices link is Admin-gated even though the page allows Editors). Note this if it trips you
       up — it is on the fix list (`docs/whats-next.md` §2.2).
6. [ ] If sources are not connected, confirm the live pages **degrade honestly** ("Live sources aren't
       connected" / "Wrong RentVine account") with an **"Open Connection Center"** link — not a silent
       fallback to fake data.

---

## 10. Maintenance — tickets, intake, capture

Route: **Maintenance** (`/maintenance`). Needs the maintenance scope; capture needs edit.

1. [ ] **Staff ticket queue:** Open-first list with a collapsible "Closed (N)", a **Data** filter (All
       / Live / Test) and an **"Assigned to me"** checkbox. Statuses: Open, Waiting on Response, Waiting on
       Vendor, Scheduled, Closed.
2. [ ] **Create a ticket (capture):** in the Capture panel, enter an **Issue** (or tap **Record
       voice**), pick a **Unit** (typeahead), optionally a **Priority**, click **"Build work-order
       draft"**. Review the preview (blockers, an owner-notice draft, a vendor-trade suggestion), then
       **"Create ticket"**. Expect "Ticket created (Open). Reload to see it in the queue."
   - **⚠ Heads-up:** **Photo upload is gated off** until the owner Drive permission + folder id are
     configured, so in a default environment there is no working photo upload. You will see "Photo
     storage is unavailable… Continue without a photo."
3. [ ] **Ticket actions:** change **Status** (closing requires a reason), **Reopen** (reason),
       **Assignee** (staff roster), **Add note**, and expand **History** (append-only trail).
4. [ ] **Tenant maintenance request (intake):**
   - **⚠ Heads-up:** there is **no rendered public tenant form and no UI button to create the intake
     link.** Public intake is an API reached with a staff-minted token (CLI `npm run intake:mint` or the
     token API). The public submit accepts **summary / description / contact only — no photo.** This is
     a known gap (`docs/whats-next.md` §2.2). To exercise it you (or I) mint a token and POST a test
     submission; it lands in a **quarantine "unverified intake" queue**, not a live ticket.
   - [ ] On `/maintenance`, find the **"Unverified intake (N)"** section. For a row, use **"Promote to
         Live app ticket"** (optionally confirm a unit) or **"Dismiss"** (reason required). Confirm promote
         creates an Open ticket with no provider side effect.

---

## 11. External Vendor portal — invite, sign-in (password + TOTP), assigned work

**⚠ Heads-up:** only the **Summit Plumbing Test Vendor** path is fully wired. Inviting a **real** (live)
vendor and assigning a **live** vendor to a live ticket are **built but not wired into the UI** yet
(`docs/whats-next.md` §2.2). Test the Test lane:

1. [ ] **Provision (Admin):** `/admin/users` → **External Vendors** panel → enter a provisioning reason
       → **"Review exact Test setup"** → **"Confirm and provision Test Vendor."** A **one-time
       password-setup link** is shown once (never stored/emailed — copy it now).
2. [ ] **Vendor sets up auth:** open the one-time link, set a password. Go to **`/vendor/sign-in`**,
       enter email + password → **Continue**. Because no second factor is enrolled, you get a **TOTP setup
       key** — add it to an authenticator app, enter the 6-digit code, **Verify**. The app signs you out and
       requires a fresh password + code. Sign in again with both.
3. [ ] **Assigned work:** at **`/vendor`** you should see **only** tickets assigned to this vendor. Open
       one (`/vendor/tickets/<id>`). A Test-workspace banner notes "external delivery is off"; the Test
       ticket shows a simulated mailbox panel (drafts/labels/replies), never a real send.
4. [ ] **Isolation checks:** confirm a vendor cannot reach any internal page, and an internal staff
       session cannot reach `/vendor`. Confirm the sign-in footer states "There is no self-registration. Use
       the one-time setup link from PMI KC first."
5. [ ] **Lifecycle (Admin):** from the External Vendors panel, exercise **Regenerate setup link**
       (while pending), **Reset Test Vendor authentication** (rotates the login, preserves Test tickets),
       and **Disable**. Note: to bring a disabled vendor back you use **Reset authentication** (there is no
       separate "Enable" button). Each action is preview-then-confirm and writes a bodyless audit.

---

## 12. Connections / API setup — "do the APIs work, and is it easy to set up?"

Route: **Connections** (`/connections`). All roles view; only Admin gets verify/setup affordances.

1. [ ] Expect a metric row (Connected / Need attention / Not connected) and a grid of connector cards:
       RentVine, Google Sheets, Google Drive, Dotloop, LeadSimple, Gmail (legacy sender — Disabled), Gmail
       (workflow communications), QuickBooks. Each shows a status dot, what it powers, and a method badge
       (Google / OAuth / API key).
2. [ ] **Verify a live connection (Admin):** for **RentVine** or **Google Sheets** (the two with a live
       probe today), click **"Verify connection."** Expect "<name> answered the live check." or an honest
       failure, then the card refreshes.
3. [ ] **⚠ Heads-up (important expectation-setting):**
   - The **"Set up <name>"** control is **explanatory text only** — there is **no in-app credential
     form, OAuth button, or wizard.** Real configuration is done server-side via environment variables /
     Secret Manager, not in the UI. The current copy ("the app stores your credentials securely")
     over-promises a flow that does not exist yet. A real connect-and-save walkthrough is on the build
     list (`docs/whats-next.md` §2.2).
   - Only **RentVine** and **Google Sheets** can turn green in the UI (they have probes). Drive,
     Dotloop, LeadSimple, and QuickBooks cap at "Setup complete / no live check available" even when
     configured. That is a display limitation, not necessarily a broken connection.

**So: "is it easy to set up the APIs?"** Honest answer today: connecting is a server/env task, and only
two connectors self-verify in the UI. Making this a real in-app connect-and-save experience is a named
next step, not a shipped feature.

---

## Appendix A — Consolidated "don't be surprised" list

These are known, intentional gaps (all tracked in `docs/whats-next.md`). If you hit one, it is not a
regression:

1. No in-app **invite/create user** for staff; the roster only shows people who have signed in once.
2. New users are **ungated** (Editor + all spaces) on first sign-in; "no access until assigned" is not
   built yet (F-AUTH-1).
3. Role/scope changes take effect on the **next sign-in**, not immediately.
4. No **public tenant maintenance form** page and no UI to mint the intake link; public intake has **no
   photo field**.
5. **Photo upload** in the staff capture desk is gated off until Drive is configured.
6. **Live Vendor invite** and **live-vendor assignment** are not wired (Test Vendor lane only).
7. Renewal **"Prepare email" buttons in the sample workspace never create a draft** (preview-only); the
   real draft flow is the live notices desk.
8. Live renewal drafting is **discoverable only by Admins** (the link is Admin-gated).
9. **Approval notifications** are batch-generated (a delay), and approving/denying does not clear the
   bell.
10. **Connection Center "Set up"** is text-only; only RentVine and Google Sheets self-verify.
11. The **"V1 application"** release banner and a hardcoded **"Dan"** label are cosmetic leftovers on
    the cleanup list.

## Appendix B — Where to file what you find

- A rough-edge on a specific page → click **"Report an issue"** on that page (it files to Admin →
  Support Reports).
- A "this should work differently" decision → note it against the matching item in
  `docs/whats-next.md`, or tell me and I will fold it in.
- A hard bug (error screen, broken action) → note the exact steps here next to the box, and I will
  reproduce and fix it as a verified slice.
