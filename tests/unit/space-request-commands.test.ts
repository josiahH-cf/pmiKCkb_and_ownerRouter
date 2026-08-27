import { describe, expect, it } from "vitest";

import {
  FIXED_SPACE_PROVISIONING_RUNTIME_IDENTITY,
  buildSpaceProvisioningPlan,
  slugifySpaceId,
} from "@/lib/admin/space-request-commands";

const SPACE_IDS = [
  "lease-renewals",
  "owner-renewal-outreach",
  "tenant-renewal-notice",
  "maintenance-work-order-intake",
  "vendor-assignment-handoff",
  "daily-inbox-triage",
  "fathom-training",
  "escalation-rules",
  "move-in",
  "move-out-deposit-disposition",
  "owner-onboarding",
];

function base() {
  return {
    name: "Owner Statements",
    scope: "Monthly owner statements",
    intendedSources: ["Client-approved owner statement process"],
    gcpProjectId: "pmi-kc-kb-prod",
    vertexSearchLocation: "us",
    existingVertexDataStoreIds: Object.fromEntries(
      SPACE_IDS.map((id) => [id, `kb-${id}-txt`]),
    ),
    existingDriveFolderIds: Object.fromEntries(
      SPACE_IDS.map((id) => [id, `gs://pmi-kc-kb-prod-sources-558870356522/${id}/`]),
    ),
  };
}

function envMap(lines: string[], key: string): Record<string, string> {
  const line = lines.find((entry) => entry.startsWith(`${key}=`));
  if (!line) throw new Error(`missing ${key}`);
  return JSON.parse(line.slice(line.indexOf("=") + 1));
}

describe("slugifySpaceId", () => {
  it("kebab-cases a name and strips junk", () => {
    expect(slugifySpaceId("Owner Statements")).toBe("owner-statements");
    expect(slugifySpaceId("  Move-In / Move-Out!! ")).toBe("move-in-move-out");
    expect(slugifySpaceId("")).toBe("new-space");
  });
});

describe("fixed S36 provisioning plan", () => {
  it("derives one isolated resource shape and preserves all eleven mappings", () => {
    const input = base();
    const plan = buildSpaceProvisioningPlan(input);
    expect(plan).toMatchObject({
      shape: "one-space-gcs-discovery-v1",
      spaceId: "owner-statements",
      dataStoreId: "kb-owner-statements-txt",
      sourcePrefix: "gs://pmi-kc-kb-prod-sources-558870356522/owner-statements/",
      runtimeServiceAccount: FIXED_SPACE_PROVISIONING_RUNTIME_IDENTITY,
      readyForAuthorization: true,
      commands: [],
    });
    expect(plan.protectedDataStoreIds).toHaveLength(11);
    expect(envMap(plan.envLocalLines, "SPACE_VERTEX_DATA_STORE_IDS")).toEqual({
      ...input.existingVertexDataStoreIds,
      "owner-statements": "kb-owner-statements-txt",
    });
    expect(envMap(plan.envLocalLines, "SPACE_DRIVE_FOLDER_IDS")).toEqual({
      ...input.existingDriveFolderIds,
      "owner-statements": "gs://pmi-kc-kb-prod-sources-558870356522/owner-statements/",
    });
    expect(plan.iamDisclosure.join(" ")).toMatch(/no service account|no.*IAM/i);
    expect(plan.costDisclosure.join(" ")).toContain("$100 project stop");
    expect(plan.externalInputRequired).toMatch(/owner-approved pilot packet/i);
  });

  it("fails closed on project, location, source-shape, or id drift", () => {
    const wrong = base();
    wrong.gcpProjectId = "caller-project";
    wrong.vertexSearchLocation = "global";
    wrong.existingDriveFolderIds["move-in"] = "drive-folder-id";
    wrong.name = "Lease Renewals";
    const plan = buildSpaceProvisioningPlan(wrong);
    expect(plan.readyForAuthorization).toBe(false);
    expect(plan.alreadyExists).toBe(true);
    expect(plan.blockers).toHaveLength(4);
    expect(plan.commands).toEqual([]);
  });

  it("does not mutate current mappings", () => {
    const input = base();
    const vertex = structuredClone(input.existingVertexDataStoreIds);
    const source = structuredClone(input.existingDriveFolderIds);
    buildSpaceProvisioningPlan(input);
    expect(input.existingVertexDataStoreIds).toEqual(vertex);
    expect(input.existingDriveFolderIds).toEqual(source);
  });
});
