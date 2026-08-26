<!-- Standard PMI KC change checklist. Link the active suite or fact when one applies. -->

## What changed

<!-- One or two sentences. Link the slice / fact id when relevant. -->

## Checklist

- [ ] Tests added or updated for behavior changes.
- [ ] `npm run lint`, `npm run typecheck`, and `npm test` pass locally.
- [ ] Canonical verification passes (`bash scripts/verify.sh`); bounded E2E runs when behavior changed.
- [ ] No autonomous client-facing send, sample-to-live effect, secret, or customer value enters the change.
- [ ] Every provider effect uses its exact Action Registry key; this change does not infer category authority.
- [ ] Any live system-of-record write has exact human preview/confirmation, receipt, readback, and rollback.
- [ ] Identity stays `pmikcmetro.com`; no personal account in any auth path.
- [ ] D12 protected paths are isolated and have explicit owner direction before push.
- [ ] Present-truth docs are rewritten or stale docs are deleted; Git history is the archive.

## Rule/threshold change — complete only when applicable

Only rules, thresholds, and deterministic **synthetic** scenarios may reach GitHub.

- [ ] This PR changes only rules/thresholds and/or **synthetic** (fabricated-value) golden scenarios.
- [ ] No client value reaches GitHub: no real decision, no spreadsheet row, no audio, no captured golden set, nothing under `golden-data/` or `docs/client_docs/` is staged. (`verify:redaction` enforces this.)
- [ ] The relevant golden/refusal harness is green.
- [ ] The intended behavior and failure mode are reviewed in-app before activation.
