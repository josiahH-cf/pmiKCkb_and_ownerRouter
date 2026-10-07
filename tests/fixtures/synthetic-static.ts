import { PDFDocument, PDFName, StandardFonts, degrees } from "pdf-lib";

import {
  StaticPdfGeometrySchema,
  type StaticPdfGeometry,
} from "@/lib/lease-documents/artifact-intake-contract";
import { inspectStaticPdf } from "@/lib/lease-documents/static-pdf";

// S130 (AC-S130-11, AC-S130-12, AC-S130-13): synthetic static originals only. Each fixture is built
// here with fixed wording, an earlier variable value to replace and a blank value line.
const PNG_1PX = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
  ),
);

export async function staticOriginal(
  options: { image?: boolean; rotate?: boolean; field?: boolean } = {},
) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const content = [
    "BT /F1 18 Tf 1 0 0 1 72 720 Tm (RESIDENTIAL LEASE EXTENSION) Tj ET",
    "BT /F1 11 Tf 1 0 0 1 72 600 Tm (Tenant: ) Tj (Old Tenant Name) Tj ET",
    "BT /F1 11 Tf 1 0 0 1 72 560 Tm (Monthly rent: ) Tj ($900.00) Tj ( per month) Tj ET",
    "BT /F1 11 Tf 1 0 0 1 72 520 Tm (New rent effective:) Tj ET",
    "0 0 0 RG 72 100 m 272 100 l S",
    "BT /F1 9 Tf 1 0 0 1 72 88 Tm (Tenant signature) Tj ET",
  ];
  const resources = pdf.context.obj({ Font: { F1: font.ref } });
  if (options.image) {
    const image = await pdf.embedPng(PNG_1PX);
    (resources as never as { set: (k: PDFName, v: unknown) => void }).set(
      PDFName.of("XObject"),
      pdf.context.obj({ Im1: image.ref }),
    );
    content.push("q 60 0 0 14 150 596 cm /Im1 Do Q");
  }
  page.node.set(PDFName.of("Resources"), resources);
  page.node.set(
    PDFName.of("Contents"),
    pdf.context.register(pdf.context.flateStream(content.join("\n"))),
  );
  if (options.rotate) page.setRotation(degrees(90));
  if (options.field)
    pdf.getForm().createTextField("Synthetic.Field").addToPage(page, { x: 400, y: 400 });
  return pdf.save({ useObjectStreams: false });
}

export async function runs(bytes: Uint8Array) {
  return (await inspectStaticPdf(bytes)).runs;
}

/** A region on a run's exact horizontal extent, with room above and below. */
export function rectAround(
  run: { x: number; y: number; width: number; height: number },
  pad = 2,
) {
  return { x: run.x, y: run.y - pad, width: run.width, height: run.height + 2 * pad };
}

export async function geometry(
  original: Uint8Array,
  overrides: Partial<StaticPdfGeometry> = {},
): Promise<StaticPdfGeometry> {
  const found = await runs(original);
  const oldName = found.find((run) => run.text === "Old Tenant Name")!;
  const oldRent = found.find((run) => run.text === "$900.00")!;
  const label = found.find((run) => run.text === "New rent effective:")!;
  return StaticPdfGeometrySchema.parse({
    pages: [{ pageIndex: 0, width: 612, height: 792, rotation: 0, cropBox: null }],
    regions: [
      {
        regionId: "TenantName",
        fieldId: "TenantName",
        slot: 0,
        pageIndex: 0,
        rect: rectAround(oldName),
        format: "text",
        fontSize: 11,
        align: "left",
        existing: "replace",
      },
      {
        regionId: "Rent",
        fieldId: "Rent",
        slot: 0,
        pageIndex: 0,
        rect: rectAround(oldRent),
        format: "money",
        fontSize: 11,
        align: "left",
        existing: "replace",
      },
      {
        regionId: "Effective",
        fieldId: "Effective",
        slot: 0,
        pageIndex: 0,
        rect: { x: label.x + label.width + 6, y: label.y - 2, width: 160, height: 16 },
        format: "date_long",
        fontSize: 11,
        align: "left",
        existing: "blank",
      },
    ],
    protectedRegions: [
      { pageIndex: 0, rect: { x: 70, y: 84, width: 210, height: 30 }, kind: "signature" },
    ],
    ...overrides,
  });
}
