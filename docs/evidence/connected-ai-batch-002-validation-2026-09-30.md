# Connected AI batch 002 validation — 2026-09-30

S141 evidence map for S135–S140. Each cell names the environment that produced it. "Unit" and
"backend" are deterministic fixture evidence; "local rehearsal" is the real application running
against live read-only data with the selected model; "production" cells are filled only from the
batch 002 release readback. Human verdict: NOT RUN — no human observer.

## Tested environments

- **Code:** S135–S140 merged to `main` at `f43629aa` (PRs #96, #98, #99), after the audit patch
  in PR #95. Each slice passed the full `bash scripts/verify.sh` on its exact head and exact PR
  CI (5/5 checks); the final slice gate passed 7,604 unit tests (four existing skips) and 236
  backend tests.
- **Local rehearsal:** `npm run dev` (live read-only data context, demo Admin sign-in) at the same
  code, WSL host, 2026-09-30 21:51–22:30 UTC. Reads used the approved `josiah@pmikcmetro.com`
  identity; the read-only request policy refused every write. Model:
  `gemini-3.1-flash-lite` on the Google Cloud global endpoint.
- **Checks:** `npm run smoke:dashboard-assistant-browser` (S138 question families and follow-ups)
  and `npm run smoke:connected-ai-browser` (S141 record parity and refinement route). Both print
  counts and statuses only, never record text.

## Local rehearsal results

- **Real inference:** 43 model calls, all `outcome: ok`, all reporting served
  `modelVersion: gemini-3.1-flash-lite` at location `global`: 39 Dashboard plan interpretations
  (1,266–2,893 ms; 1,547–1,889 prompt and 178–190 output tokens) and 4 owner-notice refinements
  (1,098–1,928 ms; 424–485 prompt and 62–103 output tokens). No fallback model was called.
- **Dashboard families:** the S110 questions and the S138 families (this week, next month, "Now
  next month", "Only mine", approvals, waiting on others, connections, stale information) were
  answered through the model interpreter, with follow-ups continuing the conversation. The
  policy question routed to the knowledge answer. No write route was called.
- **Record parity:** "Which renewals come up next month?" answered 4 leases; the desk's own
  filtered view at the answer's link showed "Matching: 4" and contained all 4 listed leases. The
  follow-up "Which of those are blocked?" continued the conversation and again matched the
  desk's filtered view (4 of 4). Neither source read was partial.
- **Refinement route:** two successive instructions on a real maintenance ticket, starting from
  synthetic draft wording with no customer values. Both returned `revised`; the second started
  from the first result and came back shorter; no requested or removed values were reported.
  The renewal surface refused with HTTP 409 ("Save this message before refining its wording")
  because production has no saved renewal message preparation.
- **Effects:** only `POST /api/auth/demo`, `/api/assistant/query` and `/api/email-refinement`
  were sent. Nothing was saved, drafted or sent.

The first two S138 smoke attempts failed a harness race: the check waited for any "Answer"
heading, which the previous operational answer already satisfied, before the policy answer
replaced it. Telemetry showed the model had classified the question as `knowledge`. The check now
waits for the thread's operational region to leave and for the knowledge answer's own heading;
it then passed. No product code changed.

## Acceptance map

| Check     | Evidence                                                                                                                                                | Environment                 | Result                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| AC-S135-1 | Refusal traced to the closed intent registry plus knowledge-only fallback; 5/5 fail-first questions; ordinary questions answered from records           | Unit; local rehearsal       | Pass                                                                                                          |
| AC-S135-2 | Per-source status survives a failed source and labels its scope                                                                                         | Unit                        | Pass; no live source failed during rehearsal                                                                  |
| AC-S135-3 | Existing `read` capability only; no new key, role or provider effect; only read-only posts                                                              | Unit; local rehearsal       | Pass                                                                                                          |
| AC-S136-1 | Backend requests served by `gemini-3.1-flash-lite` on the global endpoint                                                                               | Local rehearsal; production | Local pass; production pending release readback                                                               |
| AC-S136-2 | One selection in server defaults, live-cost preflight, budget guard and deploy wrapper; structured plans and refinement JSON valid                      | Unit; local rehearsal       | Pass                                                                                                          |
| AC-S136-3 | No retry on another model; observed latency and tokens above; serving env readback                                                                      | Unit; local rehearsal       | Local pass; deployment readback pending                                                                       |
| AC-S137-1 | Combined lease, assignment, blocker and approval questions with owning links                                                                            | Unit; local rehearsal       | Pass; live combinations limited to lease + blocked (demo Admin has no assignments)                            |
| AC-S137-2 | Full counts with at most 25 listed; partial and unavailable reads labelled                                                                              | Unit; local rehearsal       | Pass; live counts were small (4)                                                                              |
| AC-S137-3 | Actor-bound conversation context, reset for another sign-in; reads create no effect                                                                     | Unit; local rehearsal       | Pass                                                                                                          |
| AC-S138-1 | Question families and paraphrases through the real Dashboard, counts and IDs matching the desk                                                          | Local rehearsal             | Pass                                                                                                          |
| AC-S138-2 | Follow-ups continue (`continued: true` in telemetry) and re-read records; other-actor isolation                                                         | Unit; local rehearsal       | Pass                                                                                                          |
| AC-S138-3 | Chicago business dates, ambiguous person, true empty, multi-page and partial-source answers; asking never writes                                        | Unit; local rehearsal       | Pass; live true-empty observed ("Only mine")                                                                  |
| AC-S139-1 | Instruction box on all four linked screens; successive instructions start from the latest text; style-only changes keep facts                           | Unit/component; local route | Pass; live UI not exercised for renewal (no saved preparation), resident reply (key unavailable) or Gmail Hub |
| AC-S139-2 | Renewal wording saved with its revision and stale detection; Gmail draft preview built from the same refined content; per-wording owner-notice identity | Unit; backend emulator      | Pass at fixture level; no live Gmail draft was created                                                        |
| AC-S139-3 | Late response, throttling, unavailable model and failed save keep user text; app-only and Gmail states distinct; no send path                           | Unit/component              | Pass                                                                                                          |
| AC-S140-1 | One hint per drafted state, outside body and saved content                                                                                              | Unit/component              | Pass; no live draft created                                                                                   |
| AC-S140-2 | Hint appears only after a created draft; no availability promise                                                                                        | Unit/component              | Pass                                                                                                          |
| AC-S140-3 | Plain text, no link or Gemini account access                                                                                                            | Unit/component              | Pass                                                                                                          |
| AC-S141-1 | Signed-in Dashboard parity, follow-ups and no hidden effects                                                                                            | Local rehearsal; production | Local pass; production pending                                                                                |
| AC-S141-2 | Served model and endpoint from real inference                                                                                                           | Local rehearsal; production | Local pass; production pending                                                                                |
| AC-S141-3 | Linked draft paths keep latest edits, report save/Gmail state and keep the hint out of content                                                          | Unit; backend; local route  | Pass within the limits above                                                                                  |

## Unverified seams

- Production serving model, endpoint and inference until the batch 002 release readback.
- Live renewal refinement through the screen: production holds no saved renewal message
  preparation, and creating one only for proof is not authorized.
- Live Gmail draft creation from refined wording on any screen: no customer draft was
  authorized as proof.
- Maintenance resident reply: its action key remains unavailable (`production_allowed:false`).
- Gmail Hub workflow reply refinement: its proposal route is not on the read-only rehearsal
  allowlist, so it was not exercised live.
- Gemini in Gmail availability for the account: not verified and not claimed.
