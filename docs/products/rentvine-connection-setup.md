# Connecting the Lease-Renewal Process to Live RentVine Reads

This is the plain-language checklist for turning the lease-renewal flow from "running on
synthetic sample data" into "reading your real leases from RentVine."

## Status: RentVine reads are LIVE (2026-06-24)

The RentVine half is **done and proven**. The credential moved into `.env.local`,
`npm run preflight:rentvine` is green, and `npm run smoke:rentvine-read -- --live` made one
read-only call that returned **25 real leases**. All four unknowns below are resolved:

- **Auth scheme:** HTTP Basic — `Authorization: Basic base64("{API_KEY}:{API_SECRET}")`,
  `Content-Type: application/json`.
- **Lease-read endpoint:** base `https://pmikcmetro.rentvine.com/api/manager`; `GET /leases`,
  `GET /leases/{id}`, and `GET /leases/export` (the export joins tenants/property/unit/balances).
- **Lease response shape → pipeline mapping:** the plain `/leases` list omits tenant names and rent,
  so the live read uses `/leases/export`: tenant ← `lease.tenants[].name`, renewal_date ←
  `lease.endDate`, current_rent ← `unit.rent`. The mapper turns each lease into the same
  `NonSheetCandidate` the pipeline already reconciles (`source: "rentvine"`).
- **Rate limits:** `429` + `Retry-After`; no rate-limit headers were present on the probe response
  (posture recorded; the client handles 429 if it ever appears).

Code: `lib/integrations/rentvine/{client,lease-mapper,health-probe}.ts`,
`scripts/smoke-rentvine-read.ts`, `lib/lease-renewal/live-run.ts`. Reads remain free and read-only;
RentVine renewal **write-back stays parked** (OQ-RV-1, undocumented endpoint).

**Live Google Sheet read — WORKING (2026-06-24).** `npm run smoke:sheet-read -- --live` reads the real
renewal sheet read-only: **26 tabs total, 25 read, the credential tab "Passwords/contacts" auto-skipped**,
counts-only output (tab titles + per-tab dimensions, never a cell value). The real renewal tab is
**"Lease Renewal"** (519×31).

Getting there took working around a managed-domain that blocks programmatic Sheets access three ways:
the user OAuth Sheets scope is "app blocked"; admin-trusting the gcloud client didn't lift it; and a
service account shared on the sheet still got 403 "caller does not have permission" (the domain blocks
the external `*.iam.gserviceaccount.com` account from opening the file even when shared). The fix is
**domain-wide delegation**: the reader reads **as the internal `josiah@pmikcmetro.com` user** via a
keyless signed JWT (`iamcredentials.signJwt`), so no external account ever touches the file and no key
file is stored.

Config (`lib/google-sheets/read-client.ts`): `SHEETS_IMPERSONATE_SA` = `lease-renewal-reader@pmi-kc-kb-prod.iam.gserviceaccount.com`,
`SHEETS_DWD_SUBJECT` = `josiah@pmikcmetro.com`. One-time setup: SA + Token Creator on it,
`sheets.googleapis.com` + `iamcredentials.googleapis.com` enabled, and the SA client id
`104374162913177846911` authorized for `spreadsheets.readonly` in Admin console → Domain-wide delegation.

NEXT: the deterministic units (fingerprint / header resolution / reconciliation) were calibrated to the
synthetic structure; the real sheet's tab names differ, so a full end-to-end review needs calibration to
the live "Lease Renewal" tab (OQ-SHEET-1 / OQ-LEX-1 / OQ-JOIN-1). The credential tab is excluded by both
the title filter and ingest Stage B's content-signature guard.

The original checklist below is retained for reference.

## The short version

- **Reading from RentVine is free.** RentVine is your own account, not a Google service, so reads
  do not spend against the $10 GCP budget. We can build _and_ test the read connection at no extra
  cost.
- **The skeleton is in place.** The system already knows the slot for "read leases" (the
  `rentvine.lease.read` action), the shape it expects back, and where the credentials go. Today
  every RentVine interaction is faked with stand-in data so tests can run; that fake layer is a
  socket waiting for a real plug.
- **One thing is missing: RentVine's API instructions.** We have the credentials; we don't yet have
  the manual.
- Run `npm run preflight:rentvine` at any time to see exactly what is still missing. It never calls
  RentVine and never prints secrets.

## What you provide

1. **The three values, set as environment variables** (so the code can load them):
   - `RENTVINE_API_BASE_URL` — the web address RentVine's API lives at.
   - `RENTVINE_API_KEY` and `RENTVINE_API_SECRET` — these are already saved locally in
     `secrets/rentvine-api-credentials.local.md`; they just need to move into env vars (or Secret
     Manager). Never commit them.
2. **RentVine's API documentation** (a docs page, a PDF, or a Postman collection). This one item
   answers everything the code can't guess on its own:
   - the **auth scheme** — exactly how the key and secret go on a request (which header, what
     format),
   - the **lease-read endpoint** — the path and any filters for listing renewal candidates,
   - the **lease response shape** — the JSON fields a lease record returns, so we can map renewal
     date, current rent, tenant, and property/unit into our pipeline,
   - any **rate limits / polling guidance**.

If you have the wherewithal to set up the RentVine API, getting that documentation (or the access
details from the RentVine API settings page) _is_ the missing piece.

## What gets built once those arrive (all free, all local)

- A real read client that logs in to RentVine and lists renewal-candidate leases.
- The mapping from a RentVine lease record into the facts our renewal pipeline already expects.
- A real "is the connection healthy?" probe to replace the current fake one (this fills the existing
  `health.rentvine.api_key` contract).
- A test that reads a real lease and confirms it matches what the pipeline expects.

That turns lease-renewal from "simulated on fake data" into "running on your real leases," while
every external write stays gated exactly as it is today.

## One honest caveat

_Reading_ from RentVine is well supported. _Writing a renewal back into RentVine_ is not — RentVine
does not publish an endpoint for it, so that piece stays parked (non-executable) until RentVine
support confirms whether it is possible. The near-term win is reading real leases and driving the
renewal _review_ off live data; the write-back to RentVine remains a question for them. This matches
the existing `rentvine.lease.renewal_writeback` gate (`production_allowed: false`).
