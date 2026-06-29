import { describe, expect, it } from "vitest";

import {
  DriveMaintenanceImageStore,
  ImageStoreSetupError,
  StubMaintenanceImageStore,
  createMaintenanceImageStore,
  type ImageHttpRequest,
  type ImageHttpResponse,
  type ImageHttpTransport,
  type MaintenanceImageStore,
} from "@/lib/maintenance/image-store";

// Maintenance photo-storage seam (S4). The free stub stands in for Google Drive (in-boundary), selected
// by config + fenced from prod. The Drive adapter is tested with an injected transport (offline/free).

function transport(status: number, body: unknown): ImageHttpTransport & { last?: ImageHttpRequest } {
  const t: ImageHttpTransport & { last?: ImageHttpRequest } = {
    async send(request: ImageHttpRequest): Promise<ImageHttpResponse> {
      t.last = request;
      return { status, json: async () => body };
    },
  };
  return t;
}

const IMAGE = { filename: "leak.jpg", mimeType: "image/jpeg", base64: "AAAA" };

describe("StubMaintenanceImageStore", () => {
  it("returns a deterministic ref without uploading", async () => {
    const store: MaintenanceImageStore = new StubMaintenanceImageStore();
    expect(await store.put(IMAGE)).toEqual({ ref: "stub:leak.jpg" });
  });
});

describe("createMaintenanceImageStore", () => {
  it("returns the stub when configured", () => {
    expect(createMaintenanceImageStore({ imageStore: "stub" })).toBeInstanceOf(
      StubMaintenanceImageStore,
    );
  });

  it("returns the Drive store when configured", () => {
    const store = createMaintenanceImageStore(
      { imageStore: "drive", maintenanceImageFolderId: "f1" },
      { transport: transport(200, {}), getAccessToken: async () => "t" },
    );
    expect(store).toBeInstanceOf(DriveMaintenanceImageStore);
  });
});

describe("DriveMaintenanceImageStore", () => {
  it("uploads to the configured folder and returns a drive ref + link", async () => {
    const t = transport(200, { id: "file123", webViewLink: "https://drive/x" });
    const store = new DriveMaintenanceImageStore("folder9", {
      transport: t,
      getAccessToken: async () => "tok",
    });

    const result = await store.put(IMAGE);

    expect(result).toEqual({ ref: "drive:file123", url: "https://drive/x" });
    expect(t.last?.headers.authorization).toBe("Bearer tok");
    // The body is a binary Buffer: metadata (folder + mime) as text, the media part as DECODED bytes —
    // not the base64 text, and no Content-Transfer-Encoding header (Drive stores the media part raw).
    const body = Buffer.from(t.last?.body as Uint8Array);
    const bodyText = body.toString("latin1");
    expect(bodyText).toContain("folder9");
    expect(bodyText).toContain("image/jpeg");
    expect(bodyText).not.toContain("AAAA");
    expect(bodyText).not.toContain("Content-Transfer-Encoding");
    expect(body.includes(Buffer.from("AAAA", "base64"))).toBe(true);
  });

  it("uses a unique per-upload multipart boundary that delimits the body", async () => {
    const t1 = transport(200, { id: "a" });
    const t2 = transport(200, { id: "b" });
    await new DriveMaintenanceImageStore("f", { transport: t1, getAccessToken: async () => "t" }).put(
      IMAGE,
    );
    await new DriveMaintenanceImageStore("f", { transport: t2, getAccessToken: async () => "t" }).put(
      IMAGE,
    );

    const boundaryOf = (req?: { headers: Record<string, string> }) =>
      /boundary=(\S+)/.exec(req?.headers["content-type"] ?? "")?.[1];
    const b1 = boundaryOf(t1.last);
    const b2 = boundaryOf(t2.last);

    expect(b1).toMatch(/^maint-image-/);
    expect(b1).not.toBe(b2); // per-upload, not a static boundary
    expect(Buffer.from(t1.last?.body as Uint8Array).toString("latin1")).toContain(`--${b1}`);
  });

  it("throws when no Drive folder is configured", async () => {
    const store = new DriveMaintenanceImageStore(undefined, {
      transport: transport(200, {}),
      getAccessToken: async () => "t",
    });
    await expect(store.put(IMAGE)).rejects.toBeInstanceOf(ImageStoreSetupError);
  });

  it("throws on a non-2xx response", async () => {
    const store = new DriveMaintenanceImageStore("f", {
      transport: transport(500, {}),
      getAccessToken: async () => "t",
    });
    await expect(store.put(IMAGE)).rejects.toBeInstanceOf(ImageStoreSetupError);
  });

  it("throws ImageStoreSetupError on a 2xx with a non-JSON body", async () => {
    const store = new DriveMaintenanceImageStore("f", {
      transport: {
        async send() {
          return {
            status: 200,
            json: async () => {
              throw new SyntaxError("not json");
            },
          };
        },
      },
      getAccessToken: async () => "t",
    });
    await expect(store.put(IMAGE)).rejects.toBeInstanceOf(ImageStoreSetupError);
  });

  it("throws when Drive returns no file id", async () => {
    const store = new DriveMaintenanceImageStore("f", {
      transport: transport(200, {}),
      getAccessToken: async () => "t",
    });
    await expect(store.put(IMAGE)).rejects.toBeInstanceOf(ImageStoreSetupError);
  });
});
