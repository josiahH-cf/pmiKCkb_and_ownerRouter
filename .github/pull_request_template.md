<!-- Standard PR checklist. If this is a rule-tuning PR (the learning loop), also complete the
     "Rule-tuning PR" section below. -->

## What changed

<!-- One or two sentences. Link the slice / fact id when relevant. -->

## Checklist

- [ ] Tests added or updated for behavior changes.
- [ ] `npm run lint`, `npm run typecheck`, and `npm test` pass locally.
- [ ] Gates pass: `verify:falsification`, `verify:copy-voice`, `verify:redaction`.
- [ ] No autonomous send, no system-of-record write, no Cloud Scheduler; every Action Registry entry stays `production_allowed:false`.
- [ ] Identity stays `pmikcmetro.com`; no personal account in any auth path.

## Rule-tuning PR (learning loop) — complete only if this PR tunes reconciliation rules/thresholds

The learning loop (S13 H) is deterministic V1: rules + golden-set tuning, **not** model retraining.
Only rules, thresholds, and **synthetic** scenarios may reach GitHub.

- [ ] This PR changes only rules/thresholds and/or **synthetic** (fabricated-value) golden scenarios.
- [ ] No client value reaches GitHub: no real decision, no spreadsheet row, no audio, no captured golden set, nothing under `golden-data/` or `docs/client_docs/` is staged. (`verify:redaction` enforces this.)
- [ ] The golden harness is green in CI (a rejected false-positive scenario fails `npm test` until the math stops raising it).
- [ ] Dan has reviewed the intended behavior change **in-app**; Josiah merges rule-tuning PRs.
