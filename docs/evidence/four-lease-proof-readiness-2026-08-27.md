# Four-lease renewal proof readiness — 2026-08-27

This is the value-free execution packet for S63. The generated operational report contains client
data and therefore stays under gitignored `temp/test-set/`; no lease values or identities belong in
this document. Current capture/report scripts still contain exact cohort ids/rows/dates and emit
identity-bearing terminal output. S63 must remove those tracked literals, accept exactly four secure
runtime bindings, and make output value-free before this sequence may run again.

## Approved evaluation decisions

The owner recorded the formerly missing criteria on 2026-08-29:

1. Use S72's approved six ordered steps, detailed substeps, responsible operational roles,
   completion evidence, alternate exits, and reopening rules.
2. Treat contractual base rent as the renewal comparison/decision value. Display recurring charges
   separately; never collapse them into current rent.
3. Request RentCast with a two-mile maximum radius and 15 comparables. Preserve provider order and
   apply no hidden freshness/selection/rejection filter; show retrieval and available comparable age
   evidence without inventing a freshness claim.

These decisions make the process/rent/radius/count criteria evaluable. Missing lease-specific source
or observation evidence still renders only the affected criterion `not evaluated` or blocked.

## Exact execution sequence

1. Confirm Production + Live and keep Gmail draft/send, RentVine renewal write, operating-Sheet write,
   and every other effect unavailable to the proof runner.
2. Prove repository/log scans are value-free, then supply exactly four unique lease-id/Sheet-row
   bindings through the approved secure runtime channel. Missing, duplicate, malformed, or non-four
   input must refuse before a provider read.
3. Run `npm run testset:capture-baseline`. It performs complete read-only RentVine and operating-Sheet
   reads, then creates at most one immutable app-plane baseline per securely configured lease. Its
   terminal output contains only counts and an opaque evidence reference.
4. Inside the authorized Firestore/gitignored-report boundary, verify each bodyless evidence tuple:
   exact lease id, exact Sheet row, timestamp, and source hash. A second capture must refuse rather
   than replace the baseline; none of those values may be printed or committed.
5. Record observed process evidence and number evidence as separate append-only entries. Missing
   lease-specific evidence remains `not evaluated`.
6. Review RentCast output under the approved two-mile/15-request reference policy; preserve provider
   order and record the human observation. No provider output sets offered rent.
7. Exercise only S77 preview/refusal behavior if needed. Do not confirm or create an unsent draft; any
   separate human communication remains outside S63 and is not proof-run evidence.
8. Run `npm run testset:report`. The report is generated from frozen baselines and append-only evidence
   into gitignored `temp/test-set/`.
9. Confirm the report states zero app-created drafts/sends and contains no RentVine or Sheet write
   receipt. Review process and number verdicts separately with the client.

## Deterministic proof already completed

- Baseline identity is lease id plus exact Sheet row and source hash; it is create-only.
- Conflict, stale, missing, expired, ambiguous, and incomplete inputs fail closed.
- Process and number criteria are independent and return `not evaluated` when their required input is
  absent.
- The capture/report modules import no RentVine writer, Sheet writer, Gmail sender, Dotloop executor,
  or general external executor.
- Focused S63 verification on 2026-08-27: four test files, 32 tests, all passing.

The following is not complete: secure runtime cohort input, removal of current-tree case/operator
literals, value-free terminal output, and static rejection of any Gmail draft creator. Prior green
tests do not prove those new S63 obligations.

## Completion evidence

S63 is operationally complete only when four current baselines exist, every required evidence entry
has been reviewed under the approved criteria, real human verdicts are recorded, repository/log scans
are value-free, and the generated report has no unresolved result other than a newly observed client-
data fact.
