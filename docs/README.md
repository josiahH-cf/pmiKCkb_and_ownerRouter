# PMI KC documentation

This index defines the active documentation set. Files not listed here are either implementation
details linked from code or non-authoritative source material. Git commit `1356918` is the recovery
point for historical documents removed during the 2026-08-26 context reset.

## Read order

1. `AGENTS.md` — authority and safety.
2. `docs/facts.md` — verified present truth and open questions.
3. `docs/loop-state.md` — current resume state.
4. `docs/plan.md` — current phases.
5. The one relevant product, integration, or active-suite document.

`docs/open-blockers.md` is the unblock packet for external and human holds. Each hold blocks only
its named effect, never development, tests, merges or releases; open it only when a task exercises
one of those effects or the owner reports a step done.

Do not read removed Demo/V1 launchers, old audits, completed program prompts, or ignored
`docs/temp/` scratch as current context.

S113 is complete and deployed. Its five feature specifications and current review evidence define
the consolidated renewal workflow and accepted resource-input limits. The Wednesday materials below
describe the serving dashboard, manual progress, actual controls and source/provider boundaries.
The three-page training guide and one-page brief are current printable handouts. Backend and exact
release acceptance passed; no live customer completion or human usability verdict is inferred.

## Current core

| Need                         | Document                                                |
| ---------------------------- | ------------------------------------------------------- |
| Product contract             | `docs/spec.md`                                          |
| Current status               | `docs/status.md`                                        |
| Current plan                 | `docs/plan.md`                                          |
| Resume point                 | `docs/loop-state.md`                                    |
| Unblock packet (holds)       | `docs/open-blockers.md`                                 |
| Engineering/security         | `docs/engineering.md`                                   |
| Engineering checklist        | `docs/engineering-checklist.md`                         |
| Runner workflow              | `docs/autonomous-agent-runner.md`                       |
| Environment/release          | `docs/environment-handoff.md`                           |
| Auth/identity                | `docs/auth-identity-and-access-strategy.md`             |
| Cost controls                | `docs/budget-and-cost-policy.md`                        |
| Incident response            | `docs/production-incident-runbook.md`                   |
| Provider/action model        | `docs/integration-architecture.md`                      |
| Client actions               | `docs/client-checklist.md`                              |
| Near-term work               | `docs/whats-next.md`                                    |
| Unattended auth (S112)       | `docs/feature-suites/unattended-authentication.md`      |
| Renewal consolidation (S113) | `docs/feature-suites/renewal-workflow-consolidation.md` |

## Current operating contracts

- `docs/google-setup.md` — managed Google/Firebase operations.
- `docs/production-capacity-and-pilot.md` — verified Cloud Run envelope and bounded rollout.
- `docs/product-record-retention.md` — minimum app-owned record retention.
- `docs/work-accountability-data-contract.md` — permitted work/task/session data.
- `docs/voice-and-audience.md` — operator/client copy rules.
- `docs/cherry-bridge-renewal-note-map-2026-08-24.md` — current disposition of the named renewal
  feedback notes.
- `docs/implement.md` — short implementation pointer.
- `docs/release-batch-runbook.md` — ordered owner steps for the one batched release of the
  Awaiting release queue, with its readiness check and failure branches.

## Tool-linked compatibility contracts

- `docs/client-production-cutover.md` — minimal API/smoke contract parsed by release tests; release
  execution stays in `docs/environment-handoff.md`.
- `docs/away-mode.md` — inactive machine marker read by the protected local budget guard; it grants
  no authority.

## Product lanes

- [Printable renewal training](products/renewal-training-guide.pdf) and
  [Wednesday meeting brief](products/wednesday-meeting-brief.pdf) — reviewed client handouts.
- `docs/products/pmi-kc-kb.md`
- `docs/products/lease-renewal-agent.md`
- `docs/products/gmail-inbox-zero.md` (compatibility filename; lane is Workflow Communications)
- `docs/products/lease-renewal-spreadsheet-map.md`
- `docs/products/rentvine-live-field-map-2026-07-22.md`
- `docs/products/move-in-move-out-process.md`
- `docs/products/rentvine-connection-setup.md`
- `docs/products/renewal-operator-guide.md` — the operator training guide; its step-to-control table
  is read by `npm run smoke:renewal-guide-controls-browser`, so a step cannot name a control the
  application does not show.

- `docs/products/renewal-client-walkthrough-2026-09-09.md` — reusable visual training with branches, recovery and current availability.
- `docs/products/client-call-agenda-2026-09-09.md` — owner-supplied Wednesday agenda and exact inputs.
- `docs/products/wednesday-decisions-and-inputs-2026-09-09.md` — three client inputs, decisions and owners/dates.
- `docs/products/wednesday-delivery-readout-2026-09-09.md` — current written outcomes and acceptance plan.

## Active feature contracts

Use `docs/feature-suites/README.md` for the suite registry and Markdown feature intake. Its
registered order is not an active execution queue. S113 F1-F5 is complete and deployed after
actual backend/integrated verification, closure of all 33 in-scope findings,
exact CI and every candidate/promotion/observation gate. It serves one dashboard, supported source
corrections, restored RentCast preparation, supplied formatted/copyable drafts, governed Gmail
recovery and audited manual progress. Blank labeled resource fields are accepted pending-team inputs.

S82 conformance, S97 integrity, S98 normal append and owner-approved field updates, S102-S110/readiness
corrections and normal S106/S34 packet handoffs are serving. Real forms/mappings, managed Dotloop
connection/selection and exact closed-key activation still govern dependent document effects.
S96, S83-S86 and S99 retain their deployed contracts. S100 chat sync is deployed; resident-draft
still requires its exact eligible message/email and separate activation. S36 remains queued behind
complete S100. S135–S151's connected assistant, linked-email and AI-first Dashboard/history work
is deployed; overlapping S88–S93/S101 and S95 plans are superseded. S94 remains a separate
unexecuted proposal. Revised S87 belongs to the finalized batch 005 scope below. S112 release authentication passed;
its separate 24-hour unchanged-enrollment longevity proof remains unverified.

Batch 005, application-usability-reliability-2026-10, is active under the named owner launch as fifteen specs
(S168–S181 plus revised S87), intake orders 035–049 in the canonical registry. It covers measured
latency/reliability, whole-app loading feedback, task-sized layouts, resizable tables/docked
information, both message workspaces, concise controls/copy, durable personal views, actionable
identity lookup, legacy Gmail UI retirement and feedback reconciliation/integrated validation.
The named instruction authorizes implementation, green main and one cumulative release. Native
progress is in [the evidence matrix](evidence/application-usability-batch005.json); no release is
admitted. Completed/superseded suites and the three accepted next-batch deferrals stay inert.

Current code, tests, facts and the S113 evidence report own the verified result. Staff-recorded
completion is distinct from provider verification; no live customer completion was seeded.

## Current evidence and templates

- `docs/evidence/renewal-focus-batch-003-validation-2026-10-01.md` — S145 evidence map for the batch 003 renewal Focus suites, with tested environments, corrections and unverified seams.
- `docs/evidence/connected-ai-batch-002-validation-2026-09-30.md` — S141 evidence map for the batch 002 Dashboard and email-refinement suites, with tested environments and unverified seams.
- `docs/evidence/adversary-review-2026-09-29.md` — deployment-source inspection and verified corrective delivery, with remaining external/human boundaries stated explicitly.
- `docs/evidence/batch-litmus-audit-2026-09-28.md` — all thirteen suites, the 118 supplied litmus references, original release receipts and their exact verification scopes.
- docs/evidence/renewal-training-control-review-2026-09-09.md — current control and handoff analysis.
- docs/products/build-renewal-handouts.py — printable training and meeting documents.

- `docs/evidence/wednesday-readiness-review-2026-09-07.md` — adversarial scope and exact result ledger.
- `docs/products/wednesday-delivery-readout-2026-09-09.md` — current meeting readout. The stale
  August deck/PDF were retired from the active tree; Git retains the original versions and the
  pending local drafts were preserved privately before removal.

- `docs/evidence/ui-ux-audit-2026-08-31.html` — self-contained source-evidenced UI/UX audit
  workbench with matrices, findings, recommendations, reviewer decisions, and generated handoff.
- `docs/evidence/current-rent-bodyless-diagnostic-2026-08-26.md`
- `docs/evidence/rentvine-one-record-proof-readiness-2026-08-30.md`
- `docs/evidence/gmail-dwd-grant-2026-07.md`
- `docs/evidence/gmail-production-activation-2026-07-13.md`
- `docs/evidence/s66-artifact-field-participant-gap-ledger-2026-08-10.md`
- `docs/evidence/s66-boom-document-source-decision-2026-08-10.md`
- `docs/source-corpus/client-production-source-manifest.template.json`
- `docs/source-corpus/lease-renewal-source-inventory.template.json`
- `docs/source-corpus/rentvine-proof-runtime.template.json`
- `docs/source-corpus/rentvine-proof-confirmation.template.json`

`docs/brand_pack/` contains versioned visual source assets, not operating authority. Ignored
`docs/client_docs/` and `docs/context_and_calls/` contain local client source material; do not load
them by default, cite them as committed evidence, or treat them as governance.

## Provenance policy

Historical material is recovered with Git, for example:

```bash
git show 1356918:path/to/old-document
```

Do not restore an old document into the active tree merely to preserve history. Extract only the
still-true fact, verify it against current code/live state, and place that concise result in the
appropriate current document.

B-GOLD1 closed after owner-reviewed source evidence and a single expected-label correction;
source values and all assertions are preserved. Local authentication works after reboot.
The separate 24-hour unchanged-enrollment proof remains unverified. The thirteen-feature batch and all confirmed adversarial repairs passed their cumulative release gates, independent source/runtime proof and six guarded remote product checks. The current resume state records verified completion.

September 10 unblock continuation is embedded in S113 F2.4–F5.1 and the updated S106/S34 contracts.
The supplied private template pack now replaces the prior missing-wording assumption. Production
credentials/forms and exact live release checks remain separately owned.
