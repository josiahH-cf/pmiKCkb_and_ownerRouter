# Gmail production activation evidence — 2026-07-13

This artifact records non-secret identifiers and outcomes only. It contains no Gmail body, subject,
recipient list, customer data, token, or credential.

## Owner authorization

On 2026-07-13 the owner explicitly authorized Gmail Inbox 0 read, draft, exact-confirmed send,
exact-confirmed reply, user-label application, Pub/Sub provisioning/watch, deployment, and the merge,
commit, and push needed to make the connection operational. Autonomous/background/model-triggered
send remains prohibited; every send still requires an exact-message review and one-time confirmation.

## Workspace authorization

- Workspace admin identity: a `pmikcmetro.com` administrator (personal Google accounts were not used).
- DWD client ID: `104374162913177846911`.
- Authorized scopes: `gmail.readonly`, `gmail.compose`, `gmail.labels`, and `gmail.modify`.
- Admin Console outcome: the client update succeeded with six total authorized scopes; the two
  non-Gmail scopes already on the client were not changed.

## Application controls

- Every Gmail token subject is the server-verified signed-in `pmikcmetro.com` user.
- New messages support reviewed To/Cc/Bcc recipients; From cannot differ from the signed-in user.
- Replies rebuild recipients and RFC threading headers from the selected live thread.
- Send/reply requires an unexpired one-time confirmation bound to the exact payload hash.
- Concurrent/repeated sends make at most one Gmail call; ambiguous outcomes never auto-retry.
- Label application is a separate `gmail.label.apply` action and accepts bounded user-label names.
- Stored audit/sync state contains identifiers, hashes, counts, timestamps, and statuses only.

## Cloud resources and production proof

- Topic: `projects/pmi-kc-kb-prod/topics/gmail-inbox0-events`.
- Authenticated push subscription: `projects/pmi-kc-kb-prod/subscriptions/gmail-inbox0-push`.
- Push identity: `gmail-pubsub-push@pmi-kc-kb-prod.iam.gserviceaccount.com`; the subscription uses an
  OIDC token whose audience exactly matches the production `/api/gmail-hub/pubsub` endpoint.
- Gmail publisher: `gmail-api-push@system.gserviceaccount.com` has `roles/pubsub.publisher` on that
  topic only. A temporary project-level domain-restriction override was used solely to add this
  documented Google service agent, then deleted; the organization restriction is effective again.
- Firestore rules release: `projects/pmi-kc-kb-prod/rulesets/0de4b567-629e-4eb1-a999-a0cdef4655e2`.
- Action Registry: 22 production entries seeded; the five Gmail Inbox 0 entries are executable.
- Cloud Run: revision `pmi-kc-kb-demo-00020-24d` serves 100% of production traffic.

The live proof used only a synthetic self-addressed thread:

- New message `19f5d2443d7d0cc9` created thread `19f5d2443d7d0cc9` with state `sent`.
- Explicit reply `19f5d24fac2d050c` has state `sent` in the same thread.
- User label `PMI KC/Connection Proof` was created/resolved and applied to that thread.
- Mailbox state is `watching`; the watch expires at `2026-07-20T20:44:31.514Z` and the stored history
  cursor advanced to `37871`.
- Revision `00020-24d` returned five authenticated Pub/Sub `200` responses and Firestore recorded five
  completed `history` sync audits. No Gmail content was logged or committed.

Production falsification found two real wrapper differences before the successful proof: Pub/Sub sends
documented alias/metadata fields, and Gmail encoded `historyId` as a JSON integer. The boundary now
accepts forward-compatible outer Pub/Sub metadata after OIDC verification and quotes only the bounded
numeric history field before parsing so a future 64-bit cursor cannot lose precision. The inner Gmail
notification object remains strict.

## Rollback

Set the five Gmail Inbox 0 Action Registry entries false and redeploy; stop the mailbox watch; delete
the push subscription/topic and dedicated push service account; remove `gmail.modify`, `gmail.labels`,
`gmail.compose`, and/or `gmail.readonly` from the DWD client as appropriate. Delivered email cannot be
retracted, which is why ambiguous outcomes are reconciled by RFC Message-ID and never retried.
