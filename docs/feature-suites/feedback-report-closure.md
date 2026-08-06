<!-- spec-shape: overhaul-v1 -->

# S65 — Feedback report closure

> New 2026-08-06. Owner direction (N4): "Implement a way to close or resolve feedback reports so that
> completed items do not remain permanently categorized as past follow-up." Sized deliberately small
> and sequenced before the first-operator training, because that training is when report volume
> starts.
>
> **Authorization basis.** This suite is **outside** the four scope items of the Renewal Proof
> Program Authorization in `AGENTS.md` (test set, RentCast, recipients, owner-policy rules). It is
> authorized narrowly and independently by the owner's direct N4 instruction, and it is named as
> admissible in the Build-to-Seam Gate for that reason. It may interleave whenever no S57–S63 slice
> is mid-flight; it is never a reason to pause one.

**Goal.** A feedback report can be finished. Today one can be filed and never closed, so the Admin
badge only ever grows and the follow-up signal becomes noise within a day of first use.

**What it is / how it functions.** The filing path is complete and works. `SupportReportStatus` is
already typed `new | acknowledged | resolved`, every report is created as `new`, and **no code path
anywhere ever updates that field**. Combined with the follow-up rule — a `new` report older than one
day, or an `acknowledged` report older than three days, is past its follow-up window — every report
ever filed becomes permanently overdue. The Admin panel is read-only and the notifications lane shows
value-free counts.

- **The transition, and nothing more.** An Admin moves a report between the three states that already
  exist. No new status values, no assignment, no comment thread, no reply-to-reporter. The type
  already models this; only the write path is missing.
- **Audited like every other Admin action.** The transition appends a record with the actor, the
  previous and new status, a timestamp, and an optional short note. This matches the existing
  append-only Admin audit convention rather than introducing a second style.
- **The counts follow the status.** The badge and the notifications lane count only reports that are
  not `resolved`, so closing one is visible immediately.
- **Retention is unchanged.** Reports remain retained indefinitely under the D15 product-record
  retention policy with its legal-hold flag. Closing a report is a status change, never a deletion.
- **Admin-only, unchanged.** `listSupportReports` already refuses non-Admins and the collection is
  deny-all for browser clients, falling through to the catch-all rule. This suite does not widen who
  can see feedback.

Buildable now (app-plane): all of it. Build to the seam (live provider): none. Owner dependency (the
one flip): none.

**Open questions & assumptions.**

- _Assumption:_ the existing three states are sufficient. A "won't fix" outcome is expressible as
  `resolved` with a note, which avoids a schema change for a distinction nobody has asked for.
- _Assumption:_ the one-day and three-day follow-up thresholds stay as they are. They become useful
  rather than noisy once closure exists, which is the actual fix.
- _Open:_ whether a reporter should be told their report was resolved. Default taken: no. Any such
  message would be a new send path and is out of scope here.

**Cross-product impacts.**

- `lib/firestore/` support-report store — the status transition and its audit record.
- The Admin feedback panel — the control.
- `lib/attention/support-lane.ts` — counts exclude `resolved`.
- Interacts with **S39** (`internal-notifications.md`), whose internal auto-notice on filing is
  unchanged.
- `docs/pmi-kc-current-app-walkthrough.html` — stale copy: it calls the control "Report an issue"
  and the Admin surface the "Admin Feedback center", while the shipped UI says "Feedback" for both.
  Correct it here, because training material generated from that file would name a control that does
  not exist.

**Adversarial acceptance checks.**

- **AC-S65-1** — An Admin moves a report from `new` to `acknowledged` to `resolved`, and the status
  persists across a reload. Before this suite no transition is possible. _Verify:_
  `npm test -- support-reports`.
- **AC-S65-2** — A non-Admin attempting a transition is refused and the status is unchanged.
  _Verify:_ `npm test -- support-reports`.
- **AC-S65-3** — Every transition appends an audit record naming the actor and both statuses.
  _Verify:_ `npm test -- support-reports`.
- **AC-S65-4** — The Admin badge and the notifications lane exclude `resolved` reports, so closing
  one decrements the count. _Verify:_ `npm test -- support-lane`.
- **AC-S65-5** — A `resolved` report is never counted as past its follow-up window. _Verify:_
  `npm test -- support-lane`.
- **AC-S65-6** — No transition deletes a report or alters its retention class. _Verify:_
  `npm test -- support-reports`.

Keep green: `feature-suite-spec-shape.test.mjs`, `npm run verify:context-freshness`.

**Forbidden actions / hard gates.** No autonomous client-facing send; generic non-workflow
`gmail.message.send` stays Registry-closed; no personal account in any auth path; no secret, token,
PII, or guessed endpoint in git; the S52 production cost ceiling stands. This suite must not notify a
reporter, must not widen who can read feedback, must not delete a report or change its retention
class, and must not add a status value beyond the three already typed.

**Ordered prompt sequence.**

1. _Discovery:_ confirm `SupportReportStatus` values and that no write path sets them.
2. _Build:_ the Admin-only transition with its append-only audit.
3. _Build:_ the Admin panel control.
4. _Build:_ exclude `resolved` from the badge and the follow-up computation.
5. _Verify:_ full gate including `test:firestore`.
6. _Context update:_ `docs/facts.md` `F-` row citing AC-S65-1 through AC-S65-6; update
   `docs/loop-state.md` and `docs/status.md`.

**Deletion/merge recommendation.** MERGE into S39 once both have shipped; until then KEEP, because
S39's scope is internal notification delivery rather than report lifecycle. The disposable cycle packet `docs/temp/feedback-report-closure-plan.md` is CREATED AT SLICE START, not by this spec.
