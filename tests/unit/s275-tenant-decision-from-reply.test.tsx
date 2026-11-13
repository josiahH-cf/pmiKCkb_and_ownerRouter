// @vitest-environment jsdom
// S275 R-S275-4 / BEH-S275-5: a tenant reply behaves as an owner reply. Once the reply watch
// records a reply to the tenant offer, the Now card shows the reply text read live (never stored)
// and the reply as an evidence choice, with nothing preselected; the answer is recorded only by
// the staff choice and "Record this decision". Synthetic values only.
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  RenewalTenantDecisionFromReply,
  TENANT_DECISION_FROM_REPLY_ID,
  TENANT_DECISION_RECORD_LABEL,
  tenantReplySource,
} from "@/components/lease-renewal/RenewalTenantDecisionFromReply";
import type { OwnerReplyChoice } from "@/lib/lease-renewal/owner-approval-evidence";
import { RenewalWorkspaceActionSchema } from "@/lib/lease-renewal/workspace-state";

const SEQUENCE = "6c1d9e2a-3b4f-4a5e-8d7c-1f2e3d4c5b6a";
const REPLY: OwnerReplyChoice = {
  sequenceId: SEQUENCE,
  evidenceId: "staff-mailbox:tenant-reply-1",
  // The staff mailbox whose thread holds the reply; the evidence keeps no sender address.
  senderEmail: "renewals@example.invalid",
  receivedAt: "2026-11-12T18:20:00.000Z",
  threadId: "thread-tenant",
  messageId: "tenant-reply-1",
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubReply(body: string) {
  const fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        thread: {
          messages: [
            { id: "offer-1", bodyText: "The synthetic renewal offer." },
            { id: "tenant-reply-1", bodyText: body },
          ],
        },
      }),
    ),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function renderForm(replies: readonly OwnerReplyChoice[] = [REPLY]) {
  const onRecord = vi.fn().mockResolvedValue(undefined);
  render(
    <RenewalTenantDecisionFromReply
      disabled={false}
      onRecord={onRecord}
      replies={replies}
    />,
  );
  return onRecord;
}

describe("S275 R-S275-4: the tenant's decision from an observed reply", () => {
  it("reads the exact linked reply live and preselects nothing", async () => {
    const fetch = stubReply("Synthetic tenant reply: we accept the renewal offer.");
    renderForm();
    expect(document.getElementById(TENANT_DECISION_FROM_REPLY_ID)).not.toBeNull();
    expect(screen.getByRole("region", { name: "Tenant reply" })).toBeVisible();
    expect(screen.getByText("Reading the tenant's reply.")).toBeVisible();
    await waitFor(() =>
      expect(document.querySelector(".renewal-tenant-reply-body")).toHaveTextContent(
        "Synthetic tenant reply: we accept the renewal offer.",
      ),
    );
    expect(screen.queryByText("The synthetic renewal offer.")).toBeNull();
    const url = new URL(fetch.mock.calls[0]![0], "http://localhost");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      id: SEQUENCE,
      thread: "thread-tenant",
      sender: "renewals@example.invalid",
    });
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    for (const radio of radios) expect(radio).not.toBeChecked();
  });

  it("offers the reply as the evidence of an acceptance, naming the staff mailbox it arrived in", () => {
    stubReply("Synthetic tenant reply.");
    renderForm();
    expect(
      screen.getByRole("radio", { name: /^Accepted in the reply received/ }),
    ).toHaveAccessibleName(
      /^Accepted in the reply received .+ in renewals@example\.invalid$/,
    );
    expect(screen.getByRole("radio", { name: "Asked for a change" })).toBeVisible();
    expect(screen.getByRole("radio", { name: "Declined / not renewing" })).toBeVisible();
  });

  it("records nothing until a decision is chosen and recorded", () => {
    stubReply("Synthetic tenant reply.");
    const onRecord = renderForm();
    fireEvent.click(screen.getByRole("button", { name: TENANT_DECISION_RECORD_LABEL }));
    expect(onRecord).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Before recording, choose the tenant's decision.",
    );
  });

  it("records an acceptance with the reply as its source and its received time", () => {
    stubReply("Synthetic tenant reply.");
    const onRecord = renderForm();
    fireEvent.click(
      screen.getByRole("radio", { name: /^Accepted in the reply received/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: TENANT_DECISION_RECORD_LABEL }));
    expect(onRecord).toHaveBeenCalledTimes(1);
    const action = onRecord.mock.calls[0]![0];
    expect(action).toEqual({
      kind: "tenant_response",
      outcome: "accepted",
      source: tenantReplySource(REPLY),
      occurredAt: REPLY.receivedAt,
    });
    expect(action.source).toMatch(/^Reply received .+ in renewals@example\.invalid$/);
    expect(RenewalWorkspaceActionSchema.safeParse(action).success).toBe(true);
  });

  it("records a requested change or a decline without naming the reply", async () => {
    stubReply("Synthetic tenant reply.");
    const onRecord = renderForm();
    fireEvent.click(screen.getByRole("radio", { name: "Asked for a change" }));
    fireEvent.click(screen.getByRole("button", { name: TENANT_DECISION_RECORD_LABEL }));
    expect(onRecord).toHaveBeenLastCalledWith({
      kind: "tenant_response",
      outcome: "counter_change_requested",
    });
    // The control reads its own name again once the first recording settles.
    const again = await screen.findByRole("button", {
      name: TENANT_DECISION_RECORD_LABEL,
    });
    fireEvent.click(screen.getByRole("radio", { name: "Declined / not renewing" }));
    fireEvent.click(again);
    expect(onRecord).toHaveBeenLastCalledWith({
      kind: "tenant_response",
      outcome: "declined_nonrenewing",
    });
    for (const [action] of onRecord.mock.calls)
      expect(RenewalWorkspaceActionSchema.safeParse(action).success).toBe(true);
  });
});
