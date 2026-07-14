import { createHash } from "node:crypto";

import {
  buildOwnerRenewalDraft,
  OWNER_RENEWAL_V1_BASE_COPY,
  type OwnerDraftInput,
} from "@/lib/lease-renewal/owner-draft";
import {
  buildTenantOfferDraft,
  TENANT_RENEWAL_V1_BASE_COPY,
  type TenantOfferInput,
} from "@/lib/lease-renewal/tenant-draft";
import {
  buildOwnerNoticeDraft,
  MAINTENANCE_OWNER_V1_BASE_COPY,
  type OwnerNoticeInput,
} from "@/lib/maintenance/owner-notice-draft";
import type {
  WorkflowCommunicationContext,
  WorkflowCommunicationPurpose,
} from "@/lib/gmail-hub/workflow-context";

/** A human-authored label action; it does not classify a message or imply a workflow decision. */
export const GMAIL_MANUAL_LABEL_RULE_REF = "manual-human-review:v1";
export const WORKFLOW_REPLY_POLICY_REF = "workflow-reply:v1.0" as const;

export const GOVERNED_ARTIFACT_REFS = [
  "owner-renewal:v1.0",
  "tenant-renewal:v1.0",
  "maintenance-owner:v1.0",
] as const;

export type GovernedArtifactRef = (typeof GOVERNED_ARTIFACT_REFS)[number];

export interface GovernedArtifactDefinition {
  ref: GovernedArtifactRef;
  version: "v1.0";
  purpose: WorkflowCommunicationPurpose;
  sourcePath: string;
  contentHash: string;
  allowedContext: string;
  requiredValues: readonly string[];
  approvedAt: "2026-07-14";
}

const artifactSources = {
  "owner-renewal:v1.0": {
    purpose: "renewal_owner",
    sourcePath: "lib/lease-renewal/owner-draft.ts",
    allowedContext: "authorized renewal owner workflow",
    requiredValues: [
      "authoritative recipient",
      "authenticated mailbox",
      "property address",
      "current rent",
      "market range",
      "specific market number",
      "comps screenshot",
    ],
    copy: OWNER_RENEWAL_V1_BASE_COPY,
  },
  "tenant-renewal:v1.0": {
    purpose: "renewal_tenant",
    sourcePath: "lib/lease-renewal/tenant-draft.ts",
    allowedContext: "authorized renewal tenant workflow",
    requiredValues: [
      "authoritative recipient",
      "authenticated mailbox",
      "tenant label",
      "lease end date",
      "owner-approved offered rent",
    ],
    copy: TENANT_RENEWAL_V1_BASE_COPY,
  },
  "maintenance-owner:v1.0": {
    purpose: "maintenance_owner",
    sourcePath: "lib/maintenance/owner-notice-draft.ts",
    allowedContext: "authorized assigned maintenance ticket owner workflow",
    requiredValues: [
      "authoritative recipient",
      "authenticated mailbox",
      "owner name",
      "property/unit",
      "reported issue",
      "priority",
    ],
    copy: MAINTENANCE_OWNER_V1_BASE_COPY,
  },
} as const;

export const GOVERNED_ARTIFACT_REGISTRY: readonly GovernedArtifactDefinition[] =
  Object.freeze(
    GOVERNED_ARTIFACT_REFS.map((ref) => {
      const source = artifactSources[ref];
      return Object.freeze({
        ref,
        version: "v1.0" as const,
        purpose: source.purpose,
        sourcePath: source.sourcePath,
        contentHash: sha256(canonicalJson(source.copy)),
        allowedContext: source.allowedContext,
        requiredValues: Object.freeze([...source.requiredValues]),
        approvedAt: "2026-07-14" as const,
      });
    }),
  );

export interface AuthoritativeAddress {
  email: string;
  sourceRef: string;
  verified: boolean;
}

interface GovernedArtifactInstanceBase {
  recipient: AuthoritativeAddress;
  mailbox: AuthoritativeAddress;
  sourceRefs: readonly string[];
}

export type GovernedArtifactInstanceInput =
  | (GovernedArtifactInstanceBase & {
      artifactRef: "owner-renewal:v1.0";
      values: OwnerDraftInput;
    })
  | (GovernedArtifactInstanceBase & {
      artifactRef: "tenant-renewal:v1.0";
      values: TenantOfferInput;
    })
  | (GovernedArtifactInstanceBase & {
      artifactRef: "maintenance-owner:v1.0";
      values: OwnerNoticeInput;
    });

export function getGovernedArtifact(ref: string): GovernedArtifactDefinition {
  const artifact = GOVERNED_ARTIFACT_REGISTRY.find((entry) => entry.ref === ref);
  if (!artifact) throw new GovernedArtifactError("Unknown or unversioned artifact.");
  return artifact;
}

/** Canonical approved base copy for the reply model and audit evidence; never includes live values. */
export function getGovernedArtifactBaseCopy(ref: GovernedArtifactRef): string {
  getGovernedArtifact(ref);
  return canonicalJson(artifactSources[ref].copy);
}

export function renderGovernedArtifactInstance(input: GovernedArtifactInstanceInput) {
  const artifact = getGovernedArtifact(input.artifactRef);
  const reasons = [...validateAuthority(input), ...validateRequiredValues(input)];
  const rendered = render(input);
  if (JSON.stringify(rendered).includes("Needs Verification")) {
    reasons.push("One or more send fields still need verification.");
  }
  if ("missingInputs" in rendered && rendered.missingInputs.length > 0) {
    reasons.push(...rendered.missingInputs.map((value) => `Missing: ${value}.`));
  }
  const uniqueReasons = [...new Set(reasons)];
  return {
    artifact,
    status: uniqueReasons.length === 0 ? ("ready" as const) : ("blocked" as const),
    reasons: uniqueReasons,
    rendered,
    recipient: input.recipient.email.trim().toLowerCase(),
    mailbox: input.mailbox.email.trim().toLowerCase(),
    sourceRefs: Object.freeze([...new Set(input.sourceRefs)].sort()),
  };
}

/**
 * Approved workflow messages bind the artifact, reply policy, entity purpose, and non-empty source
 * references before any Gmail provider call. Source references remain untrusted until the route's
 * entity adapter resolves them; S25/S26 own that mapping.
 */
export function isApprovedWorkflowReplyTemplate(
  context: WorkflowCommunicationContext,
): boolean {
  if (
    !context.templateRef ||
    context.replyPolicyRef !== WORKFLOW_REPLY_POLICY_REF ||
    context.sourceRefs.length === 0
  ) {
    return false;
  }
  try {
    return getGovernedArtifact(context.templateRef).purpose === context.purpose;
  } catch {
    return false;
  }
}

function render(input: GovernedArtifactInstanceInput) {
  switch (input.artifactRef) {
    case "owner-renewal:v1.0":
      return buildOwnerRenewalDraft(input.values);
    case "tenant-renewal:v1.0":
      return buildTenantOfferDraft(input.values);
    case "maintenance-owner:v1.0":
      return buildOwnerNoticeDraft(input.values);
  }
}

function validateAuthority(input: GovernedArtifactInstanceInput) {
  const reasons: string[] = [];
  for (const [label, address] of [
    ["recipient", input.recipient],
    ["mailbox", input.mailbox],
  ] as const) {
    if (!address.verified || !isEmail(address.email)) {
      reasons.push(`The ${label} is not verified by an authoritative source.`);
    }
    if (!address.sourceRef.trim() || /^browser:/i.test(address.sourceRef)) {
      reasons.push(`The ${label} source is not authoritative.`);
    }
  }
  if (input.sourceRefs.length === 0 || input.sourceRefs.some((ref) => !ref.trim())) {
    reasons.push("Authorized workflow source references are required.");
  }
  return reasons;
}

function validateRequiredValues(input: GovernedArtifactInstanceInput) {
  const reasons: string[] = [];
  const requireText = (label: string, value: unknown) => {
    if (typeof value !== "string" || !value.trim()) reasons.push(`Missing: ${label}.`);
  };
  const requireNumber = (label: string, value: unknown) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      reasons.push(`Missing: ${label}.`);
    }
  };

  switch (input.artifactRef) {
    case "owner-renewal:v1.0":
      requireText("property address", input.values.addressLabel);
      requireNumber("current rent", input.values.currentRent);
      requireNumber("market range low", input.values.market?.rangeLow);
      requireNumber("market range high", input.values.market?.rangeHigh);
      requireNumber("specific market number", input.values.market?.specificNumber);
      requireText("comps screenshot", input.values.market?.compsScreenshotRef);
      break;
    case "tenant-renewal:v1.0":
      requireText("tenant label", input.values.tenantNameLabel);
      requireText("lease end date", input.values.leaseEndDateIso);
      requireNumber("owner-approved offered rent", input.values.offeredRent);
      if (!["keep_same", "increase", "custom"].includes(input.values.ownerDecision)) {
        reasons.push("Missing: owner decision.");
      }
      break;
    case "maintenance-owner:v1.0":
      requireText("owner name", input.values.ownerName);
      requireText(
        "property/unit",
        input.values.propertyLabel ?? input.values.workOrder.unit?.label,
      );
      requireText("reported issue", input.values.workOrder.summary);
      requireText("priority", input.values.workOrder.priority);
      if (input.values.workOrder.blockers.length > 0) {
        reasons.push(
          ...input.values.workOrder.blockers.map((value) => `Missing: ${value}`),
        );
      }
      break;
  }
  return reasons;
}

function isEmail(value: string) {
  return /^[^@\s]+@[^@\s]+$/.test(value.trim().toLowerCase());
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export class GovernedArtifactError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GovernedArtifactError";
  }
}
