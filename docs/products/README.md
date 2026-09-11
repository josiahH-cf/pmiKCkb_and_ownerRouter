# Product lanes

PMI KC is one application with three connected product lanes.

| Lane                    | Current document                       | Present state                                         |
| ----------------------- | -------------------------------------- | ----------------------------------------------------- |
| PMI KC KB               | `docs/products/pmi-kc-kb.md`           | Production source-backed operations shell             |
| Lease Renewal Agent     | `docs/products/lease-renewal-agent.md` | Live reads, reconciliation, comps, reviewed drafts    |
| Workflow Communications | `docs/products/gmail-inbox-zero.md`    | Workflow-linked Gmail adapter; compatibility filename |

Maintenance, Vendor/resident work, feedback, approvals, and staff work are application capabilities,
not separate Demo products. Use `docs/status.md` for deployment truth and
`docs/feature-suites/README.md` for unfinished behavior.

## Wednesday packet and reusable training

- [Printable training guide](renewal-training-guide.pdf): three pages covering the full dashboard, actual work and evidence.
- [Printable meeting brief](wednesday-meeting-brief.pdf): one page covering delivery and accepted pending inputs.
- [Training guide](renewal-client-walkthrough-2026-09-09.md): visual process and exact clicks for any lease.
- [Agenda](client-call-agenda-2026-09-09.md): what we did, what we show, what comes next.
- [Blockers](wednesday-decisions-and-inputs-2026-09-09.md): impact, missing input, owner and resume check.
- [Readout](wednesday-delivery-readout-2026-09-09.md): current delivery and repeatability acceptance.
- [Control review](../evidence/renewal-training-control-review-2026-09-09.md): source-grounded limitations.
- [PDF generator](build-renewal-handouts.py): render maintained S113 copy with Python/reportlab after documented release acceptance.

Output filenames: renewal-training-guide.pdf and wednesday-meeting-brief.pdf, in output/pdf.
The generator reads the serving commit and closed finding count from current status; it performs
no live verification and refuses an unaccepted release. Render there, inspect every page, then copy
the reviewed PDFs beside these maintained sources.
These are training documents; no refreshed PowerPoint is claimed.
