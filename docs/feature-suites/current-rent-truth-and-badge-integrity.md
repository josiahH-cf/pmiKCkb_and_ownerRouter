<!-- spec-shape: overhaul-v1 -->
<!-- cherry-bridge-notes: N6 -->

# S73 — Current-rent truth: a disputed number never wears a "Verified" badge

> New 2026-08-24 from the client's "Cherry Bridge Renewal Fixes Needed" note **N6** ("Current rent is
> wrong" — the team quoted the figure RentVine shows; that value is a real client rent and is
> deliberately not reproduced here). This is the highest-integrity finding in the Cherry Bridge set: the
> problem is not only that a number may be wrong, it is that the software **asserts the number is
> verified** while its own reconciliation is flagging it as a conflict. Specification only — this suite
> changes no product code until an implementation session picks it up.

> **Implementation update — 2026-08-26.** The safety and projection work is built: confidence is
> derived from fresh agreement or an exact record-specific resolution; open conflicts and stale reads
> render Needs Verification; the read date reaches the draft; both extractors use `unit.rent`, then
> `lease.currentRent`, then `lease.rent`; `/lease-renewal/live` shows the direct-read timestamp and a
> refresh link; and the bodyless diagnostic is committed. The client-owned base-rent-versus-total-charge
> meaning remains open, so the twenty conflicts are callouts rather than automatic corrections. No
> RentVine or Sheet value was changed.

**Goal.** A rent figure the system is arguing with itself about never appears beside the word
"Verified" in an email a landlord reads. When the app is confident, it says so and can show why; when it
is not, it says that instead — and resolving a conflict actually changes what the owner sees.

**What it is / how it functions.**

_Historical defect, verified before implementation._ In `lib/lease-renewal/owner-draft.ts`, the `current_rent` fact was
pushed with `confidence: "Verified"` as a **hardcoded string literal**. It is not computed, not tied to
reconciliation state, and not lowered when the same lease has an open High `Current rent` conflict. The
consequence is directly observable: the same workspace page can show the data-check card flagging the
rent as a conflict and, a dozen lines below, show that same number badged as verified.

The 2026-08-26 implementation deletes that contradiction. Human resolutions are keyed by a bodyless
hash of the exact lease/row identity plus field, so one `current_rent` decision cannot spill across
other leases. A matching resolution changes the draft value and source. Every current-rent fact carries
its read date. The live-review route performs a direct provider read for every render and now exposes
that timestamp plus a refresh control rather than silently presenting an undated snapshot.

_The conflicts are real and reproducible._ The 2026-08-26 bodyless live diagnostic yields exactly twenty
`current_rent` / High flags. Sheet-minus-RentVine gaps include values in the hundreds and thousands —
and one gap of exactly fifty, which is the magnitude of the client's complaint.

The read narrowed the explanations: all 306 complete-export rows carried `unit.rent`, none carried a
lease-level rent key, so shadowing did not occur in that capture. Base-versus-total semantics, source
staleness, and identity/join quality still require client interpretation. The application therefore
does not choose a winner or write a correction automatically.

_Intended end state._ Confidence is **derived**, never asserted. A fact whose value is under an open
conflict cannot render as verified anywhere — desk, workspace, or outgoing draft. Human resolutions
reach the draft. Every rent-bearing fact carries the time it was read, and `/lease-renewal/live` obeys
the same currency contract as every other live surface.

**Open questions & assumptions.**

- **Open — `Q-S73-RENT-SEMANTICS`.** Does the client's "current rent" mean base rent or total charged
  including the resident-benefits package and insurance? This determines whether the twenty conflicts
  are data errors or a definition mismatch. Answered by one read-only live comparison, not by code.
- **Answered for application precedence 2026-08-26 — `Q-S73-KEY-PRECEDENCE`.** Both extractors now
  use `unit.rent`, then `lease.currentRent`, then `lease.rent`. The complete live read observed only
  `unit.rent`, so the differing-shapes fixture is a regression contract rather than a claim about a
  currently observed dual-key row.
- **Assumption — `A-S73-CONFLICT-BLOCKS-VERIFIED`.** An open conflict on a field is sufficient, on its
  own, to prevent that field rendering as verified. This is the conservative reading and the one the
  client's complaint implies.
- **Assumption — `A-S73-RESOLUTION-FEEDS-DRAFT`.** Once an operator resolves a conflict, the resolved
  value and its source are what the draft should carry.

**Cross-product impacts.** S58 owns the live-data currency contract; this suite closes the
`/lease-renewal/live` hole rather than defining a second currency model. S24's communications policy
governs what an outgoing artifact may claim, and a hardcoded "Verified" is exactly the class of
unearned claim that policy exists to prevent — expect an S24 amendment to name confidence badges
explicitly. S60's under-market signal is computed against the same rent figure, so a corrected figure
moves the signal. S25's execution contract consumes the owner draft. S43's workspace renders both the
conflict card and the badge on one page, which is where the contradiction is visible to the operator.
S70's queue surfaces conflicted leases, and its `AC-S70-3` keeps the date visible on those cards.

**Adversarial acceptance checks.**

- **AC-S73-1** — a fixture lease with an open High `current_rent` conflict renders its current-rent fact
  **without** a verified badge, on the desk, in the workspace, and in the composed owner draft. A
  hardcoded confidence literal fails this check by construction.
- **AC-S73-2** — confidence is derived from reconciliation state. A test asserts no rent-bearing fact
  assigns a confidence value as a constant; changing the fixture's conflict state changes the rendered
  confidence.
- **AC-S73-3** — resolving a conflict changes the composed owner draft. A fixture drafted before and
  after a resolution produces two different drafts, with the resolved value and its recorded source in
  the second. Today they are byte-identical, which is the regression guard.
- **AC-S73-4** — every rent-bearing fact in a composed draft carries the timestamp of the read it came
  from, and a draft composed from a read older than the S58 threshold renders an explicit staleness
  state rather than a verified one.
- **AC-S73-5** — `/lease-renewal/live` obeys the S58 currency contract: it renders a read-age
  indicator, offers a refresh, and refuses to present an expired read as current. A fixture with an
  expired read asserts the refusal rather than a silent render.
- **AC-S73-6** — the two rent extractors resolve lease-level `rent` and `unit.rent` in the **same**
  precedence. A fixture carrying both keys with different values produces one figure, not two.
- **AC-S73-7** — the diagnostic report answering `Q-S73-RENT-SEMANTICS` exists, is committed, and is
  bodyless: field names, key precedence, and counts of agreement and disagreement, with **no** currency
  value, address, or resident name.
- **AC-S73-8** — no confidence badge above "needs review" can be rendered for a value the app has not
  read within the currency window, regardless of conflict state. A fixture with no conflict but a stale
  read still fails to render as verified.

**Forbidden actions / hard gates.** No autonomous, scheduled, bulk, or model-triggered client-facing
send. This suite must not "fix" the complaint by picking a winner between the Sheet and RentVine and
hardcoding it — the app's own suggested winner for `current_rent` is always RentVine, and the client's
note says the RentVine-sourced number was the wrong one. Confidence must never again be assigned as a
literal; a derived value that happens to equal "Verified" is fine, a constant is not. No currency value,
address, or resident name may enter the diagnostic report, a spec, a test fixture, or an evidence file.
Do not resolve `Q-S73-RENT-SEMANTICS` by assumption and then build the filter on it. The Sheet
write-back stays append-only and Admin-gated; correcting a rent figure in the app never writes to
RentVine or the Sheet without its own governed confirmation.

**Ordered prompt sequence.**

1. Read-only live comparison answering `Q-S73-RENT-SEMANTICS` and `Q-S73-KEY-PRECEDENCE`; emit the
   bodyless diagnostic report.
2. Unify the two rent extractors on one key precedence.
3. Derive confidence from reconciliation state; delete the hardcoded literal.
4. Carry the read timestamp onto every rent-bearing fact.
5. Feed human resolutions into the draft composition path.
6. Bring `/lease-renewal/live` under the S58 currency contract (age indicator, refresh, expired
   refusal).
7. Re-run the twenty-conflict fixture and record how many were definition mismatches versus real data
   errors.

**Deletion/merge recommendation.** Keep as its own suite. It is the one Cherry Bridge note whose failure
mode is a **truth claim in an outgoing client-facing artifact**, which puts it in a different severity
class from the ordering and labeling fixes. Do not merge into S58 — S58 is the general currency
contract; this is the confidence-and-conflict semantics that sit on top of it. Fold
`A-S73-CONFLICT-BLOCKS-VERIFIED` into `docs/facts.md` once the derived-confidence rule ships green.
