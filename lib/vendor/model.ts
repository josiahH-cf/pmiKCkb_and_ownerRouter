import { GMAIL_APPROVED_WORKFLOW_SCOPES } from "@/lib/gmail-runtime/scopes";

export const VENDOR_OAUTH_SCOPES = GMAIL_APPROVED_WORKFLOW_SCOPES;

export type VendorOAuthScope = (typeof VENDOR_OAUTH_SCOPES)[number];

export interface VendorPrincipal {
  uid: string;
  vendorId: string;
  email: string;
  emailVerified: true;
  totpVerified: true;
  sessionIssuedAt: number;
}

export interface VendorRecord {
  id: string;
  uid: string;
  email: string;
  status: "pending_setup" | "active" | "disabled";
  inviteVersion: number;
  createdAt: string;
  updatedAt: string;
  disabledAt?: string;
}

export interface VendorTicketProjection {
  id: string;
  status: string;
  priority: string;
  summary: string;
  unitLabel: string | null;
  updatedAt: string;
}

export interface VendorMailboxConnection {
  vendorId: string;
  mailboxEmail: string;
  provider: "google";
  status: "connected" | "revocation_pending" | "revoked";
  scopes: readonly VendorOAuthScope[];
  tokenSecretRef: string;
  connectedAt: string;
  updatedAt: string;
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
