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
- Canonical local verification passed in 1,361.192 seconds; aggregate CI run `33069769758` is green.
- Production serves `pmi-kc-app-rmtbh280n-61b78ef991cc` / commit
  `6aea639728efcad70e3e601e7a031c2b35722e08` at 100% traffic.
- Version-aware rollback to `pmi-kc-app-rmtafuqbg-4e2e4ffe0f48`, exact smoke, forward restoration,
  and final exact smoke all passed.

## Next exact action

Finish present-truth docs, author and visually inspect the editable 8–10 slide customer deck through
the native presentation capability, then ask the owner for the eight real human-litmus verdicts.

## Remaining internal closure

1. Reconcile revision/commit/test evidence in facts, status, router, and completion audit.
2. Use @presentations to author, export, and visually inspect the final 8–10 slide deck.
3. Ask the owner to perform all eight human-litmus rows; never fill their verdicts by inference.
4. Repair any human FAIL and rerun the applicable gates before final closure.

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
