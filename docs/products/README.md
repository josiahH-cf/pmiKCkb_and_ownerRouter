# Product lanes

PMI KC is one application with three connected product lanes.

| Lane                    | Current document                       | Present state                                         |
| ----------------------- | -------------------------------------- | ----------------------------------------------------- |
| PMI KC KB               | `docs/products/pmi-kc-kb.md`           | Production source-backed operations shell             |
| Lease Renewal Agent     | `docs/products/lease-renewal-agent.md` | Live reads, reconciliation, comps, reviewed drafts    |
| Workflow Communications | `docs/products/gmail-inbox-zero.md`    | Workflow-linked Gmail adapter; compatibility filename |

Retained maintenance knowledge/history, feedback, approvals and staff work are application capabilities,
not separate Demo products. Custom maintenance, operational Vendor work and resident intake are retired
in current source; Vendoroo stays standalone. Use `docs/status.md` for deployment truth and
`docs/feature-suites/README.md` for unfinished behavior.

## Staff guidance: the help hub

The staff help hub in the app (`/help`) is the canonical staff guidance: a versioned, printable
manual with one process guide per developed feature, a reference page per screen, a glossary and
What changed. Its content is repository-managed in `lib/help/` (see `lib/help/README.md`), its
screenshots come from the isolated synthetic rehearsal (`scripts/run-help-rehearsal.sh`), and
`bash scripts/verify.sh` runs its coverage, control-name, screenshot and content rules gates. The
renewal step-to-control map is `lib/help/content/renewal-control-map.json`.

The earlier operator guide, staff walkthrough and meeting runbook are pointers to the hub; the
printable training guide, meeting brief and their generator are retired (Git keeps them).

## September meeting records

- [Agenda](client-call-agenda-2026-09-09.md): what we did, what we show, what comes next.
- [Blockers](wednesday-decisions-and-inputs-2026-09-09.md): impact, missing input, owner and resume check.
- [Readout](wednesday-delivery-readout-2026-09-09.md): current delivery and repeatability acceptance.
- [Control review](../evidence/renewal-training-control-review-2026-09-09.md): source-grounded limitations.
