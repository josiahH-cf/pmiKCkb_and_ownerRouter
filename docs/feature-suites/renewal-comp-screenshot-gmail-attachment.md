<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-stabilization-v2 -->

# S79 — Renewal comp screenshot Gmail attachment

> Status: Active but gate-blocked; screenshot preview/store/receipt/rollback exists behind a closed
> Drive action, while renewal Gmail drafts currently carry only a textual screenshot reference.

**Goal.**

When the exact screenshot action is separately authorized, bind one reviewed, receipted comp image to
the exact owner preview and create an unsent Gmail draft containing that image as an attachment.

**Current state / intended end state.**

The app can validate, exact-preview, store, reconcile, and roll back a renewal screenshot through
`google_drive.renewal_comp_screenshot.store`, but the key is closed. The progress record can retain a
receipted Drive reference. Owner copy renders that reference as text, and Gmail's outgoing draft MIME
is text-only. Existing exact-Message-ID draft reconciliation returns draft identity, not decoded MIME
or attachment proof. The intended state retrieves only the exact current receipted file, binds its
content hash/metadata into the renewal preview, writes standards-compliant multipart MIME, and reads
back the exact created draft strongly enough to verify the bound attachment without exposing a
general attachment or Drive-file primitive.

**Actors and entry conditions.**

A Renewals-space Editor or stronger role selects one JPEG, PNG, WebP, or HEIC image no larger than the
existing 5 MiB limit. Storage requires the exact Drive key to be executable, the configured in-
boundary folder, a managed identity, exact preview/confirmation, and a current lease. Draft creation
also requires S77 readiness, a current successful screenshot receipt, and the open renewal-draft key.

**What it is / how it functions.**

The existing upload execution owns file identity. A later owner preview resolves the current receipt
server-side, reads only that app-created Drive file, verifies filename/MIME/size/content hash against
the receipt, and adds immutable attachment metadata to the preview hash. Confirmation builds
`multipart/mixed` MIME with the governed text body first and one base64 attachment. A deterministic
local decoder proves the raw payload contains byte-identical content before provider construction.
Post-create verification must retrieve the exact draft by the created draft id and bound RFC
Message-ID, decode the provider-returned MIME, and verify filename/MIME/size/content hash; an identity-
only lookup is insufficient, and inability to verify remains needs-reconciliation rather than success.

**In scope / out of scope.**

In scope: exact receipt resolution, Drive readback of the receipted file, outgoing multipart MIME,
preview binding, create/readback/reconciliation, rollback messaging, and one attachment. Out of scope:
inline images, arbitrary user-selected Drive ids/URLs, multiple attachments, general Gmail compose,
action-key activation, sending, or automatic screenshot capture.

**Open questions & assumptions.**

The owner chose a normal Gmail attachment rather than inline rendering. The existing 5 MiB/type
limits remain authoritative. Opening the Drive key still requires a separate protected-path review;
this suite must be fully testable in its closed/refusal state without that activation.

**Cross-product impacts.**

Screenshot execution/receipt stores, renewal progress, owner-draft artifacts, S77 preview/confirm,
Gmail raw-message/client/provider/readback, Drive DWD health, Action Registry readiness, and rollback.

**Authority and evidence map.**

| Input                                                                                                                                       | Classification                | Use and limitation                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md` action/protected-path/data boundaries and `docs/facts.md` action inventory                                                      | Authority                     | The Drive store key remains closed, Gmail renewal draft creation is unsent-only, and no gate activation or customer bytes may enter Git/logs.                                       |
| Screenshot contract/service/execution/receipt/Drive provider, attachment resolver, renewal draft builder, Gmail raw-message/client/provider | Verified implementation truth | Receipt-bound upload/rollback exists and text-only raw draft creation works; exact draft lookup proves identity only, so MIME attachment creation and content readback are missing. |
| Screenshot, folder-boundary, Drive-provider, draft-service, Gmail-client/MIME, live-provider, reconciliation, and send-boundary tests       | Verification baseline         | They preserve narrow file ownership/idempotency/text compatibility; new byte-level MIME and exact provider-readback checks must fail first.                                         |
| Stabilization intake and meeting record                                                                                                     | Intent evidence only          | They establish that the reviewed comp screenshot should appear in the owner draft; they do not authorize automatic capture, arbitrary Drive access, upload activation, or sending.  |
| Separate owner direction for the exact Drive key/live upload                                                                                | External authority            | Its absence blocks the live upload/draft litmus, not the receipt/MIME/readback/refusal implementation.                                                                              |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S79-1** — The attachment data path accepts only a current screenshot execution/receipt owned
  by the same Space/lease and verifies file id, MIME, size, filename, and content hash server-side.
- **ARCH-S79-2** — One deterministic MIME check decodes the exact raw Gmail payload and proves a
  review banner text part plus one allowlisted attachment with byte-identical content and safe headers.
- **ARCH-S79-3** — Preview hash, execution payload, Gmail readback, and reconciliation all contain the
  same attachment identity; a changed/rolled-back/stale receipt invalidates confirmation.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S79-1** — The owner preview shows filename, type, size, and an understandable attachment label;
  confirming it creates one unsent draft with the exact image attached.
- **BEH-S79-2** — Closed/suspended Drive authority, invalid file, forged reference, wrong lease/Space,
  missing bytes, hash mismatch, changed receipt, or provider uncertainty creates no draft and reports
  the exact recovery state.
- **BEH-S79-3** — Removing the Drive file after a Gmail draft exists never claims to remove the embedded
  Gmail attachment; it invalidates future previews and states the two effects separately.

**Human litmus outcome.**

### Attach the reviewed comp screenshot

**If this was built correctly:** The owner-message preview names the selected screenshot, and the one
unsent Gmail draft contains that exact image as an ordinary attachment. A failed or uncertain upload
does not produce a draft or pretend the image is present.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

**Requirement-to-outcome traceability.**

| Requirement                                                                 | Architecture outcome | Behavior outcome         | Human litmus                                                   | Deterministic evidence / falsification                                                                                                                  |
| --------------------------------------------------------------------------- | -------------------- | ------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Only the current same-lease/Space receipt can supply bytes                  | `ARCH-S79-1`         | `BEH-S79-2`              | Attach the reviewed comp screenshot                            | Forged id/URL, wrong lease/Space, stale/rolled-back receipt, metadata/hash mismatch, and missing-byte fixtures all stop before Gmail.                   |
| Gmail MIME contains exactly one safe byte-identical image                   | `ARCH-S79-2`         | `BEH-S79-1`              | One unsent draft shows the named image as an attachment        | Raw payload is decoded and asserted for banner text, boundaries, transfer encoding, safe headers, MIME/type/size/name, exact bytes, and no second part. |
| Preview, execution, provider readback, and reconciliation bind one identity | `ARCH-S79-3`         | `BEH-S79-1`, `BEH-S79-2` | Confirmed preview matches the retrieved draft                  | Exact draft-id/RFC lookup plus decoded provider MIME must match the preview hash; identity-only or uncertain readback cannot pass.                      |
| Drive rollback and Gmail draft effects remain independent                   | `ARCH-S79-3`         | `BEH-S79-3`              | Removing source does not claim to edit an existing Gmail draft | State tests prove rollback invalidates future preview while preserving an honest immutable existing-draft receipt.                                      |

**Preservation set.**

Existing screenshot preview/confirm/idempotency/reconciliation/rollback tests, Drive folder/identity
restrictions, Gmail text-draft compatibility, S77 one-attempt behavior, message banner/recipient
checks, and renewal send-boundary checks remain green separately.

**Adversarial acceptance checks.**

- **AC-S79-1** — `ARCH-S79-1` proves arbitrary Drive ids, URLs, client-supplied refs, and cross-lease
  receipts cannot reach MIME construction.
- **AC-S79-2** — `ARCH-S79-2` proves decoded MIME contains the exact bytes and safe headers, not merely
  a textual reference or mocked attachment object.
- **AC-S79-3** — `ARCH-S79-3` and `BEH-S79-2` prove stale confirmation and ambiguous effects cannot
  duplicate or mislabel a draft.
- **AC-S79-4** — Closed production authority refuses before Drive/Gmail provider construction; the
  suite does not flip `production_allowed`.
- **AC-S79-5** — Existing text-only callers remain byte-compatible unless they opt into the narrow
  governed attachment input.

**Forbidden actions / hard gates.**

No action-key opening, general attachment API, arbitrary Drive access, attachment body/log/Git
storage, HTML/inline tracking content, automatic capture, Gmail send, or synthetic production file.

**Dependencies / sequencing.**

Its receipt/MIME/refusal behavior is independently implementable against S77's documented contract
with deterministic fixtures. When running the full bundle, integrate after S77's exact preview
lifecycle. It consumes the existing screenshot ledger and can ship behind the closed Drive key.
Separate owner direction is required before any protected gate change or live upload proof.

**Standalone delivery contract.**

- **Deliverable now:** narrow receipt resolver, byte verification, multipart encoder, exact preview
  binding, exact provider draft readback/decoder, reconciliation/refusal states, text-caller
  compatibility, malicious-input tests, and closed-key behavior can reach `ALL_GATES_GREEN` using
  deterministic Drive/Gmail fixtures.
- **Consumes, but does not assume:** S77 supplies the final shared confirmation state; an adapter can
  bind the documented execution/hash contract without opening Drive or creating a general attachment
  API.
- **Externally blocked effect:** AC-S79-4 and the live human litmus remain `BLOCKED` until separate
  owner direction authorizes the protected exact Drive key and one bounded live file/draft proof.
  Implementation must ship closed and must not flip `production_allowed`.
- **Produces for downstream suites:** one receipt-bound attachment input, byte-level MIME/readback
  proof, preview fingerprint fields, and honest rollback/reconciliation outcomes.

**Verification and delivery contract.**

1. Before editing, prove text-only output and identity-only reconciliation, then make receipt-bound
   multipart and provider-content-readback tests fail for those exact missing behaviors; freeze
   screenshot and text-caller preservation.
2. Run `npm run test:direct -- tests/unit/renewal-comp-screenshot-contract.test.ts tests/unit/renewal-comp-screenshot-service.test.ts tests/unit/renewal-comp-screenshot-drive-provider.test.ts tests/unit/gmail-runtime-mime.test.ts tests/unit/gmail-runtime-client.test.ts tests/unit/live-renewal-draft-provider.test.ts tests/unit/lease-renewal-send-boundary.test.ts` plus new attachment integration tests.
3. Run `bash scripts/verify.sh`, inspect the diff/protected paths, and audit attachment bytes/names,
   client data, Drive folder/file scope, Gmail scopes/endpoints, action keys, HTML/tracking content,
   retries, logs, and text-only compatibility.
4. Report `ALL_GATES_GREEN` for the closed-key implementation; `BUDGET_EXHAUSTED` requires an explicit
   budget. Report `BLOCKED` only for the separately authorized live upload/draft proof, and never call
   identity-only lookup or draft creation attachment verification.

**Ordered prompt sequence.**

1. Prove the current text-only draft and closed-key behavior, then add failing receipt/MIME checks.
2. Freeze screenshot, Gmail compatibility, identity, rollback, and send-boundary preservation.
3. Implement receipt-bound download, multipart encoding, exact preview/readback, and recovery states.
4. Run malicious filename/MIME/size/hash/cross-tenant cases and the canonical gate; do not activate
   the Drive key in this suite.

**Deletion/merge recommendation.**

Remove after attachment behavior is deployed and, if separately authorized, one bounded live draft
proof plus rollback/readback is recorded in current facts.
