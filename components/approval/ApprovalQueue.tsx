"use client";

import { useMemo, useState, type FormEvent } from "react";
import { queueActionAvailability } from "@/lib/approval/queue";
import { buildNeedsDecisionInbox } from "@/lib/approval/needs-decision-inbox";
import type { RenewalReviewBoard } from "@/lib/approval/renewal-review";
import type { WritebackApprovalQueue } from "@/lib/approval/writeback-approval-queue";
import type { Role } from "@/lib/auth/roles";
import type {
  ApprovalQueueActivityRecord,
  ApprovalQueueItemRecord,
} from "@/lib/firestore/types";
import {
  BULK_ACTION_LIMIT,
  emptyFilters,
  filterQuery,
  previewBulkAction,
  readErrorMessage,
  readJsonResponse,
  replaceItem,
  validateBulkActionFields,
  type BulkActionMode,
  type BulkQueueResult,
  type QueueActionMode,
  type QueueDetail,
  type QueueFilters,
} from "./ApprovalQueueModel";
import {
  QueueBulkPanel,
  QueueDetailPanel,
  QueueEmptyState,
  QueueFilterBar,
  QueueListPanel,
  QueueUnavailableState,
} from "./ApprovalQueuePanels";
import { NeedsDecisionInboxPanel } from "./NeedsDecisionInboxPanel";
import { RenewalReviewPanel } from "./RenewalReviewPanel";
import { WritebackQueuePanel } from "./WritebackQueuePanel";
import { ApprovalTestFixturePanel } from "./ApprovalTestFixturePanel";

type QueueView = "all" | "renewals" | "writeback";

export function ApprovalQueue({
  currentUser,
  initialActivity,
  initialError,
  initialItems,
  initialSelectedItemId,
  renewalBoard,
  writebackQueue,
}: Readonly<{
  currentUser: { role: Role; uid: string };
  initialActivity: ApprovalQueueActivityRecord[];
  initialError?: string;
  initialItems: ApprovalQueueItemRecord[];
  initialSelectedItemId?: string;
  renewalBoard?: RenewalReviewBoard;
  writebackQueue?: WritebackApprovalQueue;
}>) {
  // The unified, value-free "Needs your decision" list is always the landing surface (Slice 4a). The
  // other three views live behind an "Other views" disclosure; `view` selects which one renders once it
  // is open. A notification deep-link (`?item_id=`) opens the disclosure straight to "All items" with the
  // deep-linked item selected.
  const [view, setView] = useState<QueueView>("all");
  const [otherViewsOpen, setOtherViewsOpen] = useState(Boolean(initialSelectedItemId));
  const firstInitialItem =
    initialItems.find((item) => item.id === initialSelectedItemId) ?? initialItems.at(0);
  const [items, setItems] = useState(initialItems);
  const [selectedItemId, setSelectedItemId] = useState(firstInitialItem?.id ?? null);
  const [detailsById, setDetailsById] = useState<Record<string, QueueDetail>>(
    firstInitialItem
      ? {
          [firstInitialItem.id]: {
            activity: initialActivity,
            item: firstInitialItem,
          },
        }
      : {},
  );
  const [filters, setFilters] = useState<QueueFilters>(emptyFilters);
  const [listError, setListError] = useState(initialError);
  const [message, setMessage] = useState(initialError ?? "Approval Queue connected.");
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionMode, setActionMode] = useState<QueueActionMode | null>(null);
  const [reason, setReason] = useState("");
  const [snoozeUntil, setSnoozeUntil] = useState("");
  const [assigneeUid, setAssigneeUid] = useState("");
  const [requiredApproverUid, setRequiredApproverUid] = useState("");
  const [bulkAction, setBulkAction] = useState<BulkActionMode>("approve");
  const [bulkReason, setBulkReason] = useState("");
  const [bulkSnoozeUntil, setBulkSnoozeUntil] = useState("");
  const [bulkAssigneeUid, setBulkAssigneeUid] = useState("");
  const [bulkRequiredApproverUid, setBulkRequiredApproverUid] = useState("");
  const [bulkResult, setBulkResult] = useState<BulkQueueResult | null>(null);
  const [selectedBulkIds, setSelectedBulkIds] = useState<Set<string>>(new Set());

  const selectedItem = useMemo(() => {
    if (!selectedItemId) {
      return null;
    }

    return (
      detailsById[selectedItemId]?.item ??
      items.find((item) => item.id === selectedItemId) ??
      null
    );
  }, [detailsById, items, selectedItemId]);
  const selectedActivity = selectedItemId
    ? (detailsById[selectedItemId]?.activity ?? [])
    : [];
  const actionAvailability = selectedItem
    ? queueActionAvailability(currentUser, selectedItem)
    : null;
  const selectedBulkItems = useMemo(
    () => items.filter((item) => selectedBulkIds.has(item.id)),
    [items, selectedBulkIds],
  );
  const bulkSelectableItems = useMemo(() => items.slice(0, BULK_ACTION_LIMIT), [items]);
  const bulkPreview = useMemo(
    () => previewBulkAction(currentUser, selectedBulkItems, bulkAction),
    [bulkAction, currentUser, selectedBulkItems],
  );
  const allVisibleSelected =
    bulkSelectableItems.length > 0 &&
    bulkSelectableItems.every((item) => selectedBulkIds.has(item.id));

  async function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoadingList(true);
    setMessage("Loading approval queue.");

    try {
      const response = await fetch(`/api/approval-queue${filterQuery(filters)}`);
      const payload = await readJsonResponse<{ items: ApprovalQueueItemRecord[] }>(
        response,
      );

      resetListState(payload.items);
      setMessage(
        payload.items.length > 0
          ? "Approval Queue connected."
          : filterQuery(filters)
            ? "No queue items match these filters."
            : "Nothing is currently waiting for review.",
      );
    } catch (error) {
      const errorMessage = readErrorMessage(error);
      setListError(errorMessage);
      setMessage(errorMessage);
    } finally {
      setIsLoadingList(false);
    }
  }

  async function resetFilters() {
    setFilters(emptyFilters);
    setIsLoadingList(true);
    setMessage("Loading approval queue.");

    try {
      const response = await fetch("/api/approval-queue");
      const payload = await readJsonResponse<{ items: ApprovalQueueItemRecord[] }>(
        response,
      );

      resetListState(payload.items);
      setMessage(
        payload.items.length > 0
          ? "Approval Queue connected."
          : "Nothing is currently waiting for review.",
      );
    } catch (error) {
      const errorMessage = readErrorMessage(error);
      setListError(errorMessage);
      setMessage(errorMessage);
    } finally {
      setIsLoadingList(false);
    }
  }

  async function loadDetail(itemId: string, options: { silent?: boolean } = {}) {
    setLoadingDetailId(itemId);
    if (!options.silent) {
      setMessage("Loading queue item.");
    }

    try {
      const response = await fetch(`/api/approval-queue/${encodeURIComponent(itemId)}`);
      const payload = await readJsonResponse<QueueDetail>(response);

      setDetailsById((current) => ({ ...current, [itemId]: payload }));
      setItems((current) => replaceItem(current, payload.item));
      if (!options.silent) {
        setMessage("Queue item loaded.");
      }
    } catch (error) {
      setMessage(readErrorMessage(error));
    } finally {
      setLoadingDetailId(null);
    }
  }

  async function transitionSelectedItem(input: Record<string, boolean | string>) {
    if (!selectedItem) {
      return;
    }

    const requestBody = { ...input };

    if (
      input.action === "approve" &&
      selectedItem.risk === "High" &&
      !window.confirm("This is a High-risk approval. Approve this queue item?")
    ) {
      return;
    }

    if (input.action === "approve" && selectedItem.risk === "High") {
      requestBody.confirm_high_risk = true;
    }

    setBusyAction(String(input.action ?? "action"));
    setMessage("Saving queue item.");

    try {
      const response = await fetch(
        `/api/approval-queue/${encodeURIComponent(selectedItem.id)}`,
        {
          body: JSON.stringify(requestBody),
          headers: { "Content-Type": "application/json" },
          method: "PATCH",
        },
      );
      const payload = await readJsonResponse<QueueDetail>(response);

      setDetailsById((current) => ({ ...current, [payload.item.id]: payload }));
      setItems((current) => replaceItem(current, payload.item));
      setActionMode(null);
      setReason("");
      setSnoozeUntil("");
      setMessage("Queue item updated.");
    } catch (error) {
      setMessage(readErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  function resetListState(nextItems: ApprovalQueueItemRecord[]) {
    setItems(nextItems);
    setDetailsById({});
    setListError(undefined);
    setSelectedBulkIds(new Set());
    setBulkResult(null);
    const firstItemId = nextItems.at(0)?.id ?? null;
    setSelectedItemId(firstItemId);
    setActionMode(null);
    if (firstItemId) {
      void loadDetail(firstItemId, { silent: true });
    }
  }

  function selectItem(itemId: string) {
    setSelectedItemId(itemId);
    setActionMode(null);
    setReason("");
    setSnoozeUntil("");

    if (!detailsById[itemId]) {
      void loadDetail(itemId);
    }
  }

  function startAction(mode: QueueActionMode) {
    setActionMode(mode);
    setReason("");
    setSnoozeUntil("");
    setAssigneeUid(selectedItem?.assignee_uid ?? "");
    setRequiredApproverUid(selectedItem?.required_approver_uid ?? "");
  }

  function submitReasonedAction(action: "approve" | "disable" | "return") {
    const trimmedReason = reason.trim();

    if (!trimmedReason) {
      setMessage(
        action === "approve"
          ? "High-risk approval requires a reason."
          : action === "return"
            ? "Return for Revision requires a reason."
            : "Disable Action requires a reason.",
      );
      return;
    }

    void transitionSelectedItem({ action, reason: trimmedReason });
  }

  function submitSnooze() {
    const trimmedReason = reason.trim();

    if (!trimmedReason || !snoozeUntil) {
      setMessage("Snooze requires a date and reason.");
      return;
    }

    void transitionSelectedItem({
      action: "snooze",
      reason: trimmedReason,
      snooze_until: snoozeUntil,
    });
  }

  function submitAssign() {
    if (!assigneeUid.trim() && !requiredApproverUid.trim()) {
      setMessage("Assign requires an assignee or required approver.");
      return;
    }

    void transitionSelectedItem({
      action: "assign",
      assignee_uid: assigneeUid.trim(),
      required_approver_uid: requiredApproverUid.trim(),
    });
  }

  function toggleBulkItem(itemId: string) {
    if (!selectedBulkIds.has(itemId) && selectedBulkItems.length >= BULK_ACTION_LIMIT) {
      setMessage(`Bulk actions are limited to ${BULK_ACTION_LIMIT} visible items.`);
      return;
    }

    setSelectedBulkIds((current) => {
      const next = new Set(current);

      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }

      return next;
    });
    setBulkResult(null);
  }

  function toggleAllVisible() {
    if (allVisibleSelected) {
      setSelectedBulkIds(new Set());
    } else {
      setSelectedBulkIds(new Set(bulkSelectableItems.map((item) => item.id)));
      if (items.length > BULK_ACTION_LIMIT) {
        setMessage(`Selected the first ${BULK_ACTION_LIMIT} visible queue items.`);
      }
    }
    setBulkResult(null);
  }

  async function submitBulkAction() {
    const itemIds = items
      .filter((item) => selectedBulkIds.has(item.id))
      .map((item) => item.id);

    if (itemIds.length === 0) {
      setMessage("Select at least one visible queue item for a bulk action.");
      return;
    }

    if (itemIds.length > BULK_ACTION_LIMIT) {
      setMessage(`Bulk actions are limited to ${BULK_ACTION_LIMIT} visible items.`);
      return;
    }

    const validationMessage = validateBulkActionFields({
      action: bulkAction,
      assigneeUid: bulkAssigneeUid,
      reason: bulkReason,
      requiredApproverUid: bulkRequiredApproverUid,
      snoozeUntil: bulkSnoozeUntil,
    });

    if (validationMessage) {
      setMessage(validationMessage);
      return;
    }

    if (
      bulkAction === "approve" &&
      bulkPreview.linkedHighRiskApprovals > 0 &&
      !bulkReason.trim()
    ) {
      setMessage("High-risk bulk approval requires a reason.");
      return;
    }

    const highRiskApprovalCount = bulkPreview.highRiskApprovals;
    if (
      bulkAction === "approve" &&
      highRiskApprovalCount > 0 &&
      !window.confirm(
        `This bulk approval includes ${highRiskApprovalCount} High-risk item(s). Approve them?`,
      )
    ) {
      return;
    }

    const body: Record<string, boolean | string | string[]> = {
      action: bulkAction,
      item_ids: itemIds,
    };

    if (bulkReason.trim()) {
      body.reason = bulkReason.trim();
    }
    if (bulkSnoozeUntil) {
      body.snooze_until = bulkSnoozeUntil;
    }
    if (bulkAssigneeUid.trim()) {
      body.assignee_uid = bulkAssigneeUid.trim();
    }
    if (bulkRequiredApproverUid.trim()) {
      body.required_approver_uid = bulkRequiredApproverUid.trim();
    }
    if (bulkAction === "approve" && highRiskApprovalCount > 0) {
      body.confirm_high_risk = true;
    }

    setBusyAction(`bulk-${bulkAction}`);
    setMessage("Saving selected queue items.");

    try {
      const response = await fetch("/api/approval-queue/bulk", {
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = await readJsonResponse<BulkQueueResult>(response);
      const updatedItems = payload.results
        .map((result) => result.item)
        .filter((item): item is ApprovalQueueItemRecord => Boolean(item));

      setBulkResult(payload);
      setItems((current) =>
        updatedItems.reduce((nextItems, item) => replaceItem(nextItems, item), current),
      );
      setDetailsById((current) => {
        let next = current;

        for (const item of updatedItems) {
          if (next[item.id]) {
            next = {
              ...next,
              [item.id]: {
                ...next[item.id],
                item,
              },
            };
          }
        }

        return next;
      });
      if (selectedItemId && itemIds.includes(selectedItemId)) {
        void loadDetail(selectedItemId, { silent: true });
      }
      setMessage(
        `Bulk action finished: ${payload.summary.updated} updated, ${payload.summary.skipped} skipped, ${payload.summary.failed} failed.`,
      );
    } catch (error) {
      setMessage(readErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  const renewalOpenFlags = renewalBoard?.totalOpenFlags ?? 0;
  const writebackAwaiting = writebackQueue?.counts.awaitingApproval ?? 0;
  // The default landing: one value-free, attention-ordered list merging the three feeds this page
  // already gathers, so a real backlog never hides behind a near-empty "All items" tab (B1). Built from
  // the immutable full item set (initialItems), NOT the mutable `items` that "All items" filtering
  // overwrites — an operator's status/risk filter must never shrink the triage inbox or its badge.
  const needsInbox = useMemo(
    () =>
      buildNeedsDecisionInbox(initialItems, renewalBoard, writebackQueue, currentUser),
    [currentUser, initialItems, renewalBoard, writebackQueue],
  );

  return (
    <div className="approval-queue-shell">
      {currentUser.role === "Admin" ? <ApprovalTestFixturePanel /> : null}
      <NeedsDecisionInboxPanel inbox={needsInbox} />

      <details
        className="panel ui-collapse"
        open={otherViewsOpen}
        onToggle={(event) => setOtherViewsOpen(event.currentTarget.open)}
      >
        <summary>
          <span className="ui-card-title">Other views</span>
          <span className="muted">
            {" "}
            Browse every queue item, renewal review, and write-back proposal.
          </span>
        </summary>

        {otherViewsOpen ? (
          <>
            <div className="ui-tablist" role="tablist" aria-label="Approval queue views">
              <button
                aria-selected={view === "all"}
                className="ui-tab"
                onClick={() => setView("all")}
                role="tab"
                type="button"
              >
                All items
              </button>
              <button
                aria-selected={view === "renewals"}
                className="ui-tab"
                onClick={() => setView("renewals")}
                role="tab"
                type="button"
              >
                Renewal reviews{renewalOpenFlags > 0 ? ` (${renewalOpenFlags})` : ""}
              </button>
              <button
                aria-selected={view === "writeback"}
                className="ui-tab"
                onClick={() => setView("writeback")}
                role="tab"
                type="button"
              >
                Write-back proposals
                {writebackAwaiting > 0 ? ` (${writebackAwaiting})` : ""}
              </button>
            </div>

            {view === "renewals" ? (
              <RenewalReviewPanel board={renewalBoard} />
            ) : view === "writeback" ? (
              <WritebackQueuePanel queue={writebackQueue} />
            ) : (
              renderAllItemsView()
            )}
          </>
        ) : null}
      </details>
    </div>
  );

  function renderAllItemsView() {
    return (
      <>
        <QueueFilterBar
          filters={filters}
          isLoadingList={isLoadingList}
          onApply={applyFilters}
          onReset={() => void resetFilters()}
          setFilters={setFilters}
        />

        <p className="muted queue-status-message">{message}</p>

        {listError ? (
          <QueueUnavailableState listError={listError} />
        ) : items.length === 0 ? (
          <QueueEmptyState filters={filters} />
        ) : (
          <>
            <QueueBulkPanel
              allVisibleSelected={allVisibleSelected}
              bulkAction={bulkAction}
              bulkAssigneeUid={bulkAssigneeUid}
              bulkPreview={bulkPreview}
              bulkReason={bulkReason}
              bulkRequiredApproverUid={bulkRequiredApproverUid}
              bulkResult={bulkResult}
              bulkSnoozeUntil={bulkSnoozeUntil}
              busyAction={busyAction}
              onClearSelection={() => {
                setSelectedBulkIds(new Set());
                setBulkResult(null);
              }}
              onSubmitBulkAction={() => void submitBulkAction()}
              onToggleAllVisible={toggleAllVisible}
              selectedBulkItems={selectedBulkItems}
              setBulkAction={setBulkAction}
              setBulkAssigneeUid={setBulkAssigneeUid}
              setBulkReason={setBulkReason}
              setBulkRequiredApproverUid={setBulkRequiredApproverUid}
              setBulkSnoozeUntil={setBulkSnoozeUntil}
            />

            <div className="approval-queue-layout">
              <QueueListPanel
                items={items}
                onSelectItem={selectItem}
                onToggleBulkItem={toggleBulkItem}
                selectedBulkIds={selectedBulkIds}
                selectedItemId={selectedItemId}
              />
              <QueueDetailPanel
                actionAvailability={actionAvailability}
                actionMode={actionMode}
                assigneeUid={assigneeUid}
                busyAction={busyAction}
                loadingDetailId={loadingDetailId}
                onApprove={() => {
                  if (selectedItem?.action_execution_id) {
                    startAction("approve");
                    return;
                  }
                  void transitionSelectedItem({ action: "approve" });
                }}
                onCancelAction={() => setActionMode(null)}
                onStartAction={startAction}
                onSubmitAssign={submitAssign}
                onSubmitReasonedAction={submitReasonedAction}
                onSubmitSnooze={submitSnooze}
                reason={reason}
                requiredApproverUid={requiredApproverUid}
                selectedActivity={selectedActivity}
                selectedItem={selectedItem}
                setAssigneeUid={setAssigneeUid}
                setReason={setReason}
                setRequiredApproverUid={setRequiredApproverUid}
                setSnoozeUntil={setSnoozeUntil}
                snoozeUntil={snoozeUntil}
              />
            </div>
          </>
        )}
      </>
    );
  }
}
