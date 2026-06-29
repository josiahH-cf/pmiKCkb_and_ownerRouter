// Maintenance photo storage seam (S4). Owner decision: Google Drive in-boundary (Q-MAINT-STORAGE).
// Mirrors the ModelProvider / STT seams: a free dev/test STUB stands in for a Drive adapter, selected by
// config and fenced from prod. The Drive adapter uploads to an in-boundary folder via the Drive v3
// multipart REST upload, authenticated as a pmikcmetro.com user via KEYLESS domain-wide delegation
// (lib/google-drive/drive-dwd.ts) — the same posture as the Sheets reader, NEVER the personal account.
// Stores return a reference (Drive file id / link), never the binary — callers keep only the ref.

import { mintDriveDwdToken } from "@/lib/google-drive/drive-dwd";

export interface MaintenanceImage {
  filename: string;
  mimeType: string;
  /** Base64-encoded image bytes (no data: prefix). */
  base64: string;
}

export interface StoredImage {
  /** Stable reference to the stored image (e.g. "drive:<fileId>" or a stub ref). */
  ref: string;
  /** Viewable link when the store provides one. */
  url?: string;
}

export interface MaintenanceImageStore {
  put(image: MaintenanceImage): Promise<StoredImage>;
}

export class ImageStoreSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageStoreSetupError";
  }
}

/** Free dev/test stand-in — returns a deterministic ref without uploading anything. */
export class StubMaintenanceImageStore implements MaintenanceImageStore {
  async put(image: MaintenanceImage): Promise<StoredImage> {
    return { ref: `stub:${image.filename}` };
  }
}

export interface ImageHttpRequest {
  method: "POST";
  url: string;
  headers: Record<string, string>;
  /** String for text bodies; Uint8Array for binary uploads (the Drive media part is raw bytes). */
  body: string | Uint8Array;
}
export interface ImageHttpResponse {
  status: number;
  json(): Promise<unknown>;
}
export interface ImageHttpTransport {
  send(request: ImageHttpRequest): Promise<ImageHttpResponse>;
}

function createImageFetchTransport(timeoutMs = 30_000): ImageHttpTransport {
  return {
    async send(request) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(request.url, {
          method: request.method,
          headers: request.headers,
          body: request.body as RequestInit["body"],
          signal: controller.signal,
        });
        const text = await response.text();
        return { status: response.status, json: async () => JSON.parse(text) as unknown };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

interface DriveFileResponse {
  id?: string;
  webViewLink?: string;
}

const MULTIPART_BOUNDARY = "maint-image-boundary";

/** Uploads to an in-boundary Drive folder via the v3 multipart upload (base64 media). */
export class DriveMaintenanceImageStore implements MaintenanceImageStore {
  private readonly transport: ImageHttpTransport;
  private readonly getAccessToken: () => Promise<string>;

  constructor(
    private readonly folderId: string | undefined,
    options: { transport?: ImageHttpTransport; getAccessToken?: () => Promise<string> } = {},
  ) {
    this.transport = options.transport ?? createImageFetchTransport();
    this.getAccessToken =
      options.getAccessToken ?? (() => mintDriveDwdToken());
  }

  async put(image: MaintenanceImage): Promise<StoredImage> {
    if (!this.folderId) {
      throw new ImageStoreSetupError(
        "No Drive folder configured for maintenance images (SPACE_DRIVE_FOLDER_IDS['maintenance-work-order-intake']).",
      );
    }
    const token = await this.getAccessToken();
    const metadata = { name: image.filename, parents: [this.folderId] };
    // Drive's multipart upload treats the media part as RAW bytes — it does NOT decode
    // Content-Transfer-Encoding. So the media part must be the decoded image bytes, not a base64 string;
    // build the body as a Buffer (utf8 metadata + raw media + closing boundary).
    const head =
      `--${MULTIPART_BOUNDARY}\r\n` +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      `${JSON.stringify(metadata)}\r\n` +
      `--${MULTIPART_BOUNDARY}\r\n` +
      `Content-Type: ${image.mimeType}\r\n\r\n`;
    const tail = `\r\n--${MULTIPART_BOUNDARY}--`;
    const body = Buffer.concat([
      Buffer.from(head, "utf8"),
      Buffer.from(image.base64, "base64"),
      Buffer.from(tail, "utf8"),
    ]);

    const response = await this.transport.send({
      method: "POST",
      url: "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": `multipart/related; boundary=${MULTIPART_BOUNDARY}`,
      },
      body,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new ImageStoreSetupError(`Drive upload returned HTTP ${response.status}.`);
    }

    let payload: DriveFileResponse;
    try {
      payload = (await response.json()) as DriveFileResponse;
    } catch {
      throw new ImageStoreSetupError("Drive upload returned a non-JSON response.");
    }
    if (!payload.id) {
      throw new ImageStoreSetupError("Drive upload returned no file id.");
    }
    return { ref: `drive:${payload.id}`, ...(payload.webViewLink ? { url: payload.webViewLink } : {}) };
  }
}

/** Build the configured store. Stub is selected unless prod resolved the Drive provider. */
export function createMaintenanceImageStore(
  config: { imageStore: "drive" | "stub"; maintenanceImageFolderId?: string },
  options: { transport?: ImageHttpTransport; getAccessToken?: () => Promise<string> } = {},
): MaintenanceImageStore {
  if (config.imageStore === "stub") {
    return new StubMaintenanceImageStore();
  }
  return new DriveMaintenanceImageStore(config.maintenanceImageFolderId, options);
}
