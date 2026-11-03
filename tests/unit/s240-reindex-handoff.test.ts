import { describe, expect, it, vi } from "vitest";
import { buildReindexCommand } from "@/lib/admin/reindex-command";
import {
  buildImportDocumentsRequest,
  parseImportArgs,
  verifyImportSourceGenerations,
} from "@/scripts/import-agent-search-documents.mjs";

const source = {
  space_id: "lease-renewals",
  source_path: "lease-renewals/source.txt",
  gcs_uri: "gs://fixture-source-bucket/lease-renewals/source.txt",
  data_store_id: "kb-renewals",
  approval_status: "Approved",
  sensitivity: "Low",
  generation: "123",
  dataSchema: "content" as const,
};
const input = {
  spaceId: "lease-renewals",
  dataStoreId: "kb-renewals",
  gcpProjectId: "fixture-project",
  vertexSearchLocation: "us",
  sourcePrefix: "gs://fixture-source-bucket/lease-renewals/",
  sources: [source],
};

describe("S240 exact source-bound reindex handoff", () => {
  it("refuses generation drift before a manual importer dispatch", async () => {
    const parsed = parseImportArgs(
      buildReindexCommand(input).command.split(" -- ")[1].split(" "),
      {},
    );
    const read = vi.fn().mockResolvedValue("123");
    await expect(verifyImportSourceGenerations(parsed, read)).resolves.toBeUndefined();
    expect(read).toHaveBeenCalled();
    await expect(
      verifyImportSourceGenerations(parsed, async () => "124"),
    ).rejects.toThrow("changed");
    await expect(
      verifyImportSourceGenerations(
        { ...parsed, sourceGenerations: ["123", "456"] },
        read,
      ),
    ).rejects.toThrow("one exact");
  });
  it("runnable reindex arguments build an import request for exactly the approved source snapshot", () => {
    const plan = buildReindexCommand(input);
    expect(plan.runnable).toBe(true);
    const args = plan.command.split(" -- ")[1].split(" ");
    const parsed = parseImportArgs(args, {});
    expect(parsed.createDataStore).toBe(false);
    expect(buildImportDocumentsRequest(parsed)).toMatchObject({
      parent:
        "projects/fixture-project/locations/us/collections/default_collection/dataStores/kb-renewals/branches/default_branch",
      gcsSource: { dataSchema: "content", inputUris: [source.gcs_uri] },
    });
  });
  it.each([
    { ...input, sources: [] },
    { ...input, gcpProjectId: undefined },
    { ...input, sources: [{ ...source, approval_status: "Unreviewed" }] },
    { ...input, sources: [{ ...source, space_id: "move-in" }] },
    { ...input, sources: [{ ...source, data_store_id: "wrong-store" }] },
    {
      ...input,
      sources: [{ ...source, gcs_uri: "gs://fixture-source-bucket/another/source.txt" }],
    },
    { ...input, sources: [{ ...source, generation: "" }] },
  ])("does not call an incomplete or mismatched source handoff runnable %#", (value) => {
    expect(buildReindexCommand(value).runnable).toBe(false);
  });
});
