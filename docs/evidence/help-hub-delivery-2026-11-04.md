# November 4 staff help hub delivery

Verified application delivery: **2026-11-04T19:31:37Z**. This release delivers S242–S244, the
S245 litmus template and validator, and the merged #173 adversary-review fixes in one candidate.
Raw receipts, logs and diagnostic output stay outside Git; this record carries identifiers and
counts only.

## Exact source and delivery chain

| Link                    | Observed evidence                                                                                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Qualified source        | Help hub `a88e956da5d57c7de85a48ad682811e1446306b3` (#175) and adversary fixes `173ad2a602111fb4e8c2446ecbad96299a17d2dd` (#173); queue `6f0f42c1`, format `b0f3fca2`, watcher fix `323e8be36535dabe21623ff28ca1160f8aae6657` (#176) |
| Local qualification     | Pull-request head full gate: 10,387 unit tests, 497 backend tests, router/falsification/freshness/active-path/traceability/copy-voice/redaction and all four help gates passed (`verify exit=0`)                                     |
| Exact-main CI           | [41886947757](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/41886947757), push/main/exact 323e8be3; all five jobs successful                                                                                    |
| Run / permit            | `74d79a9d-87ff-4084-93e2-d09ac5e8a15f`; fresh approved CLI/ADC, Admin browser, billing and cost prerequisites; batched preflight GO with nine queued items in one candidate                                                          |
| Application build       | Regional `98e4dfca-c178-495f-8524-9a81bbb05e98`, SUCCESS 19:18:28.271080Z; one application-build claim                                                                                                                               |
| Revision / image        | `pmi-kc-app-rmw2hrh4d-8b96ea7b6800`; image `sha256:93bf63b87284ed82779ce61f25ebcef1ba4739f1495a7417feae7edc0ee5b7dc` matches the successful build                                                                                    |
| Recovery                | Receipt `3f9b14b5-4440-4fd0-89d3-21e4c6ba1968` issued 19:13:21.919Z; predecessor `pmi-kc-app-recovery-6960e4e15a7145be` (b5ba7802); target `pmi-kc-app-recovery-74d79a9d87ff4084`; equal fingerprints, Sheet=true                    |
| Candidate               | Receipt `f6cf1600-89fc-4542-9a46-c12b7df7a7a7`, issued 19:24:17.951Z; exact commit/revision/configuration, Admin passed, Editor `not_run`, reconciliation matched, monitoring ready                                                  |
| Promotion               | Receipt-bound exact revision, started 19:24:27.198Z and verified 19:24:32.657Z                                                                                                                                                       |
| Observation             | Passed two checkpoints over **413,080 ms**, minimum 300,000 / deadline 480,000 ms; report generated 19:31:20.279Z                                                                                                                    |
| Reconciliation / safety | 375 source/projected/rendered records; zero missing, unexpected, duplicate, field or destination discrepancies; thirteen Admin routes rendered with zero diagnostics/mutation attempts; candidate 5xx and unresolved effects zero    |
| Terminal controller     | Exit 0 at 19:31:23Z; checkpoint complete, exact lastDeployedSha 323e8be3, permit consumed; no rollback                                                                                                                               |
| Independent readbacks   | All eleven sections matched at 19:31:37Z: canonical/tag identity, exact 100% traffic, revision/image/configuration, regional build, candidate/promotion/observation/checkpoint and the current candidate domain                      |

Runtime fingerprint is
`sha256:71c35604ae103658e23bc9255cb7f7054c84d54549c392671e50a30a61163cd5`. A revision comparison
against the predecessor found exactly 54 environment keys on both, with only APP_COMMIT_SHA
changed; the five secret bindings and the managed runtime identity match. Eleven paired Space maps,
Production/Live, Demo=false and Sheet=true match the reviewed configuration. Nine authorized
domains include the canonical host and exactly one current candidate host
`cand-rmw2hrh4d-8b96ea7b6800`.

## The first run of this source and its rollback

Run `6960e4e1-5a71-45be-943c-2765d7a299a1` released the same application source at `b0f3fca2`
(exact-main CI `41871187086`). Candidate receipt `5a076419-0bbe-413c-b2b3-f074a32e2da9` issued at
18:11:34.913Z and promotion verified at 18:11:56.330Z. The first observation checkpoint passed.
At the second, all thirteen Admin routes rendered 2xx with their landmarks and zero diagnostics,
RentVine and the Sheet read completely (375 records) and candidate 5xx stayed zero, but the
reconciliation's rendered desk read returned no rows (`application: unavailable`,
`source_unavailable`). The observation decided **hold** at 402,555 ms with no rollback.

The operator resume first looped as documentation-only: promotion records the head as deployed, so
the same-head diff is empty. PR #176 (`323e8be3`, exact-main CI `41886947757`) keeps an unfinished
same-head checkpoint in its own phase, with a fail-first test. The fixed resume re-entered the
observation after its decision window; the observation child exited without a report, which the
release controller treats as unavailable post-promotion evidence. It rolled canonical traffic back
to the exact predecessor through `pmi-kc-app-recovery-6960e4e15a7145be` (recovery receipt
`beb73c2c-85df-43fa-a94c-56da84e6c761`), `ROLLED_BACK_VERIFIED` at 18:48:03.045Z. Canonical
`/api/version` then read b5ba7802 on the recovery revision with HTTP 200. Production served the
predecessor from 18:48Z until this delivery's promotion at 19:24:32Z.

Read-only diagnostics followed before any retry. Request logs for the promoted revision showed only
2xx responses to the reconciliation's desk loads and active staff renewal work in the same minutes,
including source refreshes. A diagnostic reconciliation of the zero-traffic candidate from its exact
checkout, under the release's own `s232-one-status` guidance contract, matched 375/375/375 with zero
discrepancies. A first diagnostic run without that contract reported four row-state differences on
both the old and new code; an attributed copy named one check (`ended_without_outcome` rows), which
the contract admits, so those were a diagnostic artifact. The empty checkpoint-2 read was not
reproduced; its most likely cause is a read that met a source refresh in progress.

Run `697b754f-42ef-447a-8b37-320e0a4dd9fb` earlier admitted the same head from a checkout whose
environment file lacked the two reviewed communication-worker fields; assurance refused candidate
`pmi-kc-app-rmw2dlj3d-fc77e05f92e2` before any probe and production was untouched. Both terminal
runs' checkpoints and permits were copied byte-for-byte and archived as superseded under the
release lock with reason records. No archived run was resumed afterwards.

## Delivered scope and remaining work

- **S242** signed-in Help section: navigation, versioned content, print, deep links and gates.
- **S243** process guides, screen references, glossary and What changed, with screenshots captured
  from the isolated synthetic rehearsal by a repeatable script.
- **S244** in-app help copy refresh with Open the guide links and plain-text fallback.
- **S245** litmus template and validator. The machine-run litmus continues against the released
  build; its report and any repairs within S242–S244 scope ship as their own release, which must
  pass the same gates.
- **#173 fixes**: S130 canonical claim Space and scan codes, S241 revision binding and placeholder
  Start refusal, S227 retired-history labels, S125 read gate and S235 display parity.

Both Dotloop write keys remain closed and signing stays human. No customer dispatch, provider
business write, signature or production test record was release proof. Editor-browser, phone and
human acceptance remain unverified in their named scopes. Holds remain in
[open-blockers](../open-blockers.md).
