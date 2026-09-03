import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  SHEET_WORKSPACE_CONTEXT_TTL_MS,
  SheetWorkspaceContextError,
  mintSheetWorkspaceContext,
  verifySheetWorkspaceContext,
} from "@/lib/lease-renewal/sheet-writeback/workspace-context";

const KEY = Buffer.alloc(32, 7).toString("base64url");
const NOW = Date.parse("2026-09-02T12:00:00.000Z");
let priorKey: string | undefined;
let priorPreviousKey: string | undefined;

beforeEach(() => {
  priorKey = process.env.RENEWAL_DESK_PARTY_FILTER_KEY;
  priorPreviousKey = process.env.RENEWAL_DESK_PARTY_FILTER_PREVIOUS_KEY;
  process.env.RENEWAL_DESK_PARTY_FILTER_KEY = KEY;
  delete process.env.RENEWAL_DESK_PARTY_FILTER_PREVIOUS_KEY;
});

afterEach(() => {
  if (priorKey === undefined) delete process.env.RENEWAL_DESK_PARTY_FILTER_KEY;
  else process.env.RENEWAL_DESK_PARTY_FILTER_KEY = priorKey;
  if (priorPreviousKey === undefined) {
    delete process.env.RENEWAL_DESK_PARTY_FILTER_PREVIOUS_KEY;
  } else {
    process.env.RENEWAL_DESK_PARTY_FILTER_PREVIOUS_KEY = priorPreviousKey;
  }
});

function expectContextCode(run: () => unknown, code: string) {
  expect(run).toThrowError(SheetWorkspaceContextError);
  try {
    run();
  } catch (error) {
    expect((error as SheetWorkspaceContextError).code).toBe(code);
  }
}

describe("S98 signed lease-workspace context", () => {
  it("returns only the exact signed lease for the exact actor", () => {
    const token = mintSheetWorkspaceContext("editor-1", "115", NOW);
    expect(token).not.toBeNull();
    expect(verifySheetWorkspaceContext(token!, "editor-1", NOW + 1)).toEqual({
      leaseId: "115",
      expiresAtMs: NOW + SHEET_WORKSPACE_CONTEXT_TTL_MS,
    });
  });

  it("rejects another actor, an edited payload/signature, and expiry", () => {
    const token = mintSheetWorkspaceContext("editor-1", "115", NOW)!;
    expectContextCode(
      () => verifySheetWorkspaceContext(token, "editor-2", NOW + 1),
      "invalid",
    );

    const [prefixAndPayload, signature] = token.split(".");
    const editedSignature = `${signature.slice(0, -1)}${
      signature.at(-1) === "A" ? "B" : "A"
    }`;
    expectContextCode(
      () =>
        verifySheetWorkspaceContext(
          `${prefixAndPayload}.${editedSignature}`,
          "editor-1",
          NOW + 1,
        ),
      "invalid",
    );

    expectContextCode(
      () =>
        verifySheetWorkspaceContext(
          token,
          "editor-1",
          NOW + SHEET_WORKSPACE_CONTEXT_TTL_MS,
        ),
      "expired",
    );
  });

  it("fails closed when the server key is unavailable or the lease is not canonical", () => {
    delete process.env.RENEWAL_DESK_PARTY_FILTER_KEY;
    expect(mintSheetWorkspaceContext("editor-1", "115", NOW)).toBeNull();
    process.env.RENEWAL_DESK_PARTY_FILTER_KEY = KEY;
    expect(mintSheetWorkspaceContext("editor-1", "lease-115", NOW)).toBeNull();
  });
});
