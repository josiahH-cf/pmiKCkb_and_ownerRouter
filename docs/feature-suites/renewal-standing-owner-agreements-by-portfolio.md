<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-one-path-2026-11 -->

# S250 — Standing owner agreements set once per owner portfolio and chosen on the lease

> Status: AUTHORING READY — intake 116; implementation NOT STARTED. Specification only; it grants no execution, release or provider effect. Owner decision D-OP-3 (November 5, 2026) approves portfolio-wide agreements that cover the owner step. It revises the S194 agreement scope and keeps S194's policies, prefill and history.

**Goal.**

An owner's standing renewal agreement, such as the MKD 3.5 percent increase, is recorded once for
that owner's portfolio, is chosen on the lease with a selector, fills the renewal rent, and takes
the owner step out of the path for every lease it covers.

**Current state / intended end state.**

Verified at `6491c06f`, in the November 5, 2026 read-only production observation, and in the
November 4 staff walkthrough:

- Reusable pricing policies exist with percentage, fixed-dollar, no-increase and manual-review
  kinds, assigned per portfolio or per lease, with prefill of untouched working terms
  (`lib/lease-renewal/renewal-pricing-policy.ts`, `lib/firestore/renewal-pricing-policies.ts`).
- Owner outreach is treated as satisfied only by a standing owner agreement that names one policy
  version, one portfolio, an explicit list of lease ids, one cycle date and the exact rent,
  effective date and end date, and only while the working terms equal those values
  (`standingOwnerAuthority` in `lib/lease-renewal/renewal-pricing-policy.ts`). In effect it is a
  per-lease, per-cycle approval record, not a standing agreement.
- The lease page shows "Renewal pricing policy" with "Policy assignment" and a link to "Manage
  reusable policies and agreements" in Admin (`components/lease-renewal/RenewalPricingPolicy.tsx`).
  The older Admin rule is keyed by a numeric RentVine portfolio id
  (`lib/firestore/owner-policy-rules.ts`).
- Observed: the lease page read "No standing pricing policy" and "Individual owner review is
  required". The lease staff identified as covered by the MKD agreement read "Waiting on: the
  owner", next step "Record owner response", while its staff status read "Preparing tenant offer"
  and its note said no owner contact is needed.
- Walkthrough: staff stated that MKD gives one percentage to use across its properties, changed
  from 5 percent to 3.5 percent, and may change again; no owner decision is asked per lease. The
  owner (Josiah Hunter) could not find where the rule was set from the lease and stated that it
  should be a selector applied in the renewal process.

Intended: one agreement per owner portfolio with a pricing rule and a recorded statement that the
owner has pre-approved renewals at that rule; a selector on the lease's Now card; rent prefilled
from the rule; the owner step shown as covered.

**Actors and entry conditions.**

An Admin creates and edits agreements. Renewal staff (Editor or higher) apply an existing agreement
to a lease or to a whole portfolio and remove that application. Portfolio membership comes from the
verified RentVine read; a lease whose portfolio cannot be verified is never covered.

**What it is / how it functions.**

- **R-S250-1 — One agreement record.** A standing agreement has a name, the pricing rule (an
  existing policy), whether the owner has pre-approved renewals at that rule, the date it took
  effect, an optional end date, and who agreed, how and when in words. It is versioned; a change
  keeps the earlier versions.
- **R-S250-2 — Set once for the portfolio.** An agreement applies to every lease in a verified
  RentVine portfolio, shown by the portfolio and owner names staff recognize, with the numeric id
  kept as the stored reference. It can also be applied to single leases. A lease assignment wins
  over the portfolio assignment, as today.
- **R-S250-3 — Chosen on the lease.** The Now card shows "Pricing basis" with the choices "Owner
  decides each renewal" and each active agreement by name and rule. Choosing an agreement asks
  "This lease only" or "Every lease in this owner's portfolio" and saves on one action with an
  optional reason. The existing panel in More shows the same assignment.
- **R-S250-4 — Rent from the rule.** For a covered lease the rent to recommend is the rule applied
  to the authoritative current rent with the existing whole-dollar rounding, shown with its basis.
  A staff typed rent always wins and is never overwritten.
- **R-S250-5 — Owner step covered.** While an active pre-approved agreement covers the lease's verified portfolio and the working rent equals the rule's result,
  Ask the owner reads "Covered by {agreement}: no owner message needed" and the path continues at
  Offer the tenant. Each renewal cycle is covered while the agreement is in effect; no per-cycle
  record is needed.
- **R-S250-6 — Leaving the rule returns the owner step.** A working rent different from the rule's
  result, an ended, revoked or unverifiable agreement, a lease outside the portfolio or two
  conflicting agreements return the lease to Ask the owner with the reason in words. Unrelated work
  is never stopped.
- **R-S250-7 — Rule changes apply forward.** A changed rule changes later proposals only. A sent
  message, a recorded approval and recorded terms keep their values; a prepared message built on
  the earlier rule reads "Built on the earlier rule" and offers to rebuild.
- **R-S250-8 — Visible everywhere it matters.** The desk row carries a "Standing agreement" tag;
  the lease page names the agreement, its rule and when it took effect; the tenant offer and the
  source update previews show the rule as their basis.
- **R-S250-9 — Existing records keep their meaning.** Existing exact per-cycle agreements and the
  older portfolio rules keep working as they do today, and are listed beside the new agreements.

**In scope / out of scope.**

In scope: the agreement record and its versions, portfolio and lease application, the selector,
prefill, the covered state, the return conditions, tags and compatibility. Out of scope: inferring
an agreement or a portfolio from a name, recording owner consent the owner did not give, any
provider rent change (it keeps its own exact confirmation), fee or legal policy, and communications
schedules.

**Open questions & assumptions.**

- D-OP-3 (owner decision, November 5, 2026): one recorded agreement covers every lease in a
  portfolio for every renewal cycle while it is in effect, with the rent taken from its rule,
  instead of an exact per-lease, per-cycle record. This replaces the S194 exact-terms binding for
  these agreements; a rent different from the rule returns the lease to the owner step.
- Assumption: Editors apply and remove agreements; only an Admin creates or changes one. This
  follows D-NO-S64 and the S194 split.
- Assumption: the agreement's real values, portfolio and effective date are entered by staff from
  the owner's actual instruction. The 3.5 percent figure for MKD is the owner-confirmed value from
  S194; no portfolio id is inferred from a name.
- Assumption: the covered state binds the rent only. Renewal dates follow the lease's ordinary
  working terms.

**Cross-product impacts.**

`lib/lease-renewal/renewal-pricing-policy.ts`, `lib/firestore/renewal-pricing-policies.ts`,
`lib/lease-renewal/pricing-policy-read.ts`, `lib/firestore/owner-policy-rules.ts`,
`components/lease-renewal/RenewalPricingPolicy.tsx`, `lib/lease-renewal/workspace-state.ts`
(standing authority in the staff summary), `lib/lease-renewal/renewal-actions.ts`,
`lib/lease-renewal/live-desk.ts`, the Admin pricing rules panel, the Now card (S247), the rent
proposal (S249), the desk tag (S246) and the help guides (S252).

**Authority and evidence map.**

| Input                                                             | Classification       | Use and limitation                                                                     |
| ----------------------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------- |
| `AGENTS.md`; S194 delivered contract                              | Authority            | A price rule alone is not owner consent; provider writes keep exact confirmation.      |
| Committed code and tests at `6491c06f`                            | Implementation truth | Present policies, assignments and the exact-terms agreement binding.                   |
| Read-only production observation, November 5, 2026                | Bounded observation  | Labels shown for two leases; not a reading of stored policy configuration.             |
| November 4 staff walkthrough notes and November 5 owner direction | Intent evidence      | One percentage across the portfolio; a selector in the renewal process.                |
| The owner's actual agreement, portfolio and effective date        | External dependency  | Entered by staff from the real instruction; absent means "Owner decides each renewal". |
| Owner decision D-OP-3, November 5, 2026                           | Owner decision       | Approves portfolio-wide coverage of the owner step while the rent follows the rule.    |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S250-1** — An agreement is represented with a pre-approval statement, effective dates and
  portfolio or lease scope, without a cycle date or exact terms; existing exact agreements remain
  valid as a distinct kind. Fail-first: the schema requires a cycle date, lease list and exact terms.
- **ARCH-S250-2** — Coverage is one pure function of the agreement, verified portfolio membership,
  current rent, working rent and the business date. Fail-first: a portfolio agreement fixture with a
  new cycle date reads not covered.
- **ARCH-S250-3** — The lease selector and the Admin list read and write the same assignment store
  with a single save action and an audit entry. Fail-first: no selector on the path step.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S250-1** — An Admin records an agreement for a portfolio; every lease in that portfolio
  shows it by name with the rent prefilled from the rule and its basis.
- **BEH-S250-2** — A staff member chooses an agreement on a lease for that lease only or for the
  whole portfolio in one action, and removing the lease choice reveals the portfolio default.
- **BEH-S250-3** — A covered lease reads the owner step as covered in every cycle while the
  agreement is in effect, and the next step is Offer the tenant.
- **BEH-S250-4** — A typed rent different from the rule, an ended or revoked agreement, an
  unverifiable portfolio or a conflict returns the lease to Ask the owner with the reason.
- **BEH-S250-5** — A rule change alters later proposals only and marks a prepared message as built
  on the earlier rule.

**Human litmus outcome.**

### Work a lease covered by an owner's standing agreement

**If this was built correctly:** A staff member opens a lease owned by an owner with a standing
agreement. The page names the agreement, shows the new rent already worked out, says no owner
message is needed and offers the tenant offer as the next step. If the owner is not set up yet,
the staff member picks the agreement from a list on the same page.

- Model verdict: NOT RUN — to be completed by the implementation runner with evidence.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                            | Architecture outcome | Behavior outcome | Human litmus                                          | Deterministic evidence / falsification                                   |
| -------------------------------------- | -------------------- | ---------------- | ----------------------------------------------------- | ------------------------------------------------------------------------ |
| R-S250-1 one agreement record          | ARCH-S250-1          | BEH-S250-1       | Work a lease covered by an owner's standing agreement | Schema and store tests: versions kept, required words present.           |
| R-S250-2 set once for the portfolio    | ARCH-S250-2          | BEH-S250-1       | Work a lease covered by an owner's standing agreement | Two leases in one portfolio share it; unverified portfolio is uncovered. |
| R-S250-3 chosen on the lease           | ARCH-S250-3          | BEH-S250-2       | Work a lease covered by an owner's standing agreement | Selector saves lease or portfolio scope in one action with audit.        |
| R-S250-4 rent from the rule            | ARCH-S250-2          | BEH-S250-1       | Work a lease covered by an owner's standing agreement | Percentage, fixed and no-increase fixtures; typed rent preserved.        |
| R-S250-5 owner step covered            | ARCH-S250-2          | BEH-S250-3       | Work a lease covered by an owner's standing agreement | Covered across two cycle dates with no per-cycle record.                 |
| R-S250-6 leaving the rule              | ARCH-S250-2          | BEH-S250-4       | Work a lease covered by an owner's standing agreement | Different rent, ended, revoked, unverifiable and conflicting fixtures.   |
| R-S250-7 rule changes apply forward    | ARCH-S250-1          | BEH-S250-5       | Work a lease covered by an owner's standing agreement | Changed rule leaves sent and recorded values; prepared message flagged.  |
| R-S250-8 visible everywhere            | ARCH-S250-3          | BEH-S250-1       | Work a lease covered by an owner's standing agreement | Desk tag, lease naming and basis lines render from the same projection.  |
| R-S250-9 existing records keep meaning | ARCH-S250-1          | BEH-S250-1       | Work a lease covered by an owner's standing agreement | Existing exact agreement and older rule fixtures behave as before.       |

**Preservation set.**

S194 policy kinds, versions, whole-dollar rounding, prefill of untouched terms only, staff typed
values, recorded owner decisions, exact per-cycle agreements and the older portfolio rules; S234
approval evidence for owners without an agreement; the exact confirmation of every RentVine rent
change; stable RentVine ids; audit history.

**Adversarial acceptance checks.**

- **AC-S250-1** — A portfolio agreement covers two leases across two different cycle dates with no
  per-cycle record, and the same fixture reads not covered before this suite (ARCH-S250-2,
  BEH-S250-3).
- **AC-S250-2** — A pricing policy without a pre-approval statement, a missing or unverifiable
  portfolio, an ended or revoked agreement, a conflict and a typed rent outside the rule each
  require the owner step (BEH-S250-4).
- **AC-S250-3** — Choosing or changing an agreement sends nothing, changes no RentVine rent and
  records no owner response; an Editor cannot create or edit an agreement (ARCH-S250-3).
- **AC-S250-4** — No sent message, recorded approval, recorded term or staff typed value changes
  when a rule or assignment changes (BEH-S250-5).

**Forbidden actions / hard gates.**

No agreement, portfolio or owner consent inferred from a name, a note or a message. No provider
write from an assignment. No covered state without a recorded pre-approved agreement and verified
portfolio membership. No customer value in fixtures, tests or documentation. No protected-path change.

**Dependencies / sequencing.**

Consumes the delivered S194 stores and the verified portfolio read. Feeds the S247 path variant,
the S249 rent proposal and the S246 desk tag; each is optional and the existing panel shows the
same facts without them. Independently buildable.

**Standalone delivery contract.**

- **Deliverable now:** R-S250-1 to R-S250-9: the agreement record, portfolio and lease application
  by recognizable names, the selector, prefill, the covered owner step, tags and compatibility,
  with tests.
- **Consumes, but does not assume:** S247 (absent: existing panel), S249 (absent: existing prefill).
- **Externally blocked effect:** none for the code slice. A real agreement takes effect only when
  staff enter it from the owner's actual instruction; until then every lease reads "Owner decides
  each renewal".
- **Produces for downstream suites:** the coverage function and the agreement tag.

**Verification and delivery contract.**

1. Before edits, record the current readback, the preservation baseline and each ARCH and BEH check
   failing for the stated reason.
2. Run the focused checks for every ARCH, BEH and AC row; keep preservation separate.
3. Run `bash scripts/verify.sh`; audit secrets, PII, gates, runtime configuration and diff scope
   before any authorized delivery.
4. Report `ALL_GATES_GREEN`, `BUDGET_EXHAUSTED` only under an explicit budget, or `BLOCKED` only
   for an exact unavailable external input after all fail-closed work is green.

**Ordered prompt sequence.**

1. Re-verify current code and read the stored policies, assignments and agreements without change.
2. Materialize the ARCH and BEH checks, litmus and preservation baseline; record fail-first results.
3. Build the agreement record, application, selector, prefill, covered state and tags.
4. Falsify, run focused and canonical tests, update help content, and ship only when authorized.

**Deletion/merge recommendation.**

Merge into S194's current contract when implemented; remove this suite when its checks are
represented by code, tests and current facts.
