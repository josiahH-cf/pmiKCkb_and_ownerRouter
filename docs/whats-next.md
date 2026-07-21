# What's Next — Open Decisions, Directions, and Recommendations

**Purpose.** This is the single doc to read when you come back and ask _"what's next?"_. The app is
built and the v1 readiness remediation is complete on every testable code front (see
`docs/loop-state.md` and `docs/status.md`). Everything left is either a decision only you can make, a
build that should not start without your go-ahead, or an infrastructure step in your GCP/Workspace
console. Each item below is written as **Finding → Context → Recommendation → What I need from you**,
so you can decide it as a confirm-with-default rather than an open essay question.

**How to drive it.** Read the "Status at a glance" table, then start at the top of §1. For each item,
I will propose the default and ask only the irreducible question. Answer, and I execute (or hand you
the exact console step). Nothing here reopens a closed finding — those are done and adversarially
verified.

**Standing safety boundaries (never traded away for any item below):** every send stays
human-initiated and exact-confirmed (no autonomous/scheduled/bulk/model-triggered send); secrets stay
in Secret Manager, never git; Live system-of-record writes use their preview→confirm→receipt→rollback
contract; sample/test data never becomes a real draft or send; staff/cloud identities stay
`pmikcmetro.com`/service. These _permit_ go-live; they do not block it.

---

## Status at a glance

| #   | Item                                                          | Type              | Blocked on                              | Default recommendation                                       |
| --- | ------------------------------------------------------------- | ----------------- | --------------------------------------- | ------------------------------------------------------------ |
| 1.1 | Redeploy `main@36440e9` to production                         | Deploy            | Your authorization + fresh gcloud login | Deploy now (puts the remediation live)                       |
| 1.2 | Q-CUTOVER-POSTURE: keep Test lane vs strip to production-only | Decision          | Your ruling                             | Keep the Test lane; scope teardown as its own reviewed cycle |
| 1.3 | F-LEASE-6: is the primary tenant always `tenants[0]`?         | Decision (Dan)    | One answer                              | Keep the all-tenants-Cc behavior we shipped                  |
| 1.4 | F-LEASE-3: confirm live RentVine field names                  | Decision (Dan)    | One answer                              | Confirm before any live renewal click-through                |
| 2.1 | F-AUTH-1: onboarding — no access until Admin assigns scope    | Owner-gated build | Go-ahead + a deploy migration           | Build it, with the never-lock-out-admins invariant           |
| 2.2 | Product/UX polish backlog                                     | Owner-gated build | Pick which to build                     | Build the low-risk ones next; artwork items need your files  |
| 3.1 | env-LR-01: Firestore backups / PITR (**HIGH**)                | Infra             | Your console                            | Enable before any real client data lands                     |
| 3.2 | env-LR-02: budget kill-switch provisioning                    | Infra             | Your console                            | Provision the real kill switch, not just alerts              |
| 3.3 | maint-LR-02: `MAINTENANCE_INTAKE_IP_HASH_SALT` secret         | Infra             | Your console                            | Set the secret before enabling public intake                 |
| 3.4 | auth-LR-05: confirm prod `NODE_ENV` / demo-auth off           | Infra check       | 5-minute verification                   | Verify at next deploy                                        |
| 4.x | Accepted residuals / owner-ruled accepts                      | Known limitation  | Nothing (unless you reprioritize)       | Leave as-is; documented                                      |

---

## 1. Decisions only you can make (these unblock the most)

### 1.1 Authorize the production redeploy

- **Finding.** Cloud Run `pmi-kc-kb-demo` serves `ead5da5` (revision
  `pmi-kc-kb-demo-rmrsg73yg-2bb353f9e7dc`, deployed 2026-07-19). `main` is four remediation commits
  ahead (`0363d9a`, `aa92c38`, `4d53418`, `36440e9`). Production is safe but does not yet carry the
  concurrent-pending double-send fix or the F-LEASE-6 all-tenants Cc.
- **Context.** The deploy is one command, `npm run deploy:demo -- --budget-confirmed`. It is
  cost-bearing (a Cloud Build) and outward-facing, and on this managed org gcloud reauth is
  interactive-only — the agent can run the deploy non-interactively **only while your session login is
  fresh** (`npm run auth:session` earlier in the session). The agent checks `preflight:adc` first and
  hands you the exact command if the login is stale.
- **Recommendation.** Deploy. It only moves already-verified, green code forward; the rollback target
  (`pmi-kc-kb-demo-rmrrv992z-a2cc59bb11db` / `c87f54d`) is retained, and the auth boundary is HTTP-smoked
  after.
- **What I need from you.** A "yes, deploy" (and, if the login is stale, run `npm run auth:session` in
  your terminal first). I will capture the new serving + rollback revisions and record the checkpoint in
  `docs/facts.md` + `docs/status.md`.

### 1.2 Q-CUTOVER-POSTURE — keep the Test lane, or strip to a production-only app

- **Finding.** There is standing tension between two of your directions. The 2026-07-18 ruling leaned
  toward tearing down the Live/Test-lane split and moving to universal self-registration; the 2026-07-19
  UI/UX spec §B said "remove test/simulation/demo mode, make everything sendable, make it prod." But the
  app today deliberately **keeps** the isolated Test lane, the simulation-only run surfaces, and the
  admin demo chain as safety features, and the implementing agent did **not** rip them out unilaterally.
- **Context.** This is a genuine fork, not an oversight. The Test lane, "this is a test run" labeling,
  and the "nothing here can send" honesty strings are code-only governance defaults (not external
  dependencies) — removable — but they encode a repeatedly-ratified safety posture. Stripping them is a
  large, safety-adjacent refactor that also drags in the stale "V1 application" banner, the four
  "nothing here can send" strings, and the hardcoded "Dan" labels (see §2.2). Doing it wrong risks
  turning a safe draft-only app into one where a mistaken click sends.
- **Recommendation.** Keep the Test lane. Treat "production-only cutover + universal self-register" as
  its **own** reviewed build cycle with the hard boundaries preserved (still human-confirmed exact
  sends, still no autonomous send), rather than a flag flip. If you want to move that direction, we
  scope it as a dedicated slice set and I adversarially verify each one.
- **What I need from you.** One of: (a) keep the Test lane as-is (default); (b) start the production-only
  cutover as a scoped cycle now; or (c) a narrower subset (e.g. just drop the stale "V1 application"
  banner and relabel "Dan" — the low-risk cosmetic half — while keeping the Test lane). Follow-ups I'll
  ask if you pick (b): does "everything sendable" still mean every send is human-confirmed? Who may
  self-register, and into what default role/scope?

### 1.3 F-LEASE-6 — is the primary tenant always `tenants[0]`? (for Dan)

- **Finding.** The renewal notice now addresses **all** authoritative co-tenants: To = the first tenant
  on the live lease, Cc = the rest (each held to the routable + authoritative-source bar). Previously it
  addressed only `tenants[0]`.
- **Context.** This is strictly safer for correctness (co-tenants are legally on the lease and should
  receive the notice) and it never weakens the draft-only/authoritative-recipient guards. The one
  assumption is that RentVine's `tenants[0]` is the right person on the To line.
- **Recommendation.** Keep the all-tenants-Cc behavior. It matches how a notice should legally go out.
- **What I need from you.** Confirm with Dan whether `tenants[0]` is reliably the primary/lead tenant.
  If it is **not** deterministic, tell me the rule (lead-tenant flag? alphabetical? all on the To line?)
  and I adjust. If co-tenants should never be emailed, I revert to `tenants[0]`-only.

### 1.4 F-LEASE-3 — confirm the live RentVine field names (for Dan)

- **Finding.** The live renewal desk resolves recipients and rent from real RentVine lease fields. The
  exact live field names/paths were mapped from one live export, not confirmed by the source owner.
- **Context.** A wrong field mapping would surface wrong data on a real draft (still draft-only, still
  never auto-sent — a human reviews before sending — but worth getting right before a live
  click-through).
- **Recommendation.** Have Dan confirm the field names against a couple of real leases before the first
  live end-to-end draft is minted in a RentVine-connected environment.
- **What I need from you.** A "confirmed" or the corrected field names.

---

## 2. Buildable, but each needs your go-ahead (owner-gated code)

### 2.1 F-AUTH-1 — onboarding: no space access until an Admin assigns scope

- **Finding.** Today a brand-new signed-in staff user defaults to Editor with (absent an explicit
  `scopes` claim) **all-spaces** access. Your 2026-07-20 ruling (D1) is that a new user should get **no**
  space access until an Admin assigns scope — a new "unprovisioned" state.
- **Context.** This is the one remaining governance-changing code item that I deliberately did **not**
  auto-build, because it ships with a **deploy migration risk**: the "absent `scopes` = all-spaces"
  behavior currently protects your **already-provisioned** users (including you and Dan as Admins). If a
  naive change makes "absent scopes = no access," it would lock out every existing admin on deploy.
- **Recommendation.** Build it with a hard invariant: **absent `scopes` still means all-spaces for
  already-provisioned users; the no-access default applies only to the new unprovisioned state.** Ship
  it behind an explicit migration that stamps existing users first, verify on a throwaway identity, and
  deploy deliberately. I do the code + tests + adversarial pass; you approve the migration + deploy.
- **What I need from you.** "Build F-AUTH-1." Follow-ups I'll ask: what does an unprovisioned user see
  (a "waiting for access" screen vs a redirect)? Should a new Admin-invited user be provisioned at
  invite time so there's never a lockout window?

### 2.2 Product / UX polish backlog (the honest coverage list)

These are real, buildable UI/UX improvements the finalization pass deliberately deferred (they were
never claimed as done). None is a safety issue; each is a quality-of-experience upgrade. Verify current
state before building each — some may have partially landed.

- **Drop the stale "V1 application" release banner** (low risk, cosmetic). Tied to Q-CUTOVER-POSTURE §1.2.
- **Relabel the hardcoded "Dan"** to a role/state label instead of a person's name (low risk). Tied to §1.2.
- **A guided "Next" control** on the renewal desk so it's obvious what to do after each action (medium).
  This directly answers your "is it obvious what to do next?" test — worth prioritizing.
- **Hide the V1 external-execution / readiness internals** off the standard renewal landing into Admin,
  so an operator sees the operator flow, not the plumbing (medium).
- **Desk convenience links**: Zillow + "what's next" + open-the-sheet + report-a-bug links on the desk
  (low/medium).
- **A Connections connect-and-save walkthrough.** Today `/connections` is read-only status + an Admin
  "verify" for RentVine/Sheets. A real connect-and-save flow (enter credentials → store in Secret
  Manager → verify) is the "is it easy to set up the APIs?" answer (medium; touches secret handling —
  I'll design it so the app never shows secret values and you approve each provider).
- **Wire the built-but-dead self-registration / TOTP / verification-code / live-vendor-invite** paths
  (medium/large; overlaps §1.2 and the 2026-07-18 universal-self-register direction). Do not wire
  without deciding §1.2 first.
- **PMI logo / favicon + red-dot notification badge.** Blocked on **you supplying the vector artwork**
  (SVG/PNG). Send the files and I wire them; per your standing note the ticket icon stays a plain
  "Report an issue" button, not the logo.
- **The renewal §H tenant / Dotloop UI cleanup** (medium).
- **Report-issue email delivery.** Today "Report an issue" files to a Firestore support queue reviewed
  in `/admin` (no email), which is safe and honest. Email delivery would need a separate owner-approved
  transactional send path (a new send lane — held behind the same no-autonomous-send scrutiny).

**Smaller friction points the by-hand review map surfaced (mostly quick, honesty/clarity fixes).** The
full list is Appendix A of `docs/manual-qa-walkthrough-2026-07-21.md`; the ones worth deciding here:

- **Connection Center copy over-promises.** "Set up <name>" is explanatory text only (no credential
  form/OAuth/wizard exists), yet the copy says "the app stores your credentials securely." Recommend a
  quick honesty fix now (say what actually happens today) even before the full connect-and-save
  walkthrough is built.
- **Sample renewal "Prepare tenant/owner email" buttons never create a draft** (preview-only) but look
  actionable next to an empty-state that tells you to go to the live desk. Recommend either removing
  them from the sample workspace or routing them to the live notices desk.
- **The live renewal drafting link is Admin-gated on the desk though the page allows Editors** — an
  Editor has to know the URL. Recommend showing the link to any `edit`-capable user.
- **New staff onboarding has no in-app affordance** (no invite button; new users invisible until first
  sign-in). Recommend a small "how to add a teammate" hint on `/admin/users`, and reconsider as part of
  F-AUTH-1 (§2.1).

- **What I need from you.** Point at any subset ("build the guided Next control, drop the V1 banner, and
  do the Connection Center honesty fix") and I'll run each as a verified slice. Send artwork files for
  the favicon item.

---

## 3. Infrastructure / provisioning (your GCP / Workspace console)

These are not code — they are console steps only you can perform. The app is built to use them; they
are the difference between "green in test" and "safe with real customer data."

### 3.1 env-LR-01 — Firestore backups / point-in-time recovery (**HIGH**)

- **Finding.** The audit's highest-priority environment item: there is no Firestore backup / PITR
  configured. If real client data lands and something corrupts or deletes it, there is no restore.
- **Recommendation.** Enable Firestore scheduled backups (and/or PITR) on `pmi-kc-kb-prod` **before**
  any real client data is entered. This is the single most important pre-real-data step.
- **What I need from you.** Enable it in the console (I can draft the exact `gcloud firestore backups`
  schedule command for you to run/approve).

### 3.2 env-LR-02 — budget kill-switch provisioning

- **Finding.** The ~$10 hard budget ceiling is designed as a real kill switch (budget → Pub/Sub → a
  Cloud Function that disables billing), not alerts alone (`F-BUDGET-1`, `docs/budget-killswitch.md`).
  Confirm it is actually provisioned in the live project, not just documented.
- **Recommendation.** Verify/provision the kill-switch Cloud Function + budget-topic wiring so a runaway
  cost genuinely halts billing.
- **What I need from you.** Confirm it's live, or authorize me to draft the provisioning steps.

### 3.3 maint-LR-02 — `MAINTENANCE_INTAKE_IP_HASH_SALT` secret

- **Finding.** Public maintenance intake rate-limits/dedupes by a hashed client IP; the hash needs a
  server-side salt secret. It is not set in prod.
- **Recommendation.** Set `MAINTENANCE_INTAKE_IP_HASH_SALT` in Secret Manager before enabling public
  intake, so the IP hashing is not guessable.
- **What I need from you.** Provision the secret (I'll give the exact name + a generated value approach).

### 3.4 auth-LR-05 — confirm prod `NODE_ENV` / demo-auth off

- **Finding.** The prod fence forces the cloud model and disables demo auth when
  `NODE_ENV==="production"` (`F-PROD-CLOUD-MODEL`). Worth a positive confirmation on the live revision.
- **Recommendation.** Confirm at the next deploy that the serving revision runs `NODE_ENV=production`
  (unauth `/`→307 sign-in; a demo cookie is rejected). The deploy smoke already covers most of this.
- **What I need from you.** Nothing extra — folded into the §1.1 deploy verification.

---

## 4. Accepted — no action unless you reprioritize

These were considered and consciously accepted; they are recorded so they don't resurface as
surprises. None breaches a safety boundary.

- **Concurrent-pending "leftover-after-sent" residual.** After the double-send fix, a leftover race
  confirmation created just before a real send completes is indistinguishable from a deliberate
  follow-up. It is operator-gated (a human still confirms every send) and never an autonomous send.
  Full detail: memory `gmail-concurrent-pending-double-send-window`.
- **Owner-ruled accepts (no code, 2026-07-20):** Editors keep single-operator exact-confirm send
  (`F-AUTH-2`/`F-COMM-2`); bulk high-risk approval accepted as-is (`F-APPR-6`); the last-Admin race is a
  known non-concurrency-safe limitation the break-glass script recovers (`F-ADMIN-3`); `F-ENV-3`
  accepted. The renewal Sheet stays read-only (augment, never overwrite the team's source of truth).
- **`mark-all-read` caps at 25.** Clicking "Mark all read" marks up to 25 unread at a time (the bell's
  uncapped total was fixed separately; this list read is still capped). Pre-existing, low-impact; a
  small follow-up if it annoys you in practice.

---

## Appendix — where the underlying detail lives

- Owner decisions on the 65-finding audit: `docs/v1-remediation-decisions-2026-07-20.md`
  (`F-V1-REMEDIATION-DECISIONS`).
- Fact ledger + open questions: `docs/facts.md` (read first).
- Resume pointer + baseline: `docs/loop-state.md`.
- Session history: `docs/status.md`.
- By-hand feature test: `docs/manual-qa-walkthrough-2026-07-21.md`.
