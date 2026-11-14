// S272 ARCH-S272-1 to ARCH-S272-3, R-S272-2 to R-S272-7: the pure one-current-message rules and
// the one typed refusal reason. Each reason maps to its staff text and the actions that can
// succeed (ARCH-S272-3); wording written before a content change is refused only while it is
// unchanged (R-S272-2); one lease, cycle and audience holds at most one unsent initial message
// (R-S272-3); an older authorization is stopped by a newer confirmed send (R-S272-4); replies,
// other audiences, other cycles and unauthorized drafts are untouched (R-S272-7). Synthetic values
// only; nothing here reads a store or a provider.
import { describe, expect, it } from "vitest";
import {
  CommunicationSequenceRefusedError,
  SEQUENCE_REFUSAL_REASONS,
  SEQUENCE_REFUSED_CODE,
  contentBasisInputs,
  contentDigestFor,
  currentMessageRefusal,
  keptContentBasis,
  newerInitialSend,
  relatedSequenceView,
  unsentInitialElsewhere,
  unsentMessageState,
  wordingPredatesChange,
  type AuthorizedContentBasis,
  type RelatedSequenceView,
  type SequenceRefusal,
  type TargetContentBasis,
} from "@/lib/gmail-hub/current-message";
import {
  SEQUENCE_PAUSE_CAUSE_LABELS,
  SEQUENCE_REFUSAL_ACTIONS,
  SEQUENCE_REFUSAL_ACTION_LABELS,
  WORDING_PREDATES_CHANGE_TEXT,
  describeSequenceDetailState,
  describeSequenceRefusal,
  predatesChangeLine,
  refusalWithholdsAuthorization,
  sequenceRefusalMessage,
} from "@/lib/gmail-hub/communication-state";
import { reviewedInput, type ReviewedInput } from "@/lib/gmail-hub/reviewed-inputs";

const LEASE = "2720";
const CYCLE = "5c1d2e3f-4a5b-4c6d-8e7f-000000002720";
const OTHER_CYCLE = "5c1d2e3f-4a5b-4c6d-8e7f-000000009999";
const context = (purpose: "renewal_tenant" | "renewal_owner" = "renewal_tenant") => ({
  lane: "renewals" as const,
  entityType: "renewal_lease" as const,
  entityId: LEASE,
  purpose,
  actionKey: "gmail.renewal_notice.send",
  sourceRefs: [`rentvine:lease:${LEASE}`],
});
const replyContext = {
  ...context(),
  actionKey: "gmail.thread.reply",
  replyTo: {
    sequenceId: "00000000-0000-4000-8000-000000000001",
    threadId: "thread-1",
    senderEmail: "staff@pmikcmetro.com",
    parentId: "parent-1",
  },
};
/** "11/12/2026, 12:23 PM CST" and "11/13/2026, 9:00 AM CST" as instants. */
const SENT_AT = Date.parse("2026-11-12T18:23:00.000Z");
const DUE_AT = Date.parse("2026-11-13T15:00:00.000Z");
const PAUSED_AT = Date.parse("2026-11-12T18:21:00.000Z");

function values(end: string): ReviewedInput[] {
  return [
    reviewedInput("address", "Property address", "101 Sample Pl"),
    reviewedInput("renewalRent", "Renewal rent", "$1,425.00"),
    reviewedInput("renewalEnd", "Renewal end date", end),
  ];
}
function basis(end: string): TargetContentBasis {
  return { digest: `digest-${end}`, legacyDigest: `legacy-${end}`, values: values(end) };
}
const DRAFT = "d".repeat(64);

function authorized(
  overrides: Partial<{
    state: string;
    revision: number;
    kept: AuthorizedContentBasis | undefined;
    wordingSavedAfterRevision: number;
    pause: { cause: string } | null;
    signatureSetup: unknown;
    purpose: "renewal_tenant" | "renewal_owner";
    reply: boolean;
  }> = {},
) {
  const revision = overrides.revision ?? 1;
  return {
    id: "00000000-0000-4000-8000-000000000010",
    context: overrides.reply ? replyContext : context(overrides.purpose),
    state: overrides.state ?? "paused",
    authorization: {
      revision,
      ...(overrides.signatureSetup === undefined
        ? { signatureSetup: { choice: "blank" } }
        : overrides.signatureSetup === null
          ? {}
          : { signatureSetup: overrides.signatureSetup }),
    },
    ...("kept" in overrides
      ? overrides.kept
        ? { authorizedContentBasis: overrides.kept }
        : {}
      : {
          authorizedContentBasis: {
            revision,
            digest: "digest-12/31/2027",
            values: values("12/31/2027"),
            draftHash: DRAFT,
          },
        }),
    ...(overrides.wordingSavedAfterRevision !== undefined
      ? { wordingSavedAfterRevision: overrides.wordingSavedAfterRevision }
      : {}),
    pause: overrides.pause === undefined ? { cause: "changed_source" } : overrides.pause,
  };
}

function related(
  id: string,
  overrides: Partial<RelatedSequenceView> & {
    purpose?: "renewal_tenant" | "renewal_owner";
  } = {},
): RelatedSequenceView {
  const { purpose, ...rest } = overrides;
  return {
    id,
    context: context(purpose),
    state: "active",
    noticeCycleId: CYCLE,
    authorization: {
      approvedAtMs: Date.parse("2026-11-12T17:00:00.000Z"),
      schedule: { timeZone: "America/Chicago" },
    },
    confirmedCount: 0,
    unresolvedOccurrenceId: null,
    nextDueAtMs: DUE_AT,
    pause: null,
    threads: [],
    lastSentAtMs: null,
    ...rest,
  };
}

describe("S272 ARCH-S272-3: one typed refusal reason owns the staff text and the actions", () => {
  it("ARCH-S272-3: maps each reason to its text, its lines and the only actions that can succeed", () => {
    const wording: SequenceRefusal = {
      reason: "wording_predates_change",
      audience: "tenant",
      changes: [
        {
          key: "renewalEnd",
          label: "Renewal end date",
          previous: "12/31/2027",
          current: "06/30/2027",
        },
      ],
    };
    expect(describeSequenceRefusal(wording)).toEqual({
      text: "This message was written before the lease changed. Update it from the lease, or cancel it.",
      lines: ["Renewal end date: 12/31/2027 in this message, 06/30/2027 on the lease."],
      actions: ["update_from_lease", "cancel"],
    });
    const newer = describeSequenceRefusal({
      reason: "newer_message_sent",
      audience: "tenant",
      relatedSequenceId: "newer",
      relatedAtMs: SENT_AT,
    });
    expect(newer.text).toMatch(
      /^A newer message for this renewal was sent on 11\/12\/2026, 12:23\sPM CST\. Cancel this one\.$/,
    );
    expect(newer.actions).toEqual(["open_lease", "cancel"]);
    const unsent = describeSequenceRefusal({
      reason: "unsent_message_exists",
      audience: "tenant",
      relatedSequenceId: "scheduled",
      relatedState: "scheduled",
      relatedAtMs: DUE_AT,
      timeZone: "America/Chicago",
    });
    expect(unsent.text).toMatch(
      /^A tenant offer for this renewal is already scheduled for 11\/13\/2026, 9:00\sAM CST\. Open it to update or cancel it\.$/,
    );
    expect(unsent.actions).toEqual(["open_related"]);
    // Every reason has text and at least one action; the labels read as staff see them.
    for (const reason of SEQUENCE_REFUSAL_REASONS) {
      expect(SEQUENCE_REFUSAL_ACTIONS[reason].length).toBeGreaterThan(0);
      for (const action of SEQUENCE_REFUSAL_ACTIONS[reason])
        expect(SEQUENCE_REFUSAL_ACTION_LABELS[action]).not.toMatch(/_/);
    }
    expect(SEQUENCE_REFUSAL_ACTION_LABELS).toEqual({
      update_from_lease: "Update from the lease",
      cancel: "Cancel future messages",
      open_lease: "Open the lease",
      open_related: "Open that communication",
    });
    // R-S272-5: wording and a newer send withhold Resume, Send and Schedule; a refused new message
    // keeps them, since it succeeds once the other communication is updated or cancelled.
    expect(refusalWithholdsAuthorization("wording_predates_change")).toBe(true);
    expect(refusalWithholdsAuthorization("newer_message_sent")).toBe(true);
    expect(refusalWithholdsAuthorization("unsent_message_exists")).toBe(false);
  });

  it("ARCH-S272-3: names an owner message, a paused one, an unconfirmed send and a refusal kept without values", () => {
    expect(
      describeSequenceRefusal({
        reason: "unsent_message_exists",
        audience: "owner",
        relatedState: "paused",
        relatedAtMs: PAUSED_AT,
      }).text,
    ).toMatch(
      /^An owner message for this renewal was paused on 11\/12\/2026, 12:21\sPM CST and is not sent\. Open it to update or cancel it\.$/,
    );
    expect(
      describeSequenceRefusal({
        reason: "unsent_message_exists",
        audience: "tenant",
        relatedState: "unconfirmed",
        relatedAtMs: null,
      }).text,
    ).toBe(
      "A tenant offer for this renewal has a send that is not confirmed yet. Open it to check that send.",
    );
    expect(
      describeSequenceRefusal({
        reason: "unsent_message_exists",
        audience: "tenant",
        relatedState: "awaiting_send",
      }).text,
    ).toBe(
      "A tenant offer for this renewal is already waiting to send. Open it to update or cancel it.",
    );
    // R-S272-2: an older authorization with no stored values is refused without values.
    const withoutValues: SequenceRefusal = {
      reason: "wording_predates_change",
      audience: "tenant",
      changes: [],
    };
    expect(describeSequenceRefusal(withoutValues).lines).toEqual([]);
    expect(sequenceRefusalMessage(withoutValues)).toBe(WORDING_PREDATES_CHANGE_TEXT);
    expect(
      describeSequenceRefusal({
        reason: "newer_message_sent",
        audience: "owner",
      }).text,
    ).toBe("A newer message for this renewal was sent. Cancel this one.");
    // A value with no plain words, or whose words did not change, reads as "{label} changed."
    expect(
      predatesChangeLine({
        key: "template",
        label: "Approved template",
        previous: "Tenant offer",
        current: "Tenant offer",
      }),
    ).toBe("Approved template changed.");
    expect(
      predatesChangeLine({
        key: "charge:pet_rent",
        label: "Pet rent",
        previous: null,
        current: "$45.00, per month",
      }),
    ).toBe("Pet rent: not set in this message, $45.00, per month on the lease.");
  });

  it("R-S272-6: the typed error carries its code, the refusal and the derived message", () => {
    const refusal: SequenceRefusal = {
      reason: "wording_predates_change",
      audience: "tenant",
      changes: [
        {
          key: "renewalEnd",
          label: "Renewal end date",
          previous: "12/31/2027",
          current: "06/30/2027",
        },
      ],
    };
    const error = new CommunicationSequenceRefusedError(refusal);
    expect(error.code).toBe(SEQUENCE_REFUSED_CODE);
    expect(error.status).toBe(409);
    expect(error.refusal).toBe(refusal);
    expect(error.message).toBe(
      "This message was written before the lease changed. Update it from the lease, or cancel it. Renewal end date: 12/31/2027 in this message, 06/30/2027 on the lease.",
    );
  });

  it("R-S272-4: the new pause cause has its own plain label", () => {
    expect(SEQUENCE_PAUSE_CAUSE_LABELS.newer_message_sent).toBe(
      "A newer message for this renewal was sent",
    );
  });
});

describe("S272 R-S272-5: the detail prints the scheduled or paused time with its zone", () => {
  const base = {
    confirmedCount: 0,
    unresolvedOccurrenceId: null,
    timeZone: "America/Chicago",
  };
  it("R-S272-5: Scheduled for 11/13/2026, 9:00 AM CST; Paused on its time; other states unchanged", () => {
    expect(
      describeSequenceDetailState({
        ...base,
        state: "active",
        scheduled: true,
        nextDueAtMs: DUE_AT,
        pause: null,
      }),
    ).toMatch(/^Scheduled for 11\/13\/2026, 9:00\sAM CST$/);
    expect(
      describeSequenceDetailState({
        ...base,
        state: "paused",
        scheduled: true,
        nextDueAtMs: null,
        pause: { atMs: PAUSED_AT },
      }),
    ).toMatch(/^Paused on 11\/12\/2026, 12:21\sPM CST$/);
    expect(
      describeSequenceDetailState({
        ...base,
        state: "draft",
        scheduled: false,
        nextDueAtMs: null,
        pause: null,
      }),
    ).toBe("Draft in app");
    expect(
      describeSequenceDetailState({
        ...base,
        state: "active",
        scheduled: false,
        nextDueAtMs: DUE_AT,
        pause: null,
      }),
    ).toBe("Awaiting send");
  });
});

describe("S272 R-S272-1 / ARCH-S272-1: the content basis", () => {
  it("ARCH-S272-1: keeps the wording inputs and leaves recipients, signature, notice, retirement and holds out", () => {
    const inputs = [
      reviewedInput("to", "To", "tenant@example.invalid"),
      reviewedInput("cc", "Cc", null),
      reviewedInput("signature", "Sender signature", "Blank signature", "none"),
      reviewedInput("address", "Property address", "101 Sample Pl"),
      reviewedInput("template", "Approved template", "Tenant offer", "t".repeat(64)),
      reviewedInput("renewalEnd", "Renewal end date", "12/31/2027"),
      reviewedInput("charge:pet_rent", "Pet rent", "$45.00, per month"),
      reviewedInput("offer", "Offer charges and mappings", null, "o".repeat(64)),
      reviewedInput("notice", "Notice status", null, "n".repeat(64)),
      reviewedInput("retirement", "Retirement status", null, "revision-1"),
      reviewedInput("hold:abc", "New hold", "A hold"),
    ];
    expect(contentBasisInputs(inputs).map((input) => input.key)).toEqual([
      "address",
      "template",
      "renewalEnd",
      "charge:pet_rent",
      "offer",
    ]);
    expect(contentBasisInputs(null)).toEqual([]);
  });

  it("R-S272-2: compares with the same legacy or current digest choice dispatch makes", () => {
    const current = basis("12/31/2027");
    expect(contentDigestFor({ signatureSetup: { choice: "blank" } }, current, true)).toBe(
      current.digest,
    );
    expect(contentDigestFor({}, current, true)).toBe(current.legacyDigest);
    expect(contentDigestFor({}, current, false)).toBe(current.digest);
  });

  it("ARCH-S272-1: a kept basis belongs to its own authorization revision only", () => {
    const s = authorized();
    expect(keptContentBasis(s)).toMatchObject({ revision: 1 });
    expect(
      keptContentBasis({ ...s, authorization: { ...s.authorization, revision: 2 } }),
    ).toBeNull();
    expect(keptContentBasis({ ...s, authorization: null })).toBeNull();
  });
});

describe("S272 R-S272-2: wording written before a content change", () => {
  it("R-S272-2 / AC-S272-1: refuses unchanged wording after a content change and names each changed value", () => {
    expect(
      wordingPredatesChange({
        sequence: authorized(),
        draftHash: DRAFT,
        contentBasis: basis("06/30/2027"),
        outgoingContract: true,
      }),
    ).toEqual({
      reason: "wording_predates_change",
      audience: "tenant",
      relatedSequenceId: "00000000-0000-4000-8000-000000000010",
      changes: [
        {
          key: "renewalEnd",
          label: "Renewal end date",
          previous: "12/31/2027",
          current: "06/30/2027",
        },
      ],
    });
    // The same on an active (scheduled) message and on an owner message.
    expect(
      wordingPredatesChange({
        sequence: authorized({ state: "active", pause: null, purpose: "renewal_owner" }),
        draftHash: DRAFT,
        contentBasis: basis("06/30/2027"),
      })?.audience,
    ).toBe("owner");
  });

  it("R-S272-2: an unchanged basis, edited wording or wording saved after the authorization is not refused", () => {
    const unchanged = basis("12/31/2027");
    expect(
      wordingPredatesChange({
        sequence: authorized(),
        draftHash: DRAFT,
        contentBasis: unchanged,
        outgoingContract: true,
      }),
    ).toBeNull();
    // Staff edited the wording: a different draft.
    expect(
      wordingPredatesChange({
        sequence: authorized(),
        draftHash: "e".repeat(64),
        contentBasis: basis("06/30/2027"),
      }),
    ).toBeNull();
    // Staff rebuilt it from the lease after this authorization, even when it reads the same.
    expect(
      wordingPredatesChange({
        sequence: authorized({ wordingSavedAfterRevision: 1 }),
        draftHash: DRAFT,
        contentBasis: basis("06/30/2027"),
      }),
    ).toBeNull();
    // A save after an earlier authorization does not count for this one.
    expect(
      wordingPredatesChange({
        sequence: authorized({ revision: 2, wordingSavedAfterRevision: 1 }),
        draftHash: DRAFT,
        contentBasis: basis("06/30/2027"),
      }),
    ).not.toBeNull();
  });

  it("AC-S272-6: an older authorization with no stored basis is refused without values only when paused for changed facts", () => {
    const changed = wordingPredatesChange({
      sequence: authorized({ kept: undefined }),
      draftHash: DRAFT,
      contentBasis: basis("12/31/2027"),
    });
    expect(changed).toMatchObject({ reason: "wording_predates_change", changes: [] });
    // Paused by staff: resumes as today.
    expect(
      wordingPredatesChange({
        sequence: authorized({ kept: undefined, pause: { cause: "staff" } }),
        draftHash: DRAFT,
        contentBasis: basis("06/30/2027"),
      }),
    ).toBeNull();
    // Edited after the hold: the existing Update applies.
    expect(
      wordingPredatesChange({
        sequence: authorized({ kept: undefined, wordingSavedAfterRevision: 1 }),
        draftHash: DRAFT,
        contentBasis: basis("06/30/2027"),
      }),
    ).toBeNull();
  });

  it("R-S272-7: replies, finished work, unauthorized drafts and targets with no content basis are unaffected", () => {
    const changed = basis("06/30/2027");
    expect(
      wordingPredatesChange({
        sequence: authorized({ reply: true }),
        draftHash: DRAFT,
        contentBasis: changed,
      }),
    ).toBeNull();
    for (const state of ["completed", "cancelled"])
      expect(
        wordingPredatesChange({
          sequence: authorized({ state }),
          draftHash: DRAFT,
          contentBasis: changed,
        }),
      ).toBeNull();
    expect(
      wordingPredatesChange({
        sequence: { ...authorized(), authorization: null },
        draftHash: DRAFT,
        contentBasis: changed,
      }),
    ).toBeNull();
    expect(
      wordingPredatesChange({
        sequence: authorized(),
        draftHash: DRAFT,
        contentBasis: null,
      }),
    ).toBeNull();
  });
});

describe("S272 R-S272-3: one unsent initial message per lease, cycle and audience", () => {
  const subject = {
    id: "new-draft",
    context: context(),
    noticeCycleId: CYCLE,
    confirmedCount: 0,
  };
  it("R-S272-3 / AC-S272-2: a scheduled, paused or unconfirmed message refuses a second initial one and names it", () => {
    expect(unsentInitialElsewhere(subject, [related("scheduled")])).toEqual({
      reason: "unsent_message_exists",
      audience: "tenant",
      relatedSequenceId: "scheduled",
      relatedState: "scheduled",
      relatedAtMs: DUE_AT,
      timeZone: "America/Chicago",
    });
    expect(
      unsentInitialElsewhere(subject, [
        related("paused", {
          state: "paused",
          nextDueAtMs: null,
          pause: { cause: "staff", atMs: PAUSED_AT },
        }),
      ]),
    ).toMatchObject({ relatedState: "paused", relatedAtMs: PAUSED_AT });
    expect(
      unsentInitialElsewhere(subject, [
        related("unconfirmed", { unresolvedOccurrenceId: "attempt" }),
      ]),
    ).toMatchObject({ relatedState: "unconfirmed", relatedAtMs: null });
    expect(
      unsentInitialElsewhere(subject, [
        related("needs", { state: "needs_reconciliation", confirmedCount: 1 }),
      ]),
    ).toMatchObject({ relatedState: "unconfirmed" });
    expect(
      unsentInitialElsewhere(subject, [
        related("now", {
          authorization: {
            approvedAtMs: 1,
            schedule: { timeZone: "America/Chicago" },
            immediateTenantOffer: true,
          },
        }),
      ]),
    ).toMatchObject({ relatedState: "awaiting_send" });
    // With no cycle recorded and an open state, the other message still holds the renewal.
    expect(
      unsentInitialElsewhere(subject, [related("no-cycle", { noticeCycleId: null })]),
    ).toMatchObject({ relatedSequenceId: "no-cycle" });
    expect(
      unsentInitialElsewhere(subject, [
        related("unrecorded", { noticeCycleId: undefined }),
      ]),
    ).toMatchObject({ relatedSequenceId: "unrecorded" });
  });

  it("R-S272-3 / R-S272-7: sent, finished, unauthorized, other-cycle, other-audience and reply work never refuses", () => {
    const none = [
      related("sent", { confirmedCount: 1, threads: [{ sentAtMs: SENT_AT }] }),
      related("cancelled", { state: "cancelled" }),
      related("completed", { state: "completed", confirmedCount: 1 }),
      related("draft", { state: "draft", authorization: null }),
      related("other-cycle", { noticeCycleId: OTHER_CYCLE }),
      related("owner", { purpose: "renewal_owner" }),
      { ...related("reply"), context: replyContext },
      related("self", {}),
    ];
    expect(
      unsentInitialElsewhere({ ...subject, id: "self" }, none.slice(0, -1)),
    ).toBeNull();
    // The communication itself never refuses its own Resume, Send or Schedule.
    expect(unsentInitialElsewhere({ ...subject, id: "self" }, [none.at(-1)!])).toBeNull();
    // Two unauthorized drafts coexist.
    expect(
      unsentInitialElsewhere(subject, [
        related("draft-a", { state: "draft", authorization: null }),
        related("draft-b", { state: "draft", authorization: null }),
      ]),
    ).toBeNull();
    // A follow-up of a sent message, a reply and a message with no cycle scope read are not
    // initial messages for this rule.
    expect(
      unsentInitialElsewhere({ ...subject, confirmedCount: 1 }, [related("scheduled")]),
    ).toBeNull();
    expect(
      unsentInitialElsewhere({ ...subject, context: replyContext }, [
        related("scheduled"),
      ]),
    ).toBeNull();
    expect(
      unsentInitialElsewhere({ ...subject, noticeCycleId: undefined }, [
        related("scheduled"),
      ]),
    ).toBeNull();
  });

  it("R-S272-3: a sent message with follow-ups holds no unsent initial work", () => {
    expect(
      unsentMessageState(
        related("followups", { confirmedCount: 1, threads: [{ sentAtMs: SENT_AT }] }),
      ),
    ).toBeNull();
    expect(unsentMessageState(related("plain", { authorization: null }))).toBeNull();
  });
});

describe("S272 R-S272-4: an older authorization after a newer send", () => {
  const older = {
    id: "older",
    context: context(),
    state: "paused",
    noticeCycleId: CYCLE,
    authorization: { approvedAtMs: Date.parse("2026-11-12T18:10:00.000Z") },
  };
  it("R-S272-4 / AC-S272-3: a confirmed initial send recorded after the authorization stops it", () => {
    const newer = related("newer", {
      state: "completed",
      confirmedCount: 1,
      threads: [{ sentAtMs: SENT_AT }],
      lastSentAtMs: SENT_AT,
    });
    expect(newerInitialSend(older, [newer])).toEqual({
      sequenceId: "newer",
      sentAtMs: SENT_AT,
    });
    expect(
      currentMessageRefusal({
        subject: older,
        next: { noticeCycleId: CYCLE, confirmedCount: 0 },
        related: [newer],
      }),
    ).toEqual({
      reason: "newer_message_sent",
      audience: "tenant",
      relatedSequenceId: "newer",
      relatedAtMs: SENT_AT,
    });
    // An older record with no cycle recorded is in the same renewal.
    expect(
      newerInitialSend({ ...older, noticeCycleId: undefined }, [newer]),
    ).not.toBeNull();
  });

  it("R-S272-4 / R-S272-7: an earlier send, an unconfirmed one, another cycle, audience or a reply never stops it", () => {
    const earlier = Date.parse("2026-11-12T18:00:00.000Z");
    expect(
      newerInitialSend(older, [
        related("earlier", { confirmedCount: 1, threads: [{ sentAtMs: earlier }] }),
        related("unconfirmed", { unresolvedOccurrenceId: "attempt" }),
        related("other-cycle", {
          noticeCycleId: OTHER_CYCLE,
          confirmedCount: 1,
          threads: [{ sentAtMs: SENT_AT }],
        }),
        related("owner", {
          purpose: "renewal_owner",
          confirmedCount: 1,
          threads: [{ sentAtMs: SENT_AT }],
        }),
        {
          ...related("reply", { confirmedCount: 1, threads: [{ sentAtMs: SENT_AT }] }),
          context: replyContext,
        },
      ]),
    ).toBeNull();
    // A reply sequence is never stopped by it, and a draft has no authorization to stop.
    const newer = related("newer", {
      confirmedCount: 1,
      threads: [{ sentAtMs: SENT_AT }],
    });
    expect(newerInitialSend({ ...older, context: replyContext }, [newer])).toBeNull();
    expect(newerInitialSend({ ...older, authorization: null }, [newer])).toBeNull();
    expect(newerInitialSend({ ...older, state: "cancelled" }, [newer])).toBeNull();
  });
});

describe("S272: stored records as the rules read them", () => {
  it("reads a raw record defensively and skips purged or unusable ones", () => {
    expect(relatedSequenceView("x", { purged: true, context: context() })).toBeNull();
    expect(relatedSequenceView("x", { state: "completed" })).toBeNull();
    expect(relatedSequenceView("x", undefined)).toBeNull();
    const filler = relatedSequenceView("filler", {
      context: context(),
      threads: [],
      schemaVersion: "workflow-communication-sequence/v1",
    });
    expect(filler).toMatchObject({
      id: "filler",
      authorization: null,
      confirmedCount: 0,
      threads: [],
    });
    expect(filler).not.toHaveProperty("noticeCycleId");
    expect(
      relatedSequenceView("cycle", { context: context(), noticeCycleId: null }),
    ).toHaveProperty("noticeCycleId", null);
  });
});
