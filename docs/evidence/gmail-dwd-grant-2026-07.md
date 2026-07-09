# Gmail domain-wide-delegation grant — renewal-notice draft (2026-07-09)

Committed evidence for flipping the Action Registry entry
`gmail.renewal_notice.draft_create` to `production_allowed: true`
(readiness "Approved for Execution", evidence_status "Documented"). This is the
Section-3 record-the-approval artifact required before the runtime gate opens.

## What was authorized

- **Capability:** create an UNSENT Gmail draft (`users.drafts.create`) in the
  signed-in `pmikcmetro.com` user's mailbox, via keyless domain-wide delegation. The
  code has **no send scope and no send method** — the ceiling is an unsent draft a
  human opens in Gmail and clicks Send. `gmail.send` is absent from the grant and the
  code (enforced by the router-boundary gate + the Gmail runtime client tests).
- **Scope granted (least privilege):** `https://www.googleapis.com/auth/gmail.compose`
  only. The two Gmail Inbox 0 entries (`gmail.label.apply`, `gmail.draft.create`) have
  no runtime yet and remain `Planned` / `production_allowed: false`; their scopes
  (`gmail.labels`, read) are **not** granted.

## Grant facts

| Field                                 | Value                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------- |
| Service account                       | `lease-renewal-reader@pmi-kc-kb-prod.iam.gserviceaccount.com`                         |
| SA OAuth2 client id                   | `104374162913177846911`                                                               |
| Impersonation subject                 | the signed-in `pmikcmetro.com` user (per-user; verified with `josiah@pmikcmetro.com`) |
| Authorized scope                      | `https://www.googleapis.com/auth/gmail.compose`                                       |
| `gmail.send` present?                 | **No**                                                                                |
| Gmail API enabled on `pmi-kc-kb-prod` | Yes (enabled 2026-07-09)                                                              |
| Token Creator on the SA               | `pmi-kc-kb-runtime@pmi-kc-kb-prod.iam.gserviceaccount.com` (prod runtime) + owner ADC |
| Date                                  | 2026-07-09                                                                            |

## How it was proven (live smoke)

`npm run smoke:gmail-draft-live -- --live` (owner-run; the agent shell cannot refresh
org RAPT reauth) minted a keyless DWD token AS the subject with `gmail.compose`,
created an UNSENT test draft, and deleted it:

```
Gmail draft smoke (LIVE): created UNSENT draft r-5809471014674430724 in josiah@pmikcmetro.com's mailbox. Nothing was sent.
Cleaned up: deleted the test draft (HTTP 204).
PASS: the Gmail DWD grant works for gmail.compose.
```

This proves the DWD authorization end-to-end (signJwt → jwt-bearer exchange →
`drafts.create` → `drafts.delete`) with no send at any step.

## Rollback

The gate is the committed seed (`isActionExecutable` reads `ACTION_REGISTRY_SEED`, not
Firestore). To re-gate: set `gmail.renewal_notice.draft_create` back to
`production_allowed: false` / readiness "Planned" and redeploy. Any created draft is
unsent and can be deleted from Gmail Drafts; nothing was ever sent.
