# Loop state

Last updated: 2026-10-28 (UTC). Read AGENTS.md and docs/facts.md first.

## November/December renewal readiness execution (October 28)

S232–S238 (intake 099–105) were authored against main `a1c0fe8c`; the owner's execution
instruction then started them in the same owner session. PR #158 merged them to main at `bf0c03f9`
after all five CI jobs passed, with focused tests: S232 R-S232-1/2/6/8 and the fail-closed and
retained-skip parts of R-S232-7 (window and month context, the ended-without-outcome scope, notice
timing from recorded sends, fail-closed staff-record reads, retained skipped work, Central policy
dates); S233 R-S233-3/6/7 and parts of R-S233-4/5 (distinct pause causes, open-only worker paging,
Central schedule default with the Nov 1 repeated-hour statement, zoned instants and past-due lag,
Resume timing, incoming-check age); S234's approval-bound terms display; S237 R-S237-3/4 (plain
RentVine outcomes, the Sheet still-before result); and `qs` 6.16.1 for GHSA-6pq8-jhm2-2vcw. S235 and
S236 were not executed. Nothing was served; production remains `6fbd6225` (S231). The staff
walkthrough is NOT RUN. Client inputs C00–C13 stay in `docs/open-blockers.md`; three reconciled
staff-operations notes are under its runner follow-ups. The read-only release preflight reads
`not_ready`: the Awaiting release queue is empty and no permit or fresh GO exists. NEXT: the remaining ready S232–S238 rows, independent of delivery. Delivery needs the owner's
direction to queue the merged slices, then the release pipeline's own prerequisites. S238 owns
the November 4, 2026 (Central) blocker review.

## Dotloop A1 resolved and selected (October 27)

Every connection seam is ready. On October 27 each seam, the read-only Admin canary and
`auth:ensure --unattended` read back ready (facts). Dotloop caps the company at eight users and
refuses a second membership for an existing member, so the owner freed josiah@'s slot, re-added
josiah@ as admin, and, signed in as josiah@, removed Integrations API and re-added it as an agent.
At 10:35:30Z the bounded API read listed LEASE RENEWAL (228954, `LEASE_OFFER`) on the new
integrations INDIVIDUAL profile 20701283. The owner's Admin session refreshed resources and saved
profile 20701283, template 228954 and initial status `PRE_OFFER` (owner choice) at 10:39:59Z; the
selection and the readiness page read back. Both write keys stay closed; no loop, upload or other
provider business write occurred. S231 patched new audit advisories and released (run 030761c0).
The client content holds (B-DL3 originals, maps and signers; fees and Rhino; A5) are itemized in
C01–C10, and the human and live-evidence holds in C11–C13, in `docs/open-blockers.md`. The first real loop is ordinary staff-confirmed work after B-DL3 approval,
under its own exact owner authorization.
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

Empty. S231 (zod 4.6.7, body-parser 1.20.9/2.4.0 and fast-uri 3.1.9, owner direction in the
2026-10-27 Dotloop resume prompt) was independently verified delivered by run 030761c0; S230 by
run eee80164; S227, S228 and S229 by run 57e4a1b5.

## Verified production

Production serves `6fbd62250ccd9df1b9861a59b5de21c2143a68c0` /
`pmi-kc-app-rmvqk1okt-ecd4a985b1de` at 100% canonical traffic. Run
`030761c0-1e70-4cd2-95a6-77480107657d` delivered S231 (zod 4.6.7, body-parser 1.20.9/2.4.0 and
fast-uri 3.1.9) with candidate assurance, receipt-bound promotion, two observation checkpoints in
406,404 ms and all eleven independent readback sections. The one-item queue is delivered and empty;
its permit is consumed. S231 passed the complete gate, served E2E (65 passed, four existing skips,
fourteen files) and exact-main CI `40487479956` on `6fbd6225`. The October 20 S227–S229 delivery
evidence remains `docs/evidence/application-delivery-2026-10-20.md`.

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

The bounded Dotloop read at 2026-10-27T10:35:30Z verified `integrations@pmikcmetro.com` with a
connected credential and two INDIVIDUAL profiles: the standalone "Default Profile" (zero templates)
and the office agent profile 20701283 "Integrations API", which lists nine shared company
templates including LEASE RENEWAL 228954 (`LEASE_OFFER`). Integrations is now an agent only, with
no company admin profile. The saved selection is profile 20701283, template 228954 and initial
status `PRE_OFFER` (version 1, 10:39:59Z). Both Dotloop write keys remain closed; no template was
recreated.

Eight browser-observed Drive PDF references are saved through the normal Admin API and individually
read back at resource version 8, all unverified. The deployed readiness page displays ten form
families across renewal extension, full lease and owner acknowledgment. Actual originals and
reviewed field/signer maps remain unapproved for all ten families. Source presence is not legal,
customer-link or signing approval. Source verification is a staff attestation in Admin; the
least-privilege `drive.file` 404 for a browser-visible file is expected and holds nothing.

## Continuation

Documentation-only closure records the verified delivery; it requires no runtime deployment.
The deployed source is 6fbd6225 (S231, run 030761c0). Preserve private receipts and failed attempts outside Git.
Template visibility and selection are resolved (October 27). Applicable approved originals/maps,
policies, the A5 timing record and human real-case acceptance remain open (C01–C13); no customer
effect was proof.
