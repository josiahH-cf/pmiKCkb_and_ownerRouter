<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-walkthrough-2026-11-10 -->

# S267 — Train scoped staff to prepare renewals and review progress internally

> Status: AUTHORING READY, intake 145. Follow-on work. Implementation and verification
> pending.

**Goal.**

The two nominated staff can learn and perform their permitted renewal preparation and the
responsible lead can review progress through existing internal tools while current
communication and pricing authority remain explicit.

**Current state / intended end state.**

The app already has Renewals role/Space controls, case preparation and review, Help,
scoped collections and My Work, and a published owner-renewal-outreach process. The
published process has unresolved staff routing placeholders. The walkthrough discussed
having two staff help with preparation, keeping the lead involved and reviewing rent
choices. Neither new grants nor an approval chain were decided.

**Actors and entry conditions.**

A staff lead and the two nominated teammates use their existing managed identities and
current scopes. Scoped staff can inspect training and case work. Editors can use currently
authorized actions. An Admin or process owner can address the existing routing question
after the business identifies actual people and responsibilities.

**What it is / how it functions.**

Start in signed-in Help or the existing approved renewal process and follow a synthetic
case from the Desk. Review sources, prepare a recommendation and draft, identify who can
review and what remains pending, then find the case internally without adding recipients
to owner or tenant mail.

Teach the Guided path first in the existing Help material. Use the scoped Renewal Desk and
the actual active field or exact fix on each outcome. Have the trainee open a named
Verification group to explain the source, then return to the same work or show its Full
counterpart. The lead uses the existing scoped Desk or internal link and the single Work
status entry to review progress. The rehearsal distinguishes a missing source, internal
staff review and the real approval or dispatch action.

- **R-S267-1 — Teach the existing scoped journey.** Update the affected existing Help and
  staff walkthrough for source verification, recommendation versus owner approval, tenant
  fees and dates, exact review, uncertain sends and document handoff. Use synthetic
  examples and precise existing destinations. Explain which actions a current scoped
  Editor or permitted reader can perform and where existing Admin-only settings live. Do
  not assume the trainees already have any particular case grant.
- **R-S267-2 — Make progress visible internally.** Use the current scoped Renewal Desk,
  lease Work status/history and existing internal collection/My Work or process links
  where already authorized. Teach and preserve the current review handoff and verified
  current progress. A status note does not assign a case, establish approval or make a
  message delivered. Preserve membership and scope rules. New routing waits on the
  existing B-PROCESS-OWNER decision.
- **R-S267-3 — Keep decisions and authority distinct.** The training and review view
  distinguish a staff recommendation, an existing team review or handoff, verified owner
  amount and scope, exact tenant offer confirmation, tenant response and human signing.
  Preserve current individual editor permissions, exact action grants and independent
  preparation. The team decides any future pricing review policy, who owns the process and
  any explicitly authorized recipient rule separately.

**In scope / out of scope.**

A staff training and internal review path on existing roles and scoped surfaces. No role,
Space, member, recipient, routing, Action Registry or policy mutation. Actual training,
assignment and approval remain human work.

**Open questions & assumptions.**

- B-PROCESS-OWNER remains source pending for the exact managed process owner and any
  default approver under the existing model. Preserve published routing placeholders and
  do not start a real run to discover who gets assigned.
- The team has not approved mandatory review for a staff rent proposal, an external Cc
  default, a delegation policy or a new role. Current internal visibility and existing
  scoped actions suffice for this tranche.

**Cross-product impacts.**

Signed-in Help, Renewals Desk, one sticky Work status/history, scoped collections and My
Work, existing owner-renewal-outreach process, exact message and approval surfaces.

**Authority and evidence map.**

| Input                                                                               | Classification                 | Use and limitation                                                                                                                                                |
| ----------------------------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| November 10 Fathom walkthrough 21:32–26:28 and 54:09–55:24, plus accepted Q7        | Team intent and owner decision | Train the nominated staff in preparation and keep the lead involved internally. Discussion of editing and approval did not settle new grants or a recipient rule. |
| S156, S182, S201, S224, S234, S241, S242, S243, S248 and S252, plus B-PROCESS-OWNER | Active contracts and hold      | Existing access, truthful status, one review and exact scoped staff routing.                                                                                      |
| Current plan and loop state, published owner-renewal-outreach process readback      | Verified baseline              | Process content is published. Staff owner/default routing remains unresolved.                                                                                     |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S267-1** — Use S242/S243/S252 and the existing published process source. One
  guide and control map reflect tested current targets and role-specific capabilities.
- **ARCH-S267-2** — Reuse existing scoped read models and deep links, with no secondary
  progress store or outside copy. Retain one status and history entry and the exact
  lease/cycle context.
- **ARCH-S267-3** — Use existing capability, S234 approval, send review and signing gates.
  No added approval document, universal approver or default Cc is introduced.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S267-1** — A trainee can find the work, understand which action is theirs, and
  explain how to hand off an unavailable action without reaching for an Admin login.
- **BEH-S267-2** — A lead with existing access can find the draft, recommendation, pending
  outcome or current hold and continue the exact case. A user without access cannot read
  it or receive it as an automatic copy.
- **BEH-S267-3** — A staff member prepares the lease and the lead sees the review state.
  Neither is presented as the owner’s approval. The actual offer review still shows its
  existing recipients and the responsible sender.

**Human litmus outcome.**

### Hand off a renewal to a trained teammate

**If this was built correctly:** A trainee can find the renewal, check its facts and
prepare what their role allows. The lead can follow its current status and review the work
internally while the actual owner decision, outgoing offer and signatures stay separate.

- Model verdict: NOT RUN
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                    | Architecture outcome | Behavior outcome | Human litmus                             | Deterministic evidence / falsification                                      |
| ---------------------------------------------- | -------------------- | ---------------- | ---------------------------------------- | --------------------------------------------------------------------------- |
| R-S267-1 Teach the existing scoped journey     | ARCH-S267-1          | BEH-S267-1       | Hand off a renewal to a trained teammate | AC-S267-1. Rendered Help, role and source-path checks.                      |
| R-S267-2 Make progress visible internally      | ARCH-S267-2          | BEH-S267-2       | Hand off a renewal to a trained teammate | AC-S267-2. Compiled internal handoff and role/effect readback.              |
| R-S267-3 Keep decisions and authority distinct | ARCH-S267-3          | BEH-S267-3       | Hand off a renewal to a trained teammate | AC-S267-3. Capability and exact communication/approval preservation matrix. |

**Preservation set.**

- Current role/Space eligibility and exact handler/effect gates. Current authorized Editor
  preparation and Admin-only controls.
- S224 sender identity, verified party and no implicit recipients, S234 approval scope,
  and existing signed-in Help access.
- Published process content and existing human routing hold.

**Adversarial acceptance checks.**

- **AC-S267-1** — Drive the guide on synthetic existing roles and prove each named target,
  including a denied user. Walk the exact Guided work, Verification, Full and return
  destinations, plus the one internal Work status entry. No grant change or real case is
  needed for rehearsal.
- **AC-S267-2** — Check current authorized and unauthorized collection/lease links,
  status/progress parity and unresolved routing. Assert unchanged recipient fields and no
  mail side effect.
- **AC-S267-3** — Try off-scope roles, incomplete owner evidence, stale revisions and
  unverified sender/recipient. Current authorized paths and existing refusals must remain
  identical outside the new Help and internal pointers.

**Forbidden actions / hard gates.**

No grants, guessed staff UID, forced general approver, recipient default, mail, real
training case or production task run. Existing roles, scoped effects, exact-target
authorization, claims and receipt/reconciliation gates remain in force.

**Dependencies / sequencing.**

Existing roles, Help, status and internal process. Refresh examples after S261–S265 and
S269–S270 where relevant. Training from the present flow can proceed independently. Any
actual routing change belongs to the existing authority.

**Standalone delivery contract.**

- **Deliverable now.** Role-specific Help, current internal handoff and guarded training
  rehearsal, with exact pending routing clearly stated.
- **Consumes, but does not assume.** Existing published process and already scoped
  identities. An unresolved owner remains an explicit external decision.
- **Externally blocked effect.** AC-S267-2 leaves actual process assignment blocked by
  B-PROCESS-OWNER. No new authority is required to verify Help and read-only internal
  visibility.
- **Produces for downstream suites.** An operator-readable role/action guide and an exact
  review handoff for S271.

**Verification and delivery contract.**

1. Re-establish the current authorized baseline. Before editing, prove the named
   structural and behavioral failures for the expected reason. Where an assertion
   describes deployed behavior, record it as a separate preservation check.
2. Run existing role, process, message and Help tests plus guarded
   operator/reader/internal-review scenarios. Use synthetic fixtures for effects and
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
2. Check current permitted surfaces and reconcile the process placeholder with
   B-PROCESS-OWNER.
3. Write and drive the existing role-scoped walkthrough and prove no changes in grants,
   recipients or admissions.
4. Run the focused and applicable cumulative checks and record the actual outcomes.

**Deletion/merge recommendation.**

Keep active until its behavior, evidence and source-dependent boundaries are represented
by verified code, tests and current facts.
