# Loop state

Last updated: 2026-10-27 (UTC). Read AGENTS.md and docs/facts.md first.

## Waiting on Dan — Dotloop A1 (re-read October 27)

The connections and unattended-readiness stage is complete except Dotloop. On October 27 every
seam, the read-only Admin canary and `auth:ensure --unattended` read back ready again (facts);
production is unchanged at 79764b56. The gate's unchanged production audit failed on new zod,
body-parser and fast-uri advisories, so S231 patches them and awaits release (below). The owner reported A1 done, but
the re-read shows Dan made integrations a company admin, not an office agent: People reads
"PMI KC Metro (admin)" for integrations and the API still lists no template. Remaining A1 step
(exact text in `docs/open-blockers.md`): Dan adds the PMI KC Metro agent membership to Integrations
API, keeping admin. The template type (Lease, `LEASE_OFFER`) needs no change; the initial loop
status is still an owner choice. NEXT: when the owner reports that step done, start a fresh session
with the resume prompt in `docs/dotloop-unblock-runbook.md`. It runs authentication, production and seam checks, the
bounded Dotloop read, the in-app selection, tests and a read-only canary, the end-to-end gap map,
a read-only first-packet readiness report, and unattended confirmation. The first real loop is
ordinary staff-confirmed work after B-DL3 approval, outside that run.
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

1. S231 `63fe588d`: zod 4.6.7 patches GHSA-mrhx-c7xc-m3w5 (below 4.6.6, no 4.2 patch),
   body-parser 1.20.9 and 2.4.0 patch GHSA-27r3-jxmh-p828, and fast-uri 3.1.9 patches four
   advisories through 3.1.8; all failed the unchanged production audit on 2026-10-27.

OWNER DIRECTION, 2026-10-27 (the Dotloop A1 resume prompt): "fix agent-owned defects through
PMI's normal route" and, when code changes, "release only through docs/release-batch-runbook.md".
No application route, read or write changes; the validation and request-body libraries change
under every route, so the full gate, served E2E and the candidate's guarded assurance cover it.
Admit only after exact main CI on the release head, fresh prerequisites and a new run-bound
permit. Both Dotloop write keys stay closed; assurance stays read-only. S230 was independently
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
