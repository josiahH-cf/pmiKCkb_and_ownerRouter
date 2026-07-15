# V1 application and provider activation checklist

Updated: 2026-07-15. Status: **recommendation-first working-app checklist**.

This checklist separates two questions that were previously mixed together:

1. **Does V1 work as a production application?** It does when the deployed Live and isolated Test
   lanes, core tabs, Maintenance, Vendor identity, Firestore writes, confirmations, receipts, and
   rollback work.
2. **Which external providers are active today?** Each provider/action has its own activation state.
   An inactive future provider is shown as unavailable and does not make the application unready.

No R01–R09 product choice needs to be asked again. Never paste credentials, customer records, Gmail
bodies, setup links, passwords, TOTP secrets, OAuth codes, or refresh tokens into git.

## Production Test default

Use these reserved invented records whenever customer/provider input is unavailable:

| Type         | Canonical Test value                                          |
| ------------ | ------------------------------------------------------------- |
| Unit         | `unit:test-maple-204` — `TEST — 204 Maple Court Unit 2`       |
| Vendor       | `vendor:test-summit-plumbing` — `Summit Plumbing Test Vendor` |
| Vendor email | `service@summit-plumbing.example.invalid` (non-routable)      |

Test journeys write to production Firestore and may reach Done. They always stay visibly Test, use
only the app's isolated Test executor, contact no provider, and record
`live_proof_eligible=false`. They prove the application workflow, not a Live provider.

## Application V1 unblocks

| Constraint                         | Simple process?             | What is actually needed                                                   | Recommended action                                                                                 | V1 impact                                     |
| ---------------------------------- | --------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Fresh Google session               | Yes; interactive when stale | Managed `pmikcmetro.com` gcloud/ADC session                               | Run `npm run preflight:adc`; if stale, the owner runs `npm run auth:session` in their own terminal | Blocks only the cloud command requiring auth  |
| Firebase authorized domain         | Complete 2026-07-15         | Canonical Cloud Run host is on the production Auth allowlist              | Recheck after a hostname change; no current mutation needed                                        | Cleared                                       |
| Firebase Email/Password            | Complete 2026-07-15         | Enabled with password required for the Admin-provisioned Vendor flow      | Keep app self-registration absent; recheck in deployed Vendor acceptance                           | Cleared                                       |
| Identity Platform TOTP             | Complete 2026-07-15         | Project-level TOTP enabled with adjacent interval `1`                     | Enroll/challenge the canonical Test Vendor after deployment                                        | Project config cleared; browser proof remains |
| Firestore rules and app deployment | Complete 2026-07-15         | Final reviewed revision and pinned rules serve production                 | Re-run only for a subsequent reviewed change                                                       | Cleared                                       |
| Production Test data               | Yes, in app                 | Seed canonical Maintenance ticket and Test Vendor; complete both journeys | Use Admin Test workspace and Maintenance controls; verify zero provider calls                      | Required working-app acceptance               |
| Test Vendor authentication reset   | Yes, in app                 | Deployed; run the human disable/reset/re-enroll proof                     | Admin reason + exact preview; rotate UID, preserve Test workflow data, retain no secret evidence   | Only human lifecycle acceptance remains       |
| Rollback                           | Complete 2026-07-15         | Exact predecessor received 100% traffic and final revision was restored   | Repeat after a future deployment                                                                   | Cleared                                       |
| TTL/index/scheduler                | No hard requirement         | Legal holds and bounded cleanup must work; native automation is optional  | Launch with manual cleanup limit `500`; add indexes only for actual query needs                    | Not a V1 blocker                              |
| Three Moderate dev-only audit rows | Already disposed            | Keep outside runtime and recheck by 2026-08-15                            | Follow `docs/v1-dependency-disposition-2026-07-14.md`                                              | Not a V1 blocker                              |

### Firebase and deploy commands

From the repository root:

```bash
npm run preflight:adc
npm run firebase:setup-auth -- --project=pmi-kc-kb-prod --authorized-domain=pmi-kc-kb-demo-kq6wuvpiva-uc.a.run.app
npm exec firebase -- deploy --only firestore:rules --project pmi-kc-kb-prod
npm run preflight:production -- --env-file=.env.production.local
```

Deploy `firestore:indexes` separately only when a selected production query demonstrably requires a
declared composite index; the working-app launch does not create unused indexes as ceremony.

The repository Auth helper initializes Identity Platform, enables the existing Google provider, and
adds the authorized domain. On 2026-07-15 the owner also enabled Email/Password with password required
through a narrow field-masked project update. Do not add app self-registration; Vendor users remain
Admin-provisioned.

TOTP was enabled on 2026-07-15 with the official Identity Platform project-config endpoint. The safe
launch default accepts one adjacent 30-second interval; retain this command as the recovery/audit
shape rather than rerunning it without first inspecting current MFA providers:

```bash
PROJECT_ID=pmi-kc-kb-prod
ACCESS_TOKEN="$(gcloud auth print-access-token)"
curl -X PATCH \
  "https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/config?updateMask=mfa" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -H "X-Goog-User-Project: ${PROJECT_ID}" \
  -d '{"mfa":{"state":"ENABLED","providerConfigs":[{"state":"ENABLED","totpProviderConfig":{"adjacentIntervals":1}}]}}'
```

Reference: [Firebase TOTP MFA](https://firebase.google.com/docs/auth/web/totp-mfa). This changes only
the permitted second factor; the application still enforces which users must enroll it. Always GET
the project config afterward and verify both top-level `mfa.state: ENABLED` and the TOTP provider
`state: ENABLED`; checking the provider alone previously concealed a disabled global MFA switch.

For deployment, first capture the serving revision, then run the reviewed deployment command:

```bash
gcloud run services describe pmi-kc-kb-demo --region=us-central1 \
  --project=pmi-kc-kb-prod --format="value(status.traffic[0].revisionName)"
npm run deploy -- --project=pmi-kc-kb-prod --service=pmi-kc-kb-demo \
  --region=us-central1 --search-location=us --budget-confirmed \
  --allow-multiple-spaces \
  --service-account=pmi-kc-kb-runtime@pmi-kc-kb-prod.iam.gserviceaccount.com
```

The deploy wrapper uses `--no-invoker-iam-check` for the public sign-in shell and, only after a
successful revision creation, routes 100% traffic to the exact revision created by that invocation
with `gcloud run services update-traffic ... --to-revisions=<revision>=100 --quiet`.
That second step clears a named-revision traffic pin left by rollback without adding an `allUsers`
binding or changing application authentication.

## Vendor V1 process

### Test Vendor — part of application V1

1. Admin opens the Test Vendor panel and previews provisioning
   `vendor:test-summit-plumbing` with a plain-English reason.
2. Admin exact-confirms. Firebase creates the preverified non-routable Test identity and returns the
   password-setup link once; the link is never stored, logged, or emailed.
3. The operator opens the link, sets a password, signs in, and enrolls TOTP.
4. Admin assigns the canonical Test Maintenance ticket. The Vendor sees only that ticket and its
   app-only Test mailbox.
5. Exact-confirm a Test mailbox reply, verify a Firestore receipt and zero provider calls, then
   deassign/disable and confirm the session loses access.
6. From the disabled state, Admin supplies a reason and exact-confirms the current UID/status/invite-
   version reset preview. Record only that the Firebase UID rotated and that the stable Vendor id,
   Test tickets, assignments, mailbox history, and completed receipts remained.
7. Confirm the old password, TOTP factors, session, action links, and UID-bound confirmations no
   longer authorize access. Use the new response-only setup link, set a fresh password, enroll a new
   TOTP factor, sign out, and complete a fresh password+TOTP sign-in.
8. Confirm the replacement sees only its preserved assigned Test ticket and app-only mailbox; it
   cannot construct OAuth/Gmail/provider clients or appear in the internal People and Access roster.

This flow needs Email/Password and TOTP project config, but needs no invitation provider, routable
mailbox, OAuth client, or token vault. Reset works only for the canonical `.invalid` Test Vendor from
`pending_setup`, `active`, or `disabled`; a partial failure remains disabled and fail-closed.

### Live Vendor — activate only when a real Vendor needs external mail

| Constraint            | Simple process?        | Specific unblock                                                                                                           |
| --------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Routable Vendor login | Yes, operational input | Admin enters the Vendor's real mailbox and assigned ticket; Vendor completes password setup, email verification, and TOTP  |
| Invitation delivery   | Yes                    | Deliver the one-time setup link through an approved one-time channel; never store it                                       |
| OAuth consent/client  | Usually                | Create Google Web OAuth client, register the exact callback, request only the four documented Gmail scopes                 |
| Token vault           | Yes                    | Store refresh material in Secret Manager keyed by Vendor; Firestore receives reference/health only                         |
| First proof           | Yes                    | Connect the same address, read only the assigned thread, exact-confirm one permitted action, then revoke and verify denial |

Live Vendor OAuth is a **provider activation**, not a prerequisite for the Test Vendor V1 workflow.
Admin never consents on the Vendor's behalf, and Vendor OAuth never uses DWD or an internal PMI KC
role.

## Live provider activation inventory

Each row can be completed independently. A missing contract/credential/mapping closes only the named
Live actions; the Test workflow remains usable. Live writes always show exact target, values,
confirmation, receipt/readback, and correction behavior before enablement.

| Provider / action keys                                                                        | Genuine remaining input                                                                           | Recommended default now                                                                                            | Activation proof                                                                                  |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Trusted publication — `app.content.publish`                                                   | Approved connector/root/Space IDs, type/size/sensitivity policy, scanner health                   | Existing sources remain usable; keep new publication unavailable until a scanner/root exists                       | One harmless approved file; negative root/type/size/scanner cases; pointer rollback               |
| Console Live reads                                                                            | RentVine/workflow mappings and scoped credentials                                                 | Show Live as unavailable when not configured and keep Test panel available                                         | One bounded read plus outage/staleness UI; no fixture-as-Live fallback                            |
| Gmail renewal/maintenance — draft/send/reply/label action keys                                | Authoritative recipient/source mapping and approved artifact for the exact workflow               | Existing proven linked reply/labels stay enabled only within their current scope; new initiation stays unavailable | Self-safe linked proof, exact provider-fetched payload/readback, correction reply or draft delete |
| Google Sheets — `google_sheets.renewal_checklist.writeback`                                   | Exact Sheet/tab/row key/column and atomic conflict strategy                                       | Keep Live writeback unavailable; use Test receipt in app                                                           | Invented row in an approved test sheet, concurrent-change refusal, exact readback/correction      |
| Dotloop — `dotloop.loop.create_from_template`, `dotloop.document.upload`                      | Account API/OAuth, profile/template/participant/document mapping                                  | Keep unavailable; no UI/RPA inference                                                                              | Synthetic loop/document, idempotency reconcile, archive/supersede correction                      |
| RentVine renewal — `rentvine.lease.renewal_writeback`, `rentvine.renewal.portal_message.send` | Documented account endpoints/permissions, version/expected-state semantics, portal-thread mapping | Keep these writes unavailable while existing reads remain usable                                                   | Concurrent-drift refusal, exact readback, provider-supported correction                           |
| SMS — `sms.renewal_message.send`                                                              | PMI KC provider/account, sender, consent/opt-out source, delivery receipt                         | Keep unavailable; do not select or purchase a provider by inference                                                | Provider-approved test number and consent-bound exact message                                     |
| Boom — `boom.resident.enroll`                                                                 | Account API/plan, resident mapping, applicability rule                                            | Default to explicit `not_applicable` when rule says so                                                             | Applicable and not-applicable tests; documented de-enrollment                                     |
| Maintenance Drive — `google_drive.maintenance_photo.store`                                    | In-boundary folder, ticket mapping, runtime permission, MIME/size/scanner policy                  | Test stores only app-owned metadata; Live upload unavailable until configured                                      | Harmless image; wrong ticket/path/MIME/size/scanner refusal; additive correction                  |
| RentVine work orders — create/assign/update action keys                                       | Account write endpoints, property/unit/Vendor mappings, exact statuses and conflict token         | Complete Maintenance in Test mode; leave dependent Live actions unavailable                                        | Create→assign→close in provider test context, drift refusal, readback/reconcile                   |
| LeadSimple — `leadsimple.process.update_stage`, `leadsimple.task.create`                      | Account endpoint/plan, process/stage/assignee mapping, conditional update                         | Complete Test action receipts; Live unavailable                                                                    | Concurrent stage drift refusal, readback/idempotency, corrective stage/task action                |
| QuickBooks — `quickbooks.bill.create_draft`                                                   | OAuth/company/Vendor/account/property mapping and draft-only permission                           | Test draft receipt only; no Live post/pay path                                                                     | One draft Bill remains Draft; documented void/delete correction                                   |

## What is genuinely blocked versus already decided

Genuine external constraints are limited to:

- an interactive managed-domain reauthentication when Google requires it;
- a human Firebase/Identity configuration change if Email/Password or TOTP is off;
- real provider credentials, account-specific API contracts, or authoritative field mappings that the
  repository cannot invent; and
- a real Vendor's routable mailbox and consent for that Vendor's Live OAuth activation.

They do not block production Test Maintenance/Vendor workflows or the app-level V1 claim. Additional
client source content, operator roster refinements, provider expansions, TTL, scheduling, and
composite-index optimization can proceed after launch.

No process should try to unblock generic inbox browsing, free-form compose/send, autonomous/
scheduled/bulk/model-triggered sends, guessed provider endpoints, QuickBooks post/pay, or destructive
photo replacement/deletion. Those are intentional product boundaries.
