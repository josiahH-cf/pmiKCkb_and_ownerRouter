import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";

import type { Role } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  LEASE_RENEWAL_PROGRESS_COLLECTIONS,
  progressDocId,
} from "@/lib/firestore/lease-renewal-progress";
import {
  decideRentSuggestionApproval,
  getApprovedRentSuggestion,
  getRentSuggestionApproval,
  listRentSuggestionApprovalActivity,
} from "@/lib/firestore/lease-renewal-rent-suggestion-approvals";
import {
  planRentSuggestionApprovalDecision,
  RENT_SUGGESTION_AWAITING_APPROVAL,
} from "@/lib/lease-renewal/rent-suggestion-approval";
import { FakeFirestore } from "../helpers/fake-firestore";

function userWith(role: Role, uid: string): AuthenticatedUser {
  return { uid, email: `${uid}@example.com`, hd: "example.com", role };
}

const admin = userWith("Admin", "admin-1");
const editor = userWith("Editor", "editor-1");

const LEASE_ID = "5001";

function seedProgress(db: FakeFirestore, market: Record<string, number> | null): void {
  const docId = progressDocId(LEASE_ID);
  db.seed(`${LEASE_RENEWAL_PROGRESS_COLLECTIONS.progress}/${docId}`, {
    id: docId,
    lease_id: LEASE_ID,
    stage_index: 1,
    owner_decision: {
      decision: "increase",
      offered_rent: 2400,
      ...(market ? { market } : {}),
    },
    complete: false,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
  });
}

let db: FakeFirestore;
beforeEach(() => {
  db = new FakeFirestore();
});
function fs(): Firestore {
  return db as unknown as Firestore;
}

describe("planRentSuggestionApprovalDecision (FSM)", () => {
  it("approves a fresh suggestion (Awaiting Approval → Approved), never executing", () => {
    const plan = planRentSuggestionApprovalDecision("approve");
    expect(plan.state).toBe("Approved");
    expect(plan.productionAllowed).toBe(false);
    expect(plan.executed).toBe(false);
  });

  it("returns a suggestion for revision, and revokes an approval", () => {
    expect(
      planRentSuggestionApprovalDecision("return", RENT_SUGGESTION_AWAITING_APPROVAL)
        .state,
    ).toBe("Returned for Revision");
    expect(planRentSuggestionApprovalDecision("return", "Approved").state).toBe(
      "Returned for Revision",
    );
    expect(
      planRentSuggestionApprovalDecision("approve", "Returned for Revision").state,
    ).toBe("Approved");
  });

  it("rejects a double-approve and a re-return", () => {
    expect(() => planRentSuggestionApprovalDecision("approve", "Approved")).toThrow(
      EditableLayerError,
    );
    expect(() =>
      planRentSuggestionApprovalDecision("return", "Returned for Revision"),
    ).toThrow(EditableLayerError);
  });
});

describe("decideRentSuggestionApproval — exact-number binding + stale-on-change (AC-S29-4)", () => {
  it("approves the server-recomputed comp median, snapshotting the exact number and its comp sources", async () => {
    seedProgress(db, { zillow_low: 2200, zillow_high: 2500, pmi_number: 2300 });

    const approval = await decideRentSuggestionApproval(
      admin,
      { lease_id: LEASE_ID, decision: "approve", reason: "Comps support this." },
      fs(),
    );

    // Median of [2200, 2300, 2500] = 2300, computed server-side (never client-supplied).
    expect(approval.state).toBe("Approved");
    expect(approval.approved_value).toBe(2300);
    expect(approval.method).toBe("comp_median");
    expect(approval.production_allowed).toBe(false);
    expect(approval.executed).toBe(false);
    // The number is never stored without its comp sources.
    expect(approval.approved_comps.length).toBeGreaterThan(0);
    expect(approval.approved_comps.map((c) => c.source)).toEqual([
      "Zillow low",
      "Zillow high",
      "PMI rental analysis",
    ]);

    const activity = await listRentSuggestionApprovalActivity(admin, LEASE_ID, fs());
    expect(activity).toHaveLength(1);
    expect(activity[0]).toMatchObject({ action: "approve", new_state: "Approved" });

    const approved = await getApprovedRentSuggestion(admin, LEASE_ID, fs());
    expect(approved?.value).toBe(2300);
  });

  it("marks a prior approval stale when the comp basis recomputes to a different number", async () => {
    seedProgress(db, { zillow_low: 2200, zillow_high: 2500, pmi_number: 2300 });
    await decideRentSuggestionApproval(
      admin,
      { lease_id: LEASE_ID, decision: "approve", reason: "Approved 2300." },
      fs(),
    );
    expect((await getApprovedRentSuggestion(admin, LEASE_ID, fs()))?.value).toBe(2300);

    // The operator revises the comps; the median is now 2600. The prior approval no longer authorizes it.
    seedProgress(db, { zillow_low: 2500, zillow_high: 2800, pmi_number: 2600 });
    expect(await getApprovedRentSuggestion(admin, LEASE_ID, fs())).toBeNull();

    // A record still exists but no longer matches the current number: nothing silently authorized.
    const stored = await getRentSuggestionApproval(admin, LEASE_ID, fs());
    expect(stored?.approved_value).toBe(2300);

    // Re-approving snapshots the new number.
    const reapproved = await decideRentSuggestionApproval(
      admin,
      {
        lease_id: LEASE_ID,
        decision: "approve",
        reason: "Approving the revised number.",
      },
      fs(),
    );
    expect(reapproved.approved_value).toBe(2600);
    expect((await getApprovedRentSuggestion(admin, LEASE_ID, fs()))?.value).toBe(2600);
  });

  it("refuses to decide when there is no defensible comp set (needs verification)", async () => {
    seedProgress(db, null);
    await expect(
      decideRentSuggestionApproval(
        admin,
        { lease_id: LEASE_ID, decision: "approve", reason: "x" },
        fs(),
      ),
    ).rejects.toThrow(/no suggested rent number/i);
    expect(await getRentSuggestionApproval(admin, LEASE_ID, fs())).toBeNull();
  });

  it("is Admin-only — an Editor cannot approve, and no record is written", async () => {
    seedProgress(db, { zillow_low: 2200, zillow_high: 2500, pmi_number: 2300 });
    await expect(
      decideRentSuggestionApproval(
        editor,
        { lease_id: LEASE_ID, decision: "approve", reason: "x" },
        fs(),
      ),
    ).rejects.toThrow(EditableLayerError);
    expect(await getRentSuggestionApproval(admin, LEASE_ID, fs())).toBeNull();
  });

  it("requires a plain-English reason", async () => {
    seedProgress(db, { zillow_low: 2200, zillow_high: 2500, pmi_number: 2300 });
    await expect(
      decideRentSuggestionApproval(
        admin,
        { lease_id: LEASE_ID, decision: "approve", reason: "   " },
        fs(),
      ),
    ).rejects.toThrow();
  });

  it("rejects a double-approve at the store layer (already Approved is terminal until recompute changes)", async () => {
    seedProgress(db, { zillow_low: 2200, zillow_high: 2500, pmi_number: 2300 });
    await decideRentSuggestionApproval(
      admin,
      { lease_id: LEASE_ID, decision: "approve", reason: "First approve." },
      fs(),
    );
    await expect(
      decideRentSuggestionApproval(
        admin,
        { lease_id: LEASE_ID, decision: "approve", reason: "Second approve." },
        fs(),
      ),
    ).rejects.toThrow(EditableLayerError);
  });
});
