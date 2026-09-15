// S82 destination manifest — every phase, blocker, status, and evidence link type resolves to
// exactly one authenticated internal target or one server-validated external https source.
//
// Table source links validate the current Sheet hyperlink against the configured tenant and lease.
// Message actions use observed provider UI routes with current source record IDs; Gmail Drafts
// selects the current managed sender. Unknown identities never become a homepage or guessed link.
// The operating Sheet uses its configured ID; RentCast links use provider-returned URLs.

import { parseRentvineRef } from "@/lib/lease-renewal/rentvine-link";
import type { RenewalProcessStepId } from "@/lib/lease-renewal/renewal-process";
import {
  buildWorkspaceHref,
  type WorkspaceHrefInput,
} from "@/lib/lease-renewal/desk-view-continuation";

export interface ExternalDeskDestination {
  readonly kind: "external";
  readonly href: string;
  /** Visible destination description, e.g. `Opens the operating renewal Sheet in a new tab.` */
  readonly label: string;
}

export interface InternalDeskDestination {
  readonly kind: "internal";
  readonly href: string;
}

export type ResolvedDeskDestination = ExternalDeskDestination | InternalDeskDestination;

/** The configured operating renewal Sheet, or null when unconfigured (caller falls back in-app). */
export function buildOperatingSheetDestination(
  spreadsheetId: string | undefined,
): ExternalDeskDestination | null {
  const id = spreadsheetId?.trim();
  // Reject anything that could break out of the path segment; the id is config, not caller input.
  if (!id || !/^[A-Za-z0-9_-]{20,128}$/.test(id)) return null;
  return {
    kind: "external",
    href: `https://docs.google.com/spreadsheets/d/${id}`,
    label: "Opens the operating renewal Sheet in a new tab.",
  };
}

/** Exact metadata-resolved tab/row/column. Unknown coordinates keep the caller in the comparison. */
export function buildOperatingSheetCellDestination(input: {
  spreadsheetId: string | undefined;
  tabId: number | null | undefined;
  rowNumber: number | null | undefined;
  columnIndex?: number;
}): ExternalDeskDestination | null {
  const base = buildOperatingSheetDestination(input.spreadsheetId);
  if (
    !base ||
    input.tabId == null ||
    !Number.isInteger(input.tabId) ||
    input.tabId < 0 ||
    input.rowNumber == null ||
    !Number.isInteger(input.rowNumber) ||
    input.rowNumber < 2
  )
    return null;
  let range = `${input.rowNumber}:${input.rowNumber}`;
  if (input.columnIndex !== undefined) {
    if (
      !Number.isInteger(input.columnIndex) ||
      input.columnIndex < 0 ||
      input.columnIndex > 59
    )
      return null;
    let number = input.columnIndex + 1,
      letters = "";
    while (number > 0) {
      letters = String.fromCharCode(65 + ((number - 1) % 26)) + letters;
      number = Math.floor((number - 1) / 26);
    }
    range = `${letters}${input.rowNumber}`;
  }
  return {
    ...base,
    href: `${base.href}/edit#gid=${input.tabId}&range=${encodeURIComponent(range)}`,
    label: "Opens this lease’s matched operating Sheet location in a new tab.",
  };
}

export interface RentvineDestinationInput {
  /** A current source-provided hyperlink (e.g. the Sheet row's RentVine link); never guessed. */
  readonly sourceUrl: string | null | undefined;
  /** The expected RentVine tenant host, derived from configuration (e.g. api base URL host). */
  readonly expectedHost: string | null | undefined;
  readonly leaseId: string;
}

/**
 * A trusted external RentVine destination, or null so the caller uses the in-app comparison. The
 * hyperlink must be https on the exact expected tenant host and must parse to this row's lease id.
 */
export function buildRentvineDestination(
  input: RentvineDestinationInput,
): ExternalDeskDestination | null {
  const raw = input.sourceUrl?.trim();
  const expectedHost = input.expectedHost?.trim().toLowerCase();
  if (!raw || !expectedHost) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (url.hostname.toLowerCase() !== expectedHost) return null;
  const ref = parseRentvineRef(raw);
  if (!ref?.leaseId || ref.leaseId !== input.leaseId) return null;
  return {
    kind: "external",
    href: url.toString(),
    label: "Opens this lease in RentVine in a new tab.",
  };
}

/** Derive the expected RentVine dashboard host from the configured API base URL. */
export function expectedRentvineHost(apiBaseUrl: string | undefined): string | null {
  const raw = apiBaseUrl?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** One workspace-phase link carrying the desk-view continuation. */
export function resolveWorkspacePhaseHref(
  input: Omit<WorkspaceHrefInput, "step"> & { stepId: RenewalProcessStepId },
): string {
  return buildWorkspaceHref({
    leaseId: input.leaseId,
    step: input.stepId,
    deskView: input.deskView,
  });
}

export const EXTERNAL_LINK_REL = "noopener noreferrer";
export const EXTERNAL_LINK_TARGET = "_blank";

/** Provider UI routes read back on 2026-09-15. IDs must come from the current lease/owner roster. */
export function buildRentvineRecordDestination(input: {
  expectedHost: string | null | undefined;
  recordId: string | null | undefined;
  recordType: "lease" | "owner";
  messages?: boolean;
}): ExternalDeskDestination | null {
  const host = input.expectedHost?.trim().toLowerCase();
  const id = input.recordId?.trim();
  if (!host || !/^[a-z0-9-]+\.rentvine\.com$/.test(host) || !id || !/^[1-9]\d*$/.test(id))
    return null;
  const path = input.recordType === "lease" ? "leases" : "contacts/owners";
  const url = new URL(`https://${host}/${path}/${id}`);
  if (input.messages) {
    url.searchParams.set("page", "1");
    url.searchParams.set("tab", "messages");
  }
  return {
    kind: "external",
    href: url.toString(),
    label: `Opens this ${input.recordType}${input.messages ? "’s messages" : ""} in RentVine in a new tab.`,
  };
}

/** Gmail account selection and Drafts route verified in the managed mailbox on 2026-09-15. */
export function buildManagedGmailDraftsDestination(
  senderEmail: string,
): ExternalDeskDestination | null {
  const email = senderEmail.trim().toLowerCase();
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@pmikcmetro\.com$/.test(email)) return null;
  return {
    kind: "external",
    href: `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(email)}#drafts`,
    label: "Opens Drafts in the displayed managed Gmail mailbox in a new tab.",
  };
}
