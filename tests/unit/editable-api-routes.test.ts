import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as POST_SOP } from "@/app/api/spaces/[spaceId]/sops/route";
import { DELETE as DELETE_SOP, PATCH as PATCH_SOP } from "@/app/api/sops/[sopId]/route";
import { setAuthResolverForTest } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import { createSop, getSop, softDeleteSop, updateSop } from "@/lib/firestore/editable";

vi.mock("@/lib/firestore/editable", () => ({
  createSop: vi.fn(),
  getSop: vi.fn(),
  softDeleteSop: vi.fn(),
  updateSop: vi.fn(),
}));

afterEach(() => {
  setAuthResolverForTest(null);
  vi.mocked(createSop).mockReset();
  vi.mocked(getSop).mockReset();
  vi.mocked(updateSop).mockReset();
  vi.mocked(softDeleteSop).mockReset();
});

describe("editable API routes", () => {
  it("returns 401 before CRUD when unauthenticated", async () => {
    setAuthResolverForTest(() => null);

    const response = await POST_SOP(
      jsonRequest({
        body_md: "# SOP: Lease Renewals",
        owner_uid: "owner-uid",
        title: "Lease Renewals",
      }),
      spaceContext("lease-renewals"),
    );

    expect(response.status).toBe(401);
    expect(createSop).not.toHaveBeenCalled();
  });

  it("creates SOPs through the route layer for editors", async () => {
    setEditor();
    vi.mocked(createSop).mockResolvedValue({
      body_md: "# SOP: Lease Renewals",
      created_at: "2026-05-27T00:00:00.000Z",
      id: "sop-1",
      owner_uid: "owner-uid",
      sensitivity: "Low",
      source_state_hint: "Open Placeholder",
      space_id: "lease-renewals",
      status: "Draft",
      title: "Lease Renewals",
      updated_at: "2026-05-27T00:00:00.000Z",
    });

    const response = await POST_SOP(
      jsonRequest({
        body_md: "# SOP: Lease Renewals",
        owner_uid: "owner-uid",
        title: "Lease Renewals",
      }),
      spaceContext("lease-renewals"),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      sop: {
        id: "sop-1",
        status: "Draft",
      },
    });
    expect(createSop).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "editor" }),
      "lease-renewals",
      expect.objectContaining({ title: "Lease Renewals" }),
    );
  });

  it("maps editable-layer errors to API responses", async () => {
    setEditor();
    vi.mocked(getSop).mockResolvedValue({
      body_md: "# SOP",
      created_at: "2026-05-27T00:00:00.000Z",
      id: "sop-1",
      owner_uid: "owner-uid",
      sensitivity: "Low",
      source_state_hint: "Open Placeholder",
      space_id: "lease-renewals",
      status: "Draft",
      title: "Lease Renewals",
      updated_at: "2026-05-27T00:00:00.000Z",
    });
    vi.mocked(updateSop).mockRejectedValue(
      new EditableLayerError("Editor role cannot approve SOPs.", 403),
    );

    const response = await PATCH_SOP(
      jsonRequest({ status: "Approved" }),
      sopContext("sop-1"),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Editor role cannot approve SOPs.",
    });
  });

  it("requires Admin capability before soft delete route handlers run", async () => {
    setEditor();

    const response = await DELETE_SOP(
      jsonRequest({ note: "Retire" }),
      sopContext("sop-1"),
    );

    expect(response.status).toBe(403);
    expect(softDeleteSop).not.toHaveBeenCalled();
  });
});

function setEditor() {
  setAuthResolverForTest(() => ({
    email: "editor@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
    uid: "editor",
  }));
}

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/editable-test", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

function spaceContext(spaceId: string) {
  return { params: Promise.resolve({ spaceId }) };
}

function sopContext(sopId: string) {
  return { params: Promise.resolve({ sopId }) };
}
