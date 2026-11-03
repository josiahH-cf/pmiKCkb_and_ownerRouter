// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PublicationPolicyAdminPanel } from "@/components/admin/PublicationPolicyAdminPanel";
import type { PublicationPolicyRecord } from "@/lib/publication/types";

const policy: PublicationPolicyRecord = {
  id: "policy-1",
  data_mode: "live",
  allowedSpaces: ["lease-renewals"],
  allowedTypes: [],
  connectorId: "connector-1",
  createdAt: "2026-08-31T12:00:00.000Z",
  createdByUid: "admin-1",
  enabled: true,
  rootId: "root-1",
  scannerKey: "scanner-1",
  sensitivityCeiling: "Medium",
  updatedAt: "2026-08-31T12:00:00.000Z",
  updatedByUid: "admin-1",
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("S86 publication-policy confirmation", () => {
  it("creates an exact process-only policy through the existing visible Admin control", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      void [url, init];
      return Response.json({
        policy: {
          ...policy,
          resourceScope: {
            resourceType: "process_definition",
            resourceId: "process-definition:owner-renewal-outreach",
            contentHash: "a".repeat(64),
            reviewedNoClientData: true,
          },
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <PublicationPolicyAdminPanel
        initialPolicies={[]}
        spaces={[{ id: "owner-email", name: "Owner Email" }]}
      />,
    );
    await user.type(
      screen.getByRole("textbox", { name: "Connector ID" }),
      "app-process-definitions",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Root ID" }),
      "process-definitions",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Scanner provider key" }),
      "managed-clamav-process-v1",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Exact process definition ID (optional)" }),
      "owner-renewal-outreach",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Reviewed process SHA-256" }),
      "a".repeat(64),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Reviewed process revision" }),
      "b".repeat(64),
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: "I reviewed this process guidance and it contains no client/customer or personal record values.",
      }),
    );
    await user.click(screen.getByRole("checkbox", { name: "Owner Email" }));
    await user.type(
      screen.getByRole("textbox", { name: "Plain-English reason" }),
      "Publish only the reviewed existing owner renewal process.",
    );
    await user.click(screen.getByRole("button", { name: "Create policy" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toMatchObject({
      expectedDefinitionRevision: "b".repeat(64),
      resourceScope: {
        resourceType: "process_definition",
        resourceId: "process-definition:owner-renewal-outreach",
        contentHash: "a".repeat(64),
        reviewedNoClientData: true,
      },
    });
    expect(await screen.findByText(/Process only: owner-renewal-outreach/)).toBeVisible();
  });
  it("loads a fresh review and replaces only the reviewed hash with its original-hash CAS", async () => {
    const user = userEvent.setup();
    const scopedPolicy = {
      ...policy,
      resourceScope: {
        resourceType: "process_definition" as const,
        resourceId: "process-definition:owner-renewal-outreach",
        contentHash: "a".repeat(64),
        reviewedNoClientData: true as const,
      },
    };
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "PATCH"
        ? Response.json({
            policy: {
              ...scopedPolicy,
              resourceScope: {
                ...scopedPolicy.resourceScope,
                contentHash: "c".repeat(64),
              },
            },
          })
        : Response.json({
            publicationReview: { contentHash: "c".repeat(64), revision: "d".repeat(64) },
          }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<PublicationPolicyAdminPanel initialPolicies={[scopedPolicy]} spaces={[]} />);
    await user.click(screen.getByText("Review changed process bytes"));
    await user.click(screen.getByRole("button", { name: "Load changed process review" }));
    const reviewDetails = screen
      .getByText("Review changed process bytes")
      .closest("details")!;
    const confirm = await within(reviewDetails).findByRole("checkbox", {
      name: "I reviewed this process guidance and it contains no client/customer or personal record values.",
    });
    expect(
      screen.getByRole("button", { name: "Save exact process byte review" }),
    ).toBeDisabled();
    await user.click(confirm);
    await user.type(
      screen.getByRole("textbox", { name: "Reason for this byte review" }),
      "Reviewed the exact current procedural change.",
    );
    await user.click(
      screen.getByRole("button", { name: "Save exact process byte review" }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string)).toEqual({
      reason: "Reviewed the exact current procedural change.",
      expectedContentHash: "a".repeat(64),
      expectedDefinitionRevision: "d".repeat(64),
      resourceScope: { ...scopedPolicy.resourceScope, contentHash: "c".repeat(64) },
    });
  });
  it("names the exact policy, requires a reason, and dispatches only after confirmation", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ policy: { ...policy, enabled: false } }), {
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <PublicationPolicyAdminPanel
        initialPolicies={[policy]}
        spaces={[{ id: "lease-renewals", name: "Lease Renewals" }]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Disable" }));
    expect(fetchMock).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "Disable publication policy" });
    expect(dialog).toHaveTextContent("connector-1 / root-1");
    expect(screen.getByRole("button", { name: "Disable policy" })).toBeDisabled();

    await user.type(screen.getByRole("textbox", { name: "Reason" }), "retire root");
    await user.click(screen.getByRole("button", { name: "Disable policy" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/publication-policies/policy-1", {
      body: JSON.stringify({ enabled: false, reason: "retire root" }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
      signal: expect.any(AbortSignal),
    });
    expect(
      await screen.findByText("Publication policy disabled and audited."),
    ).toBeVisible();
  });

  it("leaves the policy unchanged when Cancel is chosen", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<PublicationPolicyAdminPanel initialPolicies={[policy]} spaces={[]} />);

    await user.click(screen.getByRole("button", { name: "Disable" }));
    await user.type(screen.getByRole("textbox", { name: "Reason" }), "no longer used");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText(/Enabled/)).toBeVisible();
  });
});
