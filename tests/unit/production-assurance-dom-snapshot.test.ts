// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { runInNewContext } from "node:vm";
import type { Page } from "playwright-core";
import { captureAssuranceDom } from "../../scripts/production-assurance-dom-snapshot";

describe("coherent memory-only assurance DOM snapshots", () => {
  it("captures one browser state and preserves exact selector cardinality, text and attributes", async () => {
    document.body.innerHTML =
      '<section><p data-state="ready"><a href="/exact">First</a><a href="/second">Second</a></p></section>';
    const evaluate = vi.fn(async (read, input) =>
      runInNewContext(`(${read.toString()})(input)`, { document, input }),
    );
    const snapshot = await captureAssuranceDom(
      { evaluate } as unknown as Page,
      { section: { p: { a: {} } } },
      ["href", "data-state"],
    );
    document.querySelector("a")!.textContent = "Changed after snapshot";
    const paragraph = snapshot.locator("section").locator("p");
    expect(await paragraph.getAttribute("data-state")).toBe("ready");
    expect(await paragraph.locator("a").count()).toBe(2);
    expect(await paragraph.locator("a").allTextContents()).toEqual(["First", "Second"]);
    expect(await paragraph.locator("a").nth(1).getAttribute("href")).toBe("/second");
    expect(evaluate).toHaveBeenCalledOnce();
  });

  it("refuses unplanned reads and missing or duplicate single-element assertions", async () => {
    document.body.innerHTML = "<section><span>A</span><span>B</span></section>";
    const evaluate = async (read: (input: unknown) => unknown, input: unknown) =>
      read(input);
    const snapshot = await captureAssuranceDom(
      { evaluate } as unknown as Page,
      { section: { span: {}, a: {} } },
      ["href"],
    );
    expect(() => snapshot.locator("unplanned")).toThrow(
      "assurance_snapshot_selector_unplanned",
    );
    const section = snapshot.locator("section");
    expect(() => section.locator("unplanned")).toThrow(
      "assurance_snapshot_selector_unplanned",
    );
    await expect(section.getAttribute("unplanned")).rejects.toThrow(
      "assurance_snapshot_attribute_unplanned",
    );
    await expect(section.locator("span").textContent()).rejects.toThrow(
      "assurance_snapshot_locator_not_unique",
    );
    await expect(section.locator("a").first().textContent()).rejects.toThrow(
      "assurance_snapshot_locator_not_unique",
    );
  });
});
