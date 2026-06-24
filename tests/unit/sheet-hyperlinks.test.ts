import { describe, expect, it } from "vitest";
import {
  parseHyperlinkFormula,
  valuesToGridWithLinks,
} from "@/lib/google-sheets/sheet-to-grids";

describe("parseHyperlinkFormula", () => {
  it("parses url + text", () => {
    expect(
      parseHyperlinkFormula('=HYPERLINK("https://x.rentvine.com/leases/1","Guy")'),
    ).toEqual({ url: "https://x.rentvine.com/leases/1", text: "Guy" });
  });

  it("falls back to the url as text when no label is given", () => {
    expect(
      parseHyperlinkFormula('=HYPERLINK("https://x.rentvine.com/leases/1")'),
    ).toEqual({
      url: "https://x.rentvine.com/leases/1",
      text: "https://x.rentvine.com/leases/1",
    });
  });

  it("returns null for a non-formula cell", () => {
    expect(parseHyperlinkFormula("Guy and Jimmy")).toBeNull();
    expect(parseHyperlinkFormula("=SUM(A1:A2)")).toBeNull();
  });
});

describe("valuesToGridWithLinks", () => {
  it("splits display text from hyperlink urls cell-by-cell", () => {
    const { grid, links } = valuesToGridWithLinks([
      ['=HYPERLINK("https://x.rentvine.com/leases/1","Guy")', "plain"],
      [42, ""],
    ]);
    expect(grid).toEqual([
      ["Guy", "plain"],
      ["42", ""],
    ]);
    expect(links).toEqual([
      ["https://x.rentvine.com/leases/1", null],
      [null, null],
    ]);
  });

  it("handles an empty matrix", () => {
    expect(valuesToGridWithLinks(undefined)).toEqual({ grid: [], links: [] });
  });
});
