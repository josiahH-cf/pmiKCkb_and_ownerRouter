<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-completion-v1 -->

# S108 — Maintenance work-order alignment, blockers, and preapproval routing

> Status: IMPLEMENTED. The link document now carries a `provider_snapshot` recorded only from the
> human-initiated `rentvine.work_order.read` path, `projectMaintenanceWaitingOn` derives one blocker
> for the queue, the report, and the S109 handoff, `maintenance_property_preapprovals` holds the
> Admin-managed versioned amount, and the ticket carries an exact `estimate_amount_cents`. Photo and
> attachment synchronization into RentVine remains closed, and the app never sets `isOwnerApproved`.
> The report links to the ticket rather than to a RentVine dashboard URL: none is documented, and
> this project never guesses one.

**Goal.**

Managers see the same current maintenance work in the app and in RentVine, each item shows what it
is waiting on with a working RentVine link, and properties with an established preapproval amount
skip only the unnecessary owner-approval step.

**Current state / intended end state.**

| Package requirement (PMI-08)                         | Classification                     | Evidence                                                                                                                                                                            |
| ---------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Link each app record to its work-order identity      | Already satisfied                  | `maintenance_work_order_links` with `provider_work_order_id` and claim (`lib/firestore/maintenance-work-order-links.ts`)                                                            |
| Synchronize status, notes, photos, unit, assignment  | Partially                          | Status via S99 read/update; resident messages via S100; unit via ticket; photos stay app-side in Drive (`lib/maintenance/image-store.ts`); attachments and vendor assignment closed |
| Ownership per field and conflict visibility          | Partially                          | App status and RentVine status are separate by contract (S99); no side-by-side conflict marker                                                                                      |
| No duplicate tickets, notes, photos, assignments     | Already satisfied                  | Link claim refuses a second create; S100 dedupes by account/message id                                                                                                              |
| Concise waiting-on state                             | Partially                          | Ticket statuses `Open`, `Waiting on Response`, `Waiting on Vendor`, `Scheduled`, `Closed` (`lib/maintenance/ticket-model.ts`); no owner-approval or scheduling category             |
| Property preapproval setting                         | Missing                            | No property settings model; `isOwnerApproved` is read-only provider data and hard-coded `false` on create                                                                           |
| Skip owner approval only within preapproval          | Missing                            | Owner approval today is the `gmail.maintenance_owner_notice.draft_create` request path                                                                                              |
| Blocker, amount, assignment, activity, RentVine link | Partially                          | `RentvineWorkOrderPanel` shows a fresh read; queue shows status and assignee                                                                                                        |
| Reuse vendor and maintenance features                | Already satisfied                  | No vendor portal required                                                                                                                                                           |
| Photos or attachments into RentVine                  | Conflicting with project authority | S99 excludes `attachments`/`issueImages`; the attachment key is closed                                                                                                              |

Intended end state: a ticket-level provider snapshot recorded from each human-initiated S99 read,
one waiting-on projection, an Admin-managed property preapproval record, and preapproval-aware
owner-approval routing, all through existing keys and stores.

**Actors and entry conditions.**

Maintenance-space staff read tickets; Editors record estimate amounts and request owner approval;
Admins manage preapprovals. Provider reads remain human-initiated under `rentvine.work_order.read`;
no polling is added.

**What it is / how it functions.**

1. **Provider snapshot.** After each successful S99 read, store on the link document
   `provider_snapshot` = `{ workOrderStatusID, statusLabel, priorityID, isOwnerApproved,
assignedVendorTradeID, updatedAt, readAt }`. Show it beside the app status; when they differ,
   render `Differs from RentVine` with both values and the exact next action (update status in
   the app or through the S99 status action).
2. **Waiting-on projection.** `projectMaintenanceWaitingOn(ticket, link, preapproval)` returns one of
   `owner_approval`, `resident`, `vendor`, `scheduling`, `estimate`, `unit_verification`, `none`,
   derived from ticket status, estimate presence, owner-approval state, assignee, provider snapshot,
   and unit verification. The queue and the report render it as the blocker column with the
   RentVine link when a work order exists.
3. **Preapproval record.** New collection `maintenance_property_preapprovals` keyed by property key
   with `amount`, `effectiveFromIso`, `recordedByUid`, and version history, managed from the
   Maintenance page by a current Admin with cancel-first confirmation (S86). Absent record means no
   preapproval.
4. **Routing.** A ticket needs an owner decision when `estimate_amount` is absent or exceeds the
   current preapproval. Within preapproval the ticket shows `Owner approval not required (preapproved
up to <amount>)`, the owner-notice draft control is not offered as a blocker, and the fact is
   recorded in ticket activity. Above it, or without an estimate, the ticket waits on
   `owner_approval` and offers the existing owner-notice draft. The app never sets
   `isOwnerApproved` in RentVine.
5. **Report.** The maintenance queue gains a `Waiting on` filter and a read-only blocker report view
   listing ticket, unit, waiting-on, estimate/preapproval, assignee, last activity, and RentVine link.
6. **Recorded conflict.** Photo and attachment synchronization into RentVine remains closed; photos
   stay in the app's Drive store with their links on the ticket.

**In scope / out of scope.**

In scope: snapshot, projection, preapproval record and Admin control, routing, report, fixtures.
Out of scope: vendor portal, vendor dispatch, attachments to RentVine, polling, replacing RentVine as
system of record.

**Open questions & assumptions.**

Preapproval amounts are entered by an Admin from the owner's records; none is seeded.

**Cross-product impacts.**

Maintenance queue and page, link store and rules, ticket schema (`estimate_amount`), owner-notice
draft entry, S109 intake handoff, S110 (out of V1 scope), S111 proof.

**Authority and evidence map.**

| Input                                                   | Classification                   | Use and limitation                                                                   |
| ------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------ |
| `AGENTS.md`, S99, S100, S47, committed maintenance code | Authority / implementation truth | Human-initiated reads, exact keys, closed attachments/vendor assignment, no polling. |
| Owner package PMI-08                                    | Intent evidence                  | Blocker visibility and preapproval routing.                                          |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S108-1** — Provider snapshot persists on the link document from the S99 read path only; a
  fixture expecting a snapshot after a read fails today.
- **ARCH-S108-2** — One waiting-on projection feeds queue, report, and S109 handoff; a preapproval
  fixture yields `none` where today the ticket would wait on the owner.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S108-1** — A read work order appears once with status, snapshot, unit, and assignment; a
  second read updates, never duplicates.
- **BEH-S108-2** — Estimate `400` under preapproval `500` skips owner approval; `600` or no estimate
  waits on the owner with the draft control.
- **BEH-S108-3** — Differing app and provider statuses render both with a next action; neither side
  is overwritten.

**Human litmus outcome.**

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

| Requirement                         | Architecture outcome | Behavior outcome | Human litmus                               | Deterministic evidence / falsification |
| ----------------------------------- | -------------------- | ---------------- | ------------------------------------------ | -------------------------------------- |
| MSYNC-01, MSYNC-03 once, no dupes   | `ARCH-S108-1`        | `BEH-S108-1`     | Every open item says what it is waiting on | Read-twice fixture                     |
| MSYNC-02, MSYNC-05 one-way/conflict | `ARCH-S108-1`        | `BEH-S108-3`     | Every open item says what it is waiting on | Differing-status fixture               |
| MSYNC-04 preapproval routing        | `ARCH-S108-2`        | `BEH-S108-2`     | Every open item says what it is waiting on | Threshold fixtures                     |
| MSYNC-06 report                     | `ARCH-S108-2`        | `BEH-S108-1`     | Every open item says what it is waiting on | Report render test and browser smoke   |

**Preservation set.**

S99 and S100 client, contract, route, panel, and link tests; maintenance ticket, queue, intake, and
owner-notice suites; `maintenance-ai-boundary.test.ts`.

**Adversarial acceptance checks.**

- **AC-S108-1** — `ARCH-S108-1`: no snapshot is written without a human-initiated S99 read.
- **AC-S108-2** — `BEH-S108-2`: preapproval never sets `isOwnerApproved` or creates a provider effect.
- **AC-S108-3** — `ARCH-S108-2`: a missing estimate can never be treated as within preapproval.
- **AC-S108-4** — Only a current Admin can change a preapproval; changes are versioned and audited.

**Forbidden actions / hard gates.**

No polling, no attachment or chat post to RentVine, no vendor assignment, no owner approval claimed
in RentVine, no autonomous notice.

**Dependencies / sequencing.**

Independent of the renewal suites; S109 hands intake into it; S111 proves it.

**Standalone delivery contract.**

- **Deliverable now:** snapshot, projection, preapproval record, routing, report, fixtures.
- **Consumes, but does not assume:** a RentVine work-order link; absent link renders app-only state.
- **Externally blocked effect:** none.
- **Produces for downstream suites:** waiting-on projection and preapproval lookup.

**Verification and delivery contract.**

1. Freeze snapshot, projection, and routing fixtures failing for the expected reason.
2. Run focused maintenance, link-store, rules, and queue checks plus a rehearsal-browser check of
   the report.
3. Run `bash scripts/verify.sh` and `npm run test:e2e:core`.
4. Report `ALL_GATES_GREEN`, `BUDGET_EXHAUSTED` only with an explicit budget, or `BLOCKED` (not
   expected).

**Ordered prompt sequence.**

1. Re-verify the S99 read path and link store.
2. Materialize fail-first fixtures.
3. Implement snapshot, projection, preapproval, routing, report.
4. Run focused and canonical checks; update current docs.

**Deletion/merge recommendation.**

Merge into S99 once deployed and read back.
