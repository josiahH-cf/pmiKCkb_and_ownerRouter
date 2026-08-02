import {
  isLiveReadOnlyContext,
  requireEnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import type { DataMode } from "@/lib/data-mode";

interface VendorPortalPrincipal {
  readonly dataMode?: DataMode;
  readonly email: string;
  readonly uid: string;
  readonly vendorId: string;
}

export interface VendorPortalAccessRepository {
  activateVendor(
    vendorId: string,
    uid: string,
    email: string,
    nowIso: string,
    dataMode: DataMode,
  ): Promise<boolean>;
  isVendorActive(
    vendorId: string,
    uid: string,
    email: string,
    dataMode?: DataMode,
  ): Promise<boolean>;
}

/**
 * Vendor portal GETs historically completed the pending→active transition. Local rehearsal may
 * inspect an already-active Live vendor, but it must never make that transition. Production and
 * Demo-owned data retain the existing activation behavior.
 */
export async function confirmVendorPortalAccess(
  principal: VendorPortalPrincipal,
  store: VendorPortalAccessRepository,
  env: Record<string, string | undefined> = process.env,
  nowIso = new Date().toISOString(),
) {
  const descriptor = requireEnvironmentDescriptor(env);
  const dataMode = principal.dataMode ?? "live";

  if (isLiveReadOnlyContext(descriptor)) {
    return await store.isVendorActive(
      principal.vendorId,
      principal.uid,
      principal.email,
      dataMode,
    );
  }

  return await store.activateVendor(
    principal.vendorId,
    principal.uid,
    principal.email,
    nowIso,
    dataMode,
  );
}
