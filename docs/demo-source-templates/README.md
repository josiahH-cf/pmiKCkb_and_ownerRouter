# Demo Source Templates

These files are safe source starting points for PMI KC KB demos. They are intentionally
sanitized and should not include real owner names, tenant names, applicant names,
addresses, phone numbers, email addresses, rent amounts, ledger data, bank data,
screening details, private Fathom links, or full lease packet details.

## Current Lease Renewals Live Ask Sources

Use these for the Lease Renewals Cloud Storage / Agent Search smoke:

- `lease-renewals-demo-sop-source.md` - approved safe seed source.
- `owner-renewal-follow-up-demo-template.md` - approved safe seed template.
- `lease-renewals-sanitized-call-notes.md` - approved sanitized call-notes source.

Only upload `.txt` copies to the Cloud Storage source prefix. Seed these approved demo
sources as `approval_status=Approved`.

## Additional Approved Workflow Sources

These approved sources back the local four-workflow demo and the current deployed live
Ask demo corpus.

- `maintenance-work-order-demo-sop-source.md` - approved safe maintenance seed source.
- `maintenance-work-order-sanitized-call-notes.md` - Rentvine intake, missing photos,
  Google Chat handoff, and Dan vendor decision.
- `move-out-deposit-demo-sop-source.md` - approved safe move-out/deposit seed source.
- `move-out-deposit-sanitized-call-notes.md` - move-out instructions, inspection,
  vendor bids, deposit sensitivity, and Rentvine close-out.
- `owner-onboarding-demo-sop-source.md` - approved safe onboarding seed source.
- `owner-onboarding-sanitized-call-notes.md` - onboarding checklist, utilities,
  insurance, keys/locks, existing tenant setup, and missing-detail gaps.

The matching local demo records are seeded by `npm run seed:demo` and reset by
`npm run demo:reset`.

## Remaining Launch Space Source Starters

These transcript-derived starters are safe first-pass source material for launch Space
shells. They remain review-required until Bailey/Dan approve final workflow wording and
any customer-facing language.

- `owner-renewal-outreach-sanitized-call-notes.md` - owner renewal outreach and comp
  lookup gaps.
- `tenant-renewal-notice-sanitized-call-notes.md` - tenant notice, DotLoop handoff,
  and signature follow-up gaps.
- `vendor-assignment-handoff-sanitized-call-notes.md` - Dan-owned vendor routing and
  handoff gaps.
- `daily-inbox-triage-sanitized-call-notes.md` - LeadSimple/Gmail triage and
  assignment gaps.
- `fathom-training-sanitized-call-notes.md` - meeting recording intake, training
  index, and action-item follow-up gaps.
- `escalation-rules-sanitized-call-notes.md` - Bailey/Dan escalation bottlenecks and
  missing backup rules.
- `move-in-sanitized-call-notes.md` - move-in checklist, Z-inspection, key, utility,
  and welcome-letter gaps.

The manifest at `docs/source-corpus/demo-live-source-manifest.json` catalogs the
tracked source files and their intended Cloud Storage `.txt` object names. Use
`npm run corpus:plan -- --write-temp` to create ignored `.txt` copies and print the
upload, import, and `sources_meta` seed commands.

## Approval Rule

The approved templates are useful for demos because they show real PMI KC pain without
customer data. Approval does not authorize the KB to invent legal wording, fees,
approval thresholds, exception handling, customer-facing templates, or system-of-record
updates that are not documented in the source.
