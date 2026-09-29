// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RentSuggestionApproval,
  type RentSuggestionData,
} from "@/components/lease-renewal/RentSuggestionApproval";
import { RenewalFollowUpAttentionControl } from "@/components/lease-renewal/RenewalFollowUpAttentionControl";
import { RenewalFollowUpThreadControl } from "@/components/lease-renewal/RenewalFollowUpThreadControl";
import {
  FlagResolveForm,
  WritebackApprovalControl,
} from "@/components/lease-renewal/flag-actions";
import type { RenewalFollowUpProjection } from "@/lib/lease-renewal/follow-up-projection";
import type {
  RenewalFlagView,
  RenewalWritebackApprovalView,
} from "@/lib/lease-renewal/run-view";

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), focus: vi.fn(), enabled: true }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/components/lease-renewal/RenewalSaveFocus", () => ({
  useRenewalSaveFocus: () => (mocks.enabled ? mocks.focus : null),
}));

const suggestion: RentSuggestionData = {
  suggestion: {
    suggestedRent: 1500,
    status: "suggested",
    comps: [{ rent: 1500, source: "Synthetic comp" }],
    rationale: "Synthetic median",
  },
  approval: null,
  canApprove: true,
};
const approved = { state: "Approved", approved_value: 1500 } as const;
const followUp: RenewalFollowUpProjection = {
  version: "renewal-follow-up-v1",
  leaseId: "synthetic-lease",
  asOfIso: "2026-09-29T00:00:00.000Z",
  linkedThread: {
    linkId: "synthetic-link",
    threadId: "synthetic-thread",
    purpose: "renewal_tenant",
    observationState: "current",
  },
  waiting: { state: "not_waiting", party: null, source: null },
  lastContact: { state: "needs_verification", atIso: null, source: null },
  policy: {
    state: "unset",
    label: "Not configured",
    version: null,
    updatedAtIso: null,
    effectiveScope: null,
    effectiveKey: null,
    intervalDays: null,
  },
  due: { state: "due", atIso: "2026-09-28T00:00:00.000Z" },
  nextAction: "Review exact due item",
  workItem: {
    kind: "renewal_follow_up",
    leaseId: "synthetic-lease",
    dueAtIso: "2026-09-28T00:00:00.000Z",
    lastContactAtIso: "2026-09-20T00:00:00.000Z",
    dedupeKey: "synthetic-due",
    policyVersion: 1,
    policyScope: "lease",
    sourceRefs: ["synthetic-source"],
  },
  attentionState: "open",
  attention: null,
};
const flag: RenewalFlagView = {
  sourceTriggerKey: "synthetic-flag",
  candidateFingerprint: "synthetic-fingerprint",
  fieldKey: "current_rent",
  fieldLabel: "Current rent",
  severity: "Low",
  agreement: "conflict",
  actionNeeded: "Review",
  directLink: "",
  suggestedWinner: { source: "RentVine", value: "1500" },
  candidates: [{ source: "RentVine", sourceSystem: "rentvine", value: "1500" }],
  resolution: null,
  writeback: null,
  writebackApproval: null,
};
const proposal: RenewalWritebackApprovalView = {
  queued: true,
  state: "Awaiting Approval",
  stale: false,
  authorizationToken: "synthetic-authorization",
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enabled = true;
  mocks.focus.mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function approveRent() {
  fireEvent.change(screen.getByRole("textbox", { name: /Reason/ }), {
    target: { value: "Reviewed synthetic basis" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Approve this number" }));
}

describe("S127 secondary app saves request focus only after successful owning results", () => {
  it("waits for actual pricing approval readback before requesting focus", async () => {
    let resolveRead!: (response: Response) => void;
    const read = new Promise<Response>((resolve) => {
      resolveRead = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ approval: approved }))
      .mockReturnValueOnce(read);
    vi.stubGlobal("fetch", fetchMock);
    render(<RentSuggestionApproval leaseId="synthetic-lease" initialData={suggestion} />);
    approveRent();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(mocks.focus).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    resolveRead(json({ ...suggestion, approval: approved }));
    await waitFor(() => expect(mocks.focus).toHaveBeenCalledTimes(1));
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it.each(["failed_read", "stale_decision", "different_value"])(
    "does not focus for pricing %s",
    async (mode) => {
      const response =
        mode === "failed_read"
          ? json({ error: "Read unavailable" }, 503)
          : json({
              ...suggestion,
              approval:
                mode === "different_value" ? { ...approved, approved_value: 1510 } : null,
            });
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValueOnce(json({ approval: approved }))
          .mockResolvedValueOnce(response),
      );
      render(
        <RentSuggestionApproval leaseId="synthetic-lease" initialData={suggestion} />,
      );
      approveRent();
      await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
      expect(mocks.focus).not.toHaveBeenCalled();
    },
  );

  it("does not focus or refresh a refused pricing decision and retains its reason", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({ error: "Stale decision" }, 409)),
    );
    render(<RentSuggestionApproval leaseId="synthetic-lease" initialData={suggestion} />);
    approveRent();
    await screen.findByText("Stale decision");
    expect(screen.getByRole("textbox", { name: /Reason/ })).toHaveValue(
      "Reviewed synthetic basis",
    );
    expect(mocks.focus).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it.each([200, 409])(
    "requests focus only for successful attention transition (%s)",
    async (status) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          json(
            status === 200
              ? { state: "dismissed", recordVersion: 2 }
              : { error: "Stale due item" },
            status,
          ),
        );
      vi.stubGlobal("fetch", fetchMock);
      render(<RenewalFollowUpAttentionControl canEdit projection={followUp} />);
      fireEvent.change(screen.getByRole("textbox", { name: "Reason to dismiss" }), {
        target: { value: "Reviewed exact item" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Dismiss due item" }));
      await screen.findByText(
        status === 200
          ? "This exact due item is dismissed with audit evidence."
          : "Stale due item",
      );
      expect(mocks.focus).toHaveBeenCalledTimes(status === 200 ? 1 : 0);
      expect(mocks.refresh).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/lease-renewal/follow-up-attention",
        expect.objectContaining({ method: "POST" }),
      );
    },
  );

  it.each([200, 409])(
    "requests focus only for successful explicit thread link (%s)",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            json(
              status === 200
                ? { linkId: "synthetic-link" }
                : { error: "Thread unavailable" },
              status,
            ),
          ),
      );
      render(
        <RenewalFollowUpThreadControl
          canEdit
          leaseId="synthetic-lease"
          projection={followUp}
        />,
      );
      fireEvent.click(screen.getByText("Link or refresh exact Gmail evidence"));
      fireEvent.change(screen.getByRole("textbox", { name: "Exact Gmail thread ID" }), {
        target: { value: "synthetic-thread" },
      });
      fireEvent.change(screen.getByRole("textbox", { name: "Reason for linking" }), {
        target: { value: "Reviewed exact thread" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Link exact thread" }));
      await screen.findByText(
        status === 200
          ? "Exact linked-thread evidence recorded. No message was sent."
          : "Thread unavailable",
      );
      expect(mocks.focus).toHaveBeenCalledTimes(status === 200 ? 1 : 0);
      expect(mocks.refresh).not.toHaveBeenCalled();
    },
  );

  it("refreshing existing thread evidence does not request post-save focus", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ status: "current" })));
    render(
      <RenewalFollowUpThreadControl
        canEdit
        leaseId="synthetic-lease"
        projection={followUp}
      />,
    );
    fireEvent.click(screen.getByText("Link or refresh exact Gmail evidence"));
    fireEvent.click(screen.getByRole("button", { name: "Refresh this linked thread" }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(mocks.focus).not.toHaveBeenCalled();
  });

  it.each([200, 409])(
    "requests focus only for successful legacy flag resolution (%s)",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            json(
              status === 200
                ? { resolution: { status: "Resolved" } }
                : { error: "Source changed" },
              status,
            ),
          ),
      );
      render(<FlagResolveForm flag={flag} runId="synthetic-run" canResolve isAdmin />);
      fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
      if (status === 200)
        await waitFor(() => expect(mocks.focus).toHaveBeenCalledTimes(1));
      else await screen.findByText("Source changed");
      expect(mocks.focus).toHaveBeenCalledTimes(status === 200 ? 1 : 0);
      expect(mocks.refresh).not.toHaveBeenCalled();
    },
  );

  it.each([200, 409])(
    "requests focus only for successful legacy proposal decision (%s)",
    async (status) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          json(
            status === 200
              ? { approval: { state: "Approved" } }
              : { error: "Proposal changed" },
            status,
          ),
        );
      vi.stubGlobal("fetch", fetchMock);
      render(
        <WritebackApprovalControl
          approval={proposal}
          runId="synthetic-run"
          sourceTriggerKey="synthetic-flag"
          isAdmin
        />,
      );
      fireEvent.change(screen.getByRole("textbox", { name: "Reason (required)" }), {
        target: { value: "Reviewed proposal" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Approve proposal" }));
      if (status === 200)
        await waitFor(() => expect(mocks.focus).toHaveBeenCalledTimes(1));
      else await screen.findByText("Proposal changed");
      expect(mocks.focus).toHaveBeenCalledTimes(status === 200 ? 1 : 0);
      expect(mocks.refresh).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/lease-renewal/writeback-approvals",
        expect.objectContaining({ method: "POST" }),
      );
    },
  );

  it("preserves existing refresh when the shared control renders outside a workspace", async () => {
    mocks.enabled = false;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({ state: "dismissed", recordVersion: 2 })),
    );
    render(<RenewalFollowUpAttentionControl canEdit projection={followUp} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Reason to dismiss" }), {
      target: { value: "Reviewed exact item" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Dismiss due item" }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(mocks.focus).not.toHaveBeenCalled();
  });
});
