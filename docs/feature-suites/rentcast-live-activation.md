<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-stabilization-v2 -->

# S59 — RentCast query truth and reference-comp policy

> Status: Complete and deployed; exact query provenance, provider evidence, cache identity, and the
> reference-only/base-rent boundary are downstream foundations and remain preserved.

**Goal.**

Give a renewal operator a reproducible RentCast reference result whose exact property inputs,
approved search policy, returned evidence, retrieval time, and limitations are visible without ever
turning the provider estimate into an offered rent.

**Current state / intended end state.**

Production has the exact read key open, a Secret Manager-backed key, a measured allowance of 50,
cache, metering, and a hard allowance stop. The deployed path preserves the sibling `unit` and
`property` objects, derives the exact query server-side from one current lease identity, requests a
two-mile maximum radius and 15 comparables, keys cache on every request-shaping value, and displays
the query, omissions, returned evidence, retrieval/cache/quota state, and separately labeled
contractual base rent. The only supported square-footage mapping is a positive-integer `unit.size`;
`property.stateID` is accepted as the address state only when it is a two-letter code; and property
type stays explicitly omitted because `property.propertyTypeID` has no approved RentCast mapping.

**Actors and entry conditions.**

An Editor, Approver, or Admin with Renewals Space access starts from one current Live lease. The exact
lease/address, fresh RentVine read, configured provider, open read key, clear runtime suspension, and
remaining allowance or valid cache entry are required. Missing attributes may be omitted but must be
listed; a missing/ambiguous address, invalid response, provider error, or exhausted allowance fails
closed.

**What it is / how it functions.**

The approved query policy is `maxRadius=2` miles and `compCount=15`. Those are requested limits, not a
promise that RentCast returns 15 usable records; fewer than the existing three-comparable floor fails
closed. The app sends the exact complete address and every supported authoritative unit attribute it
can map: bedrooms, bathrooms, square footage, and property type only when an exact provider-compatible
source mapping exists. It displays sent values and omissions, provider rent/range, ordered comparable
evidence with correlation/distance/attributes/available age fields, retrieval time, cache state,
source link, and quota state. Until a later policy explicitly says otherwise, the app keeps provider
order, applies no hidden freshness or selection/rejection filter, and makes no freshness claim when
RentCast supplies no applicable field.

The renewal comparison value is the RentVine contractual base rent (`unit.rent`); recurring charges
remain separately labeled and never silently combine into “current rent.” Provider results remain
reference evidence. A human records the owner-approved offer through the existing decision path.

**In scope / out of scope.**

In scope: export preservation, exact supported field mapping, two-mile/15-request policy, query-basis
display, comparable evidence, cache identity, result provenance, base-rent separation, quota/cached
truth, and parity diagnostics. Out of scope: inventing property-type mappings, calculating a new AVM,
application-side comp curation, offered-rent automation, screenshot/Gmail delivery (S79), allowance
increase, provider mutation, or source-system write.

**Open questions & assumptions.**

No radius/count or square-footage-source decision remains. A complete redacted live export measured
307 rows: `property.stateID` was present and shaped as a two-letter code on all 307, while `unit.size`
was present on 282 and was a usable positive integer on 259. Missing/invalid size remains a visible
omission. A future client policy may add a comparable freshness threshold or selection/rejection
rule; until then there is no hidden filter and the retrieved timestamp plus raw available comparable
age fields are shown. Property type remains omitted until an exact provider-compatible mapping is
approved.

**Cross-product impacts.**

RentVine export mapping/cache, renewal workspace/desk, market-comp API/provider/cache/quota, S63
four-lease proof, S72 owner-decision step, S79 evidence attachment, owner-draft facts, Admin usage, and
cost controls.

**Authority and evidence map.**

| Input                                                                                               | Classification                | Use and limitation                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`, `docs/facts.md`, and live action/config readback                                       | Authority                     | RentCast is a capped read-only reference seam; the exact key is open, allowance is 50, and no provider result may create an offer or source write.                                          |
| RentVine lease mapper/live-desk attribute projection, RentCast provider/route/cache, and quota code | Verified implementation truth | The candidate preserves sibling `unit`/`property`, resolves query facts server-side, includes every shaping value in cache identity, and projects complete evidence without offer mutation. |
| Mapper, provider, quota, current-rent, desk, and approval tests                                     | Verification baseline         | They anchor source shape, provider validation, three-comp floor, cost accounting, and offer separation; new cross-boundary/cache variants must initially fail.                              |
| Stabilization intake and meeting notes                                                              | Intent evidence only          | They establish the observed RentCast-site/app mismatch and need for screenshot/explanation; they do not authorize an invented mapping, hidden comp filter, AVM, or automatic rent decision. |
| Owner-approved decision in `docs/facts.md`                                                          | Product decision              | The request is a maximum two-mile radius and 15 requested comparables; returned count may be lower and provider order remains visible.                                                      |
| Redacted 2026-08-29 complete RentVine export measurement and one-call RentCast parity proof         | Live read evidence            | Verifies the field shapes, exact supported mappings, one billed AVM read, usable range, subject/comparable evidence fields, zero customer-value emission, and zero durable writes.          |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S59-1** — A raw measured-shape RentVine export row preserves `unit` and `property` through the
  lease view into one exact RentCast query; a deterministic end-to-end mapping check proves every
  supported input and every explicit omission.
- **ARCH-S59-2** — Cache identity contains normalized address, bedrooms, bathrooms, square footage,
  property type, radius, requested count, and any provider/version discriminator that changes the
  result. A deterministic collision check proves changing any shaping field cannot reuse the former
  result.
- **ARCH-S59-3** — Provider response, query basis, comparables, app display, human owner decision, and
  offered rent remain separate typed boundaries; an architecture check fails if a provider number can
  populate an offer without the existing human decision/approval record.
- **ARCH-S59-4** — Quota counts only billable live calls, cache hits cost zero calls, and the approved
  allowance remains 50 unless cost controls are separately changed and read back.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S59-1** — A valid lookup displays the exact two-mile/15-request basis, sent/omitted property
  attributes, returned provider rent/range, ordered comparable evidence, source/retrieval time, cache
  state, and quota state.
- **BEH-S59-2** — The same exact query inside TTL may return a labeled cache hit; changing square
  footage or any other shaping input causes a distinct lookup/cache decision.
- **BEH-S59-3** — Missing key/address, closed or suspended action, exhausted allowance without cache,
  timeout, network/HTTP/parse error, or fewer than three usable comparables yields a distinct
  Needs-Verification result with no usable range.
- **BEH-S59-4** — The app compares the reference range with separately labeled base rent, never total
  recurring charges, and no provider result changes the owner/tenant offer automatically.

**Human litmus outcome.**

### Understand and reproduce a RentCast result

**If this was built correctly:** A renewal operator can see the exact property facts, two-mile radius,
15 requested results, returned evidence, and retrieval/cache state behind the estimate, and can explain
why a different set of inputs could differ from another RentCast view. The estimate is visibly a
reference, not the approved offer.

- Model verdict: PASS - why: 117 focused mapping/resolver/provider/route/quota/UI/persistence and
  renewal-preservation tests pass; TypeScript is green; and one redacted, allowance-capped live AVM
  read returned a usable Likely result with the exact server-derived policy and mapped fields, no
  emitted customer values, and zero writes. The canonical gate passed 526 unit files with one
  intentional skip (4,783 tests passing and four skipped), 115 Firestore tests, every policy/static
  gate, and the 104-page production build. Aggregate CI run `33276113459`, exact zero-traffic
  candidate smoke, configuration readback, promotion, and stable 100% readback are green for revision
  `pmi-kc-app-rmtew9a2z-46a2353b6491` / commit
  `64031f8ee028f09930660060c8f5f627ca5ccde1`.
- Human verdict: PASS | FAIL - why:

**Requirement-to-outcome traceability.**

| Requirement                                                   | Architecture outcome | Behavior outcome         | Human litmus                                                | Deterministic evidence / falsification                                                                                                |
| ------------------------------------------------------------- | -------------------- | ------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Preserve every authoritative query input or name its omission | `ARCH-S59-1`         | `BEH-S59-1`, `BEH-S59-3` | Understand and reproduce a RentCast result                  | A measured raw-export fixture crosses mapper, lease view, request, and display; dropping `unit` or inventing a field fails.           |
| Cache identity equals the complete provider request identity  | `ARCH-S59-2`         | `BEH-S59-2`              | Changed inputs visibly produce a distinct lookup decision   | One-field-at-a-time collision tests cover address, bed/bath, square footage, type, radius, count, and provider/version discriminator. |
| Reference evidence cannot become a rent decision              | `ARCH-S59-3`         | `BEH-S59-4`              | Reference range and approved offer remain visibly different | Type/flow checks and owner-decision tests reject automatic offer population and total-charge substitution.                            |
| Read usage remains bounded and honestly reported              | `ARCH-S59-4`         | `BEH-S59-2`, `BEH-S59-3` | Operator sees cache/quota/refusal truth                     | Quota tests prove cache hits cost zero, billable calls count once, allowance 50 remains fixed, and exhaustion fails closed.           |

**Preservation set.**

Exact-key/runtime refusal, Secret Manager handling, allowance 50, durable metering, cache TTL,
provider response validation, three-comparable floor, provider-order/correlation retention, source
attribution, current-rent conflict refusal, offer separation, and no-write boundaries remain green as
a separate gate.

**Adversarial acceptance checks.**

- **AC-S59-1** — `ARCH-S59-1` starts from the real export sibling shape and fails if `unit` is dropped
  or a browser invents an attribute.
- **AC-S59-2** — `ARCH-S59-2` and `BEH-S59-2` prove square-footage/property/radius/count variants cannot
  collide in cache.
- **AC-S59-3** — `BEH-S59-1` proves the visible query/evidence can account for the exact provider call;
  a range/count-only card is insufficient.
- **AC-S59-4** — `ARCH-S59-3` and `BEH-S59-4` prove provider evidence cannot set offered rent and base
  rent never silently includes recurring charges.
- **AC-S59-5** — `ARCH-S59-4` and `BEH-S59-3` preserve quota/refusal behavior for live and cached paths.

**Forbidden actions / hard gates.**

No secret in Git/logs, unbounded or hidden provider calls, guessed unit/property mapping, invented
freshness claim, app-curated or fabricated comparable, total-charge substitution, provider estimate
as approved offer, allowance increase, provider mutation, or system-of-record write.

**Dependencies / sequencing.**

S59 is independently implementable before desk/process work. S78 consumes the richer projection,
S72 consumes the verified base-rent/reference evidence, S79 consumes screenshot evidence, and S63
proves case-level results. None may weaken S59's reference-only boundary.

**Standalone delivery contract.**

- **Deliverable now:** measured export preservation, exact supported mapping/omission model, complete
  cache key, two-mile/15-request policy, query/evidence UI, base-rent separation, quota/refusal paths,
  and deterministic tests can reach `ALL_GATES_GREEN` without another suite.
- **Consumes, but does not assume:** an exact RentVine property-type source mapping. Because none is
  approved, `propertyType` remains explicitly omitted; no other outcome is blocked.
- **Externally blocked effect:** none. The controlled live parity observation completed with one
  billed read and zero writes, and exact production deployment/readback completed.
- **Produces for downstream suites:** a stable reference-result projection containing query basis,
  omissions, comparables, retrieval/cache/quota provenance, and strict separation from human offer.

**Verification and delivery contract.**

1. Before editing, make the raw-export-to-request and cache-collision checks fail specifically on the
   dropped `unit` sibling and omitted shaping field; record quota/current-rent/approval preservation.
2. Run `npm run test:direct -- tests/unit/rentvine-lease-mapper.test.ts tests/unit/rentcast-market-comp-provider.test.ts tests/unit/rentcast-quota.test.ts tests/unit/lease-renewal-rent.test.ts tests/unit/renewal-desk-component.test.tsx` plus the new cache/projection tests.
3. Run `bash scripts/verify.sh`, inspect the diff, and audit secrets, raw provider/client evidence,
   action/key/allowance changes, query logging, and source-write imports.
4. Report `ALL_GATES_GREEN` only with all mapped outcomes and preservation passing;
   `BUDGET_EXHAUSTED` requires an explicit budget, and `BLOCKED` may name only a live parity
   prerequisite—not an absent optional property mapping or an excuse to guess it.

**Ordered prompt sequence.**

1. Reproduce the dropped-unit and incomplete-cache-key defects with fail-first mapping/cache tests.
2. Freeze quota, provider failure, current-rent, approval, and no-write preservation results.
3. Preserve measured attributes, complete cache identity, and expose query/evidence/refusal truth.
4. Run controlled parity diagnostics only through the allowance-capped read path, then focused and
   canonical tests; ship without any write or cost-control change.

**Deletion/merge recommendation.**

Remove after query truth, approved policy, mapping/cache correction, and operator evidence are
deployed and represented in durable renewal/provider documentation and tests.
