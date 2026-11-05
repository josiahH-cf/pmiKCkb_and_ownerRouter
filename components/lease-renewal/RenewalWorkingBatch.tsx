"use client";

// S246: the working batch, the Renewals desk's default view. A presentation over the batch rows
// the page projected from the one desk orchestration (ARCH-S246-2): it partitions exactly those
// rows for the working month, lists "Carried over" and "This batch", and shows every other lease
// as a count that opens its rows. It reads no source of its own.
//
// The only things it can record are the two staff choices of R-S246-5, each from a staff click
// and each through the existing workspace route: record staff completion (after a confirmation)
// or keep working. No group, count or row derives a message, a schedule, a reminder or a lookup.
//
// The month and the open group live in the URL (`batch`, `group`), so a lease link can carry them
// and "Back to renewals" restores the same month, group and position (R-S246-8).

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent,
  type ReactNode,
} from "react";

import { Button, ConfirmationDialog, Notice } from "@/components/ui";
import {
  RENEWAL_DESK_ALL_LEASES_HREF,
  RENEWAL_WORKSPACE_ROUTE_PREFIX,
  buildWorkspaceHref,
  renewalBatchHref,
} from "@/lib/lease-renewal/desk-view-continuation";
import {
  RENEWAL_BATCH_COUNT_GROUPS,
  RENEWAL_BATCH_GROUP_HELP,
  RENEWAL_BATCH_GROUP_LABELS,
  defaultRenewalBatchMonth,
  parseRenewalBatchQuery,
  partitionRenewalBatch,
  renewalBatchMonthInWords,
  renewalBatchSummary,
  serializeRenewalBatchQuery,
  shiftRenewalBatchMonth,
  type RenewalBatchCountGroup,
  type RenewalBatchGroup,
  type RenewalBatchQuery,
} from "@/lib/lease-renewal/renewal-batch";
import type { RenewalBatchRowView } from "@/lib/lease-renewal/renewal-batch-row";
import { fetchWithDeadline } from "@/lib/ui/fetch-lifetime";

const WORKSPACE_ROUTE = "/api/lease-renewal/workspace";
const BATCH_URL_EVENT = "pmi:renewal-batch-url";
const RETURN_POSITION_KEY = "pmi-kc:renewal-batch:return-position";
/** A noted position older than this is forgotten rather than restored late. */
const RETURN_POSITION_MAX_AGE_MS = 30 * 60_000;
const LEASE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/** The groups whose rows are renewal work, shown as one short row each (R-S246-7). */
const WORK_ROW_GROUPS: ReadonlySet<RenewalBatchGroup> = new Set([
  "carried_over",
  "this_batch",
  "month_to_month_reviews",
  "non_renewals",
]);

type CycleDateChoice = "confirm_source_renewal" | "keep_working";

export interface RenewalWorkingBatchProps {
  /** Every loaded lease as one batch row; the view partitions exactly these. */
  readonly rows: readonly RenewalBatchRowView[];
  /** Today's Central business date. The working month defaults to the month after it. */
  readonly todayIso: string;
  /** The month and open group the URL named, as the server read them. */
  readonly initial: RenewalBatchQuery;
  /** The account's remembered table view by its own link, offered as "Open my saved view". */
  readonly savedViewHref?: string | null;
  /** True when this account may record a completion or a keep-working choice here. */
  readonly canRecord?: boolean;
  /** S58: lease data past its limit pauses recording until a refresh completes. */
  readonly recordingPaused?: boolean;
  /** False when staff's keep-working choices could not be read for this render. */
  readonly decisionsAvailable?: boolean;
}

function subscribeToUrl(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  window.addEventListener(BATCH_URL_EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(BATCH_URL_EVENT, onChange);
  };
}

function currentSearch(): string {
  return window.location.search;
}

function plainLeftClick(event: MouseEvent<HTMLElement>): boolean {
  return (
    event.button === 0 &&
    !event.defaultPrevented &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey
  );
}

/** Note where a lease was opened from, so returning lands on the same place in the batch. */
function notePosition(
  month: string,
  group: RenewalBatchCountGroup | null,
  leaseId: string,
) {
  try {
    window.sessionStorage.setItem(
      RETURN_POSITION_KEY,
      JSON.stringify({ month, group, leaseId, y: window.scrollY, at: Date.now() }),
    );
  } catch {
    // Storage can be unavailable; the browser's own Back still restores the position.
  }
}

/** Read and clear the noted position when it belongs to the batch view on screen. */
function takePosition(
  month: string,
  group: RenewalBatchCountGroup | null,
): { y: number; leaseId: string } | null {
  try {
    const raw = window.sessionStorage.getItem(RETURN_POSITION_KEY);
    window.sessionStorage.removeItem(RETURN_POSITION_KEY);
    if (!raw) return null;
    const noted = JSON.parse(raw) as {
      month?: unknown;
      group?: unknown;
      leaseId?: unknown;
      y?: unknown;
      at?: unknown;
    } | null;
    if (
      !noted ||
      noted.month !== month ||
      (noted.group ?? null) !== group ||
      typeof noted.y !== "number" ||
      !Number.isFinite(noted.y) ||
      typeof noted.at !== "number" ||
      Date.now() - noted.at > RETURN_POSITION_MAX_AGE_MS
    )
      return null;
    return {
      y: Math.max(0, noted.y),
      leaseId: typeof noted.leaseId === "string" ? noted.leaseId : "",
    };
  } catch {
    return null;
  }
}

export function RenewalWorkingBatch({
  rows,
  todayIso,
  initial,
  savedViewHref = null,
  canRecord = false,
  recordingPaused = false,
  decisionsAvailable = true,
}: RenewalWorkingBatchProps) {
  const router = useRouter();
  const panelId = useId();
  const defaultMonth = defaultRenewalBatchMonth(todayIso);
  const serverSearch = useMemo(() => {
    const search = serializeRenewalBatchQuery(initial);
    return search === "" ? "" : `?${search}`;
  }, [initial]);
  const search = useSyncExternalStore(subscribeToUrl, currentSearch, () => serverSearch);
  const query = useMemo(
    () => parseRenewalBatchQuery(new URLSearchParams(search)),
    [search],
  );
  const month = query.month ?? defaultMonth;
  const openGroup = query.group;
  const partition = useMemo(() => partitionRenewalBatch(rows, month), [rows, month]);

  // The return value a lease link carries: the plain batch omits it, like the default table view.
  const continuation = useMemo(() => {
    const value = serializeRenewalBatchQuery({
      month: month === defaultMonth ? null : month,
      group: openGroup,
    });
    return value === "" ? null : value;
  }, [month, defaultMonth, openGroup]);

  const batchQueryFor = useCallback(
    (next: {
      month?: string;
      group?: RenewalBatchCountGroup | null;
    }): RenewalBatchQuery => {
      const nextMonth = next.month ?? month;
      return {
        month: nextMonth === defaultMonth ? null : nextMonth,
        group: next.group === undefined ? openGroup : next.group,
      };
    },
    [month, defaultMonth, openGroup],
  );

  // A plain history entry, with no state of its own, so the app router keeps its own address in
  // step with it and a later refresh stays on this month and group.
  const showBatch = useCallback((target: string, mode: "push" | "replace") => {
    if (mode === "push") window.history.pushState(null, "", target);
    else window.history.replaceState(null, "", target);
    window.dispatchEvent(new Event(BATCH_URL_EVENT));
  }, []);

  // R-S246-8: returning from a lease restores the position it was opened from, once.
  const positionRestored = useRef(false);
  useEffect(() => {
    if (positionRestored.current) return;
    positionRestored.current = true;
    const noted = takePosition(month, openGroup);
    if (!noted) return;
    window.scrollTo(0, noted.y);
    if (LEASE_ID_PATTERN.test(noted.leaseId))
      document
        .querySelector<HTMLElement>(`[data-batch-lease="${noted.leaseId}"] a[href]`)
        ?.focus({ preventScroll: true });
  }, [month, openGroup]);

  const noteLeaseOpen = (event: MouseEvent<HTMLElement>) => {
    const anchor = (event.target as Element | null)?.closest?.("a[href]");
    const href = anchor?.getAttribute("href") ?? "";
    if (!href.startsWith(RENEWAL_WORKSPACE_ROUTE_PREFIX)) return;
    const leaseId =
      anchor?.closest("[data-batch-lease]")?.getAttribute("data-batch-lease") ?? "";
    notePosition(month, openGroup, leaseId);
  };

  // ---- R-S246-5: the two staff choices ---------------------------------------------------------
  const pendingOperations = useRef(new Map<string, string>());
  const confirmTrigger = useRef<HTMLButtonElement | null>(null);
  const [confirming, setConfirming] = useState<RenewalBatchRowView | null>(null);
  const [busy, setBusy] = useState<{ leaseId: string; choice: CycleDateChoice } | null>(
    null,
  );
  const [outcome, setOutcome] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  async function record(row: RenewalBatchRowView, choice: CycleDateChoice) {
    const dates = row.sourceRenewal;
    if (!dates || busy) return false;
    // The key names the work record version on screen, so a row re-read after another operator's
    // change starts a new request instead of replaying the earlier one.
    const key = `${choice}:${row.leaseId}:${dates.recordedDateIso}:${dates.sourceDateIso}:${dates.cycleId}:${dates.revision}`;
    // One operation id per choice: a repeat after a lost response cannot record it twice.
    let operationId = pendingOperations.current.get(key);
    if (!operationId) {
      operationId = crypto.randomUUID();
      pendingOperations.current.set(key, operationId);
    }
    setBusy({ leaseId: row.leaseId, choice });
    setOutcome(null);
    try {
      const response = await fetchWithDeadline(WORKSPACE_ROUTE, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation: choice,
          leaseId: row.leaseId,
          recordedDateIso: dates.recordedDateIso,
          sourceDateIso: dates.sourceDateIso,
          operationId,
          // A completion is bound to the work record version this row showed.
          ...(choice === "confirm_source_renewal"
            ? { cycleId: dates.cycleId, expectedRevision: dates.revision }
            : {}),
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: unknown;
        } | null;
        // A definite refusal recorded nothing; the next attempt is a new request.
        pendingOperations.current.delete(key);
        setOutcome({
          tone: "error",
          text:
            typeof body?.error === "string" && body.error.trim()
              ? body.error.trim()
              : "This choice was not recorded. Reload Renewals and choose again.",
        });
        if (response.status === 409) router.refresh();
        return false;
      }
      pendingOperations.current.delete(key);
      setOutcome({
        tone: "success",
        text:
          choice === "keep_working"
            ? `${row.address} stays in the batch for the cycle recorded ${dates.recordedLabel}.`
            : `Staff completion recorded for ${row.address}, with RentVine lease end ${dates.sourceLabel} as the evidence.`,
      });
      router.refresh();
      return true;
    } catch {
      setOutcome({
        tone: "error",
        text: "The response did not arrive, so it is not yet known whether this was recorded. Choose again to finish it; it is recorded once.",
      });
      return false;
    } finally {
      setBusy(null);
    }
  }

  const previousMonth = shiftRenewalBatchMonth(month, -1);
  const nextMonth = shiftRenewalBatchMonth(month, 1);
  const monthLink = (target: string, label: string) => {
    const href = renewalBatchHref(batchQueryFor({ month: target }));
    return (
      <a
        className="secondary-button renewal-batch-month-link"
        data-batch-month-target={target}
        href={href}
        onClick={(event) => {
          if (!plainLeftClick(event)) return;
          event.preventDefault();
          showBatch(href, "push");
        }}
      >
        {label}
      </a>
    );
  };

  const count = partition.counts.this_batch;
  const openRows = openGroup ? partition.groups[openGroup] : [];

  return (
    <section
      aria-label="Working batch"
      className="ui-stack renewal-batch"
      data-batch-month={month}
      data-batch-total={partition.total}
      onClickCapture={noteLeaseOpen}
    >
      <div className="renewal-batch-lead">
        <p className="renewal-batch-summary" data-batch-count={count} role="status">
          {renewalBatchSummary(month, count)}
        </p>
        <nav aria-label="Working month" className="renewal-batch-months">
          {monthLink(previousMonth, "Previous month")}
          <span className="renewal-batch-month-name">
            Working month: {renewalBatchMonthInWords(month)}
          </span>
          {monthLink(nextMonth, "Next month")}
          {month === defaultMonth ? null : (
            <a
              className="text-link renewal-batch-inline-link"
              href={renewalBatchHref(batchQueryFor({ month: defaultMonth }))}
              onClick={(event) => {
                if (!plainLeftClick(event)) return;
                event.preventDefault();
                showBatch(
                  renewalBatchHref(batchQueryFor({ month: defaultMonth })),
                  "push",
                );
              }}
            >
              Return to {renewalBatchMonthInWords(defaultMonth)}
            </a>
          )}
        </nav>
      </div>

      {outcome && confirming === null ? (
        <Notice tone={outcome.tone} urgent={outcome.tone === "error"}>
          {outcome.text}
        </Notice>
      ) : null}

      {partition.counts.carried_over > 0 ? (
        <BatchList
          continuation={continuation}
          group="carried_over"
          note="From earlier months with no completion recorded, oldest end date first."
          rows={partition.groups.carried_over}
        />
      ) : null}

      <BatchList
        continuation={continuation}
        emptyText={`Nothing is listed for ${renewalBatchMonthInWords(month)}.`}
        group="this_batch"
        rows={partition.groups.this_batch}
      />

      <section aria-label="Other leases" className="ui-stack renewal-batch-others">
        <h2 className="renewal-batch-heading">Everything else</h2>
        <p className="muted renewal-batch-note">
          All {partition.total} loaded leases are counted once across these groups. Choose
          a count to list its leases.
        </p>
        <ul className="renewal-batch-counts">
          {RENEWAL_BATCH_COUNT_GROUPS.map((group) => {
            const open = openGroup === group;
            return (
              <li key={group}>
                <button
                  aria-controls={open ? panelId : undefined}
                  aria-expanded={open}
                  className="renewal-batch-count"
                  data-batch-count={partition.counts[group]}
                  data-batch-group={group}
                  onClick={() =>
                    showBatch(
                      renewalBatchHref(batchQueryFor({ group: open ? null : group })),
                      "replace",
                    )
                  }
                  type="button"
                >
                  <span>{RENEWAL_BATCH_GROUP_LABELS[group]}</span>{" "}
                  <span className="renewal-batch-count-number">
                    {partition.counts[group]}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {openGroup ? (
          <div
            aria-label={RENEWAL_BATCH_GROUP_LABELS[openGroup]}
            className="ui-stack renewal-batch-panel"
            data-batch-open-group={openGroup}
            id={panelId}
            role="region"
          >
            <h3 className="renewal-batch-heading">
              {RENEWAL_BATCH_GROUP_LABELS[openGroup]}
            </h3>
            <p className="muted renewal-batch-note">
              {RENEWAL_BATCH_GROUP_HELP[openGroup]}
            </p>
            {openGroup === "not_targets" && partition.notTargetReasons.length > 0 ? (
              <ul className="renewal-batch-reasons">
                {partition.notTargetReasons.map((reason) => (
                  <li data-batch-reason-count={reason.count} key={reason.label}>
                    {reason.label}: {reason.count}
                  </li>
                ))}
              </ul>
            ) : null}
            {openGroup === "renewed_in_rentvine" && !decisionsAvailable ? (
              <Notice tone="caution">
                Keep-working choices could not be read just now, so a lease you chose to
                keep working can be listed here again. Your earlier choice is still saved.
              </Notice>
            ) : null}
            {openGroup === "renewed_in_rentvine" && openRows.length > 0 && !canRecord ? (
              <p className="muted renewal-batch-note">
                Recording a completion or a keep-working choice needs Editor access. You
                can open each lease to review it.
              </p>
            ) : null}
            {openGroup === "renewed_in_rentvine" && canRecord && recordingPaused ? (
              <p className="muted renewal-batch-note">
                Recording is paused while the lease data is past its limit. Refresh the
                lease data first.
              </p>
            ) : null}
            {openRows.length === 0 ? (
              <p className="muted renewal-batch-note">No leases are in this group.</p>
            ) : (
              <ul className="renewal-batch-rows">
                {openRows.map((row) => (
                  <BatchRow
                    actions={
                      openGroup === "renewed_in_rentvine" &&
                      row.sourceRenewal &&
                      canRecord ? (
                        <span className="renewal-batch-actions">
                          <Button
                            busy={
                              busy?.leaseId === row.leaseId &&
                              busy.choice === "confirm_source_renewal"
                            }
                            busyLabel="Recording…"
                            disabled={recordingPaused || busy !== null}
                            onClick={(event) => {
                              confirmTrigger.current = event.currentTarget;
                              setConfirming(row);
                            }}
                            size="compact"
                            variant="secondary"
                          >
                            Record staff completion
                          </Button>
                          <Button
                            busy={
                              busy?.leaseId === row.leaseId &&
                              busy.choice === "keep_working"
                            }
                            busyLabel="Saving…"
                            disabled={recordingPaused || busy !== null}
                            onClick={() => void record(row, "keep_working")}
                            size="compact"
                            variant="tertiary"
                          >
                            Keep working
                          </Button>
                        </span>
                      ) : null
                    }
                    continuation={continuation}
                    group={openGroup}
                    key={row.key}
                    row={row}
                  />
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </section>

      <nav aria-label="Other views of these leases" className="renewal-batch-views">
        <Link className="text-link" href={RENEWAL_DESK_ALL_LEASES_HREF} prefetch={false}>
          All leases and filters
        </Link>
        {savedViewHref ? (
          <Link className="text-link" href={savedViewHref} prefetch={false}>
            Open my saved view
          </Link>
        ) : null}
      </nav>

      <ConfirmationDialog
        busy={busy?.choice === "confirm_source_renewal"}
        busyLabel="Recording…"
        confirmLabel="Record staff completion"
        description={
          confirming?.sourceRenewal
            ? `This cycle recorded lease end ${confirming.sourceRenewal.recordedLabel}. RentVine now reports lease end ${confirming.sourceRenewal.sourceLabel}.`
            : undefined
        }
        onCancel={() => setConfirming(null)}
        error={
          confirming !== null && outcome?.tone === "error" ? outcome.text : undefined
        }
        onConfirm={() => {
          const row = confirming;
          if (!row) return;
          void record(row, "confirm_source_renewal").then((recorded) => {
            if (recorded) setConfirming(null);
          });
        }}
        open={confirming !== null}
        title={
          confirming
            ? `Record staff completion for ${confirming.address}?`
            : "Record staff completion?"
        }
        triggerRef={confirmTrigger}
      >
        <p>
          Confirming records this cycle as complete on the lease&rsquo;s staff record,
          with the RentVine lease end as the evidence. The record stays in this app, and
          you can reopen it from the lease.
        </p>
      </ConfirmationDialog>
    </section>
  );
}

function BatchList({
  group,
  rows,
  continuation,
  note,
  emptyText,
}: Readonly<{
  group: "carried_over" | "this_batch";
  rows: readonly RenewalBatchRowView[];
  continuation: string | null;
  note?: string;
  emptyText?: string;
}>) {
  const label = RENEWAL_BATCH_GROUP_LABELS[group];
  return (
    <section
      aria-label={label}
      className="ui-stack renewal-batch-group"
      data-batch-count={rows.length}
      data-batch-list={group}
    >
      <h2 className="renewal-batch-heading">{label}</h2>
      {note ? <p className="muted renewal-batch-note">{note}</p> : null}
      {rows.length === 0 ? (
        <p className="muted renewal-batch-note">{emptyText}</p>
      ) : (
        <ul className="renewal-batch-rows">
          {rows.map((row) => (
            <BatchRow continuation={continuation} group={group} key={row.key} row={row} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * One lease. A work row (R-S246-7) shows the address and unit, the tenant names as text, the end
 * date, one stage line, one next-step link and at most three tags. A row in a counted group that
 * is outside renewal work shows its reason and opens the lease, with no renewal next step.
 */
function BatchRow({
  row,
  group,
  continuation,
  actions = null,
}: Readonly<{
  row: RenewalBatchRowView;
  group: RenewalBatchGroup;
  continuation: string | null;
  actions?: ReactNode;
}>) {
  const workRow = WORK_ROW_GROUPS.has(group);
  const title = row.unit ? `${row.address}, ${row.unit}` : row.address;
  const leaseHref = row.canOpen
    ? `${buildWorkspaceHref({
        leaseId: row.leaseId,
        ...(workRow && row.nextStep.stepId ? { step: row.nextStep.stepId } : {}),
        deskView: continuation,
      })}${workRow && row.nextStep.controlId ? `#${row.nextStep.controlId}` : ""}`
    : null;
  return (
    <li
      className="renewal-batch-row"
      data-batch-group={group}
      data-batch-lease={row.leaseId}
      data-batch-row-kind={workRow ? "work" : "context"}
    >
      <span className="renewal-batch-row-identity">
        {leaseHref ? (
          // The row's own link covers the row, so choosing anywhere on it opens the lease in
          // this tab; the names beside it are text.
          <Link className="renewal-batch-lease" href={leaseHref} prefetch={false}>
            {title}
          </Link>
        ) : (
          <span className="renewal-batch-lease">{title}</span>
        )}
        <span className="renewal-batch-tenants">
          {row.tenants.length > 0 ? row.tenants.join(", ") : "Tenant names need a check"}
        </span>
      </span>
      <span className="renewal-batch-date">{row.dateLabel}</span>
      {row.dateNote ? (
        <span className="renewal-batch-date-note">{row.dateNote}</span>
      ) : null}
      {workRow ? (
        <span className="renewal-batch-stage">{row.stageLine}</span>
      ) : row.reason ? (
        <span className="renewal-batch-reason">{row.reason}</span>
      ) : null}
      {row.statusNote ? (
        <span className="renewal-batch-status-note">{row.statusNote}</span>
      ) : null}
      {workRow && row.tags.length > 0 ? (
        <ul aria-label="Tags" className="renewal-batch-tags">
          {row.tags.map((tag) => (
            <li className="queue-pill" data-batch-tag={tag.key} key={tag.key}>
              {tag.label}
            </li>
          ))}
        </ul>
      ) : null}
      {leaseHref ? (
        <Link
          className="text-link renewal-batch-next"
          data-batch-next-step="true"
          href={leaseHref}
          prefetch={false}
        >
          {workRow ? row.nextStep.label : "Open the lease"}
        </Link>
      ) : (
        <span className="muted renewal-batch-next">
          Lease record needs a check before it can open
        </span>
      )}
      {actions}
    </li>
  );
}
