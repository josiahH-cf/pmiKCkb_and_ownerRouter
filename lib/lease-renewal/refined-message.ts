// S139: a refined renewal message body. When staff accept an AI-refined (and possibly hand-edited)
// wording, it replaces the composed body text for that saved preparation revision. Paragraphs that
// still match a composed paragraph keep its links and emphasis; changed paragraphs render as plain
// escaped text. Pure and client-safe: the base hash that binds a refinement to the facts it was made
// from is computed on the server.

import { z } from "zod";

import {
  renderMessageParagraphs,
  type MessageRun,
  type RenewalMessageContent,
} from "@/lib/lease-renewal/renewal-message-content";

export const REFINED_BODY_MAX_LENGTH = 20_000;

export const RefinedBodySchema = z
  .object({
    text: z
      .string()
      .trim()
      .min(1)
      .max(REFINED_BODY_MAX_LENGTH)
      .refine(
        (value) =>
          !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]|\{\{|\}\}/.test(value),
        "Remove control characters and template markers from the wording.",
      ),
    /** Hash of the composed body the refinement started from; a changed composition makes it stale. */
    baseHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type RefinedBody = z.infer<typeof RefinedBodySchema>;

/** How a saved refined body relates to the current facts. */
export type RefinedBodyState =
  | { readonly state: "applied"; readonly text: string; readonly baseHash: string }
  | { readonly state: "stale"; readonly text: string; readonly baseHash: string }
  | { readonly state: "unreadable" };

export const STALE_REFINED_BODY_MESSAGE =
  "The facts changed after this wording was refined, so it is not used for the draft. Refine again from the current wording, or return to the standard wording.";

function paragraphText(runs: MessageRun[]): string {
  return renderMessageParagraphs([runs]).plainText;
}

/** Split refined text into paragraphs the way the composed body joins them. */
export function refinedParagraphTexts(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) =>
      paragraph
        .split("\n")
        .map((line) => line.trimEnd())
        .join("\n")
        .trim(),
    )
    .filter(Boolean);
}

/**
 * The composed content with the refined wording as its body. The subject, attachments, source refs
 * and missing inputs stay the composed ones: a refinement changes wording, not facts or recipients.
 */
export function applyRefinedBody(
  content: RenewalMessageContent,
  text: string,
): RenewalMessageContent {
  const composed = new Map(
    content.paragraphs.map((runs) => [paragraphText(runs), runs] as const),
  );
  const paragraphs: MessageRun[][] = refinedParagraphTexts(text).map(
    (paragraph) =>
      composed.get(paragraph) ?? paragraph.split("\n").map((line) => ({ text: line })),
  );
  return { ...content, paragraphs, ...renderMessageParagraphs(paragraphs) };
}
