import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  leaseViewsFromExport,
  applyLeaseDetailToView,
} from "@/lib/integrations/rentvine/lease-mapper";
import { projectCycleSourceDateChange } from "@/lib/lease-renewal/cycle-source-date";
import { buildSuppliedRenewalDraftPreview } from "@/lib/lease-renewal/execution/supplied-renewal-draft-preview";
import { workspaceMessageBasisFingerprint } from "@/lib/lease-renewal/message-claim-basis";
import { projectMoveOutDisposition } from "@/lib/lease-renewal/move-out-disposition";
import {
  emptyRenewalWorkspace,
  planRenewalWorkspaceAction,
} from "@/lib/lease-renewal/workspace-state";

// Synthetic pure acceptance reproductions. No provider, browser, Firestore or production data.
const actor: AuthenticatedUser = {
  uid: "synthetic-editor",
  email: "synthetic@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const workspace = () =>
  emptyRenewalWorkspace("9001", "10000000-0000-4000-8000-000000000001", {
    kind: "lease_end",
    dateIso: "2026-10-31",
    source: "synthetic source",
  });
const meta = {
  eventId: "10000000-0000-4000-8000-000000000002",
  actorUid: actor.uid,
  recordedAt: "2026-09-28T12:00:00.000Z",
};

describe("G2 explicit non-renewal and review identity", () => {
  it("invalidates the reviewed basis when the tenant records non-renewal", () => {
    const before = workspace();
    const after = planRenewalWorkspaceAction(
      before,
      {
        kind: "tenant_response",
        outcome: "declined_nonrenewing",
        source: "synthetic staff review",
      },
      meta,
    );
    expect(workspaceMessageBasisFingerprint({ ...after })).not.toBe(
      workspaceMessageBasisFingerprint({ ...before }),
    );
  });

  it.each(["owner", "tenant"] as const)(
    "refuses the %s audience after either manual non-renewal outcome",
    (channel) => {
      for (const action of [
        {
          kind: "owner_response" as const,
          outcome: "declined_non_renewal" as const,
          source: "synthetic staff review",
        },
        {
          kind: "tenant_response" as const,
          outcome: "declined_nonrenewing" as const,
          source: "synthetic staff review",
        },
      ]) {
        const current = {
          content: { channel, missing: [], sourceRefs: [] },
          saved: { revision: 1 },
          workspace: planRenewalWorkspaceAction(workspace(), action, meta),
          publication: {
            status: "approved",
            ref: "synthetic",
            contentHash: "a".repeat(64),
          },
          draftJournalAvailable: true,
          needsReview: false,
          signatureMatchesActor: true,
          lease: {},
          basis: {
            sourceFingerprint: "s",
            workspaceFingerprint: "w",
            resourceFingerprint: "r",
          },
          attachment: null,
          moveOut: null,
          policyGates: [],
          inputs: { edits: { responseRequest: "" } },
        } as unknown as Parameters<typeof buildSuppliedRenewalDraftPreview>[1];
        const result = buildSuppliedRenewalDraftPreview(actor, current);
        expect(result.status).toBe("blocked");
        if (result.status === "blocked")
          expect(result.reasons.join(" ")).toMatch(/non-renewal/i);
      }
    },
  );
});

function notice(date: string) {
  const [lease] = leaseViewsFromExport([
    { lease: { leaseID: "9001", leaseStatusID: "3" }, unit: {} },
  ]);
  applyLeaseDetailToView(lease, {
    leaseStatusID: "3",
    noticeDate: date,
    expectedMoveOutDate: "2026-10-31",
    moveOutDate: null,
    isMonthToMonth: "0",
  });
  return projectMoveOutDisposition({
    lease,
    statusTable: {
      status: "available",
      statuses: [
        {
          leaseStatusID: "3",
          name: "Synthetic notice",
          primaryLeaseStatusID: "2",
          isPendingMoveOutStatus: true,
          isCompletedMoveOutStatus: false,
          isPendingMoveInStatus: false,
          isSystemStatus: false,
        },
      ],
    },
    freshness: "fresh",
    observedAtIso: "2026-09-28T12:00:00.000Z",
  });
}

describe("G3 all app-authored calendar labels", () => {
  it("formats move-out notice and expected dates without changing canonical evidence", () => {
    const result = notice("2026-09-28");
    expect(result.label).toContain("09/28/2026");
    expect(result.label).toContain("10/31/2026");
    expect(result.evidence.noticeDateIso).toBe("2026-09-28");
  });
  it("exposes an impossible notice date as a data-check result, never a date or absent notice", () => {
    const result = notice("2026-02-31");
    expect(result.state).toBe("initiated");
    expect(result.evidence.noticeDateIso).toBeNull();
    expect(result.label).toMatch(/Invalid date|Check.*date/i);
    expect(result.label).not.toContain("2026-02-31");
  });
  it("formats all cycle-source-date labels, including no-cycle, unchanged and review-date branches", () => {
    for (const basis of [
      null,
      { kind: "lease_end" as const, dateIso: "2026-09-28", source: "synthetic" },
      { kind: "review_date" as const, dateIso: "2026-09-28", source: "synthetic" },
    ]) {
      const result = projectCycleSourceDateChange(basis, "2026-09-28");
      expect(result.label).toContain("09/28/2026");
      expect(result.label).not.toContain("2026-09-28");
    }
  });
});
