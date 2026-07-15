import { describe, expect, it } from "vitest";

import {
  externalPreviewHash,
  validateExternalInput,
} from "@/lib/external-execution/orchestrator";
import type { ExternalActionInput } from "@/lib/external-execution/types";
import { MAINTENANCE_EXECUTION_DEFINITION_MAP } from "@/lib/maintenance/execution/matrix";
import { syntheticExternalTechnicalGates } from "@/tests/helpers/external-execution";

function input(actionKey: string): ExternalActionInput {
  return {
    dataMode: "test",
    workflowId: "ticket-1",
    actionId: "action-1",
    actionKey,
    values: { value: "synthetic" },
    sourceRefs: ["source:synthetic"],
    contractRef: "documented:provider:v1",
    connectionRef: "connection:synthetic",
    mappingRef: "mapping:synthetic",
    authority: {
      actor: { role: "Admin", uid: "admin-1" },
      roleScopeAuthorized: true,
      technical: syntheticExternalTechnicalGates(),
      ...(actionKey.startsWith("vendor.gmail.")
        ? {
            vendor: {
              assignedTicket: true,
              sameMailbox: true,
              selfConsent: true,
              verifiedEmailTotp: true,
            },
          }
        : {}),
    },
  };
}

describe("Maintenance execution authority", () => {
  it("keeps account/assignment/SoR/accounting changes Admin-approved", () => {
    for (const key of [
      "vendor.account.invite",
      "vendor.assignment.change",
      "rentvine.work_order.create",
      "quickbooks.bill.create_draft",
    ]) {
      const definition = MAINTENANCE_EXECUTION_DEFINITION_MAP.get(key)!;
      expect(validateExternalInput(definition, input(key), true)).toContain(
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
      expect(validateExternalInput(definition, input(key), true)).toContain(
        "confirmation",
      );
    }
  });

  it("binds High approval to the exact current preview", () => {
    const definition = MAINTENANCE_EXECUTION_DEFINITION_MAP.get(
      "quickbooks.bill.create_draft",
    )!;
    const value = input(definition.key);
    value.authority = {
      ...value.authority!,
      approval: {
        approvedByRole: "Admin",
        approvedByUid: "admin-1",
        previewHash: externalPreviewHash(value),
        reason: "Create the reviewed synthetic draft Bill.",
      },
    };
    expect(validateExternalInput(definition, value, true)).toBeNull();
    value.values = { value: "drifted" };
    expect(validateExternalInput(definition, value, true)).toContain("stale");
  });
});
