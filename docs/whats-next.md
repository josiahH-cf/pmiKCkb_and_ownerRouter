# What's Next — Open Decisions, Directions, and Recommendations

**2026-07-29 supersession — this file is now history, not a to-do list.** The owner directed the
production phase after the 64-item production-unblock audit (round 1). The source questionnaire's
browser-local selections were not exported; the sanitized decision record therefore labels each
entry's provenance and leaves receipt-needed choices closed rather than inventing an answer. Current
execution truth is the
**Production Phase Authorization** in `AGENTS.md`, `F-PRODUCTION-PHASE-AUTHORIZED` in
`docs/facts.md`, `docs/loop-state.md`, and suites S51–S54. Outstanding client/vendor asks moved to
`docs/client-asks-2026-07-29.md`. Specifically resolved since this file was written:

- §3.1 Firestore backups/PITR — **DONE** 2026-07-29 and live-verified (`F-FIRESTORE-BACKUPS`):
  PITR on with a 7-day window, delete protection on, daily 7d + weekly 14w schedules.
- §3.2 budget kill-switch — **was already armed** since 2026-06-23; the ask to confirm it was
  stale. The chain is verified end to end. What changed instead is the ceiling and its failure
  behavior (D01, `F-COST-CEILING-S52`).
- §3.3 `MAINTENANCE_INTAKE_IP_HASH_SALT` — **re-scoped**: it is not a pure console step. The
  deploy wrapper forwards a closed allowlist, so the secret cannot reach the service without a
  paired code change. Owned by S53 together with `MAINTENANCE_INTAKE_TOKEN_SECRET`.
- §1.3 / §1.4 (`F-LEASE-6`, `F-LEASE-3`) — answered as D57 and D58; D58 changed the order, so we
  re-derive the field map from a fresh live export BEFORE asking Dan to confirm.
- §2.1 `F-AUTH-1` — authorized as D59, with the never-lock-out-provisioned-users invariant.
- §4 accepted residuals — the bulk high-risk accept is **reversed** by D60 in favour of the S45
  tightening; the concurrent-pending residual is **reopened** by D62 as a pre-production slice.

Keep this file for historical rationale only. It cannot reopen a settled decision.

**2026-07-28 supersession.** The UI/UX decisions in this document are no longer open. The owner
settled D-01–D-14 and authorized S40–S50; current execution truth is
`docs/ui-ux-recalibration-implementation-program-2026-07-28.md` plus `docs/loop-state.md`. Keep this
file for provider/client asks and historical rationale; it cannot reopen the environment or UI
program.

**Purpose.** This is a supporting inventory for remaining client/provider/infrastructure asks. Each
item uses **Finding → Context → Recommendation → What I need from you** so irreducible asks are
concrete rather than open essays.

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

| #   | Item                                                       | Type              | Blocked on                              | Default recommendation                                 |
| --- | ---------------------------------------------------------- | ----------------- | --------------------------------------- | ------------------------------------------------------ |
| 1.1 | Redeploy `main` to production (DONE 2026-07-21)            | Deploy            | Your authorization + fresh gcloud login | Done — prod serves it at rev rmruogj57                 |
| 1.2 | Demo/Production environment posture                        | Resolved program  | S40 implementation + owner provisioning | Demo owns safe rehearsal; Production becomes Live-only |
| 1.3 | F-LEASE-6: is the primary tenant always `tenants[0]`?      | Decision (Dan)    | One answer                              | Keep the all-tenants-Cc behavior we shipped            |
| 1.4 | F-LEASE-3: confirm live RentVine field names               | Decision (Dan)    | One answer                              | Confirm before any live renewal click-through          |
| 2.1 | F-AUTH-1: onboarding — no access until Admin assigns scope | Owner-gated build | Go-ahead + a deploy migration           | Build it, with the never-lock-out-admins invariant     |
| 2.2 | Product/UX recalibration                                   | Authorized build  | S40–S50 dependency order                | Execute the decision-complete program                  |
| 3.1 | env-LR-01: Firestore backups / PITR (**HIGH**)             | Infra             | Your console                            | Enable before any real client data lands               |
| 3.2 | env-LR-02: budget kill-switch provisioning                 | Infra             | Your console                            | Provision the real kill switch, not just alerts        |
| 3.3 | maint-LR-02: `MAINTENANCE_INTAKE_IP_HASH_SALT` secret      | Infra             | Your console                            | Set the secret before enabling public intake           |
| 3.4 | auth-LR-05: confirm prod `NODE_ENV` / demo-auth off        | Infra check       | 5-minute verification                   | Verify at next deploy                                  |
| 4.x | Accepted residuals / owner-ruled accepts                   | Known limitation  | Nothing (unless you reprioritize)       | Leave as-is; documented                                |

---

## 1. Decisions only you can make (these unblock the most)

### 1.1 Production redeploy — DONE (2026-07-21)

- **Status.** Done. `main` was redeployed to Cloud Run `pmi-kc-kb-demo` on 2026-07-21 via
  `npm run deploy:demo -- --budget-confirmed` (owner-authorized, fresh ADC session). Production now
  serves the completed remediation build (including the concurrent-pending double-send fix and the
  F-LEASE-6 all-tenants Cc) as revision `pmi-kc-kb-demo-rmruogj57-577c8d7b9d1a` at 100% traffic.
- **Verification.** Auth boundary HTTP-smoked green: unauth `/`→307, `/sign-in`→200, `/admin`→307,
  `/api/ask`→405. The retained rollback target is the prior revision
  `pmi-kc-kb-demo-rmrsg73yg-2bb353f9e7dc` (served `ead5da5`).
- **Next deploy.** Only needed when the next reviewed change lands. A routine application revision
  follows D05 after the full gate, a fresh `preflight:adc`, the non-null S52 ceiling, prior-revision
  capture, rollback preparation, and candidate smoke are green.

### 1.2 Demo/Production posture — RESOLVED 2026-07-28

- **Decision.** S40 separates environments: Demo runs the exact product with invented Demo data and
  optional explicit Live read-only/zero-effect context; Production becomes Live-only.
- **Safety.** No mixed projection, shared effect credential/store/receipt, unknown-mode→Live,
  autonomous client send, or guessed provider contract. Blue/green is Production revision promotion/
  rollback.
- **Tool disposition.** Retire shipped simulations/no-op Sample/Test tools without deleting
  automated tests, Demo parity, Vendor TOTP/security, rollback, or real provider seams.
- **What I need from you.** Only the exact independent Demo resource identifiers and the owner-run
  provisioning/migration/deploy after S40’s collision/dry-run/backup packet is green.

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

### 2.2 Product / UX recalibration — AUTHORIZED as S40–S50

The bullets below are historical inputs now absorbed into the decision-complete program. Execute the
suite that owns each item instead of choosing ad hoc from this list.

- **Drop the stale "V1 application" release banner** under S41/S49.
- **Relabel hardcoded personal names** to role/state labels under S41/D-14.
- **A guided "Next" control** on the renewal desk so it's obvious what to do after each action (medium).
  This directly answers your "is it obvious what to do next?" test — worth prioritizing.
- **Hide the V1 external-execution / readiness internals** off the standard renewal landing into Admin,
  so an operator sees the operator flow, not the plumbing (medium).
- **Desk/source/provider links** use S44’s exact-field and reviewed-provider-destination contract;
  never add a guessed convenience URL.
- **Connections connect-and-save walkthrough** belongs to S48/provider activation. Current
  Connections already has API-key/OAuth starts; preserve secret redaction and exact owner-run setup.
- **Dormant self-registration/TOTP/verification-code primitives:** S48/S49 explicitly do not invent a
  self-registration product. Preserve current Vendor TOTP/security ownership and delete only after
  proof or a later explicit onboarding suite.
- **PMI logo / favicon + red-dot notification badge.** Blocked on **you supplying the vector artwork**
  (SVG/PNG). Send the files and I wire them; per your standing note the ticket icon stays a plain
  "Report an issue" button, not the logo.
- **The renewal §H tenant / Dotloop UI cleanup** (medium).
- **Report-issue internal delivery** shipped under S39 as an internal-only metadata notification;
  it does not authorize client-facing or generic send.

**Smaller friction points the by-hand review map surfaced (mostly quick, honesty/clarity fixes).** The
full list is Appendix A of `docs/manual-qa-walkthrough-2026-07-21.md`; the ones worth deciding here:

- **Connections copy/flow** is owned by S48 and must reflect actual credential/OAuth/status behavior.
- **No-op Sample renewal preparation controls** retire under S43/S48, with S49 deletion proof.
- **Editor renewal desk/draft access** is settled and implemented under S43; provider send/write
  authority remains separate.
- **New staff onboarding has no in-app affordance** (no invite button; new users invisible until first
  sign-in). Recommend a small "how to add a teammate" hint on `/admin/users`, and reconsider as part of
  F-AUTH-1 (§2.1).

- **What I need from you.** No reprioritization for these items; the loop executes S40–S50 in the
  recorded dependency order. Artwork remains an independent asset dependency if/when that visual
  item is reached.

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
