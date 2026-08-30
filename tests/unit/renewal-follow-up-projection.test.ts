import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  WorkflowCommunicationContextSchema,
  type WorkflowCommunicationLink,
} from "@/lib/gmail-hub/workflow-context";
import {
  DEFAULT_NOTICE_RULE_SET,
  DEFAULT_NOTICE_RULE_VALUES,
  type NoticeRuleSnapshot,
} from "@/lib/lease-renewal/notice-rules";
import {
  buildRenewalFollowUpProjection,
  type RenewalFollowUpProjectionInput,
} from "@/lib/lease-renewal/follow-up-projection";

const AS_OF = "2026-08-24T12:00:00.000Z";

const missingPolicy: NoticeRuleSnapshot = {
  state: "missing",
  ruleSet: DEFAULT_NOTICE_RULE_SET,
  version: null,
  updatedAtIso: null,
};

const confirmedPolicy: NoticeRuleSnapshot = {
  state: "saved",
  version: 9,
  updatedAtIso: "2026-08-20T09:00:00.000Z",
  ruleSet: {
    rules: [
      {
        scope: "global",
        values: { ...DEFAULT_NOTICE_RULE_VALUES, followUpIntervalDays: 45 },
        verified: true,
      },
      {
        scope: "property",
        key: "property-7",
        values: { followUpIntervalDays: 7 },
        verified: true,
      },
      {
        scope: "lease",
        key: "lease-42",
        values: { followUpIntervalDays: 3 },
        verified: true,
      },
    ],
  },
};

function link(
  overrides: Partial<WorkflowCommunicationLink> = {},
): WorkflowCommunicationLink {
  return {
    id: "link-current",
    actor_uid: "operator-1",
    mailbox_key: "mailbox-hash",
    lane: "renewals",
    entity_type: "renewal_lease",
    entity_id: "lease-42",
    purpose: "renewal_tenant",
    origin_action_key: "gmail.mailbox.read",
    source_refs: ["rentvine:lease:lease-42"],
    gmail_thread_id: "thread-current",
    status: "linked",
    waiting_on: "resident",
    last_contact_at_ms: Date.parse("2026-08-20T12:00:00.000Z"),
    last_contact_source: "gmail_thread",
    last_contact_message_id: "message-current",
    contact_observation_state: "current",
    created_at_ms: Date.parse("2026-08-20T12:00:00.000Z"),
    updated_at_ms: Date.parse("2026-08-20T12:00:00.000Z"),
    retention_policy_ref: "communications-retention:v1.0",
    retention_class: "workflow_link",
    expires_at_ms: null,
    ...overrides,
  } as WorkflowCommunicationLink;
}

function input(
  overrides: Partial<RenewalFollowUpProjectionInput> = {},
): RenewalFollowUpProjectionInput {
  return {
    leaseId: "lease-42",
    propertyKey: "property-7",
    asOfIso: AS_OF,
    communicationState: "current",
    links: [],
    policy: missingPolicy,
    preferredPurpose: "renewal_tenant",
    ...overrides,
  };
}

describe("buildRenewalFollowUpProjection", () => {
  it("keeps missing communication and policy explicitly unverifiable and creates no effect", () => {
    const projection = buildRenewalFollowUpProjection(input());

    expect(projection.version).toBe("renewal-follow-up-v1");
    expect(projection.waiting).toMatchObject({
      state: "needs_verification",
      party: null,
    });
    expect(projection.lastContact).toMatchObject({
      state: "needs_verification",
      atIso: null,
    });
    expect(projection.policy).toMatchObject({
      state: "unset",
      label: "Timing policy not confirmed",
      version: null,
      intervalDays: null,
    });
    expect(projection.due).toEqual({ state: "unset", atIso: null });
    expect(projection.attention).toBeNull();
  });

  it("shows exact provider contact while policy remains unset and non-actionable", () => {
    const projection = buildRenewalFollowUpProjection(input({ links: [link()] }));

    expect(projection.waiting).toMatchObject({
      state: "verified",
      party: "tenant",
      source: {
        kind: "gmail_thread",
        linkId: "link-current",
        threadId: "thread-current",
        messageId: "message-current",
        purpose: "renewal_tenant",
      },
    });
    expect(projection.lastContact).toEqual({
      state: "verified",
      atIso: "2026-08-20T12:00:00.000Z",
      source: {
        kind: "gmail_thread",
        linkId: "link-current",
        threadId: "thread-current",
        messageId: "message-current",
        purpose: "renewal_tenant",
      },
    });
    expect(projection.policy.state).toBe("unset");
    expect(projection.due.state).toBe("unset");
    expect(projection.attention).toBeNull();
  });

  it("resolves lease over property over global and produces one exact internal due item", () => {
    const projection = buildRenewalFollowUpProjection(
      input({ links: [link()], policy: confirmedPolicy }),
    );

    expect(projection.policy).toMatchObject({
      state: "confirmed",
      version: 9,
      effectiveScope: "lease",
      effectiveKey: "lease-42",
      intervalDays: 3,
    });
    expect(projection.due).toEqual({
      state: "due",
      atIso: "2026-08-23T12:00:00.000Z",
    });
    expect(projection.attention).toEqual({
      kind: "renewal_follow_up",
      leaseId: "lease-42",
      dueAtIso: "2026-08-23T12:00:00.000Z",
      lastContactAtIso: "2026-08-20T12:00:00.000Z",
      dedupeKey:
        "renewal-follow-up-v1:lease-42:9:lease:lease-42:message-current:2026-08-23T12:00:00.000Z",
      policyVersion: 9,
      policyScope: "lease",
      sourceRefs: [
        "gmail-link:link-current",
        "gmail-thread:thread-current",
        "gmail-message:message-current",
        "notice-policy:active:v9:lease:lease-42",
      ],
    });
    expect(
      buildRenewalFollowUpProjection(input({ links: [link()], policy: confirmedPolicy })),
    ).toEqual(projection);
  });

  it("selects the latest provider contact rather than the most recently rewritten link", () => {
    const latestContact = link({
      id: "link-latest-contact",
      gmail_thread_id: "thread-latest-contact",
      last_contact_message_id: "message-latest-contact",
      last_contact_at_ms: Date.parse("2026-08-22T12:00:00.000Z"),
      updated_at_ms: Date.parse("2026-08-22T12:00:00.000Z"),
    });
    const laterRewriteWithOlderEvidence = link({
      id: "link-later-rewrite",
      gmail_thread_id: "thread-later-rewrite",
      last_contact_message_id: "message-older",
      last_contact_at_ms: Date.parse("2026-08-19T12:00:00.000Z"),
      updated_at_ms: Date.parse("2026-08-23T12:00:00.000Z"),
    });

    const projection = buildRenewalFollowUpProjection(
      input({ links: [laterRewriteWithOlderEvidence, latestContact] }),
    );
    expect(projection.lastContact.source?.linkId).toBe("link-latest-contact");
    expect(projection.lastContact.atIso).toBe("2026-08-22T12:00:00.000Z");
  });

  it("never substitutes the wrong communication party for the process-preferred channel", () => {
    const projection = buildRenewalFollowUpProjection(
      input({ links: [link()], preferredPurpose: "renewal_owner" }),
    );
    expect(projection.linkedThread).toBeNull();
    expect(projection.waiting.state).toBe("needs_verification");
    expect(projection.lastContact.state).toBe("needs_verification");
  });

  it("does not hide a recent unreadable observation behind older valid contact", () => {
    const olderValid = link({
      id: "link-valid",
      last_contact_at_ms: Date.parse("2026-08-22T12:00:00.000Z"),
      updated_at_ms: Date.parse("2026-08-22T12:00:00.000Z"),
    });
    const recentFailure = link({
      id: "link-unavailable",
      gmail_thread_id: "thread-unavailable",
      last_contact_at_ms: Date.parse("2026-08-19T12:00:00.000Z"),
      updated_at_ms: Date.parse("2026-08-23T12:00:00.000Z"),
      contact_observation_state: "needs_verification",
      contact_observation_reason: "thread_unavailable",
    });
    const projection = buildRenewalFollowUpProjection(
      input({ links: [olderValid, recentFailure], policy: confirmedPolicy }),
    );
    expect(projection.linkedThread?.linkId).toBe("link-unavailable");
    expect(projection.waiting.state).toBe("needs_verification");
    expect(projection.due).toEqual({ state: "needs_verification", atIso: null });
    expect(projection.attention).toBeNull();
  });

  it("does not repeat stale contact or waiting claims after a linked thread becomes unreadable", () => {
    const projection = buildRenewalFollowUpProjection(
      input({
        links: [
          link({
            contact_observation_state: "needs_verification",
            contact_observation_reason: "thread_unavailable",
          }),
        ],
        policy: confirmedPolicy,
      }),
    );

    expect(projection.waiting).toMatchObject({
      state: "needs_verification",
      party: null,
    });
    expect(projection.lastContact.state).toBe("needs_verification");
    expect(projection.linkedThread).toMatchObject({
      linkId: "link-current",
      threadId: "thread-current",
      observationState: "needs_verification",
    });
    expect(projection.due).toEqual({ state: "needs_verification", atIso: null });
    expect(projection.attention).toBeNull();
  });

  it("suppresses only the exact dismissed key and reopens deterministically on policy version change", () => {
    const open = buildRenewalFollowUpProjection(
      input({ links: [link()], policy: confirmedPolicy }),
    );
    const dismissed = buildRenewalFollowUpProjection(
      input({
        links: [link()],
        policy: confirmedPolicy,
        dismissedAttentionKeys: [open.workItem!.dedupeKey],
      }),
    );
    expect(dismissed.attentionState).toBe("dismissed");
    expect(dismissed.attention).toBeNull();
    expect(dismissed.workItem).toEqual(open.workItem);

    const changedPolicy = {
      ...confirmedPolicy,
      version: 10,
      updatedAtIso: "2026-08-24T13:00:00.000Z",
    };
    const reopenedByNewIdentity = buildRenewalFollowUpProjection(
      input({
        links: [link()],
        policy: changedPolicy,
        dismissedAttentionKeys: [open.workItem!.dedupeKey],
      }),
    );
    expect(reopenedByNewIdentity.attentionState).toBe("open");
    expect(reopenedByNewIdentity.attention?.policyVersion).toBe(10);
    expect(reopenedByNewIdentity.attention?.dedupeKey).not.toBe(open.workItem!.dedupeKey);
  });

  it("uses process evidence only for document-coordinator or unresolved-source fallback", () => {
    const documentProjection = buildRenewalFollowUpProjection(
      input({
        processFallback: {
          party: "document_coordinator",
          sourceRef: "renewal-process:renewal-v1:document-packet",
        },
      }),
    );
    expect(documentProjection.waiting).toMatchObject({
      state: "verified",
      party: "document_coordinator",
      source: {
        kind: "renewal_process",
        ref: "renewal-process:renewal-v1:document-packet",
      },
    });

    const sourceProjection = buildRenewalFollowUpProjection(
      input({
        processFallback: {
          party: "unresolved_source",
          sourceRef: "renewal-process:renewal-v1:verify-renewal",
        },
      }),
    );
    expect(sourceProjection.waiting.party).toBe("unresolved_source");
    expect(sourceProjection.due.state).toBe("unset");
  });

  it("keeps disabled and unreadable policy explicit and effect-free", () => {
    const disabledPolicy: NoticeRuleSnapshot = {
      ...confirmedPolicy,
      ruleSet: {
        rules: [
          {
            scope: "global",
            values: { ...DEFAULT_NOTICE_RULE_VALUES, enabled: false },
            verified: true,
          },
        ],
      },
    };
    const disabled = buildRenewalFollowUpProjection(
      input({ links: [link()], policy: disabledPolicy }),
    );
    expect(disabled.policy.state).toBe("disabled");
    expect(disabled.due).toEqual({ state: "disabled", atIso: null });
    expect(disabled.workItem).toBeNull();

    const unreadable = buildRenewalFollowUpProjection(
      input({
        links: [link()],
        policy: { ...missingPolicy, state: "unreadable" },
      }),
    );
    expect(unreadable.policy.state).toBe("unreadable");
    expect(unreadable.due).toEqual({ state: "unset", atIso: null });
    expect(unreadable.workItem).toBeNull();
  });
});

describe("S75 provider/effect boundary", () => {
  it("keeps the exact renewal-lease Gmail context read-only", () => {
    const base = {
      lane: "renewals",
      entityType: "renewal_lease",
      entityId: "lease-42",
      purpose: "renewal_tenant",
      sourceRefs: ["rentvine:lease:lease-42"],
    } as const;
    expect(
      WorkflowCommunicationContextSchema.safeParse({
        ...base,
        actionKey: "gmail.mailbox.read",
      }).success,
    ).toBe(true);
    for (const actionKey of [
      "gmail.draft.create",
      "gmail.thread.reply",
      "gmail.message.send",
      "gmail.label.apply",
    ]) {
      expect(
        WorkflowCommunicationContextSchema.safeParse({ ...base, actionKey }).success,
      ).toBe(false);
    }
  });

  it("keeps the shared projection provider-free and free of draft/send/watch/scheduler imports", () => {
    const source = readFileSync(
      join(process.cwd(), "lib", "lease-renewal", "follow-up-projection.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/gmail-runtime|createDraft|sendMessage|scheduler|pubsub/i);
    expect(source).not.toMatch(/writeback|source-writer/i);
  });
});
