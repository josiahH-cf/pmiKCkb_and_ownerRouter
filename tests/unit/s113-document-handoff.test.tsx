// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { RenewalDocumentHandoff } from "@/components/lease-renewal/RenewalDocumentHandoff";
vi.mock("@/components/lease-renewal/RenewalManualWorkspace", () => ({
  useRenewalManualWorkspace: () => ({
    leaseId: "701",
    state: { cycleId: "cycle", termsRevision: 1 },
  }),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const ready = {
  snapshot: null,
  blockers: [],
  readiness: { state: "connected" },
  catalogVersion: "reviewed-fixture-v1",
  attempts: [],
};
describe("S113 mounted S106/S34 handoff", () => {
  it("shows missing exact inputs and keeps manual handoffs without a fake creation or signature claim", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        ...ready,
        blockers: ["Approved forms and mappings are pending (B-DL3)."],
        readiness: { state: "credentials_not_configured" },
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    render(<RenewalDocumentHandoff />);
    await screen.findByText(/Approved forms and mappings are pending/);
    expect(
      screen.getByRole("button", { name: "Preview exact Dotloop packet creation" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("link", { name: "Record documents prepared outside the app" }),
    ).toHaveAttribute("href", "#renewal-manual-documents");
    expect(
      screen.getByRole("link", { name: /Record returned signed-artifact evidence/ }),
    ).toHaveAttribute("href", "#renewal-manual-signatures");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("shows the exact preview, cancels without execution, and posts only the Admin-confirmed action", async () => {
    const posts: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (!init?.body) return Response.json(ready);
        const body = JSON.parse(String(init.body));
        posts.push(body);
        return body.kind === "preview"
          ? Response.json({
              executionId: "packet-action",
              previewHash: "a".repeat(64),
              packetHash: "b".repeat(64),
              state: "Awaiting Admin",
              operation: "loop_create",
              participants: [
                {
                  name: "Emulator Tenant",
                  email: "tenant@fixture-rental.net",
                  role: "TENANT",
                },
              ],
              artifacts: [{ label: "Approved fixture form", version: "v1" }],
            })
          : Response.json({ execution: { state: "Succeeded" } });
      }),
    );
    render(<RenewalDocumentHandoff canApprove />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Preview exact Dotloop packet creation" }),
      ).toBeEnabled(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Preview exact Dotloop packet creation" }),
    );
    await screen.findByText(/Emulator Tenant · tenant@fixture-rental.net/);
    fireEvent.change(screen.getByLabelText("Admin approval reason"), {
      target: { value: "Reviewed exact form and signer" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review packet confirmation" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel packet action" }));
    expect(posts).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Review packet confirmation" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm this exact packet action" }),
    );
    await screen.findByText(
      /Packet action: Succeeded. Document presence does not prove signatures/,
    );
    expect(posts).toEqual([
      { kind: "preview", leaseId: "701", operation: "loop_create" },
      {
        kind: "confirm",
        leaseId: "701",
        executionId: "packet-action",
        previewHash: "a".repeat(64),
        reason: "Reviewed exact form and signer",
      },
    ]);
  });
});
