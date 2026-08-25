# Cherry Bridge renewal notes — what each one means and where it now lives

**2026-08-24.** The team wrote down eleven things about the renewal process. This page says, in plain
language, what each one turned out to be once we checked it against the software, and which written
spec now covers it. Every line is meant to be readable without knowing anything about the code — if a
line does not match what you meant, say so, and the spec changes.

**Two things to know before you read.** First, nothing here is built. These are written descriptions of
what will change, each with a numbered list of things that must be observably true before it can be
called done. A build session picks them up separately. Second, **two of the eleven come back to you as
questions rather than plans**, because the team asked for something the project already decided
against. Those are notes 4 and 11, and they are marked.

No resident name, address, or rent figure appears on this page or in any of the specs.

---

## Quick map

| Note | The team wrote                          | What it actually is                                            | Now lives in  |
| ---- | --------------------------------------- | -------------------------------------------------------------- | ------------- |
| N1   | Not an active property                  | No active/inactive filter exists at all                        | S70           |
| N2   | Dates need to be in chronological order | There is no sort; the page above it _is_ sorted                | S70           |
| N3   | House numbers in the addresses          | Wrong field read first; the number is never shown              | S71           |
| N4   | MKD — no outreach, +3.5%                | **Split.** Pricing = one admin entry. Outreach = **your call** | S62 amendment |
| N5   | This link never changes                 | No default exists anywhere; it is per-lease only               | S72           |
| N6   | Current rent is wrong                   | Worse: a disputed number is labelled "Verified"                | S73           |
| N7   | The comp section needs to be first      | Confirmed; and nothing requires comps at all today             | S72           |
| N8   | Tenant name is incorrect                | Most likely the same cause as N3, not a separate bug           | S71           |
| N9   | Change this message                     | Wording is adoptable; the claim in it needs evidence           | S74           |
| N10  | Align the renewal page with our 6 steps | The page has 4 steps over 5 cards; one card has no step        | S72           |
| N11  | Waiting on? last follow-up? auto-send?  | **Split.** First two are easy. Auto-send is **your call**      | S75           |

---

## The eleven, one at a time

### N1 — "Not an active property"

**What we found.** There is no active-or-inactive filter of any kind on the renewal list. The software
only ever excludes three things: month-to-month, owner-authorised, and program leases. It has no idea
whether a property is still active. Worse, when a lease has no other end date, the software falls back
to the **move-out date** and shows it as though it were a renewal date — so a property someone has
already left still looks like live work.

**What will change.** Two things, because one of them is not yet knowable. First, you get a control to
take a wrongly-listed lease off the queue yourself, with a note saying why — that works immediately and
regardless of anything else. Second, before we can filter automatically, someone has to look at the
live data and find out which field actually says "not active", because nothing in our system currently
knows. That look is read-only and writes down field names and counts only, never anything about a
resident.

**Where.** [S70](feature-suites/renewal-queue-integrity.md), checks 1 and 4–7.

---

### N2 — "Dates need to be in chronological order"

**What we found.** The renewal queue is not sorted at all. It appears in whatever order the data export
happened to hand over. What makes this especially confusing is that the "Needs your attention" section
directly above it **is** sorted by soonest end date — so you are looking at two lists on one page in two
different orders.

There is a second problem underneath it: when a lease has an open data conflict, the card hides its date
entirely, because the conflict marker sits in the same spot. So even after sorting, the cards you most
want to check would still look out of order.

**What will change.** One ordering, soonest lease end date first, used by both lists. And a conflicted
card shows its date _and_ its conflict marker instead of one replacing the other.

**Where.** [S70](feature-suites/renewal-queue-integrity.md), checks 1–3.

---

### N3 — "House numbers in the addresses"

**What we found.** The software reads four possible address fields and takes the first one it finds. The
first one on that list is the street **name** only — the house number lives in a different field — and
that name field is filled in on every single record. So it always wins, and the address is always
missing its number. There is no truncation and nothing is being hidden; it is simply reading the wrong
field first.

**Why it matters more than it looks.** Three other things break because of this. The Ask box needs a
house number to find a lease, so it can never find a live renewal from what the screen shows you. Rental
comparables get looked up on a whole street rather than a specific home. And the owner email goes out
naming a street with no number on it.

The good news: the correct way to build that address already exists in two other parts of this system.
The fix is to stop maintaining a third, wrong copy.

**Where.** [S71](feature-suites/lease-identity-and-address-truth.md), checks 1–6.

---

### N4 — "Owner is MKD — we don't reach out to them, +3.5% each renewal" · **needs your decision**

This one splits in half and the halves get opposite answers.

**The +3.5% half needs no new software at all.** The machinery for it already ships: an admin screen
where you set a percentage increase rule for an owner's portfolio, and MKD is already identified in our
records as portfolio 27, covering 39 leases. The only thing missing is **the rule itself** — nobody has
ever entered it. That is one person, one screen, once.

**The "we don't reach out" half contradicts a decision already on the books.** On **6 August 2026 (2026-08-06)** you
withdrew exactly this instruction. After you withdrew it, the project deliberately built a guard so the
behaviour could not come back by accident — there is now a test whose entire job is to fail if anyone
adds a way to skip owner outreach. Building this note as written would mean deleting that guard.

**So we are asking rather than building.** Do you want to re-reverse the August 6th decision? If yes,
that is a new decision and the guard comes out deliberately. If no, we tell the team that outreach stays
and enter the 3.5% rule. **Default if you say nothing: no change to outreach, and the rule gets
entered.**

**Where.** [S62 amendment](feature-suites/owner-policy-renewal-pricing.md), checks 12–13.

---

### N5 — "This link never changes — don't make us paste it each time"

**What we found.** The tenant information form link is stored per lease and nowhere else. There is no
default anywhere in the system, so somebody has to paste it every time. There are already three places
in this app that hold exactly this kind of one-time setting, so there is a well-worn pattern to follow.

One catch worth knowing: the email composer never actually includes that link today. So a default alone
would still leave the team pasting. Both get fixed together or neither helps.

**What will change.** The link becomes a setting you enter once, with the option to override it on a
single lease if you ever need to — and the composer actually carries it into the email.

**Where.** [S72](feature-suites/renewal-step-model-and-workspace-defaults.md), checks 6–7.

---

### N6 — "Current rent is wrong" (the team quoted the figure RentVine shows)

**This is the most serious item in the document, and not for the reason it looks like.**

**What we found.** Next to the current rent, the owner's email says **"Verified"**. That word is not
calculated from anything. It is typed into the software as a fixed label. It does not check whether the
number is disputed, and it does not go down when the same lease has an open conflict flagged against
that exact figure. So the same page can flag the rent as a conflict, and a dozen lines below, show that
same number badged "Verified" — and that badge goes out to a landlord.

Two more things follow. Resolving a conflict changes nothing in the email — not one character. And no
rent figure carries the time it was read, so "Verified" can be describing a number from a quarter of an
hour ago.

The conflicts themselves are real: there are twenty of them on current rent, and the gaps include one of
exactly fifty dollars — which is the size of the discrepancy the team reported.

**What we do not yet know.** There are four possible explanations for the wrong figure and we cannot
tell them apart from the code alone: the number may exclude the benefits package and insurance; two
places in our own software read the rent field in **opposite** priority order; the source figure may
simply be stale; or the cached copy may be up to fifteen minutes old. So the plan starts with one
read-only comparison against the live data before anything is changed.

**What will change.** A number the system is arguing with itself about will never appear next to the
word "Verified". Confidence gets worked out from the actual state of the data instead of being asserted.
Resolving a conflict changes what the owner sees. Every rent figure carries the time it was read.

**Where.** [S73](feature-suites/current-rent-truth-and-badge-integrity.md), all eight checks.

---

### N7 — "The comp section needs to be first — we can't email the owner until it's done"

**What we found.** Confirmed exactly. The page currently puts the decision and the offered rent first,
and the comparables well down the page. Nothing in the software pins that order, so moving it is safe.

We also found that the sequencing you describe is not enforced anywhere: you can submit an owner
decision without filling in a single comparable. That is a separate question — see below.

**What will change.** The comparable fields move to the top of the owner-decision step.

**A question for you:** should the software also **require** a comparable before the decision can be
submitted? You said you cannot email the owner until comps are done. A hard requirement enforces that,
but it would block the case where no comparable is available. **Default: reorder now, ask before
enforcing.**

**Where.** [S72](feature-suites/renewal-step-model-and-workspace-defaults.md), check 5.

---

### N8 — "Tenant name is incorrect"

**What we found — and this is the part worth reading.** We think this is the **same problem as N3**, not
a separate one.

Here is the reasoning. The card and the page heading identify a lease by its address — and that address
has no house number on it (N3). So two leases on the same street produce two identical-looking cards.
From the screen, it is genuinely impossible to tell whether the wrong name is attached to a lease, or
whether the right name is attached to the lease _next door_ and the two are indistinguishable.

We also checked whether any test or demo data had leaked in — it had not. The names involved appear
nowhere in our source code.

There is one real, separate quirk: the greeting names only the first resident on a lease, while the
email correctly goes out to all co-residents.

**What will change.** The address fix lands first. Then we ask you to look at that same lease again with
the house number visible, and record whether the name was in fact wrong. We deliberately are **not**
building a "correct the name by hand" control before that — that would paper over a data problem with
your team's labour.

**Where.** [S71](feature-suites/lease-identity-and-address-truth.md), checks 4, 7 and 8.

---

### N9 — "Change this message" (the Text message)

**What we found.** All three tenant messages come from a single fixed block of wording in the code.
Email and portal chat are identical; only the text message differs. Nobody can edit any of it without a
code change — the in-app template editor exists but is only wired to one unrelated message.

The wording the team asked for says the offer _"has been sent out via email and rentvine chat"_. That is
a claim about something having already happened. Our communications policy allows that kind of statement
only when the system can show it actually did happen — and right now the app **cannot send a RentVine
portal message at all**. So as written, the software would be asserting it on the strength of nothing.

**What will change.** You get your exact sentence, rendered whenever the system has a record that both
channels went out — which in practice is whenever the team did what they said they did. When it does
not have that record, it says something truthful instead. And the wording becomes editable in the app
rather than needing a deploy.

**A question for you:** what should the message say when only one channel went out? We will put a plain
default in and ask you to replace it with your words.

**Where.** [S74](feature-suites/tenant-offer-copy-and-channel-truth.md), all eight checks.

---

### N10 — "Align the renewal page steps with our 6 steps"

**What we found.** The page shows a **four**-step progress indicator over a **five**-card page — and the
fourth card, the one that actually writes the owner's email, belongs to no step at all. That mismatch is
the most likely direct reason it feels "all over the place".

Checked against your six steps:

1. **Collect onto the sheet** — partial, and pointing the wrong way. Two fields get reconciled; pet
   info, deposit, Rhino, insurance and inspection are collected nowhere.
2. **Comps, then email the owner** — built, but living in an unnamed card, and fused with step 3. (You
   say "zillow comps"; this project decided against Zillow and the app uses RentCast. We are raising
   that as a naming question rather than quietly changing one to look like the other.)
3. **Owner decision onto the sheet** — half. Recorded in the app, never written to the sheet.
4. **Draft and send to tenants** — best covered, and correctly built: an unsent draft a person sends.
5. **Email the hand-off contact, then dotloop** — **entirely missing**, three ways over. Nothing records
   whether a tenant replied, there is no hand-off email, and there is no step to put either on.
6. **Built → reviewed → shared → notify tenant** — mostly missing. There is no review state, and the
   "documents were sent" email actually exists but is reachable from no screen at all.

One more thing we found on the way: a renewal can currently be marked complete having never drafted an
offer or seen a signature.

**What will change.** Six steps, named as yours, in your order. The owner email gets a step. Steps 5 and
6 appear as real steps that honestly say "not built yet" instead of being invisible. And marking a
renewal complete requires that an offer was actually drafted.

**The careful part.** Today a lease's step is stored as a plain number. Renumbering the steps would
silently relabel **every renewal currently in flight**. So the change moves to named steps with a
migration, and there is a specific check whose only job is to prove no in-flight lease changes step.

**Where.** [S72](feature-suites/renewal-step-model-and-workspace-defaults.md), checks 1–4 and 8–11.

---

### N11 — "Waiting on owner/tenant? note last follow-up? auto-send?" · **needs your decision**

**The first two asks are the cheapest real win in this whole document.** The follow-up machinery is
already built and tested — there are already statuses called "awaiting response" and "follow-up due",
with proper labels, and logic that works out when a nudge is due and suppresses it if someone already
made contact.

**It has simply never been fed.** The two values it needs — when the letter went out, and whether the
tenant replied — are hardcoded to "never" and "no" in all three places that matter. So those statuses
are unreachable, and the "Follow-up due" line has never once been able to appear on anyone's screen.

**What will change.** The renewal records who it is waiting on and when it was last followed up. The
existing machinery then works as written.

**The third ask — automatic sending — is where we have to come back to you.** Two separate rules block
it. This project has a standing rule against anything being sent to a client without a person triggering
it, and decision **D33** permanently closed the renewal sending channel. Neither is a setting; the
second would need you to make a new decision reversing it.

**What we propose instead:** the app notices the silence, raises a nudge **to your staff**, and writes
the follow-up email ready to go — addressed, worded, waiting. A person clicks send. You get the outcome
(nothing falls through) without anything leaving the building on its own.

**Default if you say nothing: we build the nudge-and-draft version and tell the team automatic sending
is not available.**

**Where.** [S75](feature-suites/renewal-follow-up-state.md), all nine checks.

---

## What this does not do

- It builds none of the eleven fixes. Every item above is a written description with a checkable
  definition of done.
- It changes no product code.
- It sends nothing to any owner or resident.
- It contains no resident name, address, or rent figure — here or in any of the specs.
