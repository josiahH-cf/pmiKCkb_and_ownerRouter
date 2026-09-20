import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { buildSuppliedRenewalDraftPreview } from "@/lib/lease-renewal/execution/supplied-renewal-draft-preview";

// S129 (F09, R-F09-03, R-F09-05): the server preview is the one boundary a draft request crosses.
// A missing required resource, an unreviewed snapshot, a confirmed move-out and a policy gate each
// block it there, so no direct request or old reviewed snapshot can bypass the local readiness.
// Values are synthetic; no Gmail client is constructed and nothing is created.

const actor: AuthenticatedUser = {
  uid: "op-1",
  email: "op1@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};

type Current = Parameters<typeof buildSuppliedRenewalDraftPreview>[1];

function current(overrides: Record<string, unknown> = {}): Current {
  return {
    content: { channel: "tenant", missing: [], sourceRefs: [] },
    saved: { revision: 3 },
    workspace: { leaseId: "L1", cycleId: "cycle-1" },
    publication: {
      status: "approved",
      reason: "",
      ref: "supplied:tenant:v2",
      contentHash: "a".repeat(64),
    },
    draftJournalAvailable: true,
    needsReview: false,
    signatureMatchesActor: true,
    lease: {},
    basis: {
      sourceFingerprint: "s",
      workspaceFingerprint: null,
      resourceFingerprint: "r",
    },
    attachment: null,
    moveOut: null,
    policyGates: [],
    inputs: { edits: { responseRequest: "" } },
    ...overrides,
  } as unknown as Current;
}

function blockedReasons(value: Current) {
  const preview = buildSuppliedRenewalDraftPreview(actor, value);
  expect(preview.status).toBe("blocked");
  return preview.status === "blocked" ? preview.reasons : [];
}

describe("S129 server draft boundary (AC-S129-3, AC-S129-5, AC-S129-8)", () => {
  it("blocks a direct draft on a policy gate exactly as the local body is blocked", () => {
    const reasons = blockedReasons(
      current({
        policyGates: [
          {
            field: "policy.rhino",
            message:
              "Review whether the Rhino policy applies to this lease before final use: Rhino policy: pending approved policy material.",
          },
        ],
      }),
    );
    expect(reasons).toContain(
      "Review whether the Rhino policy applies to this lease before final use: Rhino policy: pending approved policy material.",
    );
    // An unrelated lease carries no gate, so the policy scaffold never blocks ordinary renewals here.
    const none = buildSuppliedRenewalDraftPreview(actor, current({ policyGates: [] }));
    if (none.status === "blocked")
      expect(none.reasons.some((reason) => /Rhino/.test(reason))).toBe(false);
    const absent = buildSuppliedRenewalDraftPreview(
      actor,
      current({ policyGates: undefined }),
    );
    if (absent.status === "blocked")
      expect(absent.reasons.some((reason) => /Rhino/.test(reason))).toBe(false);
  });

  it("keeps the existing refusals: a missing required flyer, an old reviewed snapshot, a confirmed move-out and an unapproved template", () => {
    expect(
      blockedReasons(
        current({
          content: {
            channel: "tenant",
            missing: [
              {
                field: "insuranceFlyer",
                message: "Add and verify the applicable insurance flyer link.",
              },
            ],
            sourceRefs: [],
          },
        }),
      ),
    ).toContain("Add and verify the applicable insurance flyer link.");
    expect(blockedReasons(current({ needsReview: true }))).toContain(
      "Review and save the message against its current source facts.",
    );
    expect(
      blockedReasons(
        current({
          moveOut: {
            state: "initiated",
            label: "Move-out initiated in RentVine: Active - Notice Given.",
          },
        }),
      ),
    ).toContain("Move-out initiated in RentVine: Active - Notice Given.");
    expect(
      blockedReasons(
        current({
          publication: { status: "unavailable", reason: "Publication readback pending." },
        }),
      ),
    ).toContain("Publication readback pending.");
    expect(blockedReasons(current({ signatureMatchesActor: false }))).toContain(
      "Review the signature for the signed-in managed sender.",
    );
    expect(blockedReasons(current({ draftJournalAvailable: false }))).toContain(
      "Reload the Gmail attempt history before preparing a new draft.",
    );
  });
});
