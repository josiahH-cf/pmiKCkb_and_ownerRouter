import { describe, expect, it } from "vitest";

import { EXECUTION_ACTION_POLICIES } from "@/lib/execution/risk-policy";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import {
  MAINTENANCE_EXECUTION_ACTIONS,
  MAINTENANCE_EXECUTION_DEFINITIONS,
} from "@/lib/maintenance/execution/matrix";

describe("Maintenance execution matrix", () => {
  it("exposes every R03 group with dependency, risk, correction, and registry entry", () => {
    expect(
      new Set(MAINTENANCE_EXECUTION_DEFINITIONS.map((entry) => entry.group)),
    ).toEqual(
      new Set([
        "App account lifecycle",
        "Mailbox lifecycle",
        "Drive photos",
        "Rentvine create",
        "Rentvine lifecycle",
        "Owner email",
        "Vendor email",
        "LeadSimple",
        "QuickBooks",
      ]),
    );
    expect(MAINTENANCE_EXECUTION_DEFINITIONS.map((entry) => entry.key)).toEqual(
      MAINTENANCE_EXECUTION_ACTIONS,
    );
    for (const definition of MAINTENANCE_EXECUTION_DEFINITIONS) {
      const policy =
        EXECUTION_ACTION_POLICIES[
          definition.key as keyof typeof EXECUTION_ACTION_POLICIES
        ];
      expect(policy, definition.key).toBeDefined();
      expect(definition.risk, definition.key).toBe(policy.defaultRisk);
      expect(ACTION_REGISTRY_SEED.some((entry) => entry.key === definition.key)).toBe(
        true,
      );
      expect(definition.correction).toBeTruthy();
    }
  });

  it("keeps staff photo capture independent while Vendor drafts stay Medium", () => {
    const photo = MAINTENANCE_EXECUTION_DEFINITIONS.find(
      (entry) => entry.key === "google_drive.maintenance_photo.store",
    );
    const vendorDraft = MAINTENANCE_EXECUTION_DEFINITIONS.find(
      (entry) => entry.key === "vendor.gmail.draft.create",
    );
    expect(photo?.dependsOn).toEqual([]);
    expect(vendorDraft?.risk).toBe("Medium");
  });
});
