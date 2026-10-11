"use client";
import {
  WORK_ORDER_PRIMARY_GROUPS,
  WORK_ORDER_PRIORITY_LABELS,
  type WorkOrderDetail,
  type WorkOrderProjection,
  type WorkOrderStatusProjection,
  type VendorTradeProjection,
  type WorkOrderReadField,
} from "@/lib/integrations/rentvine/work-order-contract";
import { formatBusinessTimestamp } from "@/lib/date-display";

const absent = "Not supplied by this read";
function contextText(field: WorkOrderReadField | undefined) {
  if (!field || field.availability === "not_supplied") return absent;
  if (field.availability === "unrecognized")
    return "Unavailable: unrecognized provider format";
  if (field.availability === "blank")
    return "Provider field is blank (not evidence of none)";
  return field.value;
}
export interface RentvineReadback {
  list: { rows: WorkOrderProjection[]; complete: boolean; pages?: number } | null;
  statuses: WorkOrderStatusProjection[];
  trades: VendorTradeProjection[];
}
/** Only the existing typed read is displayed. Source references do not establish a historical tenancy. */
export function RentvineWorkOrderReadback({
  result,
  observedAt,
  detail,
  detailAt,
  busy,
  inspect,
}: {
  result: RentvineReadback;
  observedAt: string;
  detail: WorkOrderDetail | null;
  detailAt: string | null;
  busy: boolean;
  inspect: (id: string) => void;
}) {
  const status = (row: WorkOrderProjection) =>
    `${result.statuses.find((s) => s.workOrderStatusId === row.workOrderStatusId)?.name ?? `Status ${row.workOrderStatusId}`} · ${WORK_ORDER_PRIMARY_GROUPS[row.primaryWorkOrderStatusId] ?? `Unknown group ${row.primaryWorkOrderStatusId}`}`;
  const row = detail?.workOrder;
  return (
    <section className="ui-stack" aria-label="RentVine readback">
      <h3>RentVine readback</h3>
      <p className="muted">
        Observed {formatBusinessTimestamp(observedAt)}. This is a manual source read; it
        does not synchronize Vendoroo history or change PMI&apos;s case status.
      </p>
      {result.list ? (
        <>
          {!result.list.complete ? (
            <p role="note">
              The work-order list is incomplete. A missing row does not establish absence
              or resolution.
            </p>
          ) : null}
          {result.list.rows.length ? (
            <ul className="ui-stack-tight">
              {result.list.rows.map((work) => (
                <li key={work.workOrderId}>
                  <button
                    className="text-link"
                    type="button"
                    disabled={busy}
                    onClick={() => inspect(work.workOrderId)}
                  >
                    Inspect RentVine work order {work.workOrderNumber}
                  </button>
                  <p>{status(work)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p>No matching work orders were returned by this read.</p>
          )}
        </>
      ) : null}
      <details>
        <summary>Status meanings ({result.statuses.length})</summary>
        <ul>
          {result.statuses.map((s) => (
            <li key={s.workOrderStatusId}>
              {s.name} ({s.workOrderStatusId}) ·{" "}
              {WORK_ORDER_PRIMARY_GROUPS[s.primaryWorkOrderStatusId] ??
                `Unknown group ${s.primaryWorkOrderStatusId}`}
            </li>
          ))}
        </ul>
        <p>
          These are RentVine&apos;s account status names and primary groups. They do not
          replace PMI&apos;s final closure decision.
        </p>
      </details>
      {row ? (
        <section aria-label="RentVine work-order detail" className="ui-stack-tight">
          <h4>
            Work order {row.workOrderNumber} · {row.workOrderId}
          </h4>
          <p>{status(row)}</p>
          <p>{row.description}</p>
          <dl className="renewal-focus-context">
            <div>
              <dt>Property reference</dt>
              <dd>{row.propertyId}</dd>
            </div>
            <div>
              <dt>Unit reference</dt>
              <dd>{row.unitId ?? absent}</dd>
            </div>
            <div>
              <dt>Lease reference</dt>
              <dd>{row.leaseId ?? absent}</dd>
            </div>
            <div>
              <dt>Vendor contact reference</dt>
              <dd>{row.vendorContactId ?? absent}</dd>
            </div>
            <div>
              <dt>Vendor trade</dt>
              <dd>
                {row.vendorTradeId
                  ? `${result.trades.find((t) => t.vendorTradeId === row.vendorTradeId)?.name ?? "Trade"} (${row.vendorTradeId})`
                  : absent}
              </dd>
            </div>
            <div>
              <dt>Assigned staff reference</dt>
              <dd>{row.assignedToUserId ?? absent}</dd>
            </div>
            <div>
              <dt>Priority</dt>
              <dd>
                {WORK_ORDER_PRIORITY_LABELS[row.priorityId] ??
                  `Unknown priority ${row.priorityId}`}
              </dd>
            </div>
          </dl>
          <p className="muted">
            Detail observed {formatBusinessTimestamp(detailAt ?? observedAt)}. Missing
            assignments or lease references are unverified, not proof that none exist.
            Review event-date tenancy separately.
          </p>
          <details>
            <summary>Provider timing and summaries</summary>
            <dl className="renewal-focus-context">
              <div>
                <dt>Provider created time</dt>
                <dd>{contextText(detail?.readContext?.createdAt)}</dd>
              </div>
              <div>
                <dt>Provider modified time</dt>
                <dd>{contextText(detail?.readContext?.modifiedAt)}</dd>
              </div>
              <div>
                <dt>Provider closed time</dt>
                <dd>{contextText(detail?.readContext?.closedAt)}</dd>
              </div>
              <div>
                <dt>Closing description</dt>
                <dd>{contextText(detail?.readContext?.closingDescription)}</dd>
              </div>
              <div>
                <dt>Vendor closing comments</dt>
                <dd>{contextText(detail?.readContext?.vendorClosingComments)}</dd>
              </div>
              <div>
                <dt>Diagnostic summary</dt>
                <dd>{contextText(detail?.readContext?.diagnosticSummary)}</dd>
              </div>
              <div>
                <dt>Agent summary</dt>
                <dd>{contextText(detail?.readContext?.agentSummary)}</dd>
              </div>
            </dl>
            <p className="muted">
              Times retain the provider&apos;s supplied representation; its timezone is
              unverified. Summaries and closeout comments do not establish a complete
              communication or troubleshooting history, verified financial evidence, or
              PMI closure. This read is not retained as canonical case history.
            </p>
          </details>
        </section>
      ) : null}
      <p className="muted">
        Complete call history, individual troubleshooting attempts and outcomes, photos,
        escalation events, sentiment and Vendoroo takeover controls are not supplied by
        this read projection. Resident chat synchronization is a separate confirmed action
        that marks manager messages read.
      </p>
    </section>
  );
}
