# S66-A artifact, field, and participant gap ledger — 2026-08-10

## Decision

The repository does not contain an approved lease-document artifact or the metadata needed to bind
one safely. S66 can build the deterministic packet-truth model and stop at exact content seams, but
no tenant packet or owner acknowledgment can be represented as ready until the artifacts and maps
below are supplied through trusted publication.

This is structural evidence only. No legal body, customer value, participant identity, provider
payload, or document content was inspected or copied into git.

## Evidence inspected

- Tracked binary/document inventory: the only tracked PDF is the application brand pack; there is no
  tracked lease, extension, addendum, disclosure, animal agreement, HOA form, or owner acknowledgment.
- `lib/publication/types.ts`: S21 versions prove content hash, source, connector, path, MIME type,
  version, and active version, but carry no lease form family, applicability rule, artifact field id,
  signer role, signature location, or audience visibility map.
- `lib/firestore/types.ts` and `lib/firestore/approved-templates.ts`: the approved template store is a
  communications body/audience/channel record, not a legal-form catalog.
- `lib/lease-renewal/execution/providers.ts`: the Dotloop executor accepts a caller-provided template
  ref, participant refs, document ref/type, and content hash; it does not establish their legal or
  participant truth.
- `lib/lease-renewal/live-desk.ts`: the live workspace intentionally evaluates current build-out
  readiness from an empty input because the live read maps none of those legal/build-out facts.
- `lib/lease-renewal/recipient-resolution.ts`: RentVine supplies ordered tenant and owner email
  recipients, but not artifact-defined signer roles or signature locations.

## Required artifact catalog map

| Artifact family             | Packet contexts                          | Audience   | Proven metadata                                                               | Exact blocker                                                                                                                                                                                                                                     |
| --------------------------- | ---------------------------------------- | ---------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Standard lease              | `full_lease_packet`                      | Tenant     | None                                                                          | `APPROVED_ARTIFACT_UNAVAILABLE:standard_lease`; supply approved content plus artifact id, immutable version/hash, form family, effective dates, jurisdiction/applicability, field ids, signer roles, signature locations, and publication source. |
| Renewal extension           | `renewal_extension`                      | Tenant     | None                                                                          | `APPROVED_ARTIFACT_UNAVAILABLE:renewal_extension`; supply the same exact catalog metadata and the compatible executed-lease form families.                                                                                                        |
| Animal agreement            | Conditional in either tenant context     | Tenant     | Rule intent only; no artifact/map                                             | `APPROVED_ARTIFACT_UNAVAILABLE:animal_agreement`; supply per-animal field and signer mapping plus the approved applicability/policy version.                                                                                                      |
| Lead-based-paint disclosure | Conditional in either tenant context     | Tenant     | Current readiness rule uses the pre-1978 boundary; no artifact/map            | `APPROVED_ARTIFACT_UNAVAILABLE:lead_based_paint_disclosure`; supply approved artifact and exact rule/jurisdiction/version mapping.                                                                                                                |
| City addendum               | Conditional in either tenant context     | Tenant     | Current readiness mentions Independence/Kansas City; no approved city catalog | `APPROVED_ARTIFACT_UNAVAILABLE:city_addendum`; supply one approved artifact/version and rule map per jurisdiction.                                                                                                                                |
| HOA artifact                | Conditional in either tenant context     | Tenant     | None                                                                          | `APPROVED_ARTIFACT_UNAVAILABLE:hoa`; supply approved content and an authoritative HOA applicability source/map.                                                                                                                                   |
| Owner acknowledgment        | Separate after complete tenant execution | Owner only | Owner fan-out exists; no artifact/map                                         | `APPROVED_ARTIFACT_UNAVAILABLE:owner_acknowledgment`; supply exact owner-only content, field ids, owner signer roles/signatures, and publication metadata.                                                                                        |

Every row is unavailable rather than Draft, Active, or Not applicable. No placeholder legal copy is
permitted. A later S21 publication can satisfy one row without silently satisfying another.

## Required field/source/binding map

| Fact group                                                   | Current permitted source evidence                                         | Artifact consumption state                                                  | Exact blocker                                                                                                    |
| ------------------------------------------------------------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Property, unit, lease, portfolio ids                         | Documented RentVine live read                                             | Source can be modeled; artifact field ids are unknown                       | `ARTIFACT_FIELD_MAP_UNAVAILABLE` for each consuming artifact.                                                    |
| Transaction/snapshot identity                                | App-owned deterministic identity                                          | Source can be modeled; artifact field ids are unknown                       | `ARTIFACT_FIELD_MAP_UNAVAILABLE`.                                                                                |
| Tenant and owner names/emails/order                          | Party-scoped RentVine participant arrays; S61 ordered fan-out             | Audience set can be modeled; legal signer role/signature fields are unknown | `PARTICIPANT_ROLE_MAP_UNAVAILABLE`.                                                                              |
| Lease start/end, active tenancy, current base rent           | RentVine only where the documented mapper returns the field               | Source can be modeled; target form fields are unknown                       | `ARTIFACT_FIELD_MAP_UNAVAILABLE`.                                                                                |
| Approved offered rent                                        | App-owned recorded owner decision, preserving S29/S62 approval boundaries | Source can be modeled; target form fields are unknown                       | `ARTIFACT_FIELD_MAP_UNAVAILABLE`; never use an unapproved suggestion.                                            |
| Renewal term and proration                                   | No complete current authoritative packet source/map                       | Not consumed                                                                | `DOCUMENT_FACT_UNAVAILABLE:renewal_term` / `DOCUMENT_FACT_UNAVAILABLE:proration`.                                |
| Deposit amount/type and cash-held wording                    | Current readiness has a type check, but live workspace supplies no value  | Not consumed                                                                | `DOCUMENT_FACT_UNAVAILABLE:deposit`; replacement policy never defaults to cash.                                  |
| Landlord legal name/LLC suffix                               | Current readiness has a check, but live workspace supplies no value       | Not consumed                                                                | `DOCUMENT_FACT_UNAVAILABLE:landlord_legal_name`.                                                                 |
| Utilities, lawn care, appliances/non-real property           | No mapped current source                                                  | Not consumed                                                                | One `DOCUMENT_FACT_UNAVAILABLE:<field>` blocker per artifact-required field.                                     |
| Building year, city/jurisdiction, HOA                        | Rule concepts exist; live workspace supplies none                         | Conditional decision remains `Unknown`                                      | `DOCUMENT_FACT_UNAVAILABLE:year_built`, `:jurisdiction`, or `:hoa_applicability`; unknown is never exclusion.    |
| RBP/insurance applicability, coverage, approved charge cents | No complete source/policy-to-artifact map                                 | Not consumed                                                                | `POLICY_FACT_UNAVAILABLE:<field>`; no hard-coded or inferred charge.                                             |
| Animals, per-animal facts, verified non-pet treatment        | No per-animal packet source/map                                           | Not consumed                                                                | `DOCUMENT_FACT_UNAVAILABLE:animal:<field>` per stable animal identity; never infer accommodation/service status. |
| Existing executed lease form family/compatibility            | No mapped provider field or approved classification source                | Packet classifier blocks                                                    | `CLASSIFICATION_FACT_UNAVAILABLE:executed_lease_form_family`.                                                    |

## Participant and audience map

| Participant set                 | Proven source                                               | Permitted modeled role             | Missing binding                                                                                           |
| ------------------------------- | ----------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------- |
| All tenants on the active lease | Ordered RentVine tenant objects                             | `tenant`, tenant-visible only      | Exact artifact signer role, signature fields/locations, minor-vs-adult rule, and required-signature rule. |
| All owners of record            | Ordered RentVine portfolio/property owner objects under S61 | `owner`, owner-only acknowledgment | Exact artifact signer role and signature fields/locations.                                                |
| Landlord/manager entity         | Not mapped for S66                                          | None                               | Approved legal entity source and artifact field/signature mapping.                                        |
| Other guarantor/co-signer role  | Not mapped for S66                                          | None                               | Approved participant source, role semantics, and artifact mapping.                                        |

The tenant and owner sets must never be merged. The owner acknowledgment remains unavailable until a
future authenticated Dotloop readback proves complete execution of the exact tenant-packet hash.

## Spike disposition

Hypothesis C is observed: required legal artifacts, classifications, signer rules, and field maps are
absent. Product implementation may create the pure evaluator, unavailable catalog state, snapshots,
provenance, blockers, and audience controls. It must not create a ready packet from this ledger. The
external-content owner must supply each named artifact and map through S21; S34 remains the separate
Dotloop connection/execution dependency.
