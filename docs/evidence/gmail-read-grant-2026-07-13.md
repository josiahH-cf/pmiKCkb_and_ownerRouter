# Gmail self-mailbox read evidence — 2026-07-13

## Decision and boundary

On 2026-07-13 the owner asked to commit and merge S19 and ensure the Gmail connection worked as
intended. This authorizes the bounded read connection for the self-only pilot
`josiah@pmikcmetro.com`; it does not authorize send, reply, watch/Pub/Sub provisioning, deployment,
or a third-party mailbox.

The action is `gmail.mailbox.read`. Its only delegated scope is
`https://www.googleapis.com/auth/gmail.readonly` on DWD client `104374162913177846911`. The local
pilot allowlist contains only the self mailbox and is gitignored. The keyless runtime may fall back
to the already configured Sheets impersonation service-account identifier; no key file or token is
stored.

## Read-only proof

After `npm run preflight:adc` passed, one `users.getProfile` request ran through the production DWD
token path. The response email matched the self pilot, returned aggregate message/thread counts, and
included a history cursor. No thread list, message metadata/body, recipient, attachment, draft,
send, reply, label, watch, Firestore, or deployment action ran. Only the boolean identity match,
aggregate counts, and cursor-presence boolean were printed; no token or customer email content was
recorded.

The proof also found and fixed a fail-open setup defect: a missing `GMAIL_PILOT_USERS` value could
previously admit any otherwise valid domain subject. Gmail Hub now requires a non-empty, valid
`pmikcmetro.com` pilot list and returns a setup-unavailable error before token mint or Gmail work when
it is absent. The separate Lease Renewal Agent unsent-draft action keeps its existing behavior.

## Promotion and rollback

`gmail.mailbox.read` may be `production_allowed:true` with readiness `Approved for Execution` and
documented evidence. Send/reply/label/draft Inbox 0 actions remain false. Deployment is still a
separate owner gate.

Rollback: set `gmail.mailbox.read` false, remove the pilot value, remove `gmail.readonly` from the DWD
client if access itself is being revoked, and redeploy the prior revision. No mailbox mutation needs
reversal because this action is read-only.
