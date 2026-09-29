/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FilledArtifactPanel } from "@/components/lease-renewal/FilledArtifactPanel";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const record = {
  id: "filled-synthetic",
  outputHash: "a".repeat(64),
  originalHash: "b".repeat(64),
  mapVersion: "synthetic-v1",
  comparison: { allFields: { Amount: "0", Flag: false, Signature: null } },
};
describe("S130 real filled artifact controls", () => {
  it("requires explicit prepare, download inspection and exact output approval without automatic effects", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          supported: true,
          record: null,
          canPrepare: true,
          canApprove: true,
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ record }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          record: { ...record, approval: { outputHash: record.outputHash } },
        }),
      });
    vi.stubGlobal("fetch", fetcher);
    render(
      <FilledArtifactPanel
        leaseId="123"
        snapshotId="synthetic-snapshot"
        artifactId="synthetic-artifact"
      />,
    );
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Check filled document" }));
    await screen.findByRole("button", { name: "Prepare filled PDF" });
    expect(fetcher.mock.calls[0][1].method).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: "Prepare filled PDF" }));
    const download = await screen.findByRole("link", {
      name: "Download filled PDF for inspection",
    });
    expect(download.getAttribute("href")).toContain("derivedId=filled-synthetic");
    expect(screen.getByText("Flag: false")).toBeTruthy();
    const approve = screen.getByRole("button", { name: "Approve exact filled PDF" });
    expect((approve as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(approve);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toMatchObject({
      action: "approve",
      derivedId: record.id,
      outputHash: record.outputHash,
      inspected: true,
    });
    await screen.findByText(/approved for this exact output/);
  });
  it("keeps manual files unavailable and hides unauthorized writes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          supported: false,
          reason: "Manual handoff required",
          record: null,
          canPrepare: false,
          canApprove: false,
        }),
      })),
    );
    render(<FilledArtifactPanel leaseId="123" snapshotId="s" artifactId="a" />);
    fireEvent.click(screen.getByRole("button"));
    await screen.findByText("Manual handoff required");
    expect(screen.queryByRole("button", { name: "Prepare filled PDF" })).toBeNull();
  });
});
