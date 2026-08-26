# Gmail DWD evidence — current boundary

Reconciled: 2026-08-26.

This bodyless artifact supports the production action
`gmail.renewal_notice.draft_create`. The managed domain-wide-delegation path can create an **unsent**
renewal notice draft in the server-verified `pmikcmetro.com` user's mailbox. A person reviews and
sends it from Gmail.

Current boundaries:

- the action key is production-allowed;
- the runtime uses keyless managed-domain delegation and no service-account key file;
- the draft target, recipients, content, actor, source, and confirmation are exact-bound;
- sample/test content cannot create a real draft;
- `gmail.renewal_notice.send`, `gmail.maintenance_owner_notice.send`, and
  `gmail.message.send` are closed; and
- no DWD scope or credential is authority for a direct or autonomous send.

Current code evidence is `lib/gmail-runtime/client.ts`,
`lib/integrations/action-registry-seed.ts`, and the Gmail draft/runtime tests. This file records no
message body, subject, recipient, token, credential, customer value, or mailbox content.
