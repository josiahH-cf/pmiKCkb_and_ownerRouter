# S4 — Maintenance work-order intake (field worker → owner)

**Goal.** Let a field worker report maintenance from the field — photos/screenshots, voice/speech-to-
text, location→unit matching — authenticated with the PMI account, linked to governed owner
communication, and made trainable. This is also the documented **first executable write target**
(RentVine work-order create); that write remains closed.

**What it is / how it functions.** A mobile-friendly capture path that authenticates via the PMI
account; accepts a photo + a spoken/typed note; matches a location to a RentVine unit (synced with
RentVine); produces a structured work-order draft; prepares a source-backed, unsent owner notice from
the ticket; links pertinent replies; and learns from corrections. The Action Registry already seeds
`rentvine.work_order.create/read/update_status` as `production_allowed:false` — execution stays gated.

**2026-07-13 ticket readiness (QA-009).** A blocker-bearing work-order preview remains visible, but Create
is disabled with accessible guidance until a trimmed issue and an explicitly selected verified unit exist.
Editing a draft input invalidates the preview, pending creates are deduplicated, and the route/writer repeat the
strict schema before a Firestore transaction. This remains app-plane bookkeeping only; RentVine create is closed.

**Image/screenshot storage — DECIDED: Google Drive in-boundary (owner 2026-06-29; `Q-MAINT-STORAGE`, `F-MAINT-INTAKE`). The adapter exists, but the executable action remains CLOSED by `google_drive.maintenance_photo.store` (`Needs Permission`, `production_allowed:false`). The UI exposes no file input and the route refuses before body/store work until a future owner-approved gate-open slice. Options considered:**

- **A — Google Drive folder inside the `pmikcmetro.com` boundary** (reuse the Drive connector,
  consistent identity, no new vendor). _(Conservative recommendation.)_
- **B — GCS bucket on `pmi-kc-kb-prod`** (cheap, lifecycle rules, scale-to-zero friendly; new surface +
  access rules).
- **C — RentVine file API attached to the work order** (keeps the photo with the record; but a write
  path → gated until documented/approved).
- _Recommend A now; revisit if volume/retention argues for B. Decide with owner._

**Open questions & assumptions.**

- _Open:_ location→unit matching source of truth and fuzzy-match tolerance (reuse the renewal fuzzy-join?).
- _Open:_ voice/STT provider and where transcription runs (cost + identity boundary).
- _Open:_ when owner notice is required and which system provides the verified owner recipient.
- _Answered 2026-07-14:_ the exact current maintenance-owner generator is approved as v1.0; S24 defines
  value replacement/AI rewrite and exact retention. Runtime authoritative recipient/trigger remains an
  S26 configuration dependency, not an owner-policy question.
- _Answered 2026-07-14:_ S22 defines the external Vendor assigned-ticket portal, one-time setup, TOTP,
  own Gmail/Workspace OAuth, and exact human confirmation; S26 defines every Maintenance V1 action.
- _Assumption:_ "trainable" = correction-capture + golden examples, not autonomous learning.
- _Gate:_ the RentVine work-order create stays `production_allowed:false` until approved per-action.

**Gmail boundary (2026-07-14).** Maintenance-scoped staff may link a targeted Gmail thread only from a
ticket they can access. A linked reply creates deduplicated value-free attention. On-demand analysis may
propose an owner decision or follow-up task as `Needs Review`; it cannot approve cost, select a vendor,
change ticket state, or create/update a RentVine work order. Background processing matches opaque linked
thread IDs only and does not fetch unrelated mail or invoke AI. External vendors remain outside Firebase
staff identity; the HMAC public intake stays the approved outside-reporter path.

**Cross-product impacts.** First real SoR write target exercises the approval/Action-Registry machinery;
workflow-linked owner communication shares identity/auth with other connectors; storage choice touches budget.

**Ordered prompt sequence.**

1. _Discovery:_ document the real field→owner maintenance flow and what the owner needs to see.
2. _Discovery:_ confirm RentVine work-order + file API capabilities and unit-lookup endpoints.
3. _Understanding:_ write the storage options doc (A/B/C) + the location→unit matching design.
4. _Understanding:_ design the capture UX (photo + voice/STT + PMI login) and the correction loop.
5. _Build (read/draft only):_ capture + draft a work order and match the unit. Keep photo execution
   unavailable while `production_allowed:false`; retain the Drive adapter and filename/MIME/safe-target preview
   contract for a future approved gate-open slice.
6. _Build:_ add `gmail.maintenance_owner_notice.draft_create` only after recipient, trigger, template,
   preview, and retention decisions are approved; create an unsent linked draft.
7. _Build:_ create value-free attention for replies on linked owner threads; keep analysis on demand
   and all extracted meaning `Needs Review`.
8. _Decision gate:_ owner approves the per-action RentVine write spec.
9. _Build (post-gate):_ enable RentVine work-order create behind approval + preview payload schema.
10. _Context update:_ register capabilities + gates in `docs/facts.md` and the Action Registry.

**Deletion/merge recommendation.** KEEP (net-new, high value, already the planned first write). No merge.
