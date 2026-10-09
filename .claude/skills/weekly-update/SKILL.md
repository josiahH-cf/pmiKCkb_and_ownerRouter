---
name: weekly-update
description: Prepare a copy-ready PMI KC status email with emojis on demand.
disable-model-invocation: true
---

Read AGENTS.md and [the shared workflow](../../../tools/client-updates/WORKFLOWS.md).
Follow its evidence and weekly-update instructions from the repository root.
User arguments: $ARGUMENTS. Show recipients and subject, then the entire email body in one
plain-text code block with the template's emojis. This is copy only: do not call email connectors.
The owner copies and sends. --dry-run also returns local copy-ready text.
