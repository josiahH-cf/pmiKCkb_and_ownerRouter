# Product Lanes

This directory is the active product routing layer for the purchased PMI KC workstream.
Use it before older demo docs or preserved specs.

## Active Lanes

| Product lane        | Read first               | Current state                                                                |
| ------------------- | ------------------------ | ---------------------------------------------------------------------------- |
| PMI KC KB           | `pmi-kc-kb.md`           | Existing source-backed web app runtime and demo                              |
| Lease Renewal Agent | `lease-renewal-agent.md` | Separate product track; discovery required before runtime work               |
| Gmail Inbox 0       | `gmail-inbox-zero.md`    | Dan-email-first Gmail workflow, successor to Owner Router/Dan's AI Assistant |

## Rules

- Treat these docs as the current client-purchased direction.
- Preserve original specs in `docs/specs/`, but do not let older repo-boundary language
  override the monorepo governance in `docs/north-star.md`.
- Do not build runtime code for Lease Renewal Agent or Gmail Inbox 0 until their
  requirements, permissions, and acceptance gates are confirmed in the product doc.
- Keep all three lanes free of secrets, raw customer records, and unsupported
  system-of-record writes.
