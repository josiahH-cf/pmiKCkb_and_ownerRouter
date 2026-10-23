# Loop state

Last updated: 2026-10-23 (UTC). Read AGENTS.md and docs/facts.md first.

## Connections readiness — October 22

The owner launched the connections and unattended-readiness stage. Production was unchanged at
157b6992 until S230 released 79764b56 on October 23; RentVine, Sheet, Gmail DWD scopes, the sequence worker and sign-in wiring read back
ready (facts). Dotloop waits only on A1: a full Dotloop admin adds the integrations login to the
office that holds the Lease Renewal template. The owner's other full-admin account no longer exists,
so Dan or Dotloop Support must restore a full admin first. On October 23 Dan, a full admin, granted
integrations template rights; it now sees LEASE RENEWAL but is not an office agent, and the API is
unchanged. The owner asked Dan to add it as an agent. NEXT: after the owner reports A1, rerun the bounded
Dotloop read; when the template lists, an Admin selects it and the runner reads it back.
Windows-hosted Claude Code and Codex report the WSL credential store through `auth:ensure`
(protected `scripts/auth`, merged on owner direction). Private receipts:
`Codex/2026-10-16/pmi-delivery-01a1461d/connections-readiness-20261022/`, outside Git.

## Current resume point

The owner amended S227–S229 on October 20: completely retire the maintenance component,
including history/reports and obsolete wiring; diagnose the existing Dotloop template through
`integrations@pmikcmetro.com`; map form sources to their existing processes; and finalize the
existing staff-confirmed renewal Send, Schedule and Resume journey for October 22.
Both Dotloop write keys remain closed. Signing is a human Dotloop handoff. No customer send,
draft, provider business write or production test record is verification proof.

New renewal authorizations bind current content, recipients, source values, sender and a new
delivery-policy version. The worker skips old authorizations and every retired maintenance lane
before actor/mailbox/source reads. Current role/Space, runtime suspension, exact-key, at-most-once
claim, receipt, readback and ambiguity recovery gates remain. Generic, bulk, model-triggered and
unapproved background sends remain unavailable. No protected activation metadata changes.

Implementation e5c1c9e6 and the parser-qualified queue were normally fast-forward published to main
at `157b6992279467e73dcf91aa43eb3c247f96ff2f`. No merge was manufactured for already-ancestral
October 16 source. Original and admitted checkouts remain preserved.

## Awaiting release

Empty. S230 (Next.js 16.4.2 and ip-address 10.7.4, owner direction 2026-10-23) was independently
verified delivered by run eee80164; S227, S228 and S229 by run 57e4a1b5.

## Verified production

Production serves `79764b56011bd2571a56435aa7df21f2677d846a` /
`pmi-kc-app-rmvkpw2ey-bfdf11ed1ed3` at 100% canonical traffic. Run
`eee80164-dea4-4601-8d69-965edabeeeb6` delivered S230 (Next.js 16.4.2 and ip-address 10.7.4) with
candidate assurance, receipt-bound promotion, two observation checkpoints in 408,894 ms and all
eleven independent readback sections. The one-item queue is delivered and empty; its permit is
consumed. S230 passed the complete gate, served E2E (65 passed, four existing skips, fourteen
files) and exact-main CI `39923662033` on `79764b56`. The October 20 S227–S229 delivery evidence
remains `docs/evidence/application-delivery-2026-10-20.md`.

Implementation `e5c1c9e6c0b769b815f42fc60dfba2a521e4dff3` passed the actual complete
`bash scripts/verify.sh`: 9,659 unit tests with four existing configuration skips, all 465 backend
tests with no skips, required checks, production build and zero production audit findings.
Served E2E passed 65 tests with four existing configuration skips across all fourteen files.
Exact-main CI `39464866553` passed all five jobs on `157b6992`, deployed October 20. Canonical v11 covers
all final code/tests; policy-build v3 and served E2E v2 cover identical runtime/package bytes,
with two later test-only assertion/synchronization changes covered by canonical v11.

The owner-approved one-file Editor grant was applied with notification off and read back.
Production now delegates Sheet/Drive as `integrations@pmikcmetro.com`; the normal keyless Sheet
reader freshly verified all 29 tabs after promotion without reading/changing cell values.
On October 20 only APP_COMMIT_SHA and SHEETS_DWD_SUBJECT differed among the 54 environment
keys versus that run's captured predecessor. Runtime identity, eleven Space maps, five secret bindings, Production/Live,
Demo=false, Sheet=true, RentCast allowance 50 and other controls match. CLI/ADC and guarded
Admin assurance retain the separately approved `josiah@pmikcmetro.com` identity/store/profile.

## Provider checkpoint

The bounded Dotloop read at 2026-10-22T12:58:20Z verified `integrations@pmikcmetro.com` with a
connected, unexpired credential. Its standalone INDIVIDUAL "Default Profile" lists zero templates;
its default COMPANY profile "PMI KC Metro" returns 403, which Dotloop's public API documents for
every non-INDIVIDUAL profile. An office template reaches only its office members' individual
profiles, and the integrations individual profile carries no office affiliation. A full Dotloop
admin must add the integrations login to the office that holds the template (A1). No supported
selection exists. Both Dotloop write keys remain closed; no template was recreated.

Eight browser-observed Drive PDF references are saved through the normal Admin API and individually
read back at resource version 8, all unverified. The deployed readiness page displays ten form
families across renewal extension, full lease and owner acknowledgment. Actual originals and
reviewed field/signer maps remain unapproved for all ten families. Source presence is not legal,
customer-link or signing approval. Source verification is a staff attestation in Admin; the
least-privilege `drive.file` 404 for a browser-visible file is expected and holds nothing.

## Continuation

Documentation-only closure records the verified delivery; it requires no runtime deployment.
The deployed source is 79764b56 (S230, run eee80164). Preserve private receipts and failed attempts outside Git.
Actual template visibility/selection, applicable approved originals/maps, required timing inputs
and human real-case acceptance remain open for the requested Thursday journey; no customer effect was proof.
