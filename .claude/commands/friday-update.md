---
description: Draft the weekly Friday client status email to Dan from real repo activity (commits + status docs), in PMI KC operator voice.
argument-hint: optional notes to weave in (e.g. "login link is live: <url>", "out Mon-Tue")
---

You are drafting Josiah's weekly Friday client status email to Dan at PMI KC. Produce a finished,
ready-to-send draft from the real state of this repository. Josiah reviews and sends it himself
(human send authority: never send anything).

The goal is a near-identical result every Friday: same structure, same voice, same selection rules,
varying only with the real week's work. Follow the rules below exactly.

## 1. Read the real sources (do not invent anything)

Run/read these before writing. Everything in the email must trace to one of them or to the notes
Josiah passes in `$ARGUMENTS`.

- `git log --since="last friday" --no-merges --date=short --pretty=format:"%h | %ad | %s"` for the
  week's work. If today is not Friday, use the last 7 days.
- `docs/status.md` — read only the most recent dated sections (this week). It is the narrative
  history; the tail holds the latest entries.
- `docs/loop-state.md` — the current "Next Safe Slice Candidates" and "Active Blockers And Exact
  Client Asks".
- `docs/client-checklist.md` — "Current Outbound Asks" (open client asks) for the Blockers section.
- `docs/voice-and-audience.md` — the audience profile and the do/don't lexicon. This governs the
  translation in §3.

Josiah's notes for this week: `$ARGUMENTS`. If present, weave them in (a login link, a personal
aside, a specific commitment, a correction). If a note conflicts with the repo, the note wins. If a
note is absent, omit that element. Never fabricate a date, link, name, number, or commitment to fill
a gap.

## 2. Who Dan is (read before writing)

Dan is a property manager, not an engineer. He assumes the technical plumbing is correct and does
not care about it. Write outcomes, not mechanics. Specifically:

- He does not know or want terms like "connected (read-only)", "live", "RentVine API", "domain-wide
  delegation", "pipeline", "reconcile", "flag", "kill switch internals", "production_allowed",
  "Phase 3b", "slice", "governance", "provider seam".
- Do not quote raw counts that can read as alarm ("read 519 rows", "390 records", "397 flags",
  "583 tests"). They sound like something broke. Describe the outcome instead ("ran a full renewal
  review on real data").
- He cares about: what works now, what he can see, what is next, and anything he needs to do.

## 3. Translate engineering work into operator language

Use `docs/voice-and-audience.md` and this map. Plain, confident, present tense. State what is true now.

- Cloud project / billing / budget kill switch -> one reassurance line: PMI KC's own cloud with a
  hard spending cap so costs stay under control. (Always keep one short cost-safety line.)
- RentVine / Sheets / live reads -> "connected RentVine and started building the lease renewal
  process" (no "read-only", no row counts).
- Renewal pipeline / reconcile / flags / calibration -> "built the renewal workflow", "ran it
  against real data".
- Owner/tenant draft emails, readiness checklist -> "started building the renewal templates and
  draft emails". Always note nothing sends without him when drafts are mentioned.
- UI / branding / Renewal Desk / Connection Center / accessibility -> "improved the app's branding,
  workflow, and overall look and feel".
- Hide entirely (internal, not client-facing): governance/docs/spec scaffolding, freshness gates,
  local-model seam, test counts, refactors, the auth/permission saga, identity mechanics.

## 4. Email format (locked)

Output exactly this shape. One emoji per header, one 😊 in the greeting. No other emoji clutter.
Never use the cherry/bridge emoji (legacy brand). Bold only the section labels.

```
Hi Dan,

Quick update on where things stand with the PMI KC build. 😊

[Optional one-line beta/login invite — include ONLY if $ARGUMENTS supplies a live login link or
says the app is live for Dan. Phrase: "I'm getting the app set up so you can log in and look around
at the early beta. You'll sign in with your PMI KC Google account, and here's the link: <url>." If
no link is provided, omit this line entirely.]

✅ **Done this week**

- [4 to 6 bullets, each one operator-level outcome from this week's commits, translated per §3.
  Group related commits into a single bullet. Fold all cost/cloud/safety work into one reassurance
  bullet. No metrics that can read as alarming.]

🔜 **Next Up**

- [3 to 5 bullets from loop-state "Next Safe Slice Candidates" and the renewal next-phase plan, in
  operator terms: defining the process in more detail, bringing drafts and real data into the app,
  building out more workflows, showing the full process start to finish.]

🚧 **Blockers**

[If open client asks in client-checklist genuinely block the immediate next step, list them plainly
as "a few things we need from your team" (walkthrough recording, in-scope sheet tabs, example
renewals in the shared Drive folder, etc.). If nothing blocks the immediate next step, write that
nothing is needed on his end right now, that the focus is refining the process wherever possible,
and that you will bring him any decisions that come up once you have run things against real data and
reviewed them together.]

Thanks,
Josiah
```

## 5. Hard constraints

- No fabrication: dates, links, names, numbers, blockers, commitments, and travel come only from the
  sources or `$ARGUMENTS`. If a detail is not there, omit it. Never write a bracketed placeholder.
- No em dashes or en dashes (— –). Use periods, commas, or parentheses.
- Strip AI tells. Do not use: "not just X, but Y"; "it's not about X, it's about Y"; "we're
  thrilled/excited to"; colon-led "We did X: details"; triplet padding. Avoid the words leverage,
  robust, seamless, streamline, delve, utilize, holistic, elevate, unlock, empower, dive in. Vary
  sentence openings. Read it back and make sure it sounds like Josiah typed it, not an assistant.
- Compact and skimmable. Short bullets. No wall of text.
- Drafts only; never send. This is a draft for Josiah to review.

## 6. Output

Output the finished email first, ready to paste.

Then a horizontal rule and a short block titled "For your review (not part of the email)" with at
most 5 lines: the commit window you used, anything you omitted because it needed his confirmation
(e.g. a login link or a date), and any item that needs his go-ahead. Keep it terse.
