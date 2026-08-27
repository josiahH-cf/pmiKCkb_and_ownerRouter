import { createHash } from "node:crypto";
import { z } from "zod";

import { launchSpaces } from "@/lib/spaces";

const knownSpaceIds = new Set(
  launchSpaces
    .filter((space) => space.showInDirectory !== false && !space.readOnly)
    .map((space) => space.id),
);

const PlainTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(5_000)
  .refine((value) => !/[<>]/.test(value), "HTML-like markup is not allowed.")
  .refine(
    (value) =>
      !/(-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~-]{20,}|\bsk-[A-Za-z0-9_-]{20,}|\bAIza[A-Za-z0-9_-]{20,})/i.test(
        value,
      ),
    "Secret-like values are not allowed in an operational page.",
  );

const ShortTextSchema = PlainTextSchema.pipe(z.string().max(200));
const SlugSchema = z
  .string()
  .trim()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const ApprovedInternalHrefSchema = z
  .string()
  .trim()
  .max(300)
  .superRefine((href, ctx) => {
    if (/[:?#\\]/.test(href) || href.includes("..") || !href.startsWith("/")) {
      ctx.addIssue({
        code: "custom",
        message: "Only an approved internal route is allowed.",
      });
      return;
    }
    const fixed = new Set([
      "/",
      "/spaces",
      "/console",
      "/work",
      "/lease-renewal",
      "/maintenance",
      "/gmail-hub",
      "/processes",
    ]);
    if (fixed.has(href)) return;
    const match = href.match(/^\/spaces\/([a-z0-9-]+)$/);
    if (!match || !knownSpaceIds.has(match[1]!)) {
      ctx.addIssue({
        code: "custom",
        message: "Only an approved internal route is allowed.",
      });
    }
  });

export const OperationalPageComponentSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("heading"),
      text: ShortTextSchema,
      level: z.enum(["2", "3"]),
    })
    .strict(),
  z.object({ type: z.literal("text"), text: PlainTextSchema }).strict(),
  z
    .object({
      type: z.literal("callout"),
      tone: z.enum(["info", "warning"]),
      title: ShortTextSchema,
      text: PlainTextSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("checklist"),
      title: ShortTextSchema,
      items: z.array(ShortTextSchema).min(1).max(30),
    })
    .strict(),
  z
    .object({
      type: z.literal("internal_link"),
      label: ShortTextSchema,
      href: ApprovedInternalHrefSchema,
    })
    .strict(),
]);

export type OperationalPageComponent = z.infer<typeof OperationalPageComponentSchema>;

export const OperationalPageDefinitionSchema = z
  .object({
    pageType: z.literal("operational_process"),
    spaceId: z
      .string()
      .trim()
      .refine((value) => knownSpaceIds.has(value), "Select an existing approved Space."),
    slug: SlugSchema,
    title: ShortTextSchema,
    components: z.array(OperationalPageComponentSchema).min(1).max(40),
  })
  .strict();

export type OperationalPageDefinition = z.infer<typeof OperationalPageDefinitionSchema>;

export function operationalPageIdentity(
  definition: Pick<OperationalPageDefinition, "spaceId" | "slug">,
): string {
  return createHash("sha256")
    .update(`${definition.spaceId}:${definition.slug}`, "utf8")
    .digest("hex");
}

export function operationalPagePreviewHash(
  definition: OperationalPageDefinition,
): string {
  const parsed = OperationalPageDefinitionSchema.parse(definition);
  return createHash("sha256").update(JSON.stringify(parsed), "utf8").digest("hex");
}

export const OPERATIONAL_PAGE_APPROVAL_CONFIRMATION =
  "I approve this exact read-only operational page preview.";
export const OPERATIONAL_PAGE_PUBLICATION_CONFIRMATION =
  "I publish this exact approved operational page version.";
export const OPERATIONAL_PAGE_ROLLBACK_CONFIRMATION =
  "I restore this exact previously approved operational page version.";

export const OperationalPageActionSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("draft"),
      definition: OperationalPageDefinitionSchema,
      reason: ShortTextSchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal("approve"),
      versionId: z.string().uuid(),
      previewHash: z.string().regex(/^[a-f0-9]{64}$/),
      confirmation: z.literal(OPERATIONAL_PAGE_APPROVAL_CONFIRMATION),
    })
    .strict(),
  z
    .object({
      operation: z.literal("publish"),
      versionId: z.string().uuid(),
      previewHash: z.string().regex(/^[a-f0-9]{64}$/),
      confirmation: z.literal(OPERATIONAL_PAGE_PUBLICATION_CONFIRMATION),
    })
    .strict(),
  z
    .object({
      operation: z.literal("rollback"),
      pageId: z.string().regex(/^[a-f0-9]{64}$/),
      targetVersionId: z.string().uuid(),
      previewHash: z.string().regex(/^[a-f0-9]{64}$/),
      confirmation: z.literal(OPERATIONAL_PAGE_ROLLBACK_CONFIRMATION),
    })
    .strict(),
]);

export type OperationalPageAction = z.infer<typeof OperationalPageActionSchema>;
