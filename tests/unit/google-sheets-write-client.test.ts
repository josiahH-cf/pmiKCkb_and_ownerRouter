import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  getRequestHeaders: vi.fn(async () => new Headers({ Authorization: "Bearer test" })),
}));

vi.mock("google-auth-library", () => ({
  GoogleAuth: class {
    async getClient() {
      return { getRequestHeaders: auth.getRequestHeaders };
    }
  },
}));

import { GoogleSheetsApiWriter } from "@/lib/google-sheets/write-client";

beforeEach(() => {
  auth.getRequestHeaders.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GoogleSheetsApiWriter atomic exact-cell mutations", () => {
  it("does not claim stable-row atomicity from fixed-A1 REST primitives", () => {
    const writer = new GoogleSheetsApiWriter();

    expect("mutateAnchoredCellIfMatch" in writer).toBe(false);
    expect("getAnchoredMutationStatus" in writer).toBe(false);
    expect("tombstoneAnchoredMutationIfAbsent" in writer).toBe(false);
  });

  it("encodes empty-cell append as one exact GridRange regex compare-and-set", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          sheets: [{ properties: { sheetId: 37, title: "Lease Renewal" } }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ replies: [{ findReplace: { occurrencesChanged: 1 } }] }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const writer = new GoogleSheetsApiWriter();

    await expect(
      writer.writeValuesIfEmpty("sheet-1", "Lease Renewal!C2", String.raw`$1\base`),
    ).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, mutation] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(String(mutation.body))).toEqual({
      requests: [
        {
          findReplace: {
            find: "^$",
            replacement: String.raw`\$1\\base`,
            matchCase: true,
            matchEntireCell: true,
            searchByRegex: true,
            includeFormulas: false,
            range: {
              sheetId: 37,
              startRowIndex: 1,
              endRowIndex: 2,
              startColumnIndex: 2,
              endColumnIndex: 3,
            },
          },
        },
      ],
    });
  });

  it("returns false on provider compare mismatch and conditionally clears by exact value", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          sheets: [{ properties: { sheetId: 37, title: "Lease Renewal" } }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ replies: [{ findReplace: { occurrencesChanged: 0 } }] }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const writer = new GoogleSheetsApiWriter();

    await expect(
      writer.clearValuesIfExactMatch("sheet-1", "Lease Renewal!C2", "1300"),
    ).resolves.toBe(false);

    const [, mutation] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(String(mutation.body))).toMatchObject({
      requests: [
        {
          findReplace: {
            find: "1300",
            replacement: "",
            matchEntireCell: true,
            searchByRegex: false,
            range: {
              sheetId: 37,
              startRowIndex: 1,
              endRowIndex: 2,
              startColumnIndex: 2,
              endColumnIndex: 3,
            },
          },
        },
      ],
    });
  });
});

function jsonResponse(body: object) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}
