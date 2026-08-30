import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCapabilityInSpace: vi.fn(),
  readServerConfig: vi.fn(),
  createModelProvider: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireCapabilityInSpace: mocks.requireCapabilityInSpace,
}));

vi.mock("@/lib/config/server", () => ({
  readServerConfig: mocks.readServerConfig,
}));

vi.mock("@/lib/llm/model-provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/llm/model-provider")>();
  return { ...actual, createModelProvider: mocks.createModelProvider };
});

import { POST } from "@/app/api/lease-renewal/renewal-copy-assist/route";
import { defaultRenewalCopySelection } from "@/lib/lease-renewal/renewal-copy-contract";

function request(body: unknown) {
  return new Request("http://localhost/api/lease-renewal/renewal-copy-assist", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("renewal copy assistance route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCapabilityInSpace.mockResolvedValue({
      uid: "editor-1",
      email: "editor@pmikcmetro.com",
      role: "Editor",
    });
  });

  it("refuses current review-only copy before model config or provider construction", async () => {
    const response = await POST(
      request({
        templateRef: defaultRenewalCopySelection("tenant").templateRef,
        templateVersion: "v1.0",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "refused",
      usedModel: false,
      refusedBeforeModel: true,
      template: { ref: "tenant-renewal:v1.0", status: "review_only" },
    });
    expect(body.errors.join(" ")).toMatch(/client-approved wording/i);
    expect(mocks.requireCapabilityInSpace).toHaveBeenCalledWith("edit", "renewals");
    expect(mocks.readServerConfig).not.toHaveBeenCalled();
    expect(mocks.createModelProvider).not.toHaveBeenCalled();
  });

  it("rejects browser-supplied facts and extra fields before any model work", async () => {
    const response = await POST(
      request({
        templateRef: defaultRenewalCopySelection("owner").templateRef,
        templateVersion: "v1.0",
        editableRegions: { owner_request: "Customer name typed here" },
        recipient: "owner@synthetic.example.test",
        amount: 9999,
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.readServerConfig).not.toHaveBeenCalled();
    expect(mocks.createModelProvider).not.toHaveBeenCalled();
  });
});
