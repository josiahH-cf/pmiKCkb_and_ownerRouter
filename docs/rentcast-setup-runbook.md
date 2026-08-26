# RentCast operations

Updated: 2026-08-26.

RentCast is configured and live for the exact reference-read action.

## Current state

- Secret Manager key bound to Production.
- Provider selected.
- Controlled listing and market probes succeeded.
- Cache and persisted usage counter built.
- Measured allowance: 50.
- Exact key `rentcast.rental_listings.search` is production-allowed.
- Provider output remains reference data and cannot set offered rent or write a source system.

## Operator use

Use a real lease address/unit only inside the authenticated application. Review the returned source,
range, comparable count, and age. Do not treat the estimate as an approved offer.

## Open policy

Client/Admin still needs to confirm search radius and comparable-count rules. Until then, label output
as reference and preserve the Admin approval boundary.

## Failure

At allowance exhaustion, missing key, entitlement failure, provider error, or invalid response, fail
closed and show a clear unavailable state. Do not bypass the gate with untracked manual values.
