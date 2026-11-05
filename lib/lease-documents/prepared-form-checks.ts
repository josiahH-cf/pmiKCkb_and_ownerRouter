// S253 (R-S253-5, R-S253-10): what a prepared form must still say after it is filled.
//
// One fee on the finished pet agreement: wherever the saved file states the processing fee, in the
// value the fill drew and in the text a program reads from the file, it states the published
// amount. A file in which the two readings differ, or in which the fee differs from the published
// amount, is refused. The form's conflicting printed amount is resolved only by a corrected
// original or by a reviewed map region that replaces that exact text; nothing here rewrites it.
//
// Organization, representative and signer text a form prints is still printed after preparation.
// The check reads each form against itself only: one form's text is never compared with, copied
// to or made to match another form's.

import {
  readStaticPdfLines,
  type StaticTextLine,
} from "@/lib/lease-documents/static-pdf";

/** A dollar amount. A comma belongs to it only as a thousands separator. */
const AMOUNT = String.raw`\$\s?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)`;
/**
 * An amount a sentence gives for the processing fee: after the words within the same sentence, or
 * directly before them. Words that begin another amount (a deposit, a total, rent) end the reach,
 * so the amount read is the fee's own.
 */
const FEE_AFTER = new RegExp(String.raw`processing\s+fee([^$.;]{0,48}?)${AMOUNT}`, "gi");
const FEE_BEFORE = new RegExp(
  String.raw`${AMOUNT}\s+(?:(?:non-?refundable|one-?time|pet)\s+){0,3}processing\s+fee`,
  "gi",
);
const ANOTHER_AMOUNT = /\b(deposit|total|rent|plus|and|or)\b/i;
/**
 * An amount set directly beside the fee's amount, with no word between them: a second amount drawn
 * over or against the first. Both are amounts the file gives for the fee, whichever comes first.
 */
const AMOUNT_DIRECTLY_AFTER = new RegExp(String.raw`^\s{0,2}${AMOUNT}`);
const AMOUNT_DIRECTLY_BEFORE = new RegExp(String.raw`${AMOUNT}\s{0,2}$`);

function cents(amount: string): number | null {
  const value = Number(amount.replaceAll(",", ""));
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}

function money(value: number): string {
  return `$${(value / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Every amount the file's text gives for the processing fee, in cents, page by page. */
export function statedProcessingFees(
  lines: readonly StaticTextLine[],
): Array<{ pageIndex: number; cents: number }> {
  const stated = new Map<string, { pageIndex: number; cents: number }>();
  const add = (pageIndex: number, amount: string) => {
    const value = cents(amount);
    if (value !== null) stated.set(`${pageIndex}:${value}`, { pageIndex, cents: value });
  };
  lines.forEach((line, index) => {
    // A sentence may wrap between the words and the amount, so each line is also read with the
    // line that follows it on the same page.
    const next = lines[index + 1];
    const texts = [
      line.text,
      ...(next && next.pageIndex === line.pageIndex ? [`${line.text} ${next.text}`] : []),
    ];
    for (const text of texts) {
      for (const match of text.matchAll(FEE_AFTER)) {
        if (ANOTHER_AMOUNT.test(match[1])) continue;
        add(line.pageIndex, match[2]);
        let rest = text.slice(match.index + match[0].length);
        for (
          let beside = AMOUNT_DIRECTLY_AFTER.exec(rest);
          beside;
          beside = AMOUNT_DIRECTLY_AFTER.exec(rest)
        ) {
          add(line.pageIndex, beside[1]);
          rest = rest.slice(beside[0].length);
        }
      }
      for (const match of text.matchAll(FEE_BEFORE)) {
        add(line.pageIndex, match[1]);
        let before = text.slice(0, match.index);
        for (
          let beside = AMOUNT_DIRECTLY_BEFORE.exec(before);
          beside;
          beside = AMOUNT_DIRECTLY_BEFORE.exec(before)
        ) {
          add(line.pageIndex, beside[1]);
          before = before.slice(0, beside.index);
        }
      }
    }
  });
  return [...stated.values()];
}

/**
 * Why a prepared pet agreement cannot be kept, or an empty list. `drawnFees` are the values the
 * fill placed for the processing fee, exactly as they read back from the saved file. With no
 * published fee (`publishedFeeCents` null) the form may state no processing fee at all: an amount
 * nobody published is never the fee on a finished form.
 */
export async function petFeeConsistencyIssues(input: {
  output: Uint8Array;
  publishedFeeCents: number | null;
  drawnFees: readonly string[];
}): Promise<string[]> {
  const { publishedFeeCents } = input;
  const published =
    publishedFeeCents === null
      ? "no processing fee is published"
      : `the published fee is ${money(publishedFeeCents)}`;
  const issues: string[] = [];
  for (const drawn of input.drawnFees) {
    const match = new RegExp(`^${AMOUNT}$`).exec(drawn.trim());
    const agrees =
      publishedFeeCents === null
        ? drawn.trim() === ""
        : match !== null && cents(match[1]) === publishedFeeCents;
    if (!agrees)
      issues.push(
        `The processing fee placed on this form reads ${drawn.trim() || "blank"}, and ${published}.`,
      );
  }
  let lines: StaticTextLine[];
  try {
    lines = await readStaticPdfLines(input.output);
  } catch {
    // With no published fee there is no amount to compare, and the form's text stays as approved.
    if (publishedFeeCents === null) return issues;
    // A fee that cannot be read from the file's text cannot be shown to agree with the page.
    return [
      ...issues,
      "This form's text could not be read to compare its processing fee with the published fee, so the file was not kept.",
    ];
  }
  const stated = statedProcessingFees(lines);
  for (const page of [...new Set(stated.map((entry) => entry.pageIndex))]) {
    const other = [
      ...new Set(
        stated
          .filter(
            (entry) => entry.pageIndex === page && entry.cents !== publishedFeeCents,
          )
          .map((entry) => money(entry.cents)),
      ),
    ];
    if (other.length)
      issues.push(
        `Page ${page + 1} of this form states a processing fee of ${other.join(" and ")} in its text, and ${published}. ${
          publishedFeeCents === null
            ? "An Admin publishes the pet processing fee before this form is prepared."
            : "Use a corrected original, or a reviewed map region that replaces that exact text."
        }`,
      );
  }
  return issues;
}

const squeezed = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * Printed organization, representative or signer text that the original shows on its page and the
 * prepared file no longer does. Text the original's own text layer does not carry cannot be
 * compared and is left to the filler's proof that fixed content is unchanged.
 */
export async function lostPrintedText(input: {
  original: Uint8Array;
  output: Uint8Array;
  printed: ReadonlyArray<{ pageIndex: number; text: string }>;
}): Promise<string[]> {
  if (!input.printed.length) return [];
  let before: StaticTextLine[];
  let after: StaticTextLine[];
  try {
    [before, after] = await Promise.all([
      readStaticPdfLines(input.original),
      readStaticPdfLines(input.output),
    ]);
  } catch {
    return [];
  }
  const shows = (lines: readonly StaticTextLine[], pageIndex: number, text: string) =>
    lines.some(
      (line) => line.pageIndex === pageIndex && squeezed(line.text).includes(text),
    );
  const lost: string[] = [];
  for (const entry of input.printed) {
    const text = squeezed(entry.text);
    if (shows(before, entry.pageIndex, text) && !shows(after, entry.pageIndex, text))
      lost.push(
        `Page ${entry.pageIndex + 1}: printed text this form carries would be changed by this map. A change to printed organization, representative or signer text needs its form, page, exact replacement, signing role and who confirmed it.`,
      );
  }
  return [...new Set(lost)];
}
