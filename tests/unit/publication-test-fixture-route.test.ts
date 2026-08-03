import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/publication/policy", () => ({
  resolvePublicationPolicyForSpace: vi.fn(),
}));
vi.mock("@/lib/publication/provider", () => ({
  resolvePublicationScanner: vi.fn(),
}));
vi.mock("@/lib/publication/service", () => ({
  publishTrustedContent: vi.fn(),
}));

import { POST } from "@/app/api/spaces/[spaceId]/publications/route";
import { setAuthResolverForTest } from "@/lib/auth/session";
import { resolvePublicationPolicyForSpace } from "@/lib/publication/policy";
import { resolvePublicationScanner } from "@/lib/publication/provider";
import { publishTrustedContent } from "@/lib/publication/service";
import type { PublicationPolicyRecord } from "@/lib/publication/types";

const policy: PublicationPolicyRecord = {
  id: "policy-live-1",
  data_mode: "live",
  allowedSpaces: ["lease-renewals"],
  allowedTypes: [{ extension: ".md", maxBytes: 2048, mimeTypes: ["text/markdown"] }],
  connectorId: "connector-live",
  createdAt: "2026-08-03T00:00:00.000Z",
  createdByUid: "admin-1",
  enabled: true,
  rootId: "root-live",
  scannerKey: "scanner-live",
  sensitivityCeiling: "Medium",
  updatedAt: "2026-08-03T00:00:00.000Z",
  updatedByUid: "admin-1",
};

beforeEach(() => {
  setAuthResolverForTest(() => ({
    email: "editor@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
    scopes: ["renewals"],
    uid: "editor-1",
  }));
  vi.mocked(resolvePublicationPolicyForSpace).mockResolvedValue(policy);
  vi.mocked(resolvePublicationScanner).mockReturnValue({ key: "scanner-live" } as never);
  vi.mocked(publishTrustedContent).mockResolvedValue({
    id: "version-live-1",
    validated: true,
  } as never);
});

afterEach(() => {
  setAuthResolverForTest(null);
  vi.clearAllMocks();
});

describe("ordinary trusted-publication route after fixture retirement", () => {
  it("publishes scoped Live content without a Test fixture key or lane input", async () => {
    const response = await POST(request(), context());

    expect(response.status).toBe(201);
    expect(resolvePublicationPolicyForSpace).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "editor-1" }),
      "lease-renewals",
      "policy-live-1",
    );
    expect(publishTrustedContent).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "editor-1" }),
      policy,
      expect.objectContaining({
        metadata: expect.objectContaining({
          connectorId: "connector-live",
          path: "sources/live-source.md",
          rootId: "root-live",
          spaceId: "lease-renewals",
        }),
      }),
      expect.anything(),
    );
    const envelope = vi.mocked(publishTrustedContent).mock.calls[0]?.[2];
    expect(envelope?.metadata).not.toHaveProperty("test_fixture_key");
    expect(envelope?.metadata).not.toHaveProperty("data_mode", "test");
  });

  it("refuses an out-of-scope Editor before policy or publication construction", async () => {
    setAuthResolverForTest(() => ({
      email: "editor@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Editor",
      scopes: ["maintenance"],
      uid: "editor-1",
    }));

    const response = await POST(request(), context());

    expect(response.status).toBe(403);
    expect(resolvePublicationPolicyForSpace).not.toHaveBeenCalled();
    expect(publishTrustedContent).not.toHaveBeenCalled();
  });
});

function context() {
  return { params: Promise.resolve({ spaceId: "lease-renewals" }) };
}

function request() {
  const content = "# Verified source";
  return new Request("http://localhost/api/spaces/lease-renewals/publications", {
    body: content,
    headers: {
      "content-type": "text/markdown",
      "x-publication-byte-size": String(new TextEncoder().encode(content).byteLength),
      "x-publication-citation-label": "Verified source",
      "x-publication-file-name": "live-source.md",
      "x-publication-mime-type": "text/markdown",
      "x-publication-path": "sources/live-source.md",
      "x-publication-policy-id": "policy-live-1",
      "x-publication-source-state": "Verified Source",
    },
    method: "POST",
  });
}
