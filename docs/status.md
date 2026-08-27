# PMI KC current status

Last updated: 2026-08-27.

This is a present snapshot, not a changelog. Historical implementation detail remains in Git.

## Production

- URL: `https://pmi-kc-app-kq6wuvpiva-uc.a.run.app`
- Service/project/region: `pmi-kc-app` / `pmi-kc-kb-prod` / `us-central1`
- Serving revision: `pmi-kc-app-rmtbh280n-61b78ef991cc`, 100% traffic
- Serving commit: `6aea639728efcad70e3e601e7a031c2b35722e08`
- Descriptor: Production + Live; 11 Spaces; managed runtime identity
- Operating renewal Sheet: read source, write switch off
- Rehearsal Sheet: not configured
- RentVine renewal write: closed and live-unproven
- Direct client sends: closed; governed initiation ends with an unsent Gmail draft

The closure slice is deployed. The canonical local gate passed in 1,361.192 seconds, aggregate CI
run `33069769758` is green, the zero-traffic candidate passed exact identity smoke, and the promoted
revision was read back at 100% traffic.

## Verified product state in production

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
- Rollback rehearsal: 100% traffic moved to predecessor
  `pmi-kc-app-rmtafuqbg-4e2e4ffe0f48`, exact identity and bounded routes passed, traffic returned to
  `pmi-kc-app-rmtbh280n-61b78ef991cc`, and the exact stable smoke passed again.

## Remaining blockers

All remaining capability blockers are external inputs: client process/rent/comp/timing/wording
decisions, the distinct rehearsal copy, the designated RentVine test record, the move-out walkthrough,
and exact provider contracts/credentials/mappings. Internal release engineering is complete. Final
goal closure still requires eight real owner verdicts and the editable, visually inspected customer
readout deck.

## Locked safety

No autonomous client send, no unconfirmed system-of-record write, no operating-Sheet proof, no test
record substitution, and no guessed endpoint, identity, recipient, mapping, policy, or client value.
