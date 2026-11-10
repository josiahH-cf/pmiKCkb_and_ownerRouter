// S265 (R-S265-2 through R-S265-4, ARCH-S265-2 and ARCH-S265-4): one inclusion projection over the
// exact final content of a tenant message.
//
// The exact subject and body decide which tenant resources a message includes, including staff
// wording edits made in the lease editor or in Communications: a mention of the resource (its
// wording, link label or fill-in marker), a link labeled as the resource, or a link to the saved
// destination. An included resource must be usable for tenants, appear as its current link, keep
// its wording where the resource needs it and, when its check is restricted, cover every actual
// recipient. A resource the decisions require must be present. Each failure is a precise item
// with the resource's Connections fix; a resource the message omits contributes nothing.
//
// The included resources' frozen evidence is the reviewed basis that draft export, immediate send
// and scheduled dispatch recheck (`checkFrozenTenantResources`). A message reviewed before S265
// carries no basis; its stored content decides whether it includes a resource.
//
// Pure and client-safe.

import { UNVERIFIED_PLACEHOLDER } from "@/lib/constants";
import type {
  RenewalMessageContent,
  RenewalMessageFacts,
} from "./renewal-message-content";
import {
  currentTenantResourceDecisions,
  projectTenantResourceRequirements,
  type MaterialTransitionHold,
  type TenantResourceDecisions,
  type TenantResourceRequirements,
} from "./tenant-resource-decisions";
import {
  TENANT_RESOURCE_IDS,
  TENANT_RESOURCE_MESSAGE_FIELDS,
  TENANT_RESOURCE_NAMES,
  checkFrozenTenantResources,
  tenantAudienceCovers,
  tenantResourcePendingMessage,
  type FrozenTenantResource,
  type FrozenTenantResourceVerdict,
  type TenantResourceEffect,
  type TenantResourceId,
  type TenantResourceMessageField,
  type TenantResourceUses,
} from "./tenant-resource-evidence";

/** The exact text a message carries: its subject and both renderings of its body. */
export interface TenantResourceContentView {
  readonly subject: string;
  readonly plainText: string;
  readonly htmlBody?: string | null;
}

/** One resource as the inclusion projection sees it now. */
export type TenantResourceState =
  | {
      readonly usable: true;
      readonly url: string;
      /** The bound evidence; the server has it, a browser view does not need it. */
      readonly evidence?: FrozenTenantResource;
    }
  | {
      readonly usable: false;
      /** Why it is Source pending; absent keeps the note a message carried before S265. */
      readonly reason?: string;
      /** The saved link, so content that still links it is recognized. */
      readonly url: string | null;
    };
export type TenantResourceStates = Readonly<
  Record<TenantResourceId, TenantResourceState>
>;

export type TenantResourceProblemKind =
  | "pending"
  | "required_absent"
  | "link_mismatch"
  | "link_missing"
  | "wording_missing"
  | "audience_not_covered";

export interface TenantResourceProblem {
  readonly resourceId: TenantResourceId;
  readonly field: TenantResourceMessageField;
  readonly kind: TenantResourceProblemKind;
  readonly message: string;
}

export interface TenantResourceInclusion {
  /** The resources the exact content includes, valid or not, in catalog order. */
  readonly includedIds: readonly TenantResourceId[];
  /** The frozen evidence of each included resource that passed every check. */
  readonly included: readonly FrozenTenantResource[];
  readonly problems: readonly TenantResourceProblem[];
  readonly required: readonly TenantResourceId[];
  readonly holds: readonly MaterialTransitionHold[];
}

export const EMPTY_TENANT_RESOURCE_INCLUSION: TenantResourceInclusion = {
  includedIds: [],
  included: [],
  problems: [],
  required: [],
  holds: [],
};

const PHRASES: Record<TenantResourceId, RegExp> = {
  insurance_flyer: /\binsurance flyer\b/i,
  rbp_flyer: /\bresident benefits? package (?:information|flyer)\b|\brbp flyer\b/i,
  renewal_information_form: /\binformation form\b/i,
};
const MARKER = new RegExp(
  `\\[${UNVERIFIED_PLACEHOLDER.split("<fact>")[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^\\]\\n]*\\]`,
  "g",
);
const URL_PATTERN = /https:\/\/[^\s<>"'`]+/g;
const ANCHOR_PATTERN = /<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;

function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
function trimUrl(raw: string): string {
  return raw.replace(/[.,;:!?)\]]+$/, "");
}

interface Mention {
  mentioned: boolean;
  urls: string[];
  wording: boolean;
}

/**
 * How each resource appears in the exact content. `known` holds each resource's saved link, so a
 * link to the destination counts even without its label.
 */
export function tenantResourceMentions(
  content: TenantResourceContentView,
  known: Readonly<Partial<Record<TenantResourceId, string | null>>>,
): Record<TenantResourceId, Mention> {
  const mentions = Object.fromEntries(
    TENANT_RESOURCE_IDS.map((id) => [id, { mentioned: false, urls: [], wording: false }]),
  ) as unknown as Record<TenantResourceId, Mention>;
  const attribute = (url: string, label: string) => {
    for (const id of TENANT_RESOURCE_IDS) {
      const mention = mentions[id];
      if (
        (known[id] && known[id] === url) ||
        (label && PHRASES[id].test(label.replace(MARKER, " ")))
      ) {
        mention.mentioned = true;
        if (!mention.urls.includes(url)) mention.urls.push(url);
      }
    }
  };
  const lines = `${content.subject}\n${content.plainText}`.split("\n");
  for (const line of lines) {
    const unmarked = line.replace(MARKER, (marker) => {
      // A fill-in marker for a resource link names the resource; it is never its wording.
      for (const id of TENANT_RESOURCE_IDS)
        if (PHRASES[id].test(marker)) mentions[id].mentioned = true;
      return " ";
    });
    let segmentStart = 0;
    let hasUrl = false;
    for (const match of unmarked.matchAll(URL_PATTERN)) {
      hasUrl = true;
      const url = trimUrl(match[0]);
      attribute(url, unmarked.slice(segmentStart, match.index));
      segmentStart = (match.index ?? 0) + match[0].length;
    }
    for (const id of TENANT_RESOURCE_IDS)
      if (PHRASES[id].test(unmarked)) {
        mentions[id].mentioned = true;
        if (!hasUrl) mentions[id].wording = true;
      }
  }
  for (const match of (content.htmlBody ?? "").matchAll(ANCHOR_PATTERN)) {
    const href = decodeEntities(match[1]);
    if (!href.startsWith("https://")) continue;
    attribute(href, decodeEntities(match[2].replace(/<[^>]*>/g, "")));
  }
  return mentions;
}

/** Resources whose wording must stay with their link when they are included. */
function needsWording(id: TenantResourceId, required: boolean): boolean {
  return id === "renewal_information_form" || (id === "insurance_flyer" && required);
}

/**
 * The one inclusion projection. `requirements` come from the offer's decisions; `recipients` are
 * the actual recipients of this exact message when known (server side).
 */
export function projectTenantResourceInclusion(input: {
  readonly content: TenantResourceContentView;
  readonly states: TenantResourceStates;
  readonly requirements: TenantResourceRequirements;
  readonly recipients?: readonly string[];
}): TenantResourceInclusion {
  const known = Object.fromEntries(
    TENANT_RESOURCE_IDS.map((id) => [id, input.states[id].url]),
  ) as Partial<Record<TenantResourceId, string | null>>;
  const mentions = tenantResourceMentions(input.content, known);
  const includedIds: TenantResourceId[] = [];
  const included: FrozenTenantResource[] = [];
  const problems: TenantResourceProblem[] = [];
  for (const id of TENANT_RESOURCE_IDS) {
    const state = input.states[id];
    const mention = mentions[id];
    const required = input.requirements.required.includes(id);
    const name = TENANT_RESOURCE_NAMES[id];
    const problem = (kind: TenantResourceProblemKind, message: string) =>
      problems.push({
        resourceId: id,
        field: TENANT_RESOURCE_MESSAGE_FIELDS[id],
        kind,
        message,
      });
    if (!mention.mentioned && mention.urls.length === 0) {
      if (required)
        problem(
          "required_absent",
          `This offer needs the ${name} with its wording. The edited wording leaves it out.`,
        );
      continue;
    }
    includedIds.push(id);
    if (!state.usable) {
      problem("pending", tenantResourcePendingMessage(id, state.reason));
      continue;
    }
    if (mention.urls.some((url) => url !== state.url)) {
      problem(
        "link_mismatch",
        `The ${name} link in this message is not its current saved link. Use the current link or review the wording again.`,
      );
      continue;
    }
    if (!mention.urls.includes(state.url)) {
      problem(
        "link_missing",
        `This message mentions the ${name} without its verified link. Keep the link with its wording.`,
      );
      continue;
    }
    if (needsWording(id, required) && !mention.wording) {
      problem(
        "wording_missing",
        id === "renewal_information_form"
          ? "Keep the renewal information form request and its verified link together."
          : "Keep the insurance change wording with the insurance flyer link.",
      );
      continue;
    }
    if (
      input.recipients &&
      state.evidence &&
      !tenantAudienceCovers(state.evidence.audience, input.recipients)
    ) {
      problem(
        "audience_not_covered",
        `The ${name} link is restricted to named recipients and does not cover everyone this message goes to.`,
      );
      continue;
    }
    if (state.evidence) included.push(state.evidence);
  }
  return {
    includedIds,
    included,
    problems,
    required: input.requirements.required,
    holds: input.requirements.holds,
  };
}

/** The states a browser view can know from the message facts: usable links and pending reasons. */
export function tenantResourceStatesFromFacts(
  facts: Pick<
    RenewalMessageFacts,
    "insuranceFlyer" | "rbpFlyer" | "informationForm" | "resourcePending"
  >,
): TenantResourceStates {
  return Object.fromEntries(
    TENANT_RESOURCE_IDS.map((id) => {
      const field = TENANT_RESOURCE_MESSAGE_FIELDS[id];
      const link = facts[field];
      return [
        id,
        link?.url
          ? { usable: true, url: link.url }
          : { usable: false, reason: facts.resourcePending?.[field], url: null },
      ];
    }),
  ) as unknown as TenantResourceStates;
}

/** The states the server knows from one settings read, with each usable resource's evidence. */
export function tenantResourceStatesFromUses(
  uses: TenantResourceUses,
): TenantResourceStates {
  return Object.fromEntries(
    TENANT_RESOURCE_IDS.map((id) => {
      const use = uses[id];
      return [
        id,
        use.state === "usable"
          ? { usable: true, url: use.url, evidence: use.evidence }
          : { usable: false, reason: use.reason, url: use.url },
      ];
    }),
  ) as unknown as TenantResourceStates;
}

/** The offer's decisions: those supplied (S264) or today's existing logic from the facts. */
export function tenantResourceDecisionsOf(
  facts: Pick<
    RenewalMessageFacts,
    "charges" | "insuranceTransition" | "resourceDecisions"
  >,
): TenantResourceDecisions {
  return facts.resourceDecisions ?? currentTenantResourceDecisions(facts);
}

/**
 * The tenant message's final content with each inclusion problem added to its callout, once, and
 * the inclusion itself. A pending link the composition already noted keeps that one note. Only an
 * outgoing tenant message is projected.
 */
export function applyTenantResourceInclusion(
  content: RenewalMessageContent,
  facts: RenewalMessageFacts,
  options: {
    readonly states?: TenantResourceStates;
    readonly recipients?: readonly string[];
  } = {},
): { content: RenewalMessageContent; inclusion: TenantResourceInclusion } {
  if (facts.channel !== "tenant" || !facts.outgoingContract)
    return { content, inclusion: EMPTY_TENANT_RESOURCE_INCLUSION };
  const states = options.states ?? tenantResourceStatesFromFacts(facts);
  const requirements = projectTenantResourceRequirements(
    tenantResourceDecisionsOf(facts),
    states.renewal_information_form.usable,
  );
  const inclusion = projectTenantResourceInclusion({
    content,
    states,
    requirements,
    recipients: options.recipients,
  });
  const missing = [...content.missing];
  for (const problem of inclusion.problems) {
    if (
      problem.kind === "pending" &&
      missing.some((entry) => entry.field === problem.field)
    )
      continue;
    if (
      missing.some(
        (entry) => entry.field === problem.field && entry.message === problem.message,
      )
    )
      continue;
    missing.push({ field: problem.field, message: problem.message });
  }
  return { content: { ...content, missing }, inclusion };
}

/**
 * For content reviewed before S265 (no included-resource basis): the first tenant resource its
 * stored text includes, or null when the text proves it omits all three.
 */
export function legacyIncludedTenantResource(
  content: TenantResourceContentView,
  uses: TenantResourceUses | null,
): TenantResourceId | null {
  const known = uses
    ? (Object.fromEntries(TENANT_RESOURCE_IDS.map((id) => [id, uses[id].url])) as Partial<
        Record<TenantResourceId, string | null>
      >)
    : {};
  const mentions = tenantResourceMentions(content, known);
  return (
    TENANT_RESOURCE_IDS.find(
      (id) => mentions[id].mentioned || mentions[id].urls.length > 0,
    ) ?? null
  );
}

/** The included-resource basis an authorization freezes for each of its messages. */
export interface AuthorizedTenantResourceBasis {
  readonly initial: readonly FrozenTenantResource[];
  readonly followUp: readonly FrozenTenantResource[] | null;
}

/**
 * The included-resource check for one unsent effect: an authorized occurrence (index 0 is the
 * initial message, later ones the follow-up) or a reviewed draft. With a basis, its frozen
 * evidence is rechecked; without one (reviewed before S265), stored content that includes a tenant
 * resource holds for review and content that omits all three passes.
 */
export function tenantResourceEffectVerdict(input: {
  readonly basis: readonly FrozenTenantResource[] | undefined;
  readonly content: TenantResourceContentView;
  readonly uses: TenantResourceUses | null;
  readonly recipients: readonly string[];
  readonly effect: TenantResourceEffect;
}): FrozenTenantResourceVerdict {
  if (input.basis)
    return checkFrozenTenantResources(
      input.basis,
      input.uses,
      input.recipients,
      input.effect,
    );
  const included = legacyIncludedTenantResource(input.content, input.uses);
  if (!included) return { ok: true };
  return {
    ok: false,
    kind: "changed",
    resourceId: included,
    message: `This message was reviewed before tenant link checks and includes the ${TENANT_RESOURCE_NAMES[included]}. ${input.effect === "draft" ? "No Gmail draft was created." : "Nothing was sent."} Review the message again.`,
  };
}

/** The frozen basis for the occurrence an authorization would dispatch next. */
export function authorizedOccurrenceBasis(
  basis: AuthorizedTenantResourceBasis | undefined,
  index: number,
): readonly FrozenTenantResource[] | undefined {
  if (!basis) return undefined;
  return index === 0 ? basis.initial : (basis.followUp ?? []);
}
