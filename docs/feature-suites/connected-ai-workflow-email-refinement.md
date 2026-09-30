<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: connected-ai-batch-002 -->

# S139 — AI refinement in workflow-linked email drafts

> Intake: ready, batch 002 item 006. The owner clarified on 2026-09-30 that this covers **all existing workflow-linked draft screens**. Scope only; no draft or send operation ran at intake.

**Goal.**

Staff can instruct AI to revise the current email in each existing record-linked draft workflow, review and edit the result, and carry accepted wording through that workflow's actual local save or governed Gmail handoff.

**Current state / intended end state.**

The quoted “update the email here” control is not present verbatim. Renewal owner/tenant `RenewalMessagePreparation` has a response-request wording field, prepared body and app save, copy, and exact unsent Gmail draft creation. Maintenance owner notice has preview/create but no body editor; resident reply has subject/body entry and gated unsent creation. Gmail Hub `WorkflowCommunicationPanel` has a manual “Human draft to improve” and transient model proposal tied to a workflow thread, followed by its existing exact-confirmation path. The concrete `GmailRuntimeClient` and renewal provider expose create/readback/reconcile, with no update-draft method in this checkout. A local revision must never be described as a Gmail update.

**Actors and entry conditions.**

An authenticated staff member with existing edit/draft access to the selected renewal, maintenance ticket/message, or linked workflow communication and the correctly bound managed mailbox. The server re-derives record, actor, recipient, and scope.

**What it is / how it functions.**

Add a labelled instruction field beside the current draft in each workflow-linked screen: renewal owner/tenant message preparation, maintenance owner notice, maintenance resident reply when its exact draft gate is available, and Gmail Hub workflow reply. Inventory any additional existing record-linked draft screen during implementation and apply the same contract; generic template/anticipatory tools without a selected workflow record are outside this scope. Send the latest edited draft, selected workflow/template context, accessible verified facts, and current instruction through S136/S137. Present a revision before applying it; manual edits remain available, adding an in-place editor where a current screen only shows a prepared preview. Subsequent prompts start from the newest accepted/manual text. A late response cannot overwrite newer edits. Style-only prompts preserve recipients, names, amounts, dates, deadlines, approved terms and required template content. Explicit factual edits change draft text only, with specific conflict clarification where needed; they never update source records.

**In scope / out of scope.**

The existing record-linked draft screens and their actual app save/reload or transient state, exact preview/confirmation and handoff. No separate composer, general inbox assistant, template publication, new business approval, autonomous message creation, or client send. Existing human-confirmed communication actions retain their own authority; refinement grants none.

**Open questions & assumptions.**

The screen-scope question is resolved by the owner's “all existing workflow-linked draft screens” answer. The exact persistence path differs by screen; inspect it rather than assume every preview is saved. Gmail draft update capability and action authority are unverified: current app code has create/readback but no update method. If an existing Gmail draft cannot be safely updated under an exact authorized contract, preserve an app-only revision and offer the least disruptive honest handoff; never create duplicate replacement drafts silently. An exact new provider action/key or protected-path change needs its separate router authority before push/activation.

**Cross-product impacts.**

Renewal message preparation/copy and draft provider, Maintenance owner/resident draft routes, Gmail Hub workflow reply proposal, shared model/context, local persistence where present, exact preview/claim/receipt/readback, and the signed-in Gmail account.

**Authority and evidence map.**

| Input                                        | Classification           | Use and limitation                                                         |
| -------------------------------------------- | ------------------------ | -------------------------------------------------------------------------- |
| Current components, routes and Gmail client  | Verified code            | Multiple different draft states; no implemented Gmail draft update.        |
| Source item 006 and owner screen-scope reply | Owner intent             | All record-linked draft screens, iterative wording and honest persistence. |
| Gmail live capability/permission             | Unverified external seam | Confirm before any claim that an existing Gmail draft was updated.         |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S139-1** — A shared actor/record-scoped refinement contract takes the latest draft revision and instruction, isolates untrusted source text, and rejects stale apply; two-instruction/manual-edit fixtures fail on current screens.
- **ARCH-S139-2** — Each in-scope screen binds accepted text to its actual save/reload or labelled transient state and exact Gmail preview/receipt; no duplicate draft or unverified update claim.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S139-1** — “Shorter and warmer” changes wording but preserves operative facts; an explicit new fact is draft content only and a material conflict asks one focused question.
- **BEH-S139-2** — Generation, late response, save, and Gmail failure keep the latest human text/instruction and report the actual failed step; a confirmed handoff contains the accepted text in the intended mailbox.

**Human litmus outcome.**

### Refine and review a linked email

**If this was built correctly:** Staff make two wording requests, manually edit the result, preview the exact message and find their accepted wording after the workflow's supported save or Gmail handoff. Record model verdict; without an observer use `Human verdict: NOT RUN — no human observer`.

**Requirement-to-outcome traceability.**

| Requirement                         | Architecture outcome | Behavior outcome | Human litmus                     | Falsification                                                                  |
| ----------------------------------- | -------------------- | ---------------- | -------------------------------- | ------------------------------------------------------------------------------ |
| All linked screens and latest draft | ARCH-S139-1          | BEH-S139-1       | Refine and review a linked email | Screen inventory, two prompts, manual intervening edit, style/fact fixtures.   |
| Persistence and exact handoff       | ARCH-S139-2          | BEH-S139-2       | Refine and review a linked email | Reload, stale response, ambiguous Gmail result and duplicate-attempt fixtures. |

**Preservation set.**

Renewal approved-copy/readiness, source-specific recipient and banner rules, current manual edits, workflow association, attachments, exact one-attempt draft recovery, human sending, and closed direct-send keys stay green.

**Adversarial acceptance checks.**

- **AC-S139-1** — Every existing record-linked draft screen supports an instruction separate from body text; two iterations use the latest accepted/manual draft and preserve style-only facts.
- **AC-S139-2** — Save/reload and authorized unsent Gmail handoff carry accepted text where supported, with exact account/recipient/subject/attachment binding and no duplicate on retry.
- **AC-S139-3** — Timeout, stale response, unavailable save/update, and ambiguous provider result keep user text, distinguish app-only from Gmail state, and never send automatically.

**Forbidden actions / hard gates.**

No model-driven client send, new update key activation by inference, silent Gmail replacement, recipient or source-record rewrite, unverified fact, raw customer content in Git, or new mailbox scope.

**Dependencies / sequencing.**

Intake order 006; consumes S136/S137. S140 adds only a UI suggestion, and S141 verifies the integrated path. S100 resident-draft proof/key remains closed until its existing exact gates pass; refinement does not activate it.

**Standalone delivery contract.**

Refinement, safe local state, and honest supported handoff for each currently available workflow can be built without claiming unavailable Gmail update authority. If exact existing-draft update is unsupported or unapproved, that effect remains explicitly unavailable while app-only revision and existing creation paths are truthful.

**Verification and delivery contract.**

Map every linked screen and store/provider path; fail-first latest-revision, safety, reload and Gmail-attempt cases; focused/canonical gates; use non-production fixtures for failure/duplicate tests and only authorized real readback for live draft verification. Do not create a real customer draft solely for proof without its existing gate.

**Ordered prompt sequence.**

1. Recheck the complete workflow-linked screen inventory and exact save/Gmail capabilities.
2. Record fail-first cases and preservation baseline for each screen.
3. Add in-place instruction, revision and safe state/handoff contracts.
4. Verify supported workflows and report app-only versus Gmail-confirmed outcomes separately.

**Deletion/merge recommendation.**

Retire after shipped code/tests and current facts own every in-scope screen and exact remaining provider limitation.
