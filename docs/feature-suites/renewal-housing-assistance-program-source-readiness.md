<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-walkthrough-2026-11-10 -->

# S266 — Keep housing-assistance contacts usable and qualify a future RentVine source

> Status: AUTHORING READY, intake 144. Follow-on work. RentVine program/vendor records and
> approved read scope are source pending.

**Goal.**

Staff can record and retrieve assistance facts with their actual provenance, and can
determine whether a later verified RentVine program record is ready to use without
inferring that a tenant receives assistance.

**Current state / intended end state.**

S251 already stores Housing assistance once. Unanswered is Not set, explicit No is a staff
fact, and Yes requires a program with optional contact and notes. The assisted path starts
with program contact and owner renewal answer before the applicable rent path. The meeting
proposed a staff-maintained program/vendor inventory over the following months. The
application has no verified mapping from that inventory to its assistance record.

**Actors and entry conditions.**

A scoped operator uses Check the numbers and the applicable assisted outcomes. The team’s
designated program-data steward maintains any future RentVine inventory under a separate
business process. An authorized Admin or integration reviewer can assess future read
access and the source mapping. No RentVine editor entitlement follows from a renewal role.

**What it is / how it functions.**

Review the existing lease’s Not set, No or Yes state and record a verified program when
applicable. Keep authorized contact details and notes within the established field and
program-contact path. Where the future source is unavailable or ambiguous, keep the
working value and continue manually. Where a source is independently verified, review the
exact program identity before it can be suggested to staff under a later approved read
scope.

On an ordinary unrecorded lease, **Housing assistance** remains in **Correct other lease
facts** and Not set creates no required task. An explicit task or material program
indication brings that same field into Work without preselecting an answer. After verified
Yes, the first assisted outcome shows the program and its current contact input or action.
An available verified staff contact and the manual record path remain usable while
RentVine program/vendor evidence is source pending. The contact, owner answer and rent
choice stay separate and in that order.

- **R-S266-1 — Preserve the explicit assistance fact.** Keep Not set, No and Yes distinct
  across Guided, Full and the working record. Staff may leave an ordinary case unrecorded.
  Yes requires a verified program name or identity through the existing editor and allows
  optional contact and notes. Never infer assistance from a vendor, payment, tenant name,
  program note or charge. Display a source hint separately when the current records are
  insufficient.
- **R-S266-2 — Keep program work in its existing path.** After Yes, put the program
  contact and action or waiting state in the current assisted outcome. Only the existing
  reviewed evidence and choices determine the subsequent owner renewal answer and rent
  path. Respect supported same-rent, propose-change and non-renewal branches, preserve
  staff evidence, and keep private contacts and process notes out of tenant/owner content
  unless explicitly and independently authorized.
- **R-S266-3 — Qualify the vendor source before use.** Reuse the existing source readiness
  and manual evidence paths to document whether the approved future inventory is usable. A
  candidate needs a business-maintained record, stable provider vendor/program ID, exact
  mapping, current permitted read, approved contact/notes fields and provenance. A
  duplicate, missing, inactive, stale or unapproved record remains source pending and
  cannot replace staff data. Once those gates are verified and use is separately
  authorized, the integration may suggest verified contact information for staff review
  using an exact ID. No name-only match or automatic inference. Keep the manual path
  available.

**In scope / out of scope.**

Existing assistance tracking, program-contact visibility and a fail-closed readiness
contract for future program/vendor reads. The client’s inventory creation and vendor
record maintenance are human work. Provider implementation is limited to separately
authorized read scope once its prerequisites are known. No maintenance, operational vendor
management or payment/remittance automation.

**Open questions & assumptions.**

- Source pending for the actual inventory, stable IDs, field/notes policy, read
  capability, data steward and representative verified mapping. The meeting described a
  multi-month effort, with no committed vendor import schedule or app authorization.
- The spoken default-No description conflicts with the deployed unset/explicit-No
  distinction. Q6 preserves Not set and permits staff to proceed when appropriate.
  Program-specific deadlines, payment practices and rent policy need their own sources.

**Cross-product impacts.**

Check the numbers, applicable assisted outcomes and Full owner section, S251 working
record and manual activities, existing source readiness and Help. A later provider read
uses the approved existing identity and permission review.

**Authority and evidence map.**

| Input                                                                                                                                  | Classification              | Use and limitation                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------- |
| November 10 Fathom walkthrough 0:00–1:25 and 14:45–16:17, plus accepted Q6                                                             | Proposal and owner decision | Preserve current tracking and keep the proposed vendor inventory as a source-dependent follow-on. |
| S251, S247, S248 and AGENTS.md product and action boundaries                                                                           | Authority                   | Keep program-first ordering, one source of progress and no revived vendor management.             |
| `components/lease-renewal/RenewalHousingAssistance.tsx`, `lib/lease-renewal/working-record.ts` and `lib/lease-renewal/renewal-path.ts` | Committed implementation    | Existing field, variants, and exact owner actions. These do not prove vendor access.              |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S266-1** — Use the existing working field and S251 variant projection with one
  owner. Preserve legacy records and exact revision behavior. Future source signals cannot
  set Yes or No.
- **ARCH-S266-2** — Reuse S251’s program contact activity and shared status projection.
  Route through the existing verified program, exact actor and case. Presentation can
  prioritize these inputs without adding a provider effect.
- **ARCH-S266-3** — Define a source fixture and candidate contract on the existing
  assistance field/readiness seam. The source-pending behavior and read-only
  candidate/refusal can be checked without provider access. Existing staff notes retain
  authorship and do not get copied into other views or communications.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S266-1** — On an ordinary unrecorded lease, the operator sees Not set and can
  proceed as today. On a verified assisted lease, staff enter the program once and reopen
  the same fact.
- **BEH-S266-2** — Staff see the contact they recorded and the next applicable step, and
  can correct an unavailable contact locally without starting a paid comparison or writing
  a vendor.
- **BEH-S266-3** — Staff can tell whether a vendor record is a verified program source,
  why a lookup is pending and where to enter the known contact. Two similarly named
  vendors do not yield a match.

**Human litmus outcome.**

### Find the right program contact and continue the assisted case

**If this was built correctly:** A staff member can leave an ordinary lease unanswered,
record a verified assisted program once, find its contact when needed and see a clear
manual path if a future source is unavailable.

- Model verdict: NOT RUN
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                     | Architecture outcome | Behavior outcome | Human litmus                                                  | Deterministic evidence / falsification                                                  |
| ----------------------------------------------- | -------------------- | ---------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| R-S266-1 Preserve the explicit assistance fact  | ARCH-S266-1          | BEH-S266-1       | Find the right program contact and continue the assisted case | AC-S266-1. Working-record and compiled path checks.                                     |
| R-S266-2 Keep program work in its existing path | ARCH-S266-2          | BEH-S266-2       | Find the right program contact and continue the assisted case | AC-S266-2. Variant browser route and guarded zero-effect checks.                        |
| R-S266-3 Qualify the vendor source before use   | ARCH-S266-3          | BEH-S266-3       | Find the right program contact and continue the assisted case | AC-S266-3. Provider contract fixture and explicit fallback without changing staff data. |

**Preservation set.**

- S251 saved distinctions, source note, program-first contact, owner answer, rent choice
  and existing paid-read hold.
- Exact role/Space and cycle checks, no inferred progress, and preserved optional workflow
  for an ordinary lease.
- S227 retirement of operational Vendor and maintenance work.

**Adversarial acceptance checks.**

- **AC-S266-1** — Exercise Not set, No, Yes, mention-only, revoked scope and concurrent
  save. Verify ordinary Not set does not lead the outcome, an explicit task reveals the
  one field, and a program indication leaves the answer unset. Read the exact cycle and
  verify no unintended data effects.
- **AC-S266-2** — Verify program-first ordering, no new effect from disclosure, and that
  Keep the current rent, no answer and non-renewal preserve their existing consequences.
- **AC-S266-3** — Use absent API capability, duplicate labels, stale/incorrect ID,
  conflicting notes and valid verified synthetic identity. No provider interaction or live
  import in qualification.

**Forbidden actions / hard gates.**

No vendor creation, edit, sync, import, payment change, new grant, or inferred
participation. Keep private program contacts and notes in existing authorized boundaries.
Existing roles, scoped effects, exact-target authorization, claims and
receipt/reconciliation gates remain in force.

**Dependencies / sequencing.**

Uses deployed S251 independently. S269 and S270 can use existing working-record and
activity states without a RentVine vendor source. Future authorized read needs the exact
source and scope defined here.

**Standalone delivery contract.**

- **Deliverable now.** Current path and contact verification, source provenance/pending
  presentation where needed, safe manual fallback and a synthetic
  verified-source/readiness contract.
- **Consumes, but does not assume.** Existing staff evidence and a future provider
  identity only when separately verified and authorized.
- **Externally blocked effect.** AC-S266-3 holds real program-source suggestions while
  provider records, read scope or exact mappings are absent.
- **Produces for downstream suites.** An honest program identity and read-readiness
  contract for future staff-reviewed reuse.

**Verification and delivery contract.**

1. Re-establish the current authorized baseline. Before editing, prove the named
   structural and behavioral failures for the expected reason. Where an assertion
   describes deployed behavior, record it as a separate preservation check.
2. Run working-record, variant/stage, permissions and guarded source-fallback checks, and
   walk the assisted path with synthetic contacts. Use synthetic fixtures for effects and
   guarded read-only production probes where authorized. Run the affected Help and
   control-map checks.
3. For an authorized application candidate, run `bash scripts/verify.sh` and
   `npm run test:e2e:core`, complete the scoped S271 qualification on the exact build, and
   follow the current release gates.
4. Record `ALL_GATES_GREEN` only for completed verification, `BUDGET_EXHAUSTED` only under
   an explicit budget, and `BLOCKED` for the precise unresolved effect or input. Separate
   engineering, external and observed human verdicts.

**Ordered prompt sequence.**

1. Verify the starting behavior and register fail-first or preservation checks.
2. Trace the deployed assistance path, prove unset semantics and inventory limits.
3. Verify one exact source/readiness contract and fallback before considering a real
   program read.
4. Run the focused and applicable cumulative checks and record the actual outcomes.

**Deletion/merge recommendation.**

Keep active until its behavior, evidence and source-dependent boundaries are represented
by verified code, tests and current facts.
