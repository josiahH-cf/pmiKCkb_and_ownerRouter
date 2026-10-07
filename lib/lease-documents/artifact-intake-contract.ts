import { z } from "zod";

import { LEASE_ARTIFACT_FAMILIES } from "@/lib/lease-documents/artifact-catalog";
import {
  LEASE_ARTIFACT_KINDS,
  PACKET_CONTEXTS,
  type LeaseArtifactKind,
} from "@/lib/lease-documents/packet-types";

/**
 * S130 (F10): the seven-family intake contract shared by the store, the route, the Admin surface
 * and the pure model. Everything here is bounded configuration and typed state: no legal wording,
 * no field names of any real form, no signer coordinates. Real files, their coverage and their
 * mappings arrive later through the trusted publication path and are reviewed by people.
 */

export const ARTIFACT_INTAKE_STATES = [
  "pending_materials",
  "received",
  "reviewed",
  "approved",
  "rejected",
] as const;
export type ArtifactIntakeState = (typeof ARTIFACT_INTAKE_STATES)[number];
export const ARTIFACT_INTAKE_STATE_LABELS: Record<ArtifactIntakeState, string> = {
  pending_materials: "Pending materials",
  received: "Received, awaiting coverage review",
  reviewed: "Mapping recorded, awaiting approval",
  approved: "Approved (in the catalog)",
  rejected: "Rejected",
};

export const ARTIFACT_FORMATS = [
  "fillable_pdf",
  "static_pdf",
  "provider_native",
  "unsupported",
] as const;
export type ArtifactFormat = (typeof ARTIFACT_FORMATS)[number];
export const ARTIFACT_FORMAT_LABELS: Record<ArtifactFormat, string> = {
  fillable_pdf: "Fillable PDF (form fields present)",
  static_pdf: "Static PDF (no form fields)",
  provider_native: "Provider template reference (manual field handoff)",
  unsupported: "Unsupported or unsafe file",
};

export const ARTIFACT_FAMILY_LABELS: Record<LeaseArtifactKind, string> =
  Object.fromEntries(
    LEASE_ARTIFACT_FAMILIES.map((artifact) => [artifact.kind, artifact.label]),
  ) as Record<LeaseArtifactKind, string>;

export const SIGNER_ROLES = [
  "tenant",
  "owner",
  "property_manager",
  "broker",
  "guarantor",
] as const;
export type SignerRole = (typeof SIGNER_ROLES)[number];
/**
 * Which side each signer role signs for; a mismatch is a wrong signer role. S66: a PMI manager or
 * broker is an agent, never the property owner, and a guarantor is never a tenant.
 */
export const PARTICIPANT_KIND_FOR_ROLE: Record<
  SignerRole,
  "tenant" | "owner" | "agent" | "guarantor"
> = {
  tenant: "tenant",
  guarantor: "guarantor",
  owner: "owner",
  property_manager: "agent",
  broker: "agent",
};

export const FIELD_MULTIPLICITIES = ["single", "per_party", "per_animal"] as const;
export type FieldMultiplicity = (typeof FIELD_MULTIPLICITIES)[number];

export const INTAKE_CHECKPOINTS = [
  {
    id: "intake",
    label: "Receive each approved file through the trusted publication path",
  },
  { id: "review_coverage", label: "Review which family each file covers and its format" },
  { id: "approve_mappings", label: "Approve the reviewed field and signer mappings" },
  {
    id: "verify_filled_values",
    label: "Verify the actual filled values against the worksheet",
  },
  { id: "approve_packet", label: "Approve the exact packet snapshot for the lease" },
  {
    id: "confirm_provider_effect",
    label: "Confirm the permitted provider effect exactly once",
  },
  {
    id: "inspect_returned_state",
    label: "Inspect the returned provider state and receipts",
  },
] as const;
export type IntakeCheckpointId = (typeof INTAKE_CHECKPOINTS)[number]["id"];

const VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const FACT_KEY = /^[a-z][a-z0-9_.]{0,80}$/;
const FIELD_ID = /^[A-Za-z0-9][A-Za-z0-9_. -]{0,80}$/;
const PUBLICATION_REFERENCE = /^publication:[A-Za-z0-9-]{8,80}$/;
const CONTENT_HASH = /^[a-f0-9]{64}$/;
const EXECUTABLE_CONTENT =
  /<\s*\/?\s*(script|iframe|object|embed|style|link|meta)\b|javascript:|data:text\/html|\$\{|<\?|\bon[a-z]+\s*=/i;
const bounded = (max: number) => z.string().trim().min(1).max(max);

export const ArtifactPublicationBindingSchema = z
  .object({
    system: z.literal("s21_publication"),
    reference: z.string().regex(PUBLICATION_REFERENCE),
    contentHash: z.string().regex(CONTENT_HASH),
  })
  .strict();
export type ArtifactPublicationBinding = z.infer<typeof ArtifactPublicationBindingSchema>;

export const ArtifactProviderBindingsSchema = z
  .object({
    dotloopDocumentRef: bounded(120),
    dotloopTemplateRef: bounded(120).optional(),
  })
  .strict();

/** The S66 predicate shapes, restated so a reviewed map can name its applicability rule. */
export const ArtifactApplicabilitySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("always"), ruleVersion: bounded(64) }).strict(),
  z
    .object({
      kind: z.literal("year_built_before"),
      fieldKey: z.string().regex(FACT_KEY),
      yearExclusive: z.number().int(),
      ruleVersion: bounded(64),
    })
    .strict(),
  z
    .object({
      kind: z.literal("fact_equals"),
      fieldKey: z.string().regex(FACT_KEY),
      expectedValue: z.union([z.string().max(200), z.number().finite(), z.boolean()]),
      ruleVersion: bounded(64),
    })
    .strict(),
  z
    .object({ kind: z.literal("any_animal_applicable"), ruleVersion: bounded(64) })
    .strict(),
]);

/**
 * S130 (R-F10-03): how a static region shows its value. Money is either whole or decimal dollars
 * (`money`) or integer cents (`money_cents`), as the reviewer records for the mapped fact; the unit
 * is never inferred. A checkmark is drawn only for true.
 */
export const STATIC_VALUE_FORMATS = [
  "text",
  "date_long",
  "date_numeric",
  "money",
  "money_cents",
  "checkmark",
] as const;
export type StaticValueFormat = (typeof STATIC_VALUE_FORMATS)[number];

const coordinate = z.number().finite().min(0).max(5000);
const RegionRectSchema = z
  .object({
    x: coordinate,
    y: coordinate,
    width: z.number().finite().positive().max(5000),
    height: z.number().finite().positive().max(5000),
  })
  .strict();
export type RegionRect = z.infer<typeof RegionRectSchema>;

/**
 * S130 (R-F10-03, R-F10-04): reviewed geometry for a static PDF with no form fields. It binds to the
 * exact original's page sizes, crop boxes and rotations; each region names the mapped field and
 * repeat slot it shows, its format, and whether it is blank on the original or holds approved
 * existing variable text that the fill removes. Signature, initial and signing-date areas are
 * protected: nothing is ever drawn there.
 */
export const StaticPdfGeometrySchema = z
  .object({
    pages: z
      .array(
        z
          .object({
            pageIndex: z.number().int().min(0).max(39),
            width: z.number().finite().positive().max(5000),
            height: z.number().finite().positive().max(5000),
            rotation: z.union([
              z.literal(0),
              z.literal(90),
              z.literal(180),
              z.literal(270),
            ]),
            /**
             * The visible page as [x0, y0, x1, y1] in user space: the page's own or inherited
             * crop box clipped to its media box, or a media box away from the origin. Null only
             * when the page shows exactly [0, 0, width, height].
             */
            cropBox: z.tuple([coordinate, coordinate, coordinate, coordinate]).nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(40),
    regions: z
      .array(
        z
          .object({
            regionId: z.string().regex(FIELD_ID),
            fieldId: z.string().regex(FIELD_ID),
            /** 0-based repeat slot for a per-party or per-animal field; 0 for a single value. */
            slot: z.number().int().min(0).max(19),
            pageIndex: z.number().int().min(0).max(39),
            rect: RegionRectSchema,
            format: z.enum(STATIC_VALUE_FORMATS),
            fontSize: z.number().min(6).max(14),
            align: z.enum(["left", "center", "right"]),
            existing: z.enum(["blank", "replace"]),
          })
          .strict(),
      )
      .min(1)
      .max(300),
    protectedRegions: z
      .array(
        z
          .object({
            pageIndex: z.number().int().min(0).max(39),
            rect: RegionRectSchema,
            kind: z.enum(["signature", "initial", "signing_date"]),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
export type StaticPdfGeometry = z.infer<typeof StaticPdfGeometrySchema>;

function rectsOverlap(left: RegionRect, right: RegionRect): boolean {
  return (
    left.x < right.x + right.width &&
    right.x < left.x + left.width &&
    left.y < right.y + right.height &&
    right.y < left.y + left.height
  );
}

/** Geometry problems detectable from the map alone; the file check adds the content rules. */
export function staticGeometryIssues(
  map: {
    fields: ReadonlyArray<{
      fieldId: string;
      multiplicity: FieldMultiplicity;
      pdfFieldNames?: readonly string[];
    }>;
  },
  geometry: StaticPdfGeometry,
): string[] {
  const issues: string[] = [];
  const pages = new Map(geometry.pages.map((page) => [page.pageIndex, page]));
  if (pages.size !== geometry.pages.length) issues.push("Each page is described once.");
  if (
    new Set(geometry.regions.map((region) => region.regionId)).size !==
    geometry.regions.length
  )
    issues.push("Each region id is used once.");
  for (const field of map.fields)
    if (field.pdfFieldNames)
      issues.push(`${field.fieldId}: a static map places regions, not PDF field names.`);
  for (const region of geometry.regions) {
    const field = map.fields.find((candidate) => candidate.fieldId === region.fieldId);
    const page = pages.get(region.pageIndex);
    if (!field) issues.push(`${region.regionId}: field ${region.fieldId} is not mapped.`);
    else if (field.multiplicity === "single" && region.slot !== 0)
      issues.push(`${region.regionId}: a single value has only slot 0.`);
    if (!page) {
      issues.push(`${region.regionId}: page ${region.pageIndex + 1} is not described.`);
      continue;
    }
    // A page whose media box starts away from the origin always records its visible box.
    const [x0, y0, x1, y1] = page.cropBox ?? [0, 0, page.width, page.height];
    if (
      region.rect.x < x0 ||
      region.rect.y < y0 ||
      region.rect.x + region.rect.width > x1 ||
      region.rect.y + region.rect.height > y1
    )
      issues.push(`${region.regionId}: the region extends past the visible page.`);
    // On a page displayed rotated by a quarter turn, the value stands across the region's width.
    const across = page.rotation % 180 === 0 ? region.rect.height : region.rect.width;
    if (across < region.fontSize)
      issues.push(`${region.regionId}: the region is shorter than its text size.`);
  }
  for (const [index, left] of geometry.regions.entries())
    for (const right of geometry.regions.slice(index + 1))
      if (left.pageIndex === right.pageIndex && rectsOverlap(left.rect, right.rect))
        issues.push(`${left.regionId} and ${right.regionId} overlap.`);
  for (const region of geometry.regions)
    for (const protectedRegion of geometry.protectedRegions)
      if (
        region.pageIndex === protectedRegion.pageIndex &&
        rectsOverlap(region.rect, protectedRegion.rect)
      )
        issues.push(
          `${region.regionId} overlaps a protected ${protectedRegion.kind.replace("_", " ")} area.`,
        );
  for (const field of map.fields) {
    const slots = [
      ...new Set(
        geometry.regions
          .filter((region) => region.fieldId === field.fieldId)
          .map((region) => region.slot),
      ),
    ].sort((a, b) => a - b);
    if (slots.length === 0) issues.push(`${field.fieldId}: no region shows this field.`);
    else if (slots.some((slot, index) => slot !== index))
      issues.push(`${field.fieldId}: repeat slots must run 0, 1, 2 without a gap.`);
  }
  return issues;
}

export const ArtifactFieldMapSchema = z
  .object({
    schemaVersion: z.literal("artifact-field-map/v1"),
    artifactKind: z.enum(LEASE_ARTIFACT_KINDS),
    mapVersion: z.string().regex(VERSION),
    /** The exact publication this map was reviewed against; a different one is a conflict. */
    templateVersion: z.string().regex(PUBLICATION_REFERENCE),
    formFamily: bounded(64),
    /** Whether this form family may be renewed by extension, as the reviewer confirmed; never inferred from a file. */
    formFamilyExtensionCompatible: z.boolean(),
    audience: z.enum(["tenant", "owner"]),
    allowedPacketContexts: z.array(z.enum(PACKET_CONTEXTS)).min(1).max(3),
    applicability: ArtifactApplicabilitySchema.optional(),
    fields: z
      .array(
        z
          .object({
            fieldId: z.string().regex(FIELD_ID),
            factKey: z.string().regex(FACT_KEY),
            /** What the field means on the form, in plain words; never inferred from a file name. */
            meaning: bounded(200),
            required: z.boolean(),
            multiplicity: z.enum(FIELD_MULTIPLICITIES),
            /** Exact reviewed PDF field names, in authoritative party/animal order. No inferred slots. */
            pdfFieldNames: z
              .array(z.string().trim().min(1).max(160))
              .min(1)
              .max(100)
              .optional(),
            allowedSourceSystems: z.array(bounded(64)).min(1).max(8),
          })
          .strict(),
      )
      .max(100),
    signers: z
      .array(
        z
          .object({
            signerRole: z.enum(SIGNER_ROLES),
            participantKind: z.enum(["tenant", "owner", "agent", "guarantor"]),
            required: z.boolean(),
            /** A named signature location on the form as the reviewer recorded it. */
            location: bounded(80),
          })
          .strict(),
      )
      .max(20),
    reviewNote: bounded(500),
    /** S130: reviewed region geometry for a static PDF; absent for an AcroForm map. */
    static: StaticPdfGeometrySchema.optional(),
    /** S130: a brochure or attachment with no variable values, used exactly as approved. */
    unchangedAttachment: z.literal(true).optional(),
  })
  .strict()
  .superRefine((map, ctx) => {
    if (map.unchangedAttachment) {
      if (map.fields.length || map.static)
        ctx.addIssue({
          code: "custom",
          path: ["unchangedAttachment"],
          message: "An unchanged approved attachment has no mapped fields or regions.",
        });
    } else {
      if (!map.fields.length)
        ctx.addIssue({
          code: "custom",
          path: ["fields"],
          message:
            "Map at least one field. A file with no variable values is recorded as an unchanged approved attachment.",
        });
      if (!map.signers.length)
        ctx.addIssue({
          code: "custom",
          path: ["signers"],
          message: "Record at least one signer and signature location.",
        });
    }
    if (map.static)
      for (const message of staticGeometryIssues(map, map.static))
        ctx.addIssue({ code: "custom", path: ["static"], message });
    const ids = new Set(map.fields.map((field) => field.fieldId));
    const pdfTargets = map.fields.flatMap(
      (field) =>
        field.pdfFieldNames ?? (field.multiplicity === "single" ? [field.fieldId] : []),
    );
    if (new Set(pdfTargets).size !== pdfTargets.length)
      ctx.addIssue({
        code: "custom",
        path: ["fields"],
        message: "Each actual PDF field may have only one reviewed source.",
      });
    if (ids.size !== map.fields.length)
      ctx.addIssue({
        code: "custom",
        path: ["fields"],
        message: "Each field id must be mapped once.",
      });
    map.fields.forEach((field, index) => {
      if (field.multiplicity === "per_party" && !field.factKey.startsWith("party."))
        ctx.addIssue({
          code: "custom",
          path: ["fields", index, "factKey"],
          message:
            "A per-party field must map a party.* fact so one known value repeats per party.",
        });
      if (field.multiplicity === "per_animal" && !field.factKey.startsWith("animal."))
        ctx.addIssue({
          code: "custom",
          path: ["fields", index, "factKey"],
          message:
            "A per-animal field must map an animal.* fact so one known value repeats per animal.",
        });
      if (EXECUTABLE_CONTENT.test(field.meaning))
        ctx.addIssue({
          code: "custom",
          path: ["fields", index, "meaning"],
          message: "Executable or embedded content is not allowed in a mapping.",
        });
    });
    map.signers.forEach((signer, index) => {
      if (PARTICIPANT_KIND_FOR_ROLE[signer.signerRole] !== signer.participantKind)
        ctx.addIssue({
          code: "custom",
          path: ["signers", index, "participantKind"],
          message: `Signer role ${signer.signerRole} belongs to the ${PARTICIPANT_KIND_FOR_ROLE[signer.signerRole]} party.`,
        });
      if (EXECUTABLE_CONTENT.test(signer.location))
        ctx.addIssue({
          code: "custom",
          path: ["signers", index, "location"],
          message: "Executable or embedded content is not allowed in a mapping.",
        });
    });
    if (EXECUTABLE_CONTENT.test(map.reviewNote))
      ctx.addIssue({
        code: "custom",
        path: ["reviewNote"],
        message: "Executable or embedded content is not allowed in a mapping.",
      });
    if (map.artifactKind === "owner_acknowledgment" && map.audience !== "owner")
      ctx.addIssue({
        code: "custom",
        path: ["audience"],
        message: "The owner acknowledgment is an owner document.",
      });
    if (map.artifactKind !== "owner_acknowledgment" && map.audience !== "tenant")
      ctx.addIssue({
        code: "custom",
        path: ["audience"],
        message: "This family is a tenant document.",
      });
  });
export type ArtifactFieldMap = z.infer<typeof ArtifactFieldMapSchema>;

export const ArtifactClassificationSchema = z
  .object({
    format: z.enum(ARTIFACT_FORMATS),
    contentHash: z.string().regex(CONTENT_HASH),
    byteSize: z.number().int().nonnegative(),
    detectedMimeType: z.string().max(120),
    /** Token presence only; no text is extracted or interpreted. */
    hasAcroForm: z.boolean(),
    hasXfa: z.boolean(),
    hasEmbeddedScript: z.boolean(),
    hasEmbeddedFiles: z.boolean(),
    approximatePages: z.number().int().nonnegative().nullable(),
    /** Parsed from the immutable original, not supplied by a browser or token scan. */
    pdfFields: z
      .array(
        z
          .object({
            name: z.string().min(1).max(160),
            type: z.enum(["signature", "text", "checkbox", "selection", "unsupported"]),
          })
          .strict(),
      )
      .max(200)
      .optional(),
    reasons: z.array(z.string().max(200)).max(10),
  })
  .strict();
export type ArtifactClassification = z.infer<typeof ArtifactClassificationSchema>;

export const ArtifactIntakeEntrySchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(LEASE_ARTIFACT_KINDS),
    state: z.enum(ARTIFACT_INTAKE_STATES),
    revision: z.number().int().positive(),
    publication: ArtifactPublicationBindingSchema.optional(),
    file: z
      .object({
        fileName: z.string().max(200),
        detectedMimeType: z.string().max(120),
        byteSize: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
    classification: ArtifactClassificationSchema.optional(),
    providerBindings: ArtifactProviderBindingsSchema.optional(),
    fieldMap: ArtifactFieldMapSchema.optional(),
    mapHash: z.string().regex(CONTENT_HASH).optional(),
    received_at: z.string().optional(),
    received_by_uid: z.string().min(1).optional(),
    reviewed_at: z.string().optional(),
    reviewed_by_uid: z.string().min(1).optional(),
    decided_at: z.string().optional(),
    decided_by_uid: z.string().min(1).optional(),
    decision_reason: z.string().max(500).optional(),
    /** The publication an approved version replaced, kept for history; never rewritten. */
    supersedes: z.string().optional(),
    updated_at: z.string(),
  })
  .strict();
export type ArtifactIntakeEntry = z.infer<typeof ArtifactIntakeEntrySchema>;

export const ReceiveArtifactInputSchema = z
  .object({
    kind: z.enum(LEASE_ARTIFACT_KINDS),
    publicationSource: ArtifactPublicationBindingSchema,
    providerBindings: ArtifactProviderBindingsSchema.optional(),
    operationId: z.string().uuid(),
  })
  .strict();
export type ReceiveArtifactInput = z.infer<typeof ReceiveArtifactInputSchema>;

export const RecordArtifactFieldMapInputSchema = z
  .object({
    kind: z.enum(LEASE_ARTIFACT_KINDS),
    fieldMap: ArtifactFieldMapSchema,
    /** Field ids the reviewer confirmed on the actual form; an absent list means not yet confirmed. */
    detectedFieldIds: z.array(z.string().regex(FIELD_ID)).max(200).optional(),
    expectedRevision: z.number().int().positive(),
  })
  .strict();
export type RecordArtifactFieldMapInput = z.infer<
  typeof RecordArtifactFieldMapInputSchema
>;

export const DecideArtifactFamilyInputSchema = z
  .object({
    kind: z.enum(LEASE_ARTIFACT_KINDS),
    decision: z.enum(["approve", "reject"]),
    reason: z.string().trim().min(1).max(500),
    expectedRevision: z.number().int().positive(),
    operationId: z.string().uuid(),
  })
  .strict();
export type DecideArtifactFamilyInput = z.infer<typeof DecideArtifactFamilyInputSchema>;

export interface ArtifactIntakeManifest {
  readonly state: "readable" | "unreadable";
  readonly entries: Readonly<Record<LeaseArtifactKind, ArtifactIntakeEntry | null>>;
}

export function emptyArtifactIntakeManifest(
  state: "readable" | "unreadable" = "readable",
): ArtifactIntakeManifest {
  return {
    state,
    entries: Object.fromEntries(
      LEASE_ARTIFACT_KINDS.map((kind) => [kind, null]),
    ) as Record<LeaseArtifactKind, ArtifactIntakeEntry | null>,
  };
}
