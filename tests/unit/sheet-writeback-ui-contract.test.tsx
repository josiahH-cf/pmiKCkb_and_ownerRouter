// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WritebackApprovalControl } from "@/components/lease-renewal/flag-actions";
import type { RenewalWritebackApprovalView } from "@/lib/lease-renewal/run-view";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const RUN_ID = "live-run-1";
const SOURCE_TRIGGER_KEY = "lease_renewal:reconcile:live-run-1:current_rent";
const WRITE_EXECUTION_ID = "write-execution-01";
const WRITE_PREVIEW_HASH = "0123456789abcdef";
const WRITE_RECEIPT_ID = "write-receipt-01";
const CORRECTION_EXECUTION_ID = "correction-exec-1";
const CORRECTION_PREVIEW_HASH = "fedcba9876543210";

const APPROVED: RenewalWritebackApprovalView = {
  queued: true,
  state: "Approved",
  authorizationReceiptId: "approval-receipt-1",
  reason: "Approved against the signed renewal.",
  reasonRecorded: true,
  stale: false,
  productionAllowed: false,
  executed: false,
  updatedAt: "2026-07-29T22:59:00.000Z",
};

const RETURNED: RenewalWritebackApprovalView = {
  ...APPROVED,
  state: "Returned for Revision",
  reason: "Returned after the prior provider attempt.",
  updatedAt: "2026-07-29T23:05:00.000Z",
};

afterEach(() => {
  cleanup();
  refresh.mockReset();
  vi.unstubAllGlobals();
});

describe("Sheet write-back UI action contract", () => {
  it("hydrates a durable write receipt after refresh and restores correction reachability", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        status: "written",
        a1: "Renewals!H17",
        duplicate: true,
        receipt: {
          receiptId: WRITE_RECEIPT_ID,
          operation: "write",
          outcome: "written",
          reconciled: false,
          createdAt: "2026-07-29T23:01:00.000Z",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderApprovedControl();

    expect(
      await screen.findByRole("button", { name: "Preview exact correction" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Write approved value to Sheet" }),
    ).not.toBeInTheDocument();
    expectRequest(fetchMock, 0, {
      runId: RUN_ID,
      sourceTriggerKey: SOURCE_TRIGGER_KEY,
      operation: "status",
      confirm: false,
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("keeps reconcile reachable while new mutations are switched off", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        status: "needs_reconciliation",
        executionId: WRITE_EXECUTION_ID,
        operation: "write",
        reason: "Recover this consumed attempt.",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderApprovedControl(false);

    expect(
      await screen.findByRole("button", { name: "Reconcile one attempt" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Write approved value to Sheet" }),
    ).not.toBeInTheDocument();
  });

  it("keeps durable reconciliation mounted after approval is returned", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        status: "needs_reconciliation",
        executionId: WRITE_EXECUTION_ID,
        operation: "write",
        reason: "Recover this consumed attempt after revocation.",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderApprovalControl(RETURNED);

    expect(
      await screen.findByRole("button", { name: "Reconcile one attempt" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Write approved value to Sheet" }),
    ).not.toBeInTheDocument();
  });

  it("keeps correction reachable after approval is returned", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          status: "written",
          a1: "Renewals!H17",
          duplicate: true,
          receipt: {
            receiptId: WRITE_RECEIPT_ID,
            operation: "write",
            outcome: "written",
            reconciled: false,
            createdAt: "2026-07-29T23:01:00.000Z",
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          status: "correction_resolved",
          target: {
            a1: "Renewals!H17",
            currentValue: "$1,425",
            originalReceiptId: WRITE_RECEIPT_ID,
          },
          preview: {
            executionId: CORRECTION_EXECUTION_ID,
            hash: CORRECTION_PREVIEW_HASH,
            expiresAt: "2026-07-29T23:12:00.000Z",
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    renderApprovalControl(RETURNED);

    await user.click(
      await screen.findByRole("button", { name: "Preview exact correction" }),
    );

    expectRequest(fetchMock, 1, {
      runId: RUN_ID,
      sourceTriggerKey: SOURCE_TRIGGER_KEY,
      operation: "correction",
      confirm: false,
      executionId: WRITE_RECEIPT_ID,
    });
    expect(
      await screen.findByRole("button", { name: "Confirm exact Sheet correction" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Write approved value to Sheet" }),
    ).not.toBeInTheDocument();
  });

  it("does not offer a new Sheet preview without a current Approved proposal", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ status: "no_execution" }));
    vi.stubGlobal("fetch", fetchMock);

    renderApprovalControl(RETURNED);

    expect(
      await screen.findByText(/A current Approved proposal is required/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Write approved value to Sheet" }),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never re-exposes a preview from an older approval after return and re-approval", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ status: "no_execution" }))
      .mockResolvedValueOnce(
        jsonResponse({
          status: "resolved",
          target: {
            a1: "Renewals!H17",
            proposedColumnHeader: "Approved Rent",
            proposedValue: "$1,425",
            rowValues: ["Invented Resident", "Unit 17"],
          },
          preview: {
            executionId: WRITE_EXECUTION_ID,
            hash: WRITE_PREVIEW_HASH,
            expiresAt: "2026-07-29T23:10:00.000Z",
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ status: "no_execution" }))
      .mockResolvedValueOnce(jsonResponse({ status: "no_execution" }));
    vi.stubGlobal("fetch", fetchMock);

    const view = renderApprovalControl(APPROVED);
    await user.click(
      await screen.findByRole("button", { name: "Write approved value to Sheet" }),
    );
    expect(
      await screen.findByRole("button", { name: "Confirm write to Sheet" }),
    ).toBeInTheDocument();

    view.rerender(
      <WritebackApprovalControl
        approval={RETURNED}
        isAdmin={true}
        runId={RUN_ID}
        showLegacyWritebackRecovery={true}
        sourceTriggerKey={SOURCE_TRIGGER_KEY}
        writebackEnabled={true}
      />,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(
      screen.queryByRole("button", { name: "Confirm write to Sheet" }),
    ).not.toBeInTheDocument();

    view.rerender(
      <WritebackApprovalControl
        approval={{
          ...APPROVED,
          authorizationReceiptId: "approval-receipt-2",
          updatedAt: "2026-07-29T23:10:00.000Z",
        }}
        isAdmin={true}
        runId={RUN_ID}
        showLegacyWritebackRecovery={true}
        sourceTriggerKey={SOURCE_TRIGGER_KEY}
        writebackEnabled={true}
      />,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(
      screen.queryByRole("button", { name: "Confirm write to Sheet" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Write approved value to Sheet" }),
    ).toBeInTheDocument();
  });

  it("turns a lost ambiguous commit response into reconcile-only recovery", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ status: "no_execution" }))
      .mockResolvedValueOnce(
        jsonResponse({
          status: "resolved",
          target: {
            a1: "Renewals!H17",
            proposedColumnHeader: "Approved Rent",
            proposedValue: "$1,425",
            rowValues: ["Invented Resident", "Unit 17"],
          },
          preview: {
            executionId: WRITE_EXECUTION_ID,
            hash: WRITE_PREVIEW_HASH,
            expiresAt: "2026-07-29T23:10:00.000Z",
          },
        }),
      )
      .mockResolvedValueOnce(
        errorResponse(409, {
          error_type: "attempt_ambiguous",
          error: "The prior Sheet attempt is ambiguous. Reconcile it; do not retry.",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    renderApprovedControl();

    await user.click(
      await screen.findByRole("button", { name: "Write approved value to Sheet" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Confirm write to Sheet" }),
    );

    expect(
      await screen.findByRole("button", { name: "Reconcile one attempt" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Confirm write to Sheet" }),
    ).not.toBeInTheDocument();
  });

  it("automatically hydrates durable status after a true lost commit response", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ status: "no_execution" }))
      .mockResolvedValueOnce(
        jsonResponse({
          status: "resolved",
          target: {
            a1: "Renewals!H17",
            proposedColumnHeader: "Approved Rent",
            proposedValue: "$1,425",
            rowValues: ["Invented Resident", "Unit 17"],
          },
          preview: {
            executionId: WRITE_EXECUTION_ID,
            hash: WRITE_PREVIEW_HASH,
            expiresAt: "2026-07-29T23:10:00.000Z",
          },
        }),
      )
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce(
        jsonResponse({
          status: "needs_reconciliation",
          operation: "write",
          executionId: WRITE_EXECUTION_ID,
          reason: "The durable attempt is ambiguous.",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    renderApprovedControl();

    await user.click(
      await screen.findByRole("button", { name: "Write approved value to Sheet" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Confirm write to Sheet" }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expectRequest(fetchMock, 3, {
      runId: RUN_ID,
      sourceTriggerKey: SOURCE_TRIGGER_KEY,
      operation: "status",
      confirm: false,
      executionId: WRITE_EXECUTION_ID,
    });
    expect(
      await screen.findByRole("button", { name: "Reconcile one attempt" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Confirm write to Sheet" }),
    ).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls
        .map(([, init]) => JSON.parse(String(init?.body)))
        .filter((body) => body.confirm === true),
    ).toHaveLength(1);
  });

  it("restores only the same exact confirmation when a lost request never claimed", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ status: "no_execution" }))
      .mockResolvedValueOnce(
        jsonResponse({
          status: "resolved",
          target: {
            a1: "Renewals!H17",
            proposedColumnHeader: "Approved Rent",
            proposedValue: "$1,425",
            rowValues: ["Invented Resident", "Unit 17"],
          },
          preview: {
            executionId: WRITE_EXECUTION_ID,
            hash: WRITE_PREVIEW_HASH,
            expiresAt: "2026-07-29T23:10:00.000Z",
          },
        }),
      )
      .mockRejectedValueOnce(new Error("request never arrived"))
      .mockResolvedValueOnce(jsonResponse({ status: "no_execution" }))
      .mockResolvedValueOnce(
        jsonResponse({
          status: "written",
          a1: "Renewals!H17",
          receipt: {
            receiptId: WRITE_EXECUTION_ID,
            operation: "write",
            outcome: "written",
            reconciled: false,
            createdAt: "2026-07-29T23:01:00.000Z",
          },
          duplicate: false,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    renderApprovedControl();

    await user.click(
      await screen.findByRole("button", { name: "Write approved value to Sheet" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Confirm write to Sheet" }),
    );
    expect(
      await screen.findByText(
        "No durable attempt was claimed. The same exact confirmation may be submitted again.",
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm write to Sheet" }));

    expect(
      await screen.findByText(/Wrote the approved value to the Sheet \(Renewals!H17\)/),
    ).toBeVisible();
    expectRequest(fetchMock, 3, {
      runId: RUN_ID,
      sourceTriggerKey: SOURCE_TRIGGER_KEY,
      operation: "status",
      confirm: false,
      executionId: WRITE_EXECUTION_ID,
    });
    const confirmations = fetchMock.mock.calls
      .map(([, init]) => JSON.parse(String(init?.body)))
      .filter((body) => body.confirm === true);
    expect(confirmations).toHaveLength(2);
    expect(confirmations[1]).toEqual(confirmations[0]);
  });

  it("polls an in-progress action by its exact execution id", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          status: "in_progress",
          operation: "write",
          executionId: WRITE_EXECUTION_ID,
          reason: "Still settling.",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          status: "needs_reconciliation",
          operation: "write",
          executionId: WRITE_EXECUTION_ID,
          reason: "Settle window elapsed.",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    renderApprovedControl();

    await user.click(await screen.findByRole("button", { name: "Check action status" }));

    expectRequest(fetchMock, 1, {
      runId: RUN_ID,
      sourceTriggerKey: SOURCE_TRIGGER_KEY,
      operation: "status",
      confirm: false,
      executionId: WRITE_EXECUTION_ID,
    });
    expect(
      await screen.findByRole("button", { name: "Reconcile one attempt" }),
    ).toBeInTheDocument();
  });

  it("rehydrates a terminal provider mismatch instead of resubmitting the consumed preview", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ status: "no_execution" }))
      .mockResolvedValueOnce(
        jsonResponse({
          status: "resolved",
          target: {
            a1: "Renewals!H17",
            proposedColumnHeader: "Approved Rent",
            proposedValue: "$1,425",
            rowValues: ["Invented Resident", "Unit 17"],
          },
          preview: {
            executionId: WRITE_EXECUTION_ID,
            hash: WRITE_PREVIEW_HASH,
            expiresAt: "2026-07-29T23:10:00.000Z",
          },
        }),
      )
      .mockResolvedValueOnce(
        errorResponse(409, {
          error_type: "preview_stale",
          error: "The provider target changed before append.",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          status: "absent",
          operation: "write",
          executionId: WRITE_EXECUTION_ID,
          approvalVersion: APPROVED.updatedAt,
          reason: "The consumed provider attempt did not land.",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    renderApprovedControl();
    await user.click(
      await screen.findByRole("button", { name: "Write approved value to Sheet" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Confirm write to Sheet" }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expectRequest(fetchMock, 3, {
      runId: RUN_ID,
      sourceTriggerKey: SOURCE_TRIGGER_KEY,
      operation: "status",
      confirm: false,
      executionId: WRITE_EXECUTION_ID,
    });
    expect(
      screen.queryByRole("button", { name: "Confirm write to Sheet" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Write approved value to Sheet" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/This one attempt is consumed/)).toBeInTheDocument();
  });

  it("discards a known-stale preview when rejection happened before a durable claim", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ status: "no_execution" }))
      .mockResolvedValueOnce(
        jsonResponse({
          status: "resolved",
          target: {
            a1: "Renewals!H17",
            proposedColumnHeader: "Approved Rent",
            proposedValue: "$1,425",
            rowValues: ["Invented Resident", "Unit 17"],
          },
          preview: {
            executionId: WRITE_EXECUTION_ID,
            hash: WRITE_PREVIEW_HASH,
            expiresAt: "2026-07-29T23:10:00.000Z",
          },
        }),
      )
      .mockResolvedValueOnce(
        errorResponse(409, {
          error_type: "preview_stale",
          error: "The approval changed before the claim.",
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ status: "no_execution" }));
    vi.stubGlobal("fetch", fetchMock);

    renderApprovedControl();
    await user.click(
      await screen.findByRole("button", { name: "Write approved value to Sheet" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Confirm write to Sheet" }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(
      screen.queryByRole("button", { name: "Confirm write to Sheet" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Write approved value to Sheet" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/write preview is no longer valid/i)).toBeInTheDocument();
  });

  it("binds the exact preview identifiers and offers only read-only reconcile after an ambiguous attempt", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ status: "no_execution" }))
      .mockResolvedValueOnce(
        jsonResponse({
          status: "resolved",
          target: {
            a1: "Renewals!H17",
            proposedColumnHeader: "Approved Rent",
            proposedValue: "$1,425",
            rowValues: ["Invented Resident", "Unit 17"],
          },
          preview: {
            executionId: WRITE_EXECUTION_ID,
            hash: WRITE_PREVIEW_HASH,
            expiresAt: "2026-07-29T23:10:00.000Z",
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          status: "needs_reconciliation",
          executionId: WRITE_EXECUTION_ID,
          reason: "The provider response was ambiguous. Reconcile this one attempt.",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          status: "absent",
          executionId: WRITE_EXECUTION_ID,
          reason: "The exact target does not contain the proposed value.",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    renderApprovedControl();

    await user.click(
      await screen.findByRole("button", { name: "Write approved value to Sheet" }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expectRequest(fetchMock, 0, {
      runId: RUN_ID,
      sourceTriggerKey: SOURCE_TRIGGER_KEY,
      operation: "status",
      confirm: false,
    });
    expectRequest(fetchMock, 1, {
      runId: RUN_ID,
      sourceTriggerKey: SOURCE_TRIGGER_KEY,
      operation: "write",
      confirm: false,
    });

    expect(
      await screen.findByText((_, element) =>
        Boolean(
          element?.classList.contains("lr-approve-form") &&
          element.textContent?.includes(
            "Append $1,425 to Approved Rent at Renewals!H17.",
          ),
        ),
      ),
    ).toHaveTextContent("Exact preview 0123456789abcdef");

    await user.click(screen.getByRole("button", { name: "Confirm write to Sheet" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expectRequest(fetchMock, 2, {
      runId: RUN_ID,
      sourceTriggerKey: SOURCE_TRIGGER_KEY,
      operation: "write",
      confirm: true,
      executionId: WRITE_EXECUTION_ID,
      previewHash: WRITE_PREVIEW_HASH,
    });

    expect(
      await screen.findByText(
        "The provider response was ambiguous. Reconcile this one attempt.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reconcile one attempt" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Confirm write to Sheet" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reconcile one attempt" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expectRequest(fetchMock, 3, {
      runId: RUN_ID,
      sourceTriggerKey: SOURCE_TRIGGER_KEY,
      operation: "reconcile",
      confirm: false,
      executionId: WRITE_EXECUTION_ID,
    });
    expect(
      fetchMock.mock.calls
        .map(([, init]) => JSON.parse(String(init?.body)))
        .filter((body) => body.operation === "write" && body.confirm === true),
    ).toHaveLength(1);
  });

  it("previews a correction separately and commits only its exact identifiers", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ status: "no_execution" }))
      .mockResolvedValueOnce(
        jsonResponse({
          status: "resolved",
          target: {
            a1: "Renewals!H17",
            proposedColumnHeader: "Approved Rent",
            proposedValue: "$1,425",
            rowValues: ["Invented Resident", "Unit 17"],
          },
          preview: {
            executionId: WRITE_EXECUTION_ID,
            hash: WRITE_PREVIEW_HASH,
            expiresAt: "2026-07-29T23:10:00.000Z",
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          status: "written",
          a1: "Renewals!H17",
          receipt: {
            receiptId: WRITE_RECEIPT_ID,
            operation: "write",
            outcome: "written",
            reconciled: false,
            createdAt: "2026-07-29T23:01:00.000Z",
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          status: "correction_resolved",
          target: {
            a1: "Renewals!H17",
            currentValue: "$1,425",
            originalReceiptId: WRITE_RECEIPT_ID,
          },
          preview: {
            executionId: CORRECTION_EXECUTION_ID,
            hash: CORRECTION_PREVIEW_HASH,
            expiresAt: "2026-07-29T23:12:00.000Z",
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          status: "corrected",
          a1: "Renewals!H17",
          receipt: {
            receiptId: "correction-receipt-1",
            operation: "correction",
            outcome: "corrected",
            reconciled: false,
            approvalVersion: APPROVED.updatedAt,
            createdAt: "2026-07-29T23:03:00.000Z",
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    renderApprovedControl();

    await user.click(
      await screen.findByRole("button", { name: "Write approved value to Sheet" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Confirm write to Sheet" }),
    );

    expect(
      await screen.findByText(/Wrote the approved value to the Sheet \(Renewals!H17\)/),
    ).toHaveTextContent(WRITE_RECEIPT_ID);

    await user.click(screen.getByRole("button", { name: "Preview exact correction" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expectRequest(fetchMock, 3, {
      runId: RUN_ID,
      sourceTriggerKey: SOURCE_TRIGGER_KEY,
      operation: "correction",
      confirm: false,
      executionId: WRITE_RECEIPT_ID,
    });

    expect(
      await screen.findByText((_, element) =>
        Boolean(
          element?.classList.contains("lr-approve-form") &&
          element.textContent?.includes("Clear exactly $1,425 from Renewals!H17"),
        ),
      ),
    ).toHaveTextContent(`Exact correction preview ${CORRECTION_PREVIEW_HASH}`);

    await user.click(
      screen.getByRole("button", { name: "Confirm exact Sheet correction" }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
    expectRequest(fetchMock, 4, {
      runId: RUN_ID,
      sourceTriggerKey: SOURCE_TRIGGER_KEY,
      operation: "correction",
      confirm: true,
      executionId: CORRECTION_EXECUTION_ID,
      previewHash: CORRECTION_PREVIEW_HASH,
    });
    expect(
      await screen.findByText(/Cleared the exact receipted Sheet value \(Renewals!H17\)/),
    ).toHaveTextContent("correction-r…");
    expect(
      screen.queryByRole("button", { name: "Write approved value to Sheet" }),
    ).not.toBeInTheDocument();
  });

  it("offers a fresh write preview after correction only for a newer Approved version", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          status: "corrected",
          a1: "Renewals!H17",
          duplicate: true,
          receipt: {
            receiptId: "correction-receipt-1",
            operation: "correction",
            outcome: "corrected",
            reconciled: false,
            approvalVersion: APPROVED.updatedAt,
            createdAt: "2026-07-29T23:03:00.000Z",
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          status: "resolved",
          target: {
            a1: "Renewals!H17",
            proposedColumnHeader: "Approved Rent",
            proposedValue: "$1,450",
            rowValues: ["Invented Resident", "Unit 17"],
          },
          preview: {
            executionId: "write-execution-02",
            hash: "fresh-preview-hash",
            expiresAt: "2026-07-29T23:20:00.000Z",
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    renderApprovalControl({
      ...APPROVED,
      authorizationReceiptId: "approval-receipt-2",
      updatedAt: "2026-07-29T23:10:00.000Z",
    });

    await user.click(
      await screen.findByRole("button", { name: "Write approved value to Sheet" }),
    );

    expectRequest(fetchMock, 1, {
      runId: RUN_ID,
      sourceTriggerKey: SOURCE_TRIGGER_KEY,
      operation: "write",
      confirm: false,
    });
    expect(
      await screen.findByRole("button", { name: "Confirm write to Sheet" }),
    ).toBeInTheDocument();
  });

  it("offers a fresh write preview after an absent attempt only for a newer Approved version", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          status: "absent",
          operation: "write",
          executionId: WRITE_EXECUTION_ID,
          approvalVersion: APPROVED.updatedAt,
          reason: "The prior write did not land.",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          status: "resolved",
          target: {
            a1: "Renewals!H17",
            proposedColumnHeader: "Approved Rent",
            proposedValue: "$1,450",
            rowValues: ["Invented Resident", "Unit 17"],
          },
          preview: {
            executionId: "write-execution-02",
            hash: "fresh-preview-hash",
            expiresAt: "2026-07-29T23:20:00.000Z",
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    renderApprovalControl({
      ...APPROVED,
      authorizationReceiptId: "approval-receipt-2",
      updatedAt: "2026-07-29T23:10:00.000Z",
    });

    await user.click(
      await screen.findByRole("button", { name: "Write approved value to Sheet" }),
    );

    expectRequest(fetchMock, 1, {
      runId: RUN_ID,
      sourceTriggerKey: SOURCE_TRIGGER_KEY,
      operation: "write",
      confirm: false,
    });
    expect(
      await screen.findByRole("button", { name: "Confirm write to Sheet" }),
    ).toBeInTheDocument();
  });

  it("preserves a newer-approval lineage when a fresh prepare is temporarily blocked", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          status: "absent",
          operation: "write",
          executionId: WRITE_EXECUTION_ID,
          approvalVersion: APPROVED.updatedAt,
          reason: "The prior write did not land.",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          status: "blocked",
          reason: "The provider seam is temporarily unavailable",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          status: "resolved",
          target: {
            a1: "Renewals!H17",
            proposedColumnHeader: "Approved Rent",
            proposedValue: "$1,450",
            rowValues: ["Invented Resident", "Unit 17"],
          },
          preview: {
            executionId: "write-execution-02",
            hash: "fresh-preview-hash",
            expiresAt: "2026-07-29T23:20:00.000Z",
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    renderApprovalControl({
      ...APPROVED,
      authorizationReceiptId: "approval-receipt-2",
      updatedAt: "2026-07-29T23:10:00.000Z",
    });

    await user.click(
      await screen.findByRole("button", { name: "Write approved value to Sheet" }),
    );
    expect(await screen.findByText(/temporarily unavailable/)).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Write approved value to Sheet" }),
    );

    expectRequest(fetchMock, 2, {
      runId: RUN_ID,
      sourceTriggerKey: SOURCE_TRIGGER_KEY,
      operation: "write",
      confirm: false,
    });
    expect(
      await screen.findByRole("button", { name: "Confirm write to Sheet" }),
    ).toBeInTheDocument();
  });

  it("restores a fresh exact-correction preview after a prior attempt is absent", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          status: "absent",
          operation: "correction",
          executionId: CORRECTION_EXECUTION_ID,
          originalExecutionId: WRITE_RECEIPT_ID,
          reason: "The prior correction did not land.",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          status: "correction_resolved",
          target: {
            a1: "Renewals!H17",
            currentValue: "$1,425",
            originalReceiptId: WRITE_RECEIPT_ID,
          },
          preview: {
            executionId: `${CORRECTION_EXECUTION_ID}-child`,
            hash: CORRECTION_PREVIEW_HASH,
            expiresAt: "2026-07-29T23:12:00.000Z",
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    renderApprovedControl();

    await user.click(
      await screen.findByRole("button", { name: "Preview exact correction again" }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expectRequest(fetchMock, 1, {
      runId: RUN_ID,
      sourceTriggerKey: SOURCE_TRIGGER_KEY,
      operation: "correction",
      confirm: false,
      executionId: WRITE_RECEIPT_ID,
    });
    expect(
      await screen.findByRole("button", {
        name: "Confirm exact Sheet correction",
      }),
    ).toBeInTheDocument();
  });
});

function renderApprovedControl(writebackEnabled = true) {
  return renderApprovalControl(APPROVED, writebackEnabled);
}

function renderApprovalControl(
  approval: RenewalWritebackApprovalView,
  writebackEnabled = true,
) {
  return render(
    <WritebackApprovalControl
      approval={approval}
      isAdmin={true}
      runId={RUN_ID}
      showLegacyWritebackRecovery={true}
      sourceTriggerKey={SOURCE_TRIGGER_KEY}
      writebackEnabled={writebackEnabled}
    />,
  );
}

function jsonResponse(body: object) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}

function errorResponse(status: number, body: object) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function expectRequest(
  fetchMock: ReturnType<typeof vi.fn>,
  callIndex: number,
  expectedBody: object,
) {
  const [url, init] = fetchMock.mock.calls[callIndex] as [
    RequestInfo | URL,
    RequestInit | undefined,
  ];
  expect(String(url)).toBe("/api/lease-renewal/writeback-execute");
  expect(init?.method).toBe("POST");
  expect(JSON.parse(String(init?.body))).toEqual(expectedBody);
}
