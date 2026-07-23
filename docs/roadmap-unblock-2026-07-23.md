# Roadmap Unblock — Full-Suite Build Program (2026-07-23)

> **Authority.** Owner directive 2026-07-23: the product is a **full suite of applications**, not a
> demo with a permanent "next phase" list. Every roadmap gap is to be **built to its external seam**
> or **justified as a permanent NEVER** — no third "deferred indefinitely" state. The owner holds
> admin/Dan approval (distinct from in-app approval gates), holds write access to the tools, and
> authorizes initiating these processes once the app defines how they are done. Recorded as
> `F-ROADMAP-BUILD-AUTHORIZED` in `docs/facts.md`.
>
> This doc is the authoritative **scope + program**. The runner reads it after `docs/facts.md` and
> `docs/loop-state.md`. The per-feature specs it indexes (S28–S39) are the executable detail.

## 1. Why builds kept stopping (root cause)

The ship-to-live grant (`F-SEND-AUTHORIZED`, 2026-07-19) was real but **outvoted by a defer-first
layer that still read as active governance**. Four compounding mechanisms, now fixed (see §6):

1. **Closed aperture.** `AGENTS.md` "Do not build … beyond its product docs" + no feature-suite spec
   existed for any roadmap item → a correct runner refused to build them. The features were invisible
   to the loop, not gated.
2. **Stop-at-the-seam default.** `feature-suites/TEMPLATE.md` and the north-star model default every
   external effect to "Gated — stop here." The loop built the read-only shell + a fake provider and
   halted. This is the literal "always pending" pattern.
3. **Whole-feature deferral on the last inch.** The "named external dependency" pending-escape was
   applied to entire features (RentVine, Dotloop, Sheet write) instead of only the one missing
   endpoint/credential — so 90%-buildable features shipped 0%.
4. **Frozen exclusions + "don't reopen."** The owner-rent exclusion was permanent, and
   `loop-state.md` framed the whole backlog as "owner AM steps," so the loop concluded there was
   nothing to build.

**The decisive audit finding:** for RentVine, LeadSimple, Dotloop, and maintenance, the executor +
the full S25/S26 preview/confirm/receipt/rollback contract are **already built and wired to a fake
provider.** The gap was never "should we ship" — it was a live provider implementation + one external
credential, both of which the old governance told the loop to stop before.

## 2. Scope-of-work matrix (evidence-backed)

Verdict legend: **BUILD** = pure app-plane, loop ships it unattended · **SEAM** = build the live
provider + everything up to one named owner dependency · **NEVER** = justified permanent exclusion.

| #   | Feature (talk-track gap)                   | Current code-state (audited)                                                                                                                          | Verdict                                        | Suite   |
| --- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------- |
| 1   | Market comps / rent data / midpoint        | Zillow deep-_link_ only (`market-links.ts:7`); numbers all typed; no data API; no midpoint; `compsScreenshotRef` is a text URL                        | SEAM                                           | S28     |
| 2   | App suggests/negotiates rent number        | HARD-EXCLUSION today (`F-NEGOTIATION-EXCLUDED`); `draft-safety.ts` fails closed on owner_money                                                        | BUILD (owner opened it — Admin-approval-gated) | S29     |
| 3   | Attach comp screenshots to notice          | text URL placeholder only (`owner-draft.ts:152`)                                                                                                      | BUILD                                          | S28     |
| 4   | RentVine write-back                        | Executor + S25 contract built, **fake provider only** (`providers.ts:385`); gate false (`seed:940`)                                                   | SEAM (owner provides endpoint)                 | S30     |
| 5   | Gmail watch / inbox pickup / follow-up     | Watch route + push handler that links replies & flags attention **built** (`service.ts:749`); not continuously active; no scheduler                   | SEAM (Pub/Sub + Scheduler)                     | S31     |
| 6   | Corrections improve the AI                 | ask_logs has no correction field; a proven human-approved "corrections→proposed rule" loop exists in Gmail triage (`rules.ts:11`)                     | BUILD                                          | S32     |
| 7   | Ask box → start live process               | Ask does answer + safe test-run + capture; cannot start live (`AskForm.tsx`)                                                                          | BUILD                                          | S33     |
| 8   | Dotloop connector + e-signature            | OAuth scaffold + create-loop/upload executor built (fake); **no completion webhook**                                                                  | SEAM (owner OAuth app)                         | S34     |
| 9   | LeadSimple connector                       | Full executor built (fake) (`providers.ts:624`); evidence `Vendor-Confirmation-Required`                                                              | SEAM (API key + vendor confirm)                | S35     |
| 10  | Self-service add/configure a Space         | Intake records + emits provisioning plan; does **not** provision (bills) (`space-request-commands.ts:96`)                                             | SEAM (billing + create identity)               | S36     |
| 11  | Move/add/delete anything (no-code builder) | Content/templates/rules/roles/process-defs editable; **layout/new pages bespoke**                                                                     | BUILD (full builder — owner chose)             | S37     |
| 12  | Maintenance owner-notice go-live           | Draft gate **already open** + executor built, but **no UI route/button** — preview only (`MaintenanceCapture.tsx:161`); send gate false (`seed:1312`) | BUILD (surface draft) + SEAM (send)            | S38     |
| 13  | Feedback emails a ticket                   | In-app queue only; scaffolded transactional-destination unused (`TransactionalDestinationPanel`)                                                      | BUILD (internal auto per Q4)                   | S39     |
| 14  | Budget alerts wording; newer KB models     | 50/90/100 + real kill switch (accurate); model swap is config                                                                                         | BUILD (trivial copy/config)                    | S32/S39 |

## 3. The four governance decisions (owner Q&A, 2026-07-23)

- **D-RENT-SUGGEST (was the one hard-exclusion).** Owner chose **"open behind Admin approval."** The
  app MAY compute a comp-derived _suggested_ rent number, but it enters a draft only after an
  **explicit, per-number Admin approval**; absent comp data still renders `Needs Verification`, never
  a fabricated value; the suggestion always shows its comp sources. **Supersedes**
  `F-NEGOTIATION-EXCLUDED`; amends `Q-GMAIL-AI-EXCLUSIONS` (owner-money opens for the _rent number_
  specifically, Admin-gated). The no-autonomous-send invariant is untouched — a human still sends.
- **D-RENTVINE-ENDPOINT.** Owner will provide the documented RentVine write endpoint; the loop builds
  the live provider + wiring + the gate-flip machinery so activation is a one-line reviewed change
  when the endpoint lands. RentVine write is no longer a permanent defer.
- **D-BUILDER-FULL.** Owner chose the **full no-code page/layout builder** (schema-driven page model +
  renderer + editor). Scoped as a dedicated multi-slice suite (S37).
- **D-AUTOMATION-LINE.** **Auto internal, confirm client-facing.** Automated notifications to staff and
  read-only Gmail-watch auto-renew are permitted; every owner/tenant/vendor-facing send stays
  exact-confirmed by a human. Scheduled auto-creation of _client-facing_ drafts is **not** authorized.

Defaults taken (not overridden): comp data = pluggable provider + RentCast adapter + manual fallback
(no Zillow scraping — ToS); LeadSimple = build to seam; Space provisioning = per-Space cost-confirm.

## 4. Build program — ordered waves

Each suite splits into **Buildable now**, **Seam (build the provider, one owner step to flip)**, and
the named **Owner dependency**. The loop builds every "Buildable now" and every "Seam" up to the
dependency; it never stops a whole feature at the seam.

**Wave 1 — pure app-plane, zero owner dependency (build immediately):**

- **S29** Comp-informed rent suggestion, Admin-approval-gated (D-RENT-SUGGEST). Highest value.
- **S32** KB corrections learning loop + source review-interval/staleness + model-config surface.
- **S33** Ask → action orchestration (route intent → gated action w/ preview/confirm/receipt).
- **S38a** Surface the maintenance owner-notice draft (route + button; executor + gate already exist).
- **S39** Internal transactional notifications + in-app notification center (feedback filed,
  follow-up due) — internal-only auto per D-AUTOMATION-LINE.
- **S28a** Comp data provider abstraction (manual fallback works today) + comp screenshot upload.

**Wave 2 — seam: build the live provider, one named owner step to activate:**

- **S30** RentVine renewal-write activation (owner: endpoint — being provided).
- **S31** Gmail reply-watch continuous activation + operator follow-up (owner: Pub/Sub + Scheduler).
- **S28b** RentCast comp-data adapter (owner: API key).
- **S35** LeadSimple activation (owner: API key + vendor-confirmed contract).
- **S34** Dotloop e-sign activation + completion webhook (owner: OAuth app).
- **S36** Space self-service provisioning behind cost-confirm (owner: billing + create identity).
- **S38b** Maintenance owner-notice send activation (owner: documented S26 owner-mapping evidence).

**Wave 3 — large, multi-slice:**

- **S37** Full no-code page/layout builder (schema-driven page model → renderer → editor → section
  library). Its own program; sequence after Wave 1 lands.

## 5. Irreducible owner-dependency list (the ONLY blockers)

Everything else is code the loop builds. These are the exact one-line steps only the owner can do —
each unblocks a flip, not a feature (the feature is built to the seam regardless):

1. **RentVine** documented renewal-write endpoint + semantics → flips S30. _(owner providing)_
2. **RentCast** (or chosen) comp-data API key → activates the S28 live adapter.
3. **Gmail watch** Pub/Sub topic + Cloud Scheduler auto-renew (read-only) → S31 continuous.
4. **Sheets WRITE scope** on the `lease-renewal-reader` SA's DWD grant → Sheet write-back live proof.
5. **LeadSimple** admin-enabled REST API key + vendor-confirmed endpoint contract → S35.
6. **Dotloop** OAuth app registration + `DOTLOOP_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI` + authorize → S34.
7. **Space provisioning** billing approval + a service identity permitted to create Discovery Engine
   data stores → S36.
8. **Maintenance send** documented S26 owner-mapping/exact-confirmation evidence → S38b flip.
9. **Budget kill-switch** live arming: run `npm run killswitch:plan` as `josiah@pmikcmetro.com`
   (create topic, SA + `roles/billing.projectManager`, deploy fn, create the $10 budget w/ 50/90/100
   thresholds, connect topic in Console).
10. **Per-session** `npm run auth:session` (ADC reauth) + owner-run `npm run deploy`.

## 6. The new operating rule: build to the seam

Replaces the defer-first posture. The runner MUST, for every roadmap suite:

1. Build the app-plane + the live provider implementation + the full S25/S26 preview/confirm/
   receipt/rollback contract + the Test-lane proof.
2. Stop **only** at the single irreducible owner dependency from §5, named exactly, and record it as a
   one-line owner step — never as "feature deferred."
3. Never wire a permanent fake and halt. A fake provider is a scaffold to be replaced, not a stopping
   point.

**Gate-flip recipe** (the last inch, a routine reviewed change): set the seed entry
`readiness:"Approved for Execution"` + `evidence_status:"Documented"` (the owner dependency IS the
documentation) + `production_allowed:true`, add the key to **both** `EXECUTABLE_ALLOWLIST` copies
(`scripts/seed-action-registry.ts` and `lib/admin/migration-readiness.ts`), and update the pinned
tests (`action-registry-schema.test.ts`, `seed-action-registry-allowlist.test.ts`).

## 7. What stays NEVER (justified permanent exclusions — safety, not scope)

These are **not** deferrals; they are the hard invariants the owner's grant explicitly preserves:

- **No autonomous client-facing send.** Every owner/tenant/vendor send is human-initiated and
  exact-confirmed against a payload hash. (Internal staff notifications may auto-send — D-AUTOMATION-LINE.)
- **Generic non-workflow "blast" compose/send** (`gmail.message.send`) stays Registry-closed.
- **Personal `josiah.abernathy@gmail.com`** never enters any auth path.
- **No secrets / customer PII / guessed provider endpoints in git or evidence.**
- **~$10 total cost ceiling**, enforced by the real billing kill switch.
- **Every live external effect** stays target-labeled, one-attempt, idempotent, receipted,
  reconcilable, monitored, and reversible; every client-facing send OR system-of-record write is
  additionally **human-confirmed** (internal-staff notifications and read-only ops may auto-run per
  `D-AUTOMATION-LINE`).
- **Multi-tenancy / reusable-platform** remains out of scope (single-Workspace build).

## 8. Definition of done for this program

A suite is done when its Buildable-now slices ship live, its Seam slices are built to the named owner
dependency (flip is one reviewed change), the pinned gate/schema tests are green, `docs/facts.md`
carries its `F-*` row citing the `AC-` ids, and `docs/loop-state.md` points at the next suite. The
program is done when every row in §2 is BUILD-shipped or SEAM-to-owner-step, and §5 is the complete
remaining list.
