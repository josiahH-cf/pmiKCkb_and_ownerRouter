// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RenewalNoticeDraftComposer } from "@/components/lease-renewal/RenewalNoticeDraftComposer";
import { RenewalNoticeDraftRequestSchema } from "@/lib/lease-renewal/execution/renewal-notice-draft-contract";
const executionId = `exec_${"a".repeat(40)}`;
const recovery = (resolution = "created") => ({
  status: "reconciliation",
  channel: "tenant",
  executionId,
  resolution,
  reason:
    resolution === "created"
      ? "The original draft was found."
      : "The original attempt needs review.",
  ...(resolution === "created" ? { draftId: "synthetic-draft" } : {}),
});
function setup(result = recovery()) {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(result), { status: 200 }));
  vi.stubGlobal("fetch", fetcher);
  render(<RenewalNoticeDraftComposer leaseId="9001" />);
  fireEvent.click(screen.getByText("Recover an earlier legacy draft attempt"));
  return fetcher;
}
function tenantInputs(rent = "1,250.00") {
  fireEvent.change(screen.getByLabelText("Original execution identifier"), {
    target: { value: executionId },
  });
  fireEvent.change(screen.getByLabelText("Original offered rent"), {
    target: { value: rent },
  });
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
// Creation/recipient/template/claim parity remains exercised through the supplied-message controls,
// s116-complete-recipients, s113-message-content, and the real s113-sheet-route Firestore journey.
describe("legacy composer migration and original-input recovery", () => {
  it("routes both supported audiences to actual current reviewed controls without any request on render", () => {
    const fetcher = setup();
    expect(screen.getByRole("link", { name: "Prepare owner message" })).toHaveAttribute(
      "href",
      "/lease-renewal/live/desk/lease/9001#renewal-section-owner",
    );
    expect(screen.getByRole("link", { name: "Prepare tenant message" })).toHaveAttribute(
      "href",
      "/lease-renewal/live/desk/lease/9001#renewal-section-tenant",
    );
    expect(
      screen.queryByRole("button", { name: "Create Gmail draft" }),
    ).not.toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("requires the original execution and original offer before read-only recovery", () => {
    setup();
    expect(screen.getByRole("button", { name: "Check original attempt" })).toBeDisabled();
    tenantInputs();
    expect(screen.getByRole("button", { name: "Check original attempt" })).toBeEnabled();
  });
  it("normalizes original human-formatted money and emits reconcile only, never preview or confirmation", async () => {
    const fetcher = setup();
    tenantInputs();
    fireEvent.click(screen.getByRole("button", { name: "Check original attempt" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    const request = RenewalNoticeDraftRequestSchema.parse(
      JSON.parse(fetcher.mock.calls[0][1].body),
    );
    expect(request.offer).toMatchObject({ channel: "tenant", offeredRent: 1250 });
    expect(request.reconcile).toEqual({ executionId });
    expect(request.confirm).toBeUndefined();
    expect(await screen.findByRole("status")).toHaveTextContent(
      "original draft was found",
    );
  });
  it("rejects malformed currency grouping without a request", () => {
    const fetcher = setup();
    tenantInputs("1,25.00");
    expect(screen.getByRole("button", { name: "Check original attempt" })).toBeDisabled();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("preserves original reviewed tenant wording in the recovery request", async () => {
    const fetcher = setup();
    tenantInputs();
    fireEvent.change(screen.getByLabelText("Original tenant response request"), {
      target: { value: "Synthetic exact original phrasing." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check original attempt" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    expect(
      JSON.parse(fetcher.mock.calls[0][1].body).copy.editableRegions.response_request,
    ).toBe("Synthetic exact original phrasing.");
  });
  it("retains owner recovery with exact range and both original editable regions", async () => {
    const fetcher = setup({ ...recovery(), channel: "owner" });
    fireEvent.change(screen.getByLabelText("Original audience"), {
      target: { value: "owner" },
    });
    fireEvent.change(screen.getByLabelText("Original execution identifier"), {
      target: { value: executionId },
    });
    for (const [label, value] of [
      ["Original recommendation", "1,250"],
      ["Original range low", "1,200"],
      ["Original range high", "1,300"],
      ["Original owner opening", "Synthetic opening"],
      ["Original owner decision request", "Synthetic original request"],
    ])
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Check original attempt" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.offer.market).toEqual({
      specificNumber: 1250,
      rangeLow: 1200,
      rangeHigh: 1300,
    });
    expect(body.copy.editableRegions).toEqual({
      salutation: "Synthetic opening",
      owner_request: "Synthetic original request",
    });
    expect(body.reconcile.executionId).toBe(executionId);
  });
  it("rejects inverted original owner range without a request", () => {
    const fetcher = setup();
    fireEvent.change(screen.getByLabelText("Original audience"), {
      target: { value: "owner" },
    });
    fireEvent.change(screen.getByLabelText("Original execution identifier"), {
      target: { value: executionId },
    });
    for (const [label, value] of [
      ["Original recommendation", "1250"],
      ["Original range low", "1300"],
      ["Original range high", "1200"],
    ])
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    expect(screen.getByRole("button", { name: "Check original attempt" })).toBeDisabled();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("keeps an unresolved own attempt explicit and offers no create-as-new control", async () => {
    setup(recovery("needs_review"));
    tenantInputs();
    fireEvent.click(screen.getByRole("button", { name: "Check original attempt" }));
    expect(await screen.findByRole("status")).toHaveTextContent("needs review");
    expect(
      screen.queryByRole("button", { name: /create|preview/i }),
    ).not.toBeInTheDocument();
  });
  it("refuses an unexpected creation/preview response as manual review instead of chaining another request", async () => {
    const fetcher = setup({ status: "not-a-recovery" } as never);
    tenantInputs();
    fireEvent.click(screen.getByRole("button", { name: "Check original attempt" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
