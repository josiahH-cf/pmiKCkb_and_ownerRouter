import { describe, expect, it } from "vitest";

import { validateExternalInput } from "@/lib/external-execution/orchestrator";
import { LEASE_EXECUTION_DEFINITION_MAP } from "@/lib/lease-renewal/execution/matrix";

function input(actionKey: string) {
  return {
    workflowId: "renewal-1",
    actionId: "action-1",
    actionKey,
    values: { value: "synthetic" },
    sourceRefs: ["source:synthetic"],
    contractRef: "documented:provider:v1",
    connectionRef: "connection:synthetic",
    mappingRef: "mapping:synthetic",
  };
}

describe("Lease execution authority", () => {
  it("requires exact confirmation for Medium and Admin approval for High", () => {
    const send = LEASE_EXECUTION_DEFINITION_MAP.get("gmail.renewal_notice.send")!;
    expect(validateExternalInput(send, input(send.key))).toContain("confirmation");
    expect(
      validateExternalInput(send, {
        ...input(send.key),
        exactConfirmationHash: "confirmation",
      }),
    ).toBeNull();

    const sheet = LEASE_EXECUTION_DEFINITION_MAP.get(
      "google_sheets.renewal_checklist.writeback",
    )!;
    expect(validateExternalInput(sheet, input(sheet.key))).toContain("Admin approval");
  });

  it("leaves missing or undocumented provider contracts technically Blocked for Admin", () => {
    const rentvine = LEASE_EXECUTION_DEFINITION_MAP.get(
      "rentvine.lease.renewal_writeback",
    )!;
    expect(
      validateExternalInput(rentvine, {
        ...input(rentvine.key),
        approvedByUid: "admin-1",
      }),
    ).toBe("Blocked: vendor contract required.");
  });
});
