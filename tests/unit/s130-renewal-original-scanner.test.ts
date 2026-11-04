import { createHash } from "node:crypto";
import { PDFDict, PDFDocument, PDFName, StandardFonts } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";
import { ManagedRenewalOriginalScanner } from "@/lib/publication/renewal-original-scanner";
import { stablePublicationResourceId } from "@/lib/publication/resource-id";
import type {
  PublicationMetadata,
  RenewalOriginalPublicationScope,
} from "@/lib/publication/types";
import { readPublicationPdfText } from "@/lib/lease-documents/static-pdf";

async function fixture(text = "Synthetic blank renewal original") {
  const pdf = await PDFDocument.create();
  pdf
    .addPage()
    .drawText(text, { font: await pdf.embedFont(StandardFonts.Helvetica), size: 10 });
  const content = await pdf.save();
  const hash = createHash("sha256").update(content).digest("hex");
  const scope: RenewalOriginalPublicationScope = {
    resourceType: "file",
    resourceId: stablePublicationResourceId(
      "fixture",
      "originals",
      "lease-renewals",
      "sources/blank.pdf",
    ),
    artifactKind: "renewal_extension",
    path: "sources/blank.pdf",
    fileName: "blank.pdf",
    contentHash: hash,
    byteSize: content.byteLength,
    reviewedBlankOriginal: true,
    reviewedNoClientData: true,
  };
  const metadata: PublicationMetadata = {
    ...scope,
    connectorId: "fixture",
    rootId: "originals",
    spaceId: "lease-renewals",
    declaredByteSize: content.byteLength,
    declaredMimeType: "application/pdf",
    renewalArtifactKind: scope.artifactKind,
    citationLabel: "Synthetic original",
    sourceState: "Verified Source",
  };
  const evidence = {
    protocol: "pmi-publication-scan/v1",
    contentHash: hash,
    scannedBytes: content.byteLength,
    malware: "clean",
    engineVersion: "1.4.6",
    dailyVersion: 28173,
    dailyTimestamp: "2026-11-03T06:27:52Z",
  };
  const request = vi.fn(async () => ({ status: 200, body: evidence }));
  const scanner = new ManagedRenewalOriginalScanner(scope, {
    request,
    now: () => "2026-11-03T14:00:00Z",
  });
  return { content, scope, metadata, evidence, request, scanner };
}

describe("S130 managed exact blank-original PDF scanner", () => {
  it("sends actual original PDF bytes with their PDF type to the separate engine seam", async () => {
    const { scanner, content, metadata, request } = await fixture();
    expect(await scanner.scanMalware(content, metadata)).toEqual({ code: "clean" });
    expect(request).toHaveBeenCalledExactlyOnceWith({
      method: "POST",
      url: "https://pmi-kc-publication-scanner-kq6wuvpiva-uc.a.run.app/v1/scan-renewal-original",
      body: content,
      contentType: "application/pdf",
    });
    expect(await scanner.scanSensitivity(content, metadata)).toEqual({
      code: "clean",
      sensitivity: "Low",
    });
  });
  it("refuses changed bytes, wrong family/path/Space, malformed PDF and process JSON before contacting the engine", async () => {
    const { scanner, content, metadata, request, scope } = await fixture();
    for (const changed of [
      { ...metadata, resourceType: "process_definition" as const },
      { ...metadata, spaceId: "owner-renewal-outreach" },
      { ...metadata, renewalArtifactKind: "standard_lease" as const },
      { ...metadata, path: "sources/other.pdf" },
    ])
      expect(await scanner.scanMalware(content, changed)).toEqual({
        code: "scanner_unavailable",
      });
    expect(await scanner.scanMalware(new Uint8Array([1, 2]), metadata)).toEqual({
      code: "scanner_unavailable",
    });
    const malformed = new Uint8Array(content.length).fill(65);
    const malformedScanner = new ManagedRenewalOriginalScanner(
      { ...scope, contentHash: createHash("sha256").update(malformed).digest("hex") },
      { request },
    );
    expect(await malformedScanner.scanMalware(malformed, metadata)).toEqual({
      code: "content_unsupported",
    });
    expect(request).not.toHaveBeenCalled();
  });
  it("distinguishes engine detection, outage and evidence that does not bind the bytes or pinned engine", async () => {
    const { scanner, content, metadata, evidence, request } = await fixture();
    request.mockResolvedValueOnce({
      status: 200,
      body: { ...evidence, malware: "malware_detected" },
    });
    expect(await scanner.scanMalware(content, metadata)).toEqual({
      code: "malware_detected",
    });
    request.mockResolvedValueOnce({ status: 503, body: evidence });
    expect(await scanner.scanMalware(content, metadata)).toEqual({
      code: "scanner_unavailable",
    });
    for (const mismatch of [
      { contentHash: "0".repeat(64) },
      { scannedBytes: content.byteLength + 1 },
      { engineVersion: "1.4.5" },
      { dailyTimestamp: "2026-10-30T06:00:00Z" },
      { dailyTimestamp: "2026-11-04T06:00:00Z" },
    ]) {
      request.mockResolvedValueOnce({ status: 200, body: { ...evidence, ...mismatch } });
      expect(await scanner.scanMalware(content, metadata)).toEqual({
        code: "evidence_mismatch",
      });
    }
    request.mockResolvedValueOnce({
      status: 200,
      body: { ...evidence, malware: "unknown" },
    });
    expect(await scanner.scanMalware(content, metadata)).toEqual({
      code: "scanner_unavailable",
    });
  });
  it("reports unsupported and undecodable originals distinctly from an outage and never sends them to the engine", async () => {
    const { scope, metadata, request } = await fixture();
    const scannerFor = (bytes: Uint8Array) =>
      new ManagedRenewalOriginalScanner(
        {
          ...scope,
          contentHash: createHash("sha256").update(bytes).digest("hex"),
          byteSize: bytes.length,
        },
        { request },
      );
    const active = await PDFDocument.create();
    active.addPage();
    active.catalog.set(PDFName.of("OpenAction"), active.context.obj({}));
    const activeBytes = await active.save();
    expect(
      await scannerFor(activeBytes).scanMalware(activeBytes, {
        ...metadata,
        declaredByteSize: activeBytes.length,
      }),
    ).toEqual({ code: "content_unsupported" });
    // An object stream the parser consumes while loading, declaring no objects but carrying text:
    // never enumerated, so it must be refused by accounting for the container's own bytes.
    const hidden = await PDFDocument.create();
    hidden.addPage();
    hidden.context.register(
      hidden.context.flateStream(
        Buffer.from("BT /F1 12 Tf (Bearer synthetic-secret-value) Tj ET"),
        { Type: "ObjStm", N: 0, First: 0 },
      ),
    );
    const hiddenBytes = await hidden.save({ useObjectStreams: false });
    await expect(readPublicationPdfText(hiddenBytes)).rejects.toThrow(
      /do not account for/,
    );
    expect(
      await scannerFor(hiddenBytes).scanSensitivity(hiddenBytes, {
        ...metadata,
        declaredByteSize: hiddenBytes.length,
      }),
    ).toEqual({ code: "content_undecodable" });
    expect(request).not.toHaveBeenCalled();
    // Genuine object streams, fully accounted for by their declared objects, still read.
    const genuine = await PDFDocument.create();
    genuine.addPage().drawText("Blank", {
      font: await genuine.embedFont(StandardFonts.Helvetica),
      size: 10,
    });
    const genuineBytes = await genuine.save({ useObjectStreams: true });
    expect(await readPublicationPdfText(genuineBytes)).toContain("Blank");
  });
  it("checks complete decoded text rather than the capped Admin preview", async () => {
    const pdf = await PDFDocument.create(),
      font = await pdf.embedFont(StandardFonts.Helvetica);
    for (let i = 0; i < 20; i++) {
      const page = pdf.addPage();
      for (let j = 0; j < 260; j++)
        page.drawText("Blank", { font, size: 1, x: j % 20, y: 10 + j });
    }
    pdf.getPages()[19].drawText("123-45-6789", { font, size: 5 });
    const bytes = await pdf.save();
    const text = await readPublicationPdfText(bytes);
    expect(text).toContain("123-45-6789");
    const { scope, metadata, request } = await fixture();
    const scanner = new ManagedRenewalOriginalScanner(
      {
        ...scope,
        contentHash: createHash("sha256").update(bytes).digest("hex"),
        byteSize: bytes.length,
      },
      { request },
    );
    expect(
      await scanner.scanSensitivity(bytes, {
        ...metadata,
        declaredByteSize: bytes.length,
      }),
    ).toEqual({ code: "sensitivity_violation", sensitivity: "High" });
  });
  it("refuses hidden orphan text, incomplete glyph decoding and filled hidden fields rather than declaring them clean", async () => {
    const orphan = await PDFDocument.create();
    orphan.addPage();
    orphan.context.register(
      orphan.context.flateStream(
        Buffer.from("BT /F1 12 Tf (Bearer synthetic-secret-value) Tj ET"),
      ),
    );
    await expect(readPublicationPdfText(await orphan.save())).rejects.toThrow(
      /unclassified|unreferenced/,
    );
    const hidden = await PDFDocument.create();
    hidden.addPage();
    hidden.getForm().createTextField("hidden-value").setText("Synthetic existing person");
    await expect(readPublicationPdfText(await hidden.save())).rejects.toThrow(
      /existing form field values/,
    );
    const undecodable = await PDFDocument.create(),
      font = await undecodable.embedFont(StandardFonts.Helvetica);
    undecodable.addPage().drawText("A", { font });
    await undecodable.flush();
    undecodable.context.lookup(font.ref, PDFDict).set(
      PDFName.of("Encoding"),
      undecodable.context.obj({
        Type: "Encoding",
        BaseEncoding: "WinAnsiEncoding",
        Differences: [65, PDFName.of("UnmappedSyntheticGlyph")],
      }),
    );
    await expect(readPublicationPdfText(await undecodable.save())).rejects.toThrow(
      /complete decoded mapping/,
    );
    const form = await PDFDocument.create();
    form.addPage();
    form.context.register(
      form.context.flateStream(
        Buffer.from("BT /F1 12 Tf (Bearer synthetic-secret-value) Tj ET"),
        {
          Type: "XObject",
          Subtype: "Form",
          BBox: [0, 0, 10, 10],
        },
      ),
    );
    await expect(readPublicationPdfText(await form.save())).rejects.toThrow(
      /Form XObject/,
    );
  });
});
