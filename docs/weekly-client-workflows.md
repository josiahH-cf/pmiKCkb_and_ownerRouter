# Manual client workflows

Two explicit repository skills run whenever requested. Nothing is scheduled.

| Task                               | Claude Code    | Codex                                                             |
| ---------------------------------- | -------------- | ----------------------------------------------------------------- |
| Update slides, agenda and blockers | /weekly-call   | Select Weekly call in the slash/skills list, or type $weekly-call |
| Prepare a copy-ready status email  | /weekly-update | Select Weekly update, or type $weekly-update                      |

Restart the session after pulling main so the new skills are discovered. Codex CLI also supports
/skills selection. Bare custom slash names differ between clients; the maintained implementation
is the repository skill, without deprecated personal prompts.

Examples: /weekly-call --dry-run; /weekly-call for October 15, 60 minutes, with an extra slide
about client decisions; /weekly-update --dry-run. Optional dates, notes and slide requests become
the shared content model. Dry-run permits local rendering/review but skips pack acceptance.
The existing Friday command is a copy-only compatibility alias.

## Presentation pack

The accepted default is a six-slide PDF deck, two-page agenda, one-page blockers/action sheet,
and Markdown agenda. Up to six requested extra slides extend the page count. The renderer keeps
the accepted orange/black/white treatment and supplied Poppins typography. It creates a layout
audit, checksums and every page as a PNG. Inspect every page before acceptance; shorten overflowing
text before shrinking. Failed attempts remain separate.

Current main, release records, blockers, staff runbook and feature registry supply a dated snapshot.
Dirty local proposals do not become delivery claims. Each material claim has an exact source quote
in private content. Old metrics retain dates/scope; without fresh measurements the pack says so.
Optional Gmail, calendar, live health and billing sources are not claimed as read.

Accepted packs, completed meetings and sent emails have independent baselines. The initial window
is fourteen days; later collection overlaps the lane baseline by forty-eight hours. The assistant
compares the previous output to remove repeats and retains unresolved blockers. A pack never
advances email history. Agent visual review is separate from human staff validation.

## Copy-ready email

The owner selected copy-only output after the connected Gmail account could not verify the
managed sender. The command needs no mailbox connection and calls no email provider.

It shows exact recipients and subject, then the complete body in one plain-text code block.
The template includes Hi Dan and the confirmed partner, one 😊, ✅ Done this week,
🔜 Next Up, 🚧 Blockers and Thanks/Josiah. Bullets describe supported outcomes, upcoming work
and blockers with owners/actions. The owner copies the body and sends using their chosen client.

Preparing text never claims sending or delivery. If the owner later reports sending an exact
preview, the helper can record that email baseline as owner_reported. It never claims provider
verification. There is no draft/send dispatch command; application messaging gates are unchanged.

## Private setup

Run these commands from the repository root:

    node tools/client-updates/cli.mjs status
    node tools/client-updates/cli.mjs help

Status returns the primary checkout's ignored output/client-updates directory. Windows, WSL and
linked worktrees share it. Configuration, addresses, source quotes, content, PDFs, reviews and
history stay there and out of Git and Cloud Run uploads.

Use the bundled desktop Python or an isolated environment with the pinned packages in
tools/client-updates/requirements.txt. Supply Poppins Regular, Medium, SemiBold and Bold TTF files
from the approved existing font folder. The renderer downloads nothing.

The private setup JSON accepts renderers.windows and renderers.linux, each with absolute python
and font_dir paths. Single-platform configuration may use top-level python and font_dir.
Its email object contains sender, to and cc. Each recipient has name, email and role (dan or
partner); both exact recipients are required, with explicit To/CC placement. Keep cc as an empty
array if unused. Sender uses the approved managed domain. publication must remain disabled.

Save that actual setup JSON inside the state root, then run:

    node tools/client-updates/cli.mjs configure --file <absolute-private-setup.json>
    node tools/client-updates/cli.mjs doctor

This host's owner-confirmed sender and two To recipients are configured privately. No addresses
or generated client material are committed.

The [shared procedure](../tools/client-updates/WORKFLOWS.md) is the execution contract.
The [source index](weekly-client-workflows-source-index.md) records template provenance;
the [original plan](weekly-client-workflows-plan.md) retains the superseded connector design.

## Verification

Verified on 2026-10-09: Windows/WSL dependencies and shared state; a repository-grounded
six/two/one-page pack; inspection of all nine PNGs; content, integrity and continuity tests;
and fresh discovery of both skills in Codex and Claude. Copy output is verified locally, with
real configured recipients and the required emojis. No synthetic or real email was sent.

Editable PowerPoint/Google Slides and public pack publication are optional future extensions.
The shipped format follows the supplied PDF reference. Local workflow changes require no
Cloud Run application release.
