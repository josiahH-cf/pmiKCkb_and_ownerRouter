// S103 AC-S103-4: the lease term review route refuses non-Editors, other Spaces, and an unknown or
// malformed payload, and writes no provider effect of any kind.

import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCapabilityInSpace: vi.fn(),
  recordLeaseTermReview: vi.fn(),
  getLeaseTermReview: vi.fn(),
  listLeaseTermReviewActivity: vi.fn(),
  readLeaseTermSource: vi.fn(),
}));

vi.mock("@/lib/lease-renewal/lease-term-source", () => ({
  readLeaseTermSource: mocks.readLeaseTermSource,
}));

vi.mock("@/lib/auth/session", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/auth/session")>();
  return { ...actual, requireCapabilityInSpace: mocks.requireCapabilityInSpace };
});

vi.mock("@/lib/firestore/lease-renewal-term-reviews", async (importActual) => {
  const actual =
    await importActual<typeof import("@/lib/firestore/lease-renewal-term-reviews")>();
  return {
    ...actual,
    recordLeaseTermReview: mocks.recordLeaseTermReview,
    getLeaseTermReview: mocks.getLeaseTermReview,
    listLeaseTermReviewActivity: mocks.listLeaseTermReviewActivity,
  };
});

import { GET, POST } from "@/app/api/lease-renewal/term-review/route";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  RENEWAL_GOVERNANCE_MATRIX,
  renewalRoleCapability,
} from "@/lib/lease-renewal/role-action-governance";

const editor = {
  uid: "op-1",
  email: "op1@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor" as const,
};

const FINGERPRINT = `ltf1_${"a".repeat(64)}`;

function post(body: unknown) {
  return new Request("http://localhost/api/lease-renewal/term-review", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.requireCapabilityInSpace.mockResolvedValue(editor);
  mocks.readLeaseTermSource.mockResolvedValue({
    status: "ok",
    sourceFingerprint: FINGERPRINT,
  });
  mocks.recordLeaseTermReview.mockResolvedValue({
    id: "41",
    version: 1,
    leaseId: "41",
    term: "month_to_month",
    anchorDateIso: "2025-09-15",
    reason: "Converted at the end of the prior term.",
    sourceFingerprint: FINGERPRINT,
    recordHash: "b".repeat(64),
    recordedAtIso: "2026-09-03T00:00:00.000Z",
    recordedByUid: editor.uid,
  });
  mocks.getLeaseTermReview.mockResolvedValue(null);
  mocks.listLeaseTermReviewActivity.mockResolvedValue([]);
});

afterEach(() => vi.clearAllMocks());

describe("S103 term review route", () => {
  it("records one exact review for a Renewals-space Editor", async () => {
    const response = await POST(
      post({
        lease_id: "41",
        term: "month_to_month",
        anchor_date: "2025-09-15",
        reason: "Converted at the end of the prior term.",
        source_fingerprint: FINGERPRINT,
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.requireCapabilityInSpace).toHaveBeenCalledWith("edit", "renewals");
    expect(mocks.recordLeaseTermReview).toHaveBeenCalledWith(
      editor,
      expect.objectContaining({ lease_id: "41", source_fingerprint: FINGERPRINT }),
    );
  });

  it("refuses a role or Space the session guard rejects, without touching the store", async () => {
    mocks.requireCapabilityInSpace.mockRejectedValue(
      new EditableLayerError("Renewals Space access is required.", 403),
    );
    const response = await POST(
      post({
        lease_id: "41",
        term: "fixed_term",
        reason: "Fixed term confirmed in the signed lease.",
        source_fingerprint: FINGERPRINT,
      }),
    );
    expect(response.status).toBe(403);
    expect(mocks.recordLeaseTermReview).not.toHaveBeenCalled();
  });

  it("rejects a malformed fingerprint, an unknown term, and an unknown field", async () => {
    for (const body of [
      {
        lease_id: "41",
        term: "fixed_term",
        reason: "ok reason",
        source_fingerprint: "not-a-fingerprint",
      },
      {
        lease_id: "41",
        term: "weekly",
        reason: "ok reason",
        source_fingerprint: FINGERPRINT,
      },
      {
        lease_id: "41",
        term: "fixed_term",
        reason: "ok reason",
        source_fingerprint: FINGERPRINT,
        production_allowed: true,
      },
    ]) {
      const response = await POST(post(body));
      expect(response.status).toBe(400);
    }
    expect(mocks.recordLeaseTermReview).not.toHaveBeenCalled();
  });

  it("requires an exact lease id on read", async () => {
    const response = await GET(
      new Request("http://localhost/api/lease-renewal/term-review"),
    );
    expect(response.status).toBe(400);
    expect(mocks.getLeaseTermReview).not.toHaveBeenCalled();
  });

  it("declares the Editor role capability that the route and store both enforce", () => {
    expect(renewalRoleCapability("record_term_review")).toBe("edit");
    expect(RENEWAL_GOVERNANCE_MATRIX.record_term_review).toMatchObject({
      effect: "app_owned_write",
      externalRequirement: "none",
      actionKeys: [],
      audit: "app_activity",
    });
  });

  it("reaches no provider and opens no action key", () => {
    const route = readFileSync("app/api/lease-renewal/term-review/route.ts", "utf8");
    const store = readFileSync("lib/firestore/lease-renewal-term-reviews.ts", "utf8");
    // Strip comments: the modules deliberately DOCUMENT that they reach no provider.
    const code = (source: string) => source.replaceAll(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    for (const source of [route, store]) {
      expect(code(source)).not.toMatch(
        /rentvine|googleapis|google_sheets|gmail|dotloop|action-gate|executeAction/i,
      );
    }
  });
});

describe("S103 AC-S103-4: the review is bound to the lease view the server observes", () => {
  const body = {
    lease_id: "41",
    term: "fixed_term",
    reason: "Provider detail read failed; lease reviewed in RentVine.",
    source_fingerprint: FINGERPRINT,
  };

  it("refuses an unknown lease id before writing anything", async () => {
    mocks.readLeaseTermSource.mockResolvedValue({ status: "lease_not_found" });
    const response = await POST(post({ ...body, lease_id: "no-such-lease-999999" }));
    expect(response.status).toBe(404);
    expect(mocks.recordLeaseTermReview).not.toHaveBeenCalled();
  });

  it("refuses a fingerprint the server does not observe now", async () => {
    mocks.readLeaseTermSource.mockResolvedValue({
      status: "ok",
      sourceFingerprint: `ltf1_${"b".repeat(64)}`,
    });
    const response = await POST(post(body));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: expect.stringMatching(/changed since this page loaded/),
    });
    expect(mocks.recordLeaseTermReview).not.toHaveBeenCalled();
  });

  it("refuses when the live source cannot be read, rather than trusting the browser", async () => {
    mocks.readLeaseTermSource.mockResolvedValue({ status: "unavailable" });
    const response = await POST(post(body));
    expect(response.status).toBe(409);
    expect(mocks.recordLeaseTermReview).not.toHaveBeenCalled();
  });

  it("records the review only when the served view's fingerprint matches", async () => {
    const response = await POST(post(body));
    expect(response.status).toBe(200);
    expect(mocks.readLeaseTermSource).toHaveBeenCalledWith("41");
    expect(mocks.recordLeaseTermReview).toHaveBeenCalledTimes(1);
  });
});
