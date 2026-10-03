import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { buildSuppliedRenewalDraftPreview } from "@/lib/lease-renewal/execution/supplied-renewal-draft-preview";

// S129 (F09, R-F09-03, R-F09-05) as carried into S162: the server preview is the one boundary a
// draft request crosses. A confirmed move-out, an unapproved publication and an unread attempt
// history still refuse it there, so no direct request can bypass them. S161/S162 retired the
// business-completeness, review-record, signature-sender and policy-note refusals: those are
// markers and information on the message, never a reason to withhold its unsent draft.
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
    signatureMatchesActor: true,
    lease: {},
    basis: {
      noticeSafety: {
        scopeHash: "b".repeat(64),
        version: 1,
        semanticHash: "c".repeat(64),
      },
      sourceFingerprint: "s",
      workspaceFingerprint: null,
      resourceFingerprint: "r",
    },
    attachment: null,
    moveOut: null,
    bodyOverride: null,
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

describe("S129 server draft boundary (AC-S129-3, AC-S129-5, AC-S129-8) under S162", () => {
  it("lists a policy note as information and never refuses the draft for it", () => {
    const note =
      "Review whether the Rhino policy applies to this lease before final use: Rhino policy: pending approved policy material.";
    // The empty lease fixture has no recipients, so the only refusals are recipient ones.
    for (const gates of [[{ field: "policy.rhino", message: note }], [], undefined]) {
      const reasons = blockedReasons(current({ policyGates: gates }));
      expect(reasons.some((reason) => /Rhino/.test(reason))).toBe(false);
      expect(reasons.every((reason) => /email|recipient/i.test(reason))).toBe(true);
    }
  });

  it("keeps the existing refusals: a confirmed move-out, an unapproved template and an unread attempt history", () => {
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
    expect(blockedReasons(current({ draftJournalAvailable: false }))).toContain(
      "Reload the Gmail attempt history before preparing a new draft.",
    );
  });

  it("no longer refuses for a missing resource, an old review record or another sender's signature", () => {
    const reasons = blockedReasons(
      current({
        content: {
          channel: "tenant",
          missing: [
            {
              field: "insuranceFlyer",
              message: "The insurance flyer link is not saved yet.",
            },
          ],
          sourceRefs: [],
        },
        needsReview: true,
        signatureMatchesActor: false,
      }),
    );
    expect(reasons).not.toContain("The insurance flyer link is not saved yet.");
    expect(reasons.join(" ")).not.toMatch(/review|signature/i);
  });
});
