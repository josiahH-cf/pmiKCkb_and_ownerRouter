# Focus and maintenance follow-up verification — 2026-10-11

This records the initial owner-requested L01–L26 verification and local repair. During that
verification, production was read only: no deployment, push, provider activation, contact with
Dan/Jon, customer message, production test record or RentVine chat read was performed. The owner
subsequently directed full checks, mainline commit/push and deployment through existing release
gates. Release evidence is recorded separately; the initial observations retain their actual scope.
Complete S208 integration remains open.

## Revision and authority binding

- Original Windows checkout: main at 8406181c, with its pre-existing unrelated dirty files. Work
  was isolated in the attached focus-maintenance-verification worktree.
- Examined serving source: 780f48db1d7d6a7cc855035d934621f77a28a257.
- Canonical /api/version and an approved managed-account Cloud Run read both identify
  pmi-kc-app-rmv2ixuq7-b0c62b52cd5d, with 100% canonical traffic.
- Actual October 10 release: 5b3dfb90-2624-406a-9791-5f8581befcf5; exact CI 38061050765,
  application build 333e5e32-d65d-451a-bd8e-fe06bce48b0f, promotion 15:21:52.305Z.
  The accessible October 8 ledger was stale. The newer rollout is independently supported.
- Local repaired source: base bd1b3962623c9f7259d4cffe9d3db90f87bf9b12 plus the 19 source/test
  file hashes in [the source manifest](focus-maintenance-followup-2026-10-11.source.json).
  Bundle sha256:7effc9eb5385cca545ad70e799c84b5bb09a612602124d64302030459194e1a4.
  Changes are uncommitted and undeployed. All changed runtime sources matched the disposable
  compiled maintenance fixture before its cleanup.
- Current contracts consulted: AGENTS.md, facts, loop state, active suite index, S197,
  S207/S208 and S209–S215. S208 remains pending actual account/interface and operating inputs.
  The old supplied router's activation counts do not override the current serving contract.
  This verification changed no Action Registry keys or protected source paths.

## Initial failures, repairs and final scope

Production's Owner outreach card visibly repeated Ready/Done wording (including Done when: Done),
showed expanded rent context and nineteen secondary alternatives before any disclosure choice.
The existing All renewal work disclosure did not govern those alternatives.

The local repair presents the selected task, its single state and an actionable owner-outreach
instruction. Rent and lease context has its own initially closed disclosure. Operational current
rent, RentVine contractual rent and working terms keep separate meanings/provenance even when
amounts match. Source discrepancy, unreadable/missing sources, staleness, move-out and recovery
notices remain outside the collapsed facts. Also ready for you is a separate initially closed,
counted button with aria-expanded/controls and a conditionally mounted navigation list. Eligible
alternatives are deduplicated by identity and exclude the selected task.

A fail-first regression exposed that leaving an edited message for presentation controls could
autosave on blur. Task/view/disclosure navigation now preserves local entries without committing.
Ordinary field exits retain their existing saves and other action handlers remain unchanged.
Pointer, Space, Enter, hidden-tab exclusion, actual task reveal and Focus/Full round trips were
exercised in the internal browser using the actual owning workspace with synthetic local facts.

The ordinary maintenance panel already called the supported RentVine read endpoint, but discarded
the returned list/details/status catalog from its staff surface. The narrow detail decoder also
discarded optional provider time/summary fields present on the actual response. The repair reuses
that same client, route and action key; it displays work-order IDs, property/unit/lease references,
status names/primary meanings, vendor contact/trade and assigned staff references. The GET-only
decoder preserves dateTimeCreated, dateTimeModified, dateClosed, closingDescription,
vendorClosingComments, diagnosticSummary and agentSummary when supplied. It distinguishes supplied,
blank, not supplied and unrecognized values. Timezone is not guessed. The create/update decoder,
write primitives, write-body validation and receipt equality remain unchanged.

Exact detail identity is checked in the reader and panel. A mismatched detail leaves the prior
observation visible with an error. No new property/lease association is minted from a name or a
work-order display. The separate existing exact association/link preview contracts remain required.

A fresh compiled maintenance run then failed because automatic review-context refresh replaced
a successful responsibility-save acknowledgement with a generic read message. The saved review
was present in the store; the confirmation race was real. A fail-first delayed-response regression
reproduced it. Automatic refresh now updates context/errors without overwriting the successful
action acknowledgement; an explicit Read current review context still announces its result.

Final local observations:

- Focus card: desktop 1280×900, height 344px; 390×844 viewport, height 480px and width 351.2px.
  At 390px the document/client scroll widths both measured 375px (vertical scrollbar), with
  no horizontal page overflow or clipped controls. This is agent visual inspection with synthetic
  facts, not human acceptance or a physical-phone test. The production and synthetic wrappers differ;
  no percentage reduction against the production measurement is claimed.
- Internal browser: nineteen distinct alternatives, selected task excluded; collapsed alternatives
  absent from keyboard navigation; owner wording retained across secondary-task and Full/Focus
  switches; zero POSTs/provider calls for that navigation journey. Manual maintenance read fixture
  issued only read, link_status and exact read operations.
- Fresh affected preservation group: 111 tests/16 files passed. Supplemental rent/read-context group:
  17/3 passed. Final core source/focus/client group: 51/8 passed. Final maintenance UI group: 7/3
  passed, including the delayed refresh and wrong-identity regressions. These overlapping groups
  must not be added as a unique full-suite count.
- Fresh real Firestore emulator: 29 tests/5 files passed for case associations/history, retained
  artifacts, vendor work, financial/report boundaries and standing policy.
- Disposable compiled production fixture: build passed, then 31 checks passed through actual local
  HTTP controls and emulator transactions, including recovery, association review, final PMI closure,
  vendor privacy/revocation, retained files and PDF/CSV/financial reporting. It uses synthetic auth
  and sources; this does not establish live provider ingestion or account entitlement.
- Typecheck passed after removing the disposable browser route and regenerating route types.
  Focused lint passed with one existing unrelated effect-cleanup warning. Formatting passed.
  No full-suite or deployment gate is claimed for this local patch.

The final three new follow-up regression files passed seven tests after formatting. Copy-voice,
redaction, router-boundary, active-path and context-freshness gates passed; unrelated existing
fact review-date warnings were retained and do not establish fresh verification of those facts.

Earlier failures remain preserved: initial Focus 3 failures; first repair exposed the navigation
autosave; maintenance readback 2 initial failures; review race 1 initial failure; first compiled
workflow run failed at the review acknowledgement. Three earlier native fixture setup failures
(path/runtime/symlink constraints) did not execute that workflow. Tests that formerly assumed an
always-expanded list now deliberately open it; ordinary field exits still verify persistence.

## Fresh bounded provider observations and path trace

Approved WSL CLI/ADC refresh and managed identity were verified. A guarded existing reader performed
one fifteen-work-order page, fifteen status definitions and one detail. All three requests were
GETs on previously supported endpoints, with chat and non-GET operations explicitly refused.
Eleven of fifteen rows supplied vendor contact references; all fifteen supplied lease references.
The bounded observations are not a complete portfolio, event log or historical-identity audit.

The repaired decoder also processed that same fresh detail response offline at 11:05:40.654Z:
the core projection and exact identity were unchanged; created/modified times were supplied and
closed time/summaries were not supplied on that detail. This validation made zero additional
provider calls and disclosed no raw values.

| Capability                                                                        | Actual provider observation                                                                                                                                                                                  | Adapter and persistence                                                                                                                                                                                                     | Staff surface / remaining gap                                                                                                                                                                          |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Work order, status, property/unit/lease and assignment references                 | Supported core fields returned by existing work-order/status/detail reads                                                                                                                                    | work-order-client and work-order-contract; work-order-service/route serialize them. Existing links retain a sparse last snapshot.                                                                                           | Repaired OrdinaryRentvineWorkOrderPanel/RentvineWorkOrderReadback displays these fields and status meanings. Missing references remain unverified.                                                     |
| Provider times and closeout summaries                                             | Creation/modification strings present in 15/15 sampled rows; closingDescription supplied in 3/15 and vendorClosingComments in 1/15. diagnosticSummary, agentSummary and aiSessionID were null in the sample. | Original narrow decoder dropped these extra fields. GET-only allowlist repair preserves the supported time/summary fields. No structured event/history ingester was added. Existing snapshot still has updated_at_iso=null. | Local detail disclosure shows actual supplied context and explicit absence. Blank/null summaries cannot prove no troubleshooting. A sampled null cannot prove global provider unavailability.          |
| Calls, triage chronology, individual troubleshooting attempts/outcomes, sentiment | Not established by those three RentVine reads. Public Rooceptionist MCP documentation describes call data only; PMI entitlement/backend use is unverified.                                                   | No verified source-event mapping or runtime ingestion into maintenance_case_events. classifyVendorooObservation is a pure tabletop assessment, with no adapter/ingestion caller.                                            | No integrated complete provider chronology. Staff-entered assessment/history is independently supported, not Vendoroo evidence.                                                                        |
| Photos and attachments                                                            | No verified photo bytes, attachment ownership/retention contract or safe current account path in this bounded read. No speculative endpoint or stateful chat read was attempted.                             | Existing staff/vendor retained artifact stores are hash-bound and scoped; they do not ingest Vendoroo photos.                                                                                                               | Staff/vendor upload and reporting work locally; automatic Vendoroo photo coverage remains unverified.                                                                                                  |
| Escalations, staff takeover and competing communications                          | No current account escalation feed or takeover/stop readback supplied. Public PMRoo/ResiRoo descriptions are capability leads only.                                                                          | No verified runtime takeover adapter, queue-cancellation contract, acknowledgement or in-flight communication race handling.                                                                                                | Staff assignment and PMI case controls do not prove ROO has stopped. Complete integration remains open.                                                                                                |
| Canonical history, vendor contributions, finance and reports                      | Existing app-owned/staff and vendor workflows, not imported Vendoroo event evidence                                                                                                                          | maintenance-case-records, maintenance-vendor-work, retained artifacts and reports use original operation identities, version checks and receipts; fresh emulator/compiled checks passed.                                    | Vendor-minimized work context and private staff material stay separate. Quotes/invoices/payment claims/verified payment evidence remain different; vendor completion never silently closes PMI's case. |

Source paths: lib/integrations/rentvine/work-order-client.ts and work-order-contract.ts;
lib/maintenance/execution/work-order-service.ts; app/api/maintenance/rentvine-work-orders/route.ts
(read, serialization and persistProviderSnapshot); lib/firestore/maintenance-work-order-links.ts;
lib/maintenance/case-source.ts and existing-work-order-link.ts; lib/firestore/maintenance-case-records.ts,
maintenance-vendor-work.ts and maintenance-reports.ts; components/maintenance/OrdinaryRentvineWorkOrderPanel.tsx,
RentvineWorkOrderReadback.tsx and MaintenanceReviews.tsx.

## Open-versus-closeout, freshness and recovery

The manual read supplies current work-order/status/assignment observations while an order is open.
Its read timestamp is the application's observation time; returned provider timestamps retain their
unverified timezone and do not establish a freshness SLA. Read errors keep prior observations and
an explicit failure; absence in an incomplete list never establishes resolution. A linked read may
update the existing app-owned last snapshot, so Check RentVine was not used on production.

Vendoroo's official [communication-log article](https://vendoroo.freshdesk.com/support/solutions/articles/158000403412-escalations-communication-logs-and-live-support-chat)
describes a PMS note at closeout. That is not proof of open-work coverage or of PMI's account/API
exposing that note safely. Its [Rooceptionist MCP article](https://vendoroo.freshdesk.com/support/solutions/articles/158000457207-connect-rooceptionist-to-your-ai-assistant-mcp-)
describes read-only company call data. Its [ResiRoo article](https://vendoroo.freshdesk.com/support/solutions/articles/158000402697-resiroo-resident-facing-ai)
describes troubleshooting, photos and stopping communication on PM takeover. None establishes
PMI entitlement, a supported server interface, retention, event replay or takeover execution semantics.

There is no verified Vendoroo event ingester, stable external-event identity/cursor, duplicate/delayed
observation merge, backfill or revocation recovery path. Canonical app-owned case recovery does not
establish those provider properties. Complete S208 integration remains required.

## Unresolved discussion points for Dan and Jon

These are questions for discussion; no contact was made. Dan/Jon should identify the actual PMI
decision-makers rather than assigning either an invented account or operational role.

| Operational gap                       | Required account/provider information and unresolved question                                                                                                                                                                    | Responsible decision-maker                                                                                         | Implementation consequence                                                                                                                                   |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Existing RentVine coverage            | Which authorized open and closed PMI orders demonstrate each ROO call/triage/troubleshooting/photo/escalation field or note? What stable account/work-order/event identities and provenance are supplied?                        | PMI Vendoroo/RentVine account administrator with Vendoroo technical owner; PMI maintenance owner validates meaning | Reuse verified existing data first; expose dropped data in code before requesting duplicate access.                                                          |
| Calls outside the existing path       | If call records are absent from the safe RentVine path, does PMI have Rooceptionist's company MCP or another documented interface? What server-use permission, credential scope/rotation, licensing, schema and limits apply?    | PMI account administrator and Vendoroo interface owner                                                             | Any additional access must fill the established call-history gap. A secret assistant URL/public description alone is not a backend contract or access grant. |
| Open work versus closeout             | Which records arrive before closeout, at what latency/timezone/version? How are corrections, delayed events, pagination/cursors, outages, access revocation and backfill handled?                                                | Vendoroo technical owner; PMI maintenance owner chooses acceptable freshness/recovery                              | Define ingestion/replay and honest stale/missing states without relying solely on a closeout note.                                                           |
| Ownership and duplicate communication | Who owns intake, triage, approval, dispatch, follow-up and the next action? What exact takeover action stops ROO's queued/in-flight resident communications, how is it acknowledged/read back, and how is resumption controlled? | PMI maintenance owner decides workflow; Vendoroo technical owner proves the control                                | Do not equate staff assignment with provider takeover; implement verified duplicate-automation control before claiming it.                                   |
| Retention and privacy                 | Which call/transcript/photo artifacts may the backend retain, for how long, and what happens to expired links/deletions/legal holds or revoked access? What may assigned vendors see?                                            | PMI privacy/records owner with account administrator and Vendoroo                                                  | Implement authorized retention/provenance and scoped vendor surfaces; keep sensitive internal material private.                                              |
| Status and final closure              | Which system is authoritative for vendor completion, provider status and PMI final closure? Who reviews unresolved/ambiguous historical tenancy, exceptions and financial evidence?                                              | PMI maintenance owner, with finance/records owner for financial treatment                                          | Preserve final PMI closure and separate quotes, invoices, staff-reported payment and verified finance; agree source ownership before write integration.      |

## Weekly draft and cleanup

At 2026-10-11T10:54:46.218Z the approved managed Gmail client read the original draft by its existing
receipt. It still existed as a draft; from/to/subject/body matched its original business content.
Body hash bffce288cc38ac81df43b195b1b35c01e7c4f10fb8bd776d1953a92c80a81128.
Zero creates or sends were called. Private body, recipient values and raw provider evidence remain
outside Git.

The October 10 release, bounded RentVine discovery and delivered app-owned maintenance capabilities
support the draft's scoped claims. Its 318 reconciled records, eleven readbacks and five 390px route
checks do not prove this new Focus layout, complete Vendoroo integration, human acceptance or a
physical-phone test. Acquisition, native phone and Dotloop inputs remain distinct open holds; a
connection badge or empty template catalog is not completed integration.

The local Focus server, Windows and WSL Firestore emulators, and compiled server port 38105 were
confirmed stopped. The three disposable browser-route source files were deleted; no route remains
in the source. Both owned /tmp/pmi-kc-operations-browser-followup-20261011 staging roots were removed
after exact path checks. Ephemeral emulator stores were not exported. Two agent-created internal
tabs were closed and the viewport reset. Raw failed/passed evidence and screenshots remain outside
Git; needed source repairs remain in the managed worktree.

Ignored local logs/screenshots: output/followup-20261011.
Private live read evidence: /home/josiah/.local/state/pmi-kc-followup-20261011.
Private compiled evidence: /home/josiah/.local/state/pmi-kc-operations-20261009/followup-20261011-maintenance-attempt5
(and earlier failed attempts). These are evidence, not production test resources.
