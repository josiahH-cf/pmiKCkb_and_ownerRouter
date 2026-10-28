# S238 isolated November/December journey — 2026-10-28

R-S238-2/R-S238-4 evidence for the isolated engineering journey. Synthetic leases, people, maps
and records only; no customer value, body or screenshot is in Git. Screenshots, the server log, the
network log and the readback JSON stay in private local state under
`~/.local/state/pmi-kc-novdec-journey-20261028/20261028T144930Z-a6f99b6e/`. Human verdict: NOT
RUN — no human observer.

## Environment

- **Source:** committed `a6f99b6e45681c03f477a0c8f48ef5d5a668d01d` on branch
  claude/renewal-novdec-rows-20261028, checked out into a disposable `/tmp` worktree (no overlay of
  uncommitted files). Not served; production remains `6fbd6225` (S231).
- **Runner:** `bash scripts/run-renewal-novdec-journey.sh`. The real Next dev server (Turbopack) in
  the Demo descriptor (`ENVIRONMENT_KIND=demo`, `DATA_CONTEXT=demo`) with local demo sign-in as an
  Editor (`local-demo-editor`), a Firestore emulator on a free loopback port (project
  `pmi-kc-kb-novdec-journey-test`) and headless Chromium limited to the local origin.
- **Provider boundary:** `tests/browser/renewal-novdec-journey-network.mjs` answered 65 synthetic
  RentVine reads (export, two lease details, statuses), 44 synthetic Google sign-in and Sheet reads
  (an operating Sheet with only its header row) and refused every other outbound connection (two
  npm registry checks). No RentVine write was attempted. The server ran with a minimal environment
  and an empty home, so no stored credential could be read. The hard-linked `node_modules` was
  unchanged after the run.
- **Setup, not an observed outcome:** packet people and signer roles were saved through the actual
  `POST /api/lease-renewal/packet-inputs`; the approved intake entry with its reviewed signer map,
  the packet snapshot and the approved filled copy were seeded directly, because no client content
  exists (C01, C02, C08).

## Steps (14 PASS, 0 FAIL)

| Step                | Requirement          | Browser action and observation                                                                                                                                                     | Backend readback                                                                              |
| ------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Sign in             | R-S238-2             | Local demo Editor session                                                                                                                                                          | Session cookie for `local-demo-editor`                                                        |
| Desk, November      | S232 inventory       | Filter renewal date, Month 2026-11, Apply month: the November lease shows, the December lease does not                                                                             | Synthetic RentVine export read                                                                |
| Desk, December      | S232 inventory       | Month 2026-12 shows the December lease                                                                                                                                             | Same read path                                                                                |
| Work record         | S123/S154 binding    | One staff activity choice on the lease page                                                                                                                                        | One work record (cycle) in the emulator after `POST /api/lease-renewal/workspace` 200         |
| Prepared            | R-S236-1/3           | Returned documents and signatures: "Approved filled copy · bbbbbbbbbbbb", state Prepared                                                                                           | None yet                                                                                      |
| Sent for signature  | R-S236-2             | Record sent for signature: state Sent for signature, "Recorded by staff, not provider-verified"                                                                                    | One record, revision 1, sent; activity `sent_for_signature` by `local-demo-editor` with time  |
| Partially signed    | R-S236-3, BEH-S236-1 | One tenant signed: Partially signed; still must sign Riley Example (tenant) and Avery Owner (owner), each with the ask                                                             | Revision 2; signer `tenant:signed`; two activity entries                                      |
| Signatures refused  | R-S236-6, AC-S236-4  | Recording Required signatures complete Done is refused while two signers are missing, naming them                                                                                  | Workspace route 409; nothing recorded                                                         |
| Fully executed      | R-S236-3, BEH-S236-2 | Both remaining signers: "Fully executed by staff record, not provider-verified"; the Dotloop line claims no signature                                                              | Revision 4; three signers signed; four activity entries, each with actor and time             |
| Stale form refused  | R-S236-4, AC-S236-3  | After the packet was re-evaluated, the open form's next record is refused; reload shows Prepared and "Signed an earlier version, not current" with all three signers still to sign | No record for the new snapshot; the earlier snapshot's records unchanged                      |
| Packet state        | R-S235-4             | State Approved from the recorded approval of the current snapshot                                                                                                                  | Approved filled copy for the snapshot                                                         |
| Selection freshness | R-S235-6             | "No Dotloop profile and template are saved" with the Admin next step                                                                                                               | No saved selection in the emulator                                                            |
| Network boundary    | R-S238-2             | Not a UI step                                                                                                                                                                      | 65 synthetic RentVine reads, refused outbound only `registry.npmjs.org`, zero RentVine writes |

## Not covered by this run

- Message compose, Schedule, the November 1, 2026 1:30 AM Central case, worker claims, replies,
  bounces and Resume (S233): covered by unit and emulator tests, not by this browser run.
- Owner approval capture with stale terms and charges (S234) and RentVine/Sheet preview, claim,
  receipt and readback (S237): the Demo descriptor refuses Live provider actions before any claim,
  so their claim and receipt paths stay covered by the emulator tests with deterministic providers.
- Role, Space and mailbox refusals, revoked sender authority and recipient changes: not in this run.
- Genuine cases, provider-functional rows and the staff walkthrough: BLOCKED on C11–C13 and B-HUMAN.

## Development runs

Eight earlier overlay runs on the same head found and fixed harness problems only: Turbopack refused
a linked `node_modules`, webpack cannot bundle the desk's `node:crypto` import, the Sheet read
needed a synthetic stand-in, a seeded snapshot used an object where the packet type requires an
array, Focus view hid the documents section, and one assertion read the Dotloop fallback text as a
signature claim. The browser run also found one product display issue, fixed in `a6f99b6e`: each
document heading used the in-sentence label.
