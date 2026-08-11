# S66-B Boom document-fact source decision — 2026-08-10

## Decision

Boom is not a lease-document fact source for S66.

No documented authorized read/export contract, identity map, field semantics, freshness rule,
rate/cost boundary, representative read response, or correction path is present. Under the S66 stop
rule, absence of that evidence is a final `no` for the current source policy—not permission to guess.

## Evidence inspected

- `health.boom.partner_api` is a connection-health reference. It proves no field-level read contract.
- `boom.resident.enroll` is the only Boom Action Registry capability. It is a closed High-risk
  enrollment write, not a document read.
- `BoomProvider` in `lib/lease-renewal/execution/providers.ts` exposes only `enroll` and write-attempt
  reconciliation. It exposes no resident, insurance, coverage, accommodation, or program read.
- The S25 executor tests use synthetic enrollment/not-applicable inputs. They are execution-contract
  evidence only and contain no provider document-fact schema.
- No official vendor packet, endpoint/schema, redacted response fixture, authorized read identity, or
  freshness/correction contract exists in the tracked repository.

## Required scenario disposition

| Scenario                   | S66 result                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Enrolled resident          | Boom presence is not queried and cannot prove insurance, RBP, animal, or accommodation facts. Use another approved source or `Needs input`.      |
| Explicitly not applicable  | Only an approved app policy/source may establish non-applicability; the Boom enrollment executor's terminal receipt is not legal document truth. |
| Missing identity           | No Boom lookup runs. The affected fact remains `Needs input`.                                                                                    |
| Stale/conflicting coverage | Boom supplies no candidate. Permitted authoritative sources still yield `Conflict` when they disagree.                                           |
| Provider refusal           | No read is attempted; no number/classification/fact is fabricated.                                                                               |
| Duplicate identity         | No Boom candidate is selected or deduplicated. Participant truth stays with its approved source.                                                 |

## Boundary

S66 code must contain no Boom fact adapter, lookup, endpoint, field map, fallback, or inference. A
structural sentinel must keep Boom out of packet fact sources. The existing separately governed
enrollment action and its health reference remain unchanged and closed; this decision neither
activates nor weakens them. A future official read contract would require new reviewed evidence and a
new source-policy decision before it could contribute a single mapped field.
