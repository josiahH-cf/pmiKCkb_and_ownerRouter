import { describe, expect, it } from "vitest";

import {
  GOVERNED_ARTIFACT_REFS,
  GOVERNED_ARTIFACT_REGISTRY,
  getGovernedArtifact,
  isApprovedWorkflowReplyTemplate,
  renderGovernedArtifactInstance,
  WORKFLOW_REPLY_POLICY_REF,
} from "@/lib/gmail-hub/governed-artifacts";
import { buildWorkOrderDraft } from "@/lib/maintenance/work-order-draft";

const mailbox = {
  email: "operator@pmikcmetro.com",
  sourceRef: "firebase-session:operator-1",
  verified: true,
};
const recipient = {
  email: "owner@example.com",
  sourceRef: "rentvine-owner:owner-1",
  verified: true,
};

describe("governed v1.0 communication artifacts", () => {
  it("exposes exactly three immutable, hashed, approved base artifacts", () => {
    expect(GOVERNED_ARTIFACT_REGISTRY.map((item) => item.ref)).toEqual(
      GOVERNED_ARTIFACT_REFS,
    );
    expect(new Set(GOVERNED_ARTIFACT_REGISTRY.map((item) => item.contentHash)).size).toBe(
      3,
    );
    for (const artifact of GOVERNED_ARTIFACT_REGISTRY) {
      expect(artifact.version).toBe("v1.0");
      expect(artifact.approvedAt).toBe("2026-07-14");
      expect(artifact.contentHash).toMatch(/^[a-f0-9]{64}$/);
      expect(Object.isFrozen(artifact)).toBe(true);
      expect(Object.isFrozen(artifact.requiredValues)).toBe(true);
    }
    expect(() => getGovernedArtifact("owner-renewal:v2")).toThrow(
      /Unknown or unversioned/,
    );
  });

  it("renders a complete owner renewal instance and blocks missing verified values", () => {
    const ready = renderGovernedArtifactInstance({
      artifactRef: "owner-renewal:v1.0",
      mailbox,
      recipient,
      sourceRefs: ["renewal-run:run-1", "rentvine-lease:lease-1"],
      values: {
        addressLabel: "100 Synthetic St",
        currentRent: 1000,
        market: {
          rangeLow: 1100,
          rangeHigh: 1200,
          specificNumber: 1150,
          compsScreenshotRef: "approved-comps:screenshot-1",
        },
      },
    });
    expect(ready.status).toBe("ready");
    expect(ready.reasons).toEqual([]);

    const blocked = renderGovernedArtifactInstance({
      artifactRef: "owner-renewal:v1.0",
      mailbox,
      recipient: { ...recipient, verified: false, sourceRef: "browser:typed" },
      sourceRefs: [],
      values: { addressLabel: "100 Synthetic St", currentRent: 1000 },
    });
    expect(blocked.status).toBe("blocked");
    expect(blocked.reasons.join(" ")).toMatch(
      /recipient|source references|verification|Missing/i,
    );

    const blankValue = renderGovernedArtifactInstance({
      artifactRef: "owner-renewal:v1.0",
      mailbox,
      recipient,
      sourceRefs: ["renewal-run:run-1"],
      values: {
        addressLabel: " ",
        currentRent: Number.NaN,
        market: {
          rangeLow: 1100,
          rangeHigh: 1200,
          specificNumber: 1150,
          compsScreenshotRef: "approved-comps:screenshot-1",
        },
      },
    });
    expect(blankValue.status).toBe("blocked");
    expect(blankValue.reasons.join(" ")).toMatch(/property address|current rent/i);
  });

  it("renders tenant and maintenance instances through their current generators", () => {
    const tenant = renderGovernedArtifactInstance({
      artifactRef: "tenant-renewal:v1.0",
      mailbox,
      recipient: { ...recipient, email: "tenant@example.com" },
      sourceRefs: ["renewal-run:run-1"],
      values: {
        tenantNameLabel: "Synthetic Tenant",
        leaseEndDateIso: "2026-12-31",
        ownerDecision: "increase",
        offeredRent: 1250,
      },
    });
    expect(tenant.status).toBe("ready");
    expect(tenant.rendered.kind).toBe("tenant_renewal_offer");

    const maintenance = renderGovernedArtifactInstance({
      artifactRef: "maintenance-owner:v1.0",
      mailbox,
      recipient,
      sourceRefs: ["maintenance-ticket:ticket-1"],
      values: {
        ownerName: "Synthetic Owner",
        workOrder: buildWorkOrderDraft({
          reporterUid: "reporter-1",
          typedNote: "Synthetic sink leak",
          unit: {
            unitId: "unit-1",
            label: "100 Synthetic St",
            confidence: "Verified",
          },
          photoRefs: [],
          capturedAt: "2026-07-14T00:00:00.000Z",
        }),
      },
    });
    expect(maintenance.status).toBe("ready");
    expect(maintenance.rendered.kind).toBe("maintenance_owner_notice");
  });

  it("approves only a purpose-matched artifact with policy and sources", () => {
    const base = {
      lane: "maintenance" as const,
      entityType: "maintenance_ticket" as const,
      entityId: "ticket-1",
      purpose: "maintenance_owner" as const,
      actionKey: "gmail.thread.reply",
      sourceRefs: ["maintenance-ticket:ticket-1"],
      templateRef: "maintenance-owner:v1.0",
      replyPolicyRef: WORKFLOW_REPLY_POLICY_REF,
    };
    expect(isApprovedWorkflowReplyTemplate(base)).toBe(true);
    expect(isApprovedWorkflowReplyTemplate({ ...base, sourceRefs: [] })).toBe(false);
    expect(
      isApprovedWorkflowReplyTemplate({
        ...base,
        templateRef: "owner-renewal:v1.0",
      }),
    ).toBe(false);
    expect(isApprovedWorkflowReplyTemplate({ ...base, replyPolicyRef: undefined })).toBe(
      false,
    );
  });
});
