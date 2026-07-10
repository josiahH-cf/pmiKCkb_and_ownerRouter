import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GET as GET_DECIDER_PROGRESS,
  POST as POST_DECIDER_PROGRESS,
} from "@/app/api/lease-renewal/decider-progress/route";
import { setAuthResolverForTest } from "@/lib/auth/session";
import {
  listRenewalDeciderProgressForRun,
  setRenewalDeciderProgress,
  type RenewalDeciderProgressRecord,
} from "@/lib/firestore/renewal-decider-progress";

// Keep the real strict schemas at route module load; mock only repository I/O.
vi.mock("@/lib/firestore/renewal-decider-progress", async (importActual) => {
  const actual =
    await importActual<typeof import("@/lib/firestore/renewal-decider-progress")>();
  return {
    ...actual,
    setRenewalDeciderProgress: vi.fn(),
    listRenewalDeciderProgressForRun: vi.fn(),
  };
});

const RUN_ID = "run-1";
const FLAG_KEY = "lease_renewal:reconcile:run-1:current_rent";

afterEach(() => {
  setAuthResolverForTest(null);
  vi.mocked(setRenewalDeciderProgress).mockReset();
  vi.mocked(listRenewalDeciderProgressForRun).mockReset();
});

function setEditor() {
  setAuthResolverForTest(() => ({
    email: "editor@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
    uid: "editor-1",
  }));
}

function progress(
  overrides: Partial<RenewalDeciderProgressRecord> = {},
): RenewalDeciderProgressRecord {
  return {
    id: "editor-1_run-1_lease_renewal_reconcile_run-1_current_rent",
    user_uid: "editor-1",
    run_id: RUN_ID,
    source_trigger_key: FLAG_KEY,
    status: "Deferred",
    created_at: "2026-07-10T00:00:00.000Z",
    updated_at: "2026-07-10T00:00:00.000Z",
    ...overrides,
  };
}

function postRequest(body: unknown) {
  return new Request("http://localhost/api/lease-renewal/decider-progress", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

describe("renewal decider progress API route", () => {
  it("returns 401 before any progress write when unauthenticated", async () => {
    setAuthResolverForTest(() => null);

    const response = await POST_DECIDER_PROGRESS(
      postRequest({
        run_id: RUN_ID,
        source_trigger_key: FLAG_KEY,
        status: "Deferred",
      }),
    );

    expect(response.status).toBe(401);
    expect(setRenewalDeciderProgress).not.toHaveBeenCalled();
  });

  it("writes a value-free Deferred marker at the edit-gated endpoint", async () => {
    setEditor();
    vi.mocked(setRenewalDeciderProgress).mockResolvedValue(progress());

    const response = await POST_DECIDER_PROGRESS(
      postRequest({
        run_id: RUN_ID,
        source_trigger_key: FLAG_KEY,
        status: "Deferred",
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      progress: {
        source_trigger_key: FLAG_KEY,
        status: "Deferred",
      },
    });
    expect(setRenewalDeciderProgress).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "editor-1", role: "Editor" }),
      { run_id: RUN_ID, source_trigger_key: FLAG_KEY, status: "Deferred" },
    );
  });

  it("rejects unknown/client-value fields instead of passing them to persistence", async () => {
    setEditor();

    const response = await POST_DECIDER_PROGRESS(
      postRequest({
        run_id: RUN_ID,
        source_trigger_key: FLAG_KEY,
        status: "Deferred",
        candidate_value: "$1,425",
        customer_email: "tenant@example.com",
      }),
    );

    expect(response.status).toBe(400);
    expect(setRenewalDeciderProgress).not.toHaveBeenCalled();
  });

  it("rejects an invalid status before persistence", async () => {
    setEditor();

    const response = await POST_DECIDER_PROGRESS(
      postRequest({
        run_id: RUN_ID,
        source_trigger_key: FLAG_KEY,
        status: "Resolved",
      }),
    );

    expect(response.status).toBe(400);
    expect(setRenewalDeciderProgress).not.toHaveBeenCalled();
  });

  it("returns 401 before hydrating progress when unauthenticated", async () => {
    setAuthResolverForTest(() => null);

    const response = await GET_DECIDER_PROGRESS(
      new Request(`http://localhost/api/lease-renewal/decider-progress?run_id=${RUN_ID}`),
    );

    expect(response.status).toBe(401);
    expect(listRenewalDeciderProgressForRun).not.toHaveBeenCalled();
  });

  it("hydrates only the current user's value-free markers for the requested run", async () => {
    setEditor();
    vi.mocked(listRenewalDeciderProgressForRun).mockResolvedValue([
      progress(),
      progress({
        id: "editor-1_run-1_other",
        source_trigger_key: "lease_renewal:reconcile:run-1:renewal_date",
        status: "Seen",
      }),
    ]);

    const response = await GET_DECIDER_PROGRESS(
      new Request(`http://localhost/api/lease-renewal/decider-progress?run_id=${RUN_ID}`),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      progress: [
        { source_trigger_key: FLAG_KEY, status: "Deferred" },
        {
          source_trigger_key: "lease_renewal:reconcile:run-1:renewal_date",
          status: "Seen",
        },
      ],
    });
    expect(listRenewalDeciderProgressForRun).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "editor-1" }),
      RUN_ID,
    );
  });

  it("requires a valid run_id query parameter before repository work", async () => {
    setEditor();

    const missing = await GET_DECIDER_PROGRESS(
      new Request("http://localhost/api/lease-renewal/decider-progress"),
    );
    const clientValue = await GET_DECIDER_PROGRESS(
      new Request(
        "http://localhost/api/lease-renewal/decider-progress?run_id=123%20Main%20Street",
      ),
    );

    expect(missing.status).toBe(400);
    expect(clientValue.status).toBe(400);
    expect(listRenewalDeciderProgressForRun).not.toHaveBeenCalled();
  });
});
