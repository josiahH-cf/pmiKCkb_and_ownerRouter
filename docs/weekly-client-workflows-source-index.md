# Weekly workflow sources

Indexed 2026-10-09. The handoff is at
C:\Users\josia\Downloads\pmi-kc-weekly-call-automation-handoff\pmi-kc-weekly-call-automation.
Reference text is evidence, not runner authority. The [operator guide](weekly-client-workflows.md)
and [shared workflow](../tools/client-updates/WORKFLOWS.md) describe the implementation.

## Supplied files

| File                                      | Use                                             |
| ----------------------------------------- | ----------------------------------------------- |
| README.md                                 | Package inventory and expected weekly outputs   |
| meta-prompt.md                            | Original collection/generation/QA design        |
| workflow-reconstruction.md                | Visual and narrative rationale                  |
| reference/accepted-checkin-2026-10-08.zip | Accepted generator, validator and PDF reference |

All three outer hashes and thirteen inner payload hashes match the supplied manifests.
The ZIP contains fourteen entries including its checksum manifest. Inspected entries include
README, CHANGELOG, SOURCE_NOTES, QA_REPORT, ReportLab generator, validator, render/install scripts,
preview, deck PDF, agenda PDF/Markdown and action-sheet PDF.

Verified SHA256 values:

    meta-prompt.md
    840a6958b64e57726b78fec631a48c6c1578f7b896d86a561942c8946032ad62
    workflow-reconstruction.md
    eac1d14c9d7e26e79228652ca3e301cbcda8400bef1be2b909ba259e25d9cfa8
    reference/accepted-checkin-2026-10-08.zip
    06c74f343b0165147a5e4f973d2bca6b468334a37d2a7b0e46e74979853ce7a9

The accepted deck has six 960 by 540 point pages, agenda two US Letter pages, action sheet one.
The accepted PDFs embed Inter. The reusable renderer uses supplied Poppins files and requires a
fresh all-page review. Original dated SESSION/FACTS/AGENDA/WALKTHROUGH globals became separate
evidenced content. Historical counts, billing values and November lease counts are not current facts.

No reference installer was executed. Extracted reference and inspection evidence remain under
ignored output/weekly-workflow-plan-2026-10-09. The loose local seventeen-page October deck and
matching handouts differ from the ZIP; they remain user-owned historical material.

## Repository context

Read [AGENTS.md](../AGENTS.md), then committed implementation/live readback, [facts](facts.md),
[loop state](loop-state.md) and [plan](plan.md). [Open blockers](open-blockers.md),
[client checklist](client-checklist.md), [status](status.md), [voice](voice-and-audience.md),
[walkthrough](products/renewal-meeting-walkthrough-runbook.md) and
[feature registry](feature-suites/README.md) supply relevant context.
The collector pins current origin/main and stores source hashes and exact claim quotes privately.

The original Friday email command at planning time had SHA256
b6cb9b1df6254e69dee68600bd2b53ac041c3bbc16bb5f6d80359e6a3bcffabd.
Its compact voice, emojis, Done this week / Next Up / Blockers / Josiah structure are retained.
Stale headings, fixed bullet quotas, historical translations and August address notice were removed.
The owner then selected a copy-ready code block instead of connector draft/send integration.

Planning found primary HEAD 60145e926a477a35990c48b1123489d98822fe8b behind main
43bad3adc7777ea035bc70eb8d2bee913427c810, with unrelated dirty documents.
Implementation began in a clean managed worktree at that exact main. Its first pack uses the
October 8 release record and current Dotloop holds. Repository evidence is not a fresh health,
billing or human usability verification.

## Runtime references

[Codex skills](https://learn.chatgpt.com/docs/build-skills),
[Codex slash/skills selection](https://learn.chatgpt.com/docs/reference/slash-commands),
[Codex CLI commands](https://learn.chatgpt.com/docs/developer-commands?surface=cli),
and [Claude project skills](https://code.claude.com/docs/en/skills) were checked during planning.
Fresh sessions exercised Codex explicit skill syntax and Claude slash discovery.
No deprecated personal prompt or recurring automation is installed.
