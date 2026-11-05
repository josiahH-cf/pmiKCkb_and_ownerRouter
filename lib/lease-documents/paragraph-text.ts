// S253 (R-S253-7, ARCH-S253-2): the one normal form of a text staff type in paragraphs. The packet
// input that stores it, the box preview and the static filler all read this same form, so what staff
// saved is exactly what a prepared form shows and reads back. Pure and client-safe.

/** The longest explanation the packet inputs keep; the reviewed box decides what fits a form. */
export const PARAGRAPH_TEXT_MAX_LENGTH = 4000;

/**
 * Line endings become line feeds, each line loses its outer spaces and runs of spaces or tabs
 * become one space, and more than one empty line between paragraphs becomes one. Words, their order
 * and every paragraph break staff typed are kept.
 */
export function normalizeParagraphText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The paragraphs of a normalized text, each still carrying its own line breaks. */
export function paragraphsOf(text: string): string[] {
  const normal = normalizeParagraphText(text);
  return normal === "" ? [] : normal.split("\n\n");
}
