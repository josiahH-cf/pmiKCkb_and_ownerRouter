# PMI KC current status

Last updated: 2026-08-31.

This is a present snapshot, not a changelog. Historical implementation detail remains in Git.

## Production

- URL: `https://pmi-kc-app-kq6wuvpiva-uc.a.run.app`
- Service/project/region: `pmi-kc-app` / `pmi-kc-kb-prod` / `us-central1`
- Serving revision: `pmi-kc-app-rmtg73suu-fe8734d35330`, 100% traffic
- Serving commit: `1d68c7fb0a4f3138b9d0ba410d221b44bfb5534c`
- Immediate rollback: `pmi-kc-app-rmtfzwn77-8153d75d1cd5`
- Descriptor: Production + Live; eleven Spaces; managed runtime identity
- Operating renewal Sheet: read source; write switch off
- RentCast: reference reads selected; allowance 50
- RentVine renewal write: S30 one-lease `endDate` proof key closed; no live proof
- RentVine Maintenance: concrete client is read/list-only; no live create/status/chat sync
- Direct client sends: closed; governed initiation ends with an unsent Gmail draft

The serving candidate passed exact identity, normalized-config, bounded route, promotion, and stable
readback gates. The Action Registry currently has seven open and 34 closed keys. None of the new
S97-S100 exact keys is executable or deployed yet.

## Implemented product baseline

- Complete RentVine and operating-Sheet reads, source reconciliation, exact dispositions, current-
  rent confidence, RentCast reference comps, canonical renewal desk, and lease workspaces.
- Immutable six-step `renewal-v1` progress/evidence plus legacy compatibility, with process position
  unable to grant or prove a provider effect.
- Governed Gmail workflow reads, labels, replies, and exact-confirmed unsent drafts where the exact
  key and published copy permit; a person sends from Gmail.
- Manual linked-thread refresh and source-backed waiting/contact state; no continuous Gmail watch,
  Scheduler, autonomous follow-up, or model-triggered send.
- Console, eleven Spaces, processes, approvals, Admin, Maintenance, feedback, tokenized resident
  intake, Vendor boundaries, and work accountability.
- S30's one-attempt/readback/rollback safety primitives are deployed behind a closed key. Current
  code still contains obsolete multi-record proof and copy-only Sheet paths; S97/S98 own their tested
  removal and they are not active planning authority.
- S96's cancel-first connector dialog, strict request contract, versioned lifecycle, immutable
  redacted receipt, verifiable vault outcome, response-loss recovery, and setup-generation safety are
  implemented on `main` at `32a2d836a730ae7751e4d6964897d48430da9f15`. They are not production
  behavior until the pending release and readback complete.

## Specified, not deployed

The sole implementation queue is `docs/feature-suites/README.md`. S96 connector safety is implemented
and awaits release; S85 remains gated. The queue then runs S85/S86 visual/interaction foundations,
S83 access requests, S84 navigation, and S82 renewal UI before the owner-authorized source effects
and bounded cloud pilot:

- S97: exact RentVine renewal-date and recurring-charge create/update writeback.
- S98: exact operating-Sheet row append and supported-field update, including one temporary real-
  data proof row that is isolated/read back, receives one separately confirmed source-backed field
  update, then is deleted and proven absent.
- S99: exact RentVine work-order read/create/status update with notifications off and no vendor,
  attachment, chat-post, or send behavior.
- S100: explicit manual RentVine work-order chat sync that discloses its mark-read effect, plus a
  separately confirmed unsent resident-reply draft in the signed-in user's connected Gmail mailbox.
- S36: one deterministic temporary Space provision/import/query/readback/retirement pilot that ends
  with the original eleven stores and runtime flag restored.

The queue then runs S88-S94 for the bounded Dashboard assistant, S95 for atomic Dashboard cutover,
and S87 for final product-wide content reconciliation. These contracts do not describe current
production behavior until their implementation, verification, release, effect proof where required,
and readback gates pass.

## Owner authority recorded for future execution

The owner explicitly authorized the exact S97-S100 operations and S36 pilot, including their bounded
live/cloud effects. Each exact S97-S100 key may use a protected temporary proof window after closed
implementation and deterministic gates, must close/read back after proof, and may receive final
activation only after its applicable live proof and remaining suite gates pass. This is not generic
provider authority. Broad legacy keys remain closed;
direct sends, RentVine chat posting, vendor assignment, attachment upload, arbitrary/bulk operations,
fake data, and autonomous/model-triggered effects remain outside scope. Dotloop and LeadSimple are
deferred to later separately grounded work.

## Verification baseline

- Current serving exact-SHA aggregate CI run `33330420327`: passed.
- Canonical serving gate: 559 unit files plus one intentional skip; 5,064 tests plus four skips; 26
  Firestore files/119 tests; policy/static gates; 107-route production build; production audit zero.
- Prior UI/assistant specification closure commit `081fa90071170054e53a2182a68466fbccf4ebf4`:
  aggregate CI run `33425658400` passed; no deployment was performed.
- S96 commit `32a2d836a730ae7751e4d6964897d48430da9f15`: focused adversarial tests,
  canonical verification, core E2E, and exact-SHA aggregate CI run `33466388696` passed. Its only
  protected-path change is the explicitly authorized server-only receipt rule in `firestore.rules`.
- The production release is waiting on interactive managed-account reauthentication: both default
  gcloud and ADC refresh currently fail, and no alternate deployment identity is configured. No
  candidate, traffic, vault, connector, provider, Sheet, Gmail, role, or production-feature effect
  occurred.

## Remaining runtime evidence

There are no unresolved product questions. Interactive gcloud CLI and ADC reauthentication is the
current release input. Fresh provider ids/catalogs/values, managed sessions, confirmation hashes,
signed-in mailbox/resident mapping, and the deterministic S36 source packet are later runtime inputs.
If unavailable or stale, the implementing runner completes all independent closed-safe work and
blocks only the exact release or live effect; it never guesses or substitutes.
