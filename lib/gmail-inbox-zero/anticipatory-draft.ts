// Anticipatory AI draft-TEXT composer for Gmail Inbox 0 (deferred-cycle bullet 3, slice 3a).
// It tailors an ALREADY-APPROVED reply template so it reads naturally for one specific email,
// through the ModelProvider seam so a free local model stands in for Gemini in dev/test and
// Gemini runs in prod (lib/config/server.ts fences the local path out of prod). The provider and
// model are INJECTED by the caller (dependency injection, exactly like lib/processes/classify.ts):
// this module never constructs a provider and never reads config, so prod/dev fencing stays in one
// place and there is no route/config coupling.
//
// The deterministic buildReplyDraft spine (lib/gmail-inbox-zero/drafts.ts) runs FIRST: an unapproved
// reply template or a hard-excluded category (Owner money / Legal/notices / Tenant disputes) is
// refused with refusedBeforeModel:true BEFORE the model is ever invoked, so the model never sees
// excluded mail. After the model returns, the verbatim DRAFT_BANNER and the "Needs Verification:
// <fact>" placeholders are re-applied deterministically by re-running buildReplyDraft over the
// model's tailored body (so the banner + Needs-Verification lines are byte-identical to the
// deterministic path); a banner the model wrongly emits is stripped so it is never duplicated. Any
// model or setup throw, non-JSON, wrong-shape, or empty output degrades non-fatally to the
// deterministic template draft (ok:true, usedModel:false): the composer never throws and never emits
// ungrounded model text without the review banner.
//
// Single-thread explicit invoke only: one call composes one thread (one model call), keeping the
// on-demand cheap-Flash usage under the $10 cap. Pure app-plane text: NO Gmail API call, no mailbox
// read, no draft create, no label apply, and no send capability. Dan presses Send; nothing here can.

import { DRAFT_BANNER, UNVERIFIED_PLACEHOLDER } from "@/lib/constants";
import { buildReplyDraft, type ReplyTemplate } from "@/lib/gmail-inbox-zero/drafts";
import type { TriageMessageFacts } from "@/lib/gmail-inbox-zero/rules";
import type { ModelProvider } from "@/lib/llm/model-provider";

export interface ComposeAnticipatoryDraftInput {
  /** The Approved reply pattern to tailor. An unapproved template is refused before the model runs. */
  template: ReplyTemplate;
  /** Sanitized facts about the email being answered (never live Gmail content). */
  message: TriageMessageFacts;
  /** Facts the draft must flag for verification; re-applied verbatim after the model returns. */
  missingFacts?: string[];
  /** Optional triage category; a hard-excluded category is refused before the model runs. Falls
   * back to the message category when omitted. */
  category?: string;
  /** Injected model seam (local model in dev/test, Gemini in prod; fenced by lib/config/server.ts). */
  provider: ModelProvider;
  /** Injected model id (cheap Flash in prod / local model name in dev). */
  model: string;
}

export interface ComposeAnticipatoryDraftResult {
  /** True when a draft was produced (deterministic or model-tailored); false only on a spine refusal. */
  ok: boolean;
  /** The final draft text, always carrying the verbatim banner. Absent only on a spine refusal. */
  draft?: string;
  /** True when the model tailored the body; false when the deterministic template draft was used. */
  usedModel: boolean;
  /** True when the deterministic spine refused (unapproved template / hard-excluded category) and
   * the model was never invoked. */
  refusedBeforeModel: boolean;
  /** Spine refusal reasons; empty when a draft was produced. */
  errors: string[];
}

const DRAFT_SCHEMA = {
  type: "object",
  properties: { draft_body: { type: "string" } },
  required: ["draft_body"],
  additionalProperties: false,
} as const;

const SYSTEM_INSTRUCTION = [
  "You lightly rewrite an ALREADY-APPROVED reply template so it reads naturally for one specific email.",
  "Keep the approved meaning and every commitment; only adjust the greeting, wording, and flow.",
  'Return strict JSON: {"draft_body": "<the reply body text only>"}.',
  "Never invent facts, names, amounts, dates, or promises that are not in the approved template.",
  `For any fact you do not know, keep the exact placeholder "${UNVERIFIED_PLACEHOLDER}" verbatim; never guess a value.`,
  "Do NOT include the review banner, a subject line, or a signature in draft_body; those are added separately.",
  "Output only the JSON object and nothing else.",
].join("\n");

// The literal prefix of the placeholder ("Needs Verification:"), derived from the constant so the
// text is never re-typed. Used to drop any placeholder line the model echoes, because the canonical
// placeholders are re-applied deterministically by buildReplyDraft.
const PLACEHOLDER_PREFIX = UNVERIFIED_PLACEHOLDER.split("<fact>")[0].trim();

/** Mirror of the classify.ts fence-strip: tolerate a ```json ... ``` wrapper around the JSON. */
function stripFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

/** Parse the structured output; return the draft_body string, or null on non-JSON / wrong shape. */
function extractDraftBody(text: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(text));
  } catch {
    return null;
  }
  const body = (parsed as { draft_body?: unknown })?.draft_body;
  return typeof body === "string" ? body : null;
}

/** Remove a leading banner the model wrongly emits so buildReplyDraft never duplicates it. */
function stripLeadingBanner(body: string): string {
  const trimmed = body.trimStart();
  return trimmed.startsWith(DRAFT_BANNER)
    ? trimmed.slice(DRAFT_BANNER.length).trimStart()
    : trimmed;
}

// Strip any banner or placeholder scaffolding the model echoed, leaving only tailored prose. The
// canonical banner + placeholders are re-applied deterministically by buildReplyDraft, so the final
// banner and Needs-Verification lines are byte-identical to the deterministic path.
function sanitizeModelBody(rawBody: string): string {
  const deBannered = stripLeadingBanner(rawBody);
  return deBannered
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed !== DRAFT_BANNER && !trimmed.startsWith(PLACEHOLDER_PREFIX);
    })
    .join("\n")
    .trim();
}

/**
 * Tailor an Approved reply template for ONE thread through the injected ModelProvider seam.
 *
 * Order of operations (all deterministic except the single model call):
 * 1. Run buildReplyDraft FIRST. On !ok (unapproved template or hard-excluded category) return a
 *    refusal with refusedBeforeModel:true and NEVER call the model.
 * 2. Ask the model for a tailored body via structured {"draft_body": string} output.
 * 3. On any throw / non-JSON / wrong-shape / empty body, degrade non-fatally to the deterministic
 *    template draft (ok:true, usedModel:false).
 * 4. Otherwise re-run buildReplyDraft over the sanitized model body so the verbatim banner + the
 *    Needs-Verification placeholders are re-applied deterministically (usedModel:true).
 */
export async function composeAnticipatoryReplyDraft(
  input: ComposeAnticipatoryDraftInput,
): Promise<ComposeAnticipatoryDraftResult> {
  const { template, message, provider, model } = input;
  const missingFacts = input.missingFacts ?? [];
  const category = input.category ?? message.category;

  // 1. Deterministic spine FIRST: refuse before the model is ever invoked.
  const spine = buildReplyDraft({ template, missingFacts, category });
  if (!spine.ok || spine.draft === undefined) {
    return {
      ok: false,
      usedModel: false,
      refusedBeforeModel: true,
      errors: spine.errors,
    };
  }
  const deterministicDraft = spine.draft;

  // 2. Single model call for the tailored body.
  let draftBody: string | null;
  try {
    const { text } = await provider.generateText({
      model,
      systemInstruction: SYSTEM_INSTRUCTION,
      userContent: buildUserContent(template, message, missingFacts),
      temperature: 0,
      responseJsonSchema: DRAFT_SCHEMA,
    });
    draftBody = extractDraftBody(text);
  } catch {
    // 3a. Any model/setup throw degrades non-fatally.
    draftBody = null;
  }

  const tailoredBody = draftBody === null ? "" : sanitizeModelBody(draftBody);
  if (tailoredBody === "") {
    // 3b. Non-JSON, wrong shape, or empty/banner-only body degrades to the deterministic draft.
    return {
      ok: true,
      draft: deterministicDraft,
      usedModel: false,
      refusedBeforeModel: false,
      errors: [],
    };
  }

  // 4. Re-apply the verbatim banner + placeholders deterministically over the tailored body.
  const reapplied = buildReplyDraft({
    template: { ...template, body: tailoredBody },
    missingFacts,
    category,
  });
  if (!reapplied.ok || reapplied.draft === undefined) {
    // Defensive: the spine already accepted the real template, so this only fails if the model body
    // was unusable. Degrade rather than emit ungrounded text without the banner.
    return {
      ok: true,
      draft: deterministicDraft,
      usedModel: false,
      refusedBeforeModel: false,
      errors: [],
    };
  }

  return {
    ok: true,
    draft: reapplied.draft,
    usedModel: true,
    refusedBeforeModel: false,
    errors: [],
  };
}

function buildUserContent(
  template: ReplyTemplate,
  message: TriageMessageFacts,
  missingFacts: string[],
): string {
  const missing =
    missingFacts.length > 0
      ? missingFacts.map((fact) => `- ${fact}`).join("\n")
      : "(none)";
  return [
    `Approved reply template (name: ${template.name}):`,
    template.body.trim(),
    "",
    "Email being answered:",
    `From: ${message.sender}`,
    `Subject: ${message.subject}`,
    "",
    "Facts still needing verification (keep the exact placeholder for each, do not guess):",
    missing,
    "",
    "Rewrite the template body so it reads naturally for this email, then return the JSON.",
  ].join("\n");
}
