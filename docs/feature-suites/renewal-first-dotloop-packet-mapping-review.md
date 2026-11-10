<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-walkthrough-2026-11-10 -->

# S268 — Review the first renewal packet against its approved Dotloop sources

> Status: AUTHORING READY, intake 146. Follow-on work. Unverified Dotloop form versions,
> field mappings and signing decisions are source pending.

**Goal.**

Staff can see exactly which forms and approved values the first real renewal packet needs,
identify each unresolved map decision, and continue manual drafting or safe independent
preparation while it waits.

**Current state / intended end state.**

S130/S235 already support per-family approved originals and maps, safe packet inputs and
exact local output. S34/S106 support the scoped Dotloop handoff and managed selection. The
eight private originals were recovered and the current managed selection already has its
own evidence. The walkthrough identified the remaining issue as what information and
mappings the actual drafter uses. A technical or connection success is not approval of a
map or a signing decision.

**Actors and entry conditions.**

The responsible renewal lead, the business/document authority or delegate, and the
existing Dotloop drafter use the existing packet checklist and review controls.
Engineering inventories the fields and checks reproducibility. Authorized staff continue
their existing document work. The provider only becomes an available target under its
exact existing gates and separate activation authority.

**What it is / how it functions.**

Select the first exact review case in the approved internal context. In Documents and
signatures follow the existing Packet inputs, readiness or Check destination entry.
Confirm each applicable family, source and map, identify the actual owner, tenant, agency
and conditional roles, then compare a safe synthetic rehearsal with the drafter’s manual
workflow. Record a decision or an exact pending requirement for each item and show which
outputs can proceed.

In **Documents and signatures**, show the first applicable packet input or its exact
**Source pending** handoff with form, missing evidence and responsible role. An Editor can
reach the existing **Packet inputs** work directly when an input is editable. Source and
map inventory, evidence versions and signing records are in **Verify forms and signing
evidence**. Preserve separately available manual preparation or handoff. Once human
signatures are outstanding, show the actual wait and the existing returned-document
action. A family that consumes the accepted offer's terms uses S262's current-cycle values
and S264's exact offer coverage. Where that family carries the same charge, an
offer/packet discrepancy holds the affected output. Independent packet-policy facts and
other families retain their own evidence and readiness.

- **R-S268-1 — Bind first-case applicability and versions.** For the first reviewed
  lease/cycle, enumerate the applicable forms and why each is required, conditional or not
  used. Verify each original, approved use and version/hash, packet inputs and current map
  version. Work from the recovered originals and reviewed source package. A changed
  original, competing version or unresolved business meaning blocks only that family.
  Staff can inspect readiness and use the existing manual handoff independently.
- **R-S268-2 — Review only unresolved field and signing decisions.** Record each
  unresolved item by form, page, meaning, approved source, responsible role and exact
  expected answer in the existing private proposal and U1/U2 paths. Preserve S253’s
  settled ordinary pet amount versus deposit/total, owner per-lease explanation and the
  four tenant-initial regions. Confirm the owner acknowledgment executed-on date rule and
  explanation starting text only from actual authority. Review representative/firm names,
  lead/receipt and agency selections, signer/initial order, overflow and more-than-four
  tenant handling, conditional animals and assistance policy. Keep unverified fields blank
  or held with their actual status. No inferred default, common printed name or
  signatures.
- **R-S268-3 — Keep preparation and provider handoff separate.** Retain existing permitted
  preview, manual preparation/handoff and readiness. If a later authorized exact operation
  is available, distinguish existing-loop upload from create-from-template, and use its
  current selection, reviewed bytes, confirmation and single-attempt recovery. Human
  signature and actual returned evidence remain separate. A provider listing, template
  visibility or uploaded hash does not imply execution, signature or approval.

**In scope / out of scope.**

The first exact packet mapping review, scoped application readiness and safe rehearsal on
the existing pipeline. No recreation of originals/templates or selection, new form
catalog, policy publication, provider effect, signing or change in action authority.

**Open questions & assumptions.**

- Source pending for applicable exact form versions and map approvals, remaining field
  meanings, conditional inputs, organization/representative and signing decisions listed
  in U1/U2 and S253. Request only unresolved decisions, with the first case and relevant
  form/page.
- November 19 at 2 p.m. Central is the verified meeting time for the renewal lead,
  decision-maker and existing drafter. The meeting itself cannot approve content without
  attributable exact decisions. The drafter’s role identifies the participant where
  transcript name spellings vary.

**Cross-product impacts.**

Documents and signatures and Documents and completion, current packet catalog and private
mapping review, S130 local PDF engine, S34/S106 connection/readiness, S235 packet
eligibility, S236 returned document evidence, Help and existing open-blocker intake.

**Authority and evidence map.**

| Input                                                                                                                | Classification                         | Use and limitation                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| November 10 Fathom walkthrough 47:42–50:08 and 54:09–58:10, plus accepted Q8 and the verified November 19 invitation | Walkthrough, owner decision and timing | Separate tenant-offer repairs from first packet field mapping. Include the actual drafter and document decision authority. |
| U1/U2/U4/U5, S66, S130, S235, S236 and S253                                                                          | Approved boundaries and source holds   | Exact originals and maps, content and field meaning, protected signing regions, actual signature evidence.                 |
| S34, S106, S228 and `lib/lease-documents/lease-packet-readiness.ts`                                                  | Authority and committed implementation | Existing selection/readiness and exact-key distinction. Template or connection evidence alone establishes no map approval. |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S268-1** — Reuse the existing per-family source catalog, readiness and exact case
  and map version. Bind one private review packet to the intended case and authoritative
  sources without duplicating the catalog.
- **ARCH-S268-2** — Use S66/S130/S235/S236 boundaries, including mapping versions and
  protected signature regions. Bind actual field answers and authority to exact bytes.
  Keep a stable distinction between saved source, proposed map, approved map and observed
  signed evidence.
- **ARCH-S268-3** — Reuse S34/S106/S235/S236 evidence, claimed operation identity and
  receipt-specific recovery. Both provider write keys stay closed for this work. A
  replayed or uncertain result cannot create a second attempt.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S268-1** — Staff can see which forms this case needs, where their exact approved
  source is and which named answer is missing. A stale map cannot appear approved for a
  changed original.
- **BEH-S268-2** — The drafter can point to a disputed field and identify who answers it
  and which output waits. A synthetic packet preserves protected signing areas and refuses
  a wrong or overflowing value.
- **BEH-S268-3** — Staff can prepare or hand off independent work and see which key,
  source or human action would still be needed. They can distinguish a prepared file from
  a signed returned file.

**Human litmus outcome.**

### Know exactly what the first renewal packet still needs

**If this was built correctly:** The renewal lead and drafter can open the same case,
identify the forms it needs and the precise missing decisions, and continue safe manual
work while actual signing and any provider action remain separate.

- Model verdict: NOT RUN
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                                 | Architecture outcome | Behavior outcome | Human litmus                                           | Deterministic evidence / falsification                                         |
| ----------------------------------------------------------- | -------------------- | ---------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| R-S268-1 Bind first-case applicability and versions         | ARCH-S268-1          | BEH-S268-1       | Know exactly what the first renewal packet still needs | AC-S268-1. Synthetic per-family readiness and source-bound evidence.           |
| R-S268-2 Review only unresolved field and signing decisions | ARCH-S268-2          | BEH-S268-2       | Know exactly what the first renewal packet still needs | AC-S268-2. Exact PDF, proposal review and local packet refusal/readback.       |
| R-S268-3 Keep preparation and provider handoff separate     | ARCH-S268-3          | BEH-S268-3       | Know exactly what the first renewal packet still needs | AC-S268-3. Guarded process, exact action refusal and signature/readback tests. |

**Preservation set.**

- Recovered originals and approved versions, current managed selection and read-only
  checks, exact per-family eligibility and refusal.
- S253 decisions within their recorded scope, protected signatures/initials, and separate
  actual returned-document evidence.
- Closed `dotloop.loop.create_from_template` and `dotloop.document.upload` keys, distinct
  receipt/reconciliation and human signing.

**Adversarial acceptance checks.**

- **AC-S268-1** — Verify required/optional/not-used families, absent and changed versions,
  mismatched hash and source refresh. Read the packet decision without preparing real
  output. Verify the missing input or exact map handoff leads with disclosures closed, and
  source versions are reachable without promoting the affected family to ready.
- **AC-S268-2** — Use synthetic originals to compare exact bytes and extracted/rendered
  output, required field and protected regions, overflow, per-form differences and changed
  versions. An unresolved legal mapping stays pending. A family that relies on an accepted
  charge with different packet economics identifies the exact discrepancy. Preserve
  unrelated family readiness and existing manual handoff.
- **AC-S268-3** — Under guards verify closed keys, correct action for each target,
  reused/uncertain attempts and returned-document evidence using synthetic fixtures.
  Confirm zero provider effects.

**Forbidden actions / hard gates.**

No real packet approval or publication from transcript, no new selection or key
activation, no loop creation, upload, signing or customer dispatch. Existing roles, scoped
effects, exact-target authorization, claims and receipt/reconciliation gates remain in
force.

**Dependencies / sequencing.**

Use U1/U2 and existing private sources, S66/S130/S235/S236 and S34/S106. Independent
tenant preparation remains available under S161. S269 and S270 can improve access to the
exact packet inputs without an approved real map.

**Standalone delivery contract.**

- **Deliverable now.** Case-specific readiness and pending map review on the current
  pipeline, safe synthetic packet, exact refusals and applicable Help.
- **Consumes, but does not assume.** Exact first-case choices and verified version-bound
  approvals when supplied. Absent map meaning stays source pending.
- **Externally blocked effect.** AC-S268-2 blocks the affected real output until
  authorized sources and mappings are confirmed. AC-S268-3 separately retains the
  exact-key and human-signing gates.
- **Produces for downstream suites.** A version-bound mapping and case readiness record
  usable by the existing document pipeline after separate approvals.

**Verification and delivery contract.**

1. Re-establish the current authorized baseline. Before editing, prove the named
   structural and behavioral failures for the expected reason. Where an assertion
   describes deployed behavior, record it as a separate preservation check.
2. Run current packet, rendering, action-policy, receipt recovery and signed-evidence
   tests with synthetic inputs and no provider effects. Use synthetic fixtures for effects
   and guarded read-only production probes where authorized. Run the affected Help and
   control-map checks.
3. For an authorized application candidate, run `bash scripts/verify.sh` and
   `npm run test:e2e:core`, complete the scoped S271 qualification on the exact build, and
   follow the current release gates.
4. Record `ALL_GATES_GREEN` only for completed verification, `BUDGET_EXHAUSTED` only under
   an explicit budget, and `BLOCKED` for the precise unresolved effect or input. Separate
   engineering, external and observed human verdicts.

**Ordered prompt sequence.**

1. Verify the starting behavior and register fail-first or preservation checks.
2. Select the controlled review case and confirm existing technical and authority
   evidence.
3. Reconcile its forms and fields through the existing per-family review and exercise
   synthetic output and exact refusals.
4. Run the focused and applicable cumulative checks and record the actual outcomes.

**Deletion/merge recommendation.**

Keep active until its behavior, evidence and source-dependent boundaries are represented
by verified code, tests and current facts.
