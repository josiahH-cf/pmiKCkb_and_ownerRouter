# Client and vendor asks — 2026-07-29

**For: PMI KC Metro (owner). Date: 2026-07-29. Phase: live production.**

This is the redacted action list of external and owner-supplied inputs that can be stated safely from
the repository. It does not reproduce secret values or the browser-only audit response. Items whose
exact selected audit receipt is unavailable stay conservative/closed and are labeled that way; this
packet never fills in a customer value, address, endpoint, project id, or legal conclusion by inference.

Every item is written the same way so it can be acted on without re-reading anything:

- **Type** — either **Owner self-serve** (you do it; no one else is waiting on you) or
  **External ask** (a message goes out and we wait on a reply).
- **Who** — the exact recipient.
- **Blocking** — `Phase-blocking` means the live production phase cannot finish without it;
  `Feature-scoped` means only the named feature waits.
- **What to ask** — the substance, in engineering terms.
- **Exact wording** — a message you can copy and send as-is.
- **What it unblocks** — the feature, named.
- **The moment it lands** — what we do next, and how long the tail is.

**Two rules for everything below.** No credential, key, token, account number, or customer record
ever goes into a message, a document, or this repository — secret values go straight into Google
Secret Manager and nowhere else. And nothing in this list changes the safety boundaries recorded at
the end of this document.

---

## Status at a glance

| ID  | Ask                                       | Type             | Who                | Blocking       |
| --- | ----------------------------------------- | ---------------- | ------------------ | -------------- |
| D38 | RentVine documented write endpoint        | External ask     | RentVine           | Phase-blocking |
| D39 | RentVine resident portal / text semantics | External ask     | RentVine           | Feature-scoped |
| D40 | RentCast free-tier key                    | Owner self-serve | You                | Phase-blocking |
| D41 | Dotloop OAuth app registration            | Owner self-serve | You                | Phase-blocking |
| D42 | LeadSimple key + endpoint contract        | External ask     | LeadSimple         | Phase-blocking |
| D43 | Updated renewal template artifact         | External ask     | Chasity            | Feature-scoped |
| D45 | Tool-access list + in-scope Sheets        | External ask     | Dan                | Feature-scoped |
| D57 | Renewal recipient rule (confirmation)     | External ask     | Dan                | Pre-live gate  |
| D58 | RentVine field map (after our re-derive)  | External ask     | Dan                | Sequenced      |
| D52 | Deposit ledger of record                  | External ask     | Dan                | Low priority   |
| D53 | Repair / bid sign-off dollar threshold    | External ask     | Dan                | Low priority   |
| D54 | Smart-lock / key provisioning workflow    | External ask     | Dan                | Low priority   |
| D55 | One-time review of indexed KB contents    | External ask     | Dan                | Feature-scoped |
| D21 | Shared-credential hygiene recommendation  | External ask     | Dan                | Advisory       |
| D44 | Official brand artwork (SVG/PNG)          | External ask     | Owner/brand source | Feature-scoped |

The activation-only owner inputs below are equally real even when they are not vendor messages:

| Owner input / decision | Exact value still required                                                                                                                                                                                   | Scope                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| S40 / D11              | Dedicated Demo project id + number, region, Firestore database, storage, Pub/Sub, runtime identity, Firebase Auth project/domain, KB corpus ids, OAuth origin/audience, and rollback-safe migration approval | Environment cutover         |
| S51 / D13              | Internal managed operator notification destination                                                                                                                                                           | Monitoring activation       |
| S52 / D01              | Measured baseline, alert threshold, hard-stop ceiling, and disposition of `adept-primacy-499822-d7`                                                                                                          | Any cost-bearing cloud step |
| S53 / D29              | Exact managed `KB_APPROVAL_SENDER`, if it cannot be recovered from approved non-secret config                                                                                                                | Internal notices            |
| S53 / D30              | Maintenance intake token secret and IP-hash salt in Secret Manager plus runtime access binding                                                                                                               | Resident intake activation  |
| S53 / D32              | `KB Proposed — Comp basis` column plus fresh authenticated spreadsheet id/tab confirmation                                                                                                                   | Sheet write-back activation |
| S53 / D34              | One Vendor company/contact supplied through a secure out-of-repo channel                                                                                                                                     | Vendor lifecycle pilot      |
| S53 / D36              | `roles/discoveryengine.admin` grant to the exact runtime service account                                                                                                                                     | S36 provisioning            |
| S47 / D16              | Approved resident notice/troubleshooting/charge wording and a non-secret fallback contact route                                                                                                              | Resident intake             |
| D44                    | Official approved SVG and PNG artwork, provenance, and usage approval                                                                                                                                        | Brand surfaces              |

Before any command below that reads live Google state or mutates cloud configuration, run
`npm run preflight:adc`. If it fails, the owner runs `npm run auth:session` interactively and reruns
the preflight. A stale token never authorizes a personal-account workaround.

D38, D39 go out as **one** message. D45, D52, D53, D54, D55, D21 and the D57 confirmation can go to
Dan as **one** batch. D58 is deliberately held until after our own re-derivation — see item 8.

---

# Part 1 — External asks

## 1. RentVine — write endpoint and resident channel (D38 + D39)

**Type.** External ask. **Who.** RentVine support or their API/partner team, for the `pmikcmetro`
account. **Blocking.** D38 is phase-blocking; D39 is feature-scoped to the RentVine resident channel.

**Send these as one message.** They go to the same team, and asking twice costs a round trip.

### What to ask, and why each part matters

**The write endpoint (D38).** RentVine is read-only to us today by contract — the client
(`lib/integrations/rentvine/client.ts`) issues `GET` only, against `leases/export`, `leases/{id}`,
`properties/{id}`, `portfolios/{id}` and `contacts/{id}`. A read-only live check on 2026-07-22
confirmed no write surface was exposed to us. Four mutating RentVine actions are registered in
`lib/integrations/action-registry-seed.ts` and all four are `production_allowed: false`:

| Action key                          | Registry state                                        |
| ----------------------------------- | ----------------------------------------------------- |
| `rentvine.lease.renewal_writeback`  | `readiness: Planned`, `evidence_status: Undocumented` |
| `rentvine.work_order.create`        | `readiness: Needs Connection`, evidence Documented    |
| `rentvine.work_order.update_status` | `readiness: Needs Connection`, evidence Documented    |
| `rentvine.work_order.assign_vendor` | `readiness: Needs Connection`, evidence Documented    |

The renewal write-back is the one with no documented contract at all, which is why S30
(`docs/feature-suites/rentvine-write-activation.md`) is specified but has no live provider. The three
work-order actions have documented shapes but each requires a credential carrying the work-order
write role — so the same message should confirm whether our existing API credential has it.

We need four specific things, not a general "does write exist" answer:

1. **The endpoint** — method and path for updating a lease renewal.
2. **The request/response contract** — exact field names accepted, and what a success response
   returns, so we can read the write back and verify it.
3. **Idempotency semantics** — whether the endpoint accepts an idempotency key, and precisely how a
   repeated identical request behaves. Our executor (`RentvineRenewalExecutor` in
   `lib/lease-renewal/execution/providers.ts`) already does read-drift-check, compare-and-set,
   field-by-field readback and reconcile-by-idempotency-key. It needs to know which of those the
   endpoint supports natively so we compose the rest without weakening the guarantee.
4. **The authoritative field mapping** — which written fields correspond to the lease export fields we
   already read.

**The resident channel (D39).** S47 (`docs/feature-suites/resident-maintenance-intake.md`) ships a
tokenized web intake regardless; the RentVine portal/text channel is the preferred second path and is
the only part waiting. `rentvine.renewal.portal_message.send` sits at
`evidence_status: Vendor-Confirmation-Required` for exactly this reason. We need the interactive
endpoint, the inbound reply/webhook semantics including how we authenticate a delivery, and how a
resident account maps securely to a lease and unit.

### Exact wording to send

```text
Subject: API documentation request — write endpoints and resident channel (account: pmikcmetro)

Hello,

We are PMI KC Metro, RentVine account "pmikcmetro". We run a read-only integration against
your API today and are ready to extend it. Could you point us at the documentation for the
following? We are not requesting anything outside our own account's data.

1) Lease renewal write

   a. The documented endpoint (method and path) that updates a lease renewal — new rent,
      renewal effective date, new lease end date, and any renewal fee.
   b. The request and response contract for that endpoint: the exact field names it accepts,
      and what a successful response returns so we can read the result back and verify it.
   c. Whether it supports a conditional or compare-and-set update — an expected current
      value, a version, or an ETag — so we never overwrite a value that changed between our
      read and our write.
   d. Whether it accepts an idempotency key, and exactly how a repeated identical request
      behaves (same result returned, duplicate created, or rejected).
   e. The authoritative field mapping between the lease export rows we read today and the
      fields this endpoint writes.

2) Work-order write permissions

   Our integration also needs to create a work order, update its status, and assign a vendor.
   Could you confirm whether the API credential on our account currently carries the
   work-order write role, and if not, how that role is enabled?

3) Resident portal / text channel

   a. The documented endpoint for sending an interactive message to a resident through the
      portal or text channel.
   b. The reply and webhook semantics: how an inbound resident reply reaches us, how we
      authenticate that the delivery genuinely came from RentVine, and whether events can be
      redelivered or replayed.
   c. How a resident account is securely mapped to a specific lease and unit for that channel.

If any of these sit on a different plan than ours, please tell us which plan carries them.

Thank you,
PMI KC Metro
```

**What it unblocks.** D38 unblocks S30 renewal write-back and the four RentVine write action keys.
D39 unblocks the S47 RentVine resident channel only; the tokenized web intake ships without it.

**The moment it lands.** The documented endpoint value goes into runtime configuration (never into
git), the live provider is built against the confirmed shape, and the gate flip is one reviewed change
per action: seed entry to `evidence_status: "Documented"` + `readiness: "Approved for Execution"` +
`production_allowed: true`, the key added to **both** `EXECUTABLE_ALLOWLIST` copies
(`scripts/seed-action-registry.ts` and `lib/admin/migration-readiness.ts`), and the pinned schema and
allowlist tests updated in the same change. Every write still runs one at a time through the human
approval queue with an exact preview, a receipt, and a rollback path. Expect roughly a day of build
per action after the contract arrives. You supply the endpoint/configuration and any protected
activation review; once D05's gates pass, the runner performs the routine application revision
deploy, candidate smoke, and exact-revision promotion.

---

## 2. LeadSimple — API key and endpoint contract (D42)

**Type.** External ask. **Who.** LeadSimple support, plus your own LeadSimple admin for the key.
**Blocking.** Phase-blocking.

**What to ask.** Two things that must arrive together. The key alone is not enough: the two registered
actions `leadsimple.process.update_stage` and `leadsimple.task.create` carry
`evidence_status: "Vendor-Confirmation-Required"`, and the schema in `lib/firestore/schemas.ts`
refuses `production_allowed: true` unless evidence is `Documented`. Only a vendor-confirmed contract
can honestly upgrade that. We deliberately do not guess a LeadSimple path — S35
(`docs/feature-suites/leadsimple-activation.md`) builds the live provider fail-closed with no endpoint
literal anywhere in the source.

### Exact wording to send

```text
Subject: API access and endpoint contract for our account

Hello,

We are PMI KC Metro. We are connecting an internal operations application to LeadSimple and
need two things to finish it.

1) An admin-enabled REST API key for our account. Please confirm which plan carries API
   access, and whether our current plan is sufficient.

2) The documented endpoint contract for two operations:

   a. Advance a process to a target stage. We need the base URL, the path and method, the
      request and response shape, and — importantly — whether the update can be made
      conditional on the process's current stage, so we never advance a process that someone
      else moved while we were reading it.

   b. Create a task. Base URL, path and method, request and response shape, and the fields
      for title, assignee, and due date.

   For both, we also need the read-back shape (how we confirm the change took) and whether an
   idempotency key is supported so a retry cannot double-apply.

We are only asking about our own account. If any of this sits behind a different plan, please
tell us which one.

Thank you,
PMI KC Metro
```

**What it unblocks.** S35 LeadSimple connector activation — process stage advance and task creation.

**The moment it lands.** The key goes into Secret Manager as `LEADSIMPLE_API_KEY` (never git); the
confirmed paths go into provider configuration; `evidence_status` moves
`Vendor-Confirmation-Required` → `Documented`; both keys flip through the same reviewed change and
both allowlists. Every run still passes the human preview-and-confirm gate.

---

## 3. Chasity — updated renewal template artifact (D43)

**Type.** External ask. **Who.** Chasity. **Blocking.** Feature-scoped, and narrower than it sounds.

**What to ask.** The exact updated renewal-template artifact, through the approved publication channel
(the shared Drive drop zone), as a file — not pasted copy in a message.

**Important scoping.** This gates only S43's **template-dependent output**, not the S43 workspace
build. The canonical Lease Renewal desk, the per-unit workspace, the data review, the owner decision
and the tenant offer all ship without it. With no active artifact, the versioned template slot renders
`Renewal template not supplied` and blocks only the documents that depend on the template. We do not
invent, reconstruct or paraphrase the missing copy, so there is no wrong-template risk in waiting.

### Exact wording to send

```text
Subject: Renewal template — current version for the app

Hi Chasity,

Could you send the current version of the renewal template as a file into the shared Drive
folder we use for approved documents? Any format is fine — the document as you actually send
it today is exactly what we want.

The renewal desk is built and working; the template is the last piece for the documents it
generates. Until it arrives the app shows "Renewal template not supplied" rather than guessing
at the wording, so there is no rush beyond the first live renewal that needs a document.

If there is more than one current version (for example a different one for a specific property
type), please send each and label which is which.

Thanks,
```

**What it unblocks.** S43 template-dependent output only.

**The moment it lands.** An Admin validates and approves the artifact into the versioned template
slot; the preview binds to that specific version, and the existing exact send-confirmation and receipt
rules apply unchanged. Same-day once the file is in the folder.

---

## 4. Dan — tool access and in-scope Sheets (D45)

**Type.** External ask. **Who.** Dan. **Blocking.** Feature-scoped.

**What to ask.** Two related items: the QuickBooks access posture, and the exact Google Sheets that are
in scope. "The tool-access sheet" has been an open item; naming the specific Sheets is the part that
actually unblocks work, because everything else in the renewal pipeline already keys off the one
operational renewal sheet.

Ask narrowly and only for what a named action needs. For QuickBooks that means **draft-only** — the
app's QuickBooks action is a draft-Bill create and nothing beyond it. Never ask for, and never accept,
authority to post, approve, pay, touch bank data, or write a ledger.

### Exact wording to send

```text
Subject: Two access questions — QuickBooks and which Sheets are in scope

Hi Dan,

Two things when you have a moment.

1) QuickBooks. The app has one QuickBooks capability: create a DRAFT bill for a vendor invoice
   so someone on your team reviews and posts it. It never posts, approves, pays, touches bank
   data, or writes to a ledger, and we are not asking for permission to.

   To set that up we'd need: which QuickBooks company file is the right one, whether you can
   authorize a connection limited to creating draft bills, and how vendors and expense
   accounts should map from our side to yours.

   If QuickBooks is not something you want connected yet, that's a fine answer — we just leave
   that one action switched off and everything else continues.

2) Google Sheets. Which sheets should the app treat as in scope, by name? We are working
   against the renewal tracking sheet today. If there are others the app should read (or that
   should stay strictly off-limits), naming them now saves us guessing later.

   For each one it helps to know: the sheet name, which tab, and whether the app should read
   only or ever write.

Thanks,
```

**What it unblocks.** Account-specific live integration planning for QuickBooks, and confirmed
read/write scope for any Sheet beyond the renewal tracker. Absence leaves only the dependent provider
action unavailable; nothing else waits.

**The moment it lands.** QuickBooks becomes a scoped connector task rather than an open question; any
newly named Sheet is added to the in-scope list with an explicit read-or-write posture.

---

## 5. Dan — renewal recipient rule (D57, confirmation only)

**Type.** External ask. **Who.** Dan. **Blocking.** No build waits on it, but it is not free-floating
either: `F-V1-REMEDIATION-DECISIONS` in `docs/facts.md` records a standing requirement that the owner
or Dan verifies the multi-tenant recipient **before real drafts reach residents**. So treat it as a
pre-live gate on the first live renewal notice, not as optional courtesy.

**What this is.** This is **not** an open question any more. The decision was made: To = the first
tenant on the lease, Cc = every other tenant on the lease. That behaviour is **shipped** —
`resolveRenewalRecipient` in `lib/lease-renewal/recipient-resolution.ts` takes the first authoritative
tenant email as `to` and every other distinct tenant email as `cc`, each with its own source pointer
back to the lease record. No address is ever invented; when no authoritative email exists the channel
returns `Needs Verification` and the draft refuses rather than guessing.

So the ask to Dan is a courtesy confirmation, phrased as "here is what it does, tell us if that's
wrong" — not "what should it do."

### Exact wording to send

```text
Subject: Heads-up on how renewal notices are addressed

Hi Dan,

Quick confirmation, no action needed unless something below is wrong.

When the app drafts a renewal notice, it addresses the first tenant on the lease and copies
every other tenant on that same lease. All addresses come from the lease record itself — the
app never types in or guesses an address, and if a lease has no email on file the draft stops
and flags it rather than sending to a best guess.

That means co-tenants always see the notice, which we assumed is what you want since they're
on the lease too.

If you'd rather it worked differently — one named contact only, or a different order — say the
word and we'll change it.

Thanks,
```

**What it unblocks.** No build work is waiting. What it does clear is the standing
`F-V1-REMEDIATION-DECISIONS` verification on the multi-tenant recipient, which stands between here
and the first live renewal notice to a real resident. A correction, if one comes, is a small change
to one resolver.

---

## 6. Dan — RentVine field map, after our re-derivation (D58)

**Type.** External ask, **sequenced behind our own work**. **Who.** Dan. **Blocking.** Sequenced.

**Do not send this yet.** The decision changed the order: **we re-derive the field map from a fresh
live RentVine export first, and only then does Dan confirm it.** Asking Dan to confirm field names
against a map derived from a single 2026-07-22 export would be asking him to rubber-stamp work we
have not refreshed.

**Step 1 — our work (no ask).** Re-run the read-only live discovery:

```bash
npm run auth:session
npm run discover:rentvine-fields -- --live --limit 25
```

This is `scripts/discover-rentvine-fields.ts`. It is read-only, free, and emits **paths, presence and
coverage only** — every leaf value is reduced to a type/shape marker, so no email, name, rent or
address is ever printed or written, including into the gitignored proof file. The output is compared
against the existing map at `docs/products/rentvine-live-field-map-2026-07-22.md`, which recorded the
tenant email at `lease.tenants[].email` (25/25), the property-owner email at
`portfolio.owners[].email` (25/25), lease end at `lease.endDate` and current rent at `unit.rent`. Any
path that moved, any coverage that dropped, and any newly appearing field is written up as the
delta.

**Step 2 — the ask.** Only once the fresh map exists does Dan get a short, concrete confirmation
request, and it should quote the **purpose** of each field rather than the raw path, because the path
is our problem and the meaning is his.

### Exact wording to send (after step 1 only)

```text
Subject: Quick confirmation on where the renewal app reads its numbers

Hi Dan,

We re-pulled the field layout from RentVine so we're working from current data rather than a
months-old snapshot. Before the first live renewal notice goes out, could you confirm we're
reading the right things?

For each lease, the app takes:

  - the tenant contact(s) from the tenant records on the lease
  - the property owner's contact from the portfolio's owner records
  - the lease end date from the lease's end date field
  - the current rent from the unit's rent field

Two questions:

  1. Are those the fields your team treats as authoritative, or does anyone maintain the real
     number somewhere else (a sheet, a note field, a different record)?
  2. Is there any case where the rent on the unit record is not the rent actually being paid?

If it all looks right, a "yes, that's correct" is all we need.

Thanks,
```

**What it unblocks.** Confidence before the first live renewal draft, and the field-mapping half of
the RentVine write contract. It is not a build blocker.

**The moment it lands.** A confirmed map is recorded; a correction is a change to the field map
constant, not to the pipeline.

---

## 7. Dan — low-priority questions, batch whenever convenient (D52, D53, D54)

**Type.** External ask. **Who.** Dan. **Blocking.** None. Each already has a safe working default that
is visibly provisional in the app, so nothing degrades while these sit unanswered.

| ID  | Question                                          | What we do meanwhile                                                                                         |
| --- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| D52 | Where the deposit ledger of record lives          | The move-out packet surfaces a `Needs Verification` pointer for it                                           |
| D53 | Repair / bid owner sign-off dollar threshold      | A provisional $500 threshold flags lines for sign-off, and the threshold itself renders `Needs Verification` |
| D54 | Smart-lock / key provisioning workflow at move-in | The move-in checklist keeps a manual step; the workflow is not inferred                                      |

On D53: the provisional threshold lives at `PROVISIONAL_REPAIR_SIGNOFF_THRESHOLD_CENTS` in
`lib/move-out/evidence-packet.ts` and is overridable the moment a real number arrives — any deduction
line at or above the threshold flags "Needs owner sign-off", and the threshold is displayed as
unconfirmed so nobody mistakes it for policy.

On D54: the smart-lock provisioning workflow is deliberately **not** inferred from anywhere. The
sources that would hint at it are credential-bearing and hard-excluded at the ingest boundary by
construction, so the app keeps a manual checklist step instead of a guessed automation. Note that the
audit's recommended form for this one was a fifteen-minute screen-share with whoever actually does
it, rather than a written answer — the written question below is the cheap first pass; if the reply
is thin, book the walkthrough instead of trading messages.

### Exact wording to send

```text
Subject: Three low-priority questions, whenever you get a minute

Hi Dan,

None of these block anything — the app has a safe default for each and shows clearly that it's
unconfirmed. Answer when convenient.

1) Deposit ledger. When a security deposit is disposed of at move-out, where is the ledger of
   record — QuickBooks, RentVine, or a spreadsheet? Right now the move-out packet just flags
   "needs verification" rather than pointing anywhere.

2) Repair sign-off threshold. At what dollar amount does a repair or vendor bid need owner
   sign-off before it goes ahead? We're using $500 as a placeholder and labeling it as
   unconfirmed. Your number replaces it.

3) Move-in locks and keys. What's the actual process when a unit has a smart lock — who sets
   the code, when, and where does it get recorded? The app currently leaves this as a manual
   checklist step because we'd rather not guess at it.

Thanks,
```

**The moment they land.** D52 replaces a pointer with a destination. D53 is a one-constant change plus
flipping the threshold from provisional to confirmed. D54 turns a manual checklist step into a
documented workflow we can then decide whether to automate.

---

## 8. Dan — one-time review of indexed knowledge-base contents (D55)

**Type.** External ask. **Who.** Dan. **Blocking.** Feature-scoped to knowledge-base broadening.

**What changed.** The indexing default is now **deny**: nothing gets indexed into the knowledge base
until an Admin approves it into a named Space. Publication is already Space-bound and role-gated —
`publishTrustedContent` in `lib/publication/service.ts` carries a `spaceId` on every published resource
and refuses a caller who cannot access that Space. The new default means new material sits unindexed
until someone deliberately places it.

**The ask.** That covers everything from here forward. It does not cover what is already indexed.
Dan should review the existing indexed contents once, so the starting state is as deliberate as
everything after it.

### Exact wording to send

```text
Subject: One-time review of what the assistant can already read

Hi Dan,

We've changed how material gets into the app's knowledge base. From now on nothing is indexed
automatically — an admin has to deliberately approve a document into a specific area before the
assistant can use it. That's the safer default and it's now in place.

That handles everything going forward. The one thing it doesn't cover is what's already in
there from earlier setup.

Could you do a single pass over the current contents and tell us if anything should come out —
anything outdated, anything that shouldn't be broadly readable, or anything that was added for
testing and never removed? We'll send you the list in the app; it's a read-through, not a
project.

After that, the only way anything new gets in is when someone puts it there on purpose.

Thanks,
```

**What it unblocks.** Knowledge-base broadening onto a reviewed baseline rather than an inherited one.

**The moment it lands.** Anything Dan flags is removed from the index; the reviewed set becomes the
baseline, and every later addition goes through the Admin-approves-into-a-named-Space path.

---

## 9. Dan — shared-credential hygiene (D21, advisory)

**Type.** External ask, advisory. **Who.** Dan. **Blocking.** Nothing.

**Context, handled carefully.** An earlier review of PMI KC's operational spreadsheet found shared
logins stored in plain text in it. The decision for this phase is to **proceed** with knowledge-base
broadening and accept that risk, on the strength of the guard that already exists. Be precise about
where that guard sits: the Sheets reader fetches whatever tabs it is pointed at — with no tab list it
reads them all (`lib/google-sheets/read-client.ts`, which says so in its own doc comment) — and the
**ingest** connector boundary is what excludes them. `ingestTables` in
`lib/lease-renewal/ingest.ts` hard-excludes a credential-bearing tab so its cells never enter a
record, the counts-only manifest, or anything persisted, and a second content-signature scrub catches
credential values in tabs the fingerprint did not flag. That guard is real and unit-tested
(`tests/unit/lease-renewal-ingest.test.ts`, `tests/unit/lease-renewal-credential-guard.test.ts`).
What was **not** done — because the decision was to proceed rather than gate on it — is a
verification of that guard against the live sheet's current tab list. This item does not reopen the
decision; it does mean we must not claim more to Dan than we have verified.

What is worth doing anyway is a quiet, ordinary recommendation. Frame it as good practice, not as an
incident. Do not enumerate what was found, where it lives, or which logins are involved — in the
message or anywhere else.

### Exact wording to send

```text
Subject: Small suggestion on shared logins

Hi Dan,

Unrelated to anything urgent — a suggestion from working alongside your spreadsheets.

Shared logins that live in a spreadsheet are hard to rotate when someone leaves, and hard to
audit when something goes wrong. If it's ever convenient, moving the team's shared credentials
into a password manager (1Password and Bitwarden both do this well for small teams) makes
offboarding a one-click job and gives you a record of who used what.

On our side, anything that looks like a stored login is dropped at the boundary and never makes
it into what the app stores, indexes, or answers from — so nothing on our end depends on this.
It's just a good habit whenever you have a slow week.

Happy to help set it up if that would be useful.

Thanks,
```

**The moment it lands.** Nothing in the build changes. The existing exclusion guard stays exactly as
it is either way — this is defence in depth on their side, not a dependency on ours.

---

## Brand source — official artwork (D44)

**Type.** External ask. **Who.** The owner or person who controls PMI KC brand assets.
**Blocking.** Feature-scoped; copy/layout work continues with a neutral text mark, but final branded
surfaces do not claim approval.

Request the official SVG and PNG files, the intended light/dark variants, and confirmation that PMI
KC may use them in the app. Files travel through the approved secure artifact channel, not pasted as
base64 or copied from an unverified website. Until provenance and usage approval are recorded, no
runner redraws, traces, or guesses the logo. This row is conservative because the browser-only D44
selection receipt is unavailable; it is a named dependency, not a claimed completed decision.

---

# Part 2 — Owner self-serve

These two are **not** vendor asks. Nobody is waiting on a reply; you can complete both today. Both are
phase-blocking, so they are the highest-value hour on this page.

## 10. RentCast — sign up and place the key (D40)

**Type.** Owner self-serve. **Blocking.** Phase-blocking.

**What this unblocks.** Live rent comparables on a renewal. The adapter is already written and tested
(`lib/lease-renewal/providers/rentcast-market-comp-provider.ts`): it queries RentCast's long-term
rental-listings search, takes the **median** of the comparable rents as the point estimate and the
min/max as the range, and **fails closed** — any HTTP error, empty body, or fewer than three usable
comps returns `Needs Verification` with no numbers rather than a fabricated figure. It is display-only
reference next to the renewal; it never moves the offered rent.

### Steps

**1. Create the account and the key.** Sign up at `rentcast.io`, create an API key on the free tier,
and keep it on the clipboard — do not paste it into a document, a chat message, an email, or this
repository.

**2. Put it in Secret Manager.** The value goes to Secret Manager and nowhere else. These commands
are for Bash/WSL and are safe to rerun: they create the container only when it is absent, then add a
new version.

```bash
# Create the secret container only when it does not already exist.
gcloud secrets describe RENTCAST_API_KEY --project=pmi-kc-kb-prod >/dev/null 2>&1 ||
  gcloud secrets create RENTCAST_API_KEY \
    --project=pmi-kc-kb-prod \
    --replication-policy=automatic

# Add the value: paste it at the prompt, then press Ctrl-D. The key never touches a file on disk.
gcloud secrets versions add RENTCAST_API_KEY \
  --project=pmi-kc-kb-prod \
  --data-file=-

# Let the Cloud Run runtime identity read it
gcloud secrets add-iam-policy-binding RENTCAST_API_KEY \
  --project=pmi-kc-kb-prod \
  --member=serviceAccount:pmi-kc-kb-runtime@pmi-kc-kb-prod.iam.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor
```

**3. Tell us it is placed.** Say "RentCast key is in Secret Manager" — never the key itself.

### The paired change on our side — required, not optional

The deploy wrapper is a **closed allowlist**, and this is the step that silently breaks integrations if
it is skipped. In `scripts/deploy-demo-cloud-run.mjs`, `readRuntimeEnv` builds a fixed map that is
passed to Cloud Run with `--set-env-vars`, and `readRuntimeSecrets` binds exactly two secrets today
(`RENTVINE_API_KEY` and `RENTVINE_API_SECRET`, and only when `RENTVINE_API_BASE_URL` is set). Anything
not named in that wrapper is **dropped on every deploy**, no matter what is in Secret Manager.

So placing the key is necessary but not sufficient: the wrapper must be extended to bind
`RENTCAST_API_KEY` as a runtime secret in the same reviewed change that flips the action gate. The
application side is already wired — `lib/config/server.ts` reads `RENTCAST_API_KEY`, and
`.env.example` names it with no value.

### Still open on this item

These do not block placing the key; settle them when the adapter goes live:

- **Plan tier and rate limits.** The free tier is roughly 50 calls per month. That is fine for
  occasional lookups and not fine for bulk. Confirm the tier and its published rate limit before the
  first heavy day, and keep the usage inside the production cost ceiling defined by S52.
- **Search radius and minimum comp count.** The adapter defaults to a 2-mile radius, a 25-result cap,
  and a 3-comp minimum below which it fails closed. Those are reasonable defaults, not confirmed
  policy; they should be reviewed against a few real properties before the comps are shown to an owner.

**The moment it lands.** `rentcast.rental_listings.search` flips through the standard reviewed change —
seed entry to `Approved for Execution` + `Documented` + `production_allowed: true`, key added to both
`EXECUTABLE_ALLOWLIST` copies, pinned tests updated — plus the deploy-wrapper binding above. The
comparables source switches from hand-entry to live. The number stays reference-only; a person still
decides the rent and still sends the notice.

---

## 11. Dotloop — register the OAuth app and authorize (D41)

**Type.** Owner self-serve. **Blocking.** Phase-blocking.

**What this unblocks.** S34 e-signature: building the renewal loop from a template with property and
participant fields filled in, uploading the renewal document into it, and hearing back on a webhook
when it is signed so the renewal advances itself to complete — without sending anything.

### Steps

**1. Register the application** in the Dotloop developer console for the PMI KC account. You will get
a client ID and a client secret, and you will be asked for a redirect URI.

**2. The redirect URI.** Do not register the historical
`pmi-kc-kb-demo-kq6wuvpiva-uc.a.run.app` URL. S40 replaces that service with `pmi-kc-app`, and an
OAuth redirect must be stable and byte-identical. After S40 creates and verifies the final
Production origin, register:

```text
<FINAL_PRODUCTION_ORIGIN>/api/connections/dotloop/callback
```

Two things matter about this value. It must match `DOTLOOP_OAUTH_REDIRECT_URI` **byte for byte** — a
trailing slash difference is enough to fail the exchange. And it is the path S34 will serve: that
callback route does not exist in the app yet (`app/api/connections/[connectorId]/connect` is currently
a shell that performs no redirect and no token exchange). The app registration can begin now, but
the redirect value is not final until S40 records the verified `pmi-kc-app` origin; never substitute
a guessed URL.

**3. Place the client id and client secret in Secret Manager** after registration. Add the redirect
URI only after the final origin is verified. These are Bash/WSL commands and create containers only
when absent:

```bash
for NAME in DOTLOOP_OAUTH_CLIENT_ID DOTLOOP_OAUTH_CLIENT_SECRET; do
  gcloud secrets describe "$NAME" --project=pmi-kc-kb-prod >/dev/null 2>&1 ||
    gcloud secrets create "$NAME" --project=pmi-kc-kb-prod --replication-policy=automatic
  gcloud secrets versions add "$NAME" --project=pmi-kc-kb-prod --data-file=-
  gcloud secrets add-iam-policy-binding "$NAME" --project=pmi-kc-kb-prod \
    --member=serviceAccount:pmi-kc-kb-runtime@pmi-kc-kb-prod.iam.gserviceaccount.com \
    --role=roles/secretmanager.secretAccessor
done
```

After S40 records the final origin, run the same describe-or-create/version/binding pattern once for
`DOTLOOP_OAUTH_REDIRECT_URI`, entering the exact verified callback URL. Do not enter the placeholder
shown above.

The same closed-allowlist rule applies: `scripts/deploy-demo-cloud-run.mjs` must be extended to bind
these three names, or they will not reach the running service.

**4. Authorize once — after the callback ships.** The one-time authorization is a single click on the
Dotloop card in Connections. It cannot complete until the callback route exists, so the honest sequence
is: register and place credentials now (today), we ship the callback and the live token exchange, then
you click authorize once. Until then the Connections card correctly reports the connection as not yet
verified rather than pretending otherwise.

**The moment it lands.** Both `dotloop.loop.create_from_template` and `dotloop.document.upload` flip
through one reviewed change — both to `Approved for Execution` + `Documented` +
`production_allowed: true`, both keys added to both `EXECUTABLE_ALLOWLIST` copies, pinned tests
updated. Loop creation and document upload then run under exact Admin approval bound to the payload,
and a signed-loop webhook advances the renewal to complete. Tokens are stored as opaque vault
references only — never a raw token in a response, a log, or git.

---

# Part 3 — Suggested order

1. **At the next owner-present window:** run `npm run auth:session`, then confirm
   `npm run preflight:adc` is green. This is interactive and cannot be delegated.
2. **Before any cost-bearing cloud command:** supply S52's measured baseline/alert/ceiling values,
   the second-project disposition, and S51's operator destination. The current observed enforcement
   amount is not approved headroom.
3. **One message out:** RentVine, D38 + D39 combined (item 1). Longest expected reply time of
   anything on this page, so it should leave first among the external asks.
4. **One message out:** LeadSimple (item 2). Also phase-blocking, also a vendor round trip.
5. **Supply S40 identifiers/provisioning:** establish the final `pmi-kc-app` origin before registering
   the Dotloop callback URI.
6. **Owner self-serve after the cost gate:** place the RentCast key (item 10), begin Dotloop
   registration, and add the final redirect only after S40 verifies it (item 11).
7. **This week:** Chasity's template (item 3) and official brand artwork (D44).
8. **This week, one batch to Dan:** tool access (item 4), the recipient-rule confirmation (item 5), the
   three low-priority questions (item 7), the knowledge-base review (item 8), and the credential
   suggestion (item 9). Five short items in one conversation rather than five interruptions.
9. **After our re-derivation:** the RentVine field-map confirmation (item 6). Not before.

---

# Part 4 — What none of this changes

These hold regardless of which asks land, and no reply from any vendor or any person relaxes them:

- **No autonomous client-facing send.** Every email or message to an owner, tenant, or vendor is
  reviewed and confirmed by a person against the exact content being sent. Internal notifications to
  your own staff may send automatically; that is the only automatic send.
- **Generic, non-workflow mail stays closed.** The app cannot compose and send arbitrary email. Only
  specific, workflow-linked actions exist, and each is individually gated.
- **Company account only.** Every authentication path runs as a `pmikcmetro.com` identity or a service
  identity. No personal account is ever in an auth path.
- **No secrets, customer data, or guessed endpoints in git.** Secret values live in Secret Manager;
  the repository holds names only. No endpoint is ever invented — an undocumented endpoint stays
  unbuilt rather than guessed.
- **Every live effect is one attempt, idempotent, receipted and reversible.** One claimed attempt per
  action, a duplicate returns the stored receipt instead of acting twice, every result is read back and
  verified, and every mutation has a documented rollback.
- **Client-facing sends and system-of-record writes stay human-confirmed.** Approval is bound to the
  exact previewed payload. This does not change when a vendor contract arrives; the contract only
  determines whether the action can exist at all.
- **No cost-bearing cloud step runs until S52 records a non-null verified production ceiling.** Once
  active, spending stays inside that ceiling, with an operator alert below a separate armed hard stop.
  The currently observed legacy amount is enforcement state, not approved headroom.

---

## Where the detail lives

| This document           | Full internal detail                                                            |
| ----------------------- | ------------------------------------------------------------------------------- |
| D38 RentVine write      | `docs/feature-suites/rentvine-write-activation.md` (S30)                        |
| D39 Resident channel    | `docs/feature-suites/resident-maintenance-intake.md` (S47)                      |
| D40 RentCast            | `docs/feature-suites/market-comp-data.md` (S28)                                 |
| D41 Dotloop             | `docs/feature-suites/dotloop-esign-activation.md` (S34)                         |
| D42 LeadSimple          | `docs/feature-suites/leadsimple-activation.md` (S35)                            |
| D43 Renewal template    | `docs/feature-suites/lease-renewal-canonical-workspace.md` (S43)                |
| D57 / D58 Field mapping | `docs/products/rentvine-live-field-map-2026-07-22.md`                           |
| D52 / D53 / D54         | `docs/products/v1-process-qa.md`, `docs/products/move-in-move-out-process.md`   |
| Provider ask boundaries | `docs/client-checklist.md` ("Provider activation requests")                     |
| Production cost ceiling | `docs/feature-suites/production-cost-governance.md` (S52), `F-COST-CEILING-S52` |
| Non-secret identifiers  | `docs/environment-handoff.md`                                                   |
