import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { LiveDotloopProvider } from "@/lib/integrations/dotloop/renewal-provider";
import { DotloopRenewalExecutor } from "@/lib/lease-renewal/execution/providers";
import { parseExternalReceipt } from "@/lib/external-execution/receipt";

const bytes = new Uint8Array([1, 2, 3]);
const hash = createHash("sha256").update(bytes).digest("hex");
function harness() {
  const client = {
    listFolderDocuments: vi.fn(async () => [{ id: "3", name: "renewal.pdf" }]),
    createFolder: vi.fn(async () => "2"),
    uploadDocument: vi.fn(async () => ({ id: "3", name: "renewal.pdf" })),
  };
  const provider = new LiveDotloopProvider({
    client: client as never,
    selection: {
      profileId: "1",
      templateId: "2",
      transactionType: "LEASE_OFFER",
      initialStatus: "PRE_OFFER",
    },
    participants: [],
    artifactContent: async () => ({
      fileName: "renewal.pdf",
      contentType: "application/pdf",
      content: bytes,
    }),
  });
  return { provider, client };
}

describe("S34 honest document evidence", () => {
  it("records provider-observed presence and name without echoing the app's hash", async () => {
    const { provider } = harness();
    const observed = await provider.readDocument("1:2:3", {
      documentType: "renewal_agreement",
      contentHash: hash,
    });
    expect(observed).toMatchObject({
      evidenceLevel: "presence_only",
      documentId: "3",
      documentName: "renewal.pdf",
    });
    expect(observed?.contentHash).not.toBe(hash);
  });
  it("refuses changed artifact bytes before folder creation or upload", async () => {
    const { provider, client } = harness();
    await expect(
      provider.uploadDocument({
        loopRef: "1",
        documentRef: "approved-artifact",
        documentType: "renewal_agreement",
        contentHash: "0".repeat(64),
        idempotencyKey: "one",
      }),
    ).rejects.toThrow("hash");
    expect(client.createFolder).not.toHaveBeenCalled();
    expect(client.uploadDocument).not.toHaveBeenCalled();
  });
  it("keeps submitted content hash separate from provider evidence through the receipt boundary", async () => {
    const { provider } = harness();
    const result = await new DotloopRenewalExecutor(provider).execute({
      dataMode: "live",
      workflowId: "packet",
      actionId: "upload",
      actionKey: "dotloop.document.upload",
      sourceRefs: ["approved-artifact"],
      values: {
        loop_ref: "1",
        document_ref: "approved-artifact",
        document_type: "renewal_agreement",
        content_hash: hash,
      },
    });
    const parsed = parseExternalReceipt(result, "dotloop.document.upload", false);
    expect(parsed.providerEvidence).toEqual({
      level: "presence_only",
      documentId: "3",
      documentName: "renewal.pdf",
    });
    expect(parsed.submittedContentHash).toBe(hash);
  });
});
