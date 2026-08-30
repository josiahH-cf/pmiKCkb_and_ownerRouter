import { createHash } from "node:crypto";

import { DRAFT_BANNER } from "@/lib/constants";
import type { DraftFact, OwnerRenewalDraft } from "@/lib/lease-renewal/owner-draft";
import {
  CURRENT_RENEWAL_COPY_PUBLICATION,
  RENEWAL_COPY_TEMPLATE_SOURCES,
  RenewalCopySelectionSchema,
  defaultRenewalCopySelection,
  renewalCopyChannelForRef,
  type RenewalCopyAssistOutcome,
  type RenewalCopyChannel,
  type RenewalCopySelection,
  type RenewalCopyTemplateSource,
  type RenewalCopyTemplateSummary,
} from "@/lib/lease-renewal/renewal-copy-contract";
import { OWNER_RENEWAL_V1_BASE_COPY } from "@/lib/lease-renewal/owner-draft";
import {
  TENANT_RENEWAL_V1_BASE_COPY,
  type TenantOfferDraft,
} from "@/lib/lease-renewal/tenant-draft";
import type { ModelProvider } from "@/lib/llm/model-provider";

export type RenewalCopyPublication =
  | { status: "review_only"; reason: string }
  | {
      status: "approved";
      approvedAtIso: string;
      evidenceRef: `client-approval:${string}`;
    }
  | { status: "retired"; reason: string };

export interface RenewalCopyTemplateDefinition extends RenewalCopyTemplateSource {
  publication: Readonly<RenewalCopyPublication>;
  contentHash: string;
}

export interface CreateRenewalCopyTemplateInput {
  source: RenewalCopyTemplateSource;
  publication: RenewalCopyPublication;
}

export interface RenewalCopyRecipient {
  to: string;
  sourceRef: string;
  cc?: readonly Readonly<{ to: string; sourceRef: string }>[];
}

export interface RenewalCopyLockedEnvelope {
  schemaVersion: "renewal-copy-envelope-v1";
  channel: RenewalCopyChannel;
  templateRef: string;
  templateVersion: string;
  templateContentHash: string;
  workflowId: string;
  workflowContext: string;
  reviewBanner: typeof DRAFT_BANNER;
  recipient: Readonly<RenewalCopyRecipient>;
  sourceRefs: readonly string[];
  facts: readonly DraftFact[];
  fingerprint: string;
}

export interface GovernedRenewalCopyPreparation {
  status: "ready" | "review_only" | "blocked";
  template: RenewalCopyTemplateSummary;
  selection: RenewalCopySelection;
  subject: string;
  body: string;
  envelope: RenewalCopyLockedEnvelope;
  reasons: string[];
}

export type RenewalCopyRendered = OwnerRenewalDraft | TenantOfferDraft;

const CURRENT_TEMPLATES = Object.freeze({
  owner: createRenewalCopyTemplate({
    source: RENEWAL_COPY_TEMPLATE_SOURCES.owner,
    publication: CURRENT_RENEWAL_COPY_PUBLICATION.owner,
  }),
  tenant: createRenewalCopyTemplate({
    source: RENEWAL_COPY_TEMPLATE_SOURCES.tenant,
    publication: CURRENT_RENEWAL_COPY_PUBLICATION.tenant,
  }),
});

export function createRenewalCopyTemplate(
  input: CreateRenewalCopyTemplateInput,
): RenewalCopyTemplateDefinition {
  validateTemplateSource(input.source);
  validatePublication(input.publication);
  const baseCopy =
    input.source.channel === "owner"
      ? OWNER_RENEWAL_V1_BASE_COPY
      : TENANT_RENEWAL_V1_BASE_COPY;
  const contentHash = sha256(canonicalJson({ source: input.source, baseCopy }));
  return deepFreeze({
    ...input.source,
    regions: input.source.regions.map((region) => ({ ...region })),
    lockedFactKeys: [...input.source.lockedFactKeys],
    requiredLockedFactKeys: [...input.source.requiredLockedFactKeys],
    mandatorySentences: [...input.source.mandatorySentences],
    forbiddenPhrases: [...input.source.forbiddenPhrases],
    publication: { ...input.publication },
    contentHash,
  });
}

export function currentRenewalCopyTemplate(
  channel: RenewalCopyChannel,
): RenewalCopyTemplateDefinition {
  return CURRENT_TEMPLATES[channel];
}

export function renewalCopyTemplateSummary(
  template: RenewalCopyTemplateDefinition,
): RenewalCopyTemplateSummary {
  return {
    ref: template.ref,
    version: template.version,
    contentHash: template.contentHash,
    status: template.publication.status,
  };
}

export function prepareGovernedRenewalCopy(input: {
  template: RenewalCopyTemplateDefinition;
  rendered: RenewalCopyRendered;
  recipient: RenewalCopyRecipient;
  workflowId: string;
  workflowContext: string;
  sourceRefs: readonly string[];
  selection?: RenewalCopySelection;
}): GovernedRenewalCopyPreparation {
  const rendered = renderedEmail(input.rendered);
  const template = input.template;
  const templateSummary = renewalCopyTemplateSummary(template);
  const requestedSelection =
    input.selection ?? defaultRenewalCopySelection(template.channel);
  const selectionResult = RenewalCopySelectionSchema.safeParse(requestedSelection);
  const defaultSelection = defaultRenewalCopySelection(template.channel);
  const reasons: string[] = [];

  if (!input.workflowId.trim() || !input.workflowContext.trim()) {
    reasons.push("Renewal copy requires exact server-owned workflow identity.");
  }
  if (!input.recipient.to.trim() || !input.recipient.sourceRef.trim()) {
    reasons.push("Renewal copy requires an authoritative primary recipient and source.");
  }
  if (
    input.recipient.cc?.some(
      (recipient) => !recipient.to.trim() || !recipient.sourceRef.trim(),
    )
  ) {
    reasons.push("Every renewal Cc recipient requires its own authoritative source.");
  }
  if (
    input.sourceRefs.length === 0 ||
    input.sourceRefs.some((source) => !source.trim())
  ) {
    reasons.push("Renewal copy requires non-empty authoritative source references.");
  }

  if (!selectionResult.success) {
    reasons.push(
      "The editable copy selection does not match a supported template shape.",
    );
  }
  const selection = selectionResult.success ? selectionResult.data : defaultSelection;
  if (
    selection.templateRef !== template.ref ||
    selection.templateVersion !== template.version
  ) {
    reasons.push(
      "The editable copy selection does not match the current server template.",
    );
  }
  if (rendered.channel !== template.channel) {
    reasons.push(
      `The ${template.channel} template cannot render a ${rendered.channel} renewal message.`,
    );
  }
  const renderedFactKeys = rendered.facts.map((fact) => fact.key);
  const unclassifiedFacts = renderedFactKeys.filter(
    (key) => !template.lockedFactKeys.includes(key),
  );
  if (unclassifiedFacts.length > 0) {
    reasons.push(
      `Rendered facts are not classified by template ${template.ref}: ${[
        ...new Set(unclassifiedFacts),
      ].join(", ")}.`,
    );
  }
  if (new Set(renderedFactKeys).size !== renderedFactKeys.length) {
    reasons.push("Rendered renewal copy contains duplicate locked fact keys.");
  }
  const missingRequiredFacts = template.requiredLockedFactKeys.filter(
    (key) => !renderedFactKeys.includes(key),
  );
  if (missingRequiredFacts.length > 0) {
    reasons.push(
      `Rendered renewal copy is missing required locked facts: ${missingRequiredFacts.join(", ")}.`,
    );
  }
  if (
    rendered.facts.some(
      (fact) =>
        !fact.key.trim() ||
        !fact.label.trim() ||
        !fact.value.trim() ||
        !fact.source.trim(),
    )
  ) {
    reasons.push("Every rendered renewal fact requires a key, label, value, and source.");
  }

  const lockedValues = [
    input.recipient.to,
    ...(input.recipient.cc ?? []).map((recipient) => recipient.to),
    ...rendered.facts.map((fact) => fact.value),
  ];
  const selectedRegions =
    template.publication.status === "approved" ? selection : defaultSelection;
  const regionReasons = validateEditableRegions(template, selectedRegions, lockedValues);
  reasons.push(...regionReasons);

  let body = rendered.body;
  const editableRegions = selectedRegions.editableRegions as Record<string, string>;
  for (const region of template.regions) {
    const replacement = editableRegions[region.id];
    const occurrences = countOccurrences(body, region.defaultText);
    if (occurrences !== 1) {
      reasons.push(
        `Editable region ${region.id} does not occur exactly once in template ${template.ref}.`,
      );
      continue;
    }
    body = body.replace(region.defaultText, replacement);
  }
  for (const sentence of template.mandatorySentences) {
    if (!body.includes(sentence)) {
      reasons.push(`Mandatory copy is missing from template ${template.ref}.`);
    }
  }

  if (template.publication.status !== "approved") {
    reasons.push(publicationReason(template.publication));
  }

  const envelopeValues = {
    schemaVersion: "renewal-copy-envelope-v1" as const,
    channel: template.channel,
    templateRef: template.ref,
    templateVersion: template.version,
    templateContentHash: template.contentHash,
    workflowId: input.workflowId,
    workflowContext: input.workflowContext,
    reviewBanner: DRAFT_BANNER as typeof DRAFT_BANNER,
    recipient: {
      to: input.recipient.to,
      sourceRef: input.recipient.sourceRef,
      ...(input.recipient.cc?.length
        ? { cc: input.recipient.cc.map((recipient) => ({ ...recipient })) }
        : {}),
    },
    sourceRefs: [...new Set(input.sourceRefs)].sort(),
    facts: rendered.facts.map((fact) => ({ ...fact })),
  };
  const envelope = deepFreeze({
    ...envelopeValues,
    fingerprint: sha256(
      canonicalJson({
        ...envelopeValues,
        subject: rendered.subject,
        body,
        selection: selectedRegions,
      }),
    ),
  });

  const onlyReviewPublicationReason =
    reasons.length === 1 && template.publication.status === "review_only";
  return {
    status:
      template.publication.status === "approved" && reasons.length === 0
        ? "ready"
        : onlyReviewPublicationReason
          ? "review_only"
          : "blocked",
    template: templateSummary,
    selection: selectedRegions,
    subject: rendered.subject,
    body,
    envelope,
    reasons: [...new Set(reasons)],
  };
}

export async function assistGovernedRenewalCopy(input: {
  template: RenewalCopyTemplateDefinition;
  selection: RenewalCopySelection;
  provider: ModelProvider;
  model: string;
  timeoutMs?: number;
}): Promise<RenewalCopyAssistOutcome> {
  const templateSummary = renewalCopyTemplateSummary(input.template);
  const fallbackSelection = cloneSelection(input.selection);
  if (input.template.publication.status !== "approved") {
    return {
      status: "refused",
      template: templateSummary,
      selection: fallbackSelection,
      usedModel: false,
      refusedBeforeModel: true,
      errors: [publicationReason(input.template.publication)],
    };
  }
  const initialReasons = validateEditableRegions(input.template, input.selection, []);
  if (
    input.selection.templateRef !== input.template.ref ||
    input.selection.templateVersion !== input.template.version
  ) {
    initialReasons.push(
      "The editable copy selection does not match the current server template.",
    );
  }
  if (initialReasons.length > 0) {
    return {
      status: "refused",
      template: templateSummary,
      selection: fallbackSelection,
      usedModel: false,
      refusedBeforeModel: true,
      errors: initialReasons,
    };
  }

  let raw = "";
  try {
    const response = await withTimeout(
      input.provider.generateText({
        model: input.model,
        systemInstruction: assistanceSystemInstruction(input.template),
        userContent: assistanceUserContent(input.template, input.selection),
        temperature: 0,
        responseJsonSchema: assistanceSchema(input.template),
      }),
      input.timeoutMs ?? 15_000,
    );
    raw = response.text;
  } catch {
    return assistanceFallback(templateSummary, fallbackSelection);
  }

  const parsed = parseAssistanceOutput(raw);
  if (!parsed) return assistanceFallback(templateSummary, fallbackSelection);
  const candidate = RenewalCopySelectionSchema.safeParse({
    ...input.selection,
    editableRegions: parsed,
  });
  if (!candidate.success) return assistanceFallback(templateSummary, fallbackSelection);
  const reasons = validateEditableRegions(input.template, candidate.data, []);
  if (reasons.length > 0) return assistanceFallback(templateSummary, fallbackSelection);

  return {
    status: "ready",
    template: templateSummary,
    selection: cloneSelection(candidate.data),
    usedModel: true,
    refusedBeforeModel: false,
    errors: [],
  };
}

function renderedEmail(rendered: RenewalCopyRendered) {
  if (rendered.kind === "owner_renewal_email") {
    return {
      channel: "owner" as const,
      subject: rendered.subject,
      body: rendered.body,
      facts: rendered.facts,
    };
  }
  return {
    channel: "tenant" as const,
    subject: rendered.channels.email.subject ?? "Your lease renewal",
    body: rendered.channels.email.body,
    facts: rendered.facts,
  };
}

function validateEditableRegions(
  template: RenewalCopyTemplateDefinition,
  selection: RenewalCopySelection,
  lockedValues: readonly string[],
): string[] {
  const reasons: string[] = [];
  if (renewalCopyChannelForRef(selection.templateRef) !== template.channel) {
    reasons.push("Owner and tenant editable copy cannot cross channels.");
  }
  const expectedIds = template.regions.map((region) => region.id).sort();
  const editableRegions = selection.editableRegions as Record<string, string>;
  const actualIds = Object.keys(editableRegions).sort();
  if (canonicalJson(actualIds) !== canonicalJson(expectedIds)) {
    reasons.push(
      "Editable copy must contain exactly the template's allowlisted regions.",
    );
  }
  for (const region of template.regions) {
    const value = editableRegions[region.id];
    if (typeof value !== "string" || !value.trim()) {
      reasons.push(`Editable region ${region.id} cannot be blank.`);
      continue;
    }
    if (value.length > region.maxLength) {
      reasons.push(`Editable region ${region.id} exceeds its maximum length.`);
    }
    if (/\p{Cc}/u.test(value)) {
      reasons.push(`Editable region ${region.id} contains control characters.`);
    }
    if (/\d|[$€£]|https?:\/\/|www\.|[^\s@]+@[^\s@]+|\{\{[^}]+\}\}/iu.test(value)) {
      reasons.push(
        `Editable region ${region.id} cannot add a recipient, number, date, amount, URL, or template token.`,
      );
    }
    if (
      /\b(?:promise|guarantee|approved|approval|sent|contacted|delivered|emailed|texted|messaged|portal|recipient|rent|amount|charge|fees?|deposit|rate|increase|decrease|terms?|month-to-month|concession|waive|verified|confirmed|receipt|evidence|dollars?|cents?|today|tomorrow|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million)\b/iu.test(
        value,
      )
    ) {
      reasons.push(
        `Editable region ${region.id} cannot add a fact, term, commitment, approval, evidence, delivery, or channel claim.`,
      );
    }
    if (
      value !== region.defaultText &&
      /\b(?:we(?:'ll| will)|will|shall|commit|agree|authorize|recommend|ensure)\b/iu.test(
        value,
      )
    ) {
      reasons.push(
        `Editable region ${region.id} cannot add a new commitment or recommendation.`,
      );
    }
    const otherChannelLanguage =
      template.channel === "tenant"
        ? /\b(?:owner|landlord)\b/iu
        : /\b(?:tenant|resident)\b/iu;
    if (value !== region.defaultText && otherChannelLanguage.test(value)) {
      reasons.push(`Editable region ${region.id} cannot add cross-channel language.`);
    }
    for (const phrase of template.forbiddenPhrases) {
      if (phrase.trim() && value.toLowerCase().includes(phrase.trim().toLowerCase())) {
        reasons.push(`Editable region ${region.id} contains forbidden template copy.`);
      }
    }
    for (const locked of lockedValues) {
      const normalized = locked.trim();
      if (
        normalized.length >= 3 &&
        value.toLocaleLowerCase().includes(normalized.toLocaleLowerCase())
      ) {
        reasons.push(`Editable region ${region.id} repeats a locked server fact.`);
      }
    }
  }
  return [...new Set(reasons)];
}

function validatePublication(publication: RenewalCopyPublication): void {
  if (publication.status !== "approved") {
    if (!publication.reason.trim()) {
      throw new Error("A non-approved renewal template requires a specific reason.");
    }
    return;
  }
  if (
    !Number.isFinite(Date.parse(publication.approvedAtIso)) ||
    !publication.evidenceRef.startsWith("client-approval:") ||
    publication.evidenceRef === "client-approval:"
  ) {
    throw new Error(
      "An approved renewal template requires dated client-approval evidence.",
    );
  }
}

function validateTemplateSource(source: RenewalCopyTemplateSource): void {
  const expectedRef = `${source.channel}-renewal:${source.version}`;
  if (source.ref !== expectedRef || source.compatibility !== "renewal-v1") {
    throw new Error(
      "A renewal copy version must match its exact channel and compatibility.",
    );
  }
  if (source.regions.length === 0) {
    throw new Error("A renewal copy version requires at least one editable region.");
  }
  const ids = source.regions.map((region) => region.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Renewal copy editable-region ids must be unique.");
  }
  const baseBody =
    source.channel === "owner"
      ? OWNER_RENEWAL_V1_BASE_COPY.body.join("\n")
      : TENANT_RENEWAL_V1_BASE_COPY.fullBody.join("\n");
  for (const region of source.regions) {
    if (
      !/^[a-z][a-z0-9_]*$/.test(region.id) ||
      !region.label.trim() ||
      !region.defaultText.trim() ||
      !Number.isInteger(region.maxLength) ||
      region.maxLength > 700 ||
      region.maxLength < region.defaultText.length ||
      countOccurrences(baseBody, region.defaultText) !== 1
    ) {
      throw new Error(
        "Each renewal copy region must be bounded and occur exactly once in its base version.",
      );
    }
  }
  if (
    source.lockedFactKeys.length === 0 ||
    source.lockedFactKeys.some((key) => !/^[a-z][a-z0-9_]*$/.test(key)) ||
    new Set(source.lockedFactKeys).size !== source.lockedFactKeys.length
  ) {
    throw new Error("Renewal copy locked-fact keys must be unique and stable.");
  }
  if (
    source.requiredLockedFactKeys.length === 0 ||
    source.requiredLockedFactKeys.some((key) => !source.lockedFactKeys.includes(key)) ||
    new Set(source.requiredLockedFactKeys).size !== source.requiredLockedFactKeys.length
  ) {
    throw new Error(
      "Renewal copy required facts must be unique members of the locked-fact set.",
    );
  }
  if (
    new Set(source.mandatorySentences).size !== source.mandatorySentences.length ||
    source.forbiddenPhrases.some((phrase) => !phrase.trim()) ||
    new Set(source.forbiddenPhrases).size !== source.forbiddenPhrases.length
  ) {
    throw new Error(
      "Renewal mandatory and forbidden copy declarations must be unique and non-empty.",
    );
  }
  for (const sentence of source.mandatorySentences) {
    if (!sentence.trim() || !baseBody.includes(sentence)) {
      throw new Error("Mandatory renewal copy must occur in the exact base version.");
    }
  }
}

function publicationReason(publication: RenewalCopyPublication): string {
  if (publication.status === "review_only") {
    return `Review-only copy cannot create an unsent draft until client-approved wording is published. ${publication.reason}`;
  }
  if (publication.status === "retired") {
    return `This renewal copy version is retired. ${publication.reason}`;
  }
  return "The renewal copy version is approved.";
}

function assistanceSystemInstruction(template: RenewalCopyTemplateDefinition): string {
  return [
    "You may lightly rewrite only the supplied editable prose regions for tone, clarity, and flow.",
    "Return strict JSON with one regions object and exactly the supplied region ids.",
    "Do not add a name, recipient, amount, number, date, term, commitment, approval, URL, evidence status, or delivery/channel claim.",
    "Do not add template tokens, a subject, facts, a signature, or any extra key.",
    `The channel is ${template.channel}; never introduce the other channel.`,
  ].join("\n");
}

function assistanceUserContent(
  template: RenewalCopyTemplateDefinition,
  selection: RenewalCopySelection,
): string {
  const editableRegions = selection.editableRegions as Record<string, string>;
  return [
    "Editable prose only:",
    ...template.regions.map((region) => `${region.id}: ${editableRegions[region.id]}`),
    "Return the rewritten regions as JSON.",
  ].join("\n");
}

function assistanceSchema(template: RenewalCopyTemplateDefinition) {
  return {
    type: "object",
    properties: {
      regions: {
        type: "object",
        properties: Object.fromEntries(
          template.regions.map((region) => [region.id, { type: "string" }]),
        ),
        required: template.regions.map((region) => region.id),
        additionalProperties: false,
      },
    },
    required: ["regions"],
    additionalProperties: false,
  } as const;
}

function parseAssistanceOutput(raw: string): Record<string, string> | null {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```$/u, "")
    .trim();
  try {
    const parsed = JSON.parse(stripped) as { regions?: unknown };
    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      Object.keys(parsed).length !== 1 ||
      !parsed.regions
    ) {
      return null;
    }
    if (
      typeof parsed.regions !== "object" ||
      Array.isArray(parsed.regions) ||
      Object.values(parsed.regions).some((value) => typeof value !== "string")
    ) {
      return null;
    }
    return parsed.regions as Record<string, string>;
  } catch {
    return null;
  }
}

function assistanceFallback(
  template: RenewalCopyTemplateSummary,
  selection: RenewalCopySelection,
): RenewalCopyAssistOutcome {
  return {
    status: "ready",
    template,
    selection: cloneSelection(selection),
    usedModel: false,
    refusedBeforeModel: false,
    errors: [
      "Assistance was unavailable or unsafe; the current approved prose was kept.",
    ],
  };
}

function cloneSelection(selection: RenewalCopySelection): RenewalCopySelection {
  return RenewalCopySelectionSchema.parse(JSON.parse(JSON.stringify(selection)));
}

function countOccurrences(value: string, search: string): number {
  return search === "" ? 0 : value.split(search).length - 1;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("Renewal copy assistance timed out.")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
}
