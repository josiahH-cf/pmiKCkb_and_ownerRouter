# S4 — Maintenance work-order intake (field worker → owner)

**Goal.** Let a field worker report maintenance from the field — photos/screenshots, voice/speech-to-
text, location→unit matching — authenticated with the PMI account, routed into the owner-email flow,
and made trainable. This is also the documented **first executable write** (RentVine work-order create).

**What it is / how it functions.** A mobile-friendly capture path that authenticates via the PMI
account; accepts a photo + a spoken/typed note; matches a location to a RentVine unit (synced with
RentVine); produces a structured work-order draft; routes a confirmation/notice into a labeled
owner-email folder; and learns from corrections. The Action Registry already seeds
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
- _Assumption:_ "trainable" = correction-capture + golden examples, not autonomous learning.
- _Gate:_ the RentVine work-order create stays `production_allowed:false` until approved per-action.

**Cross-product impacts.** First real SoR write → exercises the approval/Action-Registry machinery;
feeds owner-email routing (S7); shares identity/auth with all connectors; storage choice touches budget.

**Ordered prompt sequence.**

1. _Discovery:_ document the real field→owner maintenance flow and what the owner needs to see.
2. _Discovery:_ confirm RentVine work-order + file API capabilities and unit-lookup endpoints.
3. _Understanding:_ write the storage options doc (A/B/C) + the location→unit matching design.
4. _Understanding:_ design the capture UX (photo + voice/STT + PMI login) and the correction loop.
5. _Build (read/draft only):_ capture + draft a work order and match the unit. Keep photo execution
   unavailable while `production_allowed:false`; retain the Drive adapter and filename/MIME/safe-target preview
   contract for a future approved gate-open slice.
6. _Build:_ route an owner-email notice to a labeled folder (ties into S7).
7. _Decision gate:_ owner approves the per-action write spec.
8. _Build (post-gate):_ enable RentVine work-order create behind approval + preview payload schema.
9. _Context update:_ register capabilities + gates in `docs/facts.md` and the Action Registry.

**Deletion/merge recommendation.** KEEP (net-new, high value, already the planned first write). No merge.
