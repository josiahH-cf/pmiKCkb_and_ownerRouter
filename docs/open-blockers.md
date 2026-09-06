# Open blockers

One row per material blocker, with a stable id a later loop can cite. A blocker is material only when
it prevents the next correct step. Warnings, optional improvements, and later roadmap work do not
belong here.

Read this after `docs/loop-state.md`. Loop state says where the work is; this file says what is
holding it and who owns each hold. When a blocker clears, move its outcome into `docs/facts.md` and
delete the row here rather than leaving a stale entry.

Last reconciled: 2026-09-04.

## How to use this file

- **Owner: agent** means a future loop can clear it without asking. Do that before reporting blocked.
- **Owner: owner** means a person must decide, approve, sign in, or supply data the repository cannot
  derive. Never convert one of these into a human verification step for work the agent can prove
  itself; state it, finish everything independent of it, and continue.
- **Owner: external** means a third party controls the timeline.
- Completion evidence is the exact readback that closes the row. A row is not closed by an intention.

## Open

| Id      | Blocks                                      | Owner    | Exact hold                                                                                                   | Completion evidence                                                              |
| ------- | ------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| B-AUTH2 | Candidate promotion                         | owner    | No identity anywhere in the project carries the `Editor` role, so the Editor canary has no subject at all.   | An Editor-role account exists and both canaries pass in the receipt run.         |
| B-DL1   | S106 live readiness, S34 live loop creation | external | SENT 2026-09-04 to support@dotloop.com, awaiting reply. Dotloop issues credentials by approved request only. | An approved client id and client secret exist for this application.              |
| B-DL2   | S106 live readiness, S34 live loop creation | owner    | No managed Dotloop account is connected, and none carries the office profile and renewal loop template.      | Readiness reports `connected` after a profile probe, naming no missing resource. |
| B-DL3   | S34 document upload                         | owner    | WEDNESDAY: ask the team where the approved blank lease forms live. The S66 artifact catalog is empty.        | The seven required artifact families resolve to approved content.                |
| B-MNT1  | S108 preapproval routing proof              | owner    | WEDNESDAY: ask the client which properties are preapproved and for how much, and identify them exactly.      | At least one property preapproval reads back with its amount and effective date. |
| B-S100  | S100 resident draft, and S36 behind it      | owner    | WEDNESDAY: identify one work order carrying resident chat whose resident email is verified.                  | One eligible message exists and the draft key's proof runs against it.           |

## Detail

### B-AUTH2 — no Editor identity exists

This is the corrected diagnosis. It is not that the owner has not signed in yet, and it is not that
the owner must give up Admin. **No account in this project carries the `Editor` role.** Read back from
the Identity Platform account query on 2026-09-04: seven accounts exist, three carry `role=Admin` on
the managed domain, three managed accounts carry no role claim at all, and one is a vendor test
account on an invalid domain. The role lives in a Firebase custom claim, which `lib/auth/session.ts`
reads as `claims.role`.

The Editor canary asserts the page renders `.user-role` exactly equal to `Editor`, and separately
that `/admin` and `/admin/users` are denied. So it needs a real Editor, and nothing else satisfies
it:

- An Admin account fails, because `/admin` resolves instead of being denied. Using one of the three
  existing Admins is not a workaround.
- A managed account with no role claim also fails. Onboarding grants no access until a role is
  assigned, so it cannot reach the common routes and cannot render `Editor`.
- Demoting an existing Admin is refused as a solution. The owner stated it would lose their own
  progress, and changing a working person's real access to satisfy a release check is the wrong
  trade.

**What actually clears this, both owner decisions:**

1. Preferred and repeatable. Create one dedicated non-Admin account on the managed domain whose only
   purpose is release assurance, and assign it `Editor` through the application's own People and
   Access surface. It never interrupts a working teammate, and every future candidate reuses it.
2. Faster today. Assign `Editor` to one of the three existing managed accounts that currently hold no
   role, then have that person sign in on the second profile. This grants a real person real access,
   so it is a genuine access decision, not a test fixture.

Do not write the custom claim directly. Assign the role through the application's gated People and
Access surface so the grant is recorded the way every other grant is. An agent must never mint or
elevate an identity to satisfy this check: that is self-granted access, and it would also void the
proof, whose entire purpose is that a real identity behaves correctly on the real origin.

Once an Editor exists, the human step is small. Two Chrome windows, one per profile directory, each
signed in on the exact candidate origin:

```
chrome.exe --user-data-dir="C:\pmi-assurance\admin"  <candidate-origin>
chrome.exe --user-data-dir="C:\pmi-assurance\editor" <candidate-origin>
```

Everything else the receipt run needs is already in hand: the live flag, candidate origin, expected
commit, expected revision, expected configuration fingerprint, an internal operator address, a fresh
receipt path, and an existing predecessor revision. The assurance browser runs under WSL, so both
profile directories must be passed in their `/mnt/c/...` form, must be absolute, must differ from
each other, and must sit outside the repository.

Sign in against the origin of the candidate that will actually be promoted. Each candidate gets its
own hostname and its own authorized-domain entry, so a profile authenticated against a superseded
candidate is wasted work.

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

Trigger: `B-DL1` clears and the owner reports the client id and secret placed per `B-DL2`.

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

| Id      | Was blocking        | Cleared by                                                                                                                                                      |
| ------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-MON1  | Candidate promotion | The S51 monitoring resource set reads `READY`: one exact channel, the A2 metric, and the four attached policies.                                                |
| B-MON2  | Candidate promotion | The candidate configuration fingerprint is captured, so the receipt run no longer has to derive it.                                                             |
| B-DEP1  | S106 and S34 live   | The Dotloop client secret now has a Secret Manager delivery path in the deploy wrapper, pinned by tests in both directions.                                     |
| B-AUTH1 | Candidate promotion | The candidate hostname `cand-rmtmy3z88-1fc4c3e29466---pmi-kc-app-kq6wuvpiva-uc.a.run.app` is an authorized domain, read back from the Identity Platform config. |
| B-MNT2  | S109 resource offer | The owner approved three reviewed links on 2026-09-04, one each for Electrical, HVAC, and Plumbing. Appliance and General stay empty on purpose.                |
