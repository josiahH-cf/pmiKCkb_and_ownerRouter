import { describe, expect, it } from "vitest";

import {
  externalPreviewHash,
  validateExternalInput,
} from "@/lib/external-execution/orchestrator";
import type { ExternalActionInput } from "@/lib/external-execution/types";
import { LEASE_EXECUTION_DEFINITION_MAP } from "@/lib/lease-renewal/execution/matrix";
import { syntheticExternalTechnicalGates } from "@/tests/helpers/external-execution";

function input(actionKey: string): ExternalActionInput {
  return {
    workflowId: "renewal-1",
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
      communication: {
        bulk: false,
        governedLabel: true,
        humanInitiated: true,
        mailboxScopeAuthorized: true,
        modelTriggered: false,
        recipientMatchesPreview: true,
        reversible: true,
        scheduled: false,
        workflowLinked: true,
      },
    },
  };
}

describe("Lease execution authority", () => {
  it("requires exact confirmation for Medium and Admin approval for High", () => {
    const send = LEASE_EXECUTION_DEFINITION_MAP.get("gmail.renewal_notice.send")!;
    expect(validateExternalInput(send, input(send.key), true)).toContain("confirmation");
    const confirmed = input(send.key);
    confirmed.authority = {
      ...confirmed.authority!,
      exactConfirmationHash: externalPreviewHash(confirmed),
    };
    expect(validateExternalInput(send, confirmed, true)).toBeNull();

    const sheet = LEASE_EXECUTION_DEFINITION_MAP.get(
      "google_sheets.renewal_checklist.writeback",
    )!;
    expect(validateExternalInput(sheet, input(sheet.key), true)).toContain(
      "Admin approval",
    );
  });

  it("leaves missing or undocumented provider contracts technically Blocked for Admin", () => {
    const rentvine = LEASE_EXECUTION_DEFINITION_MAP.get(
      "rentvine.lease.renewal_writeback",
    )!;
    const value = input(rentvine.key);
    const previewHash = externalPreviewHash(value);
    value.authority = {
      ...value.authority!,
      approval: {
        approvedByRole: "Admin",
        approvedByUid: "admin-1",
        previewHash,
        reason: "Approve synthetic provider proof.",
      },
    };
    expect(validateExternalInput(rentvine, value, true)).toBe(
      "Blocked: vendor contract required.",
    );
  });
});
