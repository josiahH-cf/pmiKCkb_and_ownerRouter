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

| Id      | Blocks                                      | Owner    | Exact hold                                                                                                              | Completion evidence                                                              |
| ------- | ------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| B-AUTH1 | Candidate promotion                         | owner    | The candidate's tagged hostname is not a Firebase authorized domain, so no managed identity can sign in on that origin. | The exact hostname appears in the Identity Platform config readback.             |
| B-AUTH2 | Candidate promotion                         | owner    | Two managed Admin and Editor browser profiles authenticated on the exact candidate origin do not exist.                 | `--prepare-candidate-receipt` completes with both canaries passing.              |
| B-DL1   | S106 live readiness, S34 live loop creation | external | Dotloop issues API credentials only by approved request; there is no self-service portal.                               | An approved client id and client secret exist for this application.              |
| B-DL2   | S106 live readiness, S34 live loop creation | owner    | No managed Dotloop account is connected, and none carries the office profile and renewal loop template.                 | Readiness reports `connected` after a profile probe, naming no missing resource. |
| B-DL3   | S34 document upload                         | owner    | The S66 artifact catalog is empty: no approved lease artifact content source exists to upload into a loop.              | The seven required artifact families resolve to approved content.                |
| B-MNT1  | S108 preapproval routing proof              | owner    | No Admin has entered a property preapproval amount, so every ticket correctly still waits on owner approval.            | At least one property preapproval reads back with its amount and effective date. |
| B-MNT2  | S109 troubleshooting resource offer         | owner    | No troubleshooting link has been reviewed, so the catalog is empty and no resource is offered.                          | Reviewed links carry a reviewer and a review date in the catalog.                |
| B-S100  | S100 resident draft, and S36 behind it      | owner    | No synchronized resident message maps to a verified resident email, so the draft proof has no eligible target.          | One eligible message exists and the draft key's proof runs against it.           |

## Detail

### B-AUTH1 — the candidate origin is not an authorized domain

`docs/environment-handoff.md` requires the candidate hostname to be added to Firebase authorized
domains before the two managed profiles can sign in there. The current authorized list carries the
canonical service hosts and the demo hosts only, so a tagged candidate origin is absent for every
candidate. This is an access-surface change, so a person makes it deliberately per candidate and
reads it back; it is also reversible by removing the same entry after promotion.

### B-AUTH2 — the two managed browser profiles

Assurance requires two distinct profile directories outside the repository, each interactively
authenticated on the exact candidate origin as the expected Admin and Editor. The handoff explicitly
refuses canonical-host-only sessions, copied cookies, guessed or default profiles, and automated
password or MFA entry. No agent path exists and none should be built: the point of the check is that
a person proved the real identity works on the real origin.

The read-only half is already done. The candidate configuration fingerprint is captured, so the
receipt run does not have to derive it first.

### B-DL1 and B-DL2 — Dotloop credentials and a connected account

Dotloop's published API guide directs developers to request access rather than self-register, so the
credential itself depends on a third party's approval turnaround. The application's side is complete
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

### B-MNT2 — reviewed troubleshooting links

`lib/maintenance/troubleshooting-catalog.ts` offers a resource only for a normal-urgency report whose
issue type matches exactly one reviewed entry, so an ambiguous match offers nothing and an urgent or
emergency report is never handed a self-help link. An empty catalog disables only the offer.

Three candidate links were located and each was confirmed to resolve; none is a reviewed entry until
a person at the property company reviews it and records the date. Appliance and General are
deliberately left without a candidate, because no authoritative vendor-neutral source was found worth
standing behind, and an unreviewed filler entry would be worse than no offer.

| Trade      | Candidate link                                                                                      | What it covers for a resident                   |
| ---------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Electrical | https://www.cpsc.gov/safety-education/safety-guides/electronics-and-electrical-home/gfci-fact-sheet | Testing and resetting a GFCI before reporting.  |
| HVAC       | https://www.energystar.gov/saveathome/heating-cooling/maintenance-checklist                         | Filter and thermostat checks before reporting.  |
| Plumbing   | https://www.epa.gov/watersense/fix-leak-week                                                        | Finding a running toilet or a dripping fixture. |

### B-S100 — an eligible resident message

Chat synchronization is complete, proven, open, and deployed. The unsent resident-draft key stays
closed until one synchronized message maps to a verified resident email in the signed-in managed
mailbox. The designated thread has yielded no eligible record, and inventing one would defeat the
proof.

## Recently cleared

| Id     | Was blocking        | Cleared by                                                                                                                  |
| ------ | ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| B-MON1 | Candidate promotion | The S51 monitoring resource set reads `READY`: one exact channel, the A2 metric, and the four attached policies.            |
| B-MON2 | Candidate promotion | The candidate configuration fingerprint is captured, so the receipt run no longer has to derive it.                         |
| B-DEP1 | S106 and S34 live   | The Dotloop client secret now has a Secret Manager delivery path in the deploy wrapper, pinned by tests in both directions. |
