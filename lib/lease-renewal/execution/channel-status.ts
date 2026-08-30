export type RenewalEvidenceChannel = "email" | "portal" | "sms";

interface RenewalChannelEventBase {
  workflowId: string;
  channel: RenewalEvidenceChannel;
  occurredAtIso: string;
  evidenceRef: string;
}

export type RenewalChannelEvent =
  | (RenewalChannelEventBase & { type: "intent_recorded" })
  | (RenewalChannelEventBase & {
      type: "preview_prepared";
      previewHash: string;
    })
  | (RenewalChannelEventBase & {
      type: "unsent_draft_created";
      draftId: string;
      executionId: string;
    })
  | (RenewalChannelEventBase & {
      type: "human_external_action_reported";
      actorRef: string;
    })
  | (RenewalChannelEventBase & {
      type: "provider_delivery_verified";
      providerMessageRef: string;
    })
  | (RenewalChannelEventBase & {
      type: "provider_reply_verified";
      providerMessageRef: string;
      providerThreadRef: string;
    });

export type RenewalChannelEvidencePublication =
  | { status: "review_only"; reason: string }
  | {
      status: "approved";
      approvedAtIso: string;
      evidenceRef: `client-approval:${string}`;
    };

export interface RenewalChannelEvidenceRule {
  channel: RenewalEvidenceChannel;
  ref: `${RenewalEvidenceChannel}-renewal-evidence:v1.0`;
  version: "v1.0";
  providerMessageRefPrefix?: string;
  providerThreadRefPrefix?: string;
  publication: Readonly<RenewalChannelEvidencePublication>;
}

const CURRENT_EVIDENCE_RULES = Object.freeze({
  email: createRenewalChannelEvidenceRule({
    channel: "email",
    ref: "email-renewal-evidence:v1.0",
    version: "v1.0",
    providerMessageRefPrefix: "gmail:message:",
    providerThreadRefPrefix: "gmail:thread:",
    publication: {
      status: "review_only",
      reason:
        "Client-approved Gmail contact/reply evidence rules have not been supplied.",
    },
  }),
  portal: createRenewalChannelEvidenceRule({
    channel: "portal",
    ref: "portal-renewal-evidence:v1.0",
    version: "v1.0",
    publication: {
      status: "review_only",
      reason:
        "Client-approved portal evidence and provider references have not been supplied.",
    },
  }),
  sms: createRenewalChannelEvidenceRule({
    channel: "sms",
    ref: "sms-renewal-evidence:v1.0",
    version: "v1.0",
    publication: {
      status: "review_only",
      reason:
        "Client-approved SMS evidence and provider references have not been supplied.",
    },
  }),
});

export function createRenewalChannelEvidenceRule(
  input: RenewalChannelEvidenceRule,
): RenewalChannelEvidenceRule {
  if (
    input.ref !== `${input.channel}-renewal-evidence:${input.version}` ||
    (input.providerMessageRefPrefix !== undefined &&
      !input.providerMessageRefPrefix.trim()) ||
    (input.providerThreadRefPrefix !== undefined && !input.providerThreadRefPrefix.trim())
  ) {
    throw new Error(
      "A channel evidence rule requires exact channel/version/provider identity.",
    );
  }
  if (input.publication.status === "approved") {
    if (
      !input.providerMessageRefPrefix ||
      !Number.isFinite(Date.parse(input.publication.approvedAtIso)) ||
      !input.publication.evidenceRef.startsWith("client-approval:") ||
      input.publication.evidenceRef === "client-approval:"
    ) {
      throw new Error(
        "An approved channel evidence rule requires dated client approval.",
      );
    }
  } else if (!input.publication.reason.trim()) {
    throw new Error("A review-only channel evidence rule requires a reason.");
  }
  return deepFreeze({
    ...input,
    publication: { ...input.publication },
  });
}

export function currentRenewalChannelEvidenceRule(
  channel: RenewalEvidenceChannel,
): RenewalChannelEvidenceRule {
  return CURRENT_EVIDENCE_RULES[channel];
}

export interface RenewalChannelTruth {
  workflowId: string;
  channel: RenewalEvidenceChannel;
  evidenceRuleRef: RenewalChannelEvidenceRule["ref"];
  evidenceRuleVersion: RenewalChannelEvidenceRule["version"];
  evidenceRuleStatus: RenewalChannelEvidencePublication["status"];
  phase:
    | "not_started"
    | "intent"
    | "prepared_preview"
    | "unsent_draft"
    | "human_action_reported"
    | "contact_verified"
    | "reply_verified";
  intentRecorded: boolean;
  previewPrepared: boolean;
  unsentDraftCreated: boolean;
  humanExternalActionReported: boolean;
  contactVerified: boolean;
  replyVerified: boolean;
  evidenceRefs: readonly string[];
  claim: string;
}

/**
 * S74 evidence taxonomy. App intent, a prepared preview, an unsent Gmail draft, a human report, a
 * provider delivery receipt, and a provider reply never collapse into one another. Provider-backed
 * contact/reply additionally requires one exact, client-approved channel evidence rule.
 */
export function projectRenewalChannelTruth(input: {
  workflowId: string;
  channel: RenewalEvidenceChannel;
  events: readonly RenewalChannelEvent[];
  evidenceRule?: RenewalChannelEvidenceRule;
}): RenewalChannelTruth {
  const evidenceRule = input.evidenceRule
    ? createRenewalChannelEvidenceRule(input.evidenceRule)
    : currentRenewalChannelEvidenceRule(input.channel);
  if (evidenceRule.channel !== input.channel) {
    throw new Error("Renewal channel evidence rules cannot cross channel identity.");
  }
  const events = [...input.events]
    .map((event) => validateEvent(event, evidenceRule))
    .map((event) => {
      if (event.workflowId !== input.workflowId || event.channel !== input.channel) {
        throw new Error(
          "Renewal channel evidence cannot cross workflow or channel identity.",
        );
      }
      return event;
    })
    .sort(
      (left, right) =>
        left.occurredAtIso.localeCompare(right.occurredAtIso) ||
        left.evidenceRef.localeCompare(right.evidenceRef),
    );
  const types = new Set(events.map((event) => event.type));
  const intentRecorded = types.has("intent_recorded");
  const previewPrepared = types.has("preview_prepared");
  const unsentDraftCreated = types.has("unsent_draft_created");
  const humanExternalActionReported = types.has("human_external_action_reported");
  const providerDelivery = types.has("provider_delivery_verified");
  const replyVerified = types.has("provider_reply_verified");
  const contactVerified = providerDelivery || replyVerified;
  const phase = replyVerified
    ? "reply_verified"
    : contactVerified
      ? "contact_verified"
      : humanExternalActionReported
        ? "human_action_reported"
        : unsentDraftCreated
          ? "unsent_draft"
          : previewPrepared
            ? "prepared_preview"
            : intentRecorded
              ? "intent"
              : "not_started";
  const claim = replyVerified
    ? "Provider-backed reply evidence verified under the approved channel rule."
    : contactVerified
      ? "Provider-backed delivery evidence verified under the approved channel rule."
      : humanExternalActionReported
        ? "A human reported an external action; provider contact is not verified."
        : unsentDraftCreated
          ? "An unsent draft exists; contact is not verified."
          : previewPrepared
            ? "A preview was prepared; no draft or contact is verified."
            : intentRecorded
              ? "Outreach intent was recorded; no draft or contact is verified."
              : "No outreach evidence is recorded.";

  return {
    workflowId: input.workflowId,
    channel: input.channel,
    evidenceRuleRef: evidenceRule.ref,
    evidenceRuleVersion: evidenceRule.version,
    evidenceRuleStatus: evidenceRule.publication.status,
    phase,
    intentRecorded,
    previewPrepared,
    unsentDraftCreated,
    humanExternalActionReported,
    contactVerified,
    replyVerified,
    evidenceRefs: Object.freeze([...new Set(events.map((event) => event.evidenceRef))]),
    claim,
  };
}

export interface RenewalChannelReceipts {
  email?: string;
  portal?: string;
  sms?: string;
}

/**
 * Compatibility projection for legacy raw receipt maps. A bare string has no approved evidence-rule
 * identity, source time, workflow binding, or provider shape, so it can never earn a verified claim.
 */
export function renewalOutreachStatus(receipts: RenewalChannelReceipts) {
  const rawReceiptsPresent = Boolean(receipts.email || receipts.portal || receipts.sms);
  return {
    complete: false,
    emailVerified: false,
    portalVerified: false,
    smsVerified: false,
    rawReceiptsPresent,
    claim: rawReceiptsPresent
      ? "Legacy receipt strings are present, but delivery is not verified without an approved channel evidence rule."
      : "Cross-channel delivery is not verified.",
  };
}

function validateEvent(
  event: RenewalChannelEvent,
  evidenceRule: RenewalChannelEvidenceRule,
): RenewalChannelEvent {
  if (
    !event.workflowId.trim() ||
    !event.evidenceRef.trim() ||
    !Number.isFinite(Date.parse(event.occurredAtIso))
  ) {
    throw new Error(
      "Renewal channel evidence requires exact identity, time, and reference.",
    );
  }
  if (event.type === "preview_prepared" && !/^[a-f0-9]{64}$/.test(event.previewHash)) {
    throw new Error("A prepared renewal preview requires its exact preview hash.");
  }
  if (
    event.type === "unsent_draft_created" &&
    (!event.draftId.trim() || !/^exec_[a-f0-9]{40}$/.test(event.executionId))
  ) {
    throw new Error(
      "An unsent renewal draft requires exact draft and execution identity.",
    );
  }
  if (event.type === "human_external_action_reported" && !event.actorRef.trim()) {
    throw new Error("A human action report requires exact managed-actor identity.");
  }
  if (
    event.type === "provider_delivery_verified" ||
    event.type === "provider_reply_verified"
  ) {
    if (evidenceRule.publication.status !== "approved") {
      throw new Error(
        `Provider contact cannot be verified for ${event.channel} until its client-approved evidence rule is published.`,
      );
    }
    if (
      !evidenceRule.providerMessageRefPrefix ||
      !event.providerMessageRef.startsWith(evidenceRule.providerMessageRefPrefix) ||
      event.evidenceRef !== event.providerMessageRef
    ) {
      throw new Error(
        "Provider contact evidence does not match the approved channel rule.",
      );
    }
    if (
      event.type === "provider_reply_verified" &&
      (!evidenceRule.providerThreadRefPrefix ||
        !event.providerThreadRef.startsWith(evidenceRule.providerThreadRefPrefix))
    ) {
      throw new Error(
        "Provider reply evidence does not match the approved channel rule.",
      );
    }
  }
  return event;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>))
      deepFreeze(nested);
  }
  return value;
}
