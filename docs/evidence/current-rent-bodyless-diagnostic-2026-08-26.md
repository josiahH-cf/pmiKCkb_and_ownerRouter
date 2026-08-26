# Current-rent bodyless diagnostic — 2026-08-26

This report records a read-only comparison of the complete RentVine lease export and the configured
renewal Sheet. It deliberately contains no rent amount, address, resident name, lease id, owner name,
email, or row content.

## Read evidence

- Read at: `2026-08-26T13:12:05.390Z`
- RentVine export: complete
- RentVine rows read: 306
- Resolved extraction precedence: `unit.rent`, then `lease.currentRent`, then `lease.rent`
- Rows with `unit.rent`: 306
- Rows with a lease-level rent key: 0
- Rows containing both shapes: 0

The observed export therefore does not answer which value wins when both shapes are present; it does
prove that every row in this read carried the unit-level shape. The code now uses the same explicit
precedence in both extractors and has a differing-values fixture so future drift is visible.

## Reconciliation counts

The diagnostic produced these value-free current-rent outcomes across all assembled records:

| Outcome                                         | Count |
| ----------------------------------------------- | ----: |
| Sources agree                                   |    14 |
| Sources conflict                                |    20 |
| Only one source is present                      |   140 |
| Both sources are missing or could not be joined |   216 |
| High-severity current-rent flags                |    20 |

These categories overlap the full reconciliation record set in the same way the pipeline reports
them; they are not a count of unique leases. They do not prove that one source is wrong. A conflict
may be a true data error, a base-rent-versus-total-charge definition difference, a stale snapshot, or
an identity/join issue. The app now refuses to label an open or stale rent as Verified and accepts an
exact record-specific human resolution without writing either source.

## Reproduce safely

Run `npm run diagnose:current-rent -- --env-file=.env.local`. The command performs reads only and
prints counts and field-path presence only. It must never print a source value or make a RentVine or
Google Sheet mutation.
