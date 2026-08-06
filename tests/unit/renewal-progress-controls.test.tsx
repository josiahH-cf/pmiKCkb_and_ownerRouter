// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OwnerDecisionForm } from "@/components/lease-renewal/RenewalProgressControls";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("OwnerDecisionForm reference-only comp lookup (AC-S28-2)", () => {
  it("shows the looked-up range read-only with the caption and never binds offeredRent", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        rangeLow: 1450,
        rangeHigh: 1600,
        pointEstimate: 1525,
        source: "Manual entry",
        confidence: "Likely",
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <OwnerDecisionForm address="104 NE Lindsay Ave" current={null} leaseId="L1" />,
    );

    const rentInput = screen.getByLabelText(/Offered rent/i) as HTMLInputElement;
    expect(rentInput.value).toBe("");

    fireEvent.click(screen.getByRole("button", { name: /Look up market comps/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/Reference only\. Does not set the rent\./),
      ).toBeInTheDocument(),
    );
    // The range renders as read-only reference text with the provider attribution.
    expect(
      screen.getByText(
        (content) => content.includes("$1,450") && content.includes("Manual entry"),
      ),
    ).toBeInTheDocument();
    // The offered-rent input is NEVER set from the comp result.
    expect(rentInput.value).toBe("");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/lease-renewal/market-comps",
      expect.objectContaining({ method: "POST" }),
    );
  });

  // AC-S59-6: no address → refuse locally; NO lookup request; "Unknown" is never sent. The mount
  // effect's screenshot-status GET shares the fetch stub, so assertions filter to the lookup POST.
  it("refuses a comp lookup locally when the lease has no address and sends nothing", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      json: async () => ({}),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<OwnerDecisionForm address="   " current={null} leaseId="L1" />);
    fireEvent.click(screen.getByRole("button", { name: /Look up market comps/i }));

    await waitFor(() =>
      expect(screen.getByText(/no address on file/)).toBeInTheDocument(),
    );
    const lookupCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("market-comps"),
    );
    expect(lookupCalls).toHaveLength(0);
  });

  // AC-S59-7 client half: the known unit attributes ride along with the lookup.
  it("sends the lease's known unit attributes with the lookup", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      json: async () => ({ source: "RentCast", confidence: "Needs Verification" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <OwnerDecisionForm
        address="104 NE Lindsay Ave"
        compAttributes={{ bedrooms: 3, bathrooms: 2.5, postalCode: "64118" }}
        current={null}
        leaseId="L1"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Look up market comps/i }));

    await waitFor(() => {
      const lookupCalls = fetchMock.mock.calls.filter(([url]) =>
        String(url).includes("market-comps"),
      );
      expect(lookupCalls).toHaveLength(1);
    });
    const lookupCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("market-comps"),
    )!;
    const body = JSON.parse(String(lookupCall[1]?.body ?? "{}")) as Record<
      string,
      unknown
    >;
    expect(body).toMatchObject({
      address: "104 NE Lindsay Ave",
      bedrooms: 3,
      bathrooms: 2.5,
    });
    expect(JSON.stringify(body)).not.toContain("Unknown");
  });

  it("renders the distinct out-of-allowance refusal with the remaining-count figure", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        source: "RentCast",
        confidence: "Needs Verification",
        reason: "out_of_allowance",
        quota: { used: 50, allowance: 50, remaining: 0, warn: true },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <OwnerDecisionForm address="104 NE Lindsay Ave" current={null} leaseId="L1" />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Look up market comps/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/monthly comp-lookup allowance is used up/),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(/0 of 50 comp lookups left this month/)).toBeInTheDocument();
  });

  it("fails closed without rendering the comps-screenshot file control by default", () => {
    render(
      <OwnerDecisionForm address="104 NE Lindsay Ave" current={null} leaseId="L1" />,
    );
    expect(screen.queryByLabelText(/Comps screenshot/i)).not.toBeInTheDocument();
  });

  it("renders the file control only when the server-owned action projection is executable", () => {
    render(
      <OwnerDecisionForm
        address="104 NE Lindsay Ave"
        compScreenshotExecutable
        current={null}
        leaseId="L1"
      />,
    );
    const fileInput = screen.getByLabelText(/Comps screenshot/i) as HTMLInputElement;
    expect(fileInput.type).toBe("file");
  });

  it("keeps an existing screenshot reference visible while new storage is closed", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ status: "not_found" }) })),
    );
    render(
      <OwnerDecisionForm
        address="104 NE Lindsay Ave"
        current={{
          decision: "increase",
          offeredRent: 1500,
          market: { compScreenshotRef: "drive:existing-file" },
        }}
        leaseId="L1"
      />,
    );

    expect(screen.queryByLabelText(/Comps screenshot/i)).not.toBeInTheDocument();
    expect(screen.getByText(/drive:existing-file/)).toBeInTheDocument();
  });

  it("clears stale screenshot provenance when hydration reports rolled back", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          status: "rolled_back",
          executionId: `comp_store_${"c".repeat(48)}`,
        }),
      })),
    );
    render(
      <OwnerDecisionForm
        current={{
          decision: "increase",
          offeredRent: 1500,
          market: { compScreenshotRef: "drive:rolled-back-file" },
        }}
        leaseId="L1"
      />,
    );

    await waitFor(() =>
      expect(screen.queryByText(/drive:rolled-back-file/)).not.toBeInTheDocument(),
    );
    expect(
      screen.getByText("Screenshot removal was already verified."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Review screenshot removal" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Check exact screenshot attempt" }),
    ).not.toBeInTheDocument();
  });

  it("hydrates an active rollback as a recovery action without projecting the screenshot as delivered", async () => {
    const executionId = `comp_store_${"e".repeat(48)}`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          status: "rollback_ambiguous",
          executionId,
          reason: "Screenshot removal is uncertain.",
        }),
      })),
    );
    render(
      <OwnerDecisionForm
        compScreenshotExecutable
        current={{ decision: "increase", offeredRent: 1500 }}
        leaseId="L1"
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Recover screenshot removal" }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Screenshot stored \(ref/)).not.toBeInTheDocument();
    expect(screen.getByText("Screenshot removal is uncertain.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Check exact screenshot attempt" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Comps screenshot/i)).not.toBeInTheDocument();
  });

  it("hydrates a receipted screenshot before the first owner decision is saved", async () => {
    const executionId = `comp_store_${"1".repeat(48)}`;
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        status: "delivered",
        executionId,
        receipt: { executionId, ref: "drive:predecision-file" },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<OwnerDecisionForm compScreenshotExecutable current={null} leaseId="L1" />);

    await waitFor(() =>
      expect(screen.getByText(/drive:predecision-file/)).toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText(/Comps screenshot/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Review screenshot removal" }),
    ).toBeInTheDocument();
  });

  it("adopts an existing receipt returned by a raced preview instead of offering another upload", async () => {
    const executionId = `comp_store_${"5".repeat(48)}`;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "not_found" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "existing",
          executionId,
          receipt: { executionId, ref: "drive:raced-file" },
          reason: "This renewal already has a receipted screenshot.",
        }),
      });
    vi.stubGlobal("fetch", fetchMock);
    render(<OwnerDecisionForm compScreenshotExecutable current={null} leaseId="L1" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const file = new File(
      [
        new Uint8Array([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0,
        ]),
      ],
      "comp.png",
      { type: "image/png" },
    );
    fireEvent.change(screen.getByLabelText(/Comps screenshot/i), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review screenshot" }));

    await waitFor(() => expect(screen.getByText(/drive:raced-file/)).toBeInTheDocument());
    expect(screen.queryByLabelText(/Comps screenshot/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Review screenshot removal" }),
    ).toBeInTheDocument();
  });

  it("adopts a raced in-progress lineage and resumes only the reselected exact file", async () => {
    const executionId = `comp_store_${"6".repeat(48)}`;
    const previewHash = "7".repeat(64);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "not_found" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "in_progress",
          executionId,
          reason: "A screenshot attempt already owns this renewal evidence slot.",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "resume",
          preview: { executionId, previewHash },
          file: {
            filename: "comp.png",
            mimeType: "image/png",
            sizeBytes: 16,
          },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);
    render(<OwnerDecisionForm compScreenshotExecutable current={null} leaseId="L1" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const file = new File(
      [
        new Uint8Array([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0,
        ]),
      ],
      "comp.png",
      { type: "image/png" },
    );
    fireEvent.change(screen.getByLabelText(/Comps screenshot/i), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review screenshot" }));
    await waitFor(() =>
      expect(
        screen.getByText("A screenshot attempt already owns this renewal evidence slot."),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: "Check exact screenshot attempt" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Review screenshot" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Confirm and store screenshot" }),
      ).toBeInTheDocument(),
    );
    expect(JSON.parse(fetchMock.mock.calls[2][1].body as string)).toMatchObject({
      operation: "resume",
      leaseId: "L1",
      executionId,
    });
  });

  it("keeps file selection local, then requires preview and an explicit upload confirmation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "not_found" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "preview",
          preview: {
            executionId: `comp_store_${"a".repeat(48)}`,
            previewHash: "b".repeat(64),
            expiresAt: "2026-07-30T00:10:00.000Z",
          },
          file: {
            filename: "comp.png",
            mimeType: "image/png",
            sizeBytes: 16,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "delivered",
          executionId: `comp_store_${"a".repeat(48)}`,
          receipt: {
            executionId: `comp_store_${"a".repeat(48)}`,
            ref: "drive:verified-file",
          },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);
    render(<OwnerDecisionForm compScreenshotExecutable current={null} leaseId="L1" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const file = new File(
      [
        new Uint8Array([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0,
        ]),
      ],
      "comp.png",
      { type: "image/png" },
    );
    fireEvent.change(screen.getByLabelText(/Comps screenshot/i), {
      target: { files: [file] },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText(/Selected locally\. Review the exact file/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Review screenshot" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Confirm and store screenshot" }),
      ).toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const previewBody = JSON.parse(fetchMock.mock.calls[1][1].body as string) as {
      confirm: boolean;
      leaseId: string;
    };
    expect(previewBody).toMatchObject({ confirm: false, leaseId: "L1" });

    fireEvent.click(screen.getByRole("button", { name: "Confirm and store screenshot" }));
    await waitFor(() =>
      expect(screen.getByText(/drive:verified-file/)).toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const commitBody = JSON.parse(fetchMock.mock.calls[2][1].body as string) as {
      confirm: boolean;
      executionId: string;
      previewHash: string;
    };
    expect(commitBody).toMatchObject({
      confirm: true,
      executionId: `comp_store_${"a".repeat(48)}`,
      previewHash: "b".repeat(64),
    });
  });

  it("recovers a reloaded ambiguous attempt only after the operator reselects and reconfirms the exact file", async () => {
    const executionId = `comp_store_${"f".repeat(48)}`;
    const previewHash = "9".repeat(64);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "ambiguous",
          executionId,
          reason: "Drive still cannot verify the reserved file.",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "resume",
          preview: { executionId, previewHash },
          file: {
            filename: "comp.png",
            mimeType: "image/png",
            sizeBytes: 16,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "delivered",
          executionId,
          receipt: { executionId, ref: "drive:recovered-file" },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <OwnerDecisionForm
        compScreenshotExecutable
        current={{ decision: "increase", offeredRent: 1500 }}
        leaseId="L1"
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Check exact screenshot attempt" }),
      ).toBeInTheDocument(),
    );
    const file = new File(
      [
        new Uint8Array([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0,
        ]),
      ],
      "comp.png",
      { type: "image/png" },
    );
    fireEvent.change(screen.getByLabelText(/Comps screenshot/i), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review screenshot" }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Confirm and store screenshot" }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: "Check exact screenshot attempt" }),
    ).not.toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toMatchObject({
      operation: "resume",
      leaseId: "L1",
      executionId,
    });

    fireEvent.click(screen.getByRole("button", { name: "Confirm and store screenshot" }));
    await waitFor(() =>
      expect(screen.getByText(/drive:recovered-file/)).toBeInTheDocument(),
    );
    expect(JSON.parse(fetchMock.mock.calls[2][1].body as string)).toMatchObject({
      operation: "store",
      confirm: true,
      leaseId: "L1",
      executionId,
      previewHash,
    });
  });

  it("hydrates a receipted attempt after refresh and uses a separate exact trash confirmation", async () => {
    const executionId = `comp_store_${"c".repeat(48)}`;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "delivered",
          executionId,
          receipt: { executionId, ref: "drive:existing-file" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "preview",
          preview: {
            rollbackId: `comp_trash_${"d".repeat(48)}`,
            previewHash: "e".repeat(64),
            expiresAt: "2026-07-30T00:10:00.000Z",
            providerDriftedSinceReceipt: false,
          },
          target: {
            ref: "drive:existing-file",
            targetLabel: "PMI KC in-boundary Drive image folder",
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "rolled_back" }),
      });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <OwnerDecisionForm
        current={{
          decision: "increase",
          offeredRent: 1500,
          market: { compScreenshotRef: "drive:existing-file" },
        }}
        leaseId="L1"
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Review screenshot removal" }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByLabelText(/Comps screenshot/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review screenshot removal" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Confirm move to Drive trash" }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText(
        /Confirm removal of drive:existing-file from PMI KC in-boundary Drive image folder/,
      ),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toMatchObject({
      confirm: false,
      leaseId: "L1",
      executionId,
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm move to Drive trash" }));
    await waitFor(() =>
      expect(screen.queryByText(/drive:existing-file/)).not.toBeInTheDocument(),
    );
    const rollbackCommit = JSON.parse(fetchMock.mock.calls[2][1].body as string) as {
      confirm: boolean;
      leaseId: string;
      rollbackId: string;
      previewHash: string;
    };
    expect(rollbackCommit).toMatchObject({
      confirm: true,
      leaseId: "L1",
      rollbackId: `comp_trash_${"d".repeat(48)}`,
      previewHash: "e".repeat(64),
    });
  });

  it("enters rollback recovery and clears the delivered projection when the confirmation response is lost", async () => {
    const executionId = `comp_store_${"2".repeat(48)}`;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "delivered",
          executionId,
          receipt: { executionId, ref: "drive:uncertain-file" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "preview",
          preview: {
            rollbackId: `comp_trash_${"3".repeat(48)}`,
            previewHash: "4".repeat(64),
            expiresAt: "2026-07-30T00:10:00.000Z",
            providerDriftedSinceReceipt: false,
          },
          target: {
            ref: "drive:uncertain-file",
            targetLabel: "PMI KC in-boundary Drive image folder",
          },
        }),
      })
      .mockRejectedValueOnce(new Error("response lost"));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <OwnerDecisionForm
        compScreenshotExecutable
        current={{
          decision: "increase",
          offeredRent: 1500,
          market: { compScreenshotRef: "drive:uncertain-file" },
        }}
        leaseId="L1"
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Review screenshot removal" }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Review screenshot removal" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Confirm move to Drive trash" }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm move to Drive trash" }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Recover screenshot removal" }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText(/drive:uncertain-file/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Comps screenshot/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Check exact screenshot attempt" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Confirm move to Drive trash" }),
    ).not.toBeInTheDocument();
  });
});
