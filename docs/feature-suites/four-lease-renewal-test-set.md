<!-- spec-shape: overhaul-v1 -->

# S63 — Four-lease renewal test set: goals, evidence, and proof

> New 2026-08-06. Opened by the post-2026-08-05 program grant in `AGENTS.md`, and authorized in
> principle by owner decision D08 / `F-PILOT-ROLLOUT` (a bounded pilot: a named set, two to four
> weeks, a stated abort trigger). Owner direction (Q2): the test proves both process **and** number.
> Owner direction (Q11): a Firestore record per lease plus a report artifact for Dan. Owner direction
> (Q12): cohort enforcement is procedural. Depends on **S57** — before it ships, none of these four
> leases is even reachable in the app.

**Goal.** Answer one question with evidence rather than impression: **does this app do the renewal
job correctly?** Four real leases are worked through the app alongside the team's normal process, and
at the end there is a document showing, per lease, what the app concluded, what the humans concluded,
where they differed, and what the app caught that a person would have had to notice. This is the
core-functionality proof for the product as it stands. Nothing is sent to any owner or resident.

**The cohort, resolved.** Identified 2026-08-06 by joining the owner-supplied Sheet rows 507–510
against a live read-only RentVine read. The full detail is gitignored at
`temp/test-cohort/cohort-resolution.json`.

| Sheet row | Lease id | Lease end  | Tenants on lease |
| --------- | -------- | ---------- | ---------------- |
| 507       | 278      | 2026-09-30 | 1                |
| 508       | 279      | 2026-09-30 | 2                |
| 509       | 280      | 2026-09-30 | 1                |
| 510       | 297      | 2026-10-10 | 5                |

Rents and addresses are deliberately **not** reproduced here. They are client data, they are recorded
in the gitignored resolution file, and they are regenerable read-only at any time. Lease ids and end
dates are the minimum needed to identify the cohort and are not sensitive on their own.

Three facts about this cohort shape the suite. Lease **297 ends 2026-10-10, not 2026-09-30**, so the
"all end September 30" framing from the call is wrong and the evidence must carry real dates. Lease
**297 reads a current rent of zero in RentVine while the Sheet lists a non-zero figure** — a genuine
discrepancy present on day zero, which is finding number one rather than something to fix before
starting. Leases **279 and 280 share one street address**, so every record keys on lease id; address
alone does not identify a lease.

**What it is / how it functions.**

- **Two artifacts that must never be confused.** The **frozen baseline** is captured once per lease
  before any work begins: the authoritative RentVine facts, the Sheet row as it then read, and a hash
  over both. It is immutable — no refresh, revalidation, or later run may write to it, and **S58**
  carries an architecture test enforcing that. The **evidence record** accumulates during the test.
  The live operational view keeps refreshing independently of both. Conflating the baseline with the
  live view would destroy the comparison the test exists to produce.
- **What the evidence record holds, per lease.** The app's derived position (proposed rent and the
  basis it came from, comp figures, any owner-policy rule applied, the recipients it resolved for
  each channel, the draft it composed); the human's actual position (the rent the team landed on and
  how); the delta between them; every discrepancy the app raised and how it was dispositioned; the
  stage transitions with timestamps; and a per-lease verdict against the criteria below. It is
  append-only, so a re-recorded decision does not erase what came before. This matters because the
  existing progress record writes a **full non-merge set**, which would otherwise overwrite the human
  number with the app number or the reverse.
- **The activity trail becomes readable.** `lease_renewal_progress_activity` is written on every
  transition today and **nothing in the app ever reads it** — no query, no page, no export. This suite
  adds the reader, which is most of the per-lease timeline for free.
- **The report artifact.** A generated, plain-English document per the operator voice rules: one
  section per lease, the four criteria below, what differed, what the app caught, and what it got
  wrong. It is generated from the evidence records rather than written by hand, so it cannot drift
  from what actually happened. It contains client data and is therefore produced outside git,
  following the same boundary as the golden-data captures.
- **Cohort enforcement is procedural, by decision.** The desk shows every lease in its window; after
  S57 that is the whole portfolio. Operators work the four by their per-lease deep links. No lease
  filter, allowlist, or pilot flag is built, and the report states plainly that the boundary was
  operational rather than enforced by code.

**The four pass criteria.** A lease passes only if all four hold.

1. **Reachability and classification.** The lease appears on the desk with the correct end date and
   the correct disposition.
2. **Fact accuracy.** The rent, lease end, and recipients the app resolves match the authoritative
   sources, or the app raises a discrepancy where they genuinely disagree. Lease 297's rent mismatch
   must appear as a raised discrepancy, not as a silently accepted number.
3. **Number agreement.** The app's provider-derived estimate falls within **plus-or-minus 5 percent
   or 50 dollars, whichever is larger**, of the team's own recorded Market Value for that lease.
   A live Sheet read on 2026-08-06 established that no cohort lease carries a negotiated rent — all
   four record only that owner outreach was sent — but every one already carries a human-entered
   Market Value beside its Current Rent. That is the comparison basis, and it applies to all four
   leases rather than two (`F-TESTSET-COMPARISON-BASIS`). The criterion still requires **S59** and
   **S60** to have landed, because until then the app's number is the median of the operator's own
   typed comps and it is comparing the human to themselves. If a renewal actually closes during the
   window, its agreed rent is recorded as an additional comparison.
4. **Communication correctness.** Owner and tenant drafts are composed with the right recipients on
   the right channels, never mixed, and every number in the draft is attributed to the source it
   actually came from.

**Settled 2026-08-06 (`Q-TESTSET-OWNER-SEND`): compose-and-review only.** The 2026-08-06 direction on
MKD says to email the owner recipients and "include that communication in the process test". Read
strictly, that could mean a real reviewed human send during the test window. Everything else about the
test set says nothing goes out. The reading applied here, as a documented safe default, is
**compose-and-review only**: the app produces the owner draft, a person opens and reviews it in Gmail,
and it is not sent during the window. That is the reversible choice — an unsent draft can always be
sent later, while a sent notice cannot be recalled. If the owner meant an actual send, S63 gains one
ordered step: a human reviews each composed owner draft and sends it from Gmail under the existing
D33 human-send path, and the send is recorded on the evidence record. The invariant below is scoped to
**automated** sends precisely so that a later human send does not contradict it.

**Nothing is sent automatically, stated precisely.** Renewal and maintenance client notices are draft-only and
their send keys are Registry-closed under D33, so the blanket assurance holds for client
communication. But two send keys **are** open in production and must be scoped out in writing rather
than assumed away: `gmail.thread.reply`, which is human exact-confirmed inside an already-linked
thread, and `internal.transactional_notice.send`, which **auto-sends** one metadata-only notice to an
internal `pmikcmetro.com` address. The test set uses neither. The report records this explicitly so
that "nothing was sent" is a checked statement rather than a remembered one.

Buildable now (app-plane): the baseline store, the evidence record, the activity reader, the report
generator, and the verdict logic. Build to the seam (live provider): none new. Owner dependency (the
one flip): none for the machinery. The test **run** depends on `Q-TESTSET-TOLERANCE`, `F-TESTSET-COMPARISON-BASIS` (which two leases
are negotiated and their agreed rents), and a named daily owner.

**Open questions & assumptions.**

- _Open (owner, `Q-TESTSET-TOLERANCE`):_ the numeric tolerance for criterion 3, in dollars or percent. Deliberately
  **not** defaulted — a tolerance invented by the runner would make the pass criterion meaningless.
  Criterion 3 cannot be evaluated until this is answered; the other three can.
- _Open (owner, `F-TESTSET-COMPARISON-BASIS`):_ which two of the four leases are already negotiated, and the rent the team
  landed on for each. Without this there is no reference value for criterion 3.
- _Open (owner):_ the named person responsible for checking the test each day. D08 requires it and no
  daily-owner, on-call, or rotation concept exists anywhere in the repository. What exists instead is
  an acknowledgement-window contract in `docs/production-incident-runbook.md`.
- _Open (client, `Q-MKD-PORTFOLIO-ID`):_ whether any of the four leases is MKD-owned, which determines whether **S62**
  and the **S61** tie case are exercised by this cohort.
- _Assumption:_ the window is two to four weeks per D08, starting when the test set opens.
- _Assumption:_ the abort trigger is the one already recorded and needs no new decision: any Sev-1
  that the runtime suspend cannot contain, or a second Sev-1 with the same cause.
- _Assumption:_ Sheet rows 507–510 are the correct reading of the dictated "507–210". Four
  consecutive rows matching four consecutive lease records corroborate it, and the resolved
  properties independently corroborate the call transcript.

**Cross-product impacts.**

- New Firestore collections for the frozen baseline and the evidence record, plus `firestore.rules`
  declarations, which are a **D12 protected path** and are prepared and surfaced rather than pushed.
- `lib/firestore/lease-renewal-progress.ts` — a reader for the existing activity trail.
- New report generator script, writing outside git.
- `docs/production-capacity-and-pilot.md` — the named cohort, window, and daily owner recorded
  against the D08 contract that currently names none of them.
- Depends on **S57** (reachability), **S58** (baseline immutability), **S59** and **S60**
  (criterion 3), **S61** (criterion 4), **S62** (if MKD is in the cohort).

**Adversarial acceptance checks.**

- **AC-S63-1** — All four leases (278, 279, 280, 297) appear on the desk with their real end dates,
  including 297's 2026-10-10. _Verify:_ `npm test -- live-lease-cache`, then observed on the desk.
- **AC-S63-2** — A frozen baseline exists for each of the four leases, carrying the RentVine facts,
  the Sheet row, and a hash. _Verify:_ `npm test -- test-set-baseline`.
- **AC-S63-3** — No refresh, revalidation, or later capture mutates a baseline. Its hash is identical
  before and after a full refresh cycle. _Verify:_ `npm test -- testset-baseline-immutability-boundary`.
- **AC-S63-4** — The evidence record is append-only: recording a human number after an app number
  preserves both, and a re-recorded decision does not erase its predecessor. _Verify:_
  `npm test -- test-set-evidence`.
- **AC-S63-5** — Lease 297's rent disagreement between RentVine and the Sheet is captured as a raised
  discrepancy on its evidence record, not as a silently chosen value. _Verify:_
  `npm test -- test-set-evidence`.
- **AC-S63-6** — The per-lease activity trail is readable and renders a timeline. Before this suite
  the collection has no reader at all. _Verify:_ `npm test -- lease-renewal-progress`.
- **AC-S63-7** — The report generator produces one section per lease with all four criteria, is
  generated from the evidence records rather than hand-authored, and writes outside git. _Verify:_
  run it and confirm the output path is gitignored.
- **AC-S63-8** — The report states the cohort boundary was procedural, and lists the two open send
  keys as explicitly out of scope for the test. _Verify:_ `npm test -- test-set-report`.
- **AC-S63-9** — No renewal or maintenance client notice is sent **by the application** during the
  test set: the direct-send keys remain `production_allowed:false` throughout, and the report records
  zero application-initiated client sends. A human sending a reviewed draft from Gmail under D33, if
  `Q-TESTSET-OWNER-SEND` resolves that way, is recorded on the evidence record and does not violate
  this AC. _Verify:_ `npm test -- action-registry-schema`, plus the report's own count.
- **AC-S63-14** — The `documented_evidence` string on `internal.transactional_notice.send` is
  corrected to match its actual flipped state before the report asserts its send scope-out. It
  currently still reads as gated `production_allowed:false` while the flag is `true`, so the report
  would be citing stale prose. _Verify:_ `npm test -- action-registry-schema`.
- **AC-S63-10** — Criterion 3 evaluates as `not_evaluated` with an explicit reason, rather than as a
  pass, while the tolerance and the negotiated reference rents are unanswered. A missing input must
  never read as success. _Verify:_ `npm test -- test-set-evidence`.
- **AC-S63-11** — No evidence record, generated report, or capture artifact containing a customer
  name, email address, street address, or rent figure is committed to git. Lease ids, Sheet row
  numbers, end dates, counts, and hashes are deliberately committed as cohort identification and are
  outside this AC. _Verify:_ a dedicated check over the evidence and report output paths, plus
  `npm run verify:falsification`. Deliberately **not** verified by `npm run verify:redaction`, which
  only asserts that `golden-data/` and `docs/client_docs/` stay untracked and cannot see these paths.
- **AC-S63-12** — The evidence record timestamps when the human's figure was captured relative to the
  app's output, so a reader can tell whether the comparison was blind or informed. A record that
  cannot distinguish the two fails. _Verify:_ `npm test -- test-set-evidence`.
- **AC-S63-13** — The report states its own limits: the sample size, which criteria were evaluated
  versus `not_evaluated` and why, that the cohort boundary was procedural, that leases 279 and 280
  share an address, and that lease 297 carried a source disagreement from day zero. A report that
  reads as an unqualified pass fails. _Verify:_ `npm test -- test-set-report`.

Keep green: `tests/unit/lease-renewal-progress.test.ts`,
`tests/unit/renewal-progress-route.test.ts`, `feature-suite-spec-shape.test.mjs`,
`npm run verify:context-freshness`.

**Forbidden actions / hard gates.** No autonomous client-facing send; every send stays
human-initiated and exact-confirmed; renewal and maintenance notice initiation stays draft-only under
D33; generic non-workflow `gmail.message.send` stays Registry-closed; no personal account in any auth
path; no secret, token, PII, or guessed endpoint in git; the S52 production cost ceiling stands. This
suite must not initiate any automated send to an owner or resident, and must not open a direct-send
key; a human reviewing and sending a draft from Gmail under D33 remains the only send path, and only
if `Q-TESTSET-OWNER-SEND` resolves that way. It must not write to a client system of record:
the Sheet write-back stays gated and no RentVine write exists. It must not mutate a frozen baseline.
It must not record a pass on a criterion whose inputs are missing. It must not commit customer data.
It must not silently substitute the app's number for the human's, or the reverse, on a shared field.
`firestore.rules` changes are D12 protected and are prepared and surfaced, never pushed.

**Ordered prompt sequence.**

1. _Discovery:_ confirm all four leases are reachable once S57 has landed; re-verify their
   authoritative facts read-only.
2. _Build:_ the frozen baseline store and its capture, including the hash.
3. _Build:_ the append-only evidence record and the activity-trail reader.
4. _Build:_ the verdict logic for the four criteria, with `not_evaluated` as a first-class outcome.
5. _Build:_ the report generator, writing outside git.
6. _Gate:_ prepare the `firestore.rules` declarations as an isolated D12 patch and surface it.
7. _Owner:_ obtain the tolerance (`Q-TESTSET-TOLERANCE`), the negotiated reference rents (`F-TESTSET-COMPARISON-BASIS`), the daily owner, and
   the MKD answer (`Q-MKD-PORTFOLIO-ID`).
8. _Verify:_ falsify by attempting a baseline mutation and observing AC-S63-3 fail, then restoring.
9. _Verify:_ full gate including `test:firestore` and `verify:redaction`.
10. _Owner:_ run the four leases through the desk over the D08 window; capture evidence per lease.
11. _Context update:_ record the named cohort, window, and daily owner in
    `docs/production-capacity-and-pilot.md`; promote a `docs/facts.md` `F-` row citing AC-S63-1
    through AC-S63-11; update `docs/loop-state.md` and `docs/status.md`.

**Deletion/merge recommendation.** KEEP permanently. This is the product's first evidence-backed
answer to "does it work", and the report it generates is the artifact the client sees. Disposable
packet: `docs/temp/four-lease-renewal-test-set-plan.md`.
