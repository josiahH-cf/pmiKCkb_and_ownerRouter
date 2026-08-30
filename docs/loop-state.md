# Loop state

Last updated: 2026-08-30. Resume here after reading `AGENTS.md` and `docs/facts.md`.

## Objective

Finish the approved renewal stabilization bundle through S30, then produce the final customer deck,
run the consolidated human litmus, and adversarially verify intent-to-outcome closure without
weakening any send, write, identity, cost, or protected-path boundary.

## Current checkpoint

- Production serves `pmi-kc-app-rmtfzwn77-8153d75d1cd5` / commit
  `e661ef5653821c79c7047bc1952735f3b1ded6f5` at 100% traffic. Exact candidate and canonical smoke,
  normalized runtime parity, Ready state, and managed identity readback are green. Immediate rollback
  is S81 revision `pmi-kc-app-rmtfrv9zf-456d0c8fdc83`.
- S77, S59, S80, S72, S75, S78, S74, S79, S81, and S63 deterministic machinery are implemented,
  verified, pushed, and deployed. S63 exact-SHA CI run `33321026273` is green.
- S63 now uses canonicalized secure exact-four runtime/observation files, verifies the selected Sheet
  row's exact RentVine lease link before app-plane access, freezes create-only baselines, preflights
  append-only evidence, keeps process/number/safety verdicts independent, writes reports only under
  gitignored `temp/test-set/`, and emits value-free terminal output.
- No `S63_TEST_SET_RUNTIME_CONFIG_PATH` or `S63_TEST_SET_OBSERVATION_PATH` packet was supplied. No
  fresh Live capture, report, draft, send, RentVine/Sheet/Dotloop write, or human verdict ran. This
  blocks only S63 operational evidence, not the completed/deployed machinery.
- No protected path changed. `.claude/settings.local.json` and `output/` remain user-owned untracked
  files and must stay excluded from commits and Cloud Build uploads.

## Next exact action

Implement S30's complete closed/fail-first one-record RentVine proof seam. Do not open the protected
action key or perform a live mutation. The implementation must bind a secure exact target/current/
proposed/rollback packet, immutable preview and exact confirmation, one-attempt execution,
readback/reconciliation, rollback proof, and mandatory post-proof closed-key verification.

## Ordered continuation

1. Preserve all deployed S77–S81 and S63 contracts and production invariants.
2. Implement and adversarially verify S30 without touching protected gate/Registry/auth/budget paths.
3. Run `bash scripts/verify.sh`, scope/secret/PII/effect audits, exact-SHA CI, and zero-traffic release
   for any S30 code slice that is independently green.
4. Keep the S30 live proof blocked until one unmistakable client-designated record/field/value and
   separate protected owner direction exist; never substitute another record or infer authorization.
5. Create and visually inspect the editable 16:9 customer readout from final deployed evidence.
6. Run the consolidated human litmus with the owner, including S63's separate process and
   number/read-only reviews; repair failures and record only real dated verdicts.
7. Perform the final intent-to-outcome, standalone-spec, safety, and blocker audit.

## External inputs that remain safe to wait on

- S63 secure exact-four runtime and observation packets plus real human review.
- Exact S30 test lease/owner/field/value plus separate protected gate direction.
- Approved owner/tenant wording, mandatory/forbidden copy, and channel-evidence rules.
- Client timing values and any future RentCast freshness/selection filter.
- Distinct rehearsal Sheet copy and blank proof cell.
- S66/Dotloop catalog/OAuth/mappings; other named provider contracts; remaining human litmus verdicts.

## Safety invariants

No live RentVine write, operating-Sheet write, autonomous/app client send, action-key opening, fake
provider/identity, guessed customer/provider value, protected-path push without exact owner direction,
or secret/client evidence in Git. Every live effect remains previewed, exact-confirmed, idempotent,
receipted, read back, and reversible. Preserve user-owned untracked files.
