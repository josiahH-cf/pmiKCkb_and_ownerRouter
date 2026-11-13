import { EditableLayerError } from "@/lib/errors/editable-layer-error";
import type { LiveReviewStatus } from "@/lib/lease-renewal/live-review";
import type { RenewalRunView } from "@/lib/lease-renewal/run-view";

export type RenewalReviewSourceStatus =
  | "available"
  | "stale"
  | "expired"
  | Exclude<LiveReviewStatus, "ok">;

const SOURCE_MESSAGES = {
  // S280 R-S280-4: the earlier stale sentence is removed. A stale read keeps its rows with their
  // read time on the Dashboard (`retained` below); this text remains only for other consumers.
  stale:
    "Renewal data is older than its freshness limit. Refresh to read it again before deciding.",
  expired:
    "The retained renewal source has expired. A successful current source read is required before reporting decisions.",
  not_configured:
    "A required renewal source is not configured. Check the specific connection before retrying.",
  account_mismatch:
    "The renewal source account does not match the configured managed account. Check that connection's identity.",
  auth_error:
    "A renewal source could not authenticate. Inspect the connection's actual authentication result before requesting enrollment.",
  permission_error:
    "A renewal resource read was refused. Check the exact resource permission; another sign-in is not an established remedy.",
  read_error:
    "A renewal source read did not complete. Current decisions are unknown; retry the owning read without treating retained rows as fresh.",
} as const;

export interface RenewalReviewReadIssue {
  code:
    | `source_${Exclude<RenewalReviewSourceStatus, "available">}`
    | "overlay_unavailable";
  message: string;
  sourceReadAtIso: string | null;
  overlayUnavailable: boolean;
}

/**
 * S280 R-S280-4 (ARCH-S280-3): the last renewal rows of a read older than its freshness limit, kept
 * with their read time. Information until the existing current read; never decision authority.
 */
export interface RetainedRenewalViews {
  readonly views: readonly RenewalRunView[];
  readonly readAtIso: string | null;
}

/** Fixed, value-free diagnostics. Never copy a provider exception or customer source content. */
export class RenewalReviewUnavailableError extends EditableLayerError {
  readonly issue: RenewalReviewReadIssue;
  /** S280: present only for a stale or expired source whose saved decisions were read. */
  readonly retained?: RetainedRenewalViews;
  constructor(context: {
    sourceStatus: RenewalReviewSourceStatus;
    overlayStatus: "available" | "unavailable";
    sourceReadAtIso?: string;
    /** S280: the views the stale or expired read produced, kept as retained rows. */
    views?: readonly RenewalRunView[];
  }) {
    const overlayUnavailable = context.overlayStatus === "unavailable";
    const sourceUnavailable = context.sourceStatus !== "available";
    const message = sourceUnavailable
      ? SOURCE_MESSAGES[
          context.sourceStatus as Exclude<RenewalReviewSourceStatus, "available">
        ] + (overlayUnavailable ? " Saved decisions also could not be read." : "")
      : "Saved renewal decisions could not be read. The source read succeeded, but current decision coverage is unknown.";
    super(message, 409);
    this.name = "RenewalReviewUnavailableError";
    this.issue = {
      code: sourceUnavailable
        ? `source_${context.sourceStatus as Exclude<RenewalReviewSourceStatus, "available">}`
        : "overlay_unavailable",
      message,
      sourceReadAtIso:
        context.sourceReadAtIso && Number.isFinite(Date.parse(context.sourceReadAtIso))
          ? new Date(context.sourceReadAtIso).toISOString()
          : null,
      overlayUnavailable,
    };
    if (
      (context.sourceStatus === "stale" || context.sourceStatus === "expired") &&
      !overlayUnavailable &&
      context.views
    )
      this.retained = { views: context.views, readAtIso: this.issue.sourceReadAtIso };
  }
}
