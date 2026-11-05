// @vitest-environment jsdom

import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { installPollingErrorsWithoutDom } from "@/tests/helpers/polling-element-errors";

const DOM_DUMP = "Ignored nodes: comments";
let restore: (() => void) | null = null;
afterEach(() => {
  restore?.();
  restore = null;
  document.body.replaceChildren();
});

/** The messages of every failed check, and of the timeout error, for one missing text. */
async function pollForMissingText() {
  const checks: string[] = [];
  const timeout = await waitFor(
    () => {
      try {
        screen.getByText("Text that never appears");
      } catch (error) {
        checks.push((error as Error).message);
        throw error;
      }
    },
    { timeout: 200 },
  ).then(
    () => null,
    (error: Error) => error.message,
  );
  return { checks, timeout };
}

describe("installPollingErrorsWithoutDom", () => {
  it("leaves the DOM dump out of discarded check errors and keeps it everywhere else", async () => {
    document.body.innerHTML = "<main><p>Present text</p></main>";
    const native = await pollForMissingText();
    expect(native.checks.length).toBeGreaterThan(0);
    // testing-library formats the whole container on every failed check.
    expect(native.checks.every((message) => message.includes(DOM_DUMP))).toBe(true);

    restore = installPollingErrorsWithoutDom();
    const polled = await pollForMissingText();
    expect(polled.checks.length).toBeGreaterThan(0);
    expect(polled.checks.some((message) => message.includes(DOM_DUMP))).toBe(false);
    expect(polled.checks[0]).toContain("Unable to find an element with the text");
    // The timeout message is rebuilt outside the poll and keeps the dump.
    expect(polled.timeout).toContain("Unable to find an element with the text");
    expect(polled.timeout).toContain(DOM_DUMP);
    expect(polled.timeout).toContain("Present text");
    // An error raised outside a poll is unchanged.
    expect(() => screen.getByText("Text that never appears")).toThrow(DOM_DUMP);
    await expect(
      screen.findByText("Text that never appears", {}, { timeout: 100 }),
    ).rejects.toThrow(DOM_DUMP);

    restore();
    restore = null;
    const restored = await pollForMissingText();
    expect(restored.checks.every((message) => message.includes(DOM_DUMP))).toBe(true);
  });
});
