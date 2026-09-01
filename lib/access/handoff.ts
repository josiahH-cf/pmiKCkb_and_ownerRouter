import type { Capability } from "@/lib/auth/roles";
import {
  capabilityCatalogEntry,
  isAccessCapability,
  isAccessSpace,
} from "@/lib/access/catalog";
import type { SpaceScope } from "@/lib/constants";

export const ACCESS_HOME_DESTINATION = {
  destination_key: "access.home",
  label: "Open Access",
  href: "/admin/access",
} as const;

export const ACCESS_REQUEST_DESTINATION = {
  destination_key: "access.request",
  label: "Request access",
} as const;

export const ACCESS_RETURN_DESTINATIONS = [
  { key: "dashboard", path: "/" },
  { key: "my_work", path: "/work" },
  { key: "approval_queue", path: "/approval-queue" },
  { key: "connections", path: "/connections" },
  { key: "communications", path: "/gmail-hub" },
  { key: "internal_processes", path: "/spaces" },
  { key: "maintenance", path: "/maintenance" },
  { key: "admin", path: "/admin" },
  { key: "renewal_desk", path: "/lease-renewal/live/desk" },
] as const;

const MAX_RETURN_BYTES = 32_768;
const WORKSPACE_PREFIX = "/lease-renewal/live/desk/lease/";
const STABLE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function buildAccessHomeHref() {
  return ACCESS_HOME_DESTINATION.href;
}

export function buildRenewalWorkspaceReturnTarget(stableId: string) {
  if (!STABLE_ID_PATTERN.test(stableId)) {
    throw new Error("Invalid renewal workspace stable id.");
  }
  return `${WORKSPACE_PREFIX}${encodeURIComponent(stableId)}`;
}

export function validateAccessReturnTarget(value: string): string {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    value.includes("?") ||
    value.includes("#") ||
    /[\u0000-\u001f\u007f]/u.test(value) ||
    new TextEncoder().encode(value).byteLength > MAX_RETURN_BYTES
  ) {
    throw new Error("This is not an allowed access return destination.");
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new Error("This is not an allowed access return destination.");
  }
  if (decoded.includes("..") || decoded.includes("\\") || decoded.includes("//")) {
    throw new Error("This is not an allowed access return destination.");
  }

  if (ACCESS_RETURN_DESTINATIONS.some((destination) => destination.path === value)) {
    return value;
  }
  if (value.startsWith(WORKSPACE_PREFIX)) {
    const segment = value.slice(WORKSPACE_PREFIX.length);
    if (
      STABLE_ID_PATTERN.test(segment) &&
      value === buildRenewalWorkspaceReturnTarget(segment)
    ) {
      return value;
    }
  }
  throw new Error("This is not an allowed access return destination.");
}

export function buildAccessRequestHref(input: {
  capability: Capability;
  space?: SpaceScope;
  returnTo?: string;
}): string {
  if (!isAccessCapability(input.capability)) {
    throw new Error("Unknown access capability.");
  }
  const entry = capabilityCatalogEntry(input.capability);
  if (input.space !== undefined) {
    if (!isAccessSpace(input.space) || !entry.namedSpaceRequestable) {
      throw new Error("This capability and Space cannot be requested together.");
    }
  }
  const params = new URLSearchParams();
  params.set("v", "1");
  params.set("capability", input.capability);
  if (input.space) params.set("space", input.space);
  if (input.returnTo) params.set("return_to", validateAccessReturnTarget(input.returnTo));
  return `/admin/access?${params.toString()}`;
}
