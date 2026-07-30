import { GMAIL_APPROVED_WORKFLOW_SCOPES } from "@/lib/gmail-runtime/scopes";
import {
  requireExplicitDataMode,
  resolveStoredDataMode,
  type DataMode,
} from "@/lib/data-mode";

export const VENDOR_OAUTH_SCOPES = GMAIL_APPROVED_WORKFLOW_SCOPES;

export type VendorOAuthScope = (typeof VENDOR_OAUTH_SCOPES)[number];

export interface VendorPrincipal {
  uid: string;
  vendorId: string;
  email: string;
  emailVerified: true;
  totpVerified: true;
  sessionIssuedAt: number;
  /** Missing only on legacy typed fixtures; authenticated sessions always set it. */
  dataMode?: DataMode;
}

export interface VendorRecord {
  id: string;
  uid: string;
  email: string;
  status: "pending_setup" | "active" | "disabled";
  inviteVersion: number;
  /** Legacy records without this field are treated as live. */
  data_mode?: DataMode;
  displayName?: string;
  identityState?: {
    emailVerified: boolean;
    totpRequired: true;
    totpVerified: boolean;
  };
  createdAt: string;
  updatedAt: string;
  activatedAt?: string;
  disabledAt?: string;
}

export interface VendorTicketProjection {
  id: string;
  status: string;
  priority: string;
  summary: string;
  unitLabel: string | null;
  updatedAt: string;
  dataMode?: DataMode;
}

export interface VendorMailboxConnection {
  vendorId: string;
  mailboxEmail: string;
  provider: "google";
  status: "connected" | "revocation_pending" | "revoked";
  scopes: readonly VendorOAuthScope[];
  tokenSecretRef: string;
  dataMode?: DataMode;
  connectedAt: string;
  updatedAt: string;
}

/**
 * S40 (AC-S40-1): an authenticated Vendor principal always carries an explicit lane, because
 * validateVendorClaims refuses a missing or unknown `data_mode` claim. A principal without one is a
 * malformed fixture, not a Live Vendor, so it is refused instead of resolved to Live.
 */
export function vendorPrincipalDataMode(principal: VendorPrincipal): DataMode {
  return requireExplicitDataMode(principal.dataMode);
}

export function vendorRecordDataMode(record: VendorRecord): DataMode {
  return resolveStoredDataMode(record);
}

export function assertLiveVendorPrincipal(
  principal: VendorPrincipal,
  capability: string,
) {
  if (vendorPrincipalDataMode(principal) === "test") {
    throw new VendorBoundaryError(
      `${capability} cannot use an external provider from the Test workspace.`,
      403,
    );
  }
}

export interface VendorBodylessAudit {
  actorUid: string;
  vendorId: string;
  action: string;
  ticketId?: string;
  mailboxKey?: string;
  reasonHash?: string;
  createdAt: string;
}

export class VendorBoundaryError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 401 | 403 | 404 | 409 | 503,
  ) {
    super(message);
    this.name = "VendorBoundaryError";
  }
}
