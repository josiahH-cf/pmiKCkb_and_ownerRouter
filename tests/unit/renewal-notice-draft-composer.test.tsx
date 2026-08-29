// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RenewalNoticeDraftComposer } from "@/components/lease-renewal/RenewalNoticeDraftComposer";
import { RenewalNoticeDraftRequestSchema } from "@/lib/lease-renewal/execution/renewal-notice-draft-contract";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RenewalNoticeDraftComposer currency boundary", () => {
  it("emits preview omission and exact-object confirmation that parse at the route boundary", async () => {
    const executionId = `exec_${"a".repeat(40)}`;
    const previewHash = "b".repeat(64);
    const bodies: unknown[] = [];
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return bodies.length === 1
        ? {
            ok: true,
            json: async () => ({
              status: "preview",
              channel: "tenant",
              recipient: {
                to: "tenant@northend-apts.com",
                sourceRef: "rentvine:lease:lease-1:tenants[0].email",
              },
              subject: "Preview",
              body: "Preview body",
              executionId,
              previewHash,
            }),
          }
        : {
            ok: true,
            json: async () => ({
              status: "created",
              channel: "tenant",
              recipient: {
                to: "tenant@northend-apts.com",
                sourceRef: "rentvine:lease:lease-1:tenants[0].email",
              },
              subject: "Preview",
              draftId: "draft-1",
              executionId,
            }),
          };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<RenewalNoticeDraftComposer leaseId="lease-1" />);

    fireEvent.change(screen.getByLabelText(/Offered rent/i), {
      target: { value: "$1,500.25" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview draft" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Create Gmail draft" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Create Gmail draft" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(RenewalNoticeDraftRequestSchema.safeParse(bodies[0]).success).toBe(true);
    expect(bodies[0]).not.toHaveProperty("confirm");
    expect(RenewalNoticeDraftRequestSchema.safeParse(bodies[1]).success).toBe(true);
    expect(bodies[1]).toMatchObject({
      confirm: { executionId, previewHash },
      offer: { offeredRent: 1500.25 },
    });
    expect(
      typeof (bodies[1] as { offer: { offeredRent: unknown } }).offer.offeredRent,
    ).toBe("number");
  });

  it("normalizes a human-formatted offer into the preview payload", async () => {
    const fetchMock = vi
      .fn<
        (
          url: string,
          init?: RequestInit,
        ) => Promise<{ ok: boolean; json: () => Promise<Record<string, unknown>> }>
      >()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "preview",
          channel: "tenant",
          recipient: {
            to: "tenant@northend-apts.com",
            sourceRef: "rentvine:lease:lease-1:tenants[0].email",
          },
          subject: "Preview",
          body: "Preview body",
          executionId: `exec_${"1".repeat(40)}`,
          previewHash: "2".repeat(64),
        }),
      });
    vi.stubGlobal("fetch", fetchMock);
    render(<RenewalNoticeDraftComposer leaseId="lease-1" />);

    fireEvent.change(screen.getByLabelText(/Offered rent/i), {
      target: { value: "$1,500.25" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview draft" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      leaseId: "lease-1",
      offer: {
        channel: "tenant",
        ownerDecision: "increase",
        offeredRent: 1500.25,
      },
    });
  });

  it("keeps preview disabled for malformed grouping", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<RenewalNoticeDraftComposer leaseId="lease-1" />);
    fireEvent.change(screen.getByLabelText(/Offered rent/i), {
      target: { value: "1,50" },
    });
    expect(screen.getByRole("button", { name: "Preview draft" })).toBeDisabled();
  });

  it("invalidates create readiness when any bound offer input changes", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        status: "preview",
        channel: "tenant",
        recipient: {
          to: "tenant@northend-apts.com",
          sourceRef: "rentvine:lease:lease-1:tenants[0].email",
        },
        subject: "Preview",
        body: "Preview body",
        executionId: `exec_${"c".repeat(40)}`,
        previewHash: "d".repeat(64),
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<RenewalNoticeDraftComposer leaseId="lease-1" />);

    fireEvent.change(screen.getByLabelText(/Offered rent/i), {
      target: { value: "1500" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview draft" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Create Gmail draft" })).toBeEnabled(),
    );

    fireEvent.change(screen.getByLabelText(/Offered rent/i), {
      target: { value: "1550" },
    });
    expect(screen.getByRole("button", { name: "Create Gmail draft" })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refuses an inverted owner comp range before any request", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<RenewalNoticeDraftComposer leaseId="lease-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Owner notice" }));
    fireEvent.change(screen.getByLabelText(/Specific market number/i), {
      target: { value: "1600" },
    });
    fireEvent.change(screen.getByLabelText(/Comp range low/i), {
      target: { value: "1700" },
    });
    fireEvent.change(screen.getByLabelText(/Comp range high/i), {
      target: { value: "1500" },
    });
    fireEvent.change(screen.getByLabelText(/Comps screenshot reference/i), {
      target: { value: "drive://comps/lease-1.png" },
    });

    expect(screen.getByRole("button", { name: "Preview draft" })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checks one uncertain execution instead of offering retry-as-new", async () => {
    const executionId = `exec_${"e".repeat(40)}`;
    const previewHash = "f".repeat(64);
    const bodies: unknown[] = [];
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      if (bodies.length === 1) {
        return {
          ok: true,
          json: async () => ({
            status: "preview",
            channel: "tenant",
            recipient: {
              to: "tenant@northend-apts.com",
              sourceRef: "rentvine:lease:lease-1:tenants[0].email",
            },
            subject: "Preview",
            body: "Preview body",
            executionId,
            previewHash,
          }),
        };
      }
      if (bodies.length === 2) {
        throw new Error("connection closed after create request");
      }
      return {
        ok: true,
        json: async () => ({
          status: "reconciliation",
          channel: "tenant",
          executionId,
          resolution: "created",
          duplicate: false,
          draftId: "draft-recovered-1",
          reason: "The exact unsent Gmail draft was found.",
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<RenewalNoticeDraftComposer leaseId="lease-1" />);

    fireEvent.change(screen.getByLabelText(/Offered rent/i), {
      target: { value: "1500" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview draft" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Create Gmail draft" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Create Gmail draft" }));

    const check = await screen.findByRole("button", { name: "Check exact attempt" });
    expect(screen.getByRole("button", { name: "Preview draft" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Create Gmail draft" })).toBeDisabled();
    fireEvent.click(check);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    expect(bodies[2]).toMatchObject({
      leaseId: "lease-1",
      reconcile: { executionId },
      offer: { channel: "tenant", offeredRent: 1500 },
    });
    expect(bodies.filter((body) => (body as { confirm?: unknown }).confirm)).toHaveLength(
      1,
    );
    expect(await screen.findByText(/exact unsent Gmail draft was found/i)).toBeVisible();
  });
});
