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
  resolveLeaseRentSuggestion,
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
      null,
      null,
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

    const approved = await getApprovedRentSuggestion(admin, LEASE_ID, null, null, fs());
    expect(approved?.value).toBe(2300);
  });

  it("marks a prior approval stale when the comp basis recomputes to a different number", async () => {
    seedProgress(db, { zillow_low: 2200, zillow_high: 2500, pmi_number: 2300 });
    await decideRentSuggestionApproval(
      admin,
      { lease_id: LEASE_ID, decision: "approve", reason: "Approved 2300." },
      null,
      null,
      fs(),
    );
    expect(
      (await getApprovedRentSuggestion(admin, LEASE_ID, null, null, fs()))?.value,
    ).toBe(2300);

    // The operator revises the comps; the median is now 2600. The prior approval no longer authorizes it.
    seedProgress(db, { zillow_low: 2500, zillow_high: 2800, pmi_number: 2600 });
    expect(await getApprovedRentSuggestion(admin, LEASE_ID, null, null, fs())).toBeNull();

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
      null,
      null,
      fs(),
    );
    expect(reapproved.approved_value).toBe(2600);
    expect(
      (await getApprovedRentSuggestion(admin, LEASE_ID, null, null, fs()))?.value,
    ).toBe(2600);
  });

  it("refuses to decide when there is no defensible comp set (needs verification)", async () => {
    seedProgress(db, null);
    await expect(
      decideRentSuggestionApproval(
        admin,
        { lease_id: LEASE_ID, decision: "approve", reason: "x" },
        null,
        null,
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
        null,
        null,
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
        null,
        null,
        fs(),
      ),
    ).rejects.toThrow();
  });

  it("rejects a double-approve at the store layer (already Approved is terminal until recompute changes)", async () => {
    seedProgress(db, { zillow_low: 2200, zillow_high: 2500, pmi_number: 2300 });
    await decideRentSuggestionApproval(
      admin,
      { lease_id: LEASE_ID, decision: "approve", reason: "First approve." },
      null,
      null,
      fs(),
    );
    await expect(
      decideRentSuggestionApproval(
        admin,
        { lease_id: LEASE_ID, decision: "approve", reason: "Second approve." },
        null,
        null,
        fs(),
      ),
    ).rejects.toThrow(EditableLayerError);
  });
});

// S60 (AC-S60-10): the ±15% clamp engages on the live path because every call site passes the
// authoritative current rent.
describe("S60 clamp repair", () => {
  it("clamps an outlier comp median when the authoritative current rent is passed", async () => {
    // Median of [2200, 2500, 9000] = 2500... use values whose median is far from current rent:
    seedProgress(db, { zillow_low: 3000, zillow_high: 3400, pmi_number: 3200 });
    const approval = await decideRentSuggestionApproval(
      admin,
      { lease_id: LEASE_ID, decision: "approve", reason: "Clamp check." },
      2000,
      null,
      fs(),
    );
    // Median 3200 is >15% above 2000 → clamped to 2300 (2000 * 1.15).
    expect(approval.approved_value).toBe(2300);
  });

  it("leaves the median unclamped only when the live rent is genuinely unavailable (null)", async () => {
    seedProgress(db, { zillow_low: 3000, zillow_high: 3400, pmi_number: 3200 });
    const approval = await decideRentSuggestionApproval(
      admin,
      { lease_id: LEASE_ID, decision: "approve", reason: "No live rent." },
      null,
      null,
      fs(),
    );
    expect(approval.approved_value).toBe(3200);
  });

  it("requires the current-rent argument at the signature level (an omitting call site fails)", () => {
    // Function.length counts required params: (actor, leaseId, currentRent) before the db default.
    // S62 widened each by the portfolio id (owner-policy rules), so the pin is now 4.
    expect(resolveLeaseRentSuggestion.length).toBe(4);
    expect(decideRentSuggestionApproval.length).toBe(4);
    expect(getApprovedRentSuggestion.length).toBe(4);
  });
});

// S62: a policy-derived number rides the SAME approval plane as a comp-derived one.
describe("owner-policy suggestion approval (AC-S62-3, AC-S62-4)", () => {
  function seedRule(percent: number): void {
    db.seed("owner_policy_rules/27", {
      id: "27",
      portfolio_id: "27",
      kind: "flat_percent_increase",
      percent,
      effective_from: "2026-01-01",
      note: "MKD standing agreement.",
      updated_by_uid: "admin-1",
      updated_at: "2026-08-01T00:00:00.000Z",
    });
  }

  // AC-S62-3: same Admin approval, recomputed server-side at decision time, never client-supplied.
  it("approves the server-recomputed policy number through the S29 plane (AC-S62-3)", async () => {
    seedProgress(db, { zillow_low: 2200, zillow_high: 2500, pmi_number: 2300 });
    seedRule(3.5);

    // The decision input carries NO number field at all — the value is recomputed server-side.
    const approval = await decideRentSuggestionApproval(
      admin,
      { lease_id: LEASE_ID, decision: "approve", reason: "Standing MKD policy." },
      2000,
      "27",
      fs(),
    );
    expect(approval.state).toBe("Approved");
    // 2000 * 1.035 = 2070 — the rule's number, not the comp median (2300).
    expect(approval.approved_value).toBe(2070);
    expect(approval.method).toBe("owner_policy_percent");
    expect(approval.executed).toBe(false);

    // Same Admin gate: an Editor cannot approve a policy number either.
    await expect(
      decideRentSuggestionApproval(
        editor,
        { lease_id: LEASE_ID, decision: "approve", reason: "x" },
        2000,
        "27",
        fs(),
      ),
    ).rejects.toThrow(EditableLayerError);
  });

  // AC-S62-4: changing the rule makes the prior approval stale, exactly as a changed comp basis does.
  it("marks a prior approval stale when the rule changes (AC-S62-4)", async () => {
    seedProgress(db, { zillow_low: 2200, zillow_high: 2500, pmi_number: 2300 });
    seedRule(3.5);
    await decideRentSuggestionApproval(
      admin,
      { lease_id: LEASE_ID, decision: "approve", reason: "Approved 2070." },
      2000,
      "27",
      fs(),
    );
    expect(
      (await getApprovedRentSuggestion(admin, LEASE_ID, 2000, "27", fs()))?.value,
    ).toBe(2070);

    // The Admin updates the rule to 5%; the recompute is now 2100 and 2070 no longer authorizes.
    seedRule(5);
    expect(await getApprovedRentSuggestion(admin, LEASE_ID, 2000, "27", fs())).toBeNull();

    // Re-approving snapshots the new policy number.
    const reapproved = await decideRentSuggestionApproval(
      admin,
      { lease_id: LEASE_ID, decision: "approve", reason: "Approving the 5% number." },
      2000,
      "27",
      fs(),
    );
    expect(reapproved.approved_value).toBe(2100);
  });

  it("falls back to the comp median when no rule is active for the portfolio", async () => {
    seedProgress(db, { zillow_low: 2200, zillow_high: 2500, pmi_number: 2300 });
    // Rule is future-dated: recorded, visible to Admins, but never applied yet.
    db.seed("owner_policy_rules/27", {
      id: "27",
      portfolio_id: "27",
      kind: "flat_percent_increase",
      percent: 3.5,
      effective_from: "2099-01-01",
      note: "Not yet in force.",
      updated_by_uid: "admin-1",
    });
    const suggestion = await resolveLeaseRentSuggestion(
      admin,
      LEASE_ID,
      2300,
      "27",
      fs(),
    );
    expect(suggestion.method).toBe("comp_median");
    expect(suggestion.suggestedRent).toBe(2300);
  });
});
