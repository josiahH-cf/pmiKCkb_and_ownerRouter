import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firestore/lease-renewal-test-runs", async (importActual) => {
  const actual =
    await importActual<typeof import("@/lib/firestore/lease-renewal-test-runs")>();
  return {
    ...actual,
    createCanonicalLeaseTestRun: vi.fn(),
    simulateLeaseTestAction: vi.fn(),
    transitionLeaseTestRun: vi.fn(),
  };
});

import { POST as createTestRun } from "@/app/api/lease-renewal/test-runs/route";
import { PATCH as transitionTestRun } from "@/app/api/lease-renewal/test-runs/[runId]/route";
import { POST as runTestAction } from "@/app/api/lease-renewal/test-runs/[runId]/test-actions/route";
import { setAuthResolverForTest } from "@/lib/auth/session";
import {
  createCanonicalLeaseTestRun,
  simulateLeaseTestAction,
  transitionLeaseTestRun,
} from "@/lib/firestore/lease-renewal-test-runs";
import { LEASE_TEST_CONFIRMATION } from "@/lib/lease-renewal/test-workflow";

const context = { params: Promise.resolve({ runId: "test-renewal-1" }) };

function setEditor() {
  setAuthResolverForTest(() => ({
    email: "editor@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
    uid: "editor-1",
  }));
}

function jsonRequest(url: string, body: unknown, method = "POST") {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  setAuthResolverForTest(null);
  vi.mocked(createCanonicalLeaseTestRun).mockReset();
  vi.mocked(simulateLeaseTestAction).mockReset();
  vi.mocked(transitionLeaseTestRun).mockReset();
});

describe("persistent Lease Test routes", () => {
  it("creates only the canonical server-owned scenario", async () => {
    setEditor();
    vi.mocked(createCanonicalLeaseTestRun).mockResolvedValue({
      id: "test-renewal-1",
      data_mode: "test",
    } as never);

    const response = await createTestRun(
      jsonRequest("http://localhost/api/lease-renewal/test-runs", {
        scenario: "standard-renewal",
      }),
    );
    expect(response.status).toBe(201);
    expect(createCanonicalLeaseTestRun).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "editor-1" }),
      { scenario: "standard-renewal" },
    );
  });

  it("rejects browser-supplied customer aliases", async () => {
    setEditor();
    const response = await createTestRun(
      jsonRequest("http://localhost/api/lease-renewal/test-runs", {
        scenario: "standard-renewal",
        residentEmail: "customer@example.com",
      }),
    );
    expect(response.status).toBe(400);
    expect(createCanonicalLeaseTestRun).not.toHaveBeenCalled();
  });

  it("requires the exact action confirmation before invoking the Test writer", async () => {
    setEditor();
    const response = await runTestAction(
      jsonRequest(
        "http://localhost/api/lease-renewal/test-runs/test-renewal-1/test-actions",
        {
          actionKey: "gmail.renewal_notice.draft_create",
          confirmation: "yes",
        },
      ),
      context,
    );
    expect(response.status).toBe(400);
    expect(simulateLeaseTestAction).not.toHaveBeenCalled();
  });

  it("writes a sequential status and returns bodyless Test evidence", async () => {
    setEditor();
    vi.mocked(transitionLeaseTestRun).mockResolvedValue({
      id: "test-renewal-1",
      status: "Reviewed",
    } as never);
    const transitionResponse = await transitionTestRun(
      jsonRequest(
        "http://localhost/api/lease-renewal/test-runs/test-renewal-1",
        { nextStatus: "Reviewed" },
        "PATCH",
      ),
      context,
    );
    expect(transitionResponse.status).toBe(200);

    vi.mocked(simulateLeaseTestAction).mockResolvedValue({
      receipt: {
        id: "receipt-1",
        data_mode: "test",
        provider_contacted: false,
        live_proof_eligible: false,
      },
      attempt: {
        id: "attempt-1",
        data_mode: "test",
        provider_contacted: false,
      },
    } as never);
    const actionResponse = await runTestAction(
      jsonRequest(
        "http://localhost/api/lease-renewal/test-runs/test-renewal-1/test-actions",
        {
          actionKey: "gmail.renewal_notice.draft_create",
          confirmation: LEASE_TEST_CONFIRMATION,
        },
      ),
      context,
    );
    expect(actionResponse.status).toBe(201);
    expect(simulateLeaseTestAction).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "editor-1" }),
      "test-renewal-1",
      {
        actionKey: "gmail.renewal_notice.draft_create",
        confirmation: LEASE_TEST_CONFIRMATION,
      },
    );
  });
});
