import { describe, expect, it } from "vitest";

import { validateExternalInput } from "@/lib/external-execution/orchestrator";
import { MAINTENANCE_EXECUTION_DEFINITION_MAP } from "@/lib/maintenance/execution/matrix";

const base = {
  workflowId: "ticket-1",
  actionId: "action-1",
  values: { value: "synthetic" },
  sourceRefs: ["source:synthetic"],
  contractRef: "documented:provider:v1",
  connectionRef: "connection:synthetic",
  mappingRef: "mapping:synthetic",
};

describe("Maintenance execution authority", () => {
  it("keeps account/assignment/SoR/accounting changes Admin-approved", () => {
    for (const key of [
      "vendor.account.invite",
      "vendor.assignment.change",
      "rentvine.work_order.create",
      "quickbooks.bill.create_draft",
    ]) {
      const definition = MAINTENANCE_EXECUTION_DEFINITION_MAP.get(key)!;
      expect(validateExternalInput(definition, { ...base, actionKey: key })).toContain(
        "Admin approval",
      );
    }
  });

  it("requires exact confirmation for owner and Vendor replies", () => {
    for (const key of [
      "gmail.maintenance_owner_notice.send",
      "vendor.gmail.thread.reply",
    ]) {
      const definition = MAINTENANCE_EXECUTION_DEFINITION_MAP.get(key)!;
      expect(validateExternalInput(definition, { ...base, actionKey: key })).toContain(
        "confirmation",
      );
    }
  });
});
