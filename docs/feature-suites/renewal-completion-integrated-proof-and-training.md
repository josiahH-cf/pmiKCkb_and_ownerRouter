<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-completion-v1 -->

# S111 — Integrated model-run proof and operator training guide

> Status: Specified from the 2026-09-03 owner package; not implemented. It runs last and adds only
> the integration coverage the individual suites do not already prove, plus one project-native
> training guide.

**Goal.**

The implementation runner proves that S102–S110, S34, and S106 work together on one coherent
application state, records exact passed, failed, blocked, and not-attempted outcomes, and publishes a
training guide Bailey and Chasity can follow with real application controls.

**Current state / intended end state.**

| Package requirement (PMI-11)                            | Classification    | Evidence                                                                                                        |
| ------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------- |
| Reuse existing test, browser, fake, sandbox conventions | Already satisfied | `bash scripts/verify.sh`, `npm run test:e2e:core`, `npm run smoke:*-browser` against the local rehearsal server |
| Integrated renewal foundation proof                     | Missing           | Added by S102–S104 parity suites; one combined fixture here                                                     |
| Fixed-term renewal end to end                           | Missing           | S105 lifecycle fixture reused                                                                                   |
| Alternate paths                                         | Missing           | S105 branch fixtures reused                                                                                     |
| Dotloop authentication and packet lifecycle             | Missing           | S106 and S34 fake-provider matrices reused; live account is an owner input                                      |
| Unattended continuation                                 | Missing           | S107 fixtures reused                                                                                            |
| Maintenance and intake                                  | Missing           | S108/S109 fixtures reused                                                                                       |
| Dashboard assistant                                     | Missing           | S110 parity reused                                                                                              |
| Training guide                                          | Missing           | No operator guide exists; `docs/products/` holds product lane documents                                         |

Intended end state: one new integration suite under the test tree that composes the
owning services on one fixture portfolio, one extended rehearsal-browser smoke, a proof report in
`docs/status.md`, and a training guide under the product-lane documents registered in
`docs/README.md`.

**Actors and entry conditions.**

The implementation runner executes every check. The training guide addresses renewal operators using
the local rehearsal server (Demo auth, Live read-only) for read-only practice and the production
application for confirmed effects.

**What it is / how it functions.**

1. **Integrated fixture portfolio.** One deterministic fixture set: a fixed-term lease with lease rent
   different from unit rent, a month-to-month lease with and without an anchor, a lease with a Sheet
   conflict, a lease with a missing recipient, and two maintenance tickets (one within preapproval,
   one above). Provider fakes for RentVine, Sheets, Gmail drafts, and Dotloop.
2. **Integrated checks.** Foundation parity (S102–S104), full fixed-term lifecycle and every branch
   (S105), Dotloop connect/refresh/revoke/reconnect/readiness/packet/repeat/readback (S106, S34),
   abort/replay/isolation (S107), maintenance snapshot/waiting-on/preapproval and intake
   flooding/fire/normal/resource/handoff (S108, S109), and the three assistant questions matched to
   their owning views with the zero-write spy (S110).
3. **Browser proof.** Extend the rehearsal-browser smokes to walk desk → lease → return, the
   maintenance report, and the Dashboard three questions, asserting rendered text only.
4. **Report.** Record in `docs/status.md` the exact outcome per check: passed, failed, blocked by
   external environment (Dotloop OAuth app and account; owner troubleshooting links; preapproval
   amounts), or not attempted, with the command that produced each.
5. **Training guide.** A new product-lane document (registered in `docs/README.md`) covers: opening the renewal
   worklist and filtering to the cohort; reading current rent, unit rent reference, term, renewal
   timing, blocker, and next action; opening a lease and returning; resolving a rent discrepancy and
   a term review; recording the owner outcome, preparing the offer, completing approval, creating
   or opening the Dotloop packet, and following the signature handoff; reading attempt state,
   reconciliation, and blockers; recognizing completion and where RentVine, Sheet, Gmail, and Dotloop
   results appear; and practice cases with reset steps that use only in-app correction controls.
   Every step names a visible control and its observable result; no developer step appears.

**In scope / out of scope.**

In scope: the integration suite, smoke extensions, proof report, training guide. Out of scope:
human pass/fail as a gate, LeadSimple, meeting material, or a new harness.

**Open questions & assumptions.**

Live Dotloop and owner-supplied maintenance inputs may be absent; each is reported as blocked by
external environment, never converted into a human verification task.

**Cross-product impacts.**

The new integration suite, browser smokes, `docs/status.md`, `docs/README.md`, and the product-lane
documents.

**Authority and evidence map.**

| Input                                                  | Classification                   | Use and limitation                                                          |
| ------------------------------------------------------ | -------------------------------- | --------------------------------------------------------------------------- |
| `AGENTS.md`, verify/e2e/smoke conventions, S51 harness | Authority / implementation truth | Model-run proof; no fake identity in production; rehearsal refuses effects. |
| Owner package PMI-11                                   | Intent evidence                  | Integrated proof scope and training guide contents.                         |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S111-1** — One integration suite composes owning services on one fixture portfolio; it
  fails today because the S102–S110 seams do not exist.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S111-1** — Every integrated check reports one of passed, failed, blocked, or not attempted
  with its command; no check reports success from a fixture that sets a final state directly.
- **BEH-S111-2** — Every training-guide step maps to a control that the rehearsal-browser smoke can
  locate by visible text.

**Human litmus outcome.**

### Practice a renewal from the guide

**If this was built correctly:** Bailey or Chasity opens the guide, follows each step in the
application, and sees the described result at every step without asking a developer for help.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with the integration suite,
  browser smokes, and guide-control mapping.
- Human verdict: NOT RUN — no human observer; the later practice session is a usage activity, not a
  completion gate.

**Requirement-to-outcome traceability.**

| Requirement                 | Architecture outcome | Behavior outcome | Human litmus                      | Deterministic evidence / falsification |
| --------------------------- | -------------------- | ---------------- | --------------------------------- | -------------------------------------- |
| READY-01 to READY-06 proofs | `ARCH-S111-1`        | `BEH-S111-1`     | Practice a renewal from the guide | Integration suite and smokes           |
| READY-07 guide mapping      | `ARCH-S111-1`        | `BEH-S111-2`     | Practice a renewal from the guide | Guide-control text assertions          |

**Preservation set.**

The canonical gate and every S102–S110, S34, and S106 focused suite.

**Adversarial acceptance checks.**

- **AC-S111-1** — `BEH-S111-1`: a check cannot pass by writing a final state directly to a store.
- **AC-S111-2** — `BEH-S111-2`: a guide step naming a control that the smoke cannot find fails.
- **AC-S111-3** — `ARCH-S111-1`: an unavailable live provider is reported as blocked, never as
  passed or as a human task.

**Forbidden actions / hard gates.**

No human gate, no fake production record, no meeting or scheduling content, no LeadSimple.

**Dependencies / sequencing.**

Last; after every other renewal-completion suite is green.

**Standalone delivery contract.**

- **Deliverable now:** integration suite, smoke extensions, report, guide.
- **Consumes, but does not assume:** live Dotloop and owner inputs.
- **Externally blocked effect:** live Dotloop proof and owner-supplied inputs only.
- **Produces for downstream suites:** the proof report and guide.

**Verification and delivery contract.**

1. Freeze the integration suite failing for the expected reason.
2. Run the suite, browser smokes, `bash scripts/verify.sh`, and `npm run test:e2e:core`.
3. Record exact outcomes in `docs/status.md`.
4. Report `ALL_GATES_GREEN` for closed work; `BLOCKED` names each external input; `BUDGET_EXHAUSTED`
   only with an explicit budget.

**Ordered prompt sequence.**

1. Confirm every prerequisite suite is green.
2. Materialize the integration fixture portfolio.
3. Run integrated checks and smokes; write the report and guide.
4. Update current docs.

**Deletion/merge recommendation.**

Remove once the integrated checks live in the canonical gate and the guide is registered.
