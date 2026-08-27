# PMI KC current status

Last updated: 2026-08-27.

This is a present snapshot, not a changelog. Historical implementation detail remains in Git.

## Production

- URL: `https://pmi-kc-app-kq6wuvpiva-uc.a.run.app`
- Service/project/region: `pmi-kc-app` / `pmi-kc-kb-prod` / `us-central1`
- Serving revision: `pmi-kc-app-rmtafuqbg-4e2e4ffe0f48`, 100% traffic
- Serving commit: `13569183da57c419ac0da279dde5a6d6a0b0da14`
- Descriptor: Production + Live; 11 Spaces; managed runtime identity
- Operating renewal Sheet: read source, write switch off
- Rehearsal Sheet: not configured
- RentVine renewal write: closed and live-unproven
- Direct client sends: closed; governed initiation ends with an unsent Gmail draft

The current closure slice is still a local ship candidate. Production keeps the preceding code until
the full gate, commit, CI, zero-traffic candidate smoke, and exact promotion complete.

## Verified product state in the ship candidate

- Admin can save a distinct rehearsal-Sheet URL/id without a deployment. Saving never reads Sheet
  contents or starts the one-cell proof; the proof also resolves the saved id.
- Renewal discrepancies have append-only dispositions with source identity, proposed correction,
  reason, owner, evidence, and status. No correction can execute without a source-specific contract.
- Gmail continuous watch is retired. Manual refresh fetches only linked threads and derives
  waiting-on/last-contact from provider state; duplicate/out-of-order refreshes are idempotent.
- Admin has versioned global/property/lease timing rules. Unconfirmed policy displays as unset and
  cannot create a timer, reminder, work, draft, or send.
- S36 has one fixed Discovery Engine Space shape with exact preview, official provider adapter,
  durable idempotency/receipt, eleven-Space protection, and isolated retirement. Its flag is off.
- S37 supports only read-only operational process pages composed from allowlisted components, with
  immutable draft/approval/publication/readback/rollback.
- Dotloop, LeadSimple, and the preferred RentVine resident channel have complete internal
  preview/confirmation/idempotency/receipt/readback/correction/rollback seams and remain closed until
  their exact official inputs exist.
- The four-lease proof machinery is immutable, read-only against source systems, separates process
  and number criteria, and reports missing client policy as `not evaluated`.
- Production dependency overrides resolve `fast-uri` 3.1.5, `hono` 4.12.34, `ip-address` 10.3.1,
  and `nanoid` 3.3.18. `npm audit --omit=dev` reports zero vulnerabilities.

## Live operating readback

- Support reports: Work `resolved`; Connections `acknowledged`; move-out `acknowledged` and open for
  the client walkthrough. No report remains `new`; every transition used the audited Admin path.
- Gmail watch Scheduler: absent. The expired watch's sole Pub/Sub subscription and topic were deleted
  and read back absent on 2026-08-27.
- Rollback rehearsal attempt: predecessor traffic and behavioral checks passed, but that old revision
  lacked `/api/version`; traffic was immediately restored to the captured current revision and exact
  restoration smokes passed. A complete rehearsal will use the version-aware current revision as the
  predecessor after this slice deploys.

## Remaining blockers

All remaining product blockers are external inputs: client process/rent/comp/timing/wording decisions,
the distinct rehearsal copy, the designated RentVine test record, the move-out walkthrough, and exact
provider contracts/credentials/mappings. The only unfinished release operations are the current
slice's full gate, deployment/CI, version-aware rollback rehearsal, and real owner verdicts in the
eight-row human litmus.

## Locked safety

No autonomous client send, no unconfirmed system-of-record write, no operating-Sheet proof, no test
record substitution, and no guessed endpoint, identity, recipient, mapping, policy, or client value.
