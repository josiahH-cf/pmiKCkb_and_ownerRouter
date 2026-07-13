import type { CreateActionRegistryInput } from "@/lib/firestore/schemas";
import { isActionExecutable } from "@/lib/integrations/action-gate";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";

export const MAINTENANCE_PHOTO_ACTION_KEY = "google_drive.maintenance_photo.store";
export const MAINTENANCE_PHOTO_TARGET_LABEL =
  "PMI KC in-boundary maintenance photo folder";
export const MAINTENANCE_PHOTO_CLOSED_MESSAGE =
  "Photo storage is unavailable until the Drive action has owner-approved permission. Continue without a photo.";

export interface MaintenancePhotoActionView {
  actionKey: typeof MAINTENANCE_PHOTO_ACTION_KEY;
  executable: boolean;
  message: string;
  targetLabel: string;
}

export interface MaintenancePhotoClosedResponse {
  action_key: typeof MAINTENANCE_PHOTO_ACTION_KEY;
  error: string;
  error_type: "action_not_production_allowed";
}

export function getMaintenancePhotoActionView(
  registry: CreateActionRegistryInput[] = ACTION_REGISTRY_SEED,
): MaintenancePhotoActionView {
  const executable = isActionExecutable(MAINTENANCE_PHOTO_ACTION_KEY, registry);
  return {
    actionKey: MAINTENANCE_PHOTO_ACTION_KEY,
    executable,
    message: executable
      ? "Review the file name, type, and in-boundary target before uploading."
      : MAINTENANCE_PHOTO_CLOSED_MESSAGE,
    targetLabel: MAINTENANCE_PHOTO_TARGET_LABEL,
  };
}

export function maintenancePhotoClosedResponse(): MaintenancePhotoClosedResponse {
  return {
    action_key: MAINTENANCE_PHOTO_ACTION_KEY,
    error: MAINTENANCE_PHOTO_CLOSED_MESSAGE,
    error_type: "action_not_production_allowed",
  };
}
