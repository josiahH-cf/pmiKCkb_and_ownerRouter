# Open blockers

One row per material blocker, with a stable id a later loop can cite. A blocker is material only when
it prevents the next correct step. Warnings, optional improvements, and later roadmap work do not
belong here.

Read this after `docs/loop-state.md`. Loop state says where the work is; this file says what is
holding it and who owns each hold. When a blocker clears, move its outcome into `docs/facts.md` and
delete the row here rather than leaving a stale entry.

Last reconciled: 2026-09-07.

## How to use this file

- **Owner: agent** means a future loop can clear it without asking. Do that before reporting blocked.
- **Owner: owner** means a person must decide, approve, sign in, or supply data the repository cannot
  derive. Never convert one of these into a human verification step for work the agent can prove
  itself; state it, finish everything independent of it, and continue.
- **Owner: external** means a third party controls the timeline.
- Completion evidence is the exact readback that closes the row. A row is not closed by an intention.

## Open

| Id      | Blocks                                      | Owner    | Exact hold                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Completion evidence                                                                                                                                                |
| ------- | ------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B-AUTH2 | Candidate promotion                         | owner    | S112 one-time setup: the `Automation` OU (reauthentication never required, web sessions never expire), the `pmi-runner@pmikcmetro.com` principal, the `pmi-kc-automation` service account with its grants, and the two canary accounts; then enroll both credential stores (`npm run auth:enroll`, `npm run auth:enroll:wsl`) and both canary profiles on both origins (`npm run auth:enroll-canary`). Fast path for the current candidate: enroll two managed profiles today with `auth:enroll-canary` (one Admin, one claim-less account, which the app resolves to Editor). | `npm run auth:ensure -- --unattended` exits 0 on the WSL store and `--need=canary` reports both profiles `signed_in` on both origins; then the receipt run passes. |
| B-DL1   | S106 live readiness, S34 live loop creation | external | SENT 2026-09-04 to support@dotloop.com, awaiting reply. Dotloop issues credentials by approved request only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | An approved client id and client secret exist for this application.                                                                                                |
| B-DL2   | S106 live readiness, S34 live loop creation | owner    | No managed Dotloop account is connected, and none carries the office profile and renewal loop template.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Readiness reports `connected` after a profile probe, naming no missing resource.                                                                                   |
| B-DL3   | S34 document upload                         | owner    | WEDNESDAY: ask the team where the approved blank lease forms live. The S66 artifact catalog is empty.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | The seven required artifact families resolve to approved content.                                                                                                  |
| B-MNT1  | S108 preapproval routing proof              | owner    | WEDNESDAY: ask the client which properties are preapproved and for how much, and identify them exactly.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | At least one property preapproval reads back with its amount and effective date.                                                                                   |
| B-S100  | S100 resident draft, and S36 behind it      | owner    | WEDNESDAY: identify one work order carrying resident chat whose resident email is verified.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | One eligible message exists and the draft key's proof runs against it.                                                                                             |

## Detail

### B-AUTH2 — the S112 one-time setup and enrolled canary profiles

The 2026-09-04 diagnosis (`no account carries the Editor role, so the Editor canary has no subject`)
was wrong in two ways, both corrected on 2026-09-06 and recorded in `docs/facts.md`
(`F-ASSURANCE-CANARY`):

- The Editor canary could never pass. It required a denied route to rest on
  `/sign-in?error=forbidden`, but the sign-in page forwards any signed-in person to `/`, so a real
  Editor always failed with `auth_mismatch`. The canary now proves the denial from the navigation
  chain (the exact same-origin forbidden hop) and refuses when the denied document rendered.
- A managed account with no role claim is not access-less. `lib/auth/session.ts` resolves it to
  `Editor` with every Space, and the Admin page copy says every teammate starts as an Editor. The
  three claim-less managed accounts read back on 2026-09-04 are therefore Editors at the application
  layer, and any of them is a valid canary subject. Whether that default is right is an owner
  question recorded under Open Questions in `docs/facts.md`; the runner does not change a protected
  auth path for it.

What still holds promotion is the one-time S112 setup (`docs/feature-suites/unattended-authentication.md`,
Appendix B): the owner creates the automation principal, the service account, and the two canary
accounts in an organizational unit whose sessions never expire, then enrolls each credential store
once and each canary profile once per origin. The receipt run drives the predecessor baseline
against the canonical origin before the candidate canaries, and the session cookie is host-only, so
each profile is enrolled on both origins; after that, `npm run auth:ensure -- --need=canary`
re-establishes the sessions with no person present.

Enrollment is headed and owner-completed: `npm run auth:enroll-canary -- --profile=<WSL-native
absolute path outside the repository> --origin=<origin> --email=<canary>` opens the harness browser
(the installed Playwright Chromium in WSL, or Google Chrome for Linux once installed) on the app's
sign-in page; the owner completes Google; the script only selects the account tile, verifies the
app session and role, and closes. No claim is written, no identity is minted or elevated, and no
Admin is demoted. Copied cookies, guessed or default profile directories, and any password or
one-time code typed by the runner are not evidence. The previous recipe (Windows Chrome launched
from WSL with a `/mnt/c` profile path) never ran and is retired; the browser and the profile path
form must match, which `scripts/auth/browser.ts` enforces.

Everything else the receipt run needs is in hand: the live flag, the candidate origin
`https://cand-rmtq71kjl-bff41bbdb5fa---pmi-kc-app-kq6wuvpiva-uc.a.run.app`, the expected commit `7b3fdad`, the
expected revision `pmi-kc-app-rmtq71kjl-bff41bbdb5fa`, the recaptured configuration fingerprint
`sha256:dc697873b3b384e13a631e4742bae66358f71d6f09bca564dbfd84351de1bcda`, an internal operator
address, a fresh receipt path, and the existing predecessor revision.
Sign in against the origin of the candidate that will actually be
promoted: each candidate gets its own hostname and its own authorized-domain entry, so a profile
authenticated against a superseded candidate is wasted work.

### B-DL1 and B-DL2 — Dotloop credentials and a connected account

The owner sent the access request to `support@dotloop.com` on 2026-09-04 and is awaiting a reply.
Dotloop's published API guide directs developers to request access rather than self-register, so the
credential depends on a third party's approval turnaround. Do not re-send or chase a second channel
without owner direction. Task `V-DL` below runs the moment credentials arrive. The application's side is complete
and proven against the provider fake: connection, refresh, revoke, reconnect, readiness, and one loop
per approved packet hash.

The delivery path for the credential is now wired end to end. `scripts/deploy-demo-cloud-run.mjs`
forwards the non-secret client id and redirect URI and binds the client secret from Secret Manager
when `DOTLOOP_OAUTH_CLIENT_SECRET_SECRET_ID` is set; a plaintext client secret is never promoted into
a deployed revision. Before this was fixed, an owner could have completed every Dotloop step and
still seen the client secret reported missing with nothing naming the deploy wrapper as the cause.

### B-DL3 — the approved artifact catalog

`lib/lease-documents/artifact-catalog.ts` lists seven required artifact families and publishes an
empty catalog on purpose, so every dependent result is a named blocker instead of a caller-selected
template. The content is approved legal material that the repository cannot originate.

### B-MNT1 — property preapproval amounts

S108 ships the versioned record, the Admin-only control, and the cancel-first confirmation. The
amounts are owner data. Absence is never authorization: with no amount the ticket keeps waiting on
owner approval, which is the correct closed default rather than a defect.

### B-S100 — an eligible resident message

Chat synchronization is complete, proven, open, and deployed. The unsent resident-draft key stays
closed until one synchronized message maps to a verified resident email in the signed-in managed
mailbox. The designated thread has yielded no eligible record, and inventing one would defeat the
proof.

A bodyless read on 2026-09-06 confirmed the documented lease-with-tenants shape the mapping codec
expects (root `tenants[]` of `{leaseTenant, contact}` with numeric-string ids and a string
`contact.email`), so the codec is not the gap. The application-side gap is the link: work orders the
app creates are unshared with the tenant and lease-less, and no operation links an existing RentVine
work order (one that carries resident chat) to a ticket. When the Wednesday answer names a work
order, that link path has to exist before the sync can be pointed at it; it is agent-owned next work,
listed in `docs/loop-state.md`, and it does not need any owner input to build.

## Wednesday follow-ups, owner-scheduled

The owner scheduled these three for Wednesday. They are not agent work and must not be attempted,
guessed, or worked around. Each one names exactly what to bring back, so the answer can be applied
without another round trip.

| Id     | Ask this                                                                                      | Bring back                                                                  |
| ------ | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| B-DL3  | Team: where do our approved blank lease forms live?                                           | A location, and which of the seven families each file covers.               |
| B-S100 | Team: which work order has resident chat on it, from a resident whose email we have verified? | One work order identifier, and confirmation the resident email is verified. |
| B-MNT1 | Client: which properties are preapproved for maintenance spend, and up to what amount each?   | The exact properties, identified unambiguously, and one dollar amount each. |

Notes that make each ask land the first time:

- **B-DL3** wants blank approved forms, not a lease we have already processed. The seven families are
  standard lease, renewal extension, animal agreement, lead-based-paint disclosure, city addendum,
  HOA artifact, and owner acknowledgment. A file per family is what unblocks the Dotloop upload.
- **B-S100** wants a maintenance work order, not a lease. A lease record cannot satisfy it. The S97
  proof lease is separately barred from reuse, so it is not a candidate even if it comes up.
- **B-MNT1** needs the property identified exactly, because the preapproval record is keyed by
  property. A street name alone is not enough to key it safely.

## Pending verification tasks

A task here is queued behind a blocker above. When its trigger fires, a loop runs the steps without
asking again. Do not run one early: each step needs the input its trigger names.

### V-DL — verify Dotloop end to end once credentials arrive

Trigger: `B-DL1` clears and the owner reports the client id and secret placed through the delivery
path in the B-DL1/B-DL2 detail (`DOTLOOP_OAUTH_CLIENT_SECRET_SECRET_ID`).

1. Confirm delivery: `DOTLOOP_OAUTH_CLIENT_ID`, `DOTLOOP_OAUTH_REDIRECT_URI`, and
   `DOTLOOP_OAUTH_CLIENT_SECRET_SECRET_ID` are all in the reviewed deploy env, and the secret exists
   in Secret Manager. Deploy a candidate and read the revision's bound secret map back.
2. Confirm the runtime sees it: Dotloop readiness must stop reporting the client secret missing.
3. Complete the owner-initiated authorization, then read readiness again. It must report `connected`
   only after a profile probe succeeds, and must name the exact missing resource otherwise.
4. Exercise refresh, revoke, and reconnect against the live account, and confirm a revoked refresh
   token reports `refresh_needed` rather than a silent failure.
5. Create one loop from one approved packet. Confirm the same packet hash reuses it with no provider
   call, and a different hash marks the prior loop superseded.
6. Confirm no signature state is claimed anywhere in the result. The published API documents no
   e-signature operation.

Do not open either Dotloop action key as part of this task. Key activation is a separate owner step.

## Recently cleared

| Id      | Was blocking        | Cleared by                                                                                                                                                                                                                                                                    |
| ------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-MON1  | Candidate promotion | The S51 monitoring resource set reads `READY`: one exact channel, the A2 metric, and the four attached policies.                                                                                                                                                              |
| B-MON2  | Candidate promotion | The candidate configuration fingerprint is captured (recaptured 2026-09-06 for `pmi-kc-app-rmtq71kjl-bff41bbdb5fa` after the output-only-field correction: `sha256:dc697873b3b384e13a631e4742bae66358f71d6f09bca564dbfd84351de1bcda`), so the receipt run does not derive it. |
| B-DEP1  | S106 and S34 live   | The Dotloop client secret now has a Secret Manager delivery path in the deploy wrapper, pinned by tests in both directions.                                                                                                                                                   |
| B-AUTH1 | Candidate promotion | The candidate hostname `cand-rmtq71kjl-bff41bbdb5fa---pmi-kc-app-kq6wuvpiva-uc.a.run.app` is the only candidate entry in the authorized domains, read back from the Identity Platform config on 2026-09-06; the superseded `cand-rmtq2goev-157da39536d0` entry was removed.   |
| B-MNT2  | S109 resource offer | The owner approved three reviewed links on 2026-09-04, one each for Electrical, HVAC, and Plumbing. Appliance and General stay empty on purpose.                                                                                                                              |
