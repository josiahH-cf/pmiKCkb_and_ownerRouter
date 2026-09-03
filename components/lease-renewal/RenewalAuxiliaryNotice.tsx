import { Card } from "@/components/ui";
import type {
  RenewalAuxiliaryReadKey,
  RenewalAuxiliaryReadStatus,
} from "@/lib/lease-renewal/auxiliary-read";

export interface RenewalAuxiliaryFailure {
  key: RenewalAuxiliaryReadKey;
  status: Exclude<RenewalAuxiliaryReadStatus, "available">;
}

const LABELS: Record<RenewalAuxiliaryReadKey, string> = {
  progress: "saved renewal progress",
  packet: "document packet status",
  notice_policy: "notice timing policy",
  communications: "linked communication status",
  dismissed_attention: "follow-up attention state",
  resolutions: "saved source resolutions",
  rent_suggestion: "approved rent suggestion",
  comp_screenshot: "comparable-rent screenshot status",
  dispositions: "source discrepancy decisions",
  rentvine_proposal: "RentVine update proposal status",
  sheet_proposal: "renewal Sheet update proposal status",
  sheet_effect_status: "renewal Sheet action status",
};

export function RenewalAuxiliaryNotice({
  failures,
  compact = false,
}: Readonly<{
  failures: readonly RenewalAuxiliaryFailure[];
  compact?: boolean;
}>) {
  if (failures.length === 0) return null;
  const content = (
    <div aria-atomic="true" role="status">
      <p className="muted">
        {compact
          ? "This supporting status is temporarily unavailable. Dependent actions are paused."
          : "Some supporting renewal information could not be verified. The lease data remains visible, but affected actions are paused rather than treating the missing read as an empty result."}
      </p>
      {compact ? null : (
        <ul className="renewal-auxiliary-failures">
          {failures.map((failure) => (
            <li key={failure.key}>
              {LABELS[failure.key]}: {statusLabel(failure.status)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
  return compact ? (
    content
  ) : (
    <Card title="Supporting information unavailable">{content}</Card>
  );
}

function statusLabel(status: Exclude<RenewalAuxiliaryReadStatus, "available">): string {
  if (status === "forbidden") return "not available for this role";
  if (status === "unavailable") return "not configured or not present";
  return "read did not complete";
}
