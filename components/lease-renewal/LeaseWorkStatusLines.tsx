import {
  leaseWorkStatusLines,
  type LeaseWorkStatus,
} from "@/lib/lease-renewal/lease-work-status";

/**
 * S232 R-S232-4: the lease status's supporting lines. The desk row and Focus render exactly these
 * from the one projection: both waiting facts when they disagree, who the lease waits on, and the
 * record the status comes from with its time.
 */
export function LeaseWorkStatusLines({ status }: Readonly<{ status: LeaseWorkStatus }>) {
  const lines = leaseWorkStatusLines(status);
  return (
    <>
      {lines.check ? (
        <span className="renewal-td-secondary" data-renewal-field="status-check">
          {lines.check}
        </span>
      ) : null}
      {lines.waiting ? (
        <span className="renewal-td-secondary" data-renewal-field="waiting-on">
          {lines.waiting}
        </span>
      ) : null}
      <span
        className="renewal-td-secondary"
        data-renewal-field="status-evidence"
        data-status-evidence={status.evidence.source}
      >
        {lines.evidence}
      </span>
    </>
  );
}
