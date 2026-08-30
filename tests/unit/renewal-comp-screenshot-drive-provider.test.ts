import { describe, expect, it, vi } from "vitest";

import {
  MAX_RENEWAL_COMP_SCREENSHOT_BYTES,
  RENEWAL_COMP_SCREENSHOT_DRIVE_FIELDS,
  RENEWAL_COMP_SCREENSHOT_FOLDER_FIELDS,
  RENEWAL_COMP_SCREENSHOT_FOLDER_MIME,
  GoogleDriveRenewalCompScreenshotProvider,
  RenewalCompScreenshotDriveInputError,
  type CreateReservedRenewalCompScreenshotInput,
  type RenewalCompScreenshotDriveFetch,
} from "@/lib/google-drive/renewal-comp-screenshot";

const FILE_ID = "reserved_file_123";
const FOLDER_ID = "approved_folder_456";
const TOKEN = "drive-token";
const APP_PROPERTIES = {
  execution: "execution_1",
  preview_hash: "a".repeat(64),
};
const BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

function driveFile(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: FILE_ID,
    name: "renewal-comp-execution_1.png",
    mimeType: "image/png",
    size: String(BYTES.byteLength),
    md5Checksum: "1".repeat(32),
    sha256Checksum: "2".repeat(64),
    parents: [FOLDER_ID],
    trashed: false,
    explicitlyTrashed: false,
    appProperties: APP_PROPERTIES,
    createdTime: "2026-07-30T01:00:00.000Z",
    modifiedTime: "2026-07-30T01:00:00.000Z",
    version: "1",
    headRevisionId: "head_revision_1",
    webViewLink: `https://drive.google.com/file/d/${FILE_ID}/view`,
    isAppAuthorized: true,
    ownedByMe: true,
    capabilities: {
      canTrash: true,
      canUntrash: false,
      canMoveItemOutOfDrive: false,
    },
    ...overrides,
  };
}

function driveFolder(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: FOLDER_ID,
    mimeType: RENEWAL_COMP_SCREENSHOT_FOLDER_MIME,
    trashed: false,
    version: "7",
    isAppAuthorized: true,
    ownedByMe: true,
    capabilities: {
      canAddChildren: true,
    },
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function providerWith(fetchImpl: RenewalCompScreenshotDriveFetch) {
  return new GoogleDriveRenewalCompScreenshotProvider({
    fetchImpl,
    getAccessToken: async () => TOKEN,
  });
}

function fetchMock(implementation: RenewalCompScreenshotDriveFetch) {
  return vi.fn(implementation);
}

function createInput(
  overrides: Partial<CreateReservedRenewalCompScreenshotInput> = {},
): CreateReservedRenewalCompScreenshotInput {
  return {
    fileId: FILE_ID,
    parentFolderId: FOLDER_ID,
    name: "renewal-comp-execution_1.png",
    mimeType: "image/png",
    appProperties: APP_PROPERTIES,
    bytes: BYTES,
    ...overrides,
  };
}

function requestHeaders(init: RequestInit): Headers {
  return new Headers(init.headers);
}

function multipartMetadata(init: RequestInit): {
  boundary: string;
  metadata: Record<string, unknown>;
  body: Buffer;
} {
  const contentType = requestHeaders(init).get("content-type") ?? "";
  const boundary = /boundary=([^\s;]+)/.exec(contentType)?.[1];
  expect(boundary).toBeTruthy();

  const body = Buffer.from(init.body as Uint8Array);
  const text = body.toString("latin1");
  const metadataStart = text.indexOf("\r\n\r\n") + 4;
  const metadataEnd = text.indexOf(`\r\n--${boundary}`, metadataStart);
  expect(metadataStart).toBeGreaterThan(3);
  expect(metadataEnd).toBeGreaterThan(metadataStart);

  return {
    boundary: boundary!,
    metadata: JSON.parse(text.slice(metadataStart, metadataEnd)) as Record<
      string,
      unknown
    >,
    body,
  };
}

describe("GoogleDriveRenewalCompScreenshotProvider.reserveFileId", () => {
  it("uses Drive generateIds with exactly one drive-space file ID", async () => {
    const fetchImpl = fetchMock(async () =>
      jsonResponse(200, {
        ids: [FILE_ID],
        space: "drive",
        kind: "drive#generatedIds",
      }),
    );

    const result = await providerWith(fetchImpl).reserveFileId();

    expect(result).toEqual({ outcome: "reserved", fileId: FILE_ID });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [rawUrl, init] = fetchImpl.mock.calls[0]!;
    const url = new URL(rawUrl);
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://www.googleapis.com/drive/v3/files/generateIds",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      count: "1",
      space: "drive",
      type: "files",
    });
    expect(init.method).toBe("GET");
    expect(requestHeaders(init).get("authorization")).toBe(`Bearer ${TOKEN}`);
  });

  it("treats a malformed 2xx generateIds body as ambiguous", async () => {
    const fetchImpl = fetchMock(async () =>
      jsonResponse(200, { ids: [FILE_ID, "unexpected_second_id"], space: "drive" }),
    );

    expect(await providerWith(fetchImpl).reserveFileId()).toEqual({
      outcome: "ambiguous",
      certainty: "unknown",
      reason: "invalid_response",
      httpStatus: 200,
    });
  });
});

describe("GoogleDriveRenewalCompScreenshotProvider.getFolder", () => {
  it("reads and parses the exact My Drive folder boundary fields", async () => {
    const fetchImpl = fetchMock(async () => jsonResponse(200, driveFolder()));

    const result = await providerWith(fetchImpl).getFolder(FOLDER_ID);

    expect(result).toEqual({
      outcome: "found",
      httpStatus: 200,
      folder: {
        id: FOLDER_ID,
        mimeType: RENEWAL_COMP_SCREENSHOT_FOLDER_MIME,
        trashed: false,
        version: "7",
        isAppAuthorized: true,
        ownedByMe: true,
        capabilities: {
          canAddChildren: true,
        },
      },
    });
    const [rawUrl, init] = fetchImpl.mock.calls[0]!;
    const url = new URL(rawUrl);
    expect(`${url.origin}${url.pathname}`).toBe(
      `https://www.googleapis.com/drive/v3/files/${FOLDER_ID}`,
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      supportsAllDrives: "true",
      fields: RENEWAL_COMP_SCREENSHOT_FOLDER_FIELDS,
    });
    expect(init.method).toBe("GET");
    expect(requestHeaders(init).get("authorization")).toBe(`Bearer ${TOKEN}`);
  });

  it("preserves the exact Shared Drive id and boundary capabilities", async () => {
    const fetchImpl = fetchMock(async () =>
      jsonResponse(
        200,
        driveFolder({
          ownedByMe: undefined,
          driveId: "shared_drive_789",
          capabilities: { canAddChildren: false },
        }),
      ),
    );

    const result = await providerWith(fetchImpl).getFolder(FOLDER_ID);
    expect(result).toMatchObject({
      outcome: "found",
      folder: {
        id: FOLDER_ID,
        driveId: "shared_drive_789",
        capabilities: { canAddChildren: false },
      },
    });
    expect(result.outcome === "found" ? result.folder : {}).not.toHaveProperty(
      "ownedByMe",
    );
  });

  it.each([
    ["a response for another id", { id: "different_folder" }],
    ["a non-decimal version", { version: "7.1" }],
    ["a malformed Shared Drive id", { driveId: "bad/id" }],
    ["a missing add-child capability", { capabilities: {} }],
  ])("keeps %s ambiguous", async (_label, overrides) => {
    const fetchImpl = fetchMock(async () => jsonResponse(200, driveFolder(overrides)));

    expect(await providerWith(fetchImpl).getFolder(FOLDER_ID)).toEqual({
      outcome: "ambiguous",
      certainty: "unknown",
      reason: "invalid_response",
      httpStatus: 200,
    });
  });

  it("distinguishes exact 404 absence from deterministic rejection", async () => {
    const absentFetch = fetchMock(async () => jsonResponse(404, {}));
    const forbiddenFetch = fetchMock(async () => jsonResponse(403, {}));

    expect(await providerWith(absentFetch).getFolder(FOLDER_ID)).toEqual({
      outcome: "absent",
      httpStatus: 404,
    });
    expect(await providerWith(forbiddenFetch).getFolder(FOLDER_ID)).toEqual({
      outcome: "rejected",
      certainty: "not_applied",
      reason: "http",
      httpStatus: 403,
    });
  });
});

describe("GoogleDriveRenewalCompScreenshotProvider.downloadFile", () => {
  it("downloads only the exact Drive id through alt=media with a bounded byte result", async () => {
    const fetchImpl = fetchMock(
      async () =>
        new Response(BYTES, {
          status: 200,
          headers: {
            "content-length": String(BYTES.byteLength),
            "content-type": "image/png",
          },
        }),
    );

    const result = await providerWith(fetchImpl).downloadFile(FILE_ID);

    expect(result).toEqual({
      outcome: "downloaded",
      httpStatus: 200,
      contentType: "image/png",
      bytes: BYTES,
    });
    const [rawUrl, init] = fetchImpl.mock.calls[0]!;
    const url = new URL(rawUrl);
    expect(`${url.origin}${url.pathname}`).toBe(
      `https://www.googleapis.com/drive/v3/files/${FILE_ID}`,
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      alt: "media",
      supportsAllDrives: "true",
    });
    expect(init.method).toBe("GET");
    expect(requestHeaders(init).get("authorization")).toBe(`Bearer ${TOKEN}`);
  });

  it("refuses an oversized media response without returning partial bytes", async () => {
    const fetchImpl = fetchMock(
      async () =>
        new Response(new Uint8Array([1]), {
          status: 200,
          headers: { "content-length": String(MAX_RENEWAL_COMP_SCREENSHOT_BYTES + 1) },
        }),
    );

    expect(await providerWith(fetchImpl).downloadFile(FILE_ID)).toEqual({
      outcome: "ambiguous",
      certainty: "unknown",
      reason: "invalid_response",
      httpStatus: 200,
    });
  });

  it("bounds a media body that never finishes after Drive returns headers", async () => {
    const fetchImpl = fetchMock(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start() {
              // Intentionally never enqueue or close: the provider must stop its own body read.
            },
          }),
          { status: 200, headers: { "content-type": "image/png" } },
        ),
    );
    const provider = new GoogleDriveRenewalCompScreenshotProvider({
      fetchImpl,
      getAccessToken: async () => TOKEN,
      timeoutMs: 10,
    });

    await expect(provider.downloadFile(FILE_ID)).resolves.toEqual({
      outcome: "ambiguous",
      certainty: "unknown",
      reason: "invalid_response",
      httpStatus: 200,
    });
  });

  it("does not expose a URL, list, search, or caller-selected media primitive", () => {
    const provider = providerWith(
      fetchMock(async () => jsonResponse(404, {})),
    ) as unknown as Record<string, unknown>;
    expect(provider.downloadFile).toBeTypeOf("function");
    for (const method of ["downloadUrl", "listFiles", "searchFiles", "getByUrl"]) {
      expect(provider[method]).toBeUndefined();
    }
  });
});

describe("GoogleDriveRenewalCompScreenshotProvider identity seam", () => {
  it.each([
    {
      label: "a service account from another project",
      serviceAccount: "drive-writer@outside-project.iam.gserviceaccount.com",
      subject: "operator@pmikcmetro.com",
    },
    {
      label: "a personal delegated subject",
      serviceAccount: "lease-renewal-reader@pmi-kc-kb-prod.iam.gserviceaccount.com",
      subject: "operator@gmail.com",
    },
  ])("rejects $label before transport", async ({ serviceAccount, subject }) => {
    const fetchImpl = fetchMock(async () => jsonResponse(200, {}));
    const provider = new GoogleDriveRenewalCompScreenshotProvider({
      fetchImpl,
      serviceAccount,
      subject,
    });

    expect(await provider.reserveFileId()).toEqual({
      outcome: "rejected",
      certainty: "not_applied",
      reason: "authentication",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("GoogleDriveRenewalCompScreenshotProvider.createReservedFile", () => {
  it("POSTs multipart bytes with the caller's reserved ID and exactly one approved parent", async () => {
    const fetchImpl = fetchMock(async () => jsonResponse(201, driveFile()));

    const result = await providerWith(fetchImpl).createReservedFile(createInput());

    expect(result).toMatchObject({
      outcome: "accepted",
      httpStatus: 201,
      file: { id: FILE_ID, parents: [FOLDER_ID] },
    });
    const [rawUrl, init] = fetchImpl.mock.calls[0]!;
    const url = new URL(rawUrl);
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://www.googleapis.com/upload/drive/v3/files",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      uploadType: "multipart",
      supportsAllDrives: "true",
      fields: RENEWAL_COMP_SCREENSHOT_DRIVE_FIELDS,
    });
    expect(init.method).toBe("POST");
    expect(requestHeaders(init).get("authorization")).toBe(`Bearer ${TOKEN}`);

    const multipart = multipartMetadata(init);
    expect(multipart.metadata).toEqual({
      id: FILE_ID,
      name: "renewal-comp-execution_1.png",
      mimeType: "image/png",
      parents: [FOLDER_ID],
      appProperties: APP_PROPERTIES,
    });
    expect(multipart.body.includes(Buffer.from(BYTES))).toBe(true);
    expect(multipart.body.toString("latin1")).toContain(`\r\n--${multipart.boundary}--`);
  });

  it("rejects more than 5 MiB before token acquisition or transport", async () => {
    const fetchImpl = fetchMock(async () => jsonResponse(201, driveFile()));
    const getAccessToken = vi.fn(async () => TOKEN);
    const provider = new GoogleDriveRenewalCompScreenshotProvider({
      fetchImpl,
      getAccessToken,
    });

    await expect(
      provider.createReservedFile(
        createInput({ bytes: new Uint8Array(MAX_RENEWAL_COMP_SCREENSHOT_BYTES + 1) }),
      ),
    ).rejects.toBeInstanceOf(RenewalCompScreenshotDriveInputError);
    expect(getAccessToken).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "409 as a conflict requiring exact-ID reconciliation",
      status: 409,
      expected: { outcome: "conflict", certainty: "unknown", httpStatus: 409 },
    },
    {
      label: "400 as a deterministic rejection",
      status: 400,
      expected: {
        outcome: "rejected",
        certainty: "not_applied",
        reason: "http",
        httpStatus: 400,
      },
    },
    {
      label: "500 as an ambiguous provider response",
      status: 500,
      expected: {
        outcome: "ambiguous",
        certainty: "unknown",
        reason: "http",
        httpStatus: 500,
      },
    },
  ])("classifies $label", async ({ status, expected }) => {
    const fetchImpl = fetchMock(async () => jsonResponse(status, { ignored: true }));
    expect(await providerWith(fetchImpl).createReservedFile(createInput())).toEqual(
      expected,
    );
  });

  it("makes transport failure explicit as ambiguous", async () => {
    const fetchImpl = fetchMock(async () => {
      throw new TypeError("connection reset after dispatch");
    });

    expect(await providerWith(fetchImpl).createReservedFile(createInput())).toEqual({
      outcome: "ambiguous",
      certainty: "unknown",
      reason: "transport",
    });
  });

  it("does not accept a malformed 2xx or a response for a different file ID", async () => {
    const fetchImpl = fetchMock(async () =>
      jsonResponse(200, driveFile({ id: "different_file" })),
    );

    expect(await providerWith(fetchImpl).createReservedFile(createInput())).toEqual({
      outcome: "ambiguous",
      certainty: "unknown",
      reason: "invalid_response",
      httpStatus: 200,
    });
  });
});

describe("GoogleDriveRenewalCompScreenshotProvider.getFile", () => {
  it("GETs the exact file ID with the complete readback field set", async () => {
    const fetchImpl = fetchMock(async () => jsonResponse(200, driveFile()));

    const result = await providerWith(fetchImpl).getFile(FILE_ID);

    expect(result).toMatchObject({
      outcome: "found",
      file: {
        id: FILE_ID,
        sha256Checksum: "2".repeat(64),
        parents: [FOLDER_ID],
        explicitlyTrashed: false,
        isAppAuthorized: true,
        ownedByMe: true,
        capabilities: { canTrash: true, canUntrash: false },
      },
    });
    const [rawUrl, init] = fetchImpl.mock.calls[0]!;
    const url = new URL(rawUrl);
    expect(`${url.origin}${url.pathname}`).toBe(
      `https://www.googleapis.com/drive/v3/files/${FILE_ID}`,
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      supportsAllDrives: "true",
      fields: RENEWAL_COMP_SCREENSHOT_DRIVE_FIELDS,
    });
    expect(init.method).toBe("GET");
  });

  it("distinguishes exact 404 absence from rejected and ambiguous reads", async () => {
    const absentFetch = fetchMock(async () => jsonResponse(404, {}));
    const forbiddenFetch = fetchMock(async () => jsonResponse(403, {}));
    const failedFetch = fetchMock(async () => jsonResponse(503, {}));

    expect(await providerWith(absentFetch).getFile(FILE_ID)).toEqual({
      outcome: "absent",
      httpStatus: 404,
    });
    expect(await providerWith(forbiddenFetch).getFile(FILE_ID)).toEqual({
      outcome: "rejected",
      certainty: "not_applied",
      reason: "http",
      httpStatus: 403,
    });
    expect(await providerWith(failedFetch).getFile(FILE_ID)).toEqual({
      outcome: "ambiguous",
      certainty: "unknown",
      reason: "http",
      httpStatus: 503,
    });
  });

  it("keeps a transport-failed read unknown rather than calling it absent", async () => {
    const fetchImpl = fetchMock(async () => {
      throw new TypeError("network unavailable");
    });

    expect(await providerWith(fetchImpl).getFile(FILE_ID)).toEqual({
      outcome: "ambiguous",
      certainty: "unknown",
      reason: "transport",
    });
  });
});

describe("GoogleDriveRenewalCompScreenshotProvider.trashFile", () => {
  it("PATCHes only trashed:true on the exact ID and exposes no delete operation", async () => {
    const fetchImpl = fetchMock(async () =>
      jsonResponse(
        200,
        driveFile({
          trashed: true,
          explicitlyTrashed: true,
          modifiedTime: "2026-07-30T01:05:00.000Z",
          version: "2",
          capabilities: {
            canTrash: false,
            canUntrash: true,
            canMoveItemOutOfDrive: false,
          },
        }),
      ),
    );
    const provider = providerWith(fetchImpl);

    const result = await provider.trashFile(FILE_ID);

    expect(result).toMatchObject({
      outcome: "accepted",
      file: {
        id: FILE_ID,
        trashed: true,
        explicitlyTrashed: true,
        capabilities: { canUntrash: true },
      },
    });
    const [rawUrl, init] = fetchImpl.mock.calls[0]!;
    const url = new URL(rawUrl);
    expect(`${url.origin}${url.pathname}`).toBe(
      `https://www.googleapis.com/drive/v3/files/${FILE_ID}`,
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      supportsAllDrives: "true",
      fields: RENEWAL_COMP_SCREENSHOT_DRIVE_FIELDS,
    });
    expect(init.method).toBe("PATCH");
    expect(requestHeaders(init).get("content-type")).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ trashed: true }));
    expect("deleteFile" in provider).toBe(false);
  });

  it("treats a 2xx response that is not trashed as ambiguous", async () => {
    const fetchImpl = fetchMock(async () => jsonResponse(200, driveFile()));

    expect(await providerWith(fetchImpl).trashFile(FILE_ID)).toEqual({
      outcome: "ambiguous",
      certainty: "unknown",
      reason: "invalid_response",
      httpStatus: 200,
    });
  });

  it("classifies a trash 409 as conflict rather than success", async () => {
    const fetchImpl = fetchMock(async () => jsonResponse(409, {}));

    expect(await providerWith(fetchImpl).trashFile(FILE_ID)).toEqual({
      outcome: "conflict",
      certainty: "unknown",
      httpStatus: 409,
    });
  });
});
