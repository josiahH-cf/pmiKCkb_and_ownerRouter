// S139/S161: the authored body of a renewal message. Staff edit the body directly, or accept an
// AI-refined wording; either way the text they wrote replaces the composed body for that saved
// preparation revision and is kept exactly as written when the facts later change (S161 R-S161-7).
// Paragraphs that still match a composed paragraph keep its links and emphasis; changed paragraphs
// render as plain escaped text. Pure and client-safe: the base hash that records which composition
// the wording started from is computed on the server.

import { z } from "zod";

import { UNVERIFIED_PLACEHOLDER } from "@/lib/constants";
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
    /** Hash of the composed body the wording started from; it records provenance, never a refusal. */
    baseHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type RefinedBody = z.infer<typeof RefinedBodySchema>;

/** S161: a directly edited subject line for one saved preparation revision. */
export const AuthoredSubjectSchema = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .refine(
    (value) => !/[\u0000-\u001f\u007f]|\{\{|\}\}/.test(value),
    "Use one line of plain text for the subject.",
  );

/**
 * How saved authored wording relates to the current facts. `applied` and `stale` are both the
 * body: `stale` only says the composed information changed after the wording was written.
 */
export type RefinedBodyState =
  | { readonly state: "applied"; readonly text: string; readonly baseHash: string }
  | { readonly state: "stale"; readonly text: string; readonly baseHash: string }
  | { readonly state: "unreadable" };

export const STALE_REFINED_BODY_MESSAGE =
  "Information changed after this wording was written. Your wording is kept exactly as written; return to the standard wording to start again from the current information.";

export const UNREADABLE_REFINED_BODY_MESSAGE =
  "The saved wording could not be read. Reload the message before creating its draft.";

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

const MARKER_PREFIX = `[${UNVERIFIED_PLACEHOLDER.split("<fact>")[0]}`;

/** The named fill-in markers still present in authored text, each once, in order. */
export function missingValueMarkersIn(text: string): string[] {
  const found: string[] = [];
  let from = 0;
  for (;;) {
    const start = text.indexOf(MARKER_PREFIX, from);
    if (start < 0) break;
    const end = text.indexOf("]", start);
    const line = text.indexOf("\n", start);
    if (end < 0 || (line >= 0 && line < end)) {
      from = start + MARKER_PREFIX.length;
      continue;
    }
    const fact = text.slice(start + MARKER_PREFIX.length, end).trim();
    if (fact && !found.includes(fact)) found.push(fact);
    from = end + 1;
  }
  return found;
}

/** The callout for authored text: one entry per marker the person has not filled in yet. */
export function authoredMissingValues(text: string): RenewalMessageContent["missing"] {
  return missingValueMarkersIn(text).map((fact) => ({
    field: "marker",
    message: `Still marked in your wording: ${fact}.`,
  }));
}

/**
 * The composed content with the authored wording as its body. The attachments and source refs stay
 * the composed ones. The missing-value callout follows the authored text: a marker the person
 * filled in is no longer listed, and one they kept still is.
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
  return {
    ...content,
    paragraphs,
    // The subject sits on its own line so a marker it still carries is listed once too.
    missing: authoredMissingValues(`${content.subject}\n${text}`),
    ...renderMessageParagraphs(paragraphs),
  };
}

/**
 * The content under a directly edited subject. A gap that was only marked in the composed subject
 * leaves the callout once the person has written the subject without that marker.
 */
export function applyAuthoredSubject(
  content: RenewalMessageContent,
  subject: string,
): RenewalMessageContent {
  const before = missingValueMarkersIn(content.subject);
  const kept = new Set([
    ...missingValueMarkersIn(subject),
    ...missingValueMarkersIn(content.plainText),
  ]);
  const filled = before.filter((fact) => !kept.has(fact));
  return {
    ...content,
    subject,
    missing: content.missing.filter(
      (entry) =>
        !(
          (entry.field === "address" && filled.includes("property address")) ||
          (entry.field === "marker" &&
            filled.some((fact) => entry.message.endsWith(`: ${fact}.`)))
        ),
    ),
  };
}
