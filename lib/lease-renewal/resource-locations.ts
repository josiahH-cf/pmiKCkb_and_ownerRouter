import { z } from "zod";
import { LEASE_ARTIFACT_FAMILIES } from "@/lib/lease-documents/artifact-catalog";
import {
  TenantAccessInputSchema,
  isTenantResourceId,
  type StoredTenantAccess,
} from "@/lib/lease-renewal/tenant-resource-evidence";

export const RENEWAL_RESOURCE_FIELDS = [
  { id: "insurance_flyer", label: "Insurance flyer", kind: "information" },
  { id: "rbp_flyer", label: "Resident benefits package flyer", kind: "information" },
  {
    id: "renewal_information_form",
    label: "Renewal information form",
    kind: "information",
  },
  ...LEASE_ARTIFACT_FAMILIES.map((artifact) => ({
    id: artifact.kind,
    label: `${artifact.label} location`,
    kind: "legal",
  })),
] as const;
const ResourceIdSchema = z
  .string()
  .refine(
    (id) => RENEWAL_RESOURCE_FIELDS.some((field) => field.id === id),
    "Choose a recognized renewal resource.",
  );
export const RenewalResourceInputSchema = z
  .object({
    id: ResourceIdSchema,
    url: z
      .string()
      .trim()
      .max(2000)
      .refine((value) => {
        if (value === "") return true;
        try {
          const url = new URL(value);
          return (
            url.protocol === "https:" &&
            Boolean(url.hostname) &&
            !url.username &&
            !url.password &&
            !/\s/.test(value)
          );
        } catch {
          return false;
        }
      }, "Enter a complete HTTPS link without a username or password, or leave it blank."),
    verified: z.boolean(),
    /**
     * S265: the tenant audience check for the three tenant entries. Absent or null keeps the link
     * Source pending for tenant use; the server binds a recorded check to the entry's purpose and
     * exact link and assigns its proof.
     */
    tenantAccess: TenantAccessInputSchema.nullable().optional(),
  })
  .strict()
  .refine(
    (value) => value.url !== "" || !value.verified,
    "An empty resource cannot be verified.",
  )
  .refine(
    (value) => !value.tenantAccess || isTenantResourceId(value.id),
    "A legal-form location keeps its own purpose and carries no tenant audience check.",
  )
  .refine(
    (value) => !value.tenantAccess || (value.url !== "" && value.verified),
    "Save the link and tick I checked this destination and its intended use before recording a tenant audience check.",
  )
  .refine((value) => {
    if (!value.verified) return true;
    try {
      const host = new URL(value.url).hostname.toLowerCase().replace(/\.$/, "");
      return (
        !/^(?:localhost|127\.0\.0\.1|\[::1\])$/.test(host) &&
        !/(?:^|\.)(?:example\.(?:com|net|org)|invalid|test|example|localhost)$/.test(host)
      );
    } catch {
      return false;
    }
  }, "A placeholder or local-only URL cannot be verified as a customer resource. Leave the box blank until its real destination is available.");
export type RenewalResourceInput = z.infer<typeof RenewalResourceInputSchema>;
export type RenewalResourceEntry = Omit<RenewalResourceInput, "tenantAccess"> & {
  recordedAt: string;
  recordedByUid: string;
  /** S265: the stored check, read through `readTenantAccess`; absent on legacy entries. */
  tenantAccess?: StoredTenantAccess;
};
export const RenewalResourceSettingsSchema = z
  .object({
    version: z.number().int().min(0),
    entries: z.record(
      z.string(),
      z
        .object({
          id: ResourceIdSchema,
          url: z.string(),
          verified: z.boolean(),
          recordedAt: z.string().datetime(),
          recordedByUid: z.string().min(1),
          // S265: validated where it is used, so one unreadable check pends only its own entry
          // instead of making every saved link unreadable.
          tenantAccess: z.unknown().optional(),
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((value, ctx) => {
    for (const [key, entry] of Object.entries(value.entries))
      if (
        key !== entry.id ||
        !RenewalResourceInputSchema.safeParse({
          id: entry.id,
          url: entry.url,
          verified: entry.verified,
        }).success
      )
        ctx.addIssue({
          code: "custom",
          message: "Stored renewal resource needs review.",
        });
  });
export type RenewalResourceSettings = z.infer<typeof RenewalResourceSettingsSchema>;
export const SaveRenewalResourceSchema = z
  .object({
    resource: RenewalResourceInputSchema,
    expectedVersion: z.number().int().min(0),
    operationId: z.string().uuid(),
  })
  .strict();
/**
 * A saved location is not approved legal content; resource consumers still resolve applicability.
 * S265: this is the staff-checked location for an entry's own purpose. The three tenant entries
 * are never usable through it: tenant use needs the audience check (`tenantResourceUse`), so the
 * old checkbox alone cannot put a link in a tenant message.
 */
export function usableRenewalResourceUrl(
  resource: Pick<RenewalResourceInput, "id" | "url" | "verified"> | undefined,
): string | null {
  return resource &&
    !isTenantResourceId(resource.id) &&
    resource.verified &&
    resource.url &&
    RenewalResourceInputSchema.safeParse({
      id: resource.id,
      url: resource.url,
      verified: resource.verified,
    }).success
    ? resource.url
    : null;
}
