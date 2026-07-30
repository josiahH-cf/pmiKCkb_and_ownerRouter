# Product record retention

The D15 Production decision retains live resident, renewal, maintenance, approval, workflow, and
support product records indefinitely. Admin legal holds are authoritative. A deletion request is
handled manually by Josiah with Dan. This policy adds no deletion scheduler or automatic deletion
path.

The app-owned product collection catalog and record fields are defined in
`lib/operations/product-record-retention.ts` as `product-record-retention:v1.0`. A classified product
record has:

- `product_retention_policy: product-record-retention:v1.0`;
- `product_retention_class: indefinite`; and
- an explicit `legal_hold` value.

A legal hold blocks deletion. A record without a legal hold still requires manual review and never
becomes automatically eligible for deletion.

## Communications boundary

This declaration does not change `communications-retention:v1.0`.
`COMMUNICATIONS_RETENTION_TARGETS` continues to apply class-derived expiry to Gmail confirmation,
dedupe, synchronization audit, workflow-link, and bodyless audit records. A communications legal
hold suppresses deletion without extending normal message usability.

No communications collection may appear in the product collection catalog. No product collection
may enter the communications cleanup plan. When one record represents a workflow-linked
communication, the communications policy governs that record and its expiry. Indefinite product
retention never extends a Gmail-derived row or message body.

## Writer inventory guard

`tests/unit/product-record-retention.test.ts` pins the reviewed writer inventory, including writers
that use an imported collection alias, and scans runtime source for new direct literal references to
the six cataloged collections. It also refuses obvious literal-chain or local-reference writes in a
file classified as read-only. The scan is intentionally a conservative repository sentinel rather
than a claim of complete TypeScript data-flow or AST analysis. A new alias-based writer still
requires normal code review and an explicit inventory entry.
