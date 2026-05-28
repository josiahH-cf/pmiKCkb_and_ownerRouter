import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/ask/capture/route";
import { setAuthResolverForTest } from "@/lib/auth/session";
import { createPlaceholder } from "@/lib/firestore/editable";

vi.mock("@/lib/firestore/editable", () => ({
  createPlaceholder: vi.fn(),
}));

afterEach(() => {
  setAuthResolverForTest(null);
  vi.mocked(createPlaceholder).mockReset();
});

describe("Ask capture API route", () => {
  it("returns 401 before creating placeholders when unauthenticated", async () => {
    setAuthResolverForTest(() => null);

    const response = await POST(jsonRequest(validCaptureBody()));

    expect(response.status).toBe(401);
    expect(createPlaceholder).not.toHaveBeenCalled();
  });

  it("creates an owned placeholder from a capturable Ask result", async () => {
    setAuthResolverForTest(() => ({
      email: "editor@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Editor",
      uid: "editor",
    }));
    vi.mocked(createPlaceholder).mockResolvedValue({
      created_at: "2026-05-28T00:00:00.000Z",
      id: "placeholder-1",
      missing_detail: "What is undocumented?",
      owner_uid: "editor",
      priority: "P1",
      space_id: "lease-renewals",
      status: "Open",
      updated_at: "2026-05-28T00:00:00.000Z",
    });

    const response = await POST(jsonRequest(validCaptureBody()));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      placeholder: {
        id: "placeholder-1",
        status: "Open",
      },
    });
    expect(createPlaceholder).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "editor" }),
      "lease-renewals",
      expect.objectContaining({
        missing_detail: "What is undocumented?",
        owner_uid: "editor",
        source_hint: "No Reliable Source Found",
        status: "Open",
      }),
    );
  });

  it("rejects capture requests for already verified answers", async () => {
    setAuthResolverForTest(() => ({
      email: "editor@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Editor",
      uid: "editor",
    }));

    const response = await POST(
      jsonRequest({ ...validCaptureBody(), source_state: "Verified Source" }),
    );

    expect(response.status).toBe(400);
    expect(createPlaceholder).not.toHaveBeenCalled();
  });
});

function validCaptureBody() {
  return {
    priority: "P1",
    question: "What is undocumented?",
    source_state: "No Reliable Source Found",
    space_id: "lease-renewals",
  };
}

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/ask/capture", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}
