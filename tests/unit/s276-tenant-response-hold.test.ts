// S276 ARCH-S276-2, R-S276-2 to R-S276-6: the recorded tenant response as a dispatch input. Any
// recorded response (a decline included) holds the unsent reminders of a tenant offer authorized at
// or before it, in the same cycle, under its own cause and label; an unset response holds nothing;
// owner messages, replies, other cycles and messages authorized after the response are untouched.
// Pure checks on synthetic values; no Firestore, no mailbox.
import { describe, expect, it } from "vitest";

import { SEQUENCE_PAUSE_CAUSE_LABELS } from "@/lib/gmail-hub/communication-state";
import {
  TENANT_RESPONSE_PAUSE_CAUSE,
  isRecordedTenantResponse,
  recordedTenantResponseOf,
  tenantReminderScope,
  tenantResponseEvidenceId,
  tenantResponseHolds,
  tenantResponsePause,
  type RecordedTenantResponse,
} from "@/lib/gmail-hub/tenant-response-hold";
import type { CommunicationSequence } from "@/lib/gmail-hub/sequence-model";

const CYCLE = "5c1d2e3f-4a5b-4c6d-8e7f-000000009276";
const OTHER_CYCLE = "5c1d2e3f-4a5b-4c6d-8e7f-000000009999";
const APPROVED_AT = Date.parse("2026-11-12T18:00:00.000Z");
const RECORDED_AT = "2026-11-12T19:00:00.000Z";

type HoldInput = Parameters<typeof tenantResponseHolds>[0];

function reminder(overrides: Partial<HoldInput> = {}): HoldInput {
  return {
    context: {
      lane: "renewals",
      entityType: "renewal_lease",
      entityId: "9276",
      purpose: "renewal_tenant",
      actionKey: "gmail.renewal_notice.send",
      sourceRefs: ["rentvine:lease:9276"],
    },
    authorization: {
      approvedAtMs: APPROVED_AT,
    } as CommunicationSequence["authorization"],
    confirmedCount: 1,
    noticeCycleId: CYCLE,
    ...overrides,
  };
}

function head(outcome: string, recordedAt = RECORDED_AT, cycleId = CYCLE) {
  return {
    cycleId,
    tenantResponse: {
      eventId: "event-9276",
      actorUid: "synthetic-s276-staff",
      recordedAt,
      source: "Recorded by staff",
      termsRevision: 0,
      outcome,
    },
  };
}

const recorded = (outcome = "accepted"): RecordedTenantResponse =>
  recordedTenantResponseOf(head(outcome))!;

describe("S276 ARCH-S276-2: the recorded tenant response is an input to dispatch", () => {
  it("ARCH-S276-2: the cause is in the cause list and the label map", () => {
    expect(TENANT_RESPONSE_PAUSE_CAUSE).toBe("tenant_response_recorded");
    expect(SEQUENCE_PAUSE_CAUSE_LABELS[TENANT_RESPONSE_PAUSE_CAUSE]).toBe(
      "The tenant's response was recorded by staff",
    );
    // R-S276-6: an observed reply keeps its own cause and label.
    expect(SEQUENCE_PAUSE_CAUSE_LABELS.reply).toBe("A reply was received");
  });

  it("R-S276-2 / R-S276-4: only acceptance, a change request or a decline establishes a response", () => {
    for (const outcome of [
      "accepted",
      "counter_change_requested",
      "declined_nonrenewing",
    ])
      expect(isRecordedTenantResponse(outcome), outcome).toBe(true);
    expect(isRecordedTenantResponse("awaiting_response")).toBe(false);
    expect(isRecordedTenantResponse("needs_verification")).toBe(false);
    expect(isRecordedTenantResponse("unknown_outcome")).toBe(false);
    expect(isRecordedTenantResponse(null)).toBe(false);
    expect(recordedTenantResponseOf(head("awaiting_response"))).toBeNull();
    expect(recordedTenantResponseOf(head("needs_verification"))).toBeNull();
  });

  it("ARCH-S276-2: reads the response from a stored work record, and nothing from an unreadable one", () => {
    expect(recordedTenantResponseOf(head("declined_nonrenewing"))).toEqual({
      cycleId: CYCLE,
      eventId: "event-9276",
      outcome: "declined_nonrenewing",
      actorUid: "synthetic-s276-staff",
      recordedAtMs: Date.parse(RECORDED_AT),
    });
    expect(recordedTenantResponseOf(null)).toBeNull();
    expect(recordedTenantResponseOf({ cycleId: CYCLE, tenantResponse: null })).toBeNull();
    expect(recordedTenantResponseOf(head("accepted", "not a time"))).toBeNull();
  });

  it("BEH-S276-2 / BEH-S276-3: a response recorded after the offer was authorized holds its reminders", () => {
    for (const outcome of [
      "accepted",
      "counter_change_requested",
      "declined_nonrenewing",
    ])
      expect(tenantResponseHolds(reminder(), recorded(outcome)), outcome).toBe(true);
    // A message whose cycle was not recorded is held too: the default sends less, never more.
    expect(tenantResponseHolds(reminder({ noticeCycleId: null }), recorded())).toBe(true);
  });

  it("R-S276-5: an unset response holds nothing, and a Resume after the response is never held by it", () => {
    expect(tenantResponseHolds(reminder(), null)).toBe(false);
    const resumedAfter = reminder({
      authorization: {
        approvedAtMs: Date.parse(RECORDED_AT) + 60_000,
      } as CommunicationSequence["authorization"],
    });
    expect(tenantResponseHolds(resumedAfter, recorded())).toBe(false);
  });

  it("R-S276-6 / AC-S276-4: owner messages, replies, another cycle and an unsent initial offer are not reminders it holds", () => {
    const owner = reminder();
    expect(
      tenantResponseHolds(
        { ...owner, context: { ...owner.context, purpose: "renewal_owner" } },
        recorded(),
      ),
    ).toBe(false);
    expect(
      tenantResponseHolds(
        {
          ...owner,
          context: {
            ...owner.context,
            replyTo: {
              sequenceId: "original",
              threadId: "thread",
              senderEmail: "staff@pmikcmetro.com",
              parentId: "parent",
            },
          },
        },
        recorded(),
      ),
    ).toBe(false);
    expect(
      tenantResponseHolds(reminder({ noticeCycleId: OTHER_CYCLE }), recorded()),
    ).toBe(false);
    expect(tenantReminderScope(reminder({ confirmedCount: 0 }))).toBe(false);
    expect(tenantResponseHolds(reminder({ confirmedCount: 0 }), recorded())).toBe(false);
  });

  it("R-S276-2: the pause names the cause, the actor and the staff record, never message content", () => {
    expect(tenantResponsePause(recorded(), "synthetic-s276-staff", APPROVED_AT)).toEqual({
      cause: "tenant_response_recorded",
      byUid: "synthetic-s276-staff",
      atMs: APPROVED_AT,
      evidenceIds: [tenantResponseEvidenceId("event-9276")],
    });
    expect(tenantResponseEvidenceId("event-9276")).toBe(
      "renewal-tenant-response:event-9276",
    );
  });
});
