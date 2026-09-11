---
package_id: pmi-feature-specifications
document: 12-resolved-open-inputs
revision: 1
written_by: unblock pass, 2026-09-04
---

# Resolved open inputs

The package implementation and S113 consolidation are deployed after exact-SHA CI and all release
gates. Real provider forms/connection/activation inputs remain separately gated. This document records what an unblock pass on 2026-09-04
answered, changed, or could not answer, so a later reader does not re-derive it.

It adds to the package; it changes none of the eleven specifications above it. Where a decision
belongs in the repository's own truth documents it was written there as well, and the repository is
authoritative if the two ever disagree.

## What was answered and changed

### Package-level proof, item 3 — Dotloop connect (specification 05)

**Answer: the credential is obtained by request, not self-registration.** Dotloop's published Public
API v2 guide directs developers to request access at `info.dotloop.com/developers` rather than
issuing credentials from a self-service portal. The credential therefore depends on a third party's
approval turnaround and cannot be scheduled from inside this project.

**Change made: the credential now has a delivery path.** The deploy wrapper forwarded the non-secret
Dotloop client id and redirect URI but had no binding for the client secret, while its own comment
claimed one existed. An owner could have completed every Dotloop step and still shipped a revision
whose readiness reported the client secret missing, with nothing naming the deploy wrapper as the
cause. The wrapper now binds the client secret from Secret Manager when its explicit secret-id
signal is set, refuses to promote a plaintext value into a deployed revision, and pins both
directions in tests.

**The exact values to register**, so nothing is guessed later:

- Redirect URI: the production origin plus `/api/connections/dotloop/callback`.
- Scopes the application requests, and no others: `account:read`, `profile:read`, `loop:read`,
  `loop:write`, `template:read`.
- The connected account must carry the office profile and the renewal loop template; readiness names
  the exact missing resource rather than reporting a vague failure.

**Unchanged and deliberate:** no e-signature activity is claimed. The official Public API v2 documents
no signature operation, so the application provides the precise handoff the specification allows.

### Package-level proof, item 3 — the document source (specification 06)

**Answer: this is approved legal content, not a technical gap.** Seven artifact families are required
and the catalog is empty on purpose so that every dependent result is a named blocker instead of a
caller-selected template or fallback copy. No amount of implementation resolves it; the approved
artifacts have to exist.

### Package-level proof, item 5 — approval-threshold routing (specification 08)

**Answer: the empty state is correct behavior, not an incomplete feature.** The versioned record, the
Admin-only control, and its cancel-first confirmation all ship. With no amount entered, every ticket
keeps waiting on owner approval, which is the specification's own "absence is never authorization"
rule working. The amounts are owner data.

### Package-level proof, item 5 — vetted troubleshooting (specification 09)

**Answer: three candidate links were located and verified to resolve; none is reviewed yet.** The
specification asks for vetted resources, and vetting is the part a person at the property company
performs. Leaving the catalog empty disables only the resource offer; triage, urgency, evidence, and
the handoff are unaffected.

- Electrical — the CPSC GFCI fact sheet, covering testing and resetting a GFCI before reporting.
- HVAC — the ENERGY STAR heating and cooling maintenance checklist, covering filter and thermostat
  checks before reporting.
- Plumbing — the EPA WaterSense leak guidance, covering a running toilet or a dripping fixture.

Appliance and General are deliberately left without a candidate. No authoritative vendor-neutral
source was found worth standing behind, and an unreviewed filler entry would be worse than no offer,
because the selection rule offers a resource only when exactly one reviewed entry matches.

### Package-level proof, item 7 — readiness for the operator guide (specification 11)

**Change made: the release monitoring set now passes.** It had read `DRIFT` and was described as
needing a manual recovery plus an operator email verification. Two of the three causes were checker
defects rather than missing owner work:

- The checker demanded a channel verification status the provider documents as immutable and never
  returns for this channel type. It now refuses only the documented non-functioning state, so a
  genuinely dead channel still fails.
- The checker required a threshold field the provider omits from a read when it holds the default of
  zero, which rejected the exact policies this repository had just created from its own committed
  definitions. An omitted threshold is now read as zero, and a differing threshold still fails.
- The one real drift was the managed channel itself, which was missing a label and carried a
  description the committed definition does not have. It was repaired in place to match the
  definition, and the alert metric and four policies were created from the committed definitions.

**Change made: the candidate configuration fingerprint is captured**, so the promotion receipt run no
longer has to derive it first.

## What could not be answered here

The candidate origin must be an authorized sign-in domain. Under the September 10 owner amendment,
the existing owner Admin profile supplies browser assurance on both exact origins; Editor browser
coverage is recorded as not_run and backend Editor restrictions remain verified. Automated password or MFA entry is refused by
design, and building an agent path around it would defeat the check rather than satisfy it.

The resident-draft proof in the adjacent chat-sync work also still waits on one synchronized resident
message mapped to a verified resident email. Inventing an eligible message would defeat the proof.

## Where the durable record lives

The repository carries the same content in its own tracked documents, which are authoritative:
verified truth, the resume state, the blocker ledger with stable ids, and the operator guide. A later
reader should start there rather than from this package.
