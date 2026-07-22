import { describe, expect, it } from "vitest";

import { buildReindexCommand } from "@/lib/admin/reindex-command";

describe("buildReindexCommand", () => {
  it("builds the owner import command for a Space with a configured data store", () => {
    const plan = buildReindexCommand({
      spaceId: "lease-renewals",
      dataStoreId: "data-store-1",
      gcpProjectId: "pmi-kc-kb-prod",
      vertexSearchLocation: "us",
    });
    expect(plan.runnable).toBe(true);
    expect(plan.command).toBe(
      "npm run import:agent-search -- --data-store=data-store-1 --project=pmi-kc-kb-prod --location=us",
    );
    expect(plan.notes.join(" ")).toMatch(/cost-bearing/);
    expect(plan.notes.join(" ")).toMatch(/you run the command yourself/);
  });

  it("is not runnable when the Space has no configured data store", () => {
    const plan = buildReindexCommand({
      spaceId: "brand-new",
      vertexSearchLocation: "us",
    });
    expect(plan.runnable).toBe(false);
    expect(plan.command).toMatch(/No Vertex data store is configured/);
    // Still cost-safe: it prints guidance, never a runnable ingestion command.
    expect(plan.command).not.toContain("import:agent-search");
  });

  it("shows a project placeholder when GCP_PROJECT_ID is unset", () => {
    const plan = buildReindexCommand({
      spaceId: "lease-renewals",
      dataStoreId: "data-store-1",
      vertexSearchLocation: "us",
    });
    expect(plan.command).toContain("<GCP_PROJECT_ID>");
    expect(plan.notes.join(" ")).toMatch(/Set GCP_PROJECT_ID/);
  });
});
