import { PDFDict, PDFDocument, PDFName, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { readPublicationPdfText } from "@/lib/lease-documents/static-pdf";
import { inspectProcessSensitivity } from "@/lib/publication/process-sensitivity";

async function simpleFont(text: string, differences?: Array<number | string>) {
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage().drawText(text, { font });
  await pdf.flush();
  const dict = pdf.context.lookup(font.ref, PDFDict);
  dict.set(PDFName.of("Subtype"), PDFName.of("TrueType"));
  dict.set(PDFName.of("BaseFont"), PDFName.of("SyntheticNonstandardFamily"));
  dict.set(PDFName.of("FirstChar"), pdf.context.obj(0));
  dict.set(PDFName.of("LastChar"), pdf.context.obj(255));
  dict.set(PDFName.of("Widths"), pdf.context.obj(Array(256).fill(500)));
  dict.set(PDFName.of("FontDescriptor"), pdf.context.obj({ Flags: 32 }));
  dict.set(
    PDFName.of("Encoding"),
    differences
      ? pdf.context.obj({
          Differences: differences.map((value) =>
            typeof value === "string" ? PDFName.of(value) : value,
          ),
        })
      : PDFName.of("WinAnsiEncoding"),
  );
  return pdf;
}

function iccBytes() {
  const bytes = Buffer.alloc(156);
  bytes.writeUInt32BE(bytes.length, 0);
  bytes.write("mntr", 12);
  bytes.write("RGB ", 16);
  bytes.write("XYZ ", 20);
  bytes.write("acsp", 36);
  bytes.writeUInt32BE(1, 128);
  bytes.write("desc", 132);
  bytes.writeUInt32BE(144, 136);
  bytes.writeUInt32BE(12, 140);
  bytes.write("text", 144);
  return bytes;
}
async function colorProfile(bytes = iccBytes(), owned = true) {
  const pdf = await PDFDocument.create(),
    page = pdf.addPage();
  const profile = pdf.context.register(pdf.context.flateStream(bytes, { N: 3 }));
  if (owned)
    page.node.set(
      PDFName.of("Resources"),
      pdf.context.obj({
        ColorSpace: { SyntheticRGB: [PDFName.of("ICCBased"), profile] },
      }),
    );
  return pdf.save();
}
async function vectorFont(program = "500 0 0 0 500 500 d1 0 0 10 10 re f", owned = true) {
  const pdf = await PDFDocument.create(),
    page = pdf.addPage();
  const glyph = pdf.context.register(pdf.context.flateStream(Buffer.from(program)));
  if (owned) {
    const unicode = pdf.context.register(
      pdf.context.flateStream(Buffer.from("1 beginbfchar\n<41> <0041>\nendbfchar")),
    );
    const font = pdf.context.register(
      pdf.context.obj({
        Type: "Font",
        Subtype: "Type3",
        FontBBox: [0, 0, 500, 500],
        FontMatrix: [0.001, 0, 0, 0.001, 0, 0],
        FirstChar: 65,
        LastChar: 65,
        Widths: [500],
        Encoding: { Differences: [65, PDFName.of("g0")] },
        CharProcs: { g0: glyph },
        ToUnicode: unicode,
      }),
    );
    page.node.set(
      PDFName.of("Resources"),
      pdf.context.obj({ Font: { Synthetic: font } }),
    );
    page.node.set(
      PDFName.of("Contents"),
      pdf.context.register(
        pdf.context.flateStream(Buffer.from("BT /Synthetic 10 Tf (A) Tj ET")),
      ),
    );
  }
  return pdf.save();
}

describe("S130 declared original font and auxiliary-stream formats", () => {
  it("decodes explicit WinAnsi for a nonstandard nonsymbolic TrueType family without guessing its name", async () => {
    expect(
      await readPublicationPdfText(await (await simpleFont("\u2019\u00ae")).save()),
    ).toContain("\u2019\u00ae");
  });
  it("uses only explicit Differences when BaseEncoding is absent, including question and nonbreaking space", async () => {
    const pdf = await simpleFont("?\u00a0A", [
      63,
      "question",
      65,
      "A",
      160,
      "nonbreakingspace",
    ]);
    expect(await readPublicationPdfText(await pdf.save())).toContain("?\u00a0A");
    const missing = await simpleFont("A", [63, "question"]);
    await expect(readPublicationPdfText(await missing.save())).rejects.toThrow(
      /complete decoded mapping/,
    );
    const unknown = await simpleFont("A", [65, "SyntheticUnknownGlyph"]);
    await expect(readPublicationPdfText(await unknown.save())).rejects.toThrow(
      /complete decoded mapping/,
    );
  });
  it("classifies only an owned, structurally bounded ICCBased RGB/XYZ color profile", async () => {
    await expect(readPublicationPdfText(await colorProfile())).resolves.toBeTypeOf(
      "string",
    );
    const bad = iccBytes();
    bad.writeUInt32BE(10_000, 136);
    await expect(readPublicationPdfText(await colorProfile(bad))).rejects.toThrow(
      /profile|ICC/i,
    );
    await expect(
      readPublicationPdfText(await colorProfile(iccBytes(), false)),
    ).rejects.toThrow(/unclassified|unreferenced/);
  });
  it("classifies only owned numeric vector Type3 glyph programs and still refuses hidden text/resource operations", async () => {
    expect(await readPublicationPdfText(await vectorFont())).toContain("A");
    await expect(
      readPublicationPdfText(await vectorFont("500 0 0 0 500 500 d1 (hidden) Tj")),
    ).rejects.toThrow(/glyph|Type3/i);
    await expect(
      readPublicationPdfText(await vectorFont("500 0 0 0 500 500 d1 /Hidden Do")),
    ).rejects.toThrow(/glyph|Type3/i);
    await expect(
      readPublicationPdfText(await vectorFont(undefined, false)),
    ).rejects.toThrow(/unclassified|unreferenced/);
    const text = await readPublicationPdfText(
      await vectorFont(
        "500 0 0 0 500 500 d1\n% Bearer synthetic-secret-value\n0 0 10 10 re f",
      ),
    );
    expect(inspectProcessSensitivity(Buffer.from(JSON.stringify({ text })))).toEqual({
      code: "sensitivity_violation",
      sensitivity: "High",
    });
  });
});
