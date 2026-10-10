import { z } from "zod";
import { PRODUCT_NAME } from "@/lib/constants";
import { MessagePreparationInputsSchema } from "@/lib/lease-renewal/renewal-message-preparation";
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((v) => !/[<>\u0000-\u001f\u007f]/u.test(v), "Use plain readable text.");
export const BusinessProfileSchema = z
  .object({
    name: text(240).min(1),
    businessTitle: text(160),
    phone: text(120),
    hours: text(240),
    website: z.union([
      z.literal(""),
      z
        .string()
        .url()
        .max(2048)
        .refine((v) => {
          const u = new URL(v);
          return u.protocol === "https:" && !u.username && !u.password;
        }, "Use an HTTPS website without embedded credentials."),
    ]),
    source: text(240).min(1),
  })
  .strict();
export type BusinessProfile = z.infer<typeof BusinessProfileSchema>;
export interface StaffBusinessProfile {
  uid: string;
  email: string;
  version: number;
  profile: BusinessProfile;
  updatedAt: string;
  updatedBy: string;
}
export const emptyBusinessProfile = (): BusinessProfile => ({
  name: "",
  businessTitle: "",
  phone: "",
  hours: "",
  website: "",
  source: "",
});
export function profileSignature(profile: BusinessProfile) {
  const p = BusinessProfileSchema.parse(profile);
  return MessagePreparationInputsSchema.shape.signature.unwrap().parse({
    name: p.name,
    role: p.businessTitle || null,
    phone: p.phone || null,
    hours: p.hours || null,
    website: p.website ? { url: p.website, source: p.source } : null,
    source: p.source,
  });
}
export function profileFromRetainedSignature(
  signature: NonNullable<z.infer<typeof MessagePreparationInputsSchema>["signature"]>,
): BusinessProfile {
  return BusinessProfileSchema.parse({
    name: signature.name,
    businessTitle: signature.role ?? "",
    phone: signature.phone ?? "",
    hours: signature.hours ?? "",
    website: signature.website?.url ?? "",
    source: signature.source,
  });
}
export const DisplayNameSchema = text(100);
export function applicationDisplayName(value: unknown) {
  const p = DisplayNameSchema.safeParse(value);
  return p.success && p.data ? p.data : PRODUCT_NAME;
}
const operation = {
  operationId: z.string().uuid(),
  expectedVersion: z.number().int().nonnegative(),
  reason: text(1000).min(1),
};
export const PresentationCommandSchema = z.discriminatedUnion("op", [
  z
    .object({
      ...operation,
      op: z.literal("save_profile"),
      uid: z
        .string()
        .min(1)
        .max(128)
        .regex(/^[^/]+$/),
      profile: BusinessProfileSchema,
    })
    .strict(),
  z
    .object({
      ...operation,
      op: z.literal("save_display_name"),
      displayName: DisplayNameSchema,
    })
    .strict(),
]);
export type PresentationCommand = z.infer<typeof PresentationCommandSchema>;
export interface ApplicationPresentation {
  version: number;
  displayName: string;
  updatedAt: string;
  updatedBy: string;
}
