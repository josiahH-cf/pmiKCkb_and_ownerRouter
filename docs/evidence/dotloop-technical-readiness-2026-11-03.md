# Packet readiness and Dotloop technical qualification — 2026-11-03

Recorded 2026-11-03T13:03Z. Owners: S235/A-03 and S34/U5. This is working-tree engineering
evidence over the `39435919` baseline, not a deployment, legal approval, human acceptance or a
live provider effect. The cumulative engineering/release gate is recorded separately.

## Current packet display

The lease page now resolves packet context from its already-read current RentVine view and current
private packet facts, mappings, approved publications and policy. The display resolver constructs no
provider and saves no snapshot or observation. Execution retains its separate fresh-source admission
path. The saved packet snapshot remains separately labeled and is never substituted for a failed
current read.

Applicable families identify the actual missing original/map/publication; an excluded family does
not ask for unnecessary originals or maps. A missing applicability fact is named before requesting
dependent materials. Engineering-default family-use decisions appear as shared catalog setup,
separate from this lease's output blockers. A saved selection is compared with the actual current
connection generation and approved account; failed, revoked, wrong-generation, invalid/future-time
and old observations remain distinct from a selected-profile template failure. An unrelated
diagnostic company-profile failure does not disqualify the saved supported individual profile.

Code: `lib/lease-documents/live-input.ts` (line 112),
`lib/lease-documents/lease-packet-readiness.ts` (line 54),
`lib/lease-documents/packet-selection-freshness-read.ts`,
`lib/lease-documents/packet-selection-freshness.ts` (line 63),
`app/lease-renewal/live/desk/lease/[leaseId]/page.tsx` (line 325) and
`components/lease-renewal/LeasePacketReadiness.tsx`.

## Normal operation readiness and isolated qualification

`currentPacketHandoff` now separates app capability, current content/approval, connection/selected
resource, target and exact action authority for create and upload. Missing snapshots, changed
sources, non-current owner approval, stale packet binding, missing reviewed parties, unavailable
filled outputs and a wrong-profile target are named before the normal preview. Closed compiled
keys, a runtime suspension and an unreadable action gate are different states. The normal execution
owners still revalidate every gate; no display state grants execution.

Code: `lib/lease-renewal/execution/normal-packet-action.ts` (line 157),
`lib/lease-renewal/execution/packet-operation-readiness.ts` (line 20) and
`components/lease-renewal/RenewalDocumentHandoff.tsx` (line 140).

| Check                               | Actual isolated owners exercised                                                                                                                                             | Observed result / limit                                                                                                                                                                                                     |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New loop and interrupted projection | Normal preview/confirmation, real S66 binding, S20 ledger and atomic claim, lease association, typed Dotloop client/fake transport, retained receipt, packet projection      | One create; its own receipt persisted before a forced projection stop; recovery finished projection with attempt count one and no second create. Synthetic approvals and bytes; no real provider completion.                |
| Existing-loop upload                | Read/review and audited link, normal upload preview/confirmation, real S21 byte resolver with fixture storage, S20 claim, multipart client/fake, folder/document association | Create key closed in the test-only registry; upload succeeded with exact fixture bytes and no create/participant mutation; repeated confirmation reused the retained receipt and one upload. Production registry unchanged. |
| Lost create response                | Actual client marks the accepted-but-lost fake response uncertain; normal S20 and lease reservation; same-attempt reconciliation                                             | Remains `Needs reconciliation`, attempt count one, no receipt fabricated from a matching name, no second create; new creation remains refused.                                                                              |
| Current read-only API               | Actual `GET /api/lease-renewal/document-handoff?leaseId=…`, server handoff, fixture source/store                                                                             | `private, no-store`; distinct current content/key holds; no provider construction or store change. This is an isolated route result, not a production browser observation.                                                  |

The combined fixture initially exposed missing `DocumentSnapshot.ref` support in the test helper and
an incomplete test workspace. Those fixtures were corrected; neither failure is asserted as a
production defect. `tests/helpers/fake-firestore.ts` (line 139) now includes the real snapshot reference
contract. This in-memory helper does not establish emulator concurrency or Rules behavior; existing
registered backend checks retain those scopes.

## Provider consequence boundary and passive activation packages

The official API was read again on November 3. Loop-It documents creating a loop from the selected
template and adding participant data to contacts. The upload contract accepts binary multipart
content, while document reads return metadata. Notification behavior, the selected template's
actual native attachment set and provider-returned byte equality are not established by that
contract or the fake. They remain separate investigation/review inputs. Signing stays human in
Dotloop; no signature operation or loop/document deletion is invented.
([Dotloop Public API v2, sections 1.1, 2 and 8](https://dotloop.github.io/public-api/))

`lib/lease-renewal/execution/dotloop-activation-review.ts` (line 74) is a pure completeness/staleness validator:
it has no store/provider/gate writer and always returns `executionAuthorized: false`. It checks
the exact key/scope, current SHA and registry hash, connection generation/selection, closed state,
content/target/qualification evidence, consequence limits and backup/CAS/readback/ambiguity/stop
procedures. `ready_for_review` means only that its reference-bearing structure is complete; the
authorized person must review the evidence. It never establishes approval from arbitrary text.

Two passive templates are in the approved private assessment directory, under sanitized references
`dotloop-create-activation-review.template.private.json` and
`dotloop-upload-activation-review.template.private.json`. They deliberately have no fabricated
fresh SHA/hash/generation/time, approved content or real target. Notifications are unknown, and
new-loop native-document inspection remains open. They are **not activation-ready**. Each proposes
only its own future `production_allowed: false → true` and `readiness: Needs Permission → Approved
for Execution`, preserving other keys/configuration, after a later exact owner instruction and all
established protected-path/release gates. No protected metadata was changed.

## Focused results and remaining limits

Native WSL Node 24 / Vitest 4.1.11: **25 files, 183 tests passed** on the explicit S235/S34/S66/S106/
S182 packet inventory, including three new current-read tests, five current handoff/route tests,
twelve activation-review cases and three normal-operation cases. The readiness defects were
reproduced before their repairs. Existing lifecycle, exact bytes, claims, association history,
same-attempt recovery and signature-evidence checks remained green. Scoped ESLint: zero errors;
one existing `sequence.current` effect-cleanup warning in the handoff component remains.

The full-project default-heap typecheck exhausted its heap; a larger-heap rerun was stopped before
a result when the cumulative supported verification was centralized. No typecheck/build/full gate
pass is claimed here. No production browser pass, packet save, selected-resource change,
customer draft/send, provider create/upload, signature, key activation, production test record,
commit, push or release was performed by this work.

Production content/maps and actual case approval/targets, provider notification/native-document
consequences, separately authorized activation and ordinary real-work readback remain their own
gates. The client holds remain canonical in `docs/open-blockers.md`; this evidence adds no competing
client ask or approval surface.
