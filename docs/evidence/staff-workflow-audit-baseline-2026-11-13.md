# November 12 staff workflow audit baseline

S284 R-S284-1 requires the fail-first table of
[S284](../feature-suites/staff-workflow-audit-qualification.md) to be reproduced on the serving
baseline before any product edit. This record holds identities, counts and verdicts only. The
observations, step logs and screenshots stay in the private rehearsal run directory. No
production request was made for it.

| Item           | Value                                                                                                                                                                                                                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Baseline       | `7f4cf234c18c0b80a0ed88bc08d70e174ae9c311`, served by production revision `pmi-kc-app-rmwcvtvpl-13e72fe3f01f` as read for the November 12 audit.                                                                                                                                                                                     |
| Source main    | `7dde3a79`. Its `app`, `components` and `lib` are identical to `7f4cf234`.                                                                                                                                                                                                                                                           |
| Harness        | `e3fee3a8`: the journeys, their kit, the baseline driver and two test-only hooks, on `16436c4d` (the verdict module and the static check). The recorded run reads harness uncommitted: false.                                                                                                                                        |
| Fixture        | November 5 mix, `tests/fixtures/lease-renewal/november-5-mix.json`, sha256 `a5929f267cce30cf38a1eb6dd118fcbfdef9bc725042f33f684443f864510e8f`, 38 synthetic leases, business date November 13, 2026, working month December 2026.                                                                                                    |
| Recorded run   | `20261113T092836Z-7f4cf234-named`: the guarded rehearsal serving `7f4cf234` in development mode with the mail stand-in and automatic comparison held, all fourteen rows, a harness reset before each row that needs the seeded state. 2 refused connections, both the development server's npm registry lookups the harness expects. |
| Iteration runs | `20261113T090507Z-7f4cf234-named`, `20261113T091108Z-7f4cf234-named` and `20261113T092530Z-7f4cf234-named`, on an uncommitted harness and row subsets. They shaped the journeys and are not the record.                                                                                                                              |

The driver is `tests/browser/one-path-november-12-baseline-driver.mjs`; it writes
`november-12-baseline.json` in the run directory. The journeys are
`tests/browser/one-path-november-12-journeys.mjs`, and each acts through visible controls, the
stand-in hooks and the worker tick helper only.

## Fail-first table on the baseline

Each row is compared with the baseline result the S284 table states. Thirteen of the fourteen
reproduce. Apart from the local demo sign-in and the development server's error overlay, every
write the run recorded was a request made by a control the journey clicked.

| Journey | Observed on `7f4cf234`                                                                                                                                                                                                                                                                                     | Verdict        |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| W12-01  | The first tick sent 0 and held the scheduled offer. A new offer went out from the lease, "Resume reviewed sequence" answered with no dialog, and the second tick sent the held one: 2 tenant messages on 1 thread, the changed end date and then the first.                                                | Reproduced     |
| W12-02  | Before the tick the Offer step showed the scheduled line with the new wording, the scheduled authorization kept the first end date, and 0 out-of-date warnings showed. The tick paused the message for a changed source; afterwards the lease showed 0 hold mentions and unread notifications stayed at 1. | Reproduced     |
| W12-03  | On the first of up to three tries the review stayed open 75 seconds, then Send answered 409 with the "recipients or source facts changed" refusal. The send was the only write and the working record was unchanged.                                                                                       | Reproduced     |
| W12-04  | After the owner reply and a tick (0 sent), all 5 visible refresh and status controls were used. The lease read waiting on the owner in 3 of 3 reads and showed the reply in none, "Refresh linked incoming" never showed, and the owner message record completed with 0 inbound replies.                   | Reproduced     |
| W12-05  | "Accepted" saved on selection with no review step. With follow-ups authorized, the tick at the next due time sent the reminder: tenant messages 1, then 2.                                                                                                                                                 | Reproduced     |
| W12-06  | Following "Set renewal base rent" on the covered lease moved focus to "Owner decides each renewal" in the Pricing basis. 0 controls adopt the agreement amount.                                                                                                                                            | Reproduced     |
| W12-07  | A Rent to recommend that differs from the provider point estimate was saved. The pending Market value equals the point estimate, not the recommendation.                                                                                                                                                   | Reproduced     |
| W12-08  | After the Editor refreshed the linked thread, the Editor's stage line asked for a check of the staff record against that thread. The Approver, with no link to that mailbox, read the same lease as waiting on the owner's response.                                                                       | Reproduced     |
| W12-09  | Sheet rent differences on 3 leases gave 1 "Current rent" row in Waiting on you, naming no lease, and no other row.                                                                                                                                                                                         | Reproduced     |
| W12-10  | Opening the composer from the lease and closing it after two seconds left 1 new draft communication, where there were 0.                                                                                                                                                                                   | Reproduced     |
| W12-11  | The off-cycle lease showed its hold and a primary that names the end date check. 5 of 5 readiness rows read Ready and 0 controls clear the hold, before or after following the primary.                                                                                                                    | Reproduced     |
| W12-12  | The desk table filter showed 4 of the 9 monthly leases; the Working batch has no filter and showed all 9 on return. "Prepare December 2026 leases" names no count and prepared all 5 of the month's targets, 3 of them outside the filter. The other 4 monthly leases are not targets.                     | Not reproduced |
| W12-13  | With a start and no end saved, 0 end dates were offered and the owner review stated no term. After the sole owner's reply and a tick, the answer opened as the manual form: coverage on base rent only, the only option, with no owner selected and no reply channel offered.                              | Reproduced     |
| W12-14  | Start run on Owner Renewal Outreach answered 409 with "Could not start a run." The Tenant Renewal Notice card reads "Needs a process"; Owner Renewal Outreach reads as a Draft process.                                                                                                                    | Reproduced     |

W12-06 first failed in iteration runs `20261113T090507Z-7f4cf234-named` and
`20261113T091108Z-7f4cf234-named`: the click came before the lease page had read its Pricing
basis, and focus stayed on the button. The journey now waits for the Pricing basis, as staff
wait for the page to finish loading. W12-03 is a race between the confirm's reads and a lease
read admission; the journey keeps a review open for 75 seconds, sends, and tries up to three
times. The recorded run hit the refusal on its first try, as iteration run
`20261113T091108Z-7f4cf234-named` did.

W12-12 does not reproduce as stated: the filter is ignored and the button names no count, but
Prepare covers the month's 5 This batch leases, so nine leases are never prepared. The same
reading came in iteration run `20261113T091108Z-7f4cf234-named`.

Static staff-path check on the starting state: fails. `node scripts/check-staff-path-calls.mjs`
exits 1 with 5 direct calls of the sequences route in 2 of 6 scanned files: the seed's send
(`scripts/lib/one-path-rehearsal/seeds.mjs`, line 107) and refresh (line 271), and in
`tests/browser/one-path-november-10-core-journeys.mjs` the N10-03 schedule (line 425), the N10-02
duplicate-send probe (line 540) and the N10-02 refresh (line 585). S284 names the two refresh
posts; the check also finds the other three, and all five move to staff paths. This batch's
November 12 files scan clean.

## Test-only harness hooks

`scripts/one-path-rehearsal-control.mjs` gains two commands. `sheet-cell` serves named operating
Sheet cells of an existing fixture row, which W12-09 uses for its three rent differences.
`process-draft` writes a renewal process Draft with the production seed's placeholder staff
through the served commit's own seed writer into the rehearsal emulator; W12-14 seeds Owner
Renewal Outreach this way, because the rehearsal seeds no process definition. Journey modules
and kits named `one-path-*-journeys.mjs` and `one-path-*-kit.mjs` now travel with `--commit`
beside the drivers that import them.

## Preservation baseline

The S260 driver and verdict module (`tests/browser/one-path-november-9-qualification-driver.mjs`,
`tests/browser/one-path-november-9-qualification-verdict.mjs`), the S271 driver and verdict
module (`tests/browser/one-path-november-10-qualification-driver.mjs`,
`tests/browser/one-path-november-10-qualification-verdict.mjs`) and the S252 journey driver with
its budget kit (`tests/browser/one-path-journey-driver.mjs`,
`scripts/lib/one-path-rehearsal/journey-kit.mjs`) are present at this source and byte-identical
at `7f4cf234`, `7dde3a79` and `e3fee3a8`.

Human verdict: NOT RUN — no human observer
