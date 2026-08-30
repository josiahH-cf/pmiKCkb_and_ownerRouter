// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RenewalNoticeDraftComposer } from "@/components/lease-renewal/RenewalNoticeDraftComposer";
import { RenewalNoticeDraftRequestSchema } from "@/lib/lease-renewal/execution/renewal-notice-draft-contract";
import { defaultRenewalCopySelection } from "@/lib/lease-renewal/renewal-copy-contract";

const APPROVED_READINESS = {
  owner: { status: "approved" as const, reason: "Approved fixture." },
  tenant: { status: "approved" as const, reason: "Approved fixture." },
};

const TENANT_TEMPLATE = {
  ref: "tenant-renewal:v1.0",
  version: "v1.0",
  contentHash: "c".repeat(64),
  status: "approved",
} as const;

const OWNER_TEMPLATE = {
  ref: "owner-renewal:v1.0",
  version: "v1.0",
  contentHash: "d".repeat(64),
  status: "approved",
} as const;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RenewalNoticeDraftComposer currency boundary", () => {
  it("labels current wording review-only and cannot create or request assistance", async () => {
    const selection = defaultRenewalCopySelection("tenant");
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        status: "review_only",
        channel: "tenant",
        recipient: {
          to: "tenant@northend-apts.com",
          sourceRef: "rentvine:lease:lease-1:tenants[0].email",
        },
        subject: "Review-only subject",
        body: "Review-only body",
        template: { ...TENANT_TEMPLATE, status: "review_only" },
        copy: selection,
        reasons: ["Client-approved wording is required."],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<RenewalNoticeDraftComposer leaseId="lease-1" />);

    expect(screen.getByText(/Tenant copy v1.0: Review only/i)).toBeVisible();
    expect(screen.getByLabelText("Tenant response request")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Request clearer phrasing" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Create Gmail draft" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Offered rent/i), {
      target: { value: "1500" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview review-only copy" }));

    expect(await screen.findByText(/No execution was prepared/i)).toBeVisible();
    expect(screen.getByText("Review-only body")).toBeVisible();
    expect(screen.getByRole("button", { name: "Create Gmail draft" })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

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
              template: TENANT_TEMPLATE,
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
              template: TENANT_TEMPLATE,
            }),
          };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <RenewalNoticeDraftComposer
        leaseId="lease-1"
        templateReadiness={APPROVED_READINESS}
      />,
    );

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
          template: TENANT_TEMPLATE,
        }),
      });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <RenewalNoticeDraftComposer
        leaseId="lease-1"
        templateReadiness={APPROVED_READINESS}
      />,
    );

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
      copy: {
        templateRef: "tenant-renewal:v1.0",
        templateVersion: "v1.0",
        editableRegions: {
          response_request:
            "Please let us know if you plan to stay or leave as soon as possible, and we'll get the documents out if you plan to stay.",
        },
      },
    });
  });

  it("keeps preview disabled for malformed grouping", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(
      <RenewalNoticeDraftComposer
        leaseId="lease-1"
        templateReadiness={APPROVED_READINESS}
      />,
    );
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
        template: TENANT_TEMPLATE,
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <RenewalNoticeDraftComposer
        leaseId="lease-1"
        templateReadiness={APPROVED_READINESS}
      />,
    );

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

  it("invalidates the exact preview when assisted prose changes", async () => {
    const executionId = `exec_${"8".repeat(40)}`;
    const previewHash = "9".repeat(64);
    const tailored = defaultRenewalCopySelection("tenant");
    tailored.editableRegions.response_request =
      "Please reply when convenient so the renewal team can continue.";
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith("renewal-copy-assist")
        ? {
            ok: true,
            json: async () => ({
              status: "ready",
              template: TENANT_TEMPLATE,
              selection: tailored,
              usedModel: true,
              refusedBeforeModel: false,
              errors: [],
            }),
          }
        : {
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
              template: TENANT_TEMPLATE,
            }),
          },
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <RenewalNoticeDraftComposer
        leaseId="lease-1"
        templateReadiness={APPROVED_READINESS}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Offered rent/i), {
      target: { value: "1500" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview draft" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Create Gmail draft" })).toBeEnabled(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Request clearer phrasing" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Tenant response request")).toHaveValue(
        tailored.editableRegions.response_request,
      ),
    );
    expect(screen.getByRole("button", { name: "Create Gmail draft" })).toBeDisabled();
    expect(screen.getByText(/preview the full draft again/i)).toBeVisible();
  });

  it("refuses an inverted owner comp range before any request", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <RenewalNoticeDraftComposer
        leaseId="lease-1"
        templateReadiness={APPROVED_READINESS}
      />,
    );

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
    expect(screen.getByRole("button", { name: "Preview draft" })).toBeDisabled();
    expect(screen.getByText(/resolved server-side.*receipted upload/i)).toBeVisible();
    expect(screen.queryByLabelText(/Comps screenshot reference/i)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows only the server-receipted owner attachment summary in the exact preview", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        status: "preview",
        channel: "owner",
        recipient: {
          to: "owner@cedar-holdings.com",
          sourceRef: "rentvine:lease:lease-1:portfolio.owners[0].email",
        },
        subject: "Owner renewal review",
        body: "Owner preview body",
        executionId: `exec_${"3".repeat(40)}`,
        previewHash: "4".repeat(64),
        template: OWNER_TEMPLATE,
        attachment: {
          label: "Comp screenshot attachment: lease-1-comps.png",
          filename: "lease-1-comps.png",
          mimeType: "image/png",
          sizeBytes: 2048,
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <RenewalNoticeDraftComposer
        leaseId="lease-1"
        templateReadiness={APPROVED_READINESS}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Owner notice" }));
    fireEvent.change(screen.getByLabelText(/Specific market number/i), {
      target: { value: "1600" },
    });
    fireEvent.change(screen.getByLabelText(/Comp range low/i), {
      target: { value: "1500" },
    });
    fireEvent.change(screen.getByLabelText(/Comp range high/i), {
      target: { value: "1700" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview draft" }));

    expect(
      await screen.findByText(
        "Comp screenshot attachment: lease-1-comps.png · image/png · 2.0 KiB",
      ),
    ).toBeVisible();
    expect(screen.queryByLabelText(/Comps screenshot reference/i)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
            template: TENANT_TEMPLATE,
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
    render(
      <RenewalNoticeDraftComposer
        leaseId="lease-1"
        templateReadiness={APPROVED_READINESS}
      />,
    );

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
