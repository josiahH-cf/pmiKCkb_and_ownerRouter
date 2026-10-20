import { EditableLayerError } from "@/lib/errors/editable-layer-error";

/** Fixed, customer-free reasons for a refused notice admission, never provider error bodies. */
export type RenewalNoticeSourceReason =
  | "lease_unavailable"
  | "lease_not_admitted"
  | "status_not_admitted"
  | "status_unavailable"
  | "lease_not_current"
  | "status_not_current"
  | "lease_minimum_advanced"
  | "status_minimum_advanced"
  | "replacement_limit"
  | "source_before_write";

export class RenewalNoticeSourceError extends EditableLayerError {
  readonly code = "renewal_notice_source_unavailable";

  constructor(public readonly reason: RenewalNoticeSourceReason) {
    super(
      reason === "lease_unavailable"
        ? "Current lease facts could not be read. Saved wording is kept. Reconnect or refresh the lease source before preparing this message."
        : "Current notice evidence could not be verified. Saved wording is kept. Refresh the lease source and review again before creating a draft or recording approval.",
      409,
    );
    this.name = "RenewalNoticeSourceError";
  }
}
