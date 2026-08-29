<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-stabilization-v2 -->

# S75 — Renewal waiting, contact, and timing truth

> Status: Targeted manual Gmail refresh and versioned global/property/lease timing rules exist;
> client timing values remain unset and the canonical renewal desk does not yet project the complete
> waiting/contact/due state.

**Goal.**

Show who or what each renewal is waiting on, the last source-backed contact, and any client-confirmed
due/follow-up state in the canonical desk and six-step workspace without creating an automatic timer,
draft, message, or send.

**Current state / intended end state.**

Manual Gmail refresh reads only linked targeted threads and derives waiting-on/last-contact facts.
Admin stores audited versioned global, property, and lease timing rules with deterministic most-
specific-wins behavior. When no client-confirmed rule exists, the current system correctly shows
policy unset and emits no due effect. These facts are not carried on the desk summary/cards and the
current four-step workflow cannot associate them with the approved S72 substeps. The intended state
projects exact evidence and unset-safe due state consistently into list, workspace, attention, and
work surfaces.

**Actors and entry conditions.**

Renewals-space staff may view and manually refresh linked communication state. Only current Admin
authority may manage timing rules. A waiting/contact statement requires a verified linked Gmail
thread and cursor-safe refresh result. A due state additionally requires one current client-confirmed
effective timing rule; missing policy remains explicitly unset.

**What it is / how it functions.**

One projection resolves the targeted current thread, latest authoritative message direction/time,
waiting party/state, last-contact timestamp/source, effective timing rule scope/version, computed
next-follow-up/due status, and safe next action. Global policy is overridden by one current property
rule, then one current lease rule. The same resolved projection feeds S78 cards, S72 substeps,
attention/work generation, and workspace details. Refresh is deliberate; cursor monotonicity,
duplicate/out-of-order events, and missing/deleted threads remain idempotent and honest. Due state may
create in-app attention/work only. It never schedules or triggers a client communication.

**In scope / out of scope.**

In scope: shared follow-up projection, desk/workspace display, targeted manual refresh, waiting/last-
contact source references, policy scope/version/due calculation, attention/work integration, null and
recovery states, and accessibility. Out of scope: choosing client timing values, restoring Pub/Sub or
Scheduler watch, polling, automatic drafting/sending, general inbox management, or provider/source
write.

**Open questions & assumptions.**

Client/Admin must still supply the actual timing fields/values and confirm who may manage property/
lease overrides; existing Admin-only management remains the safe state. The meeting's proposed
three-day and 45-day values are not policy until explicitly entered and marked client-confirmed.

**Cross-product impacts.**

Gmail linked-thread state/manual refresh, notice-rule store/Admin, S72 steps, S78 desk, work/attention,
notifications, audit, and S74 channel truth.

**Authority and evidence map.**

| Input                                                                                                                         | Classification                | Use and limitation                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md` communication boundary and `docs/facts.md` Gmail-watch/timing facts                                               | Authority                     | Follow-up state may create in-app attention only; continuous watch and every autonomous/scheduled/model-triggered client communication remain retired/forbidden. |
| Linked-thread Gmail refresh/state, notice-rule schema/store/API/Admin panel, reminder/attention code, and renewal projections | Verified implementation truth | Targeted manual refresh and audited rule precedence exist; the complete desk/workspace projection does not.                                                      |
| Notice-rule, refresh, reminder, attention, Gmail-hub, and send-boundary tests                                                 | Verification baseline         | They anchor cursor/idempotency and no-policy-no-effect behavior; shared-consumer parity and source lineage must fail first.                                      |
| Meeting proposals of three-day and 45-day follow-up                                                                           | Intent evidence only          | They identify a business question but are not policy. They must render as unset until a client/Admin supplies and confirms exact values.                         |
| Client-confirmed timing values and override-manager decision                                                                  | External product input        | Their absence blocks only computed due timestamps/work; waiting and last-contact evidence still works.                                                           |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S75-1** — One deterministic follow-up projection joins exact lease/thread identity, latest
  provider message evidence, waiting state, last contact, effective rule/version, and due state; desk,
  workspace, and work/attention consume that same projection.
- **ARCH-S75-2** — Rule resolution is audited/versioned, exact-scope unique, and deterministic global
  < property < lease. An unconfirmed/absent rule produces an explicit unset object rather than a
  default duration.
- **ARCH-S75-3** — Static/runtime checks prove follow-up projection and due attention import no Gmail
  draft/send, Scheduler/Pub/Sub watch, generic inbox, or source-writer capability.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S75-1** — Manual refresh updates waiting-on and last-contact only from the latest targeted
  linked provider thread and preserves cursor/idempotency under duplicate/out-of-order refresh.
- **BEH-S75-2** — Confirmed global/property/lease rules produce the same effective due state on desk,
  workspace, and work item; the most-specific current rule wins and its version/scope are visible.
- **BEH-S75-3** — Missing/unconfirmed policy shows “Timing policy not confirmed,” no due timestamp,
  reminder, work, draft, or send. Missing/deleted/unreadable thread shows Needs Verification rather
  than guessed contact.
- **BEH-S75-4** — A due item creates only in-app attention/work with the exact lease and last-contact
  evidence; dismiss/reopen/change-policy behavior is audited and never alters Gmail/provider state.

**Human litmus outcome.**

### See what a renewal is waiting on

**If this was built correctly:** A renewal operator can tell whether the team, owner, tenant, document
coordinator, or an unresolved source is holding the next step; can see the last verified contact; and
sees a due date only when an Admin has entered confirmed policy. Nothing is sent automatically.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

**Requirement-to-outcome traceability.**

| Requirement                                              | Architecture outcome | Behavior outcome         | Human litmus                                           | Deterministic evidence / falsification                                                                                 |
| -------------------------------------------------------- | -------------------- | ------------------------ | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| One source-backed waiting/contact/due projection         | `ARCH-S75-1`         | `BEH-S75-1`, `BEH-S75-2` | See what a renewal is waiting on                       | Consumer parity tests compare desk, workspace, and work item to one exact lease/thread/rule resolver.                  |
| Exact, versioned global/property/lease precedence        | `ARCH-S75-2`         | `BEH-S75-2`, `BEH-S75-3` | Due date appears only from confirmed policy            | Table tests cover add/edit/delete/history, scope uniqueness, most-specific-wins, and no-rule/unconfirmed-rule objects. |
| Duplicate, stale, or missing Gmail evidence stays honest | `ARCH-S75-1`         | `BEH-S75-1`, `BEH-S75-3` | Last contact cites real evidence or Needs Verification | Cursor/order/thread-loss fixtures prove no false contacted/waiting transition.                                         |
| Due state remains internal attention, never outreach     | `ARCH-S75-3`         | `BEH-S75-4`              | Nothing is drafted or sent automatically               | Static imports, provider spies, and retired watch/Scheduler checks prove zero draft/send/poll/provider mutation.       |

**Preservation set.**

Retired Gmail watch/Scheduler/Pub/Sub state, manual targeted refresh, cursor monotonicity, Gmail
read/action gates, no-policy-no-effect behavior, rule version/audit/uniqueness, Space isolation,
attention idempotency, and direct/automatic send prohibitions remain green as a separate gate.

**Adversarial acceptance checks.**

- **AC-S75-1** — `ARCH-S75-1` proves every displayed waiting/contact/due value carries exact source
  identity and that all consumers use one resolver.
- **AC-S75-2** — `ARCH-S75-2` and `BEH-S75-2/3` cover scope precedence, rule edits, unset policy,
  deleted rules, and historical version stability.
- **AC-S75-3** — `BEH-S75-1/3` covers duplicate/out-of-order/missing/deleted thread evidence without a
  false contacted or waiting claim.
- **AC-S75-4** — `ARCH-S75-3` and `BEH-S75-4` prove due state cannot draft, send, schedule, poll, or
  mutate a provider.

**Forbidden actions / hard gates.**

No guessed timing/contact/waiting value, hidden default timer, autonomous/scheduled/model-triggered
draft or send, continuous Gmail watch, general inbox expansion, false contacted status, retroactive
history rewrite, implicit override authority, or provider/source write.

**Dependencies / sequencing.**

S75 is independently implementable with timing policy unset. S72 consumes the projection for steps
2/3/5; S78 consumes it for triage; S74 consumes source-backed channel truth. No other suite may invent
timing values to make S75 appear complete.

**Standalone delivery contract.**

- **Deliverable now:** shared projection, exact source/rule lineage, manual refresh recovery, consistent
  desk/workspace/work consumption, unset-safe UI, audited internal attention, and tests can reach
  `ALL_GATES_GREEN` with no timing value configured.
- **Consumes, but does not assume:** S72 substep ids and S78 consumers may be absent; adapters expose
  the same projection contract and explicit unset values without duplicating calculation.
- **Externally blocked effect:** AC-S75-2's confirmed due-date branch remains `BLOCKED` for live
  policy evidence until exact client values and manager authority are supplied. The unset behavior is
  a passing product outcome, not an implementation blocker.
- **Produces for downstream suites:** one lease-bound waiting/last-contact/effective-rule/due/next-
  action projection and audited refresh semantics for S72, S78, S74, and internal work.

**Verification and delivery contract.**

1. Before editing, make the shared-consumer lineage/parity tests fail while recording manual-refresh,
   cursor, rule-resolution, no-policy-no-effect, watch-retirement, and send-boundary preservation.
2. Run `npm run test:direct -- tests/unit/lease-renewal-refresh-route.test.ts tests/unit/lease-renewal-notice-rule-config.test.ts tests/unit/lease-renewal-notice-rules.test.ts tests/unit/lease-renewal-notice-reminders.test.ts tests/unit/lease-renewal-attention.test.ts tests/unit/lease-renewal-send-boundary.test.ts` plus new projection-consumer tests.
3. Run `bash scripts/verify.sh`, inspect the diff, and audit Gmail bodies/identifiers, policy values,
   rule history, Scheduler/Pub/Sub imports, action keys, client effects, and logs.
4. Report `ALL_GATES_GREEN` for the complete unset-safe implementation; use
   `BUDGET_EXHAUSTED` only under an explicit budget. Use `BLOCKED` only for the named live confirmed-
   policy branch, never to substitute a proposed timer.

**Ordered prompt sequence.**

1. Capture current manual-refresh/rule behavior and add failing shared-projection/desk-consumer checks.
2. Freeze watch-retirement, cursor, no-policy-no-effect, rule audit, and send-boundary preservation.
3. Build the shared projection, canonical displays, attention/work behavior, and recovery states.
4. Test every scope/null/duplicate/out-of-order/missing-thread case and the canonical gate; enter no
   policy value without client/Admin confirmation.

**Deletion/merge recommendation.**

Remove after confirmed timing policy is entered, the projection is deployed across all consumers,
human litmus passes, and durable workflow/product docs carry the behavior.
