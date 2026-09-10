import { z } from "zod";
import { REQUIRED_LEASE_ARTIFACTS } from "@/lib/lease-documents/artifact-catalog";

export const RENEWAL_RESOURCE_FIELDS = [
  { id: "insurance_flyer", label: "Insurance flyer", kind: "information" },
  { id: "rbp_flyer", label: "Resident benefits package flyer", kind: "information" },
  {
    id: "renewal_information_form",
    label: "Renewal information form",
    kind: "information",
  },
  ...REQUIRED_LEASE_ARTIFACTS.map((artifact) => ({
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
  })
  .strict()
  .refine(
    (value) => value.url !== "" || !value.verified,
    "An empty resource cannot be verified.",
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
export type RenewalResourceEntry = RenewalResourceInput & {
  recordedAt: string;
  recordedByUid: string;
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
/** A saved location is not approved legal content; resource consumers still resolve applicability. */
export function usableRenewalResourceUrl(
  resource: RenewalResourceInput | undefined,
): string | null {
  return resource &&
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
