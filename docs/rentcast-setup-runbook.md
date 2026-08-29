# RentCast operations

Updated: 2026-08-29.

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

## Approved query policy

- Request a maximum radius of two miles.
- Request 15 comparable records; fewer than the existing three-usable-comparable floor fails closed.
- Preserve RentCast provider order and correlation; apply no hidden application-side freshness,
  selection, or rejection filter.
- Show retrieval time and available comparable age fields without inventing a freshness claim.
- Treat every result as reference evidence and preserve the human decision/approval boundary.

Any later freshness or selection/rejection rule requires a new explicit versioned client/Admin
decision; it is not inferred from the current provider payload.

## Failure

At allowance exhaustion, missing key, entitlement failure, provider error, or invalid response, fail
closed and show a clear unavailable state. Do not bypass the gate with untracked manual values.
