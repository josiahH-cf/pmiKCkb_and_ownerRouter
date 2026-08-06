<!-- spec-shape: overhaul-v1 -->

# S64 — Per-person approval authority

> New 2026-08-06. Owner direction (Q13): "B — Per person. The system should support differentiated
> approval authority so that specified users can receive broader approval or administrative
> capabilities while other users remain restricted. Treat this as a person-specific trust and
> authorization model rather than a universal action-type relaxation."
>
> **Execution is not yet authorized — and the reason is scope, stated precisely.** The 2026-08-06
> program grant in `AGENTS.md` is scoped to four named items: the four-lease test set, RentCast,
> recipient handling, and owner-policy rules. This suite is outside all four. That is the factual
> basis for not building it.
>
> A second argument is the runner's judgement rather than an existing rule, and is labeled as such:
> widening who may approve reads like lowering a safety control. The Cloud Automation Grant's
> "lowering a safety control" clause enumerates cloud and cost controls — budgets, the guardrail,
> authorized domains, alerts — not application approval authority, so it does not literally cover
> this. The recommendation stands on its own merits; it is not presented as an existing prohibition.
>
> The owner **did** answer the design question (Q13: per person), so the direction is settled and
> recorded in `docs/facts.md` independently of this suite's authorization state. What is missing is
> only permission to build.

**Goal.** Dan stops being the single point through which everything passes, without the app quietly
becoming a system where nobody checks anything. A named person can be trusted with a named class of
decision, that trust is recorded with a reason and a date, and it can be withdrawn. What changes is
who may approve, never whether an approval happened.

**What it is / how it functions.** There is no dimension to relax along today.
`lib/execution/risk-policy.ts` is a fixed map from action key to a Low, Medium, or High level plus a
kind; there is no per-user, per-owner, per-amount, or trust-accrual concept anywhere. Approval
transitions in `lib/firestore/approval-queue.ts` gate on the `approve` capability, which comes from a
three-role table in `lib/auth/roles.ts` where Editor holds `{read, edit, sendEmail}`, Approver adds
`{approve, resolvePlaceholder}`, and only Admin holds `manageAdmin`. Role is the only lever, and it
is all-or-nothing.

- **A grant, not a role.** Introduce a per-person approval grant: subject uid, the action class it
  covers, the Admin who granted it, a required plain-English reason, an effective-from date, and an
  optional expiry. Grants are additive only — a grant can widen what a person may approve and can
  never narrow what their role already permits, so revoking a grant returns them exactly to their
  role baseline and can never lock anyone out.
- **Class, not key.** Grants attach to a small, named set of action classes rather than to individual
  Registry keys. A per-key grant surface would drift the moment a key is added, and it invites
  granting authority over something nobody reviewed. The classes derive from the existing risk levels
  so the vocabulary is one the code already has.
- **High risk stays where it is.** A grant may widen Low and Medium approval authority. It may not
  confer authority over a High-risk action, over anything that writes to a client system of record,
  or over anything that sends to a client. Those keep their existing path. This boundary is the
  reason the suite is safe to build at all, and it is enforced in code rather than by convention.
- **Every grant is visible and audited.** An append-only record captures creation, modification, and
  revocation with the actor, the reason, and the timestamp — the same shape `/admin/users` already
  uses for role changes, which is the precedent this follows deliberately rather than inventing a
  second audit style.
- **The approval still happens.** A grant changes who is permitted to approve. It does not
  auto-approve, does not skip the queue, does not shorten the record, and does not remove the
  reason field. An approved item looks identical afterwards except for whose name is on it.
- **Bailey's case is already handled without this.** Promoting Bailey to Admin (owner direction Q8)
  gives her approval authority, so this suite is not on the critical path for the test set. Note the
  propagation caveat the owner flagged: roles are Firebase custom claims, so the change takes effect
  on her **next sign-in**, not immediately — she must sign out and back in before relying on it. That
  is tracked as `F-BAILEY-ADMIN-2026-08-06`, not here. The point of this suite is that the _next_
  three people should not each require an Admin promotion.

Buildable now (app-plane): all of the above, once authorized. Build to the seam (live provider):
none. Owner dependency (the one flip): an explicit extension of the program grant naming this suite.

**Open questions & assumptions.**

- _Open (owner):_ whether a grant should carry a default expiry, so trust is re-affirmed rather than
  accumulated silently. Default taken: no expiry, with the expiry field present and unused, because
  an expiry that surprises an operator mid-renewal is its own failure mode.
- _Open (owner):_ whether an Approver may grant, or only an Admin. Default taken: Admin only,
  matching `manageAdmin` on every other authority-changing surface.
- _Assumption:_ the existing risk levels are the right granularity for classes. If they are not, the
  class list is a constant and is cheap to change before anything is granted.
- _Assumption:_ the last-Admin guard and its known non-concurrency-safe limitation are untouched by
  this suite, because grants never remove authority.

**Cross-product impacts.**

- `lib/auth/roles.ts` and `lib/auth/session.ts` — **D12 protected** (`lib/auth/**`); prepared and
  surfaced for owner review, never pushed under the standing grant.
- `lib/execution/risk-policy.ts` — the class mapping.
- `lib/firestore/approval-queue.ts` — the permission decision consults role plus grants.
- A new Admin surface and its append-only audit, following the `/admin/users` precedent.
- `firestore.rules` — **D12 protected**; prepared and surfaced.
- Interacts with **S16** (`rbac-subusers.md`) and **S45** (`approval-queue-consolidation.md`).

**Adversarial acceptance checks.**

- **AC-S64-1** — A person with a grant covering a class may approve an item in that class; the same
  person without it is refused. _Verify:_ `npm test -- approval-queue`.
- **AC-S64-2** — A grant never narrows existing authority: revoking every grant leaves the person
  with exactly their role baseline, and no sequence of grant operations can lock anyone out.
  _Verify:_ `npm test -- approval-queue roles`.
- **AC-S64-3** — No grant confers authority over a High-risk action, a client-facing send, or a
  system-of-record write. Attempting to create one is refused. _Verify:_
  `npm test -- risk-policy approval-queue`.
- **AC-S64-4** — Grant creation, modification, and revocation are Admin-only, require a reason, and
  append an audit record naming the actor. _Verify:_ `npm test -- approval-grants`.
- **AC-S64-5** — A grant does not auto-approve anything: every approved item still carries an
  explicit human approval action with its reason. _Verify:_ `npm test -- approval-queue`.
- **AC-S64-6** — Grants are visible to Admins with their reason and date, so who may approve what is
  answerable without reading the database. _Verify:_ `npm test -- approval-grants`.
- **AC-S64-7** — With no grants present, every approval decision resolves exactly as it does today.
  The feature is inert until used. _Verify:_ `npm test -- approval-queue`.

Keep green: `tests/unit/action-registry-schema.test.ts`, `feature-suite-spec-shape.test.mjs`.

**Forbidden actions / hard gates.** No autonomous client-facing send; every send stays
human-initiated and exact-confirmed; generic non-workflow `gmail.message.send` stays Registry-closed;
no personal account in any auth path; no secret, token, PII, or guessed endpoint in git; the S52
production cost ceiling stands. This suite must not be built before the owner explicitly extends the
program grant to name it, because widening who may approve is lowering a safety control. It must not
grant authority over High-risk actions, client-facing sends, or system-of-record writes. It must not
introduce auto-approval, must not remove the reason requirement, must not weaken the last-Admin
guard, and must not allow a grant to reduce anyone's authority. `lib/auth/**` and `firestore.rules`
are D12 protected paths: prepared, isolated, and surfaced for owner review, never pushed.

**Ordered prompt sequence.**

1. _Owner:_ obtain an explicit grant extension naming this suite. Stop here until it exists.
2. _Discovery:_ re-read the role table, the approval transitions, and the risk map.
3. _Build:_ the grant store, its audit, and the Admin surface.
4. _Build:_ the class mapping and the permission decision that consults role plus grants.
5. _Build:_ the refusals for High risk, client sends, and system-of-record writes.
6. _Gate:_ prepare the `lib/auth/**` and `firestore.rules` changes as isolated D12 patches; surface
   them for owner review.
7. _Verify:_ falsify by attempting a grant over a High-risk key and observing AC-S64-3 fail closed.
8. _Verify:_ full gate including `test:firestore`.
9. _Context update:_ `docs/facts.md` `F-` row citing AC-S64-1 through AC-S64-7; update
   `docs/loop-state.md` and `docs/status.md`.

**Deletion/merge recommendation.** KEEP. It records both the design and the reason it waits on an
explicit authorization. The disposable cycle packet `docs/temp/per-person-approval-authority-plan.md` is CREATED AT SLICE START, not by this spec.
