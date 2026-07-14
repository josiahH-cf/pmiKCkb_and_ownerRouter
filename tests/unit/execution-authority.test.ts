import { describe, expect, it } from "vitest";

import { decideExecutionAuthority } from "@/lib/execution/authority";
import type { ExecutionActor, ExecutionClassification } from "@/lib/execution/types";

const editor: ExecutionActor = { role: "Editor", uid: "editor-1" };
const admin: ExecutionActor = { role: "Admin", uid: "admin-1" };
const previewHash = "a".repeat(64);

describe("execution authority", () => {
  it("lets internal Editors directly execute enabled Low and Medium instances", () => {
    for (const risk of ["Low", "Medium"] as const) {
      expect(
        decideExecutionAuthority({
          actor: editor,
          classification: classification(risk),
          previewHash,
        }),
      ).toMatchObject({ canExecute: true, disposition: "direct_execution", risk });
    }
  });

  it("routes Editor High work to Admin and allows exact-preview Admin self-approval", () => {
    expect(
      decideExecutionAuthority({
        actor: editor,
        classification: classification("High"),
        previewHash,
      }),
    ).toMatchObject({ canExecute: false, disposition: "admin_approval_required" });

    expect(
      decideExecutionAuthority({
        actor: admin,
        approval: {
          approvedByRole: "Admin",
          approvedByUid: admin.uid,
          previewHash,
          reason: "The exact work-order change matches the approved evidence.",
        },
        classification: classification("High"),
        previewHash,
      }),
    ).toMatchObject({ canExecute: true, disposition: "approved_execution" });
  });

  it("rejects stale preview approval, missing reason, and ungranted Approver authority", () => {
    const base = {
      actor: editor,
      classification: classification("High"),
      previewHash,
    };

    expect(
      decideExecutionAuthority({
        ...base,
        approval: {
          approvedByRole: "Admin",
          approvedByUid: admin.uid,
          previewHash: "b".repeat(64),
          reason: "Reviewed.",
        },
      }).reason,
    ).toMatch(/stale/i);

    expect(
      decideExecutionAuthority({
        ...base,
        approval: {
          approvedByRole: "Admin",
          approvedByUid: admin.uid,
          previewHash,
          reason: " ",
        },
      }).reason,
    ).toMatch(/reason/i);

    expect(
      decideExecutionAuthority({
        ...base,
        approval: {
          approvedByRole: "Approver",
          approvedByUid: "approver-1",
          previewHash,
          reason: "Reviewed.",
        },
      }).canExecute,
    ).toBe(false);
  });

  it("denies Blocked instances for every role and leaves Vendor authority to S22", () => {
    expect(
      decideExecutionAuthority({
        actor: admin,
        classification: {
          ...classification("High"),
          blockers: ["permission_missing"],
          risk: "Blocked",
        },
        previewHash,
      }),
    ).toMatchObject({ canExecute: false, disposition: "denied" });

    expect(
      decideExecutionAuthority({
        actor: { role: "Vendor", uid: "vendor-1" },
        classification: classification("Low"),
        previewHash,
      }).canExecute,
    ).toBe(false);
  });
});

function classification(risk: "Low" | "Medium" | "High"): ExecutionClassification {
  return {
    actionKey: "test.action",
    blockers: [],
    defaultRisk: risk,
    kind: risk === "High" ? "system_of_record_write" : "read",
    requiresActionRegistry: false,
    risk,
  };
}
