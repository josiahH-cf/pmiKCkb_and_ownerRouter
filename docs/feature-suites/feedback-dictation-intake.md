<!-- spec-shape: overhaul-v1 -->

# S67 — Feedback dictation intake

> New 2026-08-10. Derived from the 2026-08-07 training transcript and the owner's
> 2026-08-10 approval of the recommended specification plan. This is a **specification-only** suite:
> it does not authorize implementation, a cloud/provider change, deployment, or a message. S67 owns
> only pre-submit feedback input; S65 owns report status and closure.

**Goal.** Any signed-in user who can file feedback can speak one or more short clips, review and edit
the resulting words in the existing feedback text box, combine them with typed text, and then choose
whether to submit. Dictation never files feedback by itself. Microphone, browser, transcription, or
network failure leaves typed/transcribed text intact and gives the user a clear typed fallback. Raw
audio exists only long enough to transcribe the current clip and is never stored, logged, attached,
included in a support report, or forwarded in an internal notification.

**What it is / how it functions.** S67 extends the existing `Feedback` dialog in
`components/feedback/ReportIssueButton.tsx`; it does not create a second report form or lifecycle.

- **Core outcome contract.** Today feedback accepts optional typed text plus privacy-bounded page
  context. Voice capture already exists in Ask and Maintenance through
  `components/hooks/useAudioRecorder.ts` and `lib/speech/stt-provider.ts`, but Feedback does not use
  it. The intended difference is a visible `Record feedback` control whose successful result becomes
  ordinary editable description text. The minimum real capability is record → stop/auto-stop →
  transcribe → append → review/edit → explicit `Send feedback`, with honest error/cancel states and
  zero durable audio. The result is incomplete if speech submits automatically, replaces existing
  text, stores audio, silently truncates the transcript, captures page/input content beyond the
  current privacy allowlist, or strands a keyboard/screen-reader user.

- **Existing form remains canonical.** `ReportIssueButton` keeps one optional `description` field,
  one submit action, the existing pathname/viewport/user-agent/element-identity context, and the
  existing delivered/notice/error outcomes. A user can still type only or submit with no description.
  Dictation is an optional input method, not a required step, report origin, status, attachment, or
  new record type.

- **Recorder lifecycle.** Reuse `useAudioRecorder` rather than create a second `MediaRecorder`
  implementation. Its visible phases map to `Requesting microphone`, `Recording`, `Stopping`,
  `Transcribing`, and a specific recovery message. One clip auto-stops at 55 seconds. The user may
  stop sooner and may record another clip only after the previous clip reaches idle/error/cancelled.
  Rapid repeated start/stop clicks create at most one active recorder and one transcription request.
  The control shows an elapsed/remaining cue while recording and announces auto-stop through an
  `aria-live` status; the exact visual timer may be derived client-side and is not persisted.

- **Dedicated bounded transcription route.** Add candidate route
  `POST /api/report-issue/transcribe` following the established caller-specific Ask/Maintenance
  pattern. It requires the same `read` capability as feedback filing, parses only base64 audio and an
  allowlisted supported MIME type, and reuses `createSpeechToTextProvider(readServerConfig())`.
  Apply the existing 8,000,000-base64-character request cap and reject declared/actual oversize
  before a billable call. It returns only `{ transcript }` or a bounded error code/message. It does
  not accept page context, description, report id, customer identity, or a destination and does not
  write Firestore. Existing environment, STT configuration, request-cost, and S52 guards remain; a
  refusal falls back to typing and cannot file a report.

- **Append, never replace.** A nonblank transcript is appended at the current end of the description.
  If the description is nonblank, insert exactly two newline characters before the new clip; if it
  is blank, insert none. Preserve all typed text and prior transcripts. Move focus to the textarea at
  the end of the appended text so the user can correct names/punctuation immediately. Each later clip
  follows the same rule. An empty/whitespace transcript appends nothing and displays
  `No speech was detected. Type instead or record again.`

- **Length contract.** The existing server maximum remains 2,000 characters. Do not truncate a
  transcript or existing text. If an append makes the editable value longer than 2,000, keep the
  entire value in the textarea, show the current count and exact excess, and disable
  `Send feedback` until the user edits it to 2,000 or fewer. The server still enforces its existing
  maximum. Closing/cancelling the dialog discards the unsent text under the current dialog behavior;
  it never converts over-limit text into a partial report.

- **Raw-audio lifecycle.** Audio chunks/blob/base64 may exist only in volatile browser memory, the
  bounded request body, and provider request memory for the current transcription. On success,
  error, abort, permission cancellation, auto-stop completion, dialog close, route change, or
  component unmount: stop every media track; abort/ignore any late request/result; release blob/base64
  references; and retain only text that was already appended. No raw audio, audio hash, audio URL,
  duration, MIME detail, or encoded content is written to Firestore, object storage, cache, analytics,
  Cloud Logging, internal notices, report records, error digests, or the DOM after cleanup.

- **Cancellation and retry.** While permission is pending, `Cancel microphone request` uses the
  existing hook behavior and preserves text. While recording, `Stop and transcribe` completes that
  clip; `Cancel dictation` stops tracks and discards the current clip without transcribing. While
  transcribing, `Cancel dictation` aborts/ignores the result, discards audio, preserves text, and
  re-enables normal form actions. After any transcription failure the audio is discarded, so retry
  means `Record again`; the system must not secretly retain/replay the failed blob. The user can
  submit already committed typed/transcribed text after cancelling a pending dictation.

- **Failure states.** Unsupported browser/format, microphone denial, unanswered permission,
  empty audio/transcript, oversize input, authentication/scope refusal, environment/cost refusal,
  provider setup/auth/encoding/HTTP failure, timeout, offline/network failure, and user cancellation
  each produce honest, non-success feedback. Error copy may recommend typing or recording again but
  cannot claim a report was filed. A transcription error does not change the existing report submit
  status; a report submission error does not resurrect or retranscribe audio.

- **Submission and lifecycle boundary.** `Send feedback` is disabled while a recording or
  transcription is active unless the user cancels that dictation first. Submission sends only the
  final trimmed description and the current allowlisted context to `/api/report-issue`. The created
  support report is indistinguishable from typed input and begins in `new`; no `voice`, `audio`, or
  input-modality field is added. S65 acknowledgment/resolution, audit, counts, permissions, and
  retention are unchanged.

- **Privacy and accessibility.** Preserve `describeElement`'s identity-only allowlist: no
  `aria-label`, text content, input/textarea value, query string, screenshot, clipboard, surrounding
  page text, tenant/owner record, or microphone content is added to context. Record/stop/cancel/send
  controls have stable accessible names; status/errors are announced without stealing focus; Escape,
  backdrop click, Cancel, and successful Close stop/abort media before returning focus to the
  feedback trigger. The focus trap includes every new enabled control and works at 390×844 without
  covering the textarea or primary action.

- **Observability.** Allowed transcription telemetry is limited to authenticated uid hash/ref as
  already permitted operationally, route name, lifecycle outcome/error code, request-size bucket,
  provider latency, and whether a nonblank transcript was returned. Never log the audio, base64,
  transcript, description, element content, or provider raw error detail that could repeat speech.
  Feedback submission keeps its current metadata-only logging and internal notice behavior.

- **Buildable later under separate implementation authority (app-plane).** Feedback UI/controller,
  the dedicated authenticated route, reuse/extension of the recorder lifecycle, abort/cleanup,
  length validation, accessibility, and tests. No Action Registry write gate is introduced.
- **Build to the seam (live provider).** Reuse the already established production Google STT adapter
  and current server config; do not add a new speech provider or credential path. Stub/local behavior
  remains honest and cannot prove Live STT.
- **Owner dependency.** None. If the existing configured STT seam is unavailable, dictation is
  unavailable with a typed fallback; that does not block typed feedback or create authority to change
  cloud configuration in this specification pass.

**Open questions & assumptions.** Decision-complete for implementation.

- _Answered 2026-08-10:_ speech appends an editable transcript; it never replaces text or submits.
- _Answered 2026-08-10:_ raw audio is discarded and is not stored or logged.
- _Answered 2026-08-10:_ the existing 55-second recorder cap and repeat-clip pattern are reused.
- _Answered 2026-08-10:_ the existing 2,000-character report maximum remains; over-limit content is
  shown and editable rather than silently truncated.
- _Assumption:_ current dialog Cancel/Escape/backdrop behavior continues to discard an unsent
  description after stopping/aborting media. This affects only unsent local text and creates no
  persisted deletion.
- _Assumption:_ no new server rate number is introduced by this UI suite; one active recorder/request,
  the existing bounded payload, authentication, provider timeout/config, and S52 cost controls are
  preserved. A future shared STT quota policy may tighten calls without changing append semantics.

**Cross-product impacts.** Primary paths are
`components/feedback/ReportIssueButton.tsx`, `components/hooks/useAudioRecorder.ts` (reuse; extend
only if cancellation/timer signals cannot remain caller-owned), candidate
`app/api/report-issue/transcribe/route.ts`, `lib/speech/stt-provider.ts`,
`app/api/report-issue/route.ts` (its 2,000-character and privacy contract remains),
`lib/environment/live-readonly-request-policy.ts`, and feedback/recorder/STT route tests. S65 consumes
the resulting ordinary report without modality awareness. The Ask and Maintenance voice consumers
must remain green and must not acquire feedback context or changed copy accidentally. S67 neither
supersedes nor widens S39's metadata-only internal notice.

**Adversarial acceptance checks.** These are future implementation acceptance contracts; this
specification pass is complete when their wording and traceability validate.

- **AC-S67-1** — With no microphone use, typed-only and empty-description feedback behave exactly as
  before, including delivered/notice/error states and focus return. _Verify:_ existing feedback
  component/route tests plus a typed-only regression case.
- **AC-S67-2** — Starting, stopping, and successfully transcribing `second thought` when the textarea
  contains `first thought` produces exactly `first thought\n\nsecond thought`, moves the caret/focus
  to the end, and does not call `/api/report-issue` until the user selects `Send feedback`. A third
  clip appends by the same rule. _Verify:_ feedback dictation component tests with request spies.
- **AC-S67-3** — A 55-second active clip auto-stops once, announces the limit, creates one
  transcription request, and leaves no active media track. Rapid duplicate toggles never create a
  second recorder/request. _Verify:_ fake-timer lifecycle and MediaRecorder tests; keep
  `use-audio-recorder-lifecycle.test.tsx` green.
- **AC-S67-4** — Permission denial/timeout/cancel, unsupported/mp4-only browser, empty transcript,
  400/401/403/413/429/503, provider timeout, offline failure, and user abort each show non-success
  recovery copy, preserve existing text, file no report, and stop all tracks. _Verify:_ error matrix,
  abort, and unmount tests.
- **AC-S67-5** — If an append exceeds 2,000 characters, the complete text remains editable, the exact
  count/excess is visible, and submit is disabled; editing to 2,000 enables submit and sends exactly
  that text. Neither client nor server silently truncates. _Verify:_ 1,999/2,000/2,001 boundary tests.
- **AC-S67-6** — Closing by Cancel, Escape, backdrop, route change, or unmount during permission,
  recording, stopping, or transcription aborts/ignores pending work, stops tracks, appends no late
  result, and returns focus to the trigger when it remains mounted. _Verify:_ lifecycle/focus tests.
- **AC-S67-7** — Browser memory aside, successful, failed, cancelled, and submitted paths write no
  raw audio/base64/hash/URL/duration/MIME field to support reports, support activity, caches, object
  storage, internal notices, logs, analytics, or response payloads. _Verify:_ store/notice/log spies
  and forbidden-key/value scan.
- **AC-S67-8** — The transcription endpoint requires `read`, rejects oversize/invalid data before
  provider construction, accepts only the documented audio fields, and returns only transcript or a
  bounded error. Scope/environment/cost refusal makes zero provider calls. _Verify:_ route auth,
  schema, content-length, and provider-construction tests.
- **AC-S67-9** — The feedback context remains pathname/viewport/user-agent/element identity only.
  Dictation does not capture query strings, screenshots, labels, DOM text, textarea values as
  context, clipboard, or neighboring product/customer data. _Verify:_ context serialization and
  privacy sentinels.
- **AC-S67-10** — A dictation-created report has the same persisted shape and `status:"new"` as a
  typed report; its S65 transitions, audit, counts, retention, and Admin visibility are identical,
  with no modality field. _Verify:_ report create/lifecycle integration tests.
- **AC-S67-11** — All recorder states and errors are announced, every control is keyboard-operable,
  the focus trap remains valid, and the dialog has no overflow/obscured primary action at 390×844.
  _Verify:_ accessibility, focus-order, and mobile browser tests.
- **AC-S67-12** — `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`,
  `npm run test:e2e:core`, `npm run verify:spec-traceability`, and `npm run build` pass; keep Ask,
  Maintenance, feedback privacy, support-report, environment, and STT provider sentinels green.

**Forbidden actions / hard gates.** Recording or transcription must never submit feedback, send a
message, create a report, invoke an agent, or mutate product state. Never store, log, cache, hash,
attach, analyze beyond transcription, or replay raw audio. Never silently truncate/replace typed text
or append a late/cancelled result. Never capture a screenshot, query string, label/text content,
input value, clipboard, or neighboring page data. Do not widen feedback read/filing permissions or
S65 Admin visibility. Do not add a new speech credential/provider, Action Registry key, cloud change,
or production activation here. Generic/client sends remain closed/human-controlled; personal
identity, secrets, PII, guessed endpoints, and audio/transcript bodies stay out of git/logs. Production
Live-only, local Demo effect refusal, managed identities, and S52 cost controls remain. This
specification request authorizes no implementation or external effect.

**Ordered prompt sequence.** This is a future dependency order, not present implementation authority.

1. _Discovery:_ under separate implementation authority, map the current feedback dialog/route,
   recorder lifecycle, Ask/Maintenance transcription routes, environment policy, and log/notice
   boundaries; freeze regressions before editing.
2. _Understanding:_ fix the recorder/transcription/append/cancel/limit state table and the exact raw-
   audio lifetime, including every close/unmount path.
3. _Build:_ add the dedicated bounded route and feedback controller by reusing the existing recorder
   and STT seam; preserve the shared report payload/lifecycle.
4. _Verify:_ run AC-S67-1 through AC-S67-12 and falsify late results, leaked audio/text/context,
   duplicate requests, silent truncation, permission failures, mobile overflow, and focus loss.
5. _Gate:_ confirm zero new provider/gate/send/store authority and that typed feedback remains usable
   whenever voice is unavailable.
6. _Context update:_ only after separately authorized work ships green, record verified behavior and
   update the loop; specification approval alone creates no shipped fact.

**Deletion/merge recommendation.** KEEP while S67 is an independent input modality contract. S65
owns downstream lifecycle and must not absorb recorder/privacy behavior. Do not create the disposable
`docs/temp/feedback-dictation-intake-plan.md` packet during this specification-only pass; after a
future shipped implementation, merge only shared report-create tests—not the suite responsibilities.
