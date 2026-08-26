# Gmail production action evidence — current boundary

Reconciled: 2026-08-26.

This bodyless artifact supports the current workflow Gmail actions. Production uses a managed
domain-wide-delegation identity and server-verified `pmikcmetro.com` mailbox subject. No personal
account or downloaded key file participates.

Current production-allowed Gmail keys:

- `gmail.mailbox.read`
- `gmail.thread.reply`
- `gmail.label.apply`
- `gmail.renewal_notice.draft_create`
- `gmail.maintenance_owner_notice.draft_create`

Read, reply, label, and draft execution remains workflow-linked, actor-authorized, exact-targeted,
idempotent where applicable, and bodylessly receipted. Renewal and maintenance initiation ends at an
unsent draft. Generic/direct notice-send keys are closed under the permanent D33 boundary; no
autonomous, scheduled, bulk, or model-triggered client-facing send is allowed.

Current code evidence is `lib/gmail-runtime/`, `lib/gmail-inbox-zero/`,
`lib/integrations/action-registry-seed.ts`, and their unit/Firestore tests. This artifact contains no
Gmail body, subject, recipient, token, credential, or customer value.
