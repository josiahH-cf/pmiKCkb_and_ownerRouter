# Audience Profile & Copy Voice

The foundation every client-facing string inherits. Pair this with `docs/feature-suites/voice-copy.md`
(the copy inventory and the keep/rewrite/delete verdicts).

## North Star

One operations product where PMI KC's team runs recurring work from validated sources. The app
proposes; the permitted human decides and exact-confirms effects; nothing touches a system of record
without its action contract. Front-facing simplicity is backed by deterministic workflows.

## Audience

- **Primary — PMI KC operators / property managers (e.g. Dan, Josiah, team).** Operationally expert,
  not engineers. Time-poor, working a queue. They want fewer clicks, trustworthy status, and to never
  wonder "is this real or a placeholder?" They do **not** want internal vocabulary ("source of truth,"
  "production_allowed," "Phase-2a").
- **Secondary — the owner/admin.** Manages connections, governance, and approvals. Tolerates a little
  more detail, but still wants plain language and a real kill switch over alerts.
- **External Vendor.** A separately authenticated assigned-ticket user. Copy must make scope, next
  action, and communication boundaries obvious without exposing internal tools.
- **Resident intake user.** Uses one short-lived Maintenance link without another login. Copy is
  mobile-first, calm, task-specific, and never implies diagnosis, legal admission, or automatic
  charge.
- **Recipients — tenants / owners / vendors.** External draft/send copy must read like a top-tier
  property manager wrote it and retain the human-review boundary.

## Voice rules

- Plain, confident, present-tense, specific. Write what is true now.
- No internal jargon in user-facing copy. Translate system terms to operator language.
- No future-promises in the UI ("available in the next release"). If a feature isn't available, don't
  render a dead control that advertises it.
- No status that over-claims (e.g. "PMI will verify and connect" before verification exists).
- Errors and empty states are plain and actionable, never raw or technical.
- Drafts that may be sent externally keep the human-review boundary (`Draft — Review before sending`).

### Voice rules v2 (S13, 2026-07-02 — `F-VOICE-2`)

These three durable rules were added after the pre-customer copy pass and are enforced by
`npm run verify:copy-voice` (`scripts/check-copy-voice.mjs`), so the fixes cannot silently regress:

- **No em dashes in user-facing copy.** Use a period, comma, or parentheses instead. The only
  allowed em dash is the verbatim `DRAFT_BANNER` ("Draft — Review before sending"); numeric ranges
  use an en dash ("$1,500–$1,700"), which is fine.
- **The app calls itself "the app."** In body copy the product refers to itself as "the app"; the
  product name appears only in the header lockup. Never say a person or vendor does the work for the
  user ("PMI handles the setup for you") when the app does it.
- **Every description says what the thing does, in one concrete present-tense sentence.** No abstract
  value-prop phrases ("the exception and control plane"). Say what it reads, writes, or checks.

## Do / don't lexicon

| Don't say (internal)                                | Say (operator)                                          |
| --------------------------------------------------- | ------------------------------------------------------- |
| read-authoritative source of truth                  | leases, tenants, and rent                               |
| Available in the next release.                      | (remove the control; show nothing)                      |
| All details provided — PMI will verify and connect. | Ready to connect                                        |
| Bailey Placeholder                                  | Open Placeholder _(renamed; `Q-BAILEY` resolved)_       |
| KB-owned process space                              | Process space                                           |
| Read-only source space                              | Source space                                            |
| Sample / persistent Test / simulation-only          | (remove from product; keep fixtures in automated tests) |
| production_allowed / Registry eligible              | Available / Review connection                           |
| raw reconciliation                                  | Compare sources                                         |
| bodyless receipt                                    | Activity record                                         |
| Final-V1 external execution                         | Provider action                                         |
| Test environment (operator copy)                    | Local rehearsal                                         |
| live/test mode selector in Production               | (remove; Production is Live-only)                       |
| the exception and control plane                     | (say what it reads/writes/checks)                       |
| PMI handles the setup for you                       | the app stores the credentials and checks it            |
| Rentvine (read-authoritative)                       | RentVine _(display seam; internal id unchanged)_        |

The "Bailey Placeholder" source state is renamed to "Open Placeholder" (`Q-BAILEY` resolved; see `docs/facts.md` `F-OPEN-PLACEHOLDER`).

Technical values remain available in Connections/Admin Advanced diagnostics; this lexicon governs
daily operator, Vendor, and resident surfaces. `Test` is reserved for engineering verification.
