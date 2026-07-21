# Manual QA — unconfirmed & blocked items (2026-07-21)

**What this is.** A short, focused companion to `docs/manual-qa-walkthrough-2026-07-21.md`. The automated
browser QA pass confirmed **76 processes PASS** and reproduced every documented gap. It could **not**
confirm the items below — each needs a real provider, a human-only input, a prod config step, or a real
external account that an automated run must not use. This doc collects **only those items**, plus the
**two fixes** shipped from that pass, so you can knock them out by hand.

**Where to test.** Use the **deployed Cloud Run app** (production serves the current build) unless a row
says otherwise. Several items were blocked only in the _local emulator_ (which can't mint Firebase setup
links or use real Google accounts) but are fully testable on the deployed app.

**Legend for each row:** ▶ what to check · 🔑 what unblocks it · 🧭 how to test · ⚠ safety note.

---

## A. Verify the two fixes that shipped from the QA pass

These were `- changes:` items the QA pass fixed at the source. Confirm them on the deployed app.

### A1 — Sign-in refusal now shows the friendly message (was P3.2)

- ▶ A rejected non-`pmikcmetro.com` sign-in shows **"This Google account is not authorized for PMI KC
  KB."** (previously it leaked the raw server string "Google Workspace hosted domain is not allowed.").
- 🔑 Any non-`pmikcmetro.com` Google account (e.g. a personal `@gmail.com`).
- 🧭 Open the deployed app signed out → `/sign-in` → **Sign in with Google** → pick the personal account.
  You should see the friendly message and be kept out. (The friendly copy now also matches the message
  you get if an already-signed-in user hits a page they lack access to.)
- ⚠ None — the account is still blocked server-side; only the displayed copy changed.

### A2 — High-risk approval now requires a reason (was P6.3)

- ▶ Approving a **High-risk** Approval Queue item requires a plain-English reason (the box was always
  required in the UI; now the server enforces it too, so the audit trail can never hold an un-reasoned
  High-risk approval).
- 🔑 A High-risk queue item at "Ready for Approval" (Approver/Admin).
- 🧭 Approval Queue → All items → pick a High-risk item → **Approve** → confirm the browser prompt →
  try to submit with the reason blank (refused) → add a reason → it approves and the reason shows in the
  item's Activity. (Bulk high-risk approval is intentionally left reason-optional per your earlier ruling.)
- ⚠ None — no external send or system-of-record write; this is an app decision only.

---

## B. Testable on the deployed app (needs prod's real Firebase / RentVine / Gmail)

These were blocked only because the local run used emulators. On the deployed app they work.

### B1 — Provision the Summit Plumbing Test Vendor (P10.6)

- ▶ Review card shows the exact effect, then a **one-time password-setup link is shown once**, status
  `pending_setup`, bodyless audit entry.
- 🔑 Real Firebase Auth (the emulator can't mint setup links — that's why it was blocked locally). Admin.
- 🧭 `/admin/users` → **External Vendors** → enter a reason → **Review exact Test setup** → **Confirm and
  provision Test Vendor** → **copy the one-time link immediately**.
- ⚠ Copy the link once and don't share/log it. This is a Test vendor (`.invalid` email) — no external
  delivery, no real effect.

### B2 — Regenerate / reset / disable the Test Vendor (P10.7)

- ▶ Regenerate → fresh one-time link, record unchanged. Reset → new Firebase UID, sessions/TOTP cleared,
  back to `pending_setup` with a new link, Test tickets preserved. Disable → "Test Vendor disabled and
  Firebase sessions revoked." (No **Enable** button — re-enable is via **Reset authentication**.)
- 🔑 A provisioned Test Vendor (B1). Admin.
- 🧭 In the External Vendors panel, run each **Review …** → **Confirm** in turn.

### B3 — Vendor sign-in with password + TOTP (P11.1, P11.2, P11.3 vendor side)

- ▶ First-time: set password from the one-time link, enroll TOTP ("TOTP enrolled. Sign in again…"),
  sign in again with the code → land on `/vendor` seeing **only assigned tickets**. Server gates hold
  (not-a-vendor / unverified email / no TOTP / stale MFA).
- 🔑 The one-time setup link from B1 **plus a real authenticator app** (Google Authenticator, etc.).
- 🧭 Open the one-time link → set a password → `/vendor/sign-in` → email + password → add the setup key to
  your authenticator → enter the 6-digit code → **Verify** (it signs you out) → sign in again with the
  code. Assign the Test Vendor to a Test maintenance ticket (from `/maintenance`) to see it under
  "Assigned maintenance tickets."
- ⚠ **Never type a password or 2FA code for me** — you do this step yourself. Test tickets show a
  _simulated_ mailbox; no email leaves the app.

### B4 — Compose a real tenant renewal Gmail draft (P5.12 — "the money path")

- ▶ `/lease-renewal/live/notices` reads live RentVine leases; **Preview draft** shows To/Subject/body;
  **Create Gmail draft** produces a **real unsent draft** in your Drafts (To = RentVine tenant email,
  Cc = co-tenants, body prefixed "Draft — Review before sending"); on-screen "Unsent Gmail draft created
  (id …)".
- 🔑 RentVine connected (it is) **and Gmail workflow access connected** for your mailbox, plus a lease
  whose summary reads "tenant ready".
- 🧭 Open the desk → expand a "tenant ready" lease → channel **Tenant offer** → set owner decision +
  offered rent → **Preview draft** → **Create Gmail draft** → open **Gmail → Drafts** and confirm the
  unsent draft. **You** press Send (the app never sends).
- ⚠ This touches **real tenant data** and creates a **real (unsent) draft** — that's why the automated run
  did not do it. Review the recipient before you ever press Send. Owner-channel drafts still block on a
  missing owner email (documented gap P5.14).

### B5 — Send the one exact-confirmed reply on a live maintenance ticket (P8.4)

- ▶ The **only** in-app send: a live maintenance ticket → **Linked Gmail communication** → load thread →
  request source-backed proposal → **Review exact linked reply** → tick the confirmation → **Send exact
  linked reply** → bodyless receipt (Message/Thread ID), "sent once" (duplicate returns the same receipt).
- 🔑 Gmail workflow access connected **and** a live maintenance ticket already linked to a real Gmail
  thread (with the RentVine/Sheets data behind it).
- 🧭 Follow the panel steps on a live ticket; read every field on the confirmation card before you tick it.
- ⚠ **This is a real outbound email.** Only do it against a thread/recipient you control (e.g. a test
  address you own), never a real tenant/owner, and only when you intend to send. If the send comes back
  ambiguous, use **Reconcile ambiguous reply** (P8.5) — do not blindly retry.

### B6 — Ambiguous-send reconcile (P8.5)

- ▶ Only appears if Gmail returns an ambiguous result during B5: the Send button is replaced by a
  "sending again is disabled…" notice + **Reconcile ambiguous reply**; reconcile matches by message ID.
- 🔑 An actual ambiguous Gmail result (rare, not forceable). Piggyback on B5 if it happens.

---

## C. Human-only inputs (no environment unblocks these — you must do them live)

### C1 — Dictate a question by voice (P1.6) & voice-capture a maintenance issue (P7.2)

- 🔑 A real microphone + **Chrome** (Safari/iPhone is a documented gap) + the live Speech API.
- 🧭 Console → **Dictate** (allow the mic) → speak → **Stop recording** → confirm the transcript is
  _appended_ with "Transcript appended to your question…". Maintenance → **Record voice** → speak → stop →
  confirm "Transcript: …" folds into the issue. Empty speech gives the documented "No speech…" messages.

### C2 — Idle warning at 28 min, auto sign-out at 30 (P3.5)

- 🔑 ~28 minutes of genuine idle time (no mouse/keyboard/scroll).
- 🧭 Sign in, leave the tab untouched. At ~28 min a focus-trapped **"Are you still active?"** dialog with a
  live **"Signing out in m:ss."** countdown appears; moving the mouse does **not** dismiss it (only **Stay
  signed in** resets). Ignore it → signed out at 30 min → `/sign-in`.

---

## D. Needs a prod config step first

### D1 — Public tenant maintenance intake (P7.10)

- ▶ Minting an intake link + a public submission (202, lands in quarantine, not a live ticket) + the
  rate-limit / single-use / oversized error probes.
- 🔑 Set the maintenance **intake signing secret** (and the IP-hash salt, `docs/whats-next.md` §3.3) in
  Secret Manager — until then the mint returns **503 "Maintenance intake is not configured (no signing
  secret)."** There is also no in-app UI to mint the link (CLI `npm run intake:mint` or the token API) and
  no tenant-facing form (documented gaps).
- 🧭 After the secret is set: mint a token, POST a test submission with a `summary`, then triage it from
  `/maintenance` → **Unverified intake** → **Promote / Dismiss** (the triage half was confirmed working).

---

## Not in this doc (already confirmed or already tracked)

- The 76 PASS processes and the 4 documented gaps (P1.5 no slash router, P4.2 scoped-spaces under-see,
  P5.14 owner-draft recipient, P7.9 no live-vendor-assign) are in the main walkthrough with `model-result`
  lines. You don't need to re-test those unless you want to.
- The scoped-user navigation cases (renewals-only / maintenance-only tabs, P3.4 / P4.2) were verified by
  code, not by a live scoped session — worth an eyeball with a real scoped teammate account if convenient.
