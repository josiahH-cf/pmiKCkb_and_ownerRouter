import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createStoreMock, putMock } = vi.hoisted(() => ({
  createStoreMock: vi.fn(),
  putMock: vi.fn(),
}));

// The photo action is closed by default in the seed registry (returns 409 before body validation), so
// force it open here to exercise the LR-01 MIME/magic-byte gate that sits after the schema parse.
vi.mock("@/lib/maintenance/photo-action", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/maintenance/photo-action")>();
  return {
    ...actual,
    getMaintenancePhotoActionView: vi.fn(() => ({
      actionKey: actual.MAINTENANCE_PHOTO_ACTION_KEY,
      executable: true,
      message: "ok",
      targetLabel: "test",
    })),
  };
});

vi.mock("@/lib/maintenance/image-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/maintenance/image-store")>();
  return { ...actual, createMaintenanceImageStore: createStoreMock };
});

import { POST } from "@/app/api/maintenance/photo/route";
import { setAuthResolverForTest } from "@/lib/auth/session";
import { sniffImageMime } from "@/lib/maintenance/image-mime";

function b64(bytes: number[]): string {
  return Buffer.from(bytes).toString("base64");
}

// Signatures padded to >= 12 bytes so the length guard passes.
const PNG = b64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = b64([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const WEBP = b64([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const HEIC = b64([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]);
const HTML = b64(Array.from(Buffer.from("<html><body>hi</body></html>")));
const PDF = b64(Array.from(Buffer.from("%PDF-1.4\nmalicious")));

describe("sniffImageMime (LR-01 magic-byte)", () => {
  it("maps each supported image signature to its canonical MIME", () => {
    expect(sniffImageMime(PNG)).toBe("image/png");
    expect(sniffImageMime(JPEG)).toBe("image/jpeg");
    expect(sniffImageMime(WEBP)).toBe("image/webp");
    expect(sniffImageMime(HEIC)).toBe("image/heic");
  });

  it("returns null for non-image content and truncated payloads", () => {
    expect(sniffImageMime(HTML)).toBeNull();
    expect(sniffImageMime(PDF)).toBeNull();
    // Too few bytes to carry any signature.
    expect(sniffImageMime(b64([0xff, 0xd8, 0xff]))).toBeNull();
    expect(sniffImageMime("")).toBeNull();
  });
});

describe("maintenance photo route MIME enforcement (LR-01)", () => {
  beforeEach(() => {
    setAuthResolverForTest(() => ({
      email: "editor@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Editor",
      scopes: ["maintenance"],
      uid: "editor-1",
    }));
    createStoreMock.mockReturnValue({ put: putMock });
    putMock.mockResolvedValue({ ref: "drive:ok" });
  });

  afterEach(() => {
    setAuthResolverForTest(null);
    createStoreMock.mockReset();
    putMock.mockReset();
  });

  function photoRequest(body: unknown) {
    return new Request("http://localhost/api/maintenance/photo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("stores a genuine image under its detected type", async () => {
    const response = await POST(
      photoRequest({ filename: "unit-a.png", mimeType: "image/png", base64: PNG }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ref: "drive:ok" });
    expect(putMock).toHaveBeenCalledOnce();
    expect(putMock.mock.calls[0][0]).toMatchObject({ mimeType: "image/png" });
  });

  // The sniff is AUTHORITATIVE: a genuine image whose client-declared type is wrong (e.g. a browser that
  // reports an empty type for a .heic file and falls back to image/jpeg) is stored under its TRUE detected
  // type, not rejected. This is the false-reject the strict declared==detected check would have caused.
  it("stores a genuine image under its DETECTED type even when the client mis-declares it", async () => {
    const response = await POST(
      photoRequest({ filename: "IMG_1234.heic", mimeType: "image/jpeg", base64: HEIC }),
    );

    expect(response.status).toBe(200);
    expect(putMock).toHaveBeenCalledOnce();
    // Stored under the true type (heic), NOT the mis-declared image/jpeg.
    expect(putMock.mock.calls[0][0]).toMatchObject({ mimeType: "image/heic" });
  });

  it("accepts a genuine image even when the declared type is junk (declared type is advisory)", async () => {
    const response = await POST(
      photoRequest({
        filename: "photo",
        mimeType: "application/octet-stream",
        base64: PNG,
      }),
    );

    expect(response.status).toBe(200);
    expect(putMock.mock.calls[0][0]).toMatchObject({ mimeType: "image/png" });
  });

  it("rejects non-image content declared as an image (HTML as image/png)", async () => {
    const response = await POST(
      photoRequest({ filename: "x.png", mimeType: "image/png", base64: HTML }),
    );

    expect(response.status).toBe(400);
    expect(putMock).not.toHaveBeenCalled();
  });

  it("rejects a PDF payload declared as an image", async () => {
    const response = await POST(
      photoRequest({ filename: "x.png", mimeType: "image/png", base64: PDF }),
    );

    expect(response.status).toBe(400);
    expect(putMock).not.toHaveBeenCalled();
  });

  it("rejects a non-image whatever type it is declared as", async () => {
    const response = await POST(
      photoRequest({ filename: "x.html", mimeType: "text/html", base64: HTML }),
    );

    expect(response.status).toBe(400);
    expect(putMock).not.toHaveBeenCalled();
  });
});
