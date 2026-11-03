import { describe, expect, it } from "vitest";
import { reviewDotloopActivationPackage } from "@/lib/lease-renewal/execution/dotloop-activation-review";

const now = "2026-11-03T12:00:00.000Z";
const current = {
  actionKey: "dotloop.document.upload" as const,
  productionAllowed: false,
  sourceSha: "1".repeat(40),
  registryHash: "2".repeat(64),
  connectionGeneration: "fixture-generation",
  selectionVersion: 1,
  profileId: "fixture-profile",
  templateId: "fixture-template",
};
function proposal(actionKey = "dotloop.document.upload") {
  return {
    version: 1,
    actionKey,
    scope:
      actionKey === "dotloop.document.upload"
        ? "staff_confirmed_existing_loop_upload"
        : "staff_confirmed_new_loop",
    observedAt: now,
    current: { ...current, actionKey },
    proposed: {
      productionAllowed: true,
      readiness: "Approved for Execution",
      evidenceStatus: "Documented",
    },
    prerequisites: {
      actorRoles: ["Editor", "Approver", "Admin"],
      configurationEvidence: ["fixture private config receipt"],
      qualificationEvidence: ["fixture isolated qualification receipt"],
      contentEvidence: ["fixture exact originals/maps/approval receipt"],
      targetEvidence: ["fixture lease/cycle/link version receipt"],
    },
    consequences: {
      participantContacts: "not_applicable",
      notifications: "verified",
      notificationEvidence: "fixture provider contract decision",
      nativeTemplateDocuments: "not_applicable",
      nativeDocumentEvidence: "fixture existing-loop inventory",
      returnedContent: "presence_only",
      correction:
        "Human retires obsolete documents; the app never deletes or archives an adopted loop.",
    },
    procedure: {
      backup: "Private full registry backup and SHA-256",
      compareAndSwap: "Refuse if source or any prior registry field differs",
      readback: "Read exact seed and mirror; all unrelated keys unchanged",
      ambiguity: "Stop and reconcile the same attempt; never redispatch",
      stopConditions: [
        "Changed source/selection/generation/content/target or uncertain effect",
      ],
    },
  };
}

describe("S34 passive exact-key activation review", () => {
  it("accepts a complete upload-only review without authorizing or executing anything", () => {
    const input = proposal();
    const before = JSON.stringify(input);
    expect(reviewDotloopActivationPackage(input, current, now)).toEqual({
      state: "ready_for_review",
      executionAuthorized: false,
      problems: [],
    });
    expect(JSON.stringify(input)).toBe(before);
  });
  it("requires each exact key's scope and known consequences independently", () => {
    const create = proposal("dotloop.loop.create_from_template");
    expect(
      reviewDotloopActivationPackage(create, current, now).problems.join(" "),
    ).toMatch(/participant.*contact|native.*template/i);
    const wrongKey = { ...proposal(), actionKey: "dotloop.signature.send" };
    expect(reviewDotloopActivationPackage(wrongKey, current, now).state).toBe(
      "not_ready",
    );
    const wrongScope = { ...proposal(), scope: "staff_confirmed_new_loop" };
    expect(reviewDotloopActivationPackage(wrongScope, current, now).state).toBe(
      "not_ready",
    );
  });
  it.each([
    "sourceSha",
    "registryHash",
    "connectionGeneration",
    "selectionVersion",
    "profileId",
    "templateId",
  ])("refuses stale %s evidence", (field) => {
    const changed = {
      ...current,
      [field]:
        field === "selectionVersion"
          ? 2
          : field === "sourceSha"
            ? "3".repeat(40)
            : field === "registryHash"
              ? "4".repeat(64)
              : "changed",
    };
    expect(
      reviewDotloopActivationPackage(proposal(), changed, now).problems.join(" "),
    ).toMatch(/changed|stale/i);
  });
  it.each(["2026-11-04T12:00:00.000Z", "2026-11-01T12:00:00.000Z", "invalid"])(
    "refuses unusable observation time %s",
    (observedAt) => {
      expect(
        reviewDotloopActivationPackage({ ...proposal(), observedAt }, current, now).state,
      ).toBe("not_ready");
    },
  );
  it("requires content and backup/CAS/readback/ambiguity evidence and a currently closed key", () => {
    const incomplete = proposal();
    incomplete.prerequisites.contentEvidence = [];
    incomplete.procedure.backup = "";
    expect(reviewDotloopActivationPackage(incomplete, current, now).state).toBe(
      "not_ready",
    );
    expect(
      reviewDotloopActivationPackage(
        { ...proposal(), current: { ...current, productionAllowed: true } },
        current,
        now,
      ).state,
    ).toBe("not_ready");
    expect(
      reviewDotloopActivationPackage(
        proposal(),
        { ...current, productionAllowed: true },
        now,
      ).state,
    ).toBe("not_ready");
    expect(
      reviewDotloopActivationPackage(
        {
          ...proposal(),
          consequences: { ...proposal().consequences, notifications: "unknown" },
        },
        current,
        now,
      ).problems.join(" "),
    ).toMatch(/notification/i);
  });
});
