import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the data layer so the route tests exercise auth + wiring without Firestore.
vi.mock("@/lib/firestore/maintenance-intake-review", async (importActual) => {
  const actual =
    await importActual<typeof import("@/lib/firestore/maintenance-intake-review")>();
  return {
    ...actual,
    listUnverifiedIntake: vi.fn(async () => [{ id: "i1", status: "unverified" }]),
    promoteUnverifiedIntake: vi.fn(async () => ({ id: "t1", status: "Open" })),
    dismissUnverifiedIntake: vi.fn(async () => ({ id: "i1", status: "dismissed" })),
  };
});

import { GET } from "@/app/api/maintenance/intake/route";
import { POST as PROMOTE } from "@/app/api/maintenance/intake/[intakeId]/promote/route";
import { POST as DISMISS } from "@/app/api/maintenance/intake/[intakeId]/dismiss/route";
import { setAuthResolverForTest } from "@/lib/auth/session";
import {
  dismissUnverifiedIntake,
  listUnverifiedIntake,
  promoteUnverifiedIntake,
} from "@/lib/firestore/maintenance-intake-review";

function setEditor() {
  setAuthResolverForTest(() => ({
    email: "editor@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
    uid: "editor-1",
  }));
}

function post(body: unknown) {
  return new Request("http://localhost/api/maintenance/intake/i1/promote", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ctx = { params: Promise.resolve({ intakeId: "i1" }) };

beforeEach(() => {
  vi.mocked(listUnverifiedIntake).mockClear();
  vi.mocked(promoteUnverifiedIntake).mockClear();
  vi.mocked(dismissUnverifiedIntake).mockClear();
});

afterEach(() => setAuthResolverForTest(null));

describe("intake review routes", () => {
  it("GET list requires auth", async () => {
    setAuthResolverForTest(() => null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(listUnverifiedIntake).not.toHaveBeenCalled();
  });

  it("GET list returns the queue for an editor", async () => {
    setEditor();
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.intake).toHaveLength(1);
  });

  it("promote requires auth and does not touch the data layer when unauthenticated", async () => {
    setAuthResolverForTest(() => null);
    const res = await PROMOTE(post({}), ctx);
    expect(res.status).toBe(401);
    expect(promoteUnverifiedIntake).not.toHaveBeenCalled();
  });

  it("promote creates a ticket for an editor (201)", async () => {
    setEditor();
    const res = await PROMOTE(post({ priority: "High" }), ctx);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ticket.id).toBe("t1");
    expect(promoteUnverifiedIntake).toHaveBeenCalledTimes(1);
  });

  it("dismiss requires a reason (400) and requires auth (401)", async () => {
    setAuthResolverForTest(() => null);
    expect((await DISMISS(post({ reason: "x" }), ctx)).status).toBe(401);

    setEditor();
    // Missing reason -> schema rejects with 400 (parseJsonBody).
    expect((await DISMISS(post({}), ctx)).status).toBe(400);
    expect(dismissUnverifiedIntake).not.toHaveBeenCalled();

    const ok = await DISMISS(post({ reason: "junk" }), ctx);
    expect(ok.status).toBe(200);
    expect(dismissUnverifiedIntake).toHaveBeenCalledTimes(1);
  });
});
