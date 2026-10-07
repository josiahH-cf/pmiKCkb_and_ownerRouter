import { inflateSync } from "node:zlib";
import { PDFArray, PDFDocument, PDFName, PDFString } from "pdf-lib";
import { describe, expect, it } from "vitest";

import {
  StaticPdfGeometrySchema,
  staticGeometryIssues,
} from "@/lib/lease-documents/artifact-intake-contract";
import {
  fillStaticPdf,
  formatStaticValue,
  readStaticPdfValues,
  readStaticPdfValuesByOrder,
  validateStaticGeometry,
} from "@/lib/lease-documents/static-pdf";
import {
  geometry,
  rectAround,
  runs,
  staticOriginal,
} from "@/tests/fixtures/synthetic-static";

// S130 (AC-S130-11, AC-S130-12, AC-S130-13): synthetic static originals only, built by the shared
// fixture with fixed wording, an earlier variable value to replace and a blank value line.
const VALUES = [
  { regionId: "TenantName", text: "Jane Doe" },
  { regionId: "Rent", text: "$950.00" },
  { regionId: "Effective", text: "January 1, 2027" },
];

describe("S130 static PDF filling (AC-S130-11, AC-S130-12, AC-S130-13)", () => {
  it("fills reviewed regions, removes the earlier values and leaves every fixed run where it was", async () => {
    const original = await staticOriginal();
    const map = await geometry(original);
    expect(await validateStaticGeometry(original, map)).toEqual([]);
    const before = await runs(original);
    const filled = await fillStaticPdf(original, map, VALUES);
    expect(filled.comparison).toMatchObject({
      removedRuns: 2,
      pages: 1,
      fixedContentVerified: true,
      verified: true,
      allFields: {
        TenantName: "Jane Doe",
        Rent: "$950.00",
        Effective: "January 1, 2027",
      },
    });
    expect(await readStaticPdfValues(filled.content, map)).toEqual({
      TenantName: "Jane Doe",
      Rent: "$950.00",
      Effective: "January 1, 2027",
    });
    const after = await runs(filled.content);
    const texts = after.map((run) => run.text);
    // The earlier values are no longer extractable from the page.
    expect(texts).not.toContain("Old Tenant Name");
    expect(texts).not.toContain("$900.00");
    expect(texts).toEqual(
      expect.arrayContaining(["Jane Doe", "$950.00", "January 1, 2027"]),
    );
    // Fixed wording keeps its exact position, including text after a removed run on the same line.
    for (const fixed of [
      "RESIDENTIAL LEASE EXTENSION",
      "Tenant: ",
      "Monthly rent: ",
      " per month",
      "Tenant signature",
    ]) {
      const was = before.find((run) => run.text === fixed)!;
      const now = after.find((run) => run.text === fixed)!;
      expect([now.x, now.y], fixed).toEqual([was.x, was.y]);
    }
    // The same accepted inputs produce the same bytes.
    expect((await fillStaticPdf(original, map, VALUES)).outputHash).toBe(
      filled.outputHash,
    );
    expect(filled.originalHash).not.toBe(filled.outputHash);
  });

  it("leaves an unused repeat slot blank and draws nothing in a protected signature area", async () => {
    const original = await staticOriginal();
    const map = await geometry(original);
    const filled = await fillStaticPdf(original, map, [
      { regionId: "TenantName", text: "Jane Doe" },
      { regionId: "Rent", text: "$950.00" },
      { regionId: "Effective", text: "" },
    ]);
    expect((await readStaticPdfValues(filled.content, map)).Effective).toBe("");
    const signature = (await runs(filled.content)).filter(
      (run) => run.y < 115 && run.y + run.height > 84 && run.text !== "Tenant signature",
    );
    expect(signature).toEqual([]);
  });

  it("refuses a blank region that holds text and a region crossed by existing text", async () => {
    const original = await staticOriginal();
    const map = await geometry(original);
    const label = (await runs(original)).find(
      (run) => run.text === "New rent effective:",
    )!;
    const notBlank = {
      ...map,
      regions: map.regions.map((region) =>
        region.regionId === "Effective" ? { ...region, rect: rectAround(label) } : region,
      ),
    };
    expect(await validateStaticGeometry(original, notBlank)).toContain(
      "Effective is not blank: existing text is inside it.",
    );
    const oldName = (await runs(original)).find((run) => run.text === "Old Tenant Name")!;
    const crossing = {
      ...map,
      regions: map.regions.map((region) =>
        region.regionId === "TenantName"
          ? { ...region, rect: { ...rectAround(oldName), width: oldName.width / 2 } }
          : region,
      ),
    };
    expect(await validateStaticGeometry(original, crossing)).toContain(
      "TenantName: existing text crosses the region's edge.",
    );
    await expect(fillStaticPdf(original, crossing, VALUES)).rejects.toThrow(
      /crosses the region's edge/,
    );
  });

  it("refuses an image in a replaced region, a page that differs from the reviewed geometry, and a form with fields", async () => {
    const withImage = await staticOriginal({ image: true });
    expect(
      (await validateStaticGeometry(withImage, await geometry(withImage))).join(" "),
    ).toMatch(/an image overlaps the region and cannot be replaced exactly/);
    const original = await staticOriginal();
    const resized = await geometry(original, {
      pages: [{ pageIndex: 0, width: 600, height: 792, rotation: 0, cropBox: null }],
    });
    await expect(fillStaticPdf(original, resized, VALUES)).rejects.toThrow(
      /size, crop or rotation differs/,
    );
    const rotated = await staticOriginal({ rotate: true });
    await expect(
      fillStaticPdf(rotated, await geometry(original), VALUES),
    ).rejects.toThrow(/size, crop or rotation differs/);
    const withField = await staticOriginal({ field: true });
    await expect(
      validateStaticGeometry(withField, await geometry(original)),
    ).resolves.toEqual(["This file has form fields; review it as an AcroForm."]);
  });

  it("keeps a navigation-only link untouched and still refuses any other action", async () => {
    const withLink = async (
      action: Record<string, string | PDFString>,
      subtype = "Link",
    ) => {
      const pdf = await PDFDocument.load(await staticOriginal());
      const annot = pdf.context.obj({
        Type: "Annot",
        Subtype: subtype,
        Rect: [400, 400, 500, 420],
        A: action,
      });
      pdf
        .getPage(0)
        .node.set(PDFName.of("Annots"), pdf.context.obj([pdf.context.register(annot)]));
      return pdf.save({ useObjectStreams: false });
    };
    const linked = await withLink({
      S: "URI",
      URI: PDFString.of("https://example.invalid/"),
    });
    const original = await staticOriginal();
    const filled = await fillStaticPdf(linked, await geometry(original), VALUES);
    const reopened = await PDFDocument.load(filled.content);
    const annots = reopened.getPage(0).node.lookup(PDFName.of("Annots"), PDFArray);
    expect(annots.size()).toBe(1);
    await expect(
      fillStaticPdf(
        await withLink({ S: "JavaScript", JS: PDFString.of("app.alert(1)") }),
        await geometry(original),
        VALUES,
      ),
    ).rejects.toThrow(/unsupported/);
    await expect(
      fillStaticPdf(
        await withLink(
          { S: "URI", URI: PDFString.of("https://example.invalid/") },
          "Widget",
        ),
        await geometry(original),
        VALUES,
      ),
    ).rejects.toThrow(/unsupported/);
  });

  it("refuses overflow and characters the approved font cannot show, without shrinking text", async () => {
    const original = await staticOriginal();
    const map = await geometry(original);
    await expect(
      fillStaticPdf(original, map, [
        {
          regionId: "TenantName",
          text: "A very long tenant name that cannot fit this region",
        },
        { regionId: "Rent", text: "$950.00" },
        { regionId: "Effective", text: "January 1, 2027" },
      ]),
    ).rejects.toThrow(/would overflow its region/);
    await expect(
      fillStaticPdf(original, map, [
        { regionId: "TenantName", text: "Zoë ✓" },
        { regionId: "Rent", text: "$950.00" },
        { regionId: "Effective", text: "January 1, 2027" },
      ]),
    ).rejects.toThrow(/characters the approved font cannot show/);
  });

  it("refuses map geometry that overlaps, touches a protected area, leaves a slot gap or is too narrow across a rotated page", () => {
    const base = {
      pages: [
        { pageIndex: 0, width: 612, height: 792, rotation: 90 as const, cropBox: null },
      ],
      regions: [
        {
          regionId: "A",
          fieldId: "Party",
          slot: 0,
          pageIndex: 0,
          rect: { x: 100, y: 100, width: 100, height: 14 },
          format: "text" as const,
          fontSize: 10,
          align: "left" as const,
          existing: "blank" as const,
        },
        {
          regionId: "B",
          fieldId: "Party",
          slot: 2,
          pageIndex: 0,
          rect: { x: 150, y: 105, width: 100, height: 14 },
          format: "text" as const,
          fontSize: 10,
          align: "left" as const,
          existing: "blank" as const,
        },
      ],
      protectedRegions: [
        {
          pageIndex: 0,
          rect: { x: 90, y: 90, width: 20, height: 20 },
          kind: "signature" as const,
        },
      ],
    };
    // On a page displayed a quarter turn, a value stands across the region's width.
    base.regions.push({
      regionId: "C",
      fieldId: "Other",
      slot: 0,
      pageIndex: 0,
      rect: { x: 400, y: 400, width: 8, height: 100 },
      format: "text" as const,
      fontSize: 10,
      align: "left" as const,
      existing: "blank" as const,
    });
    const issues = staticGeometryIssues(
      {
        fields: [
          { fieldId: "Party", multiplicity: "per_party" },
          { fieldId: "Other", multiplicity: "single" },
        ],
      },
      base,
    );
    expect(issues).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/A: the region is shorter/)]),
    );
    expect(issues).toEqual(
      expect.arrayContaining([
        "C: the region is shorter than its text size.",
        "A and B overlap.",
        "A overlaps a protected signature area.",
        "Party: repeat slots must run 0, 1, 2 without a gap.",
      ]),
    );
  });

  it("formats values only in their reviewed unit and refuses a value of the wrong kind", () => {
    expect(formatStaticValue("money", 1450, "1450")).toBe("$1,450.00");
    expect(formatStaticValue("money", "$1,450.5", null)).toBe("$1,450.50");
    expect(formatStaticValue("money_cents", 145050, "$1,450.50")).toBe("$1,450.50");
    expect(formatStaticValue("date_long", "2027-01-01", "Jan 1")).toBe("January 1, 2027");
    expect(formatStaticValue("date_numeric", "2027-01-31", null)).toBe("01/31/2027");
    expect(formatStaticValue("checkmark", true, null)).toBe("X");
    expect(formatStaticValue("checkmark", false, null)).toBe("");
    expect(formatStaticValue("text", "SYNTHETIC", "SYNTHETIC shown")).toBe(
      "SYNTHETIC shown",
    );
    expect(() => formatStaticValue("money_cents", 12.5, null)).toThrow(/reviewed unit/);
    expect(() => formatStaticValue("money", "about 900", null)).toThrow(/reviewed unit/);
    expect(() => formatStaticValue("date_long", "next month", null)).toThrow(
      /calendar date/,
    );
    expect(() => formatStaticValue("checkmark", "yes", null)).toThrow(/yes or no/);
  });

  it("reads a saved output back by the region order its record keeps", async () => {
    const original = await staticOriginal();
    const map = await geometry(original);
    const filled = await fillStaticPdf(original, map, VALUES);
    const order = map.regions.map((region) => region.regionId);
    expect(await readStaticPdfValuesByOrder(filled.content, order)).toEqual(
      filled.comparison.allFields,
    );
    // A different order cannot pass for the same comparison.
    expect(
      await readStaticPdfValuesByOrder(filled.content, [...order].reverse()),
    ).not.toEqual(filled.comparison.allFields);
  });

  it("sets a value upright on a rotated page and fits it along the region's on-screen length", async () => {
    const rotated = await staticOriginal({ rotate: true });
    const rotatedGeometry = (rect: {
      x: number;
      y: number;
      width: number;
      height: number;
    }) =>
      StaticPdfGeometrySchema.parse({
        pages: [{ pageIndex: 0, width: 612, height: 792, rotation: 90, cropBox: null }],
        regions: [
          {
            regionId: "Note",
            fieldId: "Note",
            slot: 0,
            pageIndex: 0,
            rect,
            format: "text",
            fontSize: 10,
            align: "left",
            existing: "blank",
          },
        ],
        protectedRegions: [],
      });
    // Displayed a quarter turn clockwise, an on-screen line is a vertical strip in user space.
    const strip = rotatedGeometry({ x: 300, y: 250, width: 16, height: 160 });
    expect(await validateStaticGeometry(rotated, strip)).toEqual([]);
    const filled = await fillStaticPdf(rotated, strip, [
      { regionId: "Note", text: "SYNTHETIC note" },
    ]);
    expect(await readStaticPdfValues(filled.content, strip)).toEqual({
      Note: "SYNTHETIC note",
    });
    const reopened = await PDFDocument.load(filled.content);
    const contents = reopened.getPage(0).node.lookup(PDFName.of("Contents"), PDFArray);
    const last = reopened.context.lookup(contents.get(contents.size() - 1));
    const text = Buffer.from(
      inflateSync(Buffer.from((last as unknown as { contents: Uint8Array }).contents)),
    ).toString("latin1");
    // Turned counter to the page rotation, starting at the strip's on-screen left edge.
    expect(text).toMatch(/0\.000 1\.000 -1\.000 0\.000 \d+\.\d{3} 250\.000 Tm/);
    // A wide, short user-space box is only 16 points long on screen: the value overflows.
    await expect(
      fillStaticPdf(
        rotated,
        rotatedGeometry({ x: 300, y: 250, width: 160, height: 16 }),
        [{ regionId: "Note", text: "SYNTHETIC note" }],
      ),
    ).rejects.toThrow(/overflow its region/);
  });
});
