# PMI KC delivery reconciliation — Wednesday 26 August 2026, 2:00 PM

Prepared 2026-08-25 against commit `ee9d847` and serving revision
`pmi-kc-app-rmt99ltia-9119a24bf706`. The blocker walkthrough with per-decision capture is
`docs/pmi-kc-blocker-decisions-2026-08-26.html`.

Time is settled: 2:00 PM, operator-confirmed and matching Todoist. The calendar copy does not carry
the meeting, which is a coverage gap in that one source and not a reason to re-open the time.

---

## 1. The short answer

Since 5 August the app has moved from "demonstrated" to "deployed and reconciled". Two of the eleven
fixes the client wrote down are live, the knowledge base went from one Space to eleven in production,
and the whole eleven-note list has been turned into project-native specifications rather than a
to-do list. Comparable rents went from unreachable to answering — but see §3.4 before demonstrating
them, because the last switch is still shut.

What has **not** moved is the thing that would let the app replace manual work: it still writes to
nothing. That is one vendor answer away, and the vendor answer is not ours to give.

The honest framing for the room: **the app is now correct about what it knows, and still narrow about
what it does.**

---

## 2. Deployment provenance — read this before claiming anything is live

"Built" and "deployed" are different states, and the matrix below only marks something live when this
chain closes:

| Link                                  | Evidence                                                                                                                                         | State    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| Working tree clean                    | `git status` — only untracked `output/`                                                                                                          | Verified |
| Local branch matches remote           | `main...origin/main`, no divergence                                                                                                              | Verified |
| HEAD commit                           | `ee9d847`, authored 2026-08-25 17:56:58 −0500 (22:56:58 UTC)                                                                                     | Verified |
| Serving revision created              | `pmi-kc-app-rmt99ltia-9119a24bf706` at 2026-08-25T23:01:26Z                                                                                      | Verified |
| No commits between them               | Four minutes elapsed; `ee9d847` is HEAD                                                                                                          | Verified |
| Traffic                               | 100% to that revision; four older revisions carry tags at 0%                                                                                     | Verified |
| Runtime config reaching the container | `ENVIRONMENT_KIND=production`, `ASK_DEMO_MODE=false`, `RENTCAST_MONTHLY_ALLOWANCE=50`, both Space maps carry 11 entries                          | Verified |
| Route behaviour                       | `/`, `/lease-renewal/live`, `/lease-renewal/live/desk`, `/connections`, `/approval-queue`, `/work` all 307 to `/sign-in`; `/sign-in` returns 200 | Verified |

**Caveat to state if pressed:** the revision carries no commit label, so the tie is by timestamp and
by the absence of intervening commits, not by an embedded SHA. That is strong but circumstantial.
Stamping the commit into the revision is a small improvement worth making.

**Second caveat:** four older revisions still hold named tags at 0% traffic. They serve no default
traffic but remain reachable at their tag URLs. Housekeeping, not a risk to the demo.

---

## 3. Reconciliation matrix

Chain per row: **request → development choice → application behaviour → deployment evidence → demo →
how to say it → gap.** Fifty-one raw request clusters were reconciled; this table groups them into
the deliverables worth talking about. Anything marked _not built_ is written up in full — the
specification exists, the code does not.

### 3.1 Live and demonstrable

> Nine rows. Each was challenged by three independent verifiers before it was allowed to stay here; two rows that were originally in this table were moved out after being refuted.

| #   | They asked for                                                                                                        | What we chose to build                                                                                                                 | What the app now does                                                                                                                                          | Deployed                                                                                                                                                                                              | Demo                                        | Say it like this                                                                                                                | Gap                                                                                                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | House numbers in addresses, so two leases on the same street can be told apart (N3)                                   | Three separate address composers existed; two right, two renewal paths wrong. Collapsed to one shared module rather than patching each | Every renewal surface renders the house number. The defect was key _order_, not truncation                                                                     | Live — S71 in `82d22af`, in the serving revision                                                                                                                                                      | `/lease-renewal/live/desk` → any lease card | "You told us addresses were missing house numbers. There were three copies of that logic and two were wrong. There is now one." | Whether note N8 (wrong resident) was the same root cause is **unanswered** — see Q1                                                                                             |
| L2  | Dates in chronological order (N2)                                                                                     | One ordering comparator shared by the queue and the attention fold, rather than sorting in each place                                  | Soonest end date first, undated last, stable tie-break                                                                                                         | Live — S70 in `82d22af`                                                                                                                                                                               | Same screen — the queue order               | "The list is ordered by what expires soonest, everywhere it appears."                                                           | The "not an active property" half of N1 is discovery-only, not enforced                                                                                                         |
| L4  | Ingest the templates and processes; the AI is half useful without them (7 Aug)                                        | Eleven knowledge Spaces rather than one                                                                                                | Eleven Spaces configured in production for both Drive folders and the search index                                                                             | Live — verified on the serving revision. **This was silently broken**: the production env file carried one Space while the dev file carried eleven, and the deploy ships that file as a replacing map | `/spaces`                                   | "The knowledge base is eleven Spaces, not one. We found and fixed a deployment fault that had been quietly serving one."        | New parity test now fails the build if the two ever diverge again                                                                                                               |
| L5  | Never let the AI make something up (23 Jul, restated 7 Aug)                                                           | Refusal is a product behaviour, not a prompt instruction                                                                               | Answers refuse rather than speculate when no source supports them                                                                                              | Live — production forces the cloud model and disables demo auth by config                                                                                                                             | `/ask` — ask something unsupported          | "If it does not have a source, it says so. That is enforced in code, not asked of the model."                                   | The QA note that answers "looked deterministic, not AI" came from a local session where a stand-in model runs. In production it is the real model — worth correcting explicitly |
| L6  | Feedback button for bugs, ideas, and what works; dictation instead of typing; no screenshots needed                   | Reused the existing recorder and speech seam rather than a new intake                                                                  | One feedback dialog, optional dictation, page context attached automatically, audio discarded on every exit                                                    | Live — S65/S67 in `77c757c`, in the serving revision                                                                                                                                                  | Feedback button, any page                   | "Report it in the app. It attaches the page context, and you can talk instead of type."                                         | Dictation outside Chrome needs an up-front notice — still open                                                                                                                  |
| L7  | Show who signs in, how long they work, assign tasks with timestamps (7 Aug — the operator's stated biggest time sink) | App-owned tasks and explicit user-started work sessions, deliberately not content surveillance                                         | My work and Admin team work surfaces, idle and correction handling, 12-month retention                                                                         | Live — S68 in `b883763`, in the serving revision                                                                                                                                                      | `/work` and `/admin/team-work`              | "You said your biggest time sink is verifying the remote team actually did the work. That is what this is."                     | Time-per-task benchmarks are not built                                                                                                                                          |
| L8  | Version control and one-click rollback on the spreadsheet, so a bad edit reverts                                      | Backup-first policy before any write feature                                                                                           | A verified restorable backup exists and is the precondition for write-back. **One-click rollback does not exist** — say "a restorable copy", never "one click" | Partly — the backup and the precondition are real; the rollback control is not built                                                                                                                  | —                                           | "Nothing writes to the sheet today. Before anything ever does, there is a verified restorable copy."                            | The literal ask was one-click rollback. Do not claim it. See W2                                                                                                                 |
| L9  | Nobody can break anything; leave write access off until data proves correct                                           | Named-key activation: every external action is individually gated in a committed registry                                              | 41 actions defined, 6 on, 35 off                                                                                                                               | Live — read directly from `lib/integrations/action-registry-seed.ts`                                                                                                                                  | `/admin` → runtime actions                  | See §4 for the exact wording                                                                                                    | —                                                                                                                                                                               |
| L10 | The cost ceiling you were told about is actually enforced                                                             | The emergency spend stop is a function that disables billing, not just an alert                                                        | Runs on a supported runtime, and has an end-to-end proof of life for the first time                                                                            | Live — redeployed 2026-08-25T23:48Z after byte-for-byte source verification; logged `costAmount 1 USD < cap 100; no action`                                                                           | —                                           | "The spend stop is real and we proved it responds, rather than assuming it."                                                    | No scheduled canary; the check was manual                                                                                                                                       |

### 3.2 Partly there

| #   | They asked for                                                                                   | State                                                                                                                                                                     | Gap                                                                             |
| --- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| P1  | An operator can move a lease front to back with buttons at every step (round 2)                  | The desk is clickable per lease with a recorded stage and a clear next action. The step model is the app's, not the team's                                                | The team's six steps are not written down anywhere — **Q2**                     |
| P2  | Owner name, expiration date and renewal date on the list and detail page (7 Aug)                 | Dates and addresses are on both. Owner resolution exists for notice drafting                                                                                              | Owner name on the renewal row is not confirmed built                            |
| P3  | Attach trend and comparable data with source links instead of screenshotting (5 Aug)             | Comps and 24 months of trend history are both retrievable and live                                                                                                        | Whether a draft that claims an attachment actually carries one is unverified    |
| P4  | Scheduled refresh, because the app shows live-but-stale records (5 Aug)                          | More is built than assumed: the desk renders exactly one of four currency states and **pauses composing and recording past fifteen minutes** while still letting you read | Nothing refreshes proactively; data is only current when someone loads the page |
| P5  | Set the tenant form link once instead of pasting it into every lease (N5)                        | Specified (S72)                                                                                                                                                           | Not built                                                                       |
| P6  | Maintenance intake on a channel tenants already use, with an acknowledgement they may be charged | Tokenized resident intake exists; owner notice drafting is live and draft-only                                                                                            | The chatbot and the charge acknowledgement are not built                        |
| P7  | Real connect actions for the document platform and the lead tool                                 | Scaffolding and the app-side seam are built                                                                                                                               | Both need a vendor-side registration that is not ours                           |

### 3.3 Specified, not built

| #   | Note                                                                                                             | Suite | Why it is not built                                                                                                |
| --- | ---------------------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------ |
| N1  | Renewal page must match the team's six steps; comps first (N10, N7)                                              | S72   | Blocked on the team's actual step list                                                                             |
| N2  | Current rent is wrong (N6)                                                                                       | S73   | **Highest-integrity item on the list**: today a disputed figure can still carry a "verified" badge                 |
| N3  | Change the tenant message wording (N9)                                                                           | S74   | Ready to build; also gates a channel claim so the app only says both channels went out when they did               |
| N4  | Waiting-on state, last-followed-up, auto-send (N11)                                                              | S75   | Auto-send is answered as not possible under the draft-only rule; the waiting-on and follow-up halves are buildable |
| N5  | Rent input rejects a dollar sign; required-field errors hang; jargon leaks into user-facing errors (7 Aug)       | —     | Small, real, and unscheduled                                                                                       |
| N6  | Resident benefit mandatory; pet pricing by breed and weight; assistance-animal exemption; processing fee (7 Aug) | —     | Belongs with the template work                                                                                     |
| N7  | PadSplit runs on a separate platform and needs its own workflow (7 Aug)                                          | —     | Not started; the client owns a year-end process definition                                                         |
| N8  | Route the app's questions to operations, not to the principal (5 Aug)                                            | —     | Not built                                                                                                          |

### 3.4 One flip away — read this before demoing comps

**Do not demonstrate a live comparables lookup on Wednesday.** An adversarial re-check of my own
claim caught this, and it would otherwise have failed in front of the client.

Everything around comparable rents is real and deployed: the vendor plan is Active, the key is in
Secret Manager and bound, both endpoints returned 200 on a controlled check on 25 August, the adapter
is built and unit-proven, the monthly counter, per-address cache, 80% warning and hard stop all
exist, and the serving revision is configured with the provider and the allowance.

But the action key the in-app route checks — `rentcast.rental_listings.search` — is
`production_allowed: false`, readiness `Planned`. `app/api/lease-renewal/market-comps/route.ts:96`
asserts that key before doing anything. **An operator clicking for comparables on production today
gets a refusal, not a number.**

This is not an oversight in the bad sense. That flip is on the protected-path list, which
`docs/loop-state.md` explicitly says is "prepared and surfaced, never pushed". It was correctly
prepared and then nobody made the call. The gate's own recorded reason for being shut — unconfirmed
tier and limits — has since been satisfied and measured.

**Decision D14** in the blocker doc. If it is opened before Wednesday, comps become the strongest
thing in the demo. If not, describe the capability and show the evidence rather than clicking it.

### 3.5 Blocked outside our control

| #   | Item                      | Who                  | State                                                                                                                                                                                                  |
| --- | ------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| W1  | RentVine write endpoint   | Vendor, via PMI      | The key reads fine. There is no documented write endpoint and we will not guess one against live client leases. **This is the single biggest unlock on the list.**                                     |
| W2  | Spreadsheet write-back    | Decision, not vendor | Built and switched off on purpose: the contract wants an atomic row transaction, a status ledger, a tombstone and cell versioning. The Sheets API offers fixed-range value writes and none of the rest |
| W3  | Product name              | PMI                  | Still a placeholder in the interface, the docs, and every drafted email                                                                                                                                |
| W4  | Per-owner contact routing | PMI                  | Still lives in one person's head                                                                                                                                                                       |

### 3.6 Work with no request — worth naming before someone else does

Substantial surfaces exist that no meeting asked for: the vendor portal and its lifecycle, the Gmail
inbox-zero admin surface, the migration console, Space self-provisioning (deployed disabled), the
publication-policy subsystem, and the internal audit machinery. Some are genuinely useful
infrastructure. The point is only that if a stakeholder clicks into `/admin` they will see things
nobody asked for, and it is better to have an answer ready than to improvise one.

---

## 4. The question that will be asked: "what can it actually send?"

Read from the committed registry on 2026-08-25, not from a summary of it. 41 actions defined, six
enabled:

1. Read a mailbox
2. Reply to a thread — **payload confirmed by a person, one at a time**
3. Apply a label
4. Create an unsent renewal draft
5. Create an unsent maintenance owner-notice draft
6. Notify our own internal staff

**The only thing the app sends by itself goes to us.** Everything that reaches an owner or a resident
is either a draft a person opens in Gmail and sends, or a reply a person confirms. It writes nothing
to RentVine and nothing to the spreadsheet. The renewal draft path holds only the compose scope — the
send scope is absent, so sending is not merely switched off, it is unavailable.

This directly answers the 5 August assurance and it is the strongest trust statement available.

---

## 5. Agenda — sequenced backward from 2:00 PM

**Before the meeting**

| Time     | Do this                                                                                                                                                                                                                 |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| By 12:30 | Sign in to the live app as admin and load `/lease-renewal/live/desk`. Confirm leases render and the data-currency banner is not in its expired state. If it is, reload once — the point is to know before the room does |
| By 12:45 | Open a lease and walk the comparables step once. This is the newest capability and the one most worth not improvising                                                                                                   |
| By 13:00 | Open `docs/pmi-kc-blocker-decisions-2026-08-26.html`, fill in the run details, and keep it open in a second window to record decisions live                                                                             |
| By 13:15 | Decide your position on the end-of-September commitment (D09) before they ask. Do not discover it in the room                                                                                                           |

**The meeting — 45 minutes**

| Minute | Item                                                                                                            | Purpose                                                 |
| ------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 0–3    | Restate the outcome in their words: one place to work, less time wrestling tools, nothing sent without a person | Anchor on their goal, not our sprint                    |
| 3–8    | What changed since 5 August, in their language — addresses, ordering, comps live, knowledge base                | Earn the rest of the meeting                            |
| 8–22   | **Live demo** (§6)                                                                                              | Show, do not describe                                   |
| 22–27  | What it can and cannot do — the six enabled actions                                                             | Pre-empt the trust question and answer it with evidence |
| 27–33  | The four fixes still open, and the one vendor blocker                                                           | Name gaps before they find them                         |
| 33–41  | **Decisions** — work the client-facing group in the HTML doc, recording as you go                               | This is the actual point of the meeting                 |
| 41–45  | Restate the end-of-September commitment, and agree the next finite result with an owner and a date              | Leave with one thing that can be checked                |

---

## 6. Demo walkthrough, in the order to present it

| #   | Screen                        | Do                                                                           | Say                                                                                                                                                                                               | What could go wrong                                                                                                                     |
| --- | ----------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `/sign-in`                    | Sign in with the workspace account                                           | "One URL, your Google account, nothing else to remember."                                                                                                                                         | Popup blockers: a redirect fallback now exists, so it recovers in-tab rather than dead-ending                                           |
| 2   | `/lease-renewal/live/desk`    | Let the queue render                                                         | "Real leases, real dates, ordered by what expires soonest."                                                                                                                                       | Requires admin. If sources are unconfigured it shows a panel pointing at `/connections` rather than an empty list                       |
| 3   | Same screen                   | Point at an address                                                          | "You told us house numbers were missing. Here they are. There were three copies of that logic and two were wrong — there is one now."                                                             | None; this is the safest visible win                                                                                                    |
| 4   | Same screen                   | Point at the data age banner                                                 | "It tells you how old this data is, and past fifteen minutes it stops letting you act on it rather than pretending it is current."                                                                | If it _is_ expired, that is a better demo, not a worse one — it is the feature                                                          |
| 5   | Open one lease                | Walk the current steps                                                       | "This is where the six-step question comes in — these are our steps, not yours yet."                                                                                                              | Leads naturally into decision D01                                                                                                       |
| 6   | Comparables step              | **Do not click it unless decision D14 was taken first.** Describe it instead | "Comps are wired to a real provider and we have run them against your addresses. The last switch is a reviewed change I have not made yet, so I will show you the evidence rather than click it." | If the gate is still shut, clicking returns a refusal. If D14 was taken before Wednesday, this becomes the strongest moment in the demo |
| 7   | Draft step                    | Preview, do **not** create                                                   | "It composes. It does not send. You open it in Gmail and press send."                                                                                                                             | Do not press create unless you intend a real draft                                                                                      |
| 8   | `/work` or `/admin/team-work` | Show assignments and sessions                                                | "You said your biggest time sink is verifying the remote team actually did the work."                                                                                                             | Will look sparse if nobody has used it — say so rather than letting it read as broken                                                   |
| 9   | Feedback button               | Open it, show dictation                                                      | "Anything you find, report it here. It attaches the page for us and you can talk instead of type."                                                                                                | Dictation outside Chrome is not announced up front — known gap                                                                          |

**What is actually in production, counted 25 August.** The renewal desk reads live leases from
RentVine, and one lease carries recorded progress. `/work` has six tasks. `/spaces` has twelve.
`/processes` has six definitions. Four lease baselines exist, which is the test set.

**Screens that will render empty:** the approval queue, maintenance tickets, and notifications. Their
collections do not exist in production at all — nothing has ever been routed through them. The
approval queue was one of the largest asks on 5 August, so this will be noticed. Either skip those
screens or open with why they are empty; do not let the room reach its own conclusion.

**Rule for the demo:** if a screen looks thin, say why before they ask. Thin-because-unused reads
completely differently from thin-because-broken, and only one of those is true.

---

## 7. Gaps, owners, and the next decision

Full walkthrough with capture: `docs/pmi-kc-blocker-decisions-2026-08-26.html` — 22 decisions in four
groups. Summary:

| Group                        | Count | Next decision                                                                                                                                        |
| ---------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Needs the client in the room | 10    | The six steps (D01), the MKD outreach reversal (D02), which fields vary by property (D03), the N8 re-check (D08), the September commitment (D09)     |
| Waiting on a vendor          | 3     | Escalate RentVine to a call rather than more email (D11)                                                                                             |
| Ours to decide               | 7     | **Open the comps gate (D14)** — do this before Wednesday if you want to demo it; monitoring authority (D15), because zero alert policies exist today |
| Carried deliberately         | 3     | Whether to relax the spreadsheet write contract to append-only (D21)                                                                                 |

Three are **critical**. The comps gate (D14) is the only one you can clear tonight, and clearing it
changes the demo. The RentVine write endpoint (D11) gates the app's whole value proposition and is
not ours. The September commitment (D09) is the only date on the record and nobody has restated it in
either direction.

---

## 8. The five questions worth asking

1. **What are your six renewal steps, in order?** — The largest remaining slice is specified and
   blocked on a process fact only they hold. Four minutes of their time converts directly into a
   build.
2. **Can you open the lease where the wrong resident was named, now that addresses carry house
   numbers?** — Cheapest question on the list. It either closes a specification or reveals a genuine
   second defect, and doing it live also proves the address fix on the exact lease that prompted the
   complaint.
3. **Are two miles and fifteen comparables defensible in your submarkets?** — Comps are live and the
   defaults are ours. This is the number an owner will challenge, and we should not be the ones who
   chose it.
4. **Does end of September still stand, and covering what?** — The only date commitment on record.
   Letting it pass unmentioned is the worst available option.
5. **Which is it on the flat-increase owner group — normal outreach, or none?** — Two opposite
   answers sit in the record, a day apart. One of them has to be retired before anything is built on
   either.

---

## 9. What the adversarial pass caught

Every row I was about to present as live was handed to three independent verifiers with instructions
to refute it. That pass changed four answers, and one of them would have failed in the room:

- **Comparable rents.** I had this as live and demoable. All three lenses refuted it independently,
  and they were right: the action key the in-app route checks is still shut. See §3.4. This is the
  clearest argument for challenging your own claims before a client meeting rather than after one.
- **One-click spreadsheet rollback.** Marked live against a capability the app does not have. The
  backup-first policy and the closed gate are real; the rollback control is not built.
- **Residual demo records in production.** A standing item said demo-titled approval records and a
  test maintenance ticket were rendering on four operator surfaces. Checked directly against the
  production database: those collections do not exist. The item is retired — and the check turned up
  the more useful fact that three operator screens have no data behind them at all.
- **Deployment provenance.** Upheld on the facts, but one verifier correctly pointed out that a row
  marked live with nothing to demonstrate cannot be presented as a deliverable. It belongs in §2 as a
  caveat, which is where it now sits.

## 10. What was corrected in the record while preparing this

Three documentation faults were found and fixed, because the packet cites these files:

- A ledger row asserted that renewal-draft creation was switched **off**. The committed registry has
  it **on**. A document claiming a capability is disabled while the code has it enabled is the most
  dangerous shape of staleness, and it sat directly on the question this meeting will ask.
- A row claiming three enabled actions was superseded but never retired, so a stale count stood as
  active fact. The real number is six.
- A row stated the comparables provider "has never been reachable in any environment". It answers
  live. Rewritten as history rather than deleted, because the five-part failure it records is why a
  key alone never activated anything.

The suite index also still listed the two shipped fixes as "not built here", and the resume pointer
carried a closed audit as still in progress. Both corrected.

Underneath these sits a structural problem worth naming: 45 entries marked as replaced are still
present as active rows, 11 are claimed by more than one successor, and the open-questions digest names
four of nine. That is decision D22.
