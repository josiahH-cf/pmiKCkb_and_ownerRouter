# PMI KC meeting-readiness human litmus — 2026-08-26

This is the consolidated human-verification checklist, reconciled to the 2026-08-27 ship candidate.
Model verdicts are evidence only. Human verdicts intentionally remain blank until the owner performs
the checks; each must include a real date and short observation. Never infer a human PASS.

### Safe RentVine renewal preview

**If this was built correctly:** An Admin can inspect the exact lease and existing recurring-charge
updates the app would propose, while the screen clearly says that the preview cannot change RentVine.

- Model verdict: PASS - The allowlisted client constructs only the two restricted POST routes. The
  preview contains exact request and rollback payloads, carries `executionAllowed:false`, and its
  provider throws on every execute attempt. The production RentVine write key remains closed.
- Human verdict (YYYY-MM-DD, owner): PASS | FAIL - observation:

### Rehearsal spreadsheet connection

**If this was built correctly:** Admin shows separate links for the operating renewal Sheet and its
rehearsal copy, refuses to treat the operating Sheet as the copy, and a confirmed copy-only probe
writes a synthetic marker, reads it back, removes it, and confirms the cell is restored.

- Model verdict: PASS - Admin canonicalizes and saves a distinct rehearsal URL/id without running a
  proof. Deterministic tests refuse an operating-Sheet alias and prove blank-cell compare-and-set,
  readback, exact clear, and final blank restoration against a fake copy. No actual copy id is
  configured, so the operational round-trip correctly remains unavailable.
- Human verdict (YYYY-MM-DD, owner): PASS | FAIL - observation:

### Dual-source discrepancy language

**If this was built correctly:** A nontechnical teammate can tell whether RentVine and the Sheet
agree, disagree, contain only one side, are both missing, use intentionally different meanings, are
stale, or cannot be matched to one lease—and the examples reveal no client values.

- Model verdict: PASS - All eight states are represented by one shared classifier and rendered with
  value-free examples plus a plain-language next step. An append-only disposition records source,
  reason, evidence, owner, and status without changing either source.
- Human verdict (YYYY-MM-DD, owner): PASS | FAIL - observation:

### Honest current-rent confidence

**If this was built correctly:** A rent involved in an open conflict or an expired read never wears a
Verified badge in the renewal workspace or owner draft; a fresh agreement does, with its read date.

- Model verdict: PASS - The owner-draft path now loads fresh canonical RentVine-versus-Sheet evidence
  and an exact record-specific resolution. Agreement or a current resolution can verify; conflict,
  missing, stale, expired, or unavailable evidence fails closed to Needs Verification.
- Human verdict (YYYY-MM-DD, owner): PASS | FAIL - observation:

### Human-friendly currency entry

**If this was built correctly:** A teammate may type a rent as `$1,500.25` or `1500`, sees invalid
formatting rejected, and the recorded amount is the same numeric value they entered.

- Model verdict: PASS - Shared parsing accepts `$1,500.25` and `1500` as the same intended numeric
  value and rejects malformed grouping, text, and negative amounts before submission.
- Human verdict (YYYY-MM-DD, owner): PASS | FAIL - observation:

### Work details and materials

**If this was built correctly:** When assigning work, a teammate can record the job location,
materials still needed, and materials already bought, then see those details on the task card.

- Model verdict: PASS - Job location, materials needed, and materials bought persist through the
  work-accountability store and render back on the task card; validation and round-trip tests pass.
- Human verdict (YYYY-MM-DD, owner): PASS | FAIL - observation:

### Clear product navigation and build identity

**If this was built correctly:** The unbacked Workflow Communications compatibility tile is absent
from Spaces, and the deployed app exposes a bodyless version response that identifies the exact
commit and Cloud Run revision without exposing configuration or secrets.

- Model verdict: PASS - Directory filtering hides the compatibility-only Space, `/api/version`
  returns only commit/revision/service/environment with `no-store`, and the release smoke refuses a
  candidate unless both its commit and revision match exactly. The final production commit/revision
  will be recorded after promotion.
- Human verdict (YYYY-MM-DD, owner): PASS | FAIL - observation:

### Client action center and meeting agenda

**If this was built correctly:** The client receives one plain-language action page with working
links, owners, inputs, test steps, and blockers; the presenter has a separate one-page agenda that
can be followed top to bottom during the meeting.

- Model verdict: PASS - Both self-contained HTML files exist, pass the client-copy and redaction
  gates, use working in-app and document links, and separate client actions from the presenter flow.
- Human verdict (YYYY-MM-DD, owner): PASS | FAIL - observation:
