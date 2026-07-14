import { describe, expect, it } from "vitest";
import {
  boundConsoleSnippet,
  CONSOLE_SNIPPET_MAX_CHARACTERS,
  CONSOLE_SNIPPET_MAX_LINES,
} from "@/lib/console/snippet";

describe("Console bounded snippets", () => {
  it("removes HTML/control/bidi instructions and remains inert text", () => {
    const result = boundConsoleSnippet(
      '<script>alert("fixture")</script>\u202E<b>visible fixture</b>\u0000',
    );
    expect(result).toBe('alert("fixture") visible fixture');
    expect(result).not.toMatch(/[<>\u202e\u0000]/);
  });

  it("caps Unicode code points and non-empty lines", () => {
    const result = boundConsoleSnippet(
      `${"🙂".repeat(300)}\nline two\nline three\nline four`,
    );
    expect(Array.from(result)).toHaveLength(CONSOLE_SNIPPET_MAX_CHARACTERS);
    expect(result.split("\n").length).toBeLessThanOrEqual(CONSOLE_SNIPPET_MAX_LINES);
    expect(result).not.toContain("line four");
  });

  it.each([null, undefined, 42, {}, new Uint8Array([0xff, 0xfe])])(
    "refuses malformed non-text input %#",
    (value) => {
      expect(boundConsoleSnippet(value)).toBe("");
    },
  );
});
