// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UserManagementPanel } from "@/components/admin/UserManagementPanel";
import { OwnerPolicyRulesAdminPanel } from "@/components/admin/OwnerPolicyRulesAdminPanel";
import { ReindexPanel } from "@/components/admin/ReindexPanel";
import { formatDateTime } from "@/components/approval/ApprovalQueueModel";
import { MaintenanceBlockerReport } from "@/components/maintenance/MaintenanceBlockerReport";
import { MaintenanceIntakeBridge } from "@/components/maintenance/MaintenanceIntakeBridge";
import { MaintenancePreapprovalControl } from "@/components/maintenance/MaintenancePreapprovalControl";
import { UnverifiedIntakeReview } from "@/components/maintenance/UnverifiedIntakeReview";
import { WorkOrderChatPanel } from "@/components/maintenance/WorkOrderChatPanel";
import { projectWorkItems } from "@/lib/assistant/work-adapter";
import type { WorkTaskRecord } from "@/lib/work-accountability/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

const instant = "2026-10-01T00:30:00.000Z";

describe("S126 remaining Maintenance, Admin and My Work displays", () => {
  it("formats Admin policy dates and request timestamps while preserving canonical date entry", () => {
    render(
      <OwnerPolicyRulesAdminPanel
        initialRules={[
          {
            portfolioId: "synthetic-portfolio",
            kind: "flat_percent_increase",
            percent: 1,
            effectiveFrom: "2026-10-01",
            note: "Synthetic policy",
            updatedByUid: "synthetic-admin",
          },
        ]}
      />,
    );
    expect(screen.getByText(/effective 10\/01\/2026/)).toBeInTheDocument();
    const date = screen.getByLabelText("Effective from");
    fireEvent.change(date, { target: { value: "2026-10-01" } });
    expect(date).toHaveValue("2026-10-01");
    expect(screen.getByText("10/01/2026")).toBeInTheDocument();
    render(
      <ReindexPanel
        spaces={[]}
        initialRequests={[
          {
            id: "synthetic-request",
            spaceId: "synthetic-space",
            status: "requested",
            requestedByUid: "synthetic-admin",
            createdAt: instant,
          },
        ]}
      />,
    );
    expect(screen.getByText("09/30/2026, 7:30 PM CDT")).toBeInTheDocument();
    expect(formatDateTime("2026-02-31T00:00:00Z")).toBe("Invalid timestamp");
    expect(formatDateTime("not a timestamp")).toBe("Invalid timestamp");
  });
  it("shows preapproval calendar dates and review in MM/DD/YYYY while submitting the original ISO value", async () => {
    const preapproval = {
      property_key: "synthetic-property",
      amount_cents: 50000,
      effective_from_iso: "2026-10-01T00:00:00.000Z",
      recorded_by_uid: "synthetic-admin",
      version: 1,
    };
    const original = JSON.stringify(preapproval);
    const fetch = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () => new Response(JSON.stringify({ preapproval }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    render(
      <MaintenancePreapprovalControl canManage initialPreapprovals={[preapproval]} />,
    );
    expect(screen.getByText(/since 10\/01\/2026/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Property key"), {
      target: { value: preapproval.property_key },
    });
    fireEvent.change(screen.getByLabelText("Preapproved amount"), {
      target: { value: "500" },
    });
    const date = screen.getByLabelText(/Effective from/);
    fireEvent.change(date, { target: { value: "2026-10-01" } });
    expect(date).toHaveValue("2026-10-01");
    expect(screen.getByText("10/01/2026")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review this preapproval" }));
    expect(screen.getByText(/effective 10\/01\/2026\?/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Record this preapproval" }));
    await screen.findByText("Preapproval recorded.");
    expect(JSON.parse(String(fetch.mock.calls[0][1]!.body)).effective_from_iso).toBe(
      preapproval.effective_from_iso,
    );
    expect(JSON.stringify(preapproval)).toBe(original);
  });

  it("shows actual maintenance activity as the same instant in Central time, with explicit invalid/unavailable states", () => {
    const row = {
      ticketId: "synthetic-ticket",
      summary: "Synthetic task",
      unitLabel: null,
      assigneeLabel: null,
      lastActivityIso: instant,
      projection: {
        ticketId: "synthetic-ticket",
        waitingOn: "estimate" as const,
        nextAction: "Review the estimate.",
        ownerDecisionRequired: true,
        withinPreapproval: false,
        ownerDecisionDetail: "Not reviewed",
        estimateAmountCents: null,
        preapprovalAmountCents: null,
        providerWorkOrderId: null,
        photosNeeded: false,
      },
    };
    const { rerender } = render(<MaintenanceBlockerReport rows={[row]} />);
    expect(screen.getByText("09/30/2026, 7:30 PM CDT")).toBeInTheDocument();
    rerender(<MaintenanceBlockerReport rows={[{ ...row, lastActivityIso: "bad" }]} />);
    expect(screen.getByText("Invalid timestamp")).toBeInTheDocument();
    rerender(<MaintenanceBlockerReport rows={[{ ...row, lastActivityIso: "" }]} />);
    expect(screen.getByText("Not available")).toBeInTheDocument();
    expect(row.lastActivityIso).toBe(instant);
  });

  it("formats the public intake resource review after actual local submission without rewriting the resource", async () => {
    window.history.replaceState(null, "", "/#token=synthetic.token");
    const resource = {
      title: "Synthetic resource",
      url: "https://example.invalid/resource",
      reviewed_on: "2026-10-01",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              urgency: "normal",
              message: "Synthetic report saved",
              photos_needed: false,
              photo_request: null,
              reference: "synthetic-reference",
              resource,
            }),
            { status: 200 },
          ),
      ),
    );
    render(<MaintenanceIntakeBridge />);
    fireEvent.change(await screen.findByLabelText("What is wrong?"), {
      target: { value: "Synthetic fixture" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send this report" }));
    expect(
      await screen.findByText(/reviewed by the property team on 10\/01\/2026/),
    ).toBeInTheDocument();
    expect(resource.reviewed_on).toBe("2026-10-01");
  });

  it("formats sign-in instants with time and zone and preserves the missing state", () => {
    render(
      <UserManagementPanel
        initialUsers={[
          {
            uid: "synthetic-admin",
            email: "synthetic@pmikcmetro.com",
            role: "Admin",
            scopes: undefined,
            disabled: false,
            lastSignInAt: instant,
          },
          {
            uid: "synthetic-new-user",
            email: "synthetic-new@pmikcmetro.com",
            role: "Editor",
            disabled: false,
            lastSignInAt: null,
          },
        ]}
      />,
    );
    expect(screen.getByText("Last sign-in 09/30/2026, 7:30 PM CDT")).toBeInTheDocument();
    expect(screen.getByText("No sign-in yet")).toBeInTheDocument();
  });

  it("shows intake audit time in the business zone without rewriting reported source text or promoting it", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(
      <UnverifiedIntakeReview
        initialIntake={[
          {
            id: "synthetic-intake",
            data_mode: "live",
            status: "unverified",
            source: "public-link",
            property_key: "synthetic-property",
            summary: "Synthetic summary",
            description: "Source message says 2026-10-01.",
            contact: "",
            reporter_kind: "external",
            ip_hash: null,
            created_at: instant,
            expires_at: instant,
          },
        ]}
      />,
    );
    expect(screen.getByText(/09\/30\/2026, 7:30 PM CDT/)).toBeInTheDocument();
    expect(screen.getByText("Source message says 2026-10-01.")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("formats synchronized chat metadata while preserving its message body and doing only the requested local thread read", async () => {
    const fetch = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(
      async () =>
        new Response(
          JSON.stringify({
            work_order_id: "synthetic-order",
            eligible: false,
            records: [
              {
                lane: "message",
                message_id: 1,
                role: "tenant",
                created_at: instant,
                body: "Source message says 2026-10-01.",
                truncated: false,
                mapping_state: "resident_bound",
                attachments: [],
              },
            ],
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetch);
    render(<WorkOrderChatPanel ticketId="synthetic-ticket" canEdit={false} />);
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Load conversation" }));
    expect(await screen.findByText("09/30/2026, 7:30 PM CDT")).toBeInTheDocument();
    expect(screen.getByText("Source message says 2026-10-01.")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledOnce();
    expect(JSON.parse(String(fetch.mock.calls[0][1]!.body))).toMatchObject({
      operation: "thread",
    });
  });

  it("formats assistant work due instants without altering task identity, source values or links", () => {
    const task: WorkTaskRecord = {
      id: "synthetic-task",
      space_id: "synthetic-space",
      source: { type: "manual", status: "unverified" },
      task_type: "manual",
      title: "Synthetic work",
      creator_uid: "synthetic-actor",
      state: "Blocked",
      next_action: "Review",
      due_at: instant,
      created_at: instant,
      updated_at: instant,
      record_version: 1,
      retention_policy_version: "staff-work-retention:v1.0",
      legal_hold: false,
    };
    const original = JSON.stringify(task);
    expect(projectWorkItems([task])[0]).toMatchObject({
      id: task.id,
      detail: "Blocked · due 09/30/2026, 7:30 PM CDT",
      href: "/work?task_id=synthetic-task",
    });
    expect(projectWorkItems([{ ...task, due_at: undefined }])[0].detail).toBe(
      "Blocked · no due date",
    );
    expect(JSON.stringify(task)).toBe(original);
  });
});
