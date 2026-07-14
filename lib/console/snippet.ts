export const CONSOLE_SNIPPET_MAX_CHARACTERS = 240;
export const CONSOLE_SNIPPET_MAX_LINES = 3;

const BIDI_AND_CONTROL =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g;
const HTML_TAG = /<[^>]*>/g;

/** Plain, inert Unicode text only. React still escapes the resulting string at render time. */
export function boundConsoleSnippet(value: unknown): string {
  if (typeof value !== "string") return "";
  const lines = value
    .replace(/\r\n?/g, "\n")
    .replace(BIDI_AND_CONTROL, "")
    .replace(HTML_TAG, " ")
    .split("\n")
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .filter(Boolean)
    .slice(0, CONSOLE_SNIPPET_MAX_LINES);
  return Array.from(lines.join("\n")).slice(0, CONSOLE_SNIPPET_MAX_CHARACTERS).join("");
}
