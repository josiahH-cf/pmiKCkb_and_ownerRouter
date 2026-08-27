# Loop state

Last updated: 2026-08-27. Resume here after reading `AGENTS.md` and `docs/facts.md`.

## Objective

Finish the active internal-gap closure goal, ship it safely, obtain real human verdicts, and deliver
the editable customer deck without a RentVine/operating-Sheet/client-send effect.

## Current checkpoint

- Support readback: Work resolved; Connections and move-out acknowledged; none new.
- RentVine write metadata corrected; key remains closed; no provider write.
- Admin rehearsal-copy save, discrepancy workflow, manual Gmail refresh, S75 rules, S36 fixed pilot,
  S37 page builder, and provider lifecycle seams implemented.
- Gmail Pub/Sub subscription/topic deleted after exact dependency readback; both now absent.
- Production-only dependency audit is zero and patched behaviors pass.
- Focused suites and typecheck pass; format/lint pass with pre-existing warnings only.
- First rollback attempt safely restored current traffic after the old predecessor lacked
  `/api/version`; repeat after deploy against the version-aware predecessor.
- Production still serves `pmi-kc-app-rmtafuqbg-4e2e4ffe0f48` / commit `13569183...`.

## Next exact action

Finish present-truth docs, run `bash scripts/verify.sh`, review the diff and action gates, then commit,
push, wait for CI, and deploy through a zero-traffic candidate.

## After promotion

1. Prove rollback to the captured version-aware predecessor and restoration.
2. Update revision/commit/test evidence in facts, status, router, and completion audit.
3. Ask the owner to perform all eight human-litmus rows; never fill their verdicts by inference.
4. Use @presentations to author, export, and visually inspect the final 8–10 slide deck.

## External inputs that remain safe to wait on

- Client renewal process, current-rent, comp, wording, timing, scope, and override decisions.
- Distinct shared rehearsal Sheet copy and blank proof cell.
- Unmistakable designated RentVine test lease/owner plus separate gate review.
- Move-out walkthrough and exact lease behind the wrong-resident report.
- S66/Dotloop catalog and OAuth mappings; LeadSimple account contract/credential; official RentVine
  resident-channel contract; one S36 owner-approved pilot packet.
- Explicit owner decision if S64 is ever to be authorized; it remains unimplemented.

## Safety invariants

No live RentVine write, operating-Sheet write, autonomous client send, action-gate opening, fake
provider identity, or secret/client evidence in Git. Preserve `.claude/settings.local.json` and
`output/` as user-owned untracked material.
