import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { readServerConfig } from "@/lib/config/server";
import {
  notificationSetupError,
  notifyApprovalQueueChange,
} from "@/lib/notifications/approval";

const actor: AuthenticatedUser = {
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
  uid: "admin-1",
};

const item = {
  entityId: "sop-1",
  entityType: "sop" as const,
  event: "entered_queue" as const,
  spaceId: "lease-renewals",
  spaceName: "Lease Renewals",
  status: "In Review",
  title: "Lease Renewal SOP",
};
type SendInput = {
  html: string;
  recipients: string[];
  sender: string;
  subject: string;
};

describe("approval notifications", () => {
  it("does nothing when Gmail approval notifications are disabled", async () => {
    const logWriter = { write: vi.fn(async () => {}) };
    const sender = {
      send: vi.fn(async (input: SendInput) => {
        void input;
      }),
    };

    await notifyApprovalQueueChange(actor, item, {
      config: readServerConfig({ KB_APPROVAL_NOTIFICATIONS_ENABLED: "false" }),
      logWriter,
      sender,
    });

    expect(sender.send).not.toHaveBeenCalled();
    expect(logWriter.write).not.toHaveBeenCalled();
  });

  it("logs a skipped notification when enabled setup is incomplete", async () => {
    const logWriter = { write: vi.fn(async () => {}) };

    await notifyApprovalQueueChange(actor, item, {
      config: readServerConfig({ KB_APPROVAL_NOTIFICATIONS_ENABLED: "true" }),
      logWriter,
      sender: {
        send: vi.fn(async (input: SendInput) => {
          void input;
        }),
      },
    });

    expect(logWriter.write).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "Gmail",
        entity_id: "sop-1",
        status: "Skipped",
      }),
    );
  });

  it("sends through Gmail send-only boundary and records success", async () => {
    const logWriter = { write: vi.fn(async () => {}) };
    const sender = {
      send: vi.fn(async (input: SendInput) => {
        void input;
      }),
    };

    await notifyApprovalQueueChange(actor, item, {
      config: readServerConfig({
        APP_BASE_URL: "https://kb.example.com",
        KB_APPROVAL_NOTIFICATIONS_ENABLED: "true",
        KB_APPROVAL_RECIPIENTS: "bailey@example.com,dan@example.com",
        KB_APPROVAL_SENDER: "kb@example.com",
      }),
      logWriter,
      sender,
    });

    expect(sender.send).toHaveBeenCalledWith(
      expect.objectContaining({
        recipients: ["bailey@example.com", "dan@example.com"],
        sender: "kb@example.com",
        subject: "[KB Approval] Lease Renewals: Lease Renewal SOP",
      }),
    );
    const sentInput = sender.send.mock.calls.at(0)?.[0];

    expect(sentInput?.html).toContain(
      "The KB does not send owner, tenant, vendor, or applicant email.",
    );
    expect(logWriter.write).toHaveBeenCalledWith(
      expect.objectContaining({ status: "Sent" }),
    );
  });

  it("reports missing Gmail setup names", () => {
    expect(notificationSetupError(readServerConfig({}))).toBe(
      "Missing approval notification setup: KB_APPROVAL_SENDER, KB_APPROVAL_RECIPIENTS, APP_BASE_URL.",
    );
  });
});
