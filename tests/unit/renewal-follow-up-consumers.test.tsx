// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { RenewalDesk } from "@/components/lease-renewal/RenewalDesk";
import { RenewalWorkspace } from "@/components/lease-renewal/RenewalWorkspace";
import type {
  RenewalDeskView,
  RenewalLeaseWorkspace,
} from "@/lib/lease-renewal/desk-model";
import type { RenewalFollowUpProjection } from "@/lib/lease-renewal/follow-up-projection";
import {
  getRenewalDeskView,
  getRenewalLeaseWorkspace,
} from "@/tests/helpers/sample-desk";

afterEach(cleanup);

const followUp: RenewalFollowUpProjection = {
  version: "renewal-follow-up-v1",
  leaseId: "lease-4821-maple-4",
  asOfIso: "2026-08-24T12:00:00.000Z",
  linkedThread: {
    linkId: "link-1",
    threadId: "thread-1",
    purpose: "renewal_tenant",
    observationState: "current",
  },
  waiting: {
    state: "verified",
    party: "tenant",
    source: {
      kind: "gmail_thread",
      linkId: "link-1",
      threadId: "thread-1",
      messageId: "message-1",
      purpose: "renewal_tenant",
    },
  },
  lastContact: {
    state: "verified",
    atIso: "2026-08-20T12:00:00.000Z",
    source: {
      kind: "gmail_thread",
      linkId: "link-1",
      threadId: "thread-1",
      messageId: "message-1",
      purpose: "renewal_tenant",
    },
  },
  policy: {
    state: "confirmed",
    label: "Client-confirmed timing policy",
    version: 9,
    updatedAtIso: "2026-08-20T09:00:00.000Z",
    effectiveScope: "lease",
    effectiveKey: "lease-4821-maple-4",
    intervalDays: 3,
  },
  due: { state: "due", atIso: "2026-08-23T12:00:00.000Z" },
  nextAction: "Review the linked thread and record the next human follow-up action.",
  workItem: {
    kind: "renewal_follow_up",
    leaseId: "lease-4821-maple-4",
    dueAtIso: "2026-08-23T12:00:00.000Z",
    lastContactAtIso: "2026-08-20T12:00:00.000Z",
    dedupeKey:
      "renewal-follow-up-v1:lease-4821-maple-4:9:lease:lease-4821-maple-4:message-1:2026-08-23T12:00:00.000Z",
    policyVersion: 9,
    policyScope: "lease",
    sourceRefs: [
      "gmail-link:link-1",
      "gmail-thread:thread-1",
      "gmail-message:message-1",
      "notice-policy:active:v9:lease:lease-4821-maple-4",
    ],
  },
  attentionState: "open",
  attention: {
    kind: "renewal_follow_up",
    leaseId: "lease-4821-maple-4",
    dueAtIso: "2026-08-23T12:00:00.000Z",
    lastContactAtIso: "2026-08-20T12:00:00.000Z",
    dedupeKey:
      "renewal-follow-up-v1:lease-4821-maple-4:9:lease:lease-4821-maple-4:message-1:2026-08-23T12:00:00.000Z",
    policyVersion: 9,
    policyScope: "lease",
    sourceRefs: [
      "gmail-link:link-1",
      "gmail-thread:thread-1",
      "gmail-message:message-1",
      "notice-policy:active:v9:lease:lease-4821-maple-4",
    ],
  },
};

describe("S75 shared follow-up consumers", () => {
  it("renders the exact same waiting/contact/policy/due projection on desk and attention", () => {
    const sample = getRenewalDeskView();
    const view = {
      ...sample,
      actionable: sample.actionable.map((lease, index) =>
        index === 0 ? { ...lease, stageIndex: 4, openConflicts: 0, followUp } : lease,
      ),
    } as RenewalDeskView;

    render(<RenewalDesk view={view} />);

    expect(screen.getAllByText("Waiting on tenant").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/Last verified contact: 2026-08-20T12:00:00.000Z/).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText(/Policy version 9 · lease rule/).length).toBeGreaterThan(
      0,
    );
    expect(
      screen.getAllByText(/Follow-up due: 2026-08-23T12:00:00.000Z/).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Review follow-up" })).toBeInTheDocument();
  });

  it("renders that same projection in the canonical six-step lease workspace", () => {
    const sample = getRenewalLeaseWorkspace("lease-318-cedar-7")!;
    const workspace = {
      ...sample,
      summary: {
        ...sample.summary,
        followUp: { ...followUp, leaseId: sample.summary.id },
      },
      followUp: { ...followUp, leaseId: sample.summary.id },
    } as RenewalLeaseWorkspace;

    render(<RenewalWorkspace workspace={workspace} />);

    expect(screen.getByText("Waiting on tenant")).toBeInTheDocument();
    expect(
      screen.getByText(/Last verified contact: 2026-08-20T12:00:00.000Z/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Policy version 9 · lease rule/)).toBeInTheDocument();
    expect(
      screen.getByText(/Follow-up due: 2026-08-23T12:00:00.000Z/),
    ).toBeInTheDocument();
  });
});
