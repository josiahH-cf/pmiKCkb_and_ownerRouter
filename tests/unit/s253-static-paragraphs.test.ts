import { degrees } from "pdf-lib";
import { describe, expect, it } from "vitest";

import type { StaticPdfGeometry } from "@/lib/lease-documents/artifact-intake-contract";
import {
  fillStaticPdf,
  inspectStaticPdf,
  readStaticPdfValues,
} from "@/lib/lease-documents/static-pdf";
import { staticPage } from "@/tests/fixtures/synthetic-static";

// S253 ARCH-S253-2, BEH-S253-3, AC-S253-3: a multi-line region keeps the paragraphs staff typed,
// wraps inside its reviewed box at the reviewed size, and refuses text that does not fit with how
// much it is over. Synthetic form and wording only.

const BOX = { x: 72, y: 400, width: 300, height: 80 };
const TWO_PARAGRAPHS =
  "The owner asked for a twelve month term.\n\nRent stays at the current amount.";

function original(rotated = false) {
  return staticPage(
    [
      "BT /F1 12 Tf 1 0 0 1 72 740 Tm (SYNTHETIC OWNER FORM) Tj ET",
      "0 0 0 RG 72 400 300 80 re S",
    ],
    rotated ? (pdf) => pdf.getPage(0).setRotation(degrees(90)) : undefined,
  );
}

/** Built without the schema so the starting filler is asked for exactly this region. */
function boxGeometry(
  format: string,
  rect = BOX,
  rotation: 0 | 90 = 0,
): StaticPdfGeometry {
  return {
    pages: [{ pageIndex: 0, width: 612, height: 792, rotation, cropBox: null }],
    regions: [
      {
        regionId: "Explanation",
        fieldId: "Explanation",
        slot: 0,
        pageIndex: 0,
        rect,
        format,
        fontSize: 10,
        align: "left",
        existing: "blank",
      },
    ],
    protectedRegions: [],
  } as unknown as StaticPdfGeometry;
}

async function linesInBox(content: Uint8Array, rect = BOX) {
  const { runs } = await inspectStaticPdf(content);
  return runs
    .filter(
      (run) =>
        run.x >= rect.x - 1 &&
        run.x + run.width <= rect.x + rect.width + 1 &&
        run.y >= rect.y - 1 &&
        run.y + run.height <= rect.y + rect.height + 4,
    )
    .sort((left, right) => right.y - left.y);
}

describe("S253 paragraphs in a reviewed box (ARCH-S253-2)", () => {
  it("keeps two paragraphs as two paragraphs inside the box", async () => {
    const geometry = boxGeometry("paragraphs");
    const filled = await fillStaticPdf(await original(), geometry, [
      { regionId: "Explanation", text: TWO_PARAGRAPHS },
    ]);
    expect(filled.comparison.allFields.Explanation).toBe(TWO_PARAGRAPHS);
    expect((await readStaticPdfValues(filled.content, geometry)).Explanation).toBe(
      TWO_PARAGRAPHS,
    );
    const lines = await linesInBox(filled.content);
    expect(lines.map((line) => line.text.trim())).toEqual([
      "The owner asked for a twelve month term.",
      "Rent stays at the current amount.",
    ]);
    // One empty line separates the paragraphs: two line steps of 12 points at 10 point text.
    expect(lines[0].y - lines[1].y).toBeCloseTo(24, 1);
    // Every line starts at the box's left edge and stays the reviewed size.
    for (const line of lines) {
      expect(line.x).toBeCloseTo(BOX.x, 1);
      expect(line.height).toBeCloseTo(11.5, 1);
    }
  });

  it("wraps a long paragraph at word boundaries and reads back the exact text", async () => {
    const text =
      "Example Sample asked to keep the same lease dates and to hold the monthly rent, and the team agreed after reviewing the comparison for this unit.";
    const geometry = boxGeometry("paragraphs");
    const filled = await fillStaticPdf(await original(), geometry, [
      { regionId: "Explanation", text },
    ]);
    const lines = await linesInBox(filled.content);
    expect(lines.length).toBeGreaterThan(1);
    expect(
      lines
        .map((line) => line.text.trim())
        .join(" ")
        .replace(/\s+/g, " "),
    ).toBe(text);
    for (const line of lines)
      expect(line.x + line.width).toBeLessThanOrEqual(BOX.x + BOX.width + 0.75);
    expect((await readStaticPdfValues(filled.content, geometry)).Explanation).toBe(text);
  });

  it("refuses text that does not fit, with how much it is over, and never shrinks or cuts it", async () => {
    const text = Array.from(
      { length: 10 },
      (_, index) => `Synthetic paragraph ${index + 1} for the owner.`,
    ).join("\n\n");
    const attempt = fillStaticPdf(await original(), boxGeometry("paragraphs"), [
      { regionId: "Explanation", text },
    ]);
    // Ten one-line paragraphs need 19 lines; the box holds six: 13 lines over.
    await expect(attempt).rejects.toThrow(
      /Explanation: the text is 13 lines longer than its box holds, about \d+ characters/,
    );
    await expect(attempt).rejects.toThrow(
      /reviewed text size is kept and nothing is cut/,
    );
  });

  it("refuses a word wider than the box instead of breaking or shrinking it", async () => {
    await expect(
      fillStaticPdf(await original(), boxGeometry("paragraphs", { ...BOX, width: 40 }), [
        { regionId: "Explanation", text: "Synthetic-unbreakable-word-for-the-owner" },
      ]),
    ).rejects.toThrow(/a word is wider than its box/);
  });

  it("stands upright on a page displayed with a quarter turn", async () => {
    const geometry = boxGeometry(
      "paragraphs",
      { x: 400, y: 72, width: 80, height: 300 },
      90,
    );
    const filled = await fillStaticPdf(await original(true), geometry, [
      { regionId: "Explanation", text: TWO_PARAGRAPHS },
    ]);
    expect((await readStaticPdfValues(filled.content, geometry)).Explanation).toBe(
      TWO_PARAGRAPHS,
    );
  });

  it("still refuses a line break in a single-line region and any other control character", async () => {
    await expect(
      fillStaticPdf(await original(), boxGeometry("text"), [
        { regionId: "Explanation", text: "Line one\nLine two" },
      ]),
    ).rejects.toThrow(/line breaks and control characters are unsupported/);
    await expect(
      fillStaticPdf(await original(), boxGeometry("paragraphs"), [
        { regionId: "Explanation", text: "Bell\u0007 character" },
      ]),
    ).rejects.toThrow(/control characters are unsupported/);
  });
});
