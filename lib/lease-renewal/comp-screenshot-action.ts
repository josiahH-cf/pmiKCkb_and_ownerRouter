// Renewal comp-screenshot Drive action gate view (S28a). Mirrors lib/maintenance/photo-action.ts exactly:
// the comp-screenshot upload rides its OWN Action Registry gate (google_drive.renewal_comp_screenshot.store)
// so it can be authorized independently of the maintenance photo action, reusing the same proven Drive
// image-store seam. D31 reuses the dedicated maintenance folder unless an explicit renewal override is
// configured. The key stays closed until the full action contract is built and its reviewed flip lands.

import type { CreateActionRegistryInput } from "@/lib/firestore/schemas";
import { isActionExecutable } from "@/lib/integrations/action-gate";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";

export const RENEWAL_COMP_SCREENSHOT_ACTION_KEY =
  "google_drive.renewal_comp_screenshot.store";
export const RENEWAL_COMP_SCREENSHOT_TARGET_LABEL =
  "PMI KC in-boundary Drive image folder";
export const RENEWAL_COMP_SCREENSHOT_CLOSED_MESSAGE =
  "Screenshot storage is not available yet. Continue without a screenshot.";

export interface RenewalCompScreenshotActionView {
  actionKey: typeof RENEWAL_COMP_SCREENSHOT_ACTION_KEY;
  executable: boolean;
  message: string;
  targetLabel: string;
}

export interface RenewalCompScreenshotClosedResponse {
  action_key: typeof RENEWAL_COMP_SCREENSHOT_ACTION_KEY;
  error: string;
  error_type: "action_not_production_allowed";
}

export function getRenewalCompScreenshotActionView(
  registry: CreateActionRegistryInput[] = ACTION_REGISTRY_SEED,
): RenewalCompScreenshotActionView {
  const executable = isActionExecutable(RENEWAL_COMP_SCREENSHOT_ACTION_KEY, registry);
  return {
    actionKey: RENEWAL_COMP_SCREENSHOT_ACTION_KEY,
    executable,
    message: executable
      ? "Review the file name, type, and in-boundary target before uploading."
      : RENEWAL_COMP_SCREENSHOT_CLOSED_MESSAGE,
    targetLabel: RENEWAL_COMP_SCREENSHOT_TARGET_LABEL,
  };
}

export function renewalCompScreenshotClosedResponse(): RenewalCompScreenshotClosedResponse {
  return {
    action_key: RENEWAL_COMP_SCREENSHOT_ACTION_KEY,
    error: RENEWAL_COMP_SCREENSHOT_CLOSED_MESSAGE,
    error_type: "action_not_production_allowed",
  };
}
