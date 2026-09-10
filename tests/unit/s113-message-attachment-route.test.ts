import { beforeEach, describe, expect, it, vi } from "vitest";
const seam = vi.hoisted(() => ({
  authorize: vi.fn(),
  load: vi.fn(),
  resolve: vi.fn(),
  runtime: { deps: { store: {} }, context: {} },
}));
vi.mock("@/lib/auth/session", () => ({ requireCapabilityInSpace: seam.authorize }));
vi.mock("@/lib/lease-renewal/comp-screenshot-runtime", () => ({
  buildLiveCompScreenshotRuntime: () => seam.runtime,
}));
vi.mock("@/lib/lease-renewal/comp-screenshot-attachment-runtime", () => ({
  loadCurrentRenewalDraftCompScreenshotAttachment: seam.load,
  resolveRenewalDraftCompScreenshotAttachment: seam.resolve,
}));
import { GET } from "@/app/api/lease-renewal/message-attachment/route";
import { CompScreenshotContractError } from "@/lib/lease-renewal/comp-screenshot-service";
import { EditableLayerError } from "@/lib/firestore/errors";

const receiptId = `comp_store_${"a".repeat(48)}`;
const attachment = {
  spaceId: "renewals",
  compRecordHash: "b".repeat(64),
  renewalRecordHash: "c".repeat(64),
  executionId: receiptId,
  receiptId,
  resultHash: "d".repeat(64),
  filename: "Reviewed-comp.png",
  mimeType: "image/png",
  sizeBytes: 4,
  sha256Checksum: "e".repeat(64),
};
const request = (id = receiptId) =>
  new Request(
    `https://local.invalid/api/lease-renewal/message-attachment?leaseId=701&receiptId=${id}`,
  );
beforeEach(() => {
  vi.resetAllMocks();
  seam.authorize.mockResolvedValue({});
  seam.load.mockResolvedValue(attachment);
  seam.resolve.mockResolvedValue({
    ...attachment,
    bytes: new Uint8Array([137, 80, 78, 71]),
  });
});
describe("S113 reviewed attachment download", () => {
  it("returns only bytes from the exact existing resolver with private download headers", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([137, 80, 78, 71]);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toContain("Reviewed-comp.png");
    expect(seam.resolve).toHaveBeenCalledWith(
      "701",
      attachment,
      seam.runtime.deps,
      seam.runtime.context,
    );
  });
  it("refuses changed receipts, lost access and the existing closed provider gate without bytes", async () => {
    expect((await GET(request(`comp_store_${"f".repeat(48)}`))).status).toBe(409);
    expect(seam.resolve).not.toHaveBeenCalled();
    seam.authorize.mockRejectedValueOnce(new EditableLayerError("No access", 403));
    expect((await GET(request())).status).toBe(403);
    seam.resolve.mockRejectedValueOnce(
      new CompScreenshotContractError(
        "The exact Drive action is closed.",
        "preview_stale",
      ),
    );
    const refused = await GET(request());
    expect(refused.status).toBe(409);
    expect(refused.headers.get("content-disposition")).toBeNull();
  });
});
