import { createHash } from "node:crypto";

import { canonicalJson } from "@/lib/execution/preview-hash";
import type { DotloopReadinessState } from "@/lib/connections/dotloop-readiness";
import {
  ARTIFACT_FAMILY_LABELS,
  ARTIFACT_INTAKE_STATE_LABELS,
  INTAKE_CHECKPOINTS,
  PARTICIPANT_KIND_FOR_ROLE,
  type ArtifactClassification,
  type ArtifactFieldMap,
  type ArtifactFormat,
  type ArtifactIntakeEntry,
  type ArtifactIntakeManifest,
  type IntakeCheckpointId,
} from "@/lib/lease-documents/artifact-intake-contract";
import { REQUIRED_LEASE_ARTIFACTS } from "@/lib/lease-documents/artifact-catalog";
import type {
  ArtifactPredicate,
  LeaseArtifactCatalog,
  LeaseArtifactKind,
  LeaseArtifactVersion,
  PacketAnimal,
  PacketEvaluation,
  PacketFact,
  PacketParticipant,
} from "@/lib/lease-documents/packet-types";

/**
 * S130 (F10): the pure intake, classification, mapping, fill-boundary, binding and checkpoint
 * logic for the seven lease-artifact families. Files are untrusted bytes: classification looks
 * for structural tokens and never extracts, interprets or executes content. A mapping worksheet is
 * Preview only; the only fill route this repository can verify produces provider-native field
 * values, so a fillable or static PDF yields a source-filled worksheet and an exact manual Dotloop
 * handoff, never a claim of machine autofill. No I/O; nothing here activates a template, a
 * connection or a provider key.
 */

const PDF_HEADER = "%PDF-";
const TOKENS = {
  acroForm: "/AcroForm",
  xfa: "/XFA",
  javascript: "/JavaScript",
  js: "/JS",
  launch: "/Launch",
  embeddedFile: "/EmbeddedFile",
  page: "/Type /Page",
  pages: "/Type /Pages",
  pageCompact: "/Type/Page",
  pagesCompact: "/Type/Pages",
} as const;

function sha256(content: Uint8Array | string): string {
  return createHash("sha256").update(content).digest("hex");
}

/** Decode bytes as latin1 for token scanning only; the string is never returned or interpreted. */
function latin1(content: Uint8Array): string {
  return Buffer.from(content).toString("latin1");
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count++;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

export interface ClassifyUploadedFormInput {
  readonly content: Uint8Array;
  readonly detectedMimeType: string;
  readonly byteSize: number;
  /** Set only by staff from a recorded provider template; never inferred from the file. */
  readonly providerTemplateRef?: string | null;
}

/** Decide whether a received file is a fillable PDF, a static PDF, a provider-native template or unsupported. */
export function classifyUploadedForm(
  input: ClassifyUploadedFormInput,
): ArtifactClassification {
  const reasons: string[] = [];
  const content = input.content;
  const base = {
    contentHash: sha256(content),
    byteSize: input.byteSize,
    detectedMimeType: input.detectedMimeType.slice(0, 120),
    hasAcroForm: false,
    hasXfa: false,
    hasEmbeddedScript: false,
    hasEmbeddedFiles: false,
    approximatePages: null as number | null,
  };
  const unsupported = (): ArtifactClassification => ({
    ...base,
    format: "unsupported",
    reasons: reasons.slice(0, 10),
  });
  if (content.byteLength === 0 || input.byteSize === 0) {
    reasons.push("The file is empty.");
    return unsupported();
  }
  if (content.byteLength !== input.byteSize)
    reasons.push("The declared size differs from the received bytes.");
  const text = latin1(content);
  const isPdfHeader = text.startsWith(PDF_HEADER);
  if (input.detectedMimeType !== "application/pdf" || !isPdfHeader) {
    reasons.push(
      isPdfHeader
        ? `The detected type ${input.detectedMimeType} is not application/pdf.`
        : "The file is not a PDF (no PDF header).",
    );
    return unsupported();
  }
  if (!text.slice(-2048).includes("%%EOF")) {
    reasons.push("The PDF is truncated or corrupt (no end-of-file marker).");
    return unsupported();
  }
  const hasAcroForm = text.includes(TOKENS.acroForm);
  const hasXfa = text.includes(TOKENS.xfa);
  const hasEmbeddedScript =
    text.includes(TOKENS.javascript) ||
    text.includes(TOKENS.js) ||
    text.includes(TOKENS.launch);
  const hasEmbeddedFiles = text.includes(TOKENS.embeddedFile);
  const pageCount =
    countOccurrences(text, TOKENS.page) +
    countOccurrences(text, TOKENS.pageCompact) -
    countOccurrences(text, TOKENS.pages) -
    countOccurrences(text, TOKENS.pagesCompact);
  const scanned = {
    ...base,
    hasAcroForm,
    hasXfa,
    hasEmbeddedScript,
    hasEmbeddedFiles,
    approximatePages: pageCount > 0 ? pageCount : null,
  };
  if (hasEmbeddedScript) {
    reasons.push(
      "The PDF carries embedded script or launch actions; it is treated as data and not accepted.",
    );
    return { ...scanned, format: "unsupported", reasons: reasons.slice(0, 10) };
  }
  if (hasXfa) {
    reasons.push("XFA forms are not a supported filling route in this repository.");
    return { ...scanned, format: "unsupported", reasons: reasons.slice(0, 10) };
  }
  if (hasEmbeddedFiles)
    reasons.push("The PDF carries embedded files; review them before approval.");
  if (input.providerTemplateRef?.trim()) {
    reasons.push(
      "A provider template reference was recorded by staff; field values are supplied to the provider.",
    );
    return { ...scanned, format: "provider_native", reasons: reasons.slice(0, 10) };
  }
  if (hasAcroForm) {
    reasons.push(
      "Form fields are present; machine autofill is not available in this repository, so the fields are completed by a person in Dotloop from the worksheet.",
    );
    return { ...scanned, format: "fillable_pdf", reasons: reasons.slice(0, 10) };
  }
  reasons.push(
    "No form fields are present; the document is completed by a person in Dotloop from the worksheet.",
  );
  return { ...scanned, format: "static_pdf", reasons: reasons.slice(0, 10) };
}

export interface FieldMapIssue {
  readonly code:
    | "template_version_conflict"
    | "renamed_required_field"
    | "wrong_signer_role"
    | "missing_source"
    | "family_mismatch";
  readonly message: string;
  readonly fieldId?: string;
}

/** Validate a reviewed map against the entry it binds and, when known, the fields the reviewer confirmed. */
export function validateFieldMap(
  map: ArtifactFieldMap,
  entry: Pick<ArtifactIntakeEntry, "kind" | "publication">,
  detectedFieldIds: readonly string[] | null,
): { ok: boolean; issues: FieldMapIssue[] } {
  const issues: FieldMapIssue[] = [];
  if (map.artifactKind !== entry.kind)
    issues.push({
      code: "family_mismatch",
      message: `The map is for ${map.artifactKind}; this entry is ${entry.kind}.`,
    });
  if (!entry.publication || map.templateVersion !== entry.publication.reference)
    issues.push({
      code: "template_version_conflict",
      message: `The map was reviewed against ${map.templateVersion}; this entry binds ${entry.publication?.reference ?? "no publication"}.`,
    });
  if (detectedFieldIds)
    for (const field of map.fields)
      if (field.required && !detectedFieldIds.includes(field.fieldId))
        issues.push({
          code: "renamed_required_field",
          fieldId: field.fieldId,
          message: `Required field ${field.fieldId} is not among the confirmed form fields.`,
        });
  for (const signer of map.signers)
    if (PARTICIPANT_KIND_FOR_ROLE[signer.signerRole] !== signer.participantKind)
      issues.push({
        code: "wrong_signer_role",
        message: `Signer role ${signer.signerRole} belongs to the ${PARTICIPANT_KIND_FOR_ROLE[signer.signerRole]} party.`,
      });
  for (const field of map.fields)
    if (field.allowedSourceSystems.length === 0)
      issues.push({
        code: "missing_source",
        fieldId: field.fieldId,
        message: `Field ${field.fieldId} names no allowed source.`,
      });
  return { ok: issues.length === 0, issues };
}

export interface WorksheetRow {
  readonly location: string;
  readonly fieldId: string;
  readonly factKey: string;
  readonly resolvedKey: string;
  readonly required: boolean;
  readonly value: string | number | boolean | null;
  readonly displayValue: string | null;
  readonly source: { readonly system: string; readonly reference: string } | null;
  readonly state: "filled" | "missing" | "unverified" | "source_not_allowed" | "conflict";
}

export interface FillWorksheet {
  readonly label: "Preview only";
  readonly artifactKind: LeaseArtifactKind;
  readonly mapVersion: string;
  readonly rows: readonly WorksheetRow[];
  readonly missingRequired: readonly WorksheetRow[];
  readonly complete: boolean;
}

export interface WorksheetInput {
  readonly facts: readonly PacketFact[];
  readonly participants: readonly PacketParticipant[];
  readonly animals: readonly PacketAnimal[];
}

function resolveFact(
  facts: readonly PacketFact[],
  key: string,
): {
  fact: PacketFact | null;
  state: "verified" | "missing" | "unverified" | "conflict";
} {
  const matches = facts.filter((fact) => fact.fieldKey === key);
  if (matches.length === 0) return { fact: null, state: "missing" };
  if (
    matches.length > 1 &&
    new Set(matches.map((fact) => canonicalJson({ v: fact.normalizedValue }))).size > 1
  )
    return { fact: null, state: "conflict" };
  const fact = matches[0];
  return fact.confidence === "Verified"
    ? { fact, state: "verified" }
    : { fact, state: "unverified" };
}

function row(
  field: ArtifactFieldMap["fields"][number],
  location: string,
  resolvedKey: string,
  resolution: ReturnType<typeof resolveFact>,
): WorksheetRow {
  const { fact, state } = resolution;
  if (state !== "verified" || !fact)
    return {
      location,
      fieldId: field.fieldId,
      factKey: field.factKey,
      resolvedKey,
      required: field.required,
      value: null,
      displayValue: null,
      source: null,
      state: state === "verified" ? "missing" : state,
    };
  if (!field.allowedSourceSystems.includes(fact.source.system))
    return {
      location,
      fieldId: field.fieldId,
      factKey: field.factKey,
      resolvedKey,
      required: field.required,
      value: null,
      displayValue: null,
      source: { system: fact.source.system, reference: fact.source.reference },
      state: "source_not_allowed",
    };
  return {
    location,
    fieldId: field.fieldId,
    factKey: field.factKey,
    resolvedKey,
    required: field.required,
    value: fact.normalizedValue,
    displayValue: fact.displayValue,
    source: { system: fact.source.system, reference: fact.source.reference },
    state: "filled",
  };
}

/**
 * Expand every mapped location and fill it from verified facts only. A per-party field repeats
 * once per tenant participant (`party.<participantId>.<attr>`), a per-animal field once per animal
 * from that animal's own verified facts, so one known value is reused across every mapped location
 * and no party is duplicated or dropped by display name. The result is Preview only.
 */
export function buildFillWorksheet(
  map: ArtifactFieldMap,
  input: WorksheetInput,
): FillWorksheet {
  const rows: WorksheetRow[] = [];
  const tenants = [...input.participants]
    .filter((participant) => participant.kind === "tenant")
    .sort((a, b) => a.authoritativeOrder - b.authoritativeOrder);
  for (const field of map.fields) {
    if (field.multiplicity === "single") {
      rows.push(
        row(field, field.fieldId, field.factKey, resolveFact(input.facts, field.factKey)),
      );
      continue;
    }
    if (field.multiplicity === "per_party") {
      const attribute = field.factKey.slice("party.".length);
      for (const participant of tenants) {
        const key = `party.${participant.participantId}.${attribute}`;
        rows.push(
          row(
            field,
            `${field.fieldId}[${participant.participantId}]`,
            key,
            resolveFact(input.facts, key),
          ),
        );
      }
      continue;
    }
    const attribute = field.factKey.slice("animal.".length);
    for (const animal of input.animals) {
      const key = `animal.${animal.animalId}.${attribute}`;
      const facts: PacketFact[] = animal.facts
        .filter((fact) => fact.key === attribute)
        .map((fact) => ({
          fieldKey: key,
          normalizedValue: fact.value,
          displayValue: String(fact.value),
          source: fact.source,
          confidence: fact.confidence,
          applicability: "Applicable",
          verifiedBy: "animal_fact",
          blockingScope: "animal_agreement",
        }));
      rows.push(
        row(field, `${field.fieldId}[${animal.animalId}]`, key, resolveFact(facts, key)),
      );
    }
  }
  const missingRequired = rows.filter(
    (entry) => entry.required && entry.state !== "filled",
  );
  return {
    label: "Preview only",
    artifactKind: map.artifactKind,
    mapVersion: map.mapVersion,
    rows,
    missingRequired,
    complete: missingRequired.length === 0,
  };
}

export type FillResult =
  | {
      readonly kind: "provider_field_values";
      readonly values: Readonly<Record<string, string>>;
      readonly outputHash: string;
      readonly label: "Filled: provider-native field values";
    }
  | {
      readonly kind: "machine_autofill_unavailable";
      readonly reason: string;
      readonly handoff: "manual_dotloop";
      readonly label: "Preview only: completed by a person in Dotloop";
    }
  | {
      readonly kind: "manual_handoff";
      readonly reason: string;
      readonly handoff: "manual_dotloop";
      readonly label: "Preview only: completed by a person in Dotloop";
    }
  | {
      readonly kind: "blocked";
      readonly missing: readonly WorksheetRow[];
      readonly label: "Blocked: required values missing";
    }
  | {
      readonly kind: "unsupported";
      readonly reason: string;
      readonly label: "Unsupported file";
    };

/**
 * The deterministic filling boundary. Provider-native templates receive exact field values (the
 * only route this repository can independently read back and compare); a fillable or static PDF
 * keeps its source-filled worksheet and the manual Dotloop handoff, labeled unavailable rather than
 * completed. An empty or blank output is never called prefilled.
 */
export function fillArtifact(input: {
  readonly format: ArtifactFormat;
  readonly worksheet: FillWorksheet;
}): FillResult {
  const { format, worksheet } = input;
  if (format === "unsupported")
    return {
      kind: "unsupported",
      reason: "The file was not accepted for filling.",
      label: "Unsupported file",
    };
  if (!worksheet.complete)
    return {
      kind: "blocked",
      missing: worksheet.missingRequired,
      label: "Blocked: required values missing",
    };
  if (format === "provider_native") {
    const values = Object.fromEntries(
      worksheet.rows
        .filter((entry) => entry.state === "filled")
        .map((entry) => [entry.location, String(entry.value)]),
    );
    if (Object.keys(values).length === 0)
      return {
        kind: "blocked",
        missing: worksheet.rows,
        label: "Blocked: required values missing",
      };
    return {
      kind: "provider_field_values",
      values,
      outputHash: sha256(canonicalJson({ mapVersion: worksheet.mapVersion, values })),
      label: "Filled: provider-native field values",
    };
  }
  if (format === "fillable_pdf")
    return {
      kind: "machine_autofill_unavailable",
      reason:
        "This repository has no verified PDF filling route, so the form fields are completed by a person in Dotloop from this worksheet.",
      handoff: "manual_dotloop",
      label: "Preview only: completed by a person in Dotloop",
    };
  return {
    kind: "manual_handoff",
    reason:
      "The document has no form fields; it is completed by a person in Dotloop from this worksheet.",
    handoff: "manual_dotloop",
    label: "Preview only: completed by a person in Dotloop",
  };
}

export interface DerivedArtifactIdentity {
  readonly originalPublication: string;
  readonly originalContentHash: string;
  readonly mapVersion: string;
  readonly mapHash: string;
  readonly inputSnapshotHash: string;
  readonly outputKind: FillResult["kind"];
  readonly outputHash: string;
}

/** Bind a derived output to the approved original, the reviewed map and the exact input snapshot. */
export function deriveArtifactIdentity(input: {
  readonly originalPublication: string;
  readonly originalContentHash: string;
  readonly map: ArtifactFieldMap;
  readonly inputSnapshotHash: string;
  readonly output: FillResult;
}): DerivedArtifactIdentity {
  const mapHash = sha256(canonicalJson(input.map as unknown as Record<string, unknown>));
  const outputHash = sha256(
    canonicalJson({
      originalPublication: input.originalPublication,
      originalContentHash: input.originalContentHash,
      mapVersion: input.map.mapVersion,
      mapHash,
      inputSnapshotHash: input.inputSnapshotHash,
      output:
        input.output.kind === "provider_field_values"
          ? input.output.values
          : input.output.kind,
    }),
  );
  return {
    originalPublication: input.originalPublication,
    originalContentHash: input.originalContentHash,
    mapVersion: input.map.mapVersion,
    mapHash,
    inputSnapshotHash: input.inputSnapshotHash,
    outputKind: input.output.kind,
    outputHash,
  };
}

/** A derived artifact is current only while its original, map and input snapshot are unchanged. */
export function derivedArtifactCurrent(
  identity: DerivedArtifactIdentity,
  current: { originalContentHash: string; mapHash: string; inputSnapshotHash: string },
): {
  current: boolean;
  reasons: Array<"original_changed" | "mapping_changed" | "input_changed">;
} {
  const reasons: Array<"original_changed" | "mapping_changed" | "input_changed"> = [];
  if (identity.originalContentHash !== current.originalContentHash)
    reasons.push("original_changed");
  if (identity.mapHash !== current.mapHash) reasons.push("mapping_changed");
  if (identity.inputSnapshotHash !== current.inputSnapshotHash)
    reasons.push("input_changed");
  return { current: reasons.length === 0, reasons };
}

/** Engineering defaults per family, labeled as such; a reviewed map may name its own predicate. */
export const DEFAULT_FAMILY_PREDICATE: Record<LeaseArtifactKind, ArtifactPredicate> = {
  standard_lease: { kind: "always", ruleVersion: "intake-default-v1" },
  renewal_extension: { kind: "always", ruleVersion: "intake-default-v1" },
  animal_agreement: { kind: "any_animal_applicable", ruleVersion: "intake-default-v1" },
  lead_disclosure: {
    kind: "year_built_before",
    fieldKey: "property.year_built",
    yearExclusive: 1978,
    ruleVersion: "intake-default-v1",
  },
  city_addendum: {
    kind: "fact_equals",
    fieldKey: "property.city_addendum_required",
    expectedValue: true,
    ruleVersion: "intake-default-v1",
  },
  hoa_artifact: {
    kind: "fact_equals",
    fieldKey: "property.hoa_governed",
    expectedValue: true,
    ruleVersion: "intake-default-v1",
  },
  owner_acknowledgment: { kind: "always", ruleVersion: "intake-default-v1" },
};

export function mapHashOf(map: ArtifactFieldMap): string {
  return sha256(canonicalJson(map as unknown as Record<string, unknown>));
}

/** Project every approved family into the S66 catalog shape; requirements stay the owning policy. */
export function catalogFromIntake(
  manifest: ArtifactIntakeManifest,
  meta: { approvedByUid: string; approvedAt: string },
): {
  schemaVersion: "approved-lease-catalog/v1";
  data_mode: "live";
  approvedByUid: string;
  approvedAt: string;
  catalog: LeaseArtifactCatalog;
} {
  const approved = Object.values(manifest.entries).filter(
    (entry): entry is ArtifactIntakeEntry =>
      Boolean(entry && entry.state === "approved" && entry.publication && entry.fieldMap),
  );
  const artifacts: LeaseArtifactVersion[] = approved.map((entry) => {
    const map = entry.fieldMap!;
    const publication = entry.publication!;
    const publicationId = publication.reference.slice("publication:".length);
    return {
      artifactId: `${entry.kind}:${publicationId}:${map.mapVersion}`,
      kind: entry.kind,
      label: ARTIFACT_FAMILY_LABELS[entry.kind],
      version: publicationId,
      contentHash: publication.contentHash,
      formFamily: map.formFamily,
      status: "active",
      effectiveFrom: (entry.decided_at ?? meta.approvedAt).slice(0, 10),
      allowedPacketContexts: [...map.allowedPacketContexts],
      predicate: map.applicability ?? DEFAULT_FAMILY_PREDICATE[entry.kind],
      // S66 bindings are flat, one fact per field. A per-party or per-animal repeat is expanded
      // by the intake worksheet from the reviewed map, so only single-value fields bind here.
      fieldBindings: map.fields
        .filter((field) => field.multiplicity === "single")
        .map((field) => ({
          fieldId: field.fieldId,
          factKey: field.factKey,
          required: field.required,
          allowedSourceSystems: [...field.allowedSourceSystems],
        })),
      signerRoles: map.signers.map((signer) => signer.signerRole),
      signatureLocations: map.signers.map((signer) => signer.location),
      audience: map.audience,
      ...(entry.supersedes ? { supersedesArtifactId: entry.supersedes } : {}),
      publicationSource: {
        system: "s21_publication",
        reference: publication.reference,
        retrievedAt: meta.approvedAt,
        version: publicationId,
      },
      ...(entry.providerBindings
        ? { providerBindings: { ...entry.providerBindings } }
        : {}),
    };
  });
  const families = Array.from(new Set(artifacts.map((artifact) => artifact.formFamily)));
  return {
    schemaVersion: "approved-lease-catalog/v1",
    data_mode: "live",
    approvedByUid: meta.approvedByUid,
    approvedAt: meta.approvedAt,
    catalog: {
      catalogVersion: `intake:${sha256(canonicalJson({ artifacts: artifacts.map((a) => a.artifactId) })).slice(0, 16)}`,
      ruleVersion: "s66-rules-v1",
      activeAt: meta.approvedAt,
      source: {
        system: "lease_artifact_intake",
        reference: `manifest:${artifacts.length}-approved`,
        retrievedAt: meta.approvedAt,
        version: meta.approvedAt,
      },
      requirements: [...REQUIRED_LEASE_ARTIFACTS],
      formFamilies: families.map((formFamily) => ({
        formFamily,
        // A reviewed statement about the family, never inferred from which files are present.
        extensionCompatible: approved.some(
          (entry) =>
            entry.fieldMap!.formFamily === formFamily &&
            entry.fieldMap!.formFamilyExtensionCompatible,
        ),
        source: {
          system: "lease_artifact_intake",
          reference: `family:${formFamily}`,
          retrievedAt: meta.approvedAt,
        },
      })),
      artifacts,
    },
  };
}

export type FamilyApplicability =
  | "required"
  | "not_applicable"
  | "unknown"
  | "not_evaluated";

export interface FamilyReadiness {
  readonly kind: LeaseArtifactKind;
  readonly label: string;
  readonly materials: ArtifactIntakeEntry["state"] | "pending_materials";
  readonly materialsLabel: string;
  readonly format: ArtifactFormat | null;
  readonly applicability: FamilyApplicability;
  /** True only when this lease needs the family and its approved material is missing. */
  readonly blocking: boolean;
}

export interface DependencyCheck {
  readonly id: "materials" | "mappings" | "connection" | "action_key" | "confirmation";
  readonly label: string;
  readonly state: "ready" | "missing" | "unavailable" | "pending_person";
  readonly detail: string;
}

/**
 * Lease-specific readiness: which families this lease requires, which are not applicable, which are
 * unknown, and which block; plus the separate dependency checks that a template upload never
 * satisfies on its own (mappings, connection, exact key, human confirmation).
 */
export function projectFamilyReadiness(input: {
  readonly manifest: ArtifactIntakeManifest;
  readonly evaluation: PacketEvaluation | null;
  readonly connection: DotloopReadinessState | "not_read";
  readonly actionExecutable: boolean | null;
}): { families: FamilyReadiness[]; dependencies: DependencyCheck[] } {
  const included = new Set(
    input.evaluation?.manifest?.includedArtifacts.map((artifact) => artifact.kind) ?? [],
  );
  const excluded = new Set(
    input.evaluation?.manifest?.excludedArtifacts
      .filter((artifact) => artifact.ruleResult === "Not applicable")
      .map((artifact) => artifact.kind) ?? [],
  );
  const families = REQUIRED_LEASE_ARTIFACTS.map((requirement): FamilyReadiness => {
    const entry = input.manifest.entries[requirement.kind];
    const materials = entry?.state ?? "pending_materials";
    const applicability: FamilyApplicability = !input.evaluation
      ? "not_evaluated"
      : included.has(requirement.kind)
        ? "required"
        : excluded.has(requirement.kind)
          ? "not_applicable"
          : "unknown";
    return {
      kind: requirement.kind,
      label: requirement.label,
      materials,
      materialsLabel: ARTIFACT_INTAKE_STATE_LABELS[materials],
      format: entry?.classification?.format ?? null,
      applicability,
      blocking: applicability === "required" && materials !== "approved",
    };
  });
  const approvedCount = families.filter(
    (family) => family.materials === "approved",
  ).length;
  const mapped = families.filter(
    (family) => family.materials === "approved" || family.materials === "reviewed",
  ).length;
  const dependencies: DependencyCheck[] = [
    {
      id: "materials",
      label: "Approved materials",
      state: approvedCount === 0 ? "missing" : "ready",
      detail:
        approvedCount === 0
          ? "No family has approved material; every packet stays Pending materials."
          : `${approvedCount} of ${families.length} families have approved material.`,
    },
    {
      id: "mappings",
      label: "Reviewed field and signer mappings",
      state: mapped === 0 ? "missing" : "ready",
      detail:
        mapped === 0
          ? "No reviewed mapping is recorded; a received file alone maps nothing."
          : `${mapped} families carry a reviewed mapping.`,
    },
    {
      id: "connection",
      label: "Dotloop connection and selected resources",
      state:
        input.connection === "connected"
          ? "ready"
          : input.connection === "not_read"
            ? "unavailable"
            : "missing",
      detail:
        input.connection === "connected"
          ? "The managed Dotloop connection is connected; uploading a template never connects it."
          : input.connection === "not_read"
            ? "The connection state was not read on this surface."
            : `The Dotloop connection reads ${input.connection}; approved mappings do not connect it.`,
    },
    {
      id: "action_key",
      label: "Exact provider action key",
      state:
        input.actionExecutable === true
          ? "ready"
          : input.actionExecutable === null
            ? "unavailable"
            : "missing",
      detail:
        input.actionExecutable === true
          ? "The packet action key is executable; a fake-provider test never opens it."
          : input.actionExecutable === null
            ? "The action key state was not read on this surface."
            : "The packet action key is closed; approved materials and a connection do not open it.",
    },
    {
      id: "confirmation",
      label: "Exact human confirmation",
      state: "pending_person",
      detail:
        "Every provider effect still needs a person's exact confirmation at execution time.",
    },
  ];
  return { families, dependencies };
}

export interface CheckpointStatus {
  readonly id: IntakeCheckpointId;
  readonly label: string;
  readonly state: "done" | "in_progress" | "pending" | "blocked";
  readonly detail: string;
}

export interface CheckpointEvidence {
  readonly manifest: ArtifactIntakeManifest;
  /** True when a provider-native fill was independently compared for the selected lease. */
  readonly filledValuesVerified: boolean;
  readonly packetState: string | null;
  readonly providerReceiptId: string | null;
  readonly returnedStateInspected: boolean;
}

/** The resumable receipt-time and meeting checkpoints; each names what remains and none invents a result. */
export function projectIntakeCheckpoints(
  evidence: CheckpointEvidence,
): CheckpointStatus[] {
  const entries = Object.values(evidence.manifest.entries);
  const received = entries.filter(
    (entry) => entry && entry.state !== "pending_materials" && entry.state !== "rejected",
  ).length;
  const reviewed = entries.filter(
    (entry) => entry && (entry.state === "reviewed" || entry.state === "approved"),
  ).length;
  const approved = entries.filter((entry) => entry && entry.state === "approved").length;
  const total = entries.length;
  const unsupported = entries.filter(
    (entry) => entry?.classification?.format === "unsupported",
  ).length;
  const statuses: CheckpointStatus[] = [];
  const push = (
    id: IntakeCheckpointId,
    state: CheckpointStatus["state"],
    detail: string,
  ) =>
    statuses.push({
      id,
      label: INTAKE_CHECKPOINTS.find((cp) => cp.id === id)!.label,
      state,
      detail,
    });
  push(
    "intake",
    received === 0 ? "pending" : received === total ? "done" : "in_progress",
    received === 0
      ? "No materials received; every family reads Pending materials."
      : `${received} of ${total} families received${unsupported ? `; ${unsupported} unsupported file${unsupported === 1 ? "" : "s"} need a replacement` : ""}.`,
  );
  push(
    "review_coverage",
    reviewed === 0
      ? received === 0
        ? "blocked"
        : "pending"
      : reviewed === received
        ? "done"
        : "in_progress",
    reviewed === 0
      ? "Coverage and format review starts once a file is received."
      : `${reviewed} of ${received} received families have a reviewed coverage and mapping.`,
  );
  push(
    "approve_mappings",
    approved === 0
      ? reviewed === 0
        ? "blocked"
        : "pending"
      : approved === reviewed
        ? "done"
        : "in_progress",
    approved === 0
      ? "Approval follows a recorded mapping; nothing is in the catalog yet."
      : `${approved} families are approved and in the catalog.`,
  );
  push(
    "verify_filled_values",
    evidence.filledValuesVerified ? "done" : approved === 0 ? "blocked" : "pending",
    evidence.filledValuesVerified
      ? "Provider-native field values were read back and compared for the selected lease."
      : "Machine autofill is unavailable for PDF forms in this repository; provider-native values are compared when a provider template is recorded, otherwise a person completes the fields in Dotloop.",
  );
  push(
    "approve_packet",
    evidence.packetState === "Approved" || evidence.packetState === "Executed"
      ? "done"
      : approved === 0
        ? "blocked"
        : "pending",
    evidence.packetState
      ? `The current packet snapshot reads ${evidence.packetState}.`
      : "No packet snapshot is approved for the selected lease.",
  );
  push(
    "confirm_provider_effect",
    evidence.providerReceiptId ? "done" : "pending",
    evidence.providerReceiptId
      ? `Receipt ${evidence.providerReceiptId} records the one confirmed effect.`
      : "Not run. A person confirms the exact effect once; nothing here dispatches it.",
  );
  push(
    "inspect_returned_state",
    evidence.returnedStateInspected ? "done" : "pending",
    evidence.returnedStateInspected
      ? "The returned provider state was read back and inspected."
      : "Pending meeting. Document presence is not content equality or a signature.",
  );
  return statuses;
}
