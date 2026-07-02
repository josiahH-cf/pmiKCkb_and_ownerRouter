# Audience Profile & Copy Voice

The foundation every client-facing string inherits. Pair this with `docs/feature-suites/voice-copy.md`
(the copy inventory and the keep/rewrite/delete verdicts).

## North Star

One operations cockpit where PMI KC's team runs every recurring process — renewals, move-in/out,
maintenance, inbox — from validated sources. The app proposes; a human approves; nothing touches a
system of record without per-action approval. Front-facing simplicity backed by deterministic
workflows, with models used where they measurably help.

## Audience

- **Primary — PMI KC operators / property managers (e.g. Dan, Josiah, team).** Operationally expert,
  not engineers. Time-poor, working a queue. They want fewer clicks, trustworthy status, and to never
  wonder "is this real or a placeholder?" They do **not** want internal vocabulary ("source of truth,"
  "production_allowed," "Phase-2a").
- **Secondary — the owner/admin.** Manages connections, governance, and approvals. Tolerates a little
  more detail, but still wants plain language and a real kill switch over alerts.
- **Tertiary (NOT app users) — tenants / owners / vendors.** They never log in; they only _receive_
  app-drafted emails. Copy they see must read like a top-tier property manager wrote it.

## Voice rules

- Plain, confident, present-tense, specific. Write what is true now.
- No internal jargon in user-facing copy. Translate system terms to operator language.
- No future-promises in the UI ("available in the next release"). If a feature isn't available, don't
  render a dead control that advertises it.
- No status that over-claims (e.g. "PMI will verify and connect" before verification exists).
- Errors and empty states are plain and actionable, never raw or technical.
- Drafts that may be sent externally keep the human-review boundary (`Draft — Review before sending`).

## Do / don't lexicon

| Don't say (internal)                                | Say (operator)                                    |
| --------------------------------------------------- | ------------------------------------------------- |
| read-authoritative source of truth                  | leases, tenants, and rent                         |
| Available in the next release.                      | (remove the control; show nothing)                |
| All details provided — PMI will verify and connect. | Ready to connect                                  |
| Bailey Placeholder                                  | Open Placeholder _(renamed; `Q-BAILEY` resolved)_ |
| KB-owned process space                              | Process space                                     |
| Read-only source space                              | Source space                                      |
| simulation-only / production_allowed                | Test run / not live                               |

The "Bailey Placeholder" source state is renamed to "Open Placeholder" (`Q-BAILEY` resolved; see `docs/facts.md` `F-OPEN-PLACEHOLDER`).
