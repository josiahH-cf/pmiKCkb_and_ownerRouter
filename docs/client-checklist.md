# Client, owner, and provider execution inputs

Updated: 2026-08-31.

All product-scope and authority questions for the canonical queue are closed. This file lists only
fresh runtime evidence that an implementing runner must resolve and validate; none is permission to
guess, substitute a record, or stop unrelated closed-safe work.

## Recorded owner decisions

- Production is Live-only. Use real source-backed values; never create a fake person, lease, work
  order, message, or customer value.
- The app is intended to update in-scope systems of record under the exact S97-S100 contracts.
- The owner authorizes each exact S97-S100 key's bounded protected proof window after closed
  implementation/deterministic gates, mandatory close/readback, and final activation after its
  applicable live proof and remaining suite gates; no broad or sibling key inherits that authority.
- The secure execution prompt designates the sole S97 RentVine property/lease target. S97 may perform
  the specified temporary one-day `endDate` proof and exact rollback only on that target.
- S98 may append one temporary source-backed proof row at the end of the operating renewal Sheet,
  label/note/isolate it as a test, read it back, separately update its blank `current_rent` from the
  fresh source, then separately delete it and prove final absence.
- S99 includes staff-confirmed RentVine work-order creation and status update. S100 includes manual
  authenticated inbound work-order-chat synchronization and only an unsent Gmail resident-reply
  draft in the signed-in user's connected mailbox.
- S36 runs one temporary provision/import/query/readback/retirement pilot and restores the original
  eleven-store/config baseline.
- Dotloop and LeadSimple are deferred until after the current RentVine activation work and require
  later separately grounded scopes.

## Runtime evidence by suite

| Suite | Resolve immediately before the bounded effect                                                                                                                                                                                                                                                                                                                      | Refusal/closeout rule                                                                                                                                                                                                |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S97   | Managed Admin/Renewals actor, exact account and designated lease from the secure target URL plus matching operating-Sheet row; date-key one-day delta and rollback; source-backed staff-confirmed create terms; one existing charge with a supported reversible update delta; fresh before reads, phase previews/confirmations, and current exact key/config state | Use one serial window per exact key. Stop on any target/state/actor/key/value drift; never choose another lease or invent charge terms; each reversal and key closeout must read back exactly.                       |
| S98   | Managed Admin/Renewals actor, operating workbook/tab/schema/header hash, fresh tenant and current-rent source values, exact temporary marker/note, downstream exclusion, surrounding-row baseline                                                                                                                                                                  | Use serial append, field-update, and append-owned reversal windows. Stop on murky headers/protection/formula/validation/identity drift; delete only the unchanged receipted row and prove stable-key/marker absence. |
| S99   | Managed staff actor, current RentVine account, official work-order/status/priority catalogs, exact ticket/property/unit/work-order mapping, fresh target state or exact create proposal                                                                                                                                                                            | Never hardcode provider ids, send notifications, assign a vendor, attach a file, or post chat; rollback/correction must use the exact receipted work order                                                           |
| S100  | Managed signed-in user, exact provider account/work-order/message identities, disclosed mark-read effect, verified resident-email mapping, connected Gmail mailbox                                                                                                                                                                                                 | Manual sync only; deduplicate by account/message id; unmapped events go to review; no webhook/polling/chat post/direct send                                                                                          |
| S36   | Managed Admin, deterministic saved Space request, one existing approved source object selected by the suite rule, temporary copied-object generation/hash/schema/expected document ids/count, preview/expiry                                                                                                                                                       | Retire only the exact temporary store, delete only the temporary copy, preserve the source object, prove eleven stores and flag false                                                                                |

## Existing policy inputs

- Renewal follow-up timing remains intentionally unset. No due time, reminder, task, draft, or send
  may be derived from a guessed schedule.
- RentCast keeps provider order and remains reference-only; no extra freshness/selection rule exists.
- Renewal/maintenance initiation ends with an unsent Gmail draft. A person edits and sends from
  Gmail; direct application send keys remain closed.
- Real human litmus observations are recorded as `NOT RUN — no human observer` when nobody is
  present; a runner or model never impersonates a reviewer.

## Delivery rule

Every provider/cloud/config mutation is human-initiated where the suite requires it, exact-previewed,
exact-confirmed, bounded to one target, claimed before the provider call, receipted, read back, and
separately reversible/correctable. S100's warned and confirmed manager-read marker is the sole
non-reversible stateful-read exception because RentVine documents no unread restoration. Unknown
provider outcome means reconciliation without blind retry.
Customer values, raw evidence, secrets, and mailbox bodies never enter Git or ordinary logs.
