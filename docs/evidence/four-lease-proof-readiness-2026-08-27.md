# Four-lease renewal proof readiness — 2026-08-27

This is the value-free execution packet for S63. The generated operational report contains client
data and therefore stays under gitignored `temp/test-set/`; no lease values or identities belong in
this document.

## External decisions required before evaluation

The client process owner must provide exactly these three inputs:

1. The client-confirmed six renewal steps, order, owner, and completion evidence.
2. The definition of “current rent” in RentVine and the operating Sheet: base rent or total monthly
   recurring charges.
3. The operator comp policy: search radius, minimum/maximum comparable count, freshness, and the rule
   for selecting or rejecting a suggested number.

Until all three are recorded, affected criteria must render `not evaluated`; they may not fail or
pass by assumption.

## Exact execution sequence

1. Confirm Production + Live and keep RentVine renewal write, operating-Sheet write, and every direct
   send key closed.
2. Run `npm run testset:capture-baseline`. It performs complete read-only RentVine and operating-Sheet
   reads, then creates at most one immutable app-plane baseline per configured cohort lease.
3. For each case, verify the bodyless evidence tuple: exact lease id, exact Sheet row number, capture
   timestamp, and SHA-256 source hash. A second capture must refuse rather than replace the baseline.
4. Record observed process evidence and number evidence as separate append-only entries. Missing
   client policy remains `not evaluated`.
5. Review RentCast output as a reference input only; a human applies the confirmed comp policy and
   records the observation. No provider output sets offered rent.
6. Create any client communication only through the existing unsent-draft flow. A human sends from
   Gmail outside this proof and records that fact separately if the operational exercise requires it.
7. Run `npm run testset:report`. The report is generated from frozen baselines and append-only evidence
   into gitignored `temp/test-set/`.
8. Confirm the report states zero application-initiated client sends and contains no RentVine or Sheet
   write receipt. Review process and number verdicts separately with the client.

## Deterministic proof already completed

- Baseline identity is lease id plus exact Sheet row and source hash; it is create-only.
- Conflict, stale, missing, expired, ambiguous, and incomplete inputs fail closed.
- Process and number criteria are independent and return `not evaluated` when their required input is
  absent.
- The capture/report modules import no RentVine writer, Sheet writer, Gmail sender, Dotloop executor,
  or general external executor.
- Focused S63 verification on 2026-08-27: four test files, 32 tests, all passing.

## Completion evidence

S63 is operationally complete only when the three decisions above are recorded, four current
baselines exist, every required evidence entry has been reviewed, and the generated report has no
unresolved result other than a newly observed client-data fact.
