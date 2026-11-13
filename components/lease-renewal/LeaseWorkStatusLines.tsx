import {
  leaseWorkStatusLines,
  type LeaseWorkStatus,
} from "@/lib/lease-renewal/lease-work-status";

/**
 * S232 R-S232-4: the lease status's supporting lines. The desk row and Focus render exactly these
 * from the one projection: both facts and the fix when they disagree, who the lease waits on, and
 * the record the status comes from with its time.
 *
 * S279 R-S279-3: the check appears once on a screen. Where the stage line above already carries it
 * (the lease page's stage header), `showCheck` is false and only the status label says so.
 */
export function LeaseWorkStatusLines({
  status,
  showCheck = true,
}: Readonly<{ status: LeaseWorkStatus; showCheck?: boolean }>) {
  const lines = leaseWorkStatusLines(status);
  return (
    <>
      {showCheck && lines.check ? (
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
