# PMI KC documentation

This index defines the active documentation set. Files not listed here are either implementation
details linked from code or non-authoritative source material. Git commit `1356918` is the recovery
point for historical documents removed during the 2026-08-26 context reset.

## Read order

1. `AGENTS.md` — authority and safety.
2. `docs/facts.md` — verified present truth and open questions.
3. `docs/loop-state.md` — current resume state.
4. `docs/open-blockers.md` — what is holding the next step and who owns each hold.
5. `docs/plan.md` — current phases.
6. The one relevant product, integration, or active-suite document.

Do not read removed Demo/V1 launchers, old audits, completed program prompts, or ignored
`docs/temp/` scratch as current context.

Use the four simplified Wednesday documents below for the client session. The training guide is
lease-agnostic, with a workflow map, actual phase labels, expected results and stopping points.
docs/products/build-renewal-handouts.py renders the Markdown into two PDFs in output/pdf.
Run with Python/reportlab; --font-dir C:/Windows/Fonts embeds Arial for this host's printable copy.
Release acceptance and full live workflow completion remain open.

## Current core

| Need                   | Document                                           |
| ---------------------- | -------------------------------------------------- |
| Product contract       | `docs/spec.md`                                     |
| Current status         | `docs/status.md`                                   |
| Current plan           | `docs/plan.md`                                     |
| Resume point           | `docs/loop-state.md`                               |
| Open blockers          | `docs/open-blockers.md`                            |
| Engineering/security   | `docs/engineering.md`                              |
| Engineering checklist  | `docs/engineering-checklist.md`                    |
| Runner workflow        | `docs/autonomous-agent-runner.md`                  |
| Environment/release    | `docs/environment-handoff.md`                      |
| Auth/identity          | `docs/auth-identity-and-access-strategy.md`        |
| Cost controls          | `docs/budget-and-cost-policy.md`                   |
| Incident response      | `docs/production-incident-runbook.md`              |
| Provider/action model  | `docs/integration-architecture.md`                 |
| Client actions         | `docs/client-checklist.md`                         |
| Near-term work         | `docs/whats-next.md`                               |
| Unattended auth (S112) | `docs/feature-suites/unattended-authentication.md` |

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

Use `docs/feature-suites/README.md`. It is the sole queue for the current initiative. S96, S85, S86,
S83, S84, and S99 are complete and deployed. S82, S97, and S98 each have a deployed baseline plus a
bounded integrity/conformance remediation that is active and unreleased. S98's correction preserves
safe normal append while refusing fixed-row update/delete/restore operations unsupported by a stable
provider seam. The expanded S51/S54 production-assurance gate owns their shared release. S100 chat
sync is deployed; its resident-draft
action remains blocked on the exact live input named in `docs/facts.md`. The owner's 2026-09-03 renewal-completion direction adds S102-S111, rewrites S34, and executes
them before S36; see the README bundle section. S36 is queued behind
complete S100, and S87-S95 plus S101 remain specification-only desired behavior. S112 (unattended
authentication) is active: September 8 enrollment/reboot proofs passed; September 9 CLI/ADC require reauth; elapsed-session and managed
browser acceptance remain in `docs/open-blockers.md` B-AUTH2. Completed suite narratives are removed once current code, tests,
and facts own their contract; Git history retains provenance.

## Current evidence and templates

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
Elapsed-session proof, exact browser assurance and release acceptance remain pending.
