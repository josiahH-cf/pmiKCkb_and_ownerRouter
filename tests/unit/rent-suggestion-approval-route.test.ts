import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Role } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  LEASE_RENEWAL_PROGRESS_COLLECTIONS,
  progressDocId,
} from "@/lib/firestore/lease-renewal-progress";
import { FakeFirestore } from "../helpers/fake-firestore";

// The route runs the REAL Admin-gated control plane against a FakeFirestore (getAdminFirestore mocked).
// Only the session gate (which supplies the user) and the admin Firestore handle are mocked, so the 403
// for a non-Admin and the single-Activity-row for an Admin are proven end-to-end through the route.
const mocks = vi.hoisted(() => ({
  requireCapabilityInSpace: vi.fn(),
  db: undefined as unknown,
}));

vi.mock("@/lib/auth/session", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/auth/session")>();
  return { ...actual, requireCapabilityInSpace: mocks.requireCapabilityInSpace };
});

vi.mock("@/lib/firestore/admin", () => ({
  getAdminFirestore: () => mocks.db,
}));

import { GET, POST } from "@/app/api/lease-renewal/rent-suggestion/route";

function userWith(role: Role, uid: string): AuthenticatedUser {
  return { uid, email: `${uid}@example.com`, hd: "example.com", role };
}
const admin = userWith("Admin", "admin-1");
const editor = userWith("Editor", "editor-1");

const LEASE_ID = "5001";

let db: FakeFirestore;
beforeEach(() => {
  db = new FakeFirestore();
  mocks.db = db;
  const docId = progressDocId(LEASE_ID);
  db.seed(`${LEASE_RENEWAL_PROGRESS_COLLECTIONS.progress}/${docId}`, {
    id: docId,
    lease_id: LEASE_ID,
    stage_index: 1,
    owner_decision: {
      decision: "increase",
      offered_rent: 2400,
      market: { zillow_low: 2200, zillow_high: 2500, pmi_number: 2300 },
    },
    complete: false,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
  });
});
afterEach(() => vi.clearAllMocks());

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/lease-renewal/rent-suggestion", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("rent-suggestion route (AC-S29-3)", () => {
  it("returns 403 and writes NO approval record when an Editor tries to approve", async () => {
    mocks.requireCapabilityInSpace.mockResolvedValue(editor);
    const res = await post({ lease_id: LEASE_ID, decision: "approve", reason: "x" });
    expect(res.status).toBe(403);
    // The Admin gate is enforced by the data layer even though the route gates at read.
    expect(mocks.requireCapabilityInSpace).toHaveBeenCalledWith("read", "renewals");
    const stored = db.store.get(
      `lease_renewal_rent_suggestion_approvals/${progressDocId(LEASE_ID)}`,
    );
    expect(stored).toBeUndefined();
  });

  it("returns 200 and records exactly one Activity row for an Admin approve", async () => {
    mocks.requireCapabilityInSpace.mockResolvedValue(admin);
    const res = await post({
      lease_id: LEASE_ID,
      decision: "approve",
      reason: "Comps support this.",
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      approval: { state: string; approved_value: number; production_allowed: boolean };
      activity: unknown[];
    };
    expect(json.approval.state).toBe("Approved");
    expect(json.approval.approved_value).toBe(2300);
    expect(json.approval.production_allowed).toBe(false);
    expect(json.activity).toHaveLength(1);
  });

  it("GET returns the server-computed suggestion with its comp sources", async () => {
    mocks.requireCapabilityInSpace.mockResolvedValue(editor);
    const res = await GET(
      new Request(
        `http://localhost/api/lease-renewal/rent-suggestion?lease_id=${LEASE_ID}`,
      ),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      suggestion: { suggestedRent: number | null; comps: unknown[]; status: string };
      approval: unknown;
    };
    expect(json.suggestion.status).toBe("suggested");
    expect(json.suggestion.suggestedRent).toBe(2300);
    expect(json.suggestion.comps.length).toBeGreaterThan(0);
    expect(json.approval).toBeNull();
  });
});
