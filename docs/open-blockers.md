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

| Id      | Blocks                                      | Owner    | Exact hold                                                                                                     | Completion evidence                                                              |
| ------- | ------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| B-AUTH2 | Candidate promotion                         | owner    | Two managed Admin and Editor browser profiles authenticated on the exact candidate origin do not exist.        | `--prepare-candidate-receipt` completes with both canaries passing.              |
| B-DL1   | S106 live readiness, S34 live loop creation | external | SENT 2026-09-04 to support@dotloop.com, awaiting reply. Dotloop issues credentials by approved request only.   | An approved client id and client secret exist for this application.              |
| B-DL2   | S106 live readiness, S34 live loop creation | owner    | No managed Dotloop account is connected, and none carries the office profile and renewal loop template.        | Readiness reports `connected` after a profile probe, naming no missing resource. |
| B-DL3   | S34 document upload                         | owner    | The S66 artifact catalog is empty: no approved lease artifact content source exists to upload into a loop.     | The seven required artifact families resolve to approved content.                |
| B-MNT1  | S108 preapproval routing proof              | owner    | No Admin has entered a property preapproval amount, so every ticket correctly still waits on owner approval.   | At least one property preapproval reads back with its amount and effective date. |
| B-S100  | S100 resident draft, and S36 behind it      | owner    | No synchronized resident message maps to a verified resident email, so the draft proof has no eligible target. | One eligible message exists and the draft key's proof runs against it.           |

## Detail

### B-AUTH2 — the two managed browser profiles

Assurance requires two distinct profile directories outside the repository, each interactively
authenticated on the exact candidate origin as the expected Admin and Editor. The handoff explicitly
refuses canonical-host-only sessions, copied cookies, guessed or default profiles, and automated
password or MFA entry. No agent path exists and none should be built: the point of the check is that
a person proved the real identity works on the real origin.

The read-only half is already done. The candidate configuration fingerprint is captured, the
candidate origin is an authorized sign-in domain, and the candidate serves `/sign-in` with HTTP 200,
so the only unknown left is whether the managed account completes its own sign-in.

Every other receipt input is already in hand: the live flag, candidate origin, expected commit,
expected revision, expected configuration fingerprint, an internal operator address, a fresh receipt
path, and an existing predecessor revision. The assurance browser runs under WSL, so both profile
directories must be passed in their `/mnt/c/...` form, must be absolute, must differ from each other,
and must sit outside the repository.

Sign in against the origin of the candidate that will actually be promoted. A profile authenticated
against a superseded candidate's hostname is wasted work, because each candidate gets its own
hostname and its own authorized-domain entry.

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
