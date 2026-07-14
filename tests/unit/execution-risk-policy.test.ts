import { describe, expect, it } from "vitest";

import {
  classifyExecutionRisk,
  EXECUTION_ACTION_POLICIES,
  type ExecutionTechnicalGates,
} from "@/lib/execution/risk-policy";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";

const openTechnical: ExecutionTechnicalGates = {
  connectionReady: true,
  documentedEvidence: true,
  endpointDocumented: true,
  permissionGranted: true,
  productionAllowed: true,
  requiredValuesPresent: true,
  roleScopeAuthorized: true,
  sourceValidated: true,
};

const confirmedCommunication = {
  bulk: false,
  exactConfirmed: true,
  humanInitiated: true,
  mailboxScopeAuthorized: true,
  modelTriggered: false,
  recipientMatchesPreview: true,
  scheduled: false,
  workflowLinked: true,
} as const;

describe("execution risk policy", () => {
  it("classifies every current registry key and every approved future key", () => {
    for (const entry of ACTION_REGISTRY_SEED) {
      expect(EXECUTION_ACTION_POLICIES, entry.key).toHaveProperty(entry.key);
    }

    expect(Object.keys(EXECUTION_ACTION_POLICIES)).toEqual(
      expect.arrayContaining([
        "gmail.renewal_notice.send",
        "rentvine.renewal.portal_message.send",
        "sms.renewal_message.send",
        "vendor.account.invite",
        "vendor.gmail.connect",
        "rentvine.work_order.assign_vendor",
      ]),
    );
  });

  it("keeps reads Low, confirmed workflow communications Medium, and SoR writes High", () => {
    expect(
      classifyExecutionRisk({
        actionKey: "rentvine.work_order.read",
        technical: openTechnical,
      }).risk,
    ).toBe("Low");

    expect(
      classifyExecutionRisk({
        actionKey: "gmail.thread.reply",
        communication: confirmedCommunication,
        technical: openTechnical,
      }).risk,
    ).toBe("Medium");

    expect(
      classifyExecutionRisk({
        actionKey: "rentvine.work_order.create",
        technical: openTechnical,
      }).risk,
    ).toBe("High");
  });

  it("blocks recipient drift, missing confirmation, and autonomous/bulk/scheduled sends", () => {
    const result = classifyExecutionRisk({
      actionKey: "gmail.thread.reply",
      communication: {
        ...confirmedCommunication,
        bulk: true,
        exactConfirmed: false,
        modelTriggered: true,
        recipientMatchesPreview: false,
        scheduled: true,
      },
      technical: openTechnical,
    });

    expect(result.risk).toBe("Blocked");
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        "exact_confirmation_missing",
        "recipient_drift",
        "unsupported_automation",
      ]),
    );
  });

  it("allows only the validated append-only assigned-ticket photo exception as Medium", () => {
    const safe = classifyExecutionRisk({
      actionKey: "google_drive.maintenance_photo.store",
      technical: openTechnical,
      ticketPhoto: {
        appendOnly: true,
        assignedTicketFolder: true,
        malwareCheckPassed: true,
        sensitivityCheckPassed: true,
        typeAndSizeAllowed: true,
      },
    });
    expect(safe.risk).toBe("Medium");

    const overwrite = classifyExecutionRisk({
      actionKey: "google_drive.maintenance_photo.store",
      technical: openTechnical,
      ticketPhoto: {
        appendOnly: false,
        assignedTicketFolder: true,
        malwareCheckPassed: true,
        sensitivityCheckPassed: true,
        typeAndSizeAllowed: true,
      },
    });
    expect(overwrite).toMatchObject({
      blockers: expect.arrayContaining(["ticket_folder_invalid"]),
      risk: "Blocked",
    });
  });

  it("never lets approval bypass a closed registry, missing evidence, or scope", () => {
    const result = classifyExecutionRisk({
      actionKey: "quickbooks.bill.create_draft",
      technical: {
        ...openTechnical,
        documentedEvidence: false,
        productionAllowed: false,
        roleScopeAuthorized: false,
      },
    });

    expect(result).toMatchObject({
      blockers: expect.arrayContaining([
        "action_not_production_allowed",
        "documented_evidence_missing",
        "role_scope_invalid",
      ]),
      defaultRisk: "High",
      risk: "Blocked",
    });
  });

  it("blocks unknown action keys instead of accepting a caller risk", () => {
    expect(classifyExecutionRisk({ actionKey: "browser.claims.low" })).toMatchObject({
      blockers: ["action_unknown"],
      risk: "Blocked",
    });
  });

  it("keeps generic new-message send forbidden even if a registry flag were flipped", () => {
    expect(
      classifyExecutionRisk({
        actionKey: "gmail.message.send",
        communication: confirmedCommunication,
        technical: openTechnical,
      }),
    ).toMatchObject({
      blockers: expect.arrayContaining(["generic_action_forbidden"]),
      risk: "Blocked",
    });
  });
});
