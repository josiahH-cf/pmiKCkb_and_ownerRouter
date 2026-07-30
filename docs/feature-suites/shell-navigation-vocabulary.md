<!-- spec-shape: overhaul-v1 -->

# S41 — Role-aware shell, navigation, and operator vocabulary

> New 2026-07-28. Implements D-02, D-04, and D-14; consumes S40’s environment vocabulary.
> Amended 2026-07-29 for the live production phase. Adds D63 (Safari/iPhone voice dictation, an
> owner-changed decision folded into the mobile shell) and the verified accessibility finding that
> no authenticated internal page emits a `<main>` landmark.

**Goal.** An internal operator immediately sees where daily work lives without scrolling through
setup and diagnostics. Console, Renewals, Maintenance, and Approvals are the four daily
destinations; Spaces remains a first-class knowledge destination; role-appropriate utilities live
under a compact More/account area. Phone navigation consumes little vertical space, Feedback never
covers a task, and daily copy describes the work rather than the implementation.

**What it is / how it functions.**

- **Information hierarchy.** Treat the four daily destinations as one `Work` group. Treat Spaces as
  a separate, persistent primary `Knowledge` destination—not an Admin catalog and not a fifth daily
  queue. Notifications is an icon/badge that opens event history. Communications, Connections, and
  Admin appear in a role-aware More/utility area.
- **Desktop shell.** Show the product/environment identity, the four daily links, visibly separated
  Spaces, Notifications, and the account/More control without wrapping at supported desktop widths.
  Current location uses both visual and semantic state. Long role/environment labels do not push
  actions to another row.
- **Mobile shell.** At 390×844, render a compact header plus four daily shortcuts and one disclosure,
  or an equivalent pattern that leaves the first task control above the fold. Spaces is the first
  non-daily primary destination in the disclosure. Notifications/account/role-aware utilities are
  reachable within one disclosure, keyboard and screen-reader operable, focus-trapped while open,
  and restored to the trigger on close.
- **Role and scope filtering.** Internal Editors/Approvers/Admins see only destinations allowed by
  capability and Space scope. Connections and Admin remain Admin-only. Communications appears only
  for a workflow/mailbox-authorized internal user. A Vendor never receives the internal shell and
  remains in the assigned-ticket portal.
- **Feedback placement.** Remove the fixed control from task content on narrow screens or reserve
  measured safe space. Mobile Feedback belongs in the utility disclosure unless an equivalent
  non-overlapping treatment is proven.
- **Plain-language map.** Operator surfaces say `Compare sources`, `Needs decision`,
  `Ready to send`, `Sent`, `Source unavailable`, `Open RentVine`, `Demo environment`, and
  `Production`. Registry keys, `production_allowed`, readiness enums, “raw reconciliation,”
  “bodyless,” “persistent Test,” and “Final-V1 external execution” live only in expandable
  Connections/Admin diagnostics.
- **Document landmark — `components/layout/AppShell.tsx`.** Verified current state: `AppShell`
  renders `<div className="page">` containing `<header className="topbar">` and then `{children}`
  directly. Nothing in the authenticated tree emits `<main>` or `role="main"`; the only `<main>`
  elements in the product are `app/sign-in/page.tsx`, `app/vendor/sign-in/page.tsx`,
  `app/vendor/tickets/[ticketId]/page.tsx`, `components/vendor/VendorPortal.tsx`, and
  `app/global-error.tsx`, none of which is an authenticated internal page. A screen-reader user
  therefore has no landmark to jump to, and no skip-link proposal has a target to point at. The fix
  is one `<main>` with a stable id emitted by `AppShell` around `{children}`, plus a skip control
  that is the first focusable element in the document and moves focus into that element. Exactly one
  `main` landmark per page: page-level components must not add a second, and the existing fixtures in
  `tests/unit/app-shell.test.tsx` that pass `<main>Console</main>` and `<main>Maintenance home</main>`
  as children have to become non-landmark children or the one-landmark assertion is false.
- **Voice dictation on Safari and iPhone (D63) — `components/hooks/useAudioRecorder.ts`.** The cause
  is determinate from the code and is not a permission, network, or microphone problem.
  `PREFERRED_MIME_TYPES` lists only `audio/webm;codecs=opus`, `audio/webm`, `audio/ogg;codecs=opus`,
  and `audio/ogg`. `negotiateMimeType()` walks that list through `MediaRecorder.isTypeSupported`,
  and when none matches it probes `audio/mp4`/`audio/aac` and returns
  `{ supportedType: null, mp4Only: true }`. iOS Safari offers no WebM or Ogg Opus recorder type, so
  `toggleRecording()` takes the `if (!support.supportedType)` branch, transitions to `"error"`, and
  emits `RECORDER_MESSAGES.mp4Only` **before `getUserMedia` is ever called**. Dictation is refused at
  the negotiation step, which is why both callers — `components/ask/AskForm.tsx` and
  `components/maintenance/MaintenanceCapture.tsx` — are dead on Safari and iPhone.
- **The same gap exists a second time on the server.** `encodingForMime()` in
  `lib/speech/stt-provider.ts` maps webm to `WEBM_OPUS`, ogg to `OGG_OPUS`, flac to `FLAC`, and
  returns `undefined` for anything else, so an MP4/AAC payload would reach
  `https://speech.googleapis.com/v1/speech:recognize` with no `encoding` field.
  `tests/unit/stt-provider.test.ts` already pins the consequence: an `audio/mp4` request that draws
  `INVALID_ARGUMENT` classifies as `SpeechSetupError` with `code: "encoding"`, which both
  `app/api/ask/transcribe/route.ts` and `app/api/maintenance/transcribe/route.ts` return as HTTP 503.
  Removing only the client-side refusal would move the failure, not fix it.
- **Selected remedy path, and the one thing that is not yet proven.** The repository already proves a
  format this provider accepts end to end: `scripts/smoke-transcribe-live.mjs` posts the committed
  `scripts/fixtures/synthetic-speech.wav` with `mimeType: "audio/wav"` and requires HTTP 200, and
  `encodingForMime()` deliberately returns `undefined` for WAV so the API reads rate and encoding from
  the RIFF header. Path A is therefore to keep the server untouched and change what Safari produces:
  when `negotiateMimeType()` reports `mp4Only`, capture through the Web Audio graph (`AudioContext`
  plus an `AudioWorkletNode`, with a `ScriptProcessorNode` fallback) instead of `MediaRecorder`,
  downmix to 16 kHz mono, and hand `onRecording` a RIFF/WAV blob typed `audio/wav`. Path A adds no
  dependency, no endpoint, no scope, and no new cost surface. What the code cannot tell us is whether
  iOS Safari sustains that capture under the app's real conditions — the `AudioContext` must be
  created and resumed inside the user gesture, and iOS suspends it on interruption. Slice 1 is a
  bounded discovery that answers exactly that on a physical iPhone. Path B (make the server accept
  what iOS produces, via a decoding step or a different recognizer endpoint) is taken **only** if
  Path A is falsified, because it adds a dependency or an external endpoint and therefore a cost and
  owner review that Path A does not.
- **Honest interim state.** Until the selected path is verified, `RECORDER_MESSAGES.mp4Only` stays
  exactly as honest as it is today. It is replaced by working capture, never by a softer message that
  implies dictation works when it does not.
- **Buildable now (app-plane).** Shared navigation model, role/scope filter, desktop/mobile shell,
  focus behavior, Feedback relocation, route labels, copy helpers, responsive tokens, the single
  `<main>` landmark and skip control, the Safari/iPhone capture path behind the existing
  `negotiateMimeType()` seam, and tests. `negotiateMimeType` already takes an injectable `isSupported`
  predicate, so the iOS Safari capability profile is reproducible in unit tests without a device.
- **Build to the seam (live provider).** None. Navigation and vocabulary have no provider effect, and
  the selected dictation path reuses the existing Speech-to-Text seam, endpoint, and cost bounds
  unchanged.
- **Owner dependency (the one flip).** One, and only for D63: a confirmation run on a physical iPhone
  in Safari against the deployed app, because no emulator in this repository is iOS Safari. Everything
  else in this suite ships after automated verification. If that run falsifies Path A, the loop hands
  back the Path B choice (new decoding dependency or recognizer endpoint) rather than adopting it
  unilaterally.

**Open questions & assumptions.**

- _Answered 2026-07-28 (D-02):_ four daily destinations are Console, Renewals, Maintenance, and
  Approvals; utilities are role-aware.
- _Answered 2026-07-28 (D-04):_ Spaces remains primary. “Primary” means a first-class Knowledge
  destination in the IA and persistent desktop shell; on mobile it is pinned first in the compact
  disclosure so the four daily shortcuts remain usable.
- _Answered 2026-07-28 (D-14):_ daily operator copy uses the plain-language map above.
- _Assumption:_ the executor may select bottom navigation, compact tabs, or an equivalent accessible
  mobile pattern after measuring the existing shell; the observable hierarchy and content-height
  requirements are fixed.
- _Answered 2026-07-29 (D63, owner changed the recommendation):_ Safari and iPhone dictation is fixed
  alongside this suite's mobile shell rather than deferred. It is in scope here because the shell owns
  the phone experience and both dictation callers sit inside it.
- _Answered 2026-07-29 (D63 cause):_ the incompatibility is `PREFERRED_MIME_TYPES` in
  `components/hooks/useAudioRecorder.ts` containing no format iOS Safari's `MediaRecorder` can
  produce, compounded by `encodingForMime()` in `lib/speech/stt-provider.ts` having no MP4/AAC branch.
  This is read from the code, not inferred from symptoms.
- _Open:_ whether iOS Safari sustains a Web Audio PCM capture through the app's real gesture and
  interruption behavior is not answerable from this repository, and no iOS device or simulator is
  available to the loop. Slice 1 is a bounded discovery with a stated selection rule between Path A
  and Path B; it is not a licence to guess. Record the outcome as a `Q-`/`A-` row in `docs/facts.md`
  "## Open Questions" when the slice opens.
- _Assumption:_ Path A is preferred because the WAV route through the existing provider is already
  proven by the committed `scripts/fixtures/synthetic-speech.wav` smoke. If discovery falsifies it,
  Path B becomes an owner decision, not an executor one, because it changes the external surface.
- _Answered 2026-07-29 (accessibility finding):_ the missing `<main>` landmark belongs to this suite,
  not to a per-page suite, because `AppShell` is the only component every authenticated internal page
  passes through.
- Decision-complete: no visual-pattern approval is required if all acceptance behavior holds.

**Cross-product impacts.**

- Likely touchpoints include `components/layout/AppShell.tsx`, primary/mobile navigation helpers,
  role/capability route definitions, Feedback, notification badge, and responsive tokens. Exact
  extraction boundaries are executor-owned.
- The landmark and skip control touch `components/layout/AppShell.tsx`, `app/globals.css` (the skip
  control needs a visible-on-focus treatment), and the fixtures in `tests/unit/app-shell.test.tsx`.
  The Vendor surfaces (`components/vendor/VendorPortal.tsx`, `app/vendor/**`) and the unauthenticated
  `app/sign-in/page.tsx` already carry their own `<main>` and must not gain a second one.
- D63 touches `components/hooks/useAudioRecorder.ts` and its two callers,
  `components/ask/AskForm.tsx` and `components/maintenance/MaintenanceCapture.tsx`. It reads but does
  not change `lib/speech/stt-provider.ts`, `lib/config/server.ts` (`SPEECH_PROVIDER`,
  `SPEECH_LANGUAGE_CODE`), `app/api/ask/transcribe/route.ts`,
  `app/api/maintenance/transcribe/route.ts`, or `scripts/smoke-transcribe-live.mjs` under Path A.
  Named tests it must keep green: `tests/unit/use-audio-recorder.test.ts`,
  `tests/unit/use-audio-recorder-lifecycle.test.tsx`, `tests/unit/ask-form.test.tsx`,
  `tests/unit/maintenance-capture.test.tsx`, and `tests/unit/stt-provider.test.ts`.
- All internal routes consume this shell. S42 owns destination contents, S43/S45/S46 own task
  surfaces, and S48 owns the utility destinations.
- Supersedes older S17/S14 coexistence assumptions only where they require all links or duplicate
  views to remain equally primary. Add the applicable Supersede Log marker when code ships.

**Adversarial acceptance checks.**

- **AC-S41-1** — An authorized desktop user sees exactly four items in the Daily work group,
  Spaces as a separately labeled primary Knowledge destination, Notifications, and role-filtered
  utilities; an Editor cannot discover an Admin/Connections href through rendered DOM, keyboard
  navigation, or serialized nav data. _Verify:_ shell and route-auth tests.
- **AC-S41-2** — At 390×844 the shell does not wrap into the task viewport, Feedback covers no
  actionable control, the first task control remains visible without scrolling past navigation, and
  opening/closing the disclosure traps/restores focus correctly. _Verify:_ authenticated mobile
  browser task and overlay-collision assertions.
- **AC-S41-3** — A scoped internal user sees only allowed Renewals/Maintenance/Spaces destinations;
  the external Vendor receives no internal nav model even when its email uses an internal-looking
  domain. _Verify:_ role/scope/identity-class tests.
- **AC-S41-4** — Daily pages contain none of the forbidden engineering terms, while Advanced
  diagnostics retain the exact gate/provider values needed for support. _Verify:_ rendered-copy
  scan plus diagnostics assertions.
- **AC-S41-5** — Active-route semantics, keyboard order, accessible names, escape/outside close,
  heading hierarchy, and 200% zoom remain usable on phone and desktop. _Verify:_ component a11y and
  browser checks.
- **AC-S41-6** — `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`,
  `npm run test:e2e:core`, `npm run verify:spec-traceability`, and `npm run build` pass; keep auth
  boundary, route-link graph, and responsive-shell sentinels green.
- **AC-S41-7** — Every authenticated internal page renders exactly one `<main>` element, contributed
  by `AppShell`, with exactly one `main` landmark in the accessibility tree; the first focusable
  element in the document is a skip control that becomes visible on focus, names its destination, and
  moves focus into that `<main>` when activated; and `app/sign-in/page.tsx`, `app/vendor/sign-in`,
  `app/vendor/tickets/[ticketId]`, and `components/vendor/VendorPortal.tsx` still render exactly one
  `<main>` each rather than two. _Verify:_ `npm test -- tests/unit/app-shell.test.tsx`
  `tests/unit/vendor-sign-in.test.tsx` `tests/unit/sign-in-panel.test.tsx`, plus an authenticated
  landmark and first-Tab assertion in the browser task; keep `tests/unit/page-auth-boundary.test.ts`
  green.
- **AC-S41-8** — Under an injected capability profile that answers `false` for every entry of
  `PREFERRED_MIME_TYPES` and `true` for `audio/mp4` — the iOS Safari profile — pressing the dictation
  control reaches the `recording` phase and, on stop, hands `onRecording` a blob whose type
  `encodingForMime()` resolves without reaching its `undefined` fallthrough.
  `RECORDER_MESSAGES.mp4Only` is emitted by no code path and renders on no surface under that
  profile. Under a profile where no capture route at all is available, the honest unsupported message
  still renders and no recording starts. _Verify:_ `npm test -- tests/unit/use-audio-recorder.test.ts`
  `tests/unit/use-audio-recorder-lifecycle.test.tsx` `tests/unit/ask-form.test.tsx`
  `tests/unit/maintenance-capture.test.tsx`.
- **AC-S41-9** — `POST /api/ask/transcribe` and `POST /api/maintenance/transcribe` answer HTTP 200
  with a string `transcript` for a fixture byte-shaped exactly like the one the iOS path produces, and
  still answer HTTP 503 with `error_code: "encoding"` for a payload the provider cannot decode. A
  failure is never presented to the operator as an empty successful transcript. _Verify:_
  `npm test -- tests/unit/stt-provider.test.ts` plus a route test posting the iOS-shaped fixture;
  owner-run confirmation is `npm run smoke:transcribe-live -- --base-url=<endpoint> --browser-session`
  with that fixture, whose `result.json` must show status 200.
- **AC-S41-10** — On a physical iPhone in Safari, signed in against the deployed app, one dictation on
  the Console question box and one on the Maintenance capture desk each leave the spoken words in the
  text field with no error region rendered, and a second press with the microphone denied renders the
  permission message rather than a silent failure. _Verify:_ a dated manual QA entry recording the
  device, iOS version, both surfaces, and the observed text; this is the suite's one owner-run step.
- **AC-S41-11** — The dictation fix opens no new external surface: the only Speech-to-Text URL in the
  source stays `https://speech.googleapis.com/v1/speech:recognize`, `SPEECH_PROVIDER` still resolves
  to `google` in production and the zero-spend stub elsewhere, both transcribe routes keep their
  8,000,000-character base64 cap and their `content-length` 413 pre-check, and no audio blob or
  base64 payload is written to Firestore, storage, or logs. _Verify:_
  `npm test -- tests/unit/stt-provider.test.ts` `tests/unit/server-config.test.ts`;
  `npm run verify:redaction`; `npm run verify:copy-voice`.

**Forbidden actions / hard gates.** Do not weaken server authorization because a link is hidden.
Do not expose internal nav to any Vendor identity. Do not fork the product shell by environment
beyond labels/effect-safe context. Do not use a browser flag for environment or role. No external
send/write, Action Registry change, credential, or new scope belongs here. Preserve managed
identity, no secrets/PII, no autonomous CLIENT-facing send (internal-staff notification auto-send is
permitted per `D-AUTOMATION-LINE`), generic non-workflow `gmail.message.send` staying Registry-closed,
no personal account in any auth path, no secret, PII, or guessed endpoint in git, every live effect
one-attempt, idempotent, receipted, and reversible, and every client-facing send or system-of-record
write staying human-confirmed. Live effects stay inside the production cost ceiling defined by S52.
D63-specific stops: never soften `RECORDER_MESSAGES.mp4Only` into copy that implies dictation works
while the capture path is still refused; never persist, log, or forward a captured audio blob or its
base64 payload anywhere; never raise or bypass the transcribe routes' size cap, their `edit`
capability guard, or the maintenance route's space guard to make a longer clip fit; never add a
second Speech-to-Text endpoint, recognizer version, transcoding dependency, or cloud scope inside
this suite — that is Path B and it returns to the owner as a decision. A transcript only fills a text
field; it never triggers an action, a draft, or a send. Landmark-specific stop: adding `<main>` must
not remove or duplicate the Vendor or sign-in landmarks, and the skip control must not become a
focusable element that traps or reorders the existing keyboard path.

**Ordered prompt sequence.**

1. _Discovery:_ inventory shell/nav/Feedback/notification/role/scope code and measure desktop plus
   390×844 header height, wrapping, focus order, and first actionable control on every primary route.
2. _Understanding:_ write one route-to-group/role/scope table and one old-copy-to-new-copy map;
   identify which strings must remain in Advanced diagnostics.
3. _Build:_ create one shared navigation model and render the desktop and mobile treatments with
   role/scope filters, Spaces hierarchy, notification state, account utilities, and Feedback safety.
4. _Build:_ replace daily engineering copy across the shell and shared labels; do not mechanically
   alter code keys, logs, tests, or Advanced diagnostics.
5. _Build:_ emit one `<main>` with a stable id from `AppShell` around `{children}`, add the
   focus-visible skip control as the first focusable element, and convert the `<main>` children in
   `tests/unit/app-shell.test.tsx` so the one-landmark assertion is meaningful rather than
   accidentally satisfied.
6. _Discovery:_ answer the one open D63 question before writing capture code. Reproduce the iOS Safari
   capability profile against `negotiateMimeType()`'s injectable predicate, confirm the refusal happens
   before `getUserMedia`, and then run a minimal Web Audio PCM capture on a physical iPhone in Safari
   over HTTPS. Selection rule: Path A is adopted only if the capture starts inside the user gesture,
   survives a lock/unlock interruption, and yields a WAV the existing provider transcribes to HTTP 200.
   Otherwise stop and hand Path B back as an owner decision. Do not write the fix before this step
   answers.
7. _Build:_ under Path A, add the WAV capture route behind the existing `negotiateMimeType()` seam so
   `MediaRecorder` stays the path on Chrome and Edge, keep the ~55 second auto-stop and the permission
   and cancel phases intact, and leave `lib/speech/stt-provider.ts` and both transcribe routes
   untouched.
8. _Verify:_ falsify wrapping, overlay, inaccessible disclosure, hidden-link leakage, Vendor shell
   access, wrong scope, forbidden-copy regressions, a second `main` landmark, a skip control that is
   not first in the tab order, an oversized audio payload slipping past the cap, and a transcript
   reaching any action path; run AC-S41-1 through AC-S41-9 and AC-S41-11.
9. _Gate:_ no action gate exists; confirm the Action Registry, provider factories, `SPEECH_PROVIDER`
   resolution, and the single Speech-to-Text endpoint are unchanged.
10. _Owner:_ hand back the physical-iPhone confirmation for AC-S41-10 with the exact surfaces to
    exercise, or, if discovery falsified Path A, hand back the Path B choice with its dependency, new
    external surface, and cost implication named.
11. _Context update:_ record the shipped shell fact with AC references, record the D63 outcome and the
    landmark fix, update manual QA and the app guide, then advance `docs/loop-state.md` to S42.

**Deletion/merge recommendation.** KEEP this spec. MERGE duplicate desktop/mobile nav declarations
into one typed model, and keep the Safari capture route inside `useAudioRecorder` rather than forking
a second hook per caller. RETIRE the wrapping full-link mobile header and fixed overlapping Feedback
treatment with a one-release rollback path; delete obsolete CSS/components under S49 proof. Retire
`RECORDER_MESSAGES.mp4Only` only once AC-S41-8 and AC-S41-10 are both green; until then it is the
honest statement of a real limit. The disposable `docs/temp/shell-navigation-vocabulary-plan.md`
packet carries the D63 discovery evidence and is deleted once its outcome is recorded durably.
