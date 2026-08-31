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

Do not read removed Demo/V1 launchers, old audits, completed program prompts, or ignored
`docs/temp/` scratch as current context.

## Current core

| Need                  | Document                                    |
| --------------------- | ------------------------------------------- |
| Product contract      | `docs/spec.md`                              |
| Current status        | `docs/status.md`                            |
| Current plan          | `docs/plan.md`                              |
| Resume point          | `docs/loop-state.md`                        |
| Engineering/security  | `docs/engineering.md`                       |
| Engineering checklist | `docs/engineering-checklist.md`             |
| Runner workflow       | `docs/autonomous-agent-runner.md`           |
| Environment/release   | `docs/environment-handoff.md`               |
| Auth/identity         | `docs/auth-identity-and-access-strategy.md` |
| Cost controls         | `docs/budget-and-cost-policy.md`            |
| Incident response     | `docs/production-incident-runbook.md`       |
| Provider/action model | `docs/integration-architecture.md`          |
| Client actions        | `docs/client-checklist.md`                  |
| Near-term work        | `docs/whats-next.md`                        |

## Current operating contracts

- `docs/google-setup.md` — managed Google/Firebase operations.
- `docs/production-capacity-and-pilot.md` — verified Cloud Run envelope and bounded rollout.
- `docs/product-record-retention.md` — minimum app-owned record retention.
- `docs/work-accountability-data-contract.md` — permitted work/task/session data.
- `docs/voice-and-audience.md` — operator/client copy rules.
- `docs/cherry-bridge-renewal-note-map-2026-08-24.md` — current disposition of the named renewal
  feedback notes.
- `docs/implement.md` — short implementation pointer.

## Tool-linked compatibility contracts

- `docs/client-production-cutover.md` — minimal API/smoke contract parsed by release tests; release
  execution stays in `docs/environment-handoff.md`.
- `docs/away-mode.md` — inactive machine marker read by the protected local budget guard; it grants
  no authority.

## Product lanes

- `docs/products/pmi-kc-kb.md`
- `docs/products/lease-renewal-agent.md`
- `docs/products/gmail-inbox-zero.md` (compatibility filename; lane is Workflow Communications)
- `docs/products/lease-renewal-spreadsheet-map.md`
- `docs/products/rentvine-live-field-map-2026-07-22.md`
- `docs/products/move-in-move-out-process.md`
- `docs/products/rentvine-connection-setup.md`

## Active feature contracts

Use `docs/feature-suites/README.md`. It is the sole queue for the specified-but-unimplemented S82-S96
initiative; after its documentation-readiness gate, S96 is the first executable suite. Completed
suites were removed from the active tree; code, tests, current facts, and Git history are their
evidence.

## Current meeting package

- `docs/pmi-kc-client-action-center-2026-08-26.html`
- `docs/pmi-kc-meeting-agenda-2026-08-26.html`
- `docs/pmi-meeting-reconciliation-2026-08-26.md`
- `docs/pmi-kc-meeting-readiness-human-litmus-2026-08-26.md`
- `docs/evidence/pmi-kc-renewal-stabilization-readout-2026-08-30.pptx` — editable 16:9 customer
  readout.
- `docs/evidence/pmi-kc-renewal-stabilization-readout-2026-08-30.pdf` — matching inspected
  10-page readout.
- `docs/evidence/renewal-stabilization-suite-audit-2026-08-30.md` — final standalone dual-model and
  intent-to-outcome audit.
- `docs/evidence/current-rent-bodyless-diagnostic-2026-08-26.md`
- `docs/evidence/four-lease-proof-readiness-2026-08-27.md`
- `docs/evidence/rentvine-one-record-proof-readiness-2026-08-30.md`

## Current evidence and templates

- `docs/evidence/ui-ux-audit-2026-08-31.html` — self-contained source-evidenced UI/UX audit
  workbench with matrices, findings, recommendations, reviewer decisions, and generated handoff.
- `docs/evidence/gmail-dwd-grant-2026-07.md`
- `docs/evidence/gmail-production-activation-2026-07-13.md`
- `docs/evidence/s66-artifact-field-participant-gap-ledger-2026-08-10.md`
- `docs/evidence/s66-boom-document-source-decision-2026-08-10.md`
- `docs/source-corpus/client-production-source-manifest.template.json`
- `docs/source-corpus/lease-renewal-source-inventory.template.json`
- `docs/source-corpus/four-lease-runtime.template.json`
- `docs/source-corpus/four-lease-observations.template.json`
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
