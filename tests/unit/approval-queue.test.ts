import { describe, expect, it } from "vitest";
import {
  canViewApprovalQueueItem,
  isQueueAudienceGroup,
  isQueueRisk,
  isQueueStatus,
  isQueueItemTerminal,
  queueActionAvailability,
} from "@/lib/approval/queue";
import type { ApprovalQueueItemRecord } from "@/lib/firestore/types";

const baseItem: ApprovalQueueItemRecord = {
  action_needed: "Approve the owner renewal email.",
  assignee_uid: "editor-1",
  audience_group: "Dan/Admin decisions",
  created_at: "2026-06-05T00:00:00.000Z",
  direct_link: "/runs/run-1",
  id: "item-1",
  item_type: "ApprovalPackage",
  process_run_ref: { id: "run-1", label: "Lease Renewal - 123 Main" },
  required_approver_uid: "approver-1",
  risk: "High",
  source_trigger_key: "run-1:owner-comms",
  status: "Ready for Approval",
  updated_at: "2026-06-05T00:00:00.000Z",
};

describe("Approval Queue view helpers", () => {
  it("classifies known filter values and terminal statuses", () => {
    expect(isQueueStatus("Ready for Approval")).toBe(true);
    expect(isQueueStatus("In Review")).toBe(false);
    expect(isQueueRisk("High")).toBe(true);
    expect(isQueueRisk("Critical")).toBe(false);
    expect(isQueueAudienceGroup("Dan/Admin decisions")).toBe(true);
    expect(isQueueAudienceGroup("Everyone")).toBe(false);
    expect(isQueueItemTerminal("Approved")).toBe(true);
    expect(isQueueItemTerminal("Returned")).toBe(false);
  });

  it("lets Admins view all items and non-Admins view only assigned or approver items", () => {
    expect(canViewApprovalQueueItem({ role: "Admin", uid: "admin-1" }, baseItem)).toBe(
      true,
    );
    expect(canViewApprovalQueueItem({ role: "Editor", uid: "editor-1" }, baseItem)).toBe(
      true,
    );
    expect(
      canViewApprovalQueueItem({ role: "Approver", uid: "approver-1" }, baseItem),
    ).toBe(true);
    expect(
      canViewApprovalQueueItem({ role: "Editor", uid: "someone-else" }, baseItem),
    ).toBe(false);
  });

  it("derives action availability from role, status, and ownership", () => {
    expect(
      queueActionAvailability({ role: "Approver", uid: "approver-1" }, baseItem),
    ).toMatchObject({
      approve: true,
      assign: false,
      disable: false,
      returnForRevision: true,
      snooze: true,
    });

    expect(
      queueActionAvailability(
        { role: "Approver", uid: "approver-1" },
        { ...baseItem, assignee_uid: "approver-1" },
      ),
    ).toMatchObject({
      approve: false,
      approveReason: "You cannot approve your own assigned item.",
    });

    expect(
      queueActionAvailability({ role: "Admin", uid: "admin-1" }, baseItem),
    ).toMatchObject({
      approve: true,
      assign: true,
      disable: true,
    });

    expect(
      queueActionAvailability(
        { role: "Approver", uid: "approver-1" },
        { ...baseItem, status: "Returned" },
      ),
    ).toMatchObject({
      approve: false,
      approveReason: "Only Ready for Approval items can be approved.",
    });

    expect(
      queueActionAvailability(
        { role: "Admin", uid: "admin-1" },
        { ...baseItem, status: "Approved" },
      ),
    ).toMatchObject({
      approve: false,
      assign: false,
      disable: false,
      returnForRevision: false,
      snooze: false,
    });
  });
});
