# Current plan

Updated: 2026-11-06 (UTC), resumed one-path UX review.

## Authorized outcome

Current work is the November 6 owner-directed review of the merged S246–S253 source and S254
harness at `2187cf09`, including the prior runner's unmerged litmus repairs. Record expectations,
walk the isolated rehearsal, repair evidenced UX problems with specifications and preservation
checks, then deliver a pull request with `bash scripts/verify.sh` and exact-head CI green. Keep
automatic comparisons held off in verification. The owner merges, releases and deploys. The
engineering review establishes no staff acceptance or real-provider outcome; human verdict NOT RUN.
The earlier delivered program below remains background, not an instruction to restart its release.

Implement and qualify the finalized work for the three active application lanes, the seven
assessment gaps, newly diagnosed A-08 PDF publication dependency, and the configuration/approval/
communication work needed to unblock real renewals.
The owner finalized this scope, then launched implementation and backend-question maintenance.
It was delivered at `b5ba7802` / `pmi-kc-app-rmw123csb-dc0ce89a8583`; the current serving source
`5b5c65c6` / `pmi-kc-app-rmw3h1wp5-706485135a02` includes it.
The four independent source findings are repaired and reviewed; full07 passed 10,162 unit tests
with four parity skips and all 497 backend tests, core passed 46 with 23 explicit configuration
skips, and exact-main CI passed all five jobs. Run `ff1f44bf` passed candidate/promotion, two
observation checkpoints over 417,609 ms, 375 matched records and eleven final readbacks.
The permit is consumed and the application queue is delivered.

Thirteen normal configuration outcomes passed actual readback: source destinations v16,
Dotloop observation/unchanged selection v1, settled notice basis v1, and the same existing process
corrected/published Active v1 with six steps, three links, verified immutable bytes and zero runs.
The [current delivery evidence](evidence/application-gap-delivery-2026-11-03.md) separates every
qualification, delivery, configuration, UI and human/provider boundary. Communication remains the
existing private copy-only workflow; this grants no mailbox draft/send or invitation.

The live re-index handoff is safely non-runnable because its runtime lacks the necessary source
metadata-list permission. Source/approval/schema/generation are present and an owner-side handoff
is privately validated without import. S240 explicitly excludes IAM changes, so a prepared narrow
scope-deviation decision belongs to the project owner, not Dan or the client source custodian.
No new grant was applied. Preserved process staffing placeholders require a real responsibility
decision before new staff-accountable checklists are claimed. Both precise holds are in
[open-blockers](open-blockers.md), alongside genuine content/case/human/activation dependencies.

Baseline: main 39435919; deployed bc97535379dd08deab578455b00a80fc93b8d209 /
pmi-kc-app-rmvzwt7ms-00754475effd, verified in the
[November 3 assessment](evidence/current-application-gap-analysis-2026-11-03.md).
[Delivery evidence](evidence/application-delivery-2026-11-03.md) retains the completed release,
consumed permit and prior verification limits. A future run must re-establish source and deployment;
it cannot resume the completed run or infer an execution grant from this plan.

The S242–S245 staff help hub and the merged #173 adversary-review fixes were delivered on
November 4 by run `74d79a9d` (exact-main CI `41886947757`, two observation checkpoints in
413,080 ms, 375 matched records, eleven matched readbacks); see the
[help hub delivery evidence](evidence/help-hub-delivery-2026-11-04.md). The S245 machine-run
litmus accepted the hub on Run 4 ([litmus report](evidence/help-hub-litmus-2026-11-04.md)). Its
repairs, help V1.1 and the S235 Admin form-family hint were delivered on November 5 by run
`6951545a` (exact-main CI `41979132377`, two observation checkpoints in 416,972 ms,
375 matched records, eleven matched readbacks). Its first candidate assurance pass stopped before
promotion with production untouched and no proven cause beyond slow cold first loads; the operator
resume of that pass passed assurance and every later phase, with no rollback. See the
[litmus repairs delivery evidence](evidence/help-hub-litmus-repairs-delivery-2026-11-05.md).
The litmus's outside-scope fixes for S87, S126, S147, S242 and S86 (PR #182, with PR #180's S113
test fix) were delivered later on November 5 by run `8bf183d8` at `5b5c65c6` (exact-main CI
`42018344883`, two observation checkpoints in 414,492 ms, 375 matched records, eleven matched
readbacks). Every phase passed on its first pass, with no stop, resume or rollback; two
preparation stops (authentication, then `remote_main_moved`) came before admission, and the
release followed main past PR #183's test and CI tooling. See the
[litmus fixes delivery evidence](evidence/s245-litmus-fixes-delivery-2026-11-05.md).

## Settled authoring decisions

- Recover documented PMI decisions and accessible source facts before requesting input. Feed those
  decisions into the existing process, content, configuration and readiness owners, with provenance
  and version binding. Dan is the contact for genuinely unresolved business decisions; asking Dan
  does not make the runner the legal/policy approver. The team prepares the technical proposal and
  only the remaining exact questions. No new approval portal or approval framework is required.
- Notice-basis selection is ordinary authorized renewal-staff intent. A separate Admin confirmation
  is not required. S125 specifies one visible selection, current role/Space and version checks,
  durable audit/readback and ambiguity recovery. The already-settled thirty-day basis is reused;
  this direction grants no general policy/role change or authority to choose unknown values.
- Include the existing new-loop and existing-loop/upload paths through technical readiness and
  a separately gated exact-key activation stage. Both Dotloop keys remain closed now. No signature
  API, new template, new identity or provider effect is inferred. Human signing remains separate.
- Review/correct the actual owner-renewal-outreach definition during this authorized execution,
  publish that reviewed correction through its canonical path with immutable-version readback,
  rather than repairing only a readiness label. Preserve real business approvals and existing
  definition/version/run ownership. Publication starts no process run or communication.
- Use the established private, copy-only Dan/Jon communication workflow. Prepare an accurate
  capability/decision package; no Gmail draft, send, invitation, meeting or external support request.

## Implementation work packages

These are planning packages, not a release queue. Reuse existing owners and acceptance identifiers;
the [suite registry](feature-suites/README.md) identifies the finalized deltas.

| Package                                          | Owning specifications               | Complete engineering outcome                                                                                                                                                                                                             | Depends on / may proceed independently                                                                                                                     |
| ------------------------------------------------ | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1 — Current guidance and actionable work        | S238 A-01; S227 A-07                | Current communications/operator/governance prose and matching validator assertions; retired/completed-proof records excluded consistently from actionable cards, counts and assistant context, with evidence retained                    | Start from current code/readback; no client input, deletion, activation or new authority required                                                          |
| P2 — Read reliability and evidence               | S168 A-05; S238 A-06                | Bounded failure diagnosis, supported narrow repair where established, precise freshness/read/overlay errors and settled My Work/role/view checks; explicit limits when historical causal evidence is unavailable                         | Starts independently; fixture checks cover customer-effect branches; no login/configuration change on an unproven cause                                    |
| P3 — Existing-Space knowledge handoff            | S240 A-02                           | Real importer-compatible source-bound command or precise non-runnable result; intent-only staging and no implicit import                                                                                                                 | Independent of forms and Dotloop; source absence/read failure remains qualified                                                                            |
| P4 — Supplied sources and informed configuration | S130 A-04; S66                      | Eight-source private inventory, proposed maps, recovered decisions and case/policy facts with provenance; exact unresolved questions for Dan; version-bound configuration through existing controls when evidence actually authorizes it | Retrieval/proposals proceed under this launched scope; approval-dependent publication/output waits only on its named missing decision                      |
| P5 — Notice-basis selection                      | S125                                | Authorized renewal staff record the selected basis without an Admin-only or second confirmation gate; exact current-version intent, audit/readback and safe recovery                                                                     | Independent code/fixture work; no new thirty-day decision, legal rule, campaign date or background schedule inferred                                       |
| P6 — Current packet readiness                    | S235 A-03                           | Current context/basis without a snapshot save; excluded families cause no output-material ask; account/generation/time-qualified selection display                                                                                       | Code/fixtures independent; exact-original/map synthetic verification consumes approved P4 inputs                                                           |
| P7 — Existing renewal process                    | S241                                | Publish the reviewed correction to the existing definition and verify its immutable active version; truthful readiness, conflict safety and preserved history, no duplicate process                                                      | Consumes current contract and compatible P1/P4/P6 evidence; unknown content is explicit, not silently approved                                             |
| P8 — Dotloop operational readiness               | S34, consuming S106/S228/S130/S235  | New/existing-loop and upload readiness/refusal/recovery verified in isolation; separately prepared exact-key activation requirements and readbacks                                                                                       | Technical work independent; production creation/upload waits on exact authority, approved bytes/maps and ordinary current-case confirmation; signing human |
| P9 — Integrated evidence and client handoff      | S238, consuming S233/S234/S236/S237 | Focused current-contract regression/journey evidence, copy-ready Dan/Jon update and minimal decision package; separate source/deployed/live/human statuses and exact remaining holds                                                     | Assemble as packages finish; do not hold engineering completion for genuine signatures, human verdicts or unsupported live proofs                          |

## Delivery sequence

1. Pin the current source/deployment and preserve unrelated work, original failures and consumed
   release evidence. Verify approved authentication only as needed; reuse the approved stores.
2. Run P1, P2, P3 and P4 independently where their boundaries do not conflict. Inventory and
   proposed mapping do not wait for legal approval. P5 can proceed alongside them.
3. Build P6 and P7 against the actual owners and compatible inputs; missing input has a truthful
   unset state. Implement P8's technical slice without activating either key.
4. Complete P9 and review every gap/hold against its observable acceptance checks. Recover a decision
   from evidence or ask Dan the smallest remaining question; do not turn a discoverable technical
   fact into a client task or claim silence as approval.
5. For each implemented code slice, require its named failing-then-passing architecture/behavior
   checks in fixtures/emulators, separate preservation gate, applicable bash scripts/verify.sh and
   CI, and privacy/scope audit.
   Read-only inventory and documentation work use their proportionate checks. Any later authorized
   delivery uses the existing exact-main, lock, fresh GO, receipt, candidate, observation and readback
   gates. A prepared interlock is not repeated client consent. Protected-path changes require their
   exact existing authority; this plan creates none.

A package is engineering-complete only when its declared checks and artifacts exist. Root cause
unknown, runtime input pending, key closed, live effect not run and human verdict NOT RUN are distinct
states. A green engineering package does not establish legal approval, owner consent, signatures,
provider creation causality, receipt by a customer or human acceptance. No blanket audit, live proof
rerun, paid comp call or production synthetic record is required to manufacture completion.

P4's implementation diagnosis added A-08/Q-ENG-PUB2 under S130/shared S21. The exact reviewed
blank-original PDF path, complete parser, genuine scanning, canonical/legacy Space compatibility
through downstream readers/filling/transport and source-family binding are now qualified and
delivered. Legal/map gates and process-only trust scope are preserved. General arbitrary KB
file/folder publication remains unavailable outside that bounded repair. No supplied original
was published as test proof; S130 AC-S130-20–24 retain their falsifiable acceptance contract.

## Captured baseline and external seams

The carried S227–S229 contract preserves fresh confirmed renewal delivery; the worker skips old
authorizations and retired maintenance before provider reads. The delegated provider subject remains
integrations@pmikcmetro.com. Both Dotloop write keys remain closed. No protected activation metadata changes
are authorized by this plan; P8 prepares a separately gated later scope only.
No customer send, draft, provider business write or production test record is verification proof.

The completed November 3 release retained exact-head green CI, a receipt-bound candidate, full
300,000 ms minimum observation and independent readbacks. Those controls also govern any later
authorized application delivery. Clear the queue only after delivery is proved; that earlier run
is complete and no new queue is created here.

[Open blockers](open-blockers.md) remains the only external/human hold register. S130/S66 prepare
the form/policy/party decisions; S125 owns notice selection; S34 owns conditional Dotloop activation;
S238 prepares the consolidated communication. Existing source-backed decisions do not require another
generic approval round. Real terms, signer authority, legal use and human observations remain factual
inputs and ordinary business acts, not engineering guesses. Each hold blocks only its named output.

The launched implementation and application delivery are complete within that scope. No older
READY program, stopped owner or consumed permit restarts. Only the exact current external/human
and new-authority holds in docs/open-blockers.md prevent their named outcomes. A new IAM grant
cannot be inferred from this completed release or the existing source handoff command.
