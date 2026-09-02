// S82 destination manifest — every phase, blocker, status, and evidence link type resolves to
// exactly one authenticated internal target or one server-validated external https source.
//
// External rules are exact: the operating Sheet link is built only from the configured spreadsheet
// id; a RentVine link opens externally only when a current source-provided hyperlink's host matches
// the expected tenant and its parsed lease id matches this row; RentCast uses only its
// provider-returned URL elsewhere; Gmail stays workflow-bounded in-app. When no trustworthy
// destination exists the caller renders a non-interactive status plus the internal fallback.

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
