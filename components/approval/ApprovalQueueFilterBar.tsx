import type { Dispatch, FormEvent, SetStateAction } from "react";
import {
  QUEUE_AUDIENCE_GROUPS,
  QUEUE_ITEM_STATUSES,
  QUEUE_RISK_LEVELS,
} from "@/lib/approval/queue";
import { hasActiveFilters, type QueueFilters } from "./ApprovalQueueModel";

interface QueueFilterBarProps {
  filters: QueueFilters;
  isLoadingList: boolean;
  onApply: (event: FormEvent<HTMLFormElement>) => void;
  onReset: () => void;
  setFilters: Dispatch<SetStateAction<QueueFilters>>;
}

export function QueueFilterBar({
  filters,
  isLoadingList,
  onApply,
  onReset,
  setFilters,
}: Readonly<QueueFilterBarProps>) {
  return (
    <form className="panel queue-filter-bar" onSubmit={onApply}>
      <label>
        Process/run
        <input
          name="process_run_id"
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              process_run_id: event.target.value,
            }))
          }
          value={filters.process_run_id}
        />
      </label>
      <label>
        Status
        <select
          name="status"
          onChange={(event) =>
            setFilters((current) => ({ ...current, status: event.target.value }))
          }
          value={filters.status}
        >
          <option value="">Any status</option>
          {QUEUE_ITEM_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </label>
      <label>
        Risk
        <select
          name="risk"
          onChange={(event) =>
            setFilters((current) => ({ ...current, risk: event.target.value }))
          }
          value={filters.risk}
        >
          <option value="">Any risk</option>
          {QUEUE_RISK_LEVELS.map((risk) => (
            <option key={risk} value={risk}>
              {risk}
            </option>
          ))}
        </select>
      </label>
      <label>
        Audience
        <select
          name="audience_group"
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              audience_group: event.target.value,
            }))
          }
          value={filters.audience_group}
        >
          <option value="">Any audience</option>
          {QUEUE_AUDIENCE_GROUPS.map((audience) => (
            <option key={audience} value={audience}>
              {audience}
            </option>
          ))}
        </select>
      </label>
      <label>
        Assignee
        <input
          name="assignee_uid"
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              assignee_uid: event.target.value,
            }))
          }
          value={filters.assignee_uid}
        />
      </label>
      <label>
        Approver
        <input
          name="required_approver_uid"
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              required_approver_uid: event.target.value,
            }))
          }
          value={filters.required_approver_uid}
        />
      </label>
      <label>
        Due date
        <input
          name="due_date"
          onChange={(event) =>
            setFilters((current) => ({ ...current, due_date: event.target.value }))
          }
          type="date"
          value={filters.due_date}
        />
      </label>
      <div className="queue-filter-actions">
        <button className="primary-button compact-button" disabled={isLoadingList}>
          {isLoadingList ? "Loading" : "Apply"}
        </button>
        <button
          className="secondary-button compact-button"
          disabled={isLoadingList}
          onClick={onReset}
          type="button"
        >
          Reset
        </button>
      </div>
    </form>
  );
}

export function QueueEmptyState({ filters }: Readonly<{ filters: QueueFilters }>) {
  return (
    <article className="panel">
      <h2>Nothing is currently waiting for review</h2>
      <p className="muted">
        {hasActiveFilters(filters)
          ? "No queue items match these filters."
          : "Nothing is currently waiting for review."}
      </p>
    </article>
  );
}

export function QueueUnavailableState({ listError }: Readonly<{ listError: string }>) {
  return (
    <article className="panel">
      <h2>Approval Queue unavailable</h2>
      <p className="muted">{listError}</p>
      <p className="muted">Use Reset to retry the queue connection.</p>
    </article>
  );
}
