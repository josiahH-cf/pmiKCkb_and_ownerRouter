import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { resolveApprovedDotloopArtifact } from "@/lib/lease-documents/approved-artifact-content";
import { s66Catalog } from "@/tests/fixtures/s66-packet";

const bytes = new TextEncoder().encode("isolated approved artifact bytes");
const hash = createHash("sha256").update(bytes).digest("hex");
function setup() {
  const catalog = s66Catalog();
  const artifact = catalog.artifacts[0];
  artifact.contentHash = hash;
  artifact.publicationSource = {
    system: "s21_publication",
    reference: "publication:isolated-version",
    retrievedAt: "2026-09-08T00:00:00Z",
  };
  artifact.providerBindings = {
    dotloopDocumentRef: "isolated-document",
    dotloopTemplateRef: "isolated-template",
  };
  const version = {
    id: "isolated-version",
    resourceId: "isolated-resource",
    data_mode: "live",
    validated: true,
    contentHash: hash,
    spaceId: "renewals",
    fileName: "isolated.pdf",
    detectedMimeType: "application/pdf",
    contentByteSize: bytes.length,
    contentRef: { contentHash: hash, byteSize: bytes.length },
  };
  const deps = {
    readPublication: vi.fn(async () => version),
    readActiveVersionId: vi.fn(async () => version.id),
    readContent: vi.fn(async () => bytes),
  };
  const actor = {
    uid: "isolated-admin",
    email: "canary-admin@pmikcmetro.com",
    role: "Admin",
    allowedSpaceIds: ["renewals"],
  };
  return {
    catalog,
    artifact,
    version,
    deps,
    actor,
    input: { catalog, documentRef: "isolated-document", expectedContentHash: hash },
  };
}
describe("S34 approved publication content resolution", () => {
  it("loads only the exact active validated publication and preserves its bytes", async () => {
    const h = setup();
    const resolved = await resolveApprovedDotloopArtifact(
      h.actor as never,
      h.input,
      h.deps as never,
    );
    expect(resolved).toEqual({
      fileName: "isolated.pdf",
      contentType: "application/pdf",
      content: bytes,
    });
    expect(h.deps.readPublication).toHaveBeenCalledWith("isolated-version");
  });
  it.each(["hash", "inactive", "space", "retired-data", "validation"])(
    "refuses %s evidence before loading content",
    async (kind) => {
      const h = setup();
      if (kind === "hash") h.version.contentHash = "f".repeat(64);
      if (kind === "inactive")
        h.deps.readActiveVersionId.mockResolvedValue("other-version");
      if (kind === "space") h.version.spaceId = "other";
      if (kind === "retired-data") h.version.data_mode = "test";
      if (kind === "validation") h.version.validated = false;
      await expect(
        resolveApprovedDotloopArtifact(h.actor as never, h.input, h.deps as never),
      ).rejects.toThrow();
      expect(h.deps.readContent).not.toHaveBeenCalled();
    },
  );
  it("refuses changed content bytes and duplicate document mappings", async () => {
    const h = setup();
    h.deps.readContent.mockResolvedValue(new TextEncoder().encode("changed"));
    await expect(
      resolveApprovedDotloopArtifact(h.actor as never, h.input, h.deps as never),
    ).rejects.toThrow("content");
    h.catalog.artifacts.push({ ...h.artifact, artifactId: "another-artifact" });
    h.deps.readPublication.mockClear();
    await expect(
      resolveApprovedDotloopArtifact(h.actor as never, h.input, h.deps as never),
    ).rejects.toThrow("mapping");
    expect(h.deps.readPublication).not.toHaveBeenCalled();
  });
});
