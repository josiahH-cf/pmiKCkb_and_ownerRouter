// Budget kill-switch handler. Decodes the Cloud Billing budget notification, decides via the pure
// logic in decide.mjs, and — only when over cap — DISABLES the project's billing by clearing its
// billing account association (the standard, documented GCP pattern). Billing access is injected so
// the full path is testable without the GCP SDK or any live call.

import {
  DEFAULT_CAP_USD,
  decideBillingAction,
  decodeBudgetNotification,
} from "./decide.mjs";

// The real client is imported lazily so tests (which inject a mock) need no @google-cloud/billing.
async function defaultGetBillingClient() {
  const { CloudBillingClient } = await import("@google-cloud/billing");
  return new CloudBillingClient();
}

/**
 * Handle one budget notification. Returns a structured result describing what was done. Disabling
 * billing is irreversible-by-automation (re-enabling is a deliberate human action), so this only
 * acts when cost has actually reached the cap and billing is still enabled.
 */
export async function handleBudgetEvent(event, options = {}) {
  const {
    getBillingClient = defaultGetBillingClient,
    projectId = process.env.KILL_SWITCH_PROJECT_ID ?? process.env.GCP_PROJECT_ID,
    capUsd = Number(process.env.KILL_SWITCH_CAP_USD ?? DEFAULT_CAP_USD),
    logger = console,
  } = options;

  if (!projectId) {
    throw new Error("KILL_SWITCH_PROJECT_ID (or GCP_PROJECT_ID) must be set.");
  }

  const notification = decodeBudgetNotification(event);
  const decision = decideBillingAction(notification, { capUsd });
  logger.log(`[budget-guardrail] ${decision.reason}`);

  if (!decision.disable) {
    return { disabled: false, decision };
  }

  const billing = await getBillingClient();
  const name = `projects/${projectId}`;
  const [info] = await billing.getProjectBillingInfo({ name });

  if (!info?.billingEnabled) {
    logger.log(`[budget-guardrail] Billing already disabled for ${name}; no action.`);
    return { disabled: false, alreadyDisabled: true, decision };
  }

  // Clearing billingAccountName detaches the billing account, which stops all billable usage.
  await billing.updateProjectBillingInfo({
    name,
    projectBillingInfo: { billingAccountName: "" },
  });
  logger.warn(
    `[budget-guardrail] DISABLED billing for ${name} (cost ${decision.costAmount} >= cap ${decision.effectiveCap}).`,
  );

  return { disabled: true, decision };
}
