import { describe, expect, it, vi } from "vitest";
import {
  readReindexSources,
  type ReindexSourceDependencies,
} from "@/lib/admin/reindex-sources";
import { buildReindexCommand } from "@/lib/admin/reindex-command";
import { cloudStorageContentDocumentId } from "@/scripts/source-doc-id.mjs";
const actor = {
  uid: "fixture-admin",
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin" as const,
};
const config = {
  spaceDriveFolderIds: { "lease-renewals": "gs://fixture-source-bucket/lease-renewals" },
  spaceVertexDataStoreIds: { "lease-renewals": "kb-renewals" },
};
function deps(
  overrides: Partial<ReindexSourceDependencies> = {},
): ReindexSourceDependencies {
  return {
    listObjects: vi.fn().mockResolvedValue([
      {
        name: "lease-renewals/source.txt",
        generation: "12",
        contentType: "text/plain",
      },
    ]),
    readSourceMeta: vi.fn().mockResolvedValue({
      space_id: "lease-renewals",
      approval_status: "Approved",
      sensitivity: "Low",
    }),
    ...overrides,
  };
}
describe("S240 current source-owner inventory", () => {
  it("joins bounded metadata reads to existing approval identity without importing", async () => {
    const d = deps(),
      inventory = await readReindexSources(actor, "lease-renewals", config, d);
    expect(d.listObjects).toHaveBeenCalledWith(
      "fixture-source-bucket",
      "lease-renewals/",
    );
    expect(d.readSourceMeta).toHaveBeenCalledWith(
      cloudStorageContentDocumentId(
        "gs://fixture-source-bucket/lease-renewals/source.txt",
      ),
    );
    expect(
      buildReindexCommand({
        spaceId: "lease-renewals",
        dataStoreId: "kb-renewals",
        gcpProjectId: "fixture-project",
        vertexSearchLocation: "us",
        ...inventory,
      }).runnable,
    ).toBe(true);
  });
  it.each([
    deps({
      listObjects: async () => {
        throw new Error("permission denied");
      },
    }),
    deps({ readSourceMeta: async () => null }),
    deps({
      listObjects: async () => [
        { name: "another/source.txt", generation: "1", contentType: "text/plain" },
      ],
    }),
    deps({
      listObjects: async () => [
        {
          name: "lease-renewals/source.jsonl",
          generation: "1",
          contentType: "text/plain",
        },
      ],
    }),
    deps({
      listObjects: async () =>
        Array.from({ length: 101 }, (_, i) => ({ name: `lease-renewals/${i}.txt` })),
    }),
  ])(
    "never treats a failed, mismatched, unknown-format or truncated read as an empty success %#",
    async (d) => {
      const result = await readReindexSources(actor, "lease-renewals", config, d);
      expect(result.sourceReadError).toBeTruthy();
      expect(result.sources).toEqual([]);
    },
  );
  it("refuses non-admins before any source read", async () => {
    const d = deps();
    await expect(
      readReindexSources({ ...actor, role: "Editor" }, "lease-renewals", config, d),
    ).rejects.toThrow("Only an Admin");
    expect(d.listObjects).not.toHaveBeenCalled();
  });
});
