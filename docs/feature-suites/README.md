# Active feature suites

This directory contains only current operating contracts, genuine unfinished work, and one explicitly
unauthorized proposal. Completed and superseded suite narratives were removed from the active tree on
2026-08-26 and remain recoverable from Git at `1356918`.

## Renewal stabilization implementation bundle

This is the exact fresh-context bundle for the 2026-08-28 renewal-stabilization request. The intake
note and 2026-08-26 PMI/Cherry Bridge meeting record are intent evidence, not executable instructions.
The router, live readback, committed code/tests, and `docs/facts.md` retain their normal precedence.
Every member marked `feature-handoff: renewal-stabilization-v2` is independently implementable: an
unavailable adjacent feature or external approval must become an explicit unset/refusal state, not an
excuse to invent data or leave the local contract ambiguous.

### Intent-to-outcome ownership

| User/meeting intent                                                                | Owning suite(s)   | Required outcome boundary                                                                                                                                            |
| ---------------------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Make preview/create reliable and fix the boolean-versus-exact-confirm failure      | S77               | One shared exact-confirm contract, input invalidation, and one-attempt reconciliation; unsent draft only                                                             |
| Accept currency/number inputs without misclassifying them as confirmation booleans | S77               | Parsed positive numeric offer fields remain numbers across component/route/service while `confirm` is absent for preview or the exact object for create              |
| Explain RentCast web/app differences and make the reference result defensible      | S59               | Complete source-to-query provenance, two-mile/15-request policy, cache identity, evidence display, base rent kept separate from the human offer                      |
| Reduce ordinary renewal-work approval friction without weakening safety            | S80               | One role/Space/effect matrix; Editor ordinary app work, stronger approvals/configuration unchanged, exact action gates still independent                             |
| Represent the real process and its many substeps                                   | S72               | Exactly six versioned steps with substep evidence, branches, reopening, and base-rent semantics                                                                      |
| Make waiting, last contact, and due work obvious                                   | S75               | One source-backed projection; timing remains unset until client-confirmed and never triggers outreach                                                                |
| “Watch” the created draft and import later communication truth                     | S75               | Deliberate targeted linked-thread refresh with cursor/idempotency evidence; continuous watch/polling remains retired                                                 |
| Make current-month and in-progress work easy to find in a dense usable desk        | S78               | One canonical Live worklist with explicit search/sort/filter/null rules and renewal-scoped accessibility/density behavior                                            |
| Stabilize owner/tenant copy, optional AI tailoring, and channel truth              | S74               | Approved versioned templates, immutable fact envelope, bounded operator-invoked rewrite, deterministic fallback, draft/contact states kept separate                  |
| Put the reviewed comp screenshot in the owner Gmail draft                          | S79               | Receipt-bound one-image MIME attachment behind the still-closed Drive action; no general Drive or attachment primitive                                               |
| Make authentication, connection readiness, and Admin controls findable             | S81               | Task-oriented status/index navigation that preserves every existing permission and ownership boundary                                                                |
| Prove both process behavior and number/evidence behavior on four real cases        | S63               | Two separately reported verdict families, immutable exact app evidence, source-read-only execution, human verdicts not model-filled                                  |
| Verify the operating Sheet/RentVine reads and reconcile conflicting facts          | S72/S63           | Fresh exact source snapshots and explicit conflict dispositions; no source write is inferred from a successful read                                                  |
| Reach the exact RentVine write seam without pretending it is authorized            | S30               | Complete closed/fail-first one-record boundary now; live proof only after separate designation and protected owner direction, followed by mandatory gate restoration |
| Reach documents and Dotloop after renewal stabilization                            | S72, then S66/S34 | S72 exposes exact blocked document substeps and hands off to the existing S66/S34 contracts; no guessed catalog, OAuth, mapping, or completion claim                 |

### Source-conflict resolutions

| Context statement or proposal                                                | Governing resolution                                                                                                                                                                                          |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Automated three-day owner/tenant follow-up or broad multi-channel automation | S75 may compute/display due work only after confirmed policy. No scheduled, model-triggered, bulk, or autonomous client communication is permitted.                                                           |
| Proposed 45-day signature follow-up                                          | It remains non-operative until entered as client-confirmed policy; no default is inferred from meeting notes.                                                                                                 |
| A fake tenant/test identity or an informal property mention for a live proof | Production is Live-only and fake/sample identities cannot create drafts or writes. S63 uses the securely configured four real read-only cases; S30 needs a separately explicit client-designated live record. |
| “Hide the Sheet row” as proof of completion                                  | The operating Sheet write key is closed. App completion and provider/Sheet completion remain different facts; only a separately authorized receipt/readback may establish a source write.                     |
| Write to the operating Sheet while stabilizing renewal                       | The operating Sheet remains read-only. S76 owns the distinct-copy compare-and-set rehearsal and is intentionally outside this implementation bundle until the required copy exists.                           |
| Send owner/tenant messages from the application                              | The terminal client-facing effect is an unsent Gmail draft. A person sends from Gmail; direct application send keys remain permanently closed.                                                                |

### Required sequence and standalone outputs

| Order | Suite | Standalone output before the next suite consumes it                                                             |
| ----- | ----- | --------------------------------------------------------------------------------------------------------------- |
| 1     | S77   | Shared preview/confirm/reconcile contract with cross-layer checks                                               |
| 2     | S59   | Complete reference-query provenance, cache key, and visible evidence                                            |
| 3     | S80   | Tested renewal capability/effect matrix and exact refusals                                                      |
| 4     | S72   | Versioned six-step/substep state and evidence graph                                                             |
| 5     | S75   | Shared waiting/contact/due projection with unset-safe timing                                                    |
| 6     | S78   | Canonical searchable/sortable Live desk consuming explicit projections                                          |
| 7     | S74   | Versioned copy/fact-lock/optional-assistance contract; final publication may remain blocked on client copy      |
| 8     | S79   | Receipt-bound MIME attachment implementation; live storage remains closed until separately authorized           |
| 9     | S81   | Task-oriented Connections/Admin manifest and navigation                                                         |
| 10    | S63   | Fresh four-case read-only report with separate process and number verdicts plus real human review               |
| 11    | S30   | Green closed-key implementation; separately authorized one-record live proof remains the final operational gate |

For each row, establish a clean-start readback, materialize its architecture and behavior tests before
implementation, keep preservation separate, run focused falsification, then run
`bash scripts/verify.sh`. Inspect the diff and audit secrets, PII, runtime descriptors, gates, and
scope before delivery. `ALL_GATES_GREEN` means that suite's independently deliverable implementation
is green; `BUDGET_EXHAUSTED` is valid only if an explicit budget exists; `BLOCKED` names the exact
external input/authority and affected acceptance checks after all other safe work is complete. A
green behind-a-closed-gate implementation is not a completed live proof, and a blocked live proof does
not block independent suites.

| Suite | Contract                                                            | Present status                                                                     |
| ----- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| S30   | `docs/feature-suites/rentvine-write-activation.md`                  | Restricted dry seam built; designated test record and gate review required         |
| S31   | `docs/feature-suites/gmail-watch-inbound.md`                        | Continuous watch retired; manual refresh and follow-up integration complete        |
| S34   | `docs/feature-suites/dotloop-esign-activation.md`                   | Internal lifecycle complete; OAuth/catalog/exact provider mappings required        |
| S35   | `docs/feature-suites/leadsimple-activation.md`                      | Internal lifecycle complete; selected account contract and credential required     |
| S36   | `docs/feature-suites/space-self-provisioning.md`                    | Fixed lifecycle complete; one owner-approved pilot packet required                 |
| S37   | `docs/feature-suites/nocode-page-builder.md`                        | Bounded operational-process builder complete and deployed                          |
| S47   | `docs/feature-suites/resident-maintenance-intake.md`                | App intake usable; internal channel lifecycle complete; official contract required |
| S51   | `docs/feature-suites/production-operational-readiness.md`           | Current production operating contract                                              |
| S52   | `docs/feature-suites/production-cost-governance.md`                 | Complete and live-verified                                                         |
| S53   | `docs/feature-suites/greenlight-activation-and-gate-integrity.md`   | Current per-key activation contract                                                |
| S54   | `docs/feature-suites/verification-and-ci-parity.md`                 | Complete; canonical gate current                                                   |
| S56   | `docs/feature-suites/production-live-only-test-lane-retirement.md`  | Complete; current environment contract                                             |
| S59   | `docs/feature-suites/rentcast-live-activation.md`                   | Complete and deployed; query/evidence/reference-only contract is preserved         |
| S63   | `docs/feature-suites/four-lease-renewal-test-set.md`                | Machinery built; secure cohort/log cleanup and fresh evidence remain               |
| S64   | `docs/feature-suites/per-person-approval-authority.md`              | Specified but NOT authorized                                                       |
| S66   | `docs/feature-suites/lease-document-packet-truth-and-prefill.md`    | Truth machinery built; approved catalog/provider mapping required                  |
| S72   | `docs/feature-suites/renewal-step-model-and-workspace-defaults.md`  | Complete and deployed; exact six-step/evidence/compatibility model                 |
| S74   | `docs/feature-suites/tenant-offer-copy-and-channel-truth.md`        | Constrained AI scope approved; exact wording/channel evidence remains              |
| S75   | `docs/feature-suites/renewal-follow-up-state.md`                    | Source/policy seams built; shared desk projection missing; timing values unset     |
| S76   | `docs/feature-suites/renewal-sheet-rehearsal-copy.md`               | Admin configuration/proof seam complete; distinct copy and live proof required     |
| S77   | `docs/feature-suites/renewal-draft-preview-confirm-reliability.md`  | Complete and deployed; exact-confirm/reconcile contract is downstream foundation   |
| S78   | `docs/feature-suites/renewal-desk-triage-and-canonical-journey.md`  | Active; canonical searchable role-consistent Live desk not implemented             |
| S79   | `docs/feature-suites/renewal-comp-screenshot-gmail-attachment.md`   | Active; receipt/MIME design specified; Drive action remains closed                 |
| S80   | `docs/feature-suites/renewal-role-and-action-governance.md`         | Complete and deployed; exact role/Space/effect matrix is downstream foundation     |
| S81   | `docs/feature-suites/task-oriented-admin-connections-navigation.md` | Approved narrow navigation/readiness scope; not implemented                        |

A status in this table is authoritative for planning. A suite body is the acceptance contract, not a
historical progress log.
