const LIVE_RENEWAL_REVIEW_ROUTE = "/lease-renewal/live";

/**
 * Stable fragment identity for the exact reconciliation item rendered by Live review. Source
 * trigger keys are server-generated; punctuation is normalized so the result is safe as a DOM id.
 */
export function liveRenewalReviewItemId(sourceTriggerKey: string): string | null {
  const key = sourceTriggerKey.trim();
  if (key === "" || key.length > 300) return null;
  return `renewal-review-item-${key.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

export function buildLiveRenewalReviewItemHref(sourceTriggerKey: string): string | null {
  const id = liveRenewalReviewItemId(sourceTriggerKey);
  return id ? `${LIVE_RENEWAL_REVIEW_ROUTE}#${id}` : null;
}
