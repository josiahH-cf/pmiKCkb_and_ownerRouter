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
import { withRenewalDeskQueryKeys } from "@/lib/lease-renewal/desk-query";
import { DEFAULT_RENEWAL_DESK_QUERY_V2 } from "@/lib/lease-renewal/desk-query-v2";
import {
  RENEWAL_COMPLETION_REQUIREMENTS,
  buildRenewalEvidenceReference,
  projectRenewalProcess,
  type RenewalEvidenceMap,
} from "@/lib/lease-renewal/renewal-process";
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

function tenantPhaseCurrentEvidence(): RenewalEvidenceMap {
  const evidence: RenewalEvidenceMap = {};
  for (const requirement of RENEWAL_COMPLETION_REQUIREMENTS) {
    evidence[requirement.key] = buildRenewalEvidenceReference({
      ref: `app_record:${requirement.key}:receipt-1`,
      source: "app_record",
      disposition: requirement.allowNotApplicable ? "not_applicable" : "verified",
      ...(requirement.allowNotApplicable
        ? { reason: `The approved ${requirement.key} rule does not apply here.` }
        : {}),
    });
  }
  delete evidence["tenant-outcome"];
  delete evidence["tenant-message-sent"];
  delete evidence["tenant-contact-state"];
  delete evidence["tenant-draft-receipt"];
  return evidence;
}

describe("S75 shared follow-up consumers", () => {
  it("keeps the desk consuming the exact projection through its waiting/due query keys", () => {
    const sample = getRenewalDeskView();
    const injectFollowUp = (lease: RenewalDeskView["items"][number]) => {
      if (lease.id !== followUp.leaseId) return lease;
      return {
        ...withRenewalDeskQueryKeys({
          ...lease,
          stageIndex: 4,
          openConflicts: 0,
          followUp,
        }),
        guidance: lease.guidance,
      };
    };
    const view = {
      ...sample,
      items: sample.items.map(injectFollowUp),
      actionable: sample.actionable.map(injectFollowUp),
    } as RenewalDeskView;

    const injected = view.items.find((lease) => lease.id === followUp.leaseId);
    expect(injected?.queryKeys.waitingOn).toBe("tenant");
    expect(injected?.queryKeys.dueState).toBe("due");
    expect(injected?.queryKeys.dueAtIso).toBe("2026-08-23T12:00:00.000Z");

    // The table filters on the same projection-derived keys: waiting=tenant isolates the lease.
    render(
      <RenewalDesk
        query={{ ...DEFAULT_RENEWAL_DESK_QUERY_V2, waiting: "tenant" }}
        view={view}
      />,
    );
    expect(screen.getByText("4821 Maple Ct, Unit 4")).toBeInTheDocument();
    expect(screen.getByText(/Showing 1 of \d+ renewals/)).toBeInTheDocument();
  });

  it("renders that same projection in the guided workspace's current tenant phase", () => {
    const sample = getRenewalLeaseWorkspace("lease-318-cedar-7")!;
    const process = projectRenewalProcess({
      processVersion: sample.process.version,
      evidence: tenantPhaseCurrentEvidence(),
      tenantOutcome: null,
      complete: false,
    });
    expect(process.steps[process.currentStepIndex]?.id).toBe("tenant-decision");
    const workspace = {
      ...sample,
      process,
      currentStepIndex: process.currentStepIndex,
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
