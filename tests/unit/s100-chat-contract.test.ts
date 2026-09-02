import { describe, expect, it } from "vitest";

import {
  CHAT_CONTRACT_SNAPSHOT_SHA256,
  CHAT_MAX_ATTACHMENTS,
  CHAT_MAX_BODY_UNITS,
  CHAT_MAX_ENVELOPE_BYTES,
  CHAT_PAGE_SIZE,
  ChatContractError,
  chatPayloadHash,
  decodeChatEnvelope,
  decodeChatPaginationHeaders,
  decodeChatRow,
} from "@/lib/integrations/rentvine/chat-contract";

const EXPECTED = { accountRef: "rentvine:pmikcmetro", workOrderId: 9005 };

function tenantRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    "message.messageID": 501,
    "message.chatObjectTypeID": 1,
    "message.objectID": 9005,
    "message.roleTypeID": 2,
    "message.message": "The sink is still leaking after the visit.",
    "message.dateTimeCreated": "2026-09-01T15:04:05Z",
    "message.contactID": 77,
    "contact.contactID": 77,
    "message.userID": null,
    "user.userID": null,
    "contact.name": "Resident Name",
    "message.isReadByManager": 0,
    ...overrides,
  };
}

function managerRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    "message.messageID": 502,
    "message.chatObjectTypeID": 1,
    "message.objectID": 9005,
    "message.roleTypeID": 1,
    "message.message": "A technician is scheduled for Tuesday.",
    "message.dateTimeCreated": "2026-09-01T16:00:00Z",
    "message.userID": 4,
    "user.userID": 4,
    "message.contactID": null,
    "contact.contactID": null,
    ...overrides,
  };
}

const HEADERS = {
  "pagination-current-page": "1",
  "pagination-page-size": "20",
  "pagination-total-items": "2",
  "pagination-total-pages": "1",
};

describe("S100 chat contract constants", () => {
  it("pins the extracted snapshot hash and the bounded-read limits", () => {
    expect(CHAT_CONTRACT_SNAPSHOT_SHA256).toBe(
      "ebc41f1af8a5b963094a77d84dd3e84dfc09c9dce3d676ef8827170b3dc7e730",
    );
    expect(CHAT_PAGE_SIZE).toBe(20);
    expect(CHAT_MAX_ENVELOPE_BYTES).toBe(2_000_000);
    expect(CHAT_MAX_BODY_UNITS).toBe(20_000);
    expect(CHAT_MAX_ATTACHMENTS).toBe(20);
  });
});

describe("S100 pagination headers", () => {
  it("accepts the live empty-thread shape: zero items, zero pages, first page", () => {
    expect(
      decodeChatPaginationHeaders(
        {
          "pagination-current-page": "1",
          "pagination-page-size": "20",
          "pagination-total-items": "0",
          "pagination-total-pages": "0",
        },
        1,
      ),
    ).toEqual({
      currentPage: 1,
      pageSize: 20,
      totalItems: 0,
      totalPages: 0,
      nextPage: null,
    });
    // The live provider reports next-page "0" (and its own default page size) for none.
    expect(
      decodeChatPaginationHeaders(
        {
          "pagination-current-page": "1",
          "pagination-page-size": "15",
          "pagination-total-items": "0",
          "pagination-total-pages": "0",
          "pagination-next-page": "0",
        },
        1,
      ).nextPage,
    ).toBeNull();
    expect(() =>
      decodeChatPaginationHeaders(
        {
          "pagination-current-page": "2",
          "pagination-page-size": "20",
          "pagination-total-items": "0",
          "pagination-total-pages": "0",
        },
        2,
      ),
    ).toThrow(/total-pages/);
  });

  it("accepts the exact consistent header set with a blank next page", () => {
    expect(decodeChatPaginationHeaders(HEADERS, 1)).toEqual({
      currentPage: 1,
      pageSize: 20,
      totalItems: 2,
      totalPages: 1,
      nextPage: null,
    });
  });

  it("accepts a valid next page and refuses every contradiction", () => {
    expect(
      decodeChatPaginationHeaders(
        {
          "pagination-current-page": "1",
          "pagination-page-size": "20",
          "pagination-total-items": "25",
          "pagination-total-pages": "2",
          "pagination-next-page": "2",
        },
        1,
      ).nextPage,
    ).toBe(2);
    const bad = [
      { ...HEADERS, "pagination-current-page": "2" },
      { ...HEADERS, "pagination-page-size": "21" },
      { ...HEADERS, "pagination-page-size": "0" },
      { ...HEADERS, "pagination-total-pages": "0" },
      { ...HEADERS, "pagination-next-page": "3" },
      { ...HEADERS, "pagination-total-items": "-1" },
      { ...HEADERS, "pagination-current-page": "x" },
    ];
    for (const headers of bad) {
      expect(() => decodeChatPaginationHeaders(headers, 1)).toThrow(ChatContractError);
    }
    const missing = { ...HEADERS } as Record<string, string>;
    delete missing["pagination-total-pages"];
    expect(() => decodeChatPaginationHeaders(missing, 1)).toThrow(ChatContractError);
  });
});

describe("S100 row decode", () => {
  it("accepts an exact tenant row as the only resident-origin candidate", () => {
    const row = decodeChatRow(tenantRow(), EXPECTED);
    expect(row.kind).toBe("message");
    if (row.kind !== "message") throw new Error("unreachable");
    expect(row.role).toBe("tenant");
    expect(row.contactId).toBe(77);
    expect(row.userId).toBeNull();
    expect(row.createdAtIso).toBe("2026-09-01T15:04:05.000Z");
    expect(row.truncated).toBe(false);
    expect(row.payloadHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("accepts an exact manager row as nonresident", () => {
    const row = decodeChatRow(managerRow(), EXPECTED);
    expect(row.kind).toBe("message");
    if (row.kind !== "message") throw new Error("unreachable");
    expect(row.role).toBe("manager");
    expect(row.userId).toBe(4);
    expect(row.contactId).toBeNull();
  });

  it("rejects missing message ids and wrong-object rows bodylessly", () => {
    expect(decodeChatRow(tenantRow({ "message.messageID": 0 }), EXPECTED)).toEqual({
      kind: "rejected",
      reason: "missing_message_id",
    });
    expect(decodeChatRow(tenantRow({ "message.messageID": "501" }), EXPECTED)).toEqual({
      kind: "rejected",
      reason: "missing_message_id",
    });
    expect(decodeChatRow(tenantRow({ "message.objectID": 9006 }), EXPECTED)).toEqual({
      kind: "rejected",
      reason: "wrong_object",
    });
    expect(decodeChatRow(tenantRow({ "message.chatObjectTypeID": 2 }), EXPECTED)).toEqual(
      { kind: "rejected", reason: "wrong_object" },
    );
  });

  it("quarantines unknown roles and role/id-shape mismatches as review records", () => {
    const unknownRole = decodeChatRow(tenantRow({ "message.roleTypeID": 3 }), EXPECTED);
    expect(unknownRole.kind).toBe("review");
    const mismatches = [
      tenantRow({ "message.userID": 4 }),
      tenantRow({ "contact.contactID": 78 }),
      tenantRow({ "message.contactID": null }),
      managerRow({ "user.userID": 5 }),
      managerRow({ "message.contactID": 9 }),
      managerRow({ "message.userID": null }),
    ];
    for (const raw of mismatches) {
      const row = decodeChatRow(raw, EXPECTED);
      expect(row.kind, JSON.stringify(raw)).toBe("review");
      if (row.kind === "review") {
        expect(row.reason).toBe("role_id_shape_mismatch");
      }
    }
  });

  it("truncates an oversize body visibly and keeps the full-content hash stable", () => {
    const fullBody = "x".repeat(CHAT_MAX_BODY_UNITS + 5);
    const row = decodeChatRow(tenantRow({ "message.message": fullBody }), EXPECTED);
    expect(row.kind).toBe("message");
    if (row.kind !== "message") throw new Error("unreachable");
    expect(row.truncated).toBe(true);
    expect(row.body).toHaveLength(CHAT_MAX_BODY_UNITS);
    const expectedHash = chatPayloadHash({
      accountRef: EXPECTED.accountRef,
      messageId: 501,
      chatObjectTypeId: 1,
      objectId: 9005,
      roleTypeId: 2,
      userId: null,
      contactId: 77,
      createdAtIso: "2026-09-01T15:04:05.000Z",
      fullBody,
      attachments: [],
    });
    expect(row.payloadHash).toBe(expectedHash);
  });

  it("projects only the six attachment metadata fields and quarantines everything else", () => {
    const good = decodeChatRow(
      tenantRow({
        "message.fileAttachments": [
          {
            fileAttachmentID: 550,
            fileID: 320,
            title: "Photo.jpg",
            fileName: "photo.jpg",
            fileType: "image/jpeg",
            previewFileName: null,
          },
        ],
      }),
      EXPECTED,
    );
    expect(good.kind).toBe("message");
    if (good.kind !== "message") throw new Error("unreachable");
    expect(good.attachments).toEqual([
      {
        fileAttachmentId: 550,
        fileId: 320,
        title: "Photo.jpg",
        fileName: "photo.jpg",
        fileType: "image/jpeg",
        previewFileName: null,
      },
    ]);

    const bad = [
      [
        {
          fileAttachmentID: 550,
          fileID: 320,
          title: "t",
          fileName: "f",
          fileType: "x",
          previewFileName: null,
          url: "https://x",
        },
      ],
      [
        {
          fileAttachmentID: "550",
          fileID: 320,
          title: "t",
          fileName: "f",
          fileType: "x",
          previewFileName: null,
        },
      ],
      [
        {
          fileAttachmentID: 550,
          fileID: 320,
          title: "t".repeat(501),
          fileName: "f",
          fileType: "x",
          previewFileName: null,
        },
      ],
      Array.from({ length: 21 }, (_, index) => ({
        fileAttachmentID: index + 1,
        fileID: 1,
        title: "t",
        fileName: "f",
        fileType: "x",
        previewFileName: null,
      })),
    ];
    for (const attachments of bad) {
      const row = decodeChatRow(
        tenantRow({ "message.fileAttachments": attachments }),
        EXPECTED,
      );
      expect(row.kind).toBe("review");
      if (row.kind === "review") {
        expect(row.reason).toBe("invalid_attachment_metadata");
      }
    }
  });

  it("excludes mutable read/share flags and link previews from the payload hash", () => {
    const first = decodeChatRow(tenantRow(), EXPECTED);
    const second = decodeChatRow(
      tenantRow({
        "message.isReadByManager": 1,
        "message.isSharedWithOwner": 1,
        "contact.name": "Renamed Person",
        "message.messageLinkPreviewMeta": { url: "https://example.invalid" },
      }),
      EXPECTED,
    );
    if (first.kind !== "message" || second.kind !== "message") {
      throw new Error("unreachable");
    }
    expect(second.payloadHash).toBe(first.payloadHash);
    expect(JSON.stringify(second)).not.toContain("example.invalid");
  });
});

describe("S100 envelope", () => {
  it("accepts a bare array within caps and refuses everything else", () => {
    expect(decodeChatEnvelope("[]").rows).toEqual([]);
    expect(() => decodeChatEnvelope('{"rows":[]}')).toThrow(ChatContractError);
    expect(() => decodeChatEnvelope("not json")).toThrow(ChatContractError);
    expect(() =>
      decodeChatEnvelope(JSON.stringify(Array.from({ length: 21 }, () => ({})))),
    ).toThrow(ChatContractError);
    const oversize = `["${"y".repeat(CHAT_MAX_ENVELOPE_BYTES)}"]`;
    expect(() => decodeChatEnvelope(oversize)).toThrow(ChatContractError);
  });
});
