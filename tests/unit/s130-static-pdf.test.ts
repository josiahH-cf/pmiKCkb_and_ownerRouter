import { inflateSync } from "node:zlib";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  type PDFRef,
  PDFString,
  StandardFonts,
} from "pdf-lib";
import { describe, expect, it } from "vitest";

import {
  StaticPdfGeometrySchema,
  staticGeometryIssues,
} from "@/lib/lease-documents/artifact-intake-contract";
import {
  fillStaticPdf,
  formatStaticValue,
  inspectStaticPdf,
  readStaticPdfValues,
  readStaticPdfValuesByOrder,
  validateStaticGeometry,
} from "@/lib/lease-documents/static-pdf";
import { EditableLayerError } from "@/lib/errors/editable-layer-error";
import {
  geometry,
  objectsHolding,
  oneRegion,
  rectAround,
  runs,
  staticOriginal,
  staticPage,
  withDamagedPage,
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
    // An impossible day is refused instead of printing "undefined 1, 2026" or a non-date.
    for (const impossible of ["2026-13-01", "2026-02-30", "2026-00-10"]) {
      expect(() => formatStaticValue("date_long", impossible, null)).toThrow(
        /calendar date/,
      );
      expect(() => formatStaticValue("date_numeric", impossible, null)).toThrow(
        /calendar date/,
      );
    }
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

  it("leaves no object in the saved file that still holds a removed value (R-F10-04)", async () => {
    const original = await staticOriginal();
    const filled = await fillStaticPdf(original, await geometry(original), VALUES);
    expect(await objectsHolding(original, ["Old Tenant Name", "$900.00"])).not.toEqual(
      [],
    );
    // Not on the page and not in an unreferenced copy of the earlier page content either.
    expect(await objectsHolding(filled.content, ["Old Tenant Name", "$900.00"])).toEqual(
      [],
    );
    expect(filled.comparison.unchangedObjects).toBeGreaterThan(0);
    // Content a second page also draws would keep the earlier value there: refused.
    const pdf = await PDFDocument.load(original);
    const second = pdf.addPage([612, 792]);
    for (const key of ["Resources", "Contents"])
      second.node.set(PDFName.of(key), pdf.getPage(0).node.get(PDFName.of(key))!);
    const shared = await pdf.save({ useObjectStreams: false });
    await expect(fillStaticPdf(shared, await geometry(shared), VALUES)).rejects.toThrow(
      /Page 1: the text to replace is in content that other pages also use/,
    );
  });

  it("reads a page's content streams as one, so text split between them is seen and removed", async () => {
    const split = await staticPage([
      "BT /F1 11 Tf 1 0 0 1 120 600 Tm (Old Tenant Name)",
      "Tj ET",
    ]);
    const old = (await runs(split)).find((run) => run.text === "Old Tenant Name");
    expect(old).toBeDefined();
    expect(
      await validateStaticGeometry(split, oneRegion(rectAround(old!), "blank")),
    ).toEqual(["Name is not blank: existing text is inside it."]);
    const filled = await fillStaticPdf(split, oneRegion(rectAround(old!), "replace"), [
      { regionId: "Name", text: "Jane Doe" },
    ]);
    expect((await runs(filled.content)).map((run) => run.text)).toEqual(["Jane Doe"]);
    expect(await objectsHolding(filled.content, ["Old Tenant Name"])).toEqual([]);
  });

  it("isolates each value from graphics state the original leaves open and proves it lands in its region", async () => {
    const rect = { x: 120, y: 595, width: 200, height: 18 };
    const open = await staticPage([
      "BT /F1 11 Tf 1 0 0 1 72 600 Tm (Tenant: ) Tj ET",
      "2 0 0 2 0 0 cm q",
    ]);
    const filled = await fillStaticPdf(open, oneRegion(rect, "blank"), [
      { regionId: "Name", text: "Jane Doe" },
    ]);
    const drawn = (await runs(filled.content)).find((run) => run.text === "Jane Doe")!;
    expect(drawn.x).toBeGreaterThanOrEqual(rect.x);
    expect(drawn.y).toBeGreaterThanOrEqual(rect.y);
    expect(drawn.x + drawn.width).toBeLessThanOrEqual(rect.x + rect.width);
    expect(drawn.y + drawn.height).toBeLessThanOrEqual(rect.y + rect.height);
    // A restore with no matching save, or content left inside a text object, cannot be isolated.
    for (const content of [
      "Q BT /F1 11 Tf 1 0 0 1 72 600 Tm (Tenant: ) Tj ET",
      "BT /F1 11 Tf 1 0 0 1 72 600 Tm (Tenant: ) Tj",
    ])
      expect(
        await validateStaticGeometry(
          await staticPage([content]),
          oneRegion(rect, "blank"),
        ),
      ).toEqual([
        "Page 1's content is not balanced, so a value cannot be isolated from it.",
      ]);
  });

  it("measures standard-font text with its real glyph widths, so removal never moves later text", async () => {
    const helvetica = await (
      await PDFDocument.create()
    ).embedFont(StandardFonts.Helvetica);
    // Glyph by glyph: a shown string is never kerned.
    const width = (text: string) =>
      [...text].reduce(
        (total, character) => total + helvetica.widthOfTextAtSize(character, 11),
        0,
      );
    // An accented name with a long dash, shown in WinAnsi codes 351, 227 and 355 (octal).
    const name = String.fromCharCode(
      74,
      111,
      115,
      0xe9,
      32,
      0x2014,
      32,
      71,
      97,
      114,
      99,
      0xed,
      97,
    );
    const original = await staticPage([
      "BT /F1 11 Tf 1 0 0 1 72 560 Tm (Rent: ) Tj (Jos\\351 \\227 Garc\\355a) Tj ( per month) Tj ET",
    ]);
    const before = await runs(original);
    const old = before.find((run) => run.text === name)!;
    expect(old.width).toBeCloseTo(width(name), 3);
    const fixedAt = 72 + width("Rent: ") + width(name);
    expect(before.find((run) => run.text === " per month")!.x).toBeCloseTo(fixedAt, 3);
    const filled = await fillStaticPdf(original, oneRegion(rectAround(old), "replace"), [
      { regionId: "Name", text: "Ann" },
    ]);
    const after = await runs(filled.content);
    expect(after.find((run) => run.text === " per month")!.x).toBeCloseTo(fixedAt, 3);
    // A value is measured as drawn: kerning would shrink "AVAVAVAV" by 5.39 points.
    await expect(
      fillStaticPdf(
        original,
        oneRegion({ x: 300, y: 300, width: width("AVAVAVAV") - 1, height: 16 }, "blank"),
        [{ regionId: "Name", text: "AVAVAVAV" }],
      ),
    ).rejects.toThrow(/would overflow its region/);
    // A glyph whose width is unknown makes the page's positions unverifiable: refused.
    const builtIn = await staticPage(
      ["BT /F2 11 Tf 1 0 0 1 72 600 Tm (\\341) Tj ET"],
      (pdf, fonts) =>
        fonts.set(
          PDFName.of("F2"),
          pdf.context.register(
            pdf.context.obj({ Type: "Font", Subtype: "Type1", BaseFont: "Helvetica" }),
          ),
        ),
    );
    expect(
      await validateStaticGeometry(
        builtIn,
        oneRegion({ x: 300, y: 300, width: 100, height: 16 }, "blank"),
      ),
    ).toEqual([
      "Page 1 has text whose glyph widths are unknown, so its positions cannot be checked exactly.",
    ]);
  });

  it("refuses an annotation over a blank region too and lists every annotation for review", async () => {
    const covered = await staticPage(
      ["BT /F1 11 Tf 1 0 0 1 72 600 Tm (Tenant:) Tj ET"],
      (pdf) =>
        pdf.getPage(0).node.set(
          PDFName.of("Annots"),
          pdf.context.obj([
            pdf.context.register(
              pdf.context.obj({
                Type: "Annot",
                Subtype: "FreeText",
                Rect: [120, 596, 320, 612],
                Contents: PDFString.of("Old Tenant Name"),
                DA: PDFString.of("/Helv 11 Tf 0 g"),
              }),
            ),
          ]),
        ),
    );
    const blank = oneRegion({ x: 120, y: 596, width: 200, height: 16 }, "blank");
    // Its appearance would show over the drawn value.
    expect(await validateStaticGeometry(covered, blank)).toEqual([
      "Name: an annotation covers the region.",
    ]);
    expect((await inspectStaticPdf(covered)).annotations).toEqual([
      { pageIndex: 0, x: 120, y: 596, width: 200, height: 16, subtype: "FreeText" },
    ]);
  });

  it("binds to a crop box inherited from the page tree and to a media box away from the origin", async () => {
    const text = ["BT /F1 11 Tf 1 0 0 1 72 700 Tm (Tenant:) Tj ET"];
    const field = { fields: [{ fieldId: "Name", multiplicity: "single" as const }] };
    const offPage = ["Name: the region extends past the visible page."];
    const inherited = await staticPage(text, (pdf) =>
      pdf.catalog
        .lookup(PDFName.of("Pages"), PDFDict)
        .set(PDFName.of("CropBox"), pdf.context.obj([0, 396, 612, 792])),
    );
    expect((await inspectStaticPdf(inherited)).pages[0].cropBox).toEqual([
      0, 396, 612, 792,
    ]);
    const below = { x: 72, y: 100, width: 200, height: 16 };
    // A map that does not record the inherited crop is not this page.
    await expect(
      fillStaticPdf(inherited, oneRegion(below, "blank"), [
        { regionId: "Name", text: "Jane Doe" },
      ]),
    ).rejects.toThrow(/size, crop or rotation differs/);
    const cropped = oneRegion(below, "blank", { cropBox: [0, 396, 612, 792] });
    expect(staticGeometryIssues(field, cropped)).toEqual(offPage);
    expect(await validateStaticGeometry(inherited, cropped)).toEqual(offPage);

    const offset = await staticPage(text, (pdf) =>
      pdf
        .getPage(0)
        .node.set(PDFName.of("MediaBox"), pdf.context.obj([100, 100, 712, 892])),
    );
    expect((await inspectStaticPdf(offset)).pages).toEqual([
      {
        pageIndex: 0,
        width: 612,
        height: 792,
        rotation: 0,
        cropBox: [100, 100, 712, 892],
      },
    ]);
    const corner = { x: 10, y: 10, width: 80, height: 16 };
    const visible = oneRegion(corner, "blank", { cropBox: [100, 100, 712, 892] });
    expect(staticGeometryIssues(field, visible)).toEqual(offPage);
    expect(await validateStaticGeometry(offset, visible)).toEqual(offPage);
    expect(await validateStaticGeometry(offset, oneRegion(corner, "blank"))).toContain(
      "Page 1's size, crop or rotation differs from the reviewed geometry.",
    );
  });

  it("answers a damaged file with a typed refusal and reads back only the pages it filled", async () => {
    const original = await withDamagedPage(await staticOriginal());
    const refusal = await inspectStaticPdf(original).catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(EditableLayerError);
    expect(refusal).toMatchObject({
      status: 409,
      message: "Static PDF filling unavailable: a page's content cannot be decoded.",
    });
    // Any other library error leaves an entry point as the same typed refusal.
    const pdf = await PDFDocument.load(await staticOriginal());
    pdf.getPage(0).node.set(PDFName.of("Rotate"), PDFName.of("Sideways"));
    await expect(
      inspectStaticPdf(await pdf.save({ useObjectStreams: false })),
    ).rejects.toBeInstanceOf(EditableLayerError);
    // The damaged page is never filled, so neither the fill nor its read-back opens it.
    const map = await geometry(await staticOriginal());
    const filled = await fillStaticPdf(original, map, VALUES);
    const order = map.regions.map((region) => region.regionId);
    expect(await readStaticPdfValuesByOrder(filled.content, order)).toEqual(
      filled.comparison.allFields,
    );
    expect(await readStaticPdfValues(filled.content, map)).toEqual(
      filled.comparison.allFields,
    );
  });

  it("keeps the geometry's region order for region ids that look like numbers", async () => {
    const original = await staticOriginal();
    const base = await geometry(original);
    const ids: Record<string, string> = { Rent: "2", Effective: "10" };
    const map = StaticPdfGeometrySchema.parse({
      ...base,
      regions: base.regions.map((region) => ({
        ...region,
        regionId: ids[region.regionId] ?? region.regionId,
      })),
    });
    const filled = await fillStaticPdf(original, map, [
      { regionId: "TenantName", text: "Jane Doe" },
      { regionId: "2", text: "$950.00" },
      { regionId: "10", text: "" },
    ]);
    // A plain object would list "2" and "10" first; the record keeps the reviewed order.
    expect(filled.comparison.regionOrder).toEqual(["TenantName", "2", "10"]);
    expect(
      await readStaticPdfValuesByOrder(filled.content, filled.comparison.regionOrder),
    ).toEqual({ TenantName: "Jane Doe", "2": "$950.00", "10": "" });
  });

  it("refuses a region whose marked content carries replacement text, inline or named, blank or replaced", async () => {
    const refusal =
      "Name: marked content in the region carries replacement text that text extraction would still read. An approved clean master without replacement text on variable values is required.";
    const show = "BT /F1 11 Tf 1 0 0 1 120 600 Tm";
    const rect = { x: 118, y: 596, width: 200, height: 16 };
    // Inline /ActualText around the variable run: removing the glyphs would keep the old value.
    const inline = await staticPage([
      `${show} /Span <</ActualText (Old Tenant Name)>> BDC (Old Tenant Name) Tj EMC ET`,
    ]);
    expect(await validateStaticGeometry(inline, oneRegion(rect, "replace"))).toEqual([
      refusal,
    ]);
    await expect(
      fillStaticPdf(inline, oneRegion(rect, "replace"), [
        { regionId: "Name", text: "Jane Doe" },
      ]),
    ).rejects.toThrow(/without replacement text on variable values/);
    // /Alt named through the page's /Properties resource.
    const named = await staticPage(
      [`/Span /MC0 BDC ${show} (Old Tenant Name) Tj ET EMC`],
      (pdf) =>
        pdf
          .getPage(0)
          .node.lookup(PDFName.of("Resources"), PDFDict)
          .set(
            PDFName.of("Properties"),
            pdf.context.obj({ MC0: { Alt: PDFString.of("Old Tenant Name") } }),
          ),
    );
    expect(await validateStaticGeometry(named, oneRegion(rect, "replace"))).toEqual([
      refusal,
    ]);
    // A blank-looking region where only /E remains around a glyph-free advance.
    const leftover = await staticPage([
      `${show} /Span <</E (Old Tenant Name)>> BDC [-7000] TJ EMC ET`,
    ]);
    expect(await validateStaticGeometry(leftover, oneRegion(rect, "blank"))).toEqual([
      refusal,
    ]);
    // Marked content without replacement text, such as a structure tag, is filled as before.
    const tagged = await staticPage([
      `${show} /Span <</MCID 0>> BDC (Old Tenant Name) Tj EMC ET`,
    ]);
    const filled = await fillStaticPdf(tagged, oneRegion(rect, "replace"), [
      { regionId: "Name", text: "Jane Doe" },
    ]);
    expect(await objectsHolding(filled.content, ["Old Tenant Name"])).toEqual([]);
  });

  it("refuses a region whose marked-content id has replacement text on its structure element or an ancestor", async () => {
    const refusal =
      "Name: marked content in the region carries replacement text that text extraction would still read. An approved clean master without replacement text on variable values is required.";
    const show = "BT /F1 11 Tf 1 0 0 1 120 600 Tm";
    const rect = { x: 118, y: 596, width: 200, height: 16 };
    const old = () => PDFString.of("Old Tenant Name");
    /** A page whose /Span holds MCID 0, under the structure tree `kids` builds for the page. */
    const tagged = (
      kids: (pdf: PDFDocument, page: PDFRef) => unknown,
      operator = "/Span <</MCID 0>> BDC",
      properties?: Record<string, unknown>,
    ) =>
      staticPage([`${show} ${operator} (Old Tenant Name) Tj EMC ET`], (pdf) => {
        const page = pdf.getPage(0);
        const root = pdf.context.obj({ Type: "StructTreeRoot" });
        root.set(PDFName.of("K"), pdf.context.obj(kids(pdf, page.ref) as never));
        pdf.catalog.set(PDFName.of("StructTreeRoot"), pdf.context.register(root));
        if (properties)
          page.node
            .lookup(PDFName.of("Resources"), PDFDict)
            .set(PDFName.of("Properties"), pdf.context.obj(properties as never));
      });
    const element = (pdf: PDFDocument, entries: Record<string, unknown>) =>
      pdf.context.register(
        pdf.context.obj({ Type: "StructElem", S: "Span", ...entries } as never),
      );
    // /ActualText on the element that owns MCID 0: extraction would still read the old name.
    const own = await tagged((pdf, page) =>
      element(pdf, { Pg: page, K: 0, ActualText: old() }),
    );
    expect(await validateStaticGeometry(own, oneRegion(rect, "replace"))).toEqual([
      refusal,
    ]);
    await expect(
      fillStaticPdf(own, oneRegion(rect, "replace"), [
        { regionId: "Name", text: "Jane Doe" },
      ]),
    ).rejects.toThrow(/without replacement text on variable values/);
    // /Alt on an ancestor applies to everything below it, including the marked span.
    const ancestor = await tagged((pdf, page) =>
      element(pdf, {
        S: "P",
        Pg: page,
        Alt: old(),
        K: [element(pdf, { Pg: page, K: 0 })],
      }),
    );
    expect(await validateStaticGeometry(ancestor, oneRegion(rect, "replace"))).toEqual([
      refusal,
    ]);
    // /E on an element reaching the id through a marked-content reference, named in /Properties.
    const referenced = await tagged(
      (pdf, page) => element(pdf, { E: old(), K: { Type: "MCR", Pg: page, MCID: 0 } }),
      "/Span /MC0 BDC",
      { MC0: { MCID: 0 } },
    );
    expect(await validateStaticGeometry(referenced, oneRegion(rect, "replace"))).toEqual([
      refusal,
    ]);
    // Replacement text whose id names no page cannot be placed, so every id counts as covered.
    const unplaced = await tagged((pdf) => element(pdf, { K: 0, ActualText: old() }));
    expect(await validateStaticGeometry(unplaced, oneRegion(rect, "replace"))).toEqual([
      refusal,
    ]);
    // Replacement text on another id, or a structure element without any, leaves the fill as before.
    for (const clean of [
      await tagged((pdf, page) => element(pdf, { Pg: page, K: 1, ActualText: old() })),
      await tagged((pdf, page) => element(pdf, { S: "P", Pg: page, K: 0 })),
    ]) {
      const filled = await fillStaticPdf(clean, oneRegion(rect, "replace"), [
        { regionId: "Name", text: "Jane Doe" },
      ]);
      expect(
        await readStaticPdfValues(filled.content, oneRegion(rect, "replace")),
      ).toEqual({
        Name: "Jane Doe",
      });
    }
  });
});
