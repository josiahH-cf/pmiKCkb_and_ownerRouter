// S34 AC-S34-6 (fail-first): an approved PDF reaches the provider transport byte for byte. The
// multipart body is assembled from bytes, never decoded as text, so bytes above 0x7f, zero bytes
// and CR/LF inside the PDF survive exactly, and the part framing is exact.

import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  buildMultipartFileBody,
  DotloopClient,
  DotloopClientError,
} from "@/lib/integrations/dotloop/client";
import { DotloopRequestScheduler } from "@/lib/integrations/dotloop/request-scheduler";
import { boundaryFromContentType, parseMultipart } from "@/tests/helpers/multipart";

function samplePdf(): Uint8Array {
  const head = new TextEncoder().encode("%PDF-1.7\n%âãÏÓ\n");
  const binary = new Uint8Array(4096);
  for (let index = 0; index < binary.length; index += 1) binary[index] = index % 256;
  const bytes = new Uint8Array(head.length + binary.length + 4);
  bytes.set(head, 0);
  bytes.set(binary, head.length);
  bytes.set([0x0d, 0x0a, 0x00, 0xff], head.length + binary.length);
  return bytes;
}

const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

describe("S34 binary upload transport (AC-S34-6)", () => {
  it("delivers the exact approved bytes in one well-formed file part", async () => {
    const pdf = samplePdf();
    let sent: { body?: unknown; headers: Record<string, string> } | null = null;
    const fetch = vi.fn(
      async (input: { body?: unknown; headers: Record<string, string> }) => {
        sent = input;
        return {
          status: 201,
          headers: {},
          json: async () => ({ data: { id: 77, name: "Renewal.pdf" } }),
        };
      },
    );
    const client = new DotloopClient({
      transport: { fetch },
      tokens: { accessToken: async () => "access", refresh: async () => null },
      scheduler: new DotloopRequestScheduler(),
    });
    await expect(
      client.uploadDocument({
        profileId: "10",
        loopId: "20",
        folderId: "30",
        fileName: "Renewal.pdf",
        contentType: "application/pdf",
        content: pdf,
      }),
    ).resolves.toEqual({ id: "77", name: "Renewal.pdf" });
    expect(sent).not.toBeNull();
    const request = sent as unknown as { body: unknown; headers: Record<string, string> };
    expect(request.body).toBeInstanceOf(Uint8Array);
    const boundary = boundaryFromContentType(request.headers["content-type"]);
    expect(boundary).toMatch(/^pmi-kc-/);
    const parts = parseMultipart(request.body as Uint8Array, boundary!);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({ name: "file", fileName: "Renewal.pdf" });
    expect(parts[0].headers["content-type"]).toBe("application/pdf");
    expect(sha(parts[0].data)).toBe(sha(pdf));
    expect(parts[0].data.length).toBe(pdf.length);
  });

  it("chooses a boundary that never occurs inside the file", () => {
    const pdf = samplePdf();
    const { body, boundary } = buildMultipartFileBody({
      fileName: "a.pdf",
      contentType: "application/pdf",
      content: pdf,
    });
    const parts = parseMultipart(body, boundary);
    expect(sha(parts[0].data)).toBe(sha(pdf));
  });

  it("refuses header injection through the file name or content type", () => {
    for (const fileName of ['a".pdf', "a\r\nX: y.pdf", "a\\b.pdf", " "]) {
      expect(() =>
        buildMultipartFileBody({
          fileName,
          contentType: "application/pdf",
          content: new Uint8Array(1),
        }),
      ).toThrow(DotloopClientError);
    }
    expect(() =>
      buildMultipartFileBody({
        fileName: "a.pdf",
        contentType: "application/pdf\r\nX: y",
        content: new Uint8Array(1),
      }),
    ).toThrow(DotloopClientError);
  });
});
