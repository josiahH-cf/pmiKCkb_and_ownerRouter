// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LiveVendorLifecyclePanel } from "@/components/admin/LiveVendorLifecyclePanel";

const EXECUTION_ID = `exec_${"a".repeat(40)}`;
const PREVIEW_HASH = "b".repeat(64);
const ALL_ACTIONS_AVAILABLE = {
  "vendor.account.disable": true,
  "vendor.account.invite": true,
  "vendor.assignment.change": true,
} as const;
const ALL_ACTIONS_CLOSED = {
  "vendor.account.disable": false,
  "vendor.account.invite": false,
  "vendor.assignment.change": false,
} as const;
const ASSIGNMENT_ONLY_AVAILABLE = {
  "vendor.account.disable": false,
  "vendor.account.invite": false,
  "vendor.assignment.change": true,
} as const;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("LiveVendorLifecyclePanel", () => {
  it("shows all three available Live lifecycle forms without a data-mode chooser", () => {
    const { container } = render(
      <LiveVendorLifecyclePanel availability={ALL_ACTIONS_AVAILABLE} />,
    );

    expect(screen.getByRole("heading", { name: "Invite a Vendor" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Assign or remove a Vendor" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Disable a Vendor" })).toBeInTheDocument();
    expect(
      screen.getByText(
        /exact setup-link reissue while the account is still pending setup/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /active or disabled account cannot be reset here.*separately governed account-reset lifecycle/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Assign" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Remove" })).not.toBeChecked();
    expect(screen.getByRole("textbox", { name: "Company" })).toHaveAttribute(
      "maxlength",
      "160",
    );
    expect(container.querySelector("[name='data-mode']")).toBeNull();
    expect(container.textContent).not.toMatch(/\bTest\b/);
    for (const textarea of container.querySelectorAll("textarea")) {
      expect(textarea).toHaveAttribute("minlength", "3");
    }
  });

  it("renders every closed Registry action as unavailable and unusable", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<LiveVendorLifecyclePanel availability={ALL_ACTIONS_CLOSED} />);

    expect(
      screen.getByText(/Only actions marked Available can prepare an exact Live preview/),
    ).toBeInTheDocument();
    expect(screen.getByText("vendor.account.invite")).toBeInTheDocument();
    expect(screen.getByText("vendor.assignment.change")).toBeInTheDocument();
    expect(screen.getByText("vendor.account.disable")).toBeInTheDocument();
    expect(
      screen.getAllByText(
        /is closed in Production\. This form cannot prepare or execute\./,
      ),
    ).toHaveLength(3);

    const inviteButton = screen.getByRole("button", {
      name: "Prepare invitation preview",
    });
    expect(inviteButton).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Prepare assignment preview" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Prepare disable preview" }),
    ).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Company" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Assign" })).toBeDisabled();
    expect(
      screen.getAllByRole("textbox", { name: "Vendor reference" })[1],
    ).toBeDisabled();

    await user.click(inviteButton);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps closed actions unusable while an individually opened action works", () => {
    render(<LiveVendorLifecyclePanel availability={ASSIGNMENT_ONLY_AVAILABLE} />);

    expect(
      screen.getByRole("button", { name: "Prepare invitation preview" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Prepare assignment preview" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Prepare disable preview" }),
    ).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Assign" })).toBeEnabled();
    expect(screen.getAllByRole("textbox", { name: "Vendor reference" })[0]).toBeEnabled();
  });

  it("prepares, renders every exact field, links the queue item, then explicitly executes", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(preparedResponse()))
      .mockResolvedValueOnce(
        jsonResponse({
          executionId: EXECUTION_ID,
          resultRecorded: true,
          status: "succeeded",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<LiveVendorLifecyclePanel availability={ALL_ACTIONS_AVAILABLE} />);

    await fillInvite(user);
    await user.click(screen.getByRole("button", { name: "Prepare invitation preview" }));

    expect(
      await screen.findByRole("heading", { name: "Exact Live effect preview" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Acme Plumbing", { exact: true })).toBeInTheDocument();
    expect(
      screen.getByText("dispatch@acme.example", { exact: true }),
    ).toBeInTheDocument();
    const approvalQueueLink = screen.getByRole("link", {
      name: "Open this item in Approval Queue",
    });
    expect(approvalQueueLink).toHaveAttribute("href", "/approval-queue?item_id=queue-1");
    expect(approvalQueueLink).toHaveAttribute("target", "_blank");
    expect(approvalQueueLink).toHaveAttribute("rel", "noopener noreferrer");
    expect(
      screen.getByText(
        /Keep this page open.*Approval Queue opens in a new tab.*return here after approval/i,
      ),
    ).toBeInTheDocument();

    const preparePayload = requestBody(fetchMock, 0);
    expect(preparePayload).toEqual({
      actionKey: "vendor.account.invite",
      company: "Acme Plumbing",
      email: "dispatch@acme.example",
      operation: "prepare",
      reason: "Approved plumbing partner",
      ticketId: "ticket-101",
    });
    expectForbiddenBrowserFieldsAbsent(preparePayload);

    await user.click(
      screen.getByRole("button", {
        name: "Execute the approved exact preview",
      }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const executePayload = requestBody(fetchMock, 1);
    expect(executePayload).toEqual({
      actionKey: "vendor.account.invite",
      company: "Acme Plumbing",
      confirmedPreviewHash: PREVIEW_HASH,
      email: "dispatch@acme.example",
      executionId: EXECUTION_ID,
      operation: "execute",
      reason: "Approved plumbing partner",
      ticketId: "ticket-101",
    });
    expectForbiddenBrowserFieldsAbsent(executePayload);
    expect(
      await screen.findByText(
        "The action succeeded and its bodyless result was recorded.",
      ),
    ).toBeInTheDocument();
  });

  it("offers read-only reconciliation after a lost execute response without resending execute", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(preparedResponse()))
      .mockRejectedValueOnce(new TypeError("network unavailable"))
      .mockResolvedValueOnce(
        jsonResponse({
          duplicate: false,
          executionId: EXECUTION_ID,
          outcome: "not_applicable",
          status: "succeeded",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<LiveVendorLifecyclePanel availability={ALL_ACTIONS_AVAILABLE} />);

    await fillInvite(user);
    await user.click(screen.getByRole("button", { name: "Prepare invitation preview" }));
    await screen.findByRole("heading", { name: "Exact Live effect preview" });
    await user.click(
      screen.getByRole("button", {
        name: "Execute the approved exact preview",
      }),
    );

    const reconcileButton = await screen.findByRole("button", {
      name: "Reconcile consumed attempt",
    });
    expect(
      screen.getByText(/Do not retry execution; reconcile first/),
    ).toBeInTheDocument();
    await user.click(reconcileButton);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(
      await screen.findByText(
        /No new provider effect was created.*pending setup.*setup-link reissue preview.*new exact recovery reason.*cannot reset them/i,
      ),
    ).toBeInTheDocument();

    const reconcilePayload = requestBody(fetchMock, 2);
    expect(reconcilePayload).toEqual({
      actionKey: "vendor.account.invite",
      company: "Acme Plumbing",
      email: "dispatch@acme.example",
      executionId: EXECUTION_ID,
      operation: "reconcile",
      reason: "Approved plumbing partner",
      ticketId: "ticket-101",
    });
    expectForbiddenBrowserFieldsAbsent(reconcilePayload);
    expect(reconcilePayload).not.toHaveProperty("confirmedPreviewHash");
  });

  it("explains a pre-provider stop and requires a reviewed fresh preview after not-found reconciliation", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(preparedResponse()))
      .mockRejectedValueOnce(new TypeError("network unavailable"))
      .mockResolvedValueOnce(
        jsonResponse({
          executionId: EXECUTION_ID,
          status: "not_found",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<LiveVendorLifecyclePanel availability={ALL_ACTIONS_AVAILABLE} />);

    await fillInvite(user);
    await user.click(screen.getByRole("button", { name: "Prepare invitation preview" }));
    await screen.findByRole("heading", { name: "Exact Live effect preview" });
    await user.click(
      screen.getByRole("button", {
        name: "Execute the approved exact preview",
      }),
    );
    await user.click(
      await screen.findByRole("button", {
        name: "Reconcile consumed attempt",
      }),
    );

    expect(
      await screen.findByText(
        /process may have stopped before the provider claim.*do not retry the same preview.*after review.*fresh preview with a new exact recovery reason/i,
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(requestBody(fetchMock, 2)).not.toHaveProperty("confirmedPreviewHash");
  });
});

async function fillInvite(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole("textbox", { name: "Company" }), "Acme Plumbing");
  await user.type(
    screen.getByRole("textbox", { name: "Email" }),
    "dispatch@acme.example",
  );
  await user.type(
    screen.getByRole("textbox", { name: "Initial maintenance ticket" }),
    "ticket-101",
  );
  await user.type(
    screen.getAllByRole("textbox", { name: "Admin reason" })[0],
    "Approved plumbing partner",
  );
}

function preparedResponse() {
  return {
    approvalQueueHref: "/approval-queue?item_id=queue-1",
    preview: {
      actionKey: "vendor.account.invite",
      exactEffect: "Create one scoped Vendor invitation.",
      executionId: EXECUTION_ID,
      fields: [
        { label: "Vendor company", name: "vendor_company", value: "Acme Plumbing" },
        {
          label: "Vendor email",
          name: "vendor_email",
          value: "dispatch@acme.example",
        },
        { label: "Initial ticket", name: "ticket_ref", value: "ticket-101" },
      ],
      previewHash: PREVIEW_HASH,
      projection: {
        ticket_ref: "ticket-101",
        vendor_company: "Acme Plumbing",
        vendor_email: "dispatch@acme.example",
      },
      target: "Acme Plumbing · dispatch@acme.example · ticket ticket-101",
    },
    status: "awaiting_approval",
  };
}

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

function requestBody(fetchMock: ReturnType<typeof vi.fn>, index: number) {
  const [, init] = fetchMock.mock.calls[index] as [string, RequestInit];
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

function expectForbiddenBrowserFieldsAbsent(payload: Record<string, unknown>) {
  expect(payload).not.toHaveProperty("authority");
  expect(payload).not.toHaveProperty("dataMode");
  expect(payload).not.toHaveProperty("dependencyExecutionIds");
  expect(payload).not.toHaveProperty("idempotencyKey");
  expect(payload).not.toHaveProperty("receipt");
}
