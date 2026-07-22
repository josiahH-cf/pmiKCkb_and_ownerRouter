import { describe, expect, it } from "vitest";

import {
  buildSpaceProvisioningPlan,
  slugifySpaceId,
} from "@/lib/admin/space-request-commands";

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
    expect(slugifySpaceId("!!!")).toBe("new-space");
  });
});

describe("buildSpaceProvisioningPlan", () => {
  const base = {
    name: "Owner Statements",
    scope: "Monthly owner statements",
    intendedSources: ["Drive: owner-statements SOPs"],
    gcpProjectId: "pmi-kc-kb-prod",
    vertexSearchLocation: "us",
    existingVertexDataStoreIds: { "lease-renewals": "lease-renewals-ds" },
    existingDriveFolderIds: { "lease-renewals": "folder-1" },
  };

  it("derives the ids and preserves existing Spaces in the merged env lines", () => {
    const plan = buildSpaceProvisioningPlan(base);
    expect(plan.spaceId).toBe("owner-statements");
    expect(plan.dataStoreId).toBe("owner-statements");
    expect(plan.alreadyExists).toBe(false);

    // Existing Space preserved + the new Space merged (the 11-space config is never dropped).
    expect(envMap(plan.envLocalLines, "SPACE_VERTEX_DATA_STORE_IDS")).toEqual({
      "lease-renewals": "lease-renewals-ds",
      "owner-statements": "owner-statements",
    });
    expect(envMap(plan.envLocalLines, "SPACE_DRIVE_FOLDER_IDS")).toEqual({
      "lease-renewals": "folder-1",
      "owner-statements": "<DRIVE_FOLDER_ID>",
    });

    // The create command targets the real Discovery Engine endpoint, project, and data store id.
    expect(plan.commands.join("\n")).toContain(
      "https://us-discoveryengine.googleapis.com/v1/projects/pmi-kc-kb-prod/locations/us/collections/default_collection/dataStores?dataStoreId=owner-statements",
    );
    expect(plan.commands.join("\n")).toContain("npm run import:agent-search");

    // Reinforces the .env.local rule and that the app never provisions.
    expect(plan.notes.join(" ")).toMatch(/must live in \.env\.local/);
    expect(plan.notes.join(" ")).toMatch(/never provisions Vertex/);
    expect(plan.notes.join(" ")).toContain("Drive: owner-statements SOPs");
  });

  it("flags a duplicate Space and a missing project", () => {
    const plan = buildSpaceProvisioningPlan({
      ...base,
      name: "Lease Renewals",
      gcpProjectId: undefined,
    });
    expect(plan.spaceId).toBe("lease-renewals");
    expect(plan.alreadyExists).toBe(true);
    expect(plan.notes[0]).toMatch(/already exists/);
    expect(plan.commands.join("\n")).toContain("<GCP_PROJECT_ID>");
    expect(plan.notes.join(" ")).toMatch(/Set GCP_PROJECT_ID/);
  });

  it("uses the global Discovery Engine endpoint for the global location", () => {
    const plan = buildSpaceProvisioningPlan({ ...base, vertexSearchLocation: "global" });
    expect(plan.commands.join("\n")).toContain(
      "https://discoveryengine.googleapis.com/v1/projects/pmi-kc-kb-prod/locations/global/",
    );
  });

  it("does not mutate the input maps", () => {
    const vertex = { "lease-renewals": "lease-renewals-ds" };
    const drive = { "lease-renewals": "folder-1" };
    buildSpaceProvisioningPlan({
      ...base,
      existingVertexDataStoreIds: vertex,
      existingDriveFolderIds: drive,
    });
    expect(vertex).toEqual({ "lease-renewals": "lease-renewals-ds" });
    expect(drive).toEqual({ "lease-renewals": "folder-1" });
  });
});
