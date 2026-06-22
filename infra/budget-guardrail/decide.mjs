// Pure decision logic for the budget kill switch — NO GCP SDK, no I/O, unit-testable.
//
// Cloud Billing publishes a budget notification to a Pub/Sub topic when a threshold is crossed.
// This module decodes that notification and decides whether to disable the project's billing. The
// kill switch's ceiling is our own `capUsd` (the durable $10), independent of the budget's display
// name/threshold, so a mis-configured budget can never silently raise the real cap.

export const DEFAULT_CAP_USD = 10;

/**
 * Decode a Cloud Billing budget notification from the event that triggers the function. Handles:
 *  - the 2nd-gen CloudEvent shape: `{ data: { message: { data: "<base64>" } } }`
 *  - the 1st-gen background-event shape: `{ data: "<base64>", attributes }`
 *  - an already-parsed notification object (test convenience).
 */
export function decodeBudgetNotification(event) {
  if (event && typeof event === "object" && "costAmount" in event) {
    return event;
  }

  const base64 =
    event?.data?.message?.data ??
    event?.message?.data ??
    (typeof event?.data === "string" ? event.data : undefined);

  if (typeof base64 !== "string" || base64.trim() === "") {
    throw new Error("Budget notification is missing Pub/Sub message data.");
  }

  return JSON.parse(Buffer.from(base64, "base64").toString("utf8"));
}

/**
 * Decide whether to disable billing. The effective ceiling is the SMALLER of our hard cap and the
 * budget's own amount (when present), so neither a too-high budget nor an unset cap env can let
 * spend run past the intended limit. Returns a structured, side-effect-free decision.
 */
export function decideBillingAction(notification, { capUsd = DEFAULT_CAP_USD } = {}) {
  const costAmount = Number(notification?.costAmount);
  const budgetAmount = Number(notification?.budgetAmount);
  const currencyCode = notification?.currencyCode ?? "USD";
  const cap = Number.isFinite(capUsd) && capUsd > 0 ? capUsd : DEFAULT_CAP_USD;

  if (!Number.isFinite(costAmount)) {
    return {
      disable: false,
      reason: "Notification has no numeric costAmount; taking no action.",
      costAmount: null,
      effectiveCap: cap,
      currencyCode,
    };
  }

  const effectiveCap =
    Number.isFinite(budgetAmount) && budgetAmount > 0 ? Math.min(cap, budgetAmount) : cap;

  if (costAmount >= effectiveCap) {
    return {
      disable: true,
      reason: `costAmount ${costAmount} ${currencyCode} >= cap ${effectiveCap}; disabling billing.`,
      costAmount,
      effectiveCap,
      currencyCode,
    };
  }

  return {
    disable: false,
    reason: `costAmount ${costAmount} ${currencyCode} < cap ${effectiveCap}; no action.`,
    costAmount,
    effectiveCap,
    currencyCode,
  };
}
