import { describe, expect, it } from "vitest";

import { buildReindexCommand } from "@/lib/admin/reindex-command";

describe("buildReindexCommand", () => {
  it("builds the owner import command for a Space with a configured data store", () => {
    const plan = buildReindexCommand({
      spaceId: "lease-renewals",
      dataStoreId: "data-store-1",
      gcpProjectId: "pmi-kc-kb-prod",
      vertexSearchLocation: "us",
      sourcePrefix: "gs://fixture-source-bucket/lease-renewals/",
      sources: [
        {
          space_id: "lease-renewals",
          source_path: "lease-renewals/source.txt",
          gcs_uri: "gs://fixture-source-bucket/lease-renewals/source.txt",
          data_store_id: "data-store-1",
          approval_status: "Approved",
          sensitivity: "Low",
          generation: "1",
          dataSchema: "content",
        },
      ],
    });
    expect(plan.runnable).toBe(true);
    expect(plan.command).toBe(
      "npm run import:agent-search -- --data-store=data-store-1 --project=pmi-kc-kb-prod --location=us --data-schema=content --source-id=gs://fixture-source-bucket/lease-renewals/source.txt --source-generation=1",
    );
    expect(plan.notes.join(" ")).toMatch(/cost-bearing/);
    expect(plan.notes.join(" ")).toMatch(/you run the command yourself/);
  });

  it("is not runnable when the Space has no configured data store", () => {
    const plan = buildReindexCommand({
      spaceId: "brand-new",
      gcpProjectId: "pmi-kc-kb-prod",
      vertexSearchLocation: "us",
    });
    expect(plan.runnable).toBe(false);
    expect(plan.notes[0]).toBe(
      "No valid Vertex data store is configured for this Space.",
    );
    // Still cost-safe: it prints guidance, never a runnable ingestion command.
    expect(plan.command).not.toContain("import:agent-search");
  });

  it("does not prepare a runnable placeholder when GCP_PROJECT_ID is unset", () => {
    const plan = buildReindexCommand({
      spaceId: "lease-renewals",
      dataStoreId: "data-store-1",
      vertexSearchLocation: "us",
    });
    expect(plan.runnable).toBe(false);
    expect(plan.command).toBe("");
    expect(plan.notes[0]).toBe(
      "A real configured Google Cloud project is required; no placeholder command was prepared.",
    );
  });
});
