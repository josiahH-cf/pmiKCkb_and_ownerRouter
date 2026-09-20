# Renewal meeting walkthrough runbook

Status: Draft for validation. Prepared 2026-09-20 for the next staff meeting; no meeting has been
run, no lease has been selected and no step below has a human verdict. The facilitator updates
this document only after staff observe the real controls. Companion contract:
`lib/lease-renewal/meeting-walkthrough.ts`; controls come from the
[operator guide](renewal-operator-guide.md) step-to-control map and are cited by guide step number.

The session is planned at about 90 minutes. That is planning context, not a timeout: the
application enforces no deadline, schedules nothing and sends no invitation. A paused session
resumes from its last recorded step in the observation ledger below.

## 1. Case matrix

Two cases, both Pending selection until the team names the real leases. Real lease identifiers,
addresses, amounts and customer names stay in approved private storage; this document and the
generic guide carry only the `private:<label>` pointer once one is authorized.

| Case           | Private reference | Source reads needed                                             | Current cycle | Missing inputs                                   | Role    | Intended walkthrough outcome                                                       | Observation-only steps |
| -------------- | ----------------- | --------------------------------------------------------------- | ------------- | ------------------------------------------------ | ------- | ---------------------------------------------------------------------------------- | ---------------------- |
| Ordinary       | Pending selection | RentVine lease, parties and rent; Sheet row; retained comps     | unknown       | Team-selected lease; owner terms as communicated | unknown | Facts to prepared messages to a recorded outcome, observing every control          | decided at the meeting |
| Policy-related | Pending selection | RentVine lease and parties; policy material state; policy facts | unknown       | Team-selected lease; approved policy material    | unknown | The lease while material is pending, then the same lease once material is approved | decided at the meeting |

If the team offers an in-progress lease with an advanced date, record its cycle as underway or
advanced_date and include the next-cycle preparation rows. Nothing about a customer, policy, prior
signature or expected source value is invented to fill a blank.

## 2. Preflight with exact dependencies

Run before the meeting. Every check is effect-free: none creates a Sheet write, a draft, a paid
lookup or a provider record, and none refreshes a provider endpoint with undisclosed side effects.
Label each check Verified, Failed, Pending external input or Not run, with the time and the evidence
location. An unlabeled check is Not run.

| Check                                              | Effect-free evidence                                                                                                    | Holds these live steps                                          |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Current code and release identity                  | `git rev-parse HEAD`; serving revision named in `docs/status.md`                                                        | none                                                            |
| Operator access for the demonstrating staff        | Sign in on the served origin with the assigned role; Renewals heading or honest source-unavailable state (guide step 1) | record owner terms; record tenant response                      |
| Data-source availability and freshness             | Refresh source facts (guide step 5) and read the returned freshness                                                     | record owner terms; record tenant response; exact source update |
| Every current lease discoverable on the desk       | Renewal table with date, owner and tenant filters cleared, compared to the source lease count                           | none                                                            |
| Operating Sheet write-back paused (F08)            | `LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED` reads false on the served revision                                              | exact source update                                             |
| Approved templates and resource links              | Connections resource links (guide steps 26, 27, 37 to 43, 72); Admin intake manifest for the seven families             | Dotloop packet preview                                          |
| Managed mailbox connected for the signed-in sender | Connections mailbox state; message preparation preflight (no draft created)                                             | unsent owner draft; unsent tenant draft                         |
| Dotloop selection and action keys                  | Connections Dotloop readiness and the action registry; keys expected closed                                             | Dotloop packet preview                                          |

A held live step still supports the preparation walkthrough: inspection, navigation, fact review,
message preparation and the worksheet never depend on a live check. The preflight names precisely
which live steps cannot run yet; it never marks one as done.

## 3. Side-by-side walkthrough script

Each row pairs the team's manual step with the exact application control, the guide steps it
exercises, the input the step needs, what the room should see, the evidence to keep, the permitted
effect and the safe recovery. A manual step reading Meeting question is one the team has not yet
described; it is asked at the meeting and never invented. Permitted effects are none, app_record
(an app-owned record staff confirm), unsent_draft (an unsent draft on explicit confirmation) and
exact_confirmed_effect (one Admin-confirmed source update, only if the team intends it as real work).

| Step | Manual step today                                           | App control                                                                      | Guide steps    | Required input                                 | Expected output                                                        | Evidence              | Permitted effect | Safe recovery                                                                 |
| ---- | ----------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------- | ---------------------------------------------- | ---------------------------------------------------------------------- | --------------------- | ---------------- | ----------------------------------------------------------------------------- |
| 1    | Open the operating Sheet and find the lease row by end date | **Filter renewal date** then **Apply month**                                     | 1, 2, 3, 4     | Lease end month                                | The filtered desk lists the lease                                      | screenshot            | none             | Clear the filter; an unlisted lease is a source question, not a workaround    |
| 2    | Open RentVine in another tab to check the lease             | **Open this lease in RentVine**                                                  | 12, 13         | Selected lease                                 | The exact RentVine record and the Sheet row open beside the dashboard  | screenshot            | none             | A missing link reads as such; continue on the dashboard facts                 |
| 3    | Read rent, dates and parties from both sources by eye       | **Lease information** and **Refresh source facts**                               | 44, 46, 5      | None                                           | Full property, dates, rent, parties and freshness in the side panel    | screenshot            | none             | A stale read shows its freshness; do not correct from memory                  |
| 4    | Meeting question: how a wrong value is corrected today      | **Fact to correct** and **Save current-rent proposal for review**                | 14, 15, 16, 17 | Fact, source and reason                        | A proposal saved for review; destinations listed; no source changed    | screenshot, ledger    | app_record       | Discard the proposal; nothing reached a source                                |
| 5    | Pull comps from RentCast or memory                          | **Rent and charges working area** and **Open the RentCast property report**      | 55, 62, 8      | Resolved address                               | Retained comps and the market range for the property                   | screenshot            | none             | A missing address is named; skip the paid lookup                              |
| 6    | Draft the owner email in Gmail                              | **Copy formatted body** and **Preview unsent Gmail draft**                       | 21, 22, 52, 69 | Reviewed owner wording                         | Formatted body and complete recipients; preflight lists what remains   | screenshot, preflight | unsent_draft     | Without a mailbox, copy the body and send from the team's own client          |
| 7    | Meeting question: how the owner's answer is captured today  | **Record owner response**                                                        | 23, 9          | Owner terms as actually communicated           | Approved terms recorded with recorder and time                         | ledger                | app_record       | Record only what the owner actually said; a pending answer stays pending      |
| 8    | Draft the tenant offer email                                | **Copy plain text** and **Response request (optional wording edit)**             | 24, 70, 10     | Recorded owner terms                           | Current-cycle tenant message with the exact response paragraph         | screenshot, preflight | unsent_draft     | Without a mailbox, copy the text; the message is not sent by the app          |
| 9    | Meeting question: how the tenant's answer is captured today | **Record tenant response**                                                       | 25             | Tenant response as received                    | Acceptance, decline or revised terms recorded                          | ledger                | app_record       | A decline records the response; nothing is sent or advanced                   |
| 10   | Fill the renewal form and send it through Dotloop           | **Reload document readiness and attempts** and **Current facts for this packet** | 28, 71, 11     | Approved families and mappings                 | Gates, current facts and any saved attempt; nothing filled into a PDF  | screenshot            | none             | A held gate hands the packet to the manual Dotloop process with the worksheet |
| 11   | Chase signatures by email                                   | **Preview exact Dotloop packet creation**                                        | 29             | Passing document gates and a connected Dotloop | Exact preview only; creation needs its own confirmation                | screenshot            | none             | Unavailable preview is the expected state while keys are closed               |
| 12   | Update the Sheet columns by hand                            | **Preview Owner emails update** and **Review and confirm…**                      | 53, 54, 18     | Reviewed source values                         | Exact Sheet before and after; confirmation stays unavailable under F08 | screenshot            | none             | F08 keeps the Sheet preview-only; record the intended update in the ledger    |
| 13   | Mark the renewal done in the Sheet                          | **Record staff completion** and **Save status**                                  | 30, 64, 65, 66 | Staff observation of completion                | Staff-recorded completion and work status with history                 | ledger                | app_record       | Completion stays staff-recorded; provider verification is separate            |
| 14   | Meeting question: what is prepared for the next cycle today | **Work status (recorded by staff)** inside Filter status                         | 67, 6          | Saved staff status                             | The desk filtered by status; the filter returns with you from a lease  | screenshot            | none             | An unset status reads Not recorded; nothing is advanced                       |

## 4. Safe meeting branches

Take the branch as written. No branch marks a step complete for the demonstration, fakes a
signature, copies a customer, replays a live proof, seeds production or advances a real renewal.

| Branch               | Trigger                                                                        | What the facilitator does instead                                                                                           | Guide steps still available |
| -------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| No template          | A family reads Pending materials or the packet reports an unavailable artifact | Show Current facts for this packet and the Admin intake manifest; hand off to the manual Dotloop process with the worksheet | 28, 71                      |
| No mailbox           | The sender has no connected managed mailbox                                    | Prepare the message and its preflight, copy body and recipients, send from the team's own client                            | 21, 22, 24, 52, 69          |
| No policy material   | Policy material for the policy case is not approved                            | Show Pending approved material and the message gate it adds; record the owner question; approve nothing at the meeting      | 10, 70                      |
| Source read failed   | RentVine or the Sheet is unavailable or stale                                  | Show the honest unavailable state and freshness; inspect last read facts; record no dependent outcome                       | 1, 5, 13                    |
| Provider unavailable | Dotloop not connected, no selection, or keys closed                            | Reload document readiness, show the exact holding gates, hand off to manual signing; nothing is marked complete             | 28, 30                      |

A production action during the meeting is genuine intended work: it needs the normal actor, the
exact preview and the exact confirmation, and it is recorded in the ledger as such. Local
synthetic workflows may show an otherwise unavailable branch only on the local rehearsal, labeled as
nonproduction.

## 5. Observation ledger

One row per script step per case. Unrun steps stay Not run with no observation, actor or time. A
failed step names its issue owner and next action; later safe steps stay separately observable.
Recording, if any, is a planned human step with team consent, using the team's approved tool; the
recording location is written by a person after it exists, never generated here. Customer
screenshots and transcripts stay in approved private storage; this ledger cites their location.

| Case | Step | Actual step | Expected | Observed | Actor | Time (UTC) | Evidence location | Outcome | Issue owner | Next action | Exact dependency |
| ---- | ---- | ----------- | -------- | -------- | ----- | ---------- | ----------------- | ------- | ----------- | ----------- | ---------------- |
|      |      |             |          |          |       |            |                   | Not run |             |             |                  |

Interruption: note the last recorded step. On resumption, prior rows stay as recorded and work
continues at the first Not run row; nothing is reset and no full pass is claimed from a partial
session.

## 6. After the meeting

1. Import the ledger. Steps with a pass outcome become confirmed procedure; failed and unrun steps
   stay open questions with their owner and next action.
2. Update the [operator guide](renewal-operator-guide.md) and the knowledge materials only with
   confirmed steps and decisions, dated and tied to the serving revision. Keep unresolved
   questions visible.
3. Keep raw customer material out of Git. Do not overwrite legal wording, and do not remove a
   control merely because an example skipped it.
4. Follow-up defects become ordinary tracked work after approval; nothing is patched into
   production from the meeting.
5. Change this document's status from Draft for validation only when at least one step carries a
   staff-observed outcome, and state exactly which steps that covers.

## Technical rehearsal evidence

The engineering journeys behind this script (fresh and underway renewals, date advancement,
non-renewal, missing templates, absent policy material, read failures, stale snapshots, duplicate
confirmation and interrupted work) run against the owning services, the Firestore emulator and
deterministic adapters. Their ledger lives in `lib/lease-renewal/meeting-walkthrough.ts` and is
checked by `tests/unit/s132-technical-ledger.test.ts`. Every row keeps the selected-lease and human
verdict columns at Not run: a technical pass is not a human walkthrough or a provider success.
