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
  it("normalizes formatted money before recording and refuses malformed grouping", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      void init;
      return {
        ok: true,
        json: async () =>
          String(url).includes("comp-screenshot") ? { status: "not_found" } : {},
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <OwnerDecisionForm address="104 NE Lindsay Ave" current={null} leaseId="L1" />,
    );
    const rentInput = screen.getByLabelText(/Offered rent/i);
    fireEvent.change(rentInput, { target: { value: "$1,500.25" } });
    fireEvent.click(screen.getByRole("button", { name: "Record owner decision" }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) =>
          String(url).includes("/api/lease-renewal/renewal-progress"),
        ),
      ).toBe(true),
    );
    const writeCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/api/lease-renewal/renewal-progress"),
    );
    expect(JSON.parse(String(writeCall?.[1]?.body))).toMatchObject({
      leaseId: "L1",
      offeredRent: 1500.25,
    });

    fireEvent.change(rentInput, { target: { value: "1,50" } });
    expect(screen.getByRole("button", { name: "Record owner decision" })).toBeDisabled();
  });

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
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      void url;
      void init;
      return { ok: true, json: async () => ({}) };
    });
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

  // AC-S59-1 client half: the browser nominates only the lease; the server owns query facts.
  it("does not send address or unit attributes from the browser", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      void url;
      void init;
      return {
        ok: true,
        json: async () => ({ source: "RentCast", confidence: "Needs Verification" }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <OwnerDecisionForm address="104 NE Lindsay Ave" current={null} leaseId="L1" />,
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
    expect(body).toEqual({ leaseId: "L1" });
    expect(JSON.stringify(body)).not.toContain("Unknown");
  });

  it("renders a typed server-side lease-data refusal instead of hiding the failed lookup", async () => {
    const fetchMock = vi.fn(async (url: string) => ({
      ok: !String(url).includes("market-comps"),
      json: async () =>
        String(url).includes("market-comps")
          ? {
              error_type: "lease_data_expired",
              error:
                "The live lease data is past its freshness maximum. Refresh the Renewals desk before looking up comps.",
            }
          : { status: "not_found" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <OwnerDecisionForm address="104 NE Lindsay Ave" current={null} leaseId="L1" />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Look up market comps/i }));

    await waitFor(() =>
      expect(screen.getByText(/lease data is stale/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Reference only\. Does not set the rent\./)).toBeVisible();
  });

  it("lets the server decide trend eligibility and sends only lease identity for both reads", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { operation?: string };
      return {
        ok: true,
        json: async () =>
          String(url).includes("comp-screenshot")
            ? { status: "not_found" }
            : body.operation === "trend"
              ? {
                  source: "RentCast",
                  zipCode: "64118",
                  history: { "2026-07": { averageRent: 1500 } },
                  confidence: "Likely",
                }
              : {
                  rangeLow: 1450,
                  rangeHigh: 1650,
                  pointEstimate: 1550,
                  compCount: 3,
                  source: "RentCast",
                  retrievedAt: "2026-08-29T12:00:00.000Z",
                  confidence: "Likely",
                },
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <OwnerDecisionForm address="104 NE Lindsay Ave" current={null} leaseId="L1" />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Look up market comps/i }));

    await waitFor(() => {
      const lookupCalls = fetchMock.mock.calls.filter(([url]) =>
        String(url).includes("market-comps"),
      );
      expect(lookupCalls).toHaveLength(2);
    });
    const lookupBodies = fetchMock.mock.calls
      .filter(([url]) => String(url).includes("market-comps"))
      .map(([, init]) => JSON.parse(String(init?.body ?? "{}")));
    expect(lookupBodies).toEqual([
      { leaseId: "L1" },
      { operation: "trend", leaseId: "L1" },
    ]);
  });

  it("sends only the lease identity and renders the exact server query/evidence projection", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      void init;
      return {
        ok: true,
        json: async () =>
          String(url).includes("comp-screenshot")
            ? { status: "not_found" }
            : {
                rangeLow: 1450,
                rangeHigh: 1650,
                pointEstimate: 1550,
                compCount: 3,
                source: "RentCast",
                sourceUrl: "https://www.rentcast.io",
                retrievedAt: "2026-08-29T12:00:00.000Z",
                confidence: "Likely",
                cached: false,
                quota: { used: 1, allowance: 50, remaining: 49, warn: false },
                queryBasis: {
                  leaseId: "L1",
                  addressLabel: "104 NE Lindsay Ave, Kansas City, MO 64118",
                  policy: {
                    maxRadiusMiles: 2,
                    requestedCompCount: 15,
                    lookupSubjectAttributes: true,
                    providerVersion: "rentcast-avm-long-term-v1",
                  },
                  query: { bedrooms: 3, bathrooms: 2.5, squareFootage: 1400 },
                  attributes: [
                    {
                      field: "bedrooms",
                      label: "Bedrooms",
                      status: "sent",
                      value: 3,
                      sourcePath: "unit.beds",
                    },
                    {
                      field: "squareFootage",
                      label: "Square footage",
                      status: "sent",
                      value: 1400,
                      sourcePath: "unit.size",
                    },
                  ],
                  baseRent: {
                    status: "verified",
                    value: 1250,
                    sourcePath: "unit.rent",
                  },
                },
                comparables: [
                  {
                    rent: 1600,
                    correlation: 0.97,
                    distanceMiles: 0.4,
                    bedrooms: 3,
                    bathrooms: 2,
                    squareFootage: 1400,
                    daysOld: 10,
                  },
                ],
              },
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <OwnerDecisionForm address="104 NE Lindsay Ave" current={null} leaseId="L1" />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Look up market comps/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/2-mile maximum radius · 15 requested comps/),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText(
        (_content, element) =>
          element?.tagName === "LI" &&
          Boolean(element.textContent?.includes("Contractual base rent: $1,250")),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        (_content, element) =>
          element?.tagName === "LI" &&
          Boolean(element.textContent?.includes("Bedrooms: 3 sent from unit.beds")),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        (_content, element) =>
          element?.tagName === "LI" &&
          Boolean(
            element.textContent?.includes("Square footage: 1400 sent from unit.size"),
          ),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        (_content, element) =>
          element?.tagName === "LI" &&
          Boolean(
            element.textContent?.includes("Comp 1: $1,600") &&
            element.textContent.includes("97% correlation") &&
            element.textContent.includes("0.4 mi"),
          ),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Fresh provider lookup/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "RentCast source" })).toHaveAttribute(
      "href",
      "https://www.rentcast.io",
    );

    const lookupCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("market-comps"),
    )!;
    expect(JSON.parse(String(lookupCall[1]?.body))).toEqual({
      leaseId: "L1",
    });
    expect((screen.getByLabelText(/Offered rent/i) as HTMLInputElement).value).toBe("");
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

  // AC-S60-6: operator-facing comp labels are neutral and explicitly typed.
  it("labels the manual comp fields as typed", () => {
    render(
      <OwnerDecisionForm address="104 NE Lindsay Ave" current={null} leaseId="L1" />,
    );
    expect(screen.getByLabelText(/Comp low \(typed/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Comp high \(typed/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Comp low \(typed/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Comp high \(typed/)).toBeInTheDocument();
  });

  // AC-S60-8 + AC-S60-9 (component half): the internal signal renders from a PERSISTED provider
  // basis and never from operator-typed numbers alone.
  it("renders the under-market signal from a provider basis and not from typed numbers", () => {
    render(
      <OwnerDecisionForm
        address="104 NE Lindsay Ave"
        current={{
          decision: "increase",
          offeredRent: 1300,
          market: {
            provider: {
              source: "RentCast",
              pointEstimate: 1550,
              retrievedAt: "2026-08-06T12:00:00.000Z",
            },
          },
        }}
        currentRent={1300}
        leaseId="L1"
      />,
    );
    expect(screen.getByText(/below the market point estimate/)).toBeInTheDocument();

    cleanup();
    render(
      <OwnerDecisionForm
        address="104 NE Lindsay Ave"
        current={{
          decision: "increase",
          offeredRent: 1300,
          market: { rangeLow: 1500, rangeHigh: 1600 },
        }}
        currentRent={1300}
        leaseId="L2"
      />,
    );
    expect(screen.queryByText(/below the market point estimate/)).not.toBeInTheDocument();
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
    expect(
      screen.getByText(
        /attachment already embedded in an existing Gmail draft is unchanged/i,
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
    expect(
      screen.getByText(/already-created Gmail draft keeps its embedded attachment/i),
    ).toBeInTheDocument();
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
