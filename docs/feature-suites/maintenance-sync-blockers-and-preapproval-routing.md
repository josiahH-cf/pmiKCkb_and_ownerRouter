<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-completion-v1 -->

# S108 — Maintenance work-order alignment, blockers, and preapproval routing

> Status: DEPLOYED in `f5faf1665121db9cacff913a57e7fdcc80513116` / `pmi-kc-app-rmtwdl4di-4439f17911f4`. Exact CI 34556917662 and S51/S54 candidate, promotion, observation and readback passed. Verified provider snapshots and property-bound effective preapproval drive one waiting-on projection. Missing/conflicting/legacy property evidence remains unresolved. B-MNT1 live proof still needs exact properties, amounts and dates.
> Current applicability: historical delivery evidence only; operational requirements are superseded by S227. No former maintenance or provider proof is queued.
>
> Amendment 2026-10-01 (owner decision, B-MNT1): the RentVine maintenance-limit preapproval import is implemented and tested; its release is queued.

**Goal.**

Retain the original maintenance/vendor records, receipts, permissions and historical requirement evidence after custom maintenance retirement. S227 owns the current operating contract; Vendoroo remains standalone.

**Current state / intended end state.**

October 15 30:54–31:32 and the confirming maintenance emails retire the custom workflow. The source baseline 0b892865 contains the earlier implementation or proposal recorded below; S227 retires operational entry and preserves authorized read-only history. S227–S229 are under verification, with no new deployment claimed. Earlier authoring and delivery evidence retains its original scope.

**Actors and entry conditions.**

Existing authorized readers retain their current permissions. No new maintenance intake, vendor work, provider action, maintenance draft, integration access request or old proof window may start from this contract. Shared renewal and knowledge behavior remains separately owned.

**What it is / how it functions.**

Read-only retention uses the existing stores and receipt/history readers under their original authorization, with operational requests refused before dispatch. No records are deleted or relabeled. Current maintenance is managed in standalone Vendoroo; no destination URL or integration is invented.

**In scope / out of scope.**

Only retention, historical interpretation and permission compatibility remain applicable. All former operational maintenance/vendor requirements and Vendoroo ingestion work in the historical trace below are superseded by S227. Raw private sources remain outside Git. This file grants no new execution or release authority.

**Open questions & assumptions.**

Former provider/account/policy inputs are not prerequisites for retirement and must not trigger duplicate requests. Fresh read-only provider evidence and deployment are held only by the exact authentication/browser limitations recorded in docs/open-blockers.md. Missing observations are not success.

**Cross-product impacts.**

S227 owns retired HTTP and shared effect admission, authorized history and reports. Existing stores, receipts and permissions remain unchanged. Renewal, workflow-linked unsent communications, search and knowledge retain their independent contracts. The historical architecture below identifies original owners for preservation only; it does not request extensions or integration.

**Authority and evidence map.**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

| Input                                                   | Classification                   | Use and limitation                                                                   |
| ------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------ |
| `AGENTS.md`, S99, S100, S47, committed maintenance code | Authority / implementation truth | Human-initiated reads, exact keys, closed attachments/vendor assignment, no polling. |
| Owner package PMI-08                                    | Intent evidence                  | Blocker visibility and preapproval routing.                                          |

**Architecture outcome (deterministic, fail-first).**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

- **ARCH-S108-1** — Provider snapshot persists on the link document from the S99 read path only; a
  fixture expecting a snapshot after a read fails today.
- **ARCH-S108-2** — One waiting-on projection feeds queue, report, and S109 handoff; a preapproval
  fixture yields `none` where today the ticket would wait on the owner.
- **ARCH-S108-3** — The import plan is a pure projection of RentVine's property limits and the
  current app records, keyed by the RentVine property id the routing already uses; its hash covers
  every amount, version, action, note and skip.

**Behavior outcome (deterministic, fail-first).**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

- **BEH-S108-1** — A read work order appears once with status, snapshot, unit, and assignment; a
  second read updates, never duplicates.
- **BEH-S108-2** — Estimate `400` under preapproval `500` skips owner approval; `600` or no estimate
  waits on the owner with the draft control.
- **BEH-S108-3** — Differing app and provider statuses render both with a next action; neither side
  is overwritten.
- **BEH-S108-4** — A `500.00` RentVine limit with no app record previews as Add and records 50,000
  cents at version 1 after one confirmation; a property without a limit keeps its current app
  preapproval.

**Human litmus outcome.**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

### Every open item says what it is waiting on

**If this was built correctly:** A manager opens the maintenance list and sees for each item whether
it waits on the owner, the resident, a vendor, scheduling, or an estimate, with a link to the
RentVine work order. Small jobs at preapproved properties do not wait on the owner.

- Model verdict: PASS - why: the queue and report show each open ticket's blocker with its next
  action; an estimate at or under the property preapproval reports `ownerDecisionRequired: false`
  and withdraws the owner-notice control, while `600` against a `500` preapproval and any ticket
  with no recorded estimate stay on `owner_approval` with the draft control offered; a differing
  app and RentVine status renders both with the exact next action and overwrites neither. The
  rehearsal browser proved the report columns, the waiting-on filter narrowing in place, the
  cancel-first preapproval confirmation restating the exact amount and property, and zero calls to
  the RentVine work-order route from a page render.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

| Requirement                         | Architecture outcome | Behavior outcome | Human litmus                               | Deterministic evidence / falsification |
| ----------------------------------- | -------------------- | ---------------- | ------------------------------------------ | -------------------------------------- |
| MSYNC-01, MSYNC-03 once, no dupes   | `ARCH-S108-1`        | `BEH-S108-1`     | Every open item says what it is waiting on | Read-twice fixture                     |
| MSYNC-02, MSYNC-05 one-way/conflict | `ARCH-S108-1`        | `BEH-S108-3`     | Every open item says what it is waiting on | Differing-status fixture               |
| MSYNC-04 preapproval routing        | `ARCH-S108-2`        | `BEH-S108-2`     | Every open item says what it is waiting on | Threshold fixtures                     |
| MSYNC-06 report                     | `ARCH-S108-2`        | `BEH-S108-1`     | Every open item says what it is waiting on | Report render test and browser smoke   |
| MSYNC-07 RentVine limit import      | `ARCH-S108-3`        | `BEH-S108-4`     | Every open item says what it is waiting on | Plan, route, store and panel fixtures  |

**Preservation set.**

S99 and S100 client, contract, route, panel, and link tests; maintenance ticket, queue, intake, and
owner-notice suites; `maintenance-ai-boundary.test.ts`.

**Adversarial acceptance checks.**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

- **AC-S108-1** — `ARCH-S108-1`: no snapshot is written without a human-initiated S99 read.
- **AC-S108-2** — `BEH-S108-2`: preapproval never sets `isOwnerApproved` or creates a provider effect.
- **AC-S108-3** — `ARCH-S108-2`: a missing estimate can never be treated as within preapproval.
- **AC-S108-4** — Only a current Admin can change a preapproval; changes are versioned and audited.
- **AC-S108-5** — `ARCH-S108-3`: only an exact positive RentVine limit becomes an import row; an
  absent, zero or unreadable limit never clears or changes an app preapproval.
- **AC-S108-6** — `ARCH-S108-3`: a confirmation records nothing when RentVine or any app record
  changed after the preview.
- **AC-S108-7** — `BEH-S108-4`: only a current Admin can import; every recorded change is versioned
  and audited with its RentVine source note.

**Forbidden actions / hard gates.**

No polling, no attachment or chat post to RentVine, no vendor assignment, no owner approval claimed
in RentVine, no autonomous notice.

**Dependencies / sequencing.**

Use S227 for maintenance retirement and retained read-only compatibility. S228 owns current Dotloop diagnostics and S229 renewal/unsent communications preservation. Do not resume the old maintenance, Vendoroo integration or proof sequence from this historical contract.

**Standalone delivery contract.**

- **Deliverable now:** The S227 retirement/retention slice, preserving original evidence without migration effects.
- **Consumes, but does not assume:** Existing authorized history and exact receipts.
- **Externally blocked effect:** No former maintenance/provider effect is requested. Current live verification holds are in docs/open-blockers.md.
- **Produces for downstream suites:** Original record/receipt meanings and permissions, without new operational authority.

**Verification and delivery contract.**

1. Verify current S227 retirement and read-only retention through the real request, service and authorized reader boundaries.
2. Preserve original requirement IDs, historical verdicts, records and receipt meanings. Do not execute the superseded operational acceptance outcomes or collect retired integration inputs.
3. Use S227-S229 for current focused regressions, required repository checks and authorized gated delivery. Record local, live-provider, human and deployment outcomes separately; missing evidence cannot become success.
4. Report ALL_GATES_GREEN only for actually completed current engineering gates, BUDGET_EXHAUSTED only for an explicit budget, or BLOCKED with its exact unavailable external input after independent work. These terminal states do not resume the superseded operational outcomes.

**Ordered prompt sequence.**

1. Read the current router and S227; verify actual retirement/retention behavior.
2. Use original evidence below only for provenance and preservation scope.
3. Do not execute former operational instructions, collect retired integration inputs or rerun completed proofs.
4. Verify and deliver the currently authorized S227–S229 slice through existing gates.

**Deletion/merge recommendation.**

The original operational contract is superseded by S227. Its historical trace remains temporarily available for native program-ledger consistency; it is not an execution queue. Remove that provenance only with its remaining evidence references reconciled, retaining originals in Git history.
