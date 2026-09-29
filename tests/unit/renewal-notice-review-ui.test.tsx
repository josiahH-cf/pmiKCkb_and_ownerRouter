// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RenewalNoticeReview } from "@/components/lease-renewal/RenewalNoticeReview";
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const basis = { scopeHash: "a".repeat(64), semanticHash: "b".repeat(64), version: 4 };
function fixture(ready = true, withdrawal = false) {
  return {
    basis,
    ready,
    cycleId: null,
    tenancyVerified: true,
    history: null,
    reason: null,
    disposition: {
      state: withdrawal ? "unknown" : "initiated",
      reason: withdrawal ? "withdrawal_review_required" : "pending_move_out_status",
      label: withdrawal
        ? "Staff review of withdrawal is required."
        : "Move-out notice recorded for 09/28/2026.",
    },
  };
}
function setup(current = fixture(), canEdit = true) {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(current), { status: 200 }));
  vi.stubGlobal("fetch", fetcher);
  render(<RenewalNoticeReview leaseId="9001" canEdit={canEdit} />);
  return fetcher;
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  refresh.mockClear();
});
describe("explicit notice evidence controls", () => {
  it("shows both recorded source observations with flags, dates, freshness and their actual read times", async () => {
    const at = Date.parse("2026-09-28T12:00:00Z");
    const evidence = {
      origin: "rentvine_lease_status",
      leaseId: "9001",
      statusId: "3",
      statusName: "Synthetic notice",
      primaryStatusId: "2",
      pendingMoveOut: true,
      completedMoveOut: false,
      noticeDateIso: "2026-09-28",
      expectedMoveOutIso: "2026-10-31",
      moveOutIso: null,
    };
    setup({
      ...fixture(true, true),
      history: {
        scopeHash: basis.scopeHash,
        revision: 2,
        positive: {
          evidence,
          sourceReadAt: { lease: at, status: at },
          freshness: "fresh",
          observedAt: new Date(at).toISOString(),
        },
        withdrawal: {
          evidence: {
            ...evidence,
            statusName: "Synthetic active",
            pendingMoveOut: false,
            noticeDateIso: null,
            expectedMoveOutIso: null,
          },
          sourceReadAt: { lease: at + 60000, status: at + 60000 },
          freshness: "fresh",
          reviewedAt: new Date(at + 60000).toISOString(),
        },
      },
    } as never);
    const summary = await screen.findByText(
      "Recorded notice evidence for this tenancy and cycle",
    );
    const readback = summary.parentElement!;
    expect(readback).toHaveTextContent("pending move-out: Yes");
    expect(readback).toHaveTextContent("pending move-out: No");
    expect(readback).toHaveTextContent("09/28/2026");
    expect(readback).toHaveTextContent("10/31/2026");
    expect(readback).toHaveTextContent("Lease source read:");
    expect(readback).toHaveTextContent("status source read:");
    expect(readback).toHaveTextContent("does not prove provider cancellation");
    expect(readback).not.toHaveTextContent("2026-09-28");
  });
  it("reads on view, permits pre-cycle review, and never records until the exact reasoned confirmation", async () => {
    const fetcher = setup();
    const button = await screen.findByRole("button", {
      name: "Record this notice evidence",
    });
    expect(button).toBeDisabled();
    expect(screen.getByText(/does not start a renewal cycle/)).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByLabelText("Notice review reason"), {
      target: { value: "Synthetic source checked" },
    });
    fetcher.mockResolvedValueOnce(
      new Response(JSON.stringify(fixture()), { status: 200 }),
    );
    fireEvent.click(button);
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    const body = JSON.parse(fetcher.mock.calls[1][1].body);
    expect(body).toMatchObject({
      leaseId: "9001",
      expected: basis,
      action: "record_notice",
      reason: "Synthetic source checked",
    });
    expect(body.operationId).toMatch(/^[a-f0-9-]{36}$/);
    expect(fetcher.mock.calls[1][1].method).toBe("POST");
    expect(await screen.findByText(/Staff notice review recorded/)).toBeInTheDocument();
  });
  it("requires a separate explicit withdrawal review and preserves errors without reporting success", async () => {
    const fetcher = setup(fixture(true, true));
    const button = await screen.findByRole("button", {
      name: "Record reviewed withdrawal",
    });
    fireEvent.change(screen.getByLabelText("Notice review reason"), {
      target: { value: "Synthetic withdrawal reviewed" },
    });
    fetcher.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "The source generation changed." }), {
        status: 409,
      }),
    );
    fireEvent.click(button);
    expect(await screen.findByText("The source generation changed.")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
    expect(JSON.parse(fetcher.mock.calls[1][1].body).action).toBe("review_withdrawal");
  });
  it.each([
    [false, true],
    [true, false],
  ])(
    "does not expose recording controls when ready=%s and canEdit=%s",
    async (ready, canEdit) => {
      const fetcher = setup(fixture(ready), canEdit);
      await screen.findByText(/Move-out notice recorded/);
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      expect(fetcher).toHaveBeenCalledOnce();
    },
  );
});
