// S265 (R-S265-1, ARCH-S265-1): tenant audience evidence for the three tenant renewal resources.
//
// The insurance flyer, the resident benefits package flyer and the renewal information form are
// sent to tenants. A saved link with the old "I checked this destination" box only says staff saw
// the destination; it does not show that a tenant can open the right current document. An Admin
// therefore records, on the same shared entry, the exact link that was checked, the document
// version, the audience (any tenant with the link, or only named recipients), how it was checked,
// what opened, who checked and when, and how long the check holds. The server binds that check to
// the entry's purpose and exact link and gives it a proof identity and version.
//
// A blank entry, a legacy entry (link plus the old box only), a staff sign-in, a sign-in page, a
// different document, a check that did not open, an expired check or a check recorded for another
// link or resource is Source pending for tenant use, with its precise reason. No access model is
// ever inferred from the shape of a link. The legal-form location entries keep their own purpose:
// they never carry tenant evidence and a tenant check never approves them.
//
// Pure and client-safe. Nothing here reads a link, fetches a page or changes sharing.

import { z } from "zod";

import { formatCalendarDate } from "@/lib/date-display";

export const TENANT_RESOURCE_IDS = [
  "insurance_flyer",
  "rbp_flyer",
  "renewal_information_form",
] as const;
export type TenantResourceId = (typeof TENANT_RESOURCE_IDS)[number];

export function isTenantResourceId(id: string): id is TenantResourceId {
  return (TENANT_RESOURCE_IDS as readonly string[]).includes(id);
}

/** The one purpose each tenant entry serves; a check recorded for one never serves another. */
export const TENANT_RESOURCE_PURPOSES = {
  insurance_flyer: "tenant_insurance_flyer",
  rbp_flyer: "tenant_resident_benefits_package_flyer",
  renewal_information_form: "tenant_renewal_information_form",
} as const satisfies Record<TenantResourceId, string>;
export type TenantResourcePurpose = (typeof TENANT_RESOURCE_PURPOSES)[TenantResourceId];

/** Plain words for each purpose, shown with the entry's audience check. */
export const TENANT_RESOURCE_PURPOSE_LABELS: Record<TenantResourceId, string> = {
  insurance_flyer: "Explains an insurance change to tenants in a renewal offer",
  rbp_flyer: "Explains a new or changed resident benefits package to tenants",
  renewal_information_form: "Collects updated tenant information for the renewal",
};

/** How each resource is named inside a message and its notes. */
export const TENANT_RESOURCE_NAMES: Record<TenantResourceId, string> = {
  insurance_flyer: "insurance flyer",
  rbp_flyer: "Resident Benefits Package information",
  renewal_information_form: "renewal information form",
};

/** The notes a message carried before S265 for a link it does not have; kept when no reason is known. */
export const TENANT_RESOURCE_UNSAVED_NOTES: Record<TenantResourceId, string> = {
  insurance_flyer: "The insurance flyer link is not saved yet.",
  rbp_flyer: "The Resident Benefits Package link is not saved yet.",
  renewal_information_form: "The renewal information form link is not saved yet.",
};

/** The one message note for a resource a message needs whose link is not usable for tenants. */
export function tenantResourcePendingMessage(
  id: TenantResourceId,
  reason: string | null | undefined,
): string {
  return reason
    ? `The ${TENANT_RESOURCE_NAMES[id]} link is Source pending. ${reason}`
    : TENANT_RESOURCE_UNSAVED_NOTES[id];
}

/** The message content fields that carry each resource's link. */
export const TENANT_RESOURCE_MESSAGE_FIELDS = {
  insurance_flyer: "insuranceFlyer",
  rbp_flyer: "rbpFlyer",
  renewal_information_form: "informationForm",
} as const satisfies Record<TenantResourceId, string>;
export type TenantResourceMessageField =
  (typeof TENANT_RESOURCE_MESSAGE_FIELDS)[TenantResourceId];

export const TENANT_AUDIENCE_KINDS = ["tenant_wide", "restricted"] as const;
export type TenantAudienceKind = (typeof TENANT_AUDIENCE_KINDS)[number];
export const TENANT_AUDIENCE_LABELS: Record<TenantAudienceKind, string> = {
  tenant_wide: "Any tenant with the link, no sign-in",
  restricted: "Only the named recipients",
};

export const TENANT_CHECK_METHODS = [
  "signed_out_open",
  "sharing_list",
  "staff_sign_in",
] as const;
export type TenantCheckMethod = (typeof TENANT_CHECK_METHODS)[number];
export const TENANT_CHECK_METHOD_LABELS: Record<TenantCheckMethod, string> = {
  signed_out_open: "Opened while signed out",
  sharing_list: "Read the sharing list",
  staff_sign_in: "Opened while signed in as staff",
};

export const TENANT_CHECK_RESULTS = [
  "current_document",
  "sign_in_page",
  "different_document",
  "nothing_opened",
] as const;
export type TenantCheckResult = (typeof TENANT_CHECK_RESULTS)[number];
export const TENANT_CHECK_RESULT_LABELS: Record<TenantCheckResult, string> = {
  current_document: "The current document",
  sign_in_page: "A sign-in page",
  different_document: "A different document",
  nothing_opened: "Nothing",
};

const plainText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (value) => !/[\u0000-\u001f\u007f]|\{\{|\}\}/.test(value),
      "Use plain text without control characters or template markers.",
    );
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a calendar date.")
  .refine(
    (value) =>
      Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
      new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value,
    "Use a calendar date.",
  );
const recipientEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .regex(
    /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/,
    "Enter each recipient's email address.",
  );

const AudienceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("tenant_wide") }).strict(),
  z
    .object({
      kind: z.literal("restricted"),
      recipients: z
        .array(recipientEmail)
        .min(1, "Name each recipient the link is shared with.")
        .max(20)
        .transform((values) => [...new Set(values)].sort()),
    })
    .strict(),
]);
export type TenantAudience = z.infer<typeof AudienceSchema>;

/** What an Admin records for one tenant resource. The server adds the purpose, link and proof. */
export const TenantAccessInputSchema = z
  .object({
    documentVersion: plainText(80),
    audience: AudienceSchema,
    method: z.enum(TENANT_CHECK_METHODS),
    result: z.enum(TENANT_CHECK_RESULTS),
    checkedBy: plainText(120),
    checkedOn: calendarDate,
    validUntil: calendarDate,
  })
  .strict()
  .refine(
    (value) => value.validUntil >= value.checkedOn,
    "The check cannot end before the day it was made.",
  );
export type TenantAccessInput = z.infer<typeof TenantAccessInputSchema>;

/** The stored check, bound by the server to the entry's purpose, exact link and proof. */
export const StoredTenantAccessSchema = z
  .object({
    purpose: z.enum(Object.values(TENANT_RESOURCE_PURPOSES) as [string, ...string[]]),
    destination: z.string().min(1).max(2000),
    documentVersion: plainText(80),
    audience: AudienceSchema,
    method: z.enum(TENANT_CHECK_METHODS),
    result: z.enum(TENANT_CHECK_RESULTS),
    checkedBy: plainText(120),
    checkedOn: calendarDate,
    validUntil: calendarDate,
    proof: z
      .object({
        id: z.string().regex(/^[a-f0-9]{32}$/),
        version: z.number().int().positive(),
      })
      .strict(),
  })
  .strict();
export type StoredTenantAccess = z.infer<typeof StoredTenantAccessSchema>;

/**
 * The exact evidence a reviewed message is bound to for one included resource. Draft export,
 * immediate send and scheduled dispatch compare this whole identity again, never the link or the
 * settings version alone.
 */
export interface FrozenTenantResource {
  readonly id: TenantResourceId;
  readonly purpose: string;
  readonly url: string;
  readonly documentVersion: string;
  readonly audience: TenantAudience;
  readonly proof: { readonly id: string; readonly version: number };
  readonly validUntil: string;
}

/** The minimal shape of a saved entry this projection reads. */
export interface TenantResourceEntryLike {
  readonly id: string;
  readonly url: string;
  readonly verified: boolean;
  readonly tenantAccess?: unknown;
}

export type TenantResourcePendingCode =
  | "unreadable"
  | "blank"
  | "invalid_link"
  | "destination_unchecked"
  | "no_audience_check"
  | "audience_check_unreadable"
  | "link_changed"
  | "purpose_mismatch"
  | "staff_sign_in"
  | "method_mismatch"
  | "check_failed"
  | "not_yet_checked"
  | "expired";

export type TenantResourceUse =
  | {
      readonly state: "usable";
      readonly url: string;
      readonly access: StoredTenantAccess;
      readonly evidence: FrozenTenantResource;
    }
  | {
      readonly state: "source_pending";
      readonly code: TenantResourcePendingCode;
      /** One plain sentence naming why the link is not usable for tenants. */
      readonly reason: string;
      /** The saved link, when there is one, so content that links it is recognized. */
      readonly url: string | null;
    };

export type TenantResourceUses = Readonly<Record<TenantResourceId, TenantResourceUse>>;

/** A syntactically usable customer link: HTTPS, a real host, no credentials, no placeholder. */
export function isUsableTenantLink(url: string): boolean {
  if (!url || /\s/.test(url) || url.length > 2000) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
    return (
      parsed.protocol === "https:" &&
      Boolean(host) &&
      !parsed.username &&
      !parsed.password &&
      !/^(?:localhost|127\.0\.0\.1|\[::1\])$/.test(host) &&
      !/(?:^|\.)(?:example\.(?:com|net|org)|invalid|test|example|localhost)$/.test(host)
    );
  } catch {
    return false;
  }
}

/** Reads a stored check; null when there is none, "invalid" when it cannot be read. */
export function readTenantAccess(
  entry: TenantResourceEntryLike | undefined | null,
): StoredTenantAccess | "invalid" | null {
  if (!entry || entry.tenantAccess === undefined || entry.tenantAccess === null)
    return null;
  const parsed = StoredTenantAccessSchema.safeParse(entry.tenantAccess);
  return parsed.success ? parsed.data : "invalid";
}

const pending = (
  code: TenantResourcePendingCode,
  reason: string,
  url: string | null,
): TenantResourceUse => ({ state: "source_pending", code, reason, url });

export const SETTINGS_UNREADABLE_REASON =
  "The shared resource settings could not be read.";

/**
 * Whether one saved tenant entry can be used for tenants on `todayIso` (a business calendar date),
 * and why not. The check must name this entry's purpose and exact link, show the current document
 * by the method its audience needs, and still hold today.
 */
export function tenantResourceUse(
  id: TenantResourceId,
  entry: TenantResourceEntryLike | undefined | null,
  todayIso: string,
): TenantResourceUse {
  const url = entry?.url?.trim() ? entry.url : null;
  if (!url) return pending("blank", "No link is saved yet.", null);
  if (!isUsableTenantLink(url))
    return pending(
      "invalid_link",
      "The saved link is not a complete HTTPS link a tenant can open.",
      url,
    );
  if (!entry!.verified)
    return pending(
      "destination_unchecked",
      "The saved link's destination is not checked yet.",
      url,
    );
  const access = readTenantAccess(entry);
  if (access === null)
    return pending(
      "no_audience_check",
      "No tenant audience check is recorded for this link.",
      url,
    );
  if (access === "invalid")
    return pending(
      "audience_check_unreadable",
      "The tenant audience check could not be read.",
      url,
    );
  if (access.purpose !== TENANT_RESOURCE_PURPOSES[id])
    return pending(
      "purpose_mismatch",
      "The tenant audience check was recorded for a different resource.",
      url,
    );
  if (access.destination !== url)
    return pending(
      "link_changed",
      "The link changed after its tenant audience check.",
      url,
    );
  if (access.method === "staff_sign_in")
    return pending(
      "staff_sign_in",
      "A check made while signed in as staff does not show that tenants can open it.",
      url,
    );
  if (access.audience.kind === "tenant_wide" && access.method !== "signed_out_open")
    return pending(
      "method_mismatch",
      "A link for any tenant needs a check made while signed out.",
      url,
    );
  if (access.audience.kind === "restricted" && access.method !== "sharing_list")
    return pending(
      "method_mismatch",
      "A link for named recipients needs a check of its sharing list.",
      url,
    );
  if (access.result !== "current_document")
    return pending(
      "check_failed",
      access.result === "sign_in_page"
        ? "The check showed a sign-in page, so tenants cannot open it."
        : access.result === "different_document"
          ? "The check opened a different document."
          : "The link did not open during the check.",
      url,
    );
  if (access.checkedOn > todayIso)
    return pending(
      "not_yet_checked",
      "The tenant audience check date is later than today.",
      url,
    );
  if (access.validUntil < todayIso)
    return pending(
      "expired",
      `The tenant audience check expired on ${formatCalendarDate(access.validUntil)}.`,
      url,
    );
  return {
    state: "usable",
    url,
    access,
    evidence: {
      id,
      purpose: access.purpose,
      url,
      documentVersion: access.documentVersion,
      audience: access.audience,
      proof: { id: access.proof.id, version: access.proof.version },
      validUntil: access.validUntil,
    },
  };
}

/** The three tenant uses from one settings read; null settings make every entry pending. */
export function tenantResourceUses(
  settings: {
    readonly entries: Readonly<Record<string, TenantResourceEntryLike>>;
  } | null,
  todayIso: string,
): TenantResourceUses {
  return Object.fromEntries(
    TENANT_RESOURCE_IDS.map((id) => [
      id,
      settings
        ? tenantResourceUse(id, settings.entries[id], todayIso)
        : pending("unreadable", SETTINGS_UNREADABLE_REASON, null),
    ]),
  ) as unknown as TenantResourceUses;
}

/** Whether a restricted check covers every actual recipient; a tenant-wide check covers all. */
export function tenantAudienceCovers(
  audience: TenantAudience,
  recipients: readonly string[],
): boolean {
  if (audience.kind === "tenant_wide") return true;
  const covered = new Set(audience.recipients.map((value) => value.toLowerCase()));
  return recipients.every((recipient) => covered.has(recipient.trim().toLowerCase()));
}

function canonicalEvidence(value: FrozenTenantResource) {
  return JSON.stringify({
    id: value.id,
    purpose: value.purpose,
    url: value.url,
    documentVersion: value.documentVersion,
    audience:
      value.audience.kind === "tenant_wide"
        ? { kind: "tenant_wide" }
        : {
            kind: "restricted",
            recipients: [...value.audience.recipients]
              .map((recipient) => recipient.toLowerCase())
              .sort(),
          },
    proof: { id: value.proof.id, version: value.proof.version },
    validUntil: value.validUntil,
  });
}

/** The whole bound identity, compared field by field; never the link alone. */
export function sameTenantResourceEvidence(
  left: FrozenTenantResource,
  right: FrozenTenantResource,
): boolean {
  return canonicalEvidence(left) === canonicalEvidence(right);
}

/** A stable source reference for one included resource's exact proof. */
export function tenantResourceSourceRef(evidence: FrozenTenantResource): string {
  return `renewal-resource:${evidence.id}:proof:${evidence.proof.id}:${evidence.proof.version}`;
}

/** Plain words for a usable check, as Connections and the lease summary show it. */
export function describeTenantAccess(access: StoredTenantAccess): string {
  const audience =
    access.audience.kind === "tenant_wide"
      ? TENANT_AUDIENCE_LABELS.tenant_wide
      : `${TENANT_AUDIENCE_LABELS.restricted} (${access.audience.recipients.length})`;
  return `Verified for tenants. Audience: ${audience}. Checked by ${access.checkedBy} on ${formatCalendarDate(access.checkedOn)}, valid until ${formatCalendarDate(access.validUntil)}. Document version ${access.documentVersion}.`;
}

/** The one state line for a tenant entry: verified with its check, or Source pending and why. */
export function describeTenantResourceUse(use: TenantResourceUse): string {
  return use.state === "usable"
    ? describeTenantAccess(use.access)
    : `Source pending. ${use.reason}`;
}

export type FrozenTenantResourceVerdict =
  | { readonly ok: true }
  | {
      readonly ok: false;
      /** "unavailable": the settings could not be read; "changed": the evidence is not current. */
      readonly kind: "changed" | "unavailable";
      readonly resourceId: TenantResourceId;
      readonly message: string;
    };

/** What a refused effect states it did not do. */
export type TenantResourceEffect = "draft" | "send";
const NOTHING_DONE: Record<TenantResourceEffect, string> = {
  draft: "No Gmail draft was created.",
  send: "Nothing was sent.",
};

/**
 * The claim-time check of a reviewed message's included resources against a fresh settings read.
 * Each one must still be usable today, carry exactly the reviewed evidence and, when restricted,
 * cover every actual recipient. A resource the message omits is never read here.
 */
export function checkFrozenTenantResources(
  frozen: readonly FrozenTenantResource[],
  uses: TenantResourceUses | null,
  recipients: readonly string[],
  effect: TenantResourceEffect = "send",
): FrozenTenantResourceVerdict {
  const nothing = NOTHING_DONE[effect];
  for (const reviewed of frozen) {
    const id = reviewed.id;
    if (!isTenantResourceId(id))
      return {
        ok: false,
        kind: "changed",
        resourceId: id,
        message: `A reviewed tenant link is not a recognized resource. ${nothing} Review the message again.`,
      };
    const name = TENANT_RESOURCE_NAMES[id];
    const use = uses?.[id];
    if (!use || (use.state === "source_pending" && use.code === "unreadable"))
      return {
        ok: false,
        kind: "unavailable",
        resourceId: id,
        message: `The ${name} link could not be checked because the shared resource settings could not be read. ${nothing} Try again when they read back.`,
      };
    if (use.state !== "usable")
      return {
        ok: false,
        kind: "changed",
        resourceId: id,
        message: `The ${name} link is Source pending now. ${use.reason} ${nothing} Review the message again after an Admin updates the link in Connections.`,
      };
    if (!sameTenantResourceEvidence(reviewed, use.evidence))
      return {
        ok: false,
        kind: "changed",
        resourceId: id,
        message: `The ${name} link or its tenant audience check changed after this message was reviewed. ${nothing} Review the message again.`,
      };
    if (!tenantAudienceCovers(use.evidence.audience, recipients))
      return {
        ok: false,
        kind: "changed",
        resourceId: id,
        message: `The ${name} link is restricted to named recipients and does not cover everyone this message goes to. ${nothing} Review the recipients or the link's audience.`,
      };
  }
  return { ok: true };
}
