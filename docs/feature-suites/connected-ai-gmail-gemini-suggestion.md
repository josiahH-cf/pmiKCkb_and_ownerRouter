<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: connected-ai-batch-002 -->

# S140 — Optional Gemini-in-Gmail suggestion on linked drafts

> Intake: ready, batch 002 item 007. The owner's “all existing workflow-linked draft screens” clarification also applies here. Scope only.

**Goal.**

After a workflow-linked email draft is ready for review, show one quiet, optional suggestion to use Gemini in Gmail for another wording pass where the user's account offers it.

**Current state / intended end state.**

Existing renewal, Maintenance and Gmail Hub draft surfaces show different local preview, transient proposal, and confirmed Gmail states. No common Gemini-in-Gmail hint is implemented. A user's reported Pro subscription is not entitlement evidence for every staff account. [Gmail's official help](https://support.google.com/mail/answer/13955415?hl=en) describes draft refinement with availability conditions.

**Actors and entry conditions.**

The same actor and workflow-linked screens as S139. Show only with an actual prepared draft/proposal appropriate to that screen, not on failure or an empty input.

**What it is / how it functions.**

Render one line of secondary application text, such as “For another wording pass, try Gemini in Gmail, where available,” in each active linked-draft review/success surface. If the local state is only an app preview, name it as local and do not imply Gmail saved it. Reuse a verified existing Gmail action only when it addresses the intended account/draft; otherwise keep the existing truthful Drafts-folder or no-link experience. Never insert the hint into recipient-visible body, signature, quote, template, or saved content.

**In scope / out of scope.**

One optional UI cue per active linked draft screen; no Gemini-in-Gmail API, entitlement lookup, sign-in, subscription workflow, deep link invention, model swap, or extra completion step. Generic unlinked template/anticipatory tools are outside the owner's clarified linked-screen scope.

**Open questions & assumptions.**

Screen scope is resolved. Account-specific Gemini availability remains unknown by design and does not block this optional hint. Exact-draft Gmail links are not verified in every screen; lack of a link does not block the suggestion.

**Cross-product impacts.**

S139 draft-review surfaces, accessible UI text, local/Gmail status labels, and any already verified Gmail navigation.

**Authority and evidence map.**

| Input                                | Classification                       | Use and limitation                                                          |
| ------------------------------------ | ------------------------------------ | --------------------------------------------------------------------------- |
| Current draft UI and source item 007 | Code baseline / owner intent         | No current shared hint; requested optional text is not email content.       |
| Owner clarification                  | Owner intent                         | All existing workflow-linked draft screens.                                 |
| Gmail Help and reported Pro use      | Provider documentation / user report | Availability varies; neither proves entitlement for each signed-in account. |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S140-1** — A single UI-only cue is tied to each screen's real draft state and excluded from every body/save/Gmail payload; payload tests fail if text leaks.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S140-1** — Prepared and confirmed states show the cue once with honest availability; failed saves and retries never multiply it or claim Gmail persistence.
- **BEH-S140-2** — A Gmail link appears only when existing verified navigation matches the intended account/draft; without it the draft workflow still finishes.

**Human litmus outcome.**

### Optional final wording pass

**If this was built correctly:** Staff see a small optional hint after preparing a linked email, and the actual email remains free of the hint. Record model verdict; without an observer use `Human verdict: NOT RUN — no human observer`.

**Requirement-to-outcome traceability.**

| Requirement                          | Architecture outcome | Behavior outcome | Human litmus                | Falsification                                             |
| ------------------------------------ | -------------------- | ---------------- | --------------------------- | --------------------------------------------------------- |
| One hint, never in content           | ARCH-S140-1          | BEH-S140-1       | Optional final wording pass | UI and saved/MIME body snapshot tests after edit/retry.   |
| Honest Gmail availability/navigation | ARCH-S140-1          | BEH-S140-2       | Optional final wording pass | No-link, wrong-account, local-only and failed-save cases. |

**Preservation set.**

All existing draft state, exact review, manual send, and no-client-send boundaries remain unchanged.

**Adversarial acceptance checks.**

- **AC-S140-1** — Each in-scope prepared draft shows one unobtrusive cue, absent from body and saved content.
- **AC-S140-2** — Local-only and failed states remain honest; optional Gmail availability is not promised.
- **AC-S140-3** — Only an existing verified intended-draft/account destination is reused; no link or Gemini account access is required to finish.

**Forbidden actions / hard gates.**

No new integration, entitlement assertion, login, body insertion, fabricated deep link, provider call, approval, or send.

**Dependencies / sequencing.**

Intake order 007, follows the S139 screen/state inventory. Does not require actual Gmail draft-update capability.

**Standalone delivery contract.**

One state-aware UI cue across the linked draft screens, with content exclusion and link checks; it can ship without Gemini entitlement or a direct-draft link.

**Verification and delivery contract.**

Fail-first UI/payload cases by screen and state; focused/canonical checks; inspect actual app/MIME output only through authorized existing fixtures/readbacks. Do not create a customer draft for this hint alone.

**Ordered prompt sequence.**

1. Recheck S139's final screen inventory and available Gmail links.
2. Record fail-first local, confirmed, failure and retry states.
3. Add the UI-only cue once per active screen.
4. Verify no recipient-content leakage and report actual link behavior.

**Deletion/merge recommendation.**

Retire after its one-line behavior and content-exclusion checks are shipped and recorded in current facts.
