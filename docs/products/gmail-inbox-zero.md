# Workflow Communications product lane

The filename is retained for compatibility. This is a workflow communication adapter, not a general
Gmail inbox.

## Current capability

- Authenticated workflow-linked mailbox reads.
- Exact thread replies.
- Governed label application.
- Renewal and maintenance owner unsent-draft creation.
- Pub/Sub/watch infrastructure and in-app attention.
- Bodyless audit/receipt evidence.
- Exact mailbox, thread, recipient, source, and content confirmation.

## Boundaries

- No free-form general inbox browsing.
- No generic compose or blast send.
- No autonomous client-facing send.
- Renewal and maintenance initiation ends at an unsent draft.
- A human sends from Gmail.
- Generic/direct notice-send action keys remain closed.
- Sample/test content cannot create a real draft.
