import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { WorkflowCommunicationLink } from "@/lib/gmail-hub/workflow-context";
import {
  buildRenewalFollowUpProjection,
  type RenewalFollowUpProjection,
} from "@/lib/lease-renewal/follow-up-projection";
import {
  leaseWaitingFor,
  projectLeaseWaiting,
  type LeaseWaiting,
} from "@/lib/lease-renewal/lease-waiting";
import {
  deskLeaseWorkStatusInput,
  leaseWorkStatusLines,
  projectLeaseWorkStatus,
} from "@/lib/lease-renewal/lease-work-status";
import { DEFAULT_NOTICE_RULE_SET } from "@/lib/lease-renewal/notice-rules";
import { RENEWAL_WORK_STATUS_LABELS } from "@/lib/lease-renewal/work-status";
import {
  projectRenewalStage,
  renewalStageWaitingLine,
  summarizeRenewalStage,
  type RenewalStageContext,
} from "@/lib/lease-renewal/renewal-stage";
import {
  manualRenewalSummary,
  type RenewalWorkspaceAction,
  type RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";
import {
  REPLY_AT_MS,
  SENT_AT_MS,
  evidenceInput,
  message,
  recordedState,
} from "@/tests/helpers/outreach-evidence-fixtures";

// S279 (renewal-one-status-from-one-record): one waiting projection over the lease's own message
// evidence feeds the step line, the "Waiting and follow-up" card and the desk row; it reads no
// viewer's mailbox links; the check compares the staff record with the current message's own
// thread and names the fix; the stage follows a recorded acceptance. Synthetic records only.

const LEASE = "4879";
const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();
const READ_AT = "2026-11-06T17:00:00.000Z";

function context(
  outreach: ReturnType<typeof evidenceInput> | null,
  extra: Partial<RenewalStageContext> = {},
): RenewalStageContext {
  return {
    leaseId: LEASE,
    staffRecordUnavailable: false,
    standingAgreement: null,
    housingAssistance: null,
    numbers: { verified: true, openDifferences: 0 },
    term: { monthToMonth: false, reviewNeeded: false },
    moveOutInitiated: false,
    sourceRenewal: null,
    verification: null,
    handStatus: null,
    outreach,
    cycleDateIso: "2026-12-31",
    ...extra,
  };
}

const waitingFor = (
  state: RenewalWorkspaceState | null,
  outreach: ReturnType<typeof evidenceInput>,
) => leaseWaitingFor(state, outreach, { leaseId: LEASE, cycleDateIso: "2026-12-31" });

/** One viewer's own linked Gmail thread: an older thread refreshed as waiting on the team. */
function olderThread(actorUid: string): WorkflowCommunicationLink {
  const at = SENT_AT_MS - 20 * 24 * HOUR;
  return {
    id: `link-older-${actorUid}`,
    actor_uid: actorUid,
    mailbox_key: `mailbox-${actorUid}`,
    lane: "renewals",
    entity_type: "renewal_lease",
    entity_id: LEASE,
    purpose: "renewal_owner",
    origin_action_key: "gmail.mailbox.read",
    source_refs: [`rentvine:lease:${LEASE}`],
    gmail_thread_id: `thread-older-${actorUid}`,
    status: "linked",
    waiting_on: "team",
    last_contact_at_ms: at,
    last_contact_source: "gmail_thread",
    last_contact_message_id: `message-older-${actorUid}`,
    contact_observation_state: "current",
    created_at_ms: at,
    updated_at_ms: at,
    retention_policy_ref: "communications-retention:v1.0",
    retention_class: "workflow_link",
    expires_at_ms: null,
  } as WorkflowCommunicationLink;
}

/** The card's projection as the live desk builds it: the viewer's links, the lease's waiting. */
function card(
  waiting: LeaseWaiting,
  links: readonly WorkflowCommunicationLink[],
  processFallback: "unresolved_source" | null = null,
): RenewalFollowUpProjection {
  return buildRenewalFollowUpProjection({
    leaseId: LEASE,
    asOfIso: READ_AT,
    communicationState: "current",
    links,
    policy: {
      state: "missing",
      ruleSet: DEFAULT_NOTICE_RULE_SET,
      version: null,
      updatedAtIso: null,
    },
    ...(processFallback
      ? {
          processFallback: {
            party: processFallback,
            sourceRef: "renewal-process:v1:verify-renewal",
          },
        }
      : {}),
    outreachContact: waiting.readable
      ? {
          party: waiting.party,
          lastContactIso: waiting.lastContactIso,
          cycleId: waiting.cycleId,
        }
      : null,
  });
}

describe("ARCH-S279-1 / BEH-S279-1: one waiting projection feeds the step line, the card and the desk row", () => {
  it("BEH-S279-1: after an app-confirmed owner send, one waiting line, no check, and the card agrees", () => {
    const state = recordedState(LEASE);
    const outreach = evidenceInput([message()]);
    const stage = projectRenewalStage(state, context(outreach));
    const waiting = waitingFor(state, outreach);

    expect(stage.check).toBeNull();
    expect(stage.stageLine).toBe(
      `${RENEWAL_WORK_STATUS_LABELS.waiting_on_owner_response} since 11/04/2026`,
    );
    expect(stage.waiting).toMatchObject({
      party: "the owner",
      sinceIso: iso(SENT_AT_MS),
      lastContactIso: iso(SENT_AT_MS),
    });
    // The stage carries the one projection, equal to the one the desk row and card read.
    expect(stage.leaseWaiting).toEqual(waiting);
    expect(waiting).toMatchObject({
      readable: true,
      audience: "owner",
      party: "owner",
      sinceIso: iso(SENT_AT_MS),
      lastContactIso: iso(SENT_AT_MS),
      check: null,
    });
    // The desk row's stage is the same projection, word for word.
    expect(summarizeRenewalStage(stage).stageLine).toBe(stage.stageLine);

    // Fail-first (A-08): a viewer's older refreshed thread said "waiting on the team"; the card
    // and the status no longer read it.
    const followUp = card(waiting, [olderThread("editor")], "unresolved_source");
    expect(followUp.waiting).toMatchObject({ state: "verified", party: "owner" });
    expect(followUp.waiting.party).not.toBe("unresolved_source");
    expect(followUp.lastContact).toMatchObject({
      state: "verified",
      atIso: stage.waiting!.lastContactIso,
    });
  });

  it("AC-S279-1: a confirmed send, a scheduled message, a reply and a bounce agree on who, since when and last contact", () => {
    const scenarios = [
      { name: "confirmed send", entry: message() },
      {
        name: "scheduled",
        entry: message({ acceptedAtMs: null, scheduledForMs: SENT_AT_MS + 24 * HOUR }),
      },
      { name: "reply", entry: message({ replyAtMs: REPLY_AT_MS }) },
      { name: "bounce", entry: message({ bounceAtMs: SENT_AT_MS + 60_000 }) },
    ] as const;
    for (const { name, entry } of scenarios) {
      const state = recordedState(LEASE);
      const outreach = evidenceInput([entry]);
      const stage = projectRenewalStage(state, context(outreach));
      const waiting = waitingFor(state, outreach);
      const followUp = card(waiting, [olderThread("editor")], "unresolved_source");
      expect(stage.leaseWaiting, name).toEqual(waiting);
      expect(stage.check, name).toBeNull();
      // The card never names "an unresolved source" when the lease's evidence was read.
      expect(followUp.waiting.party, name).not.toBe("unresolved_source");
      // Last contact: the same instant (or none) on the card, the projection and the step line.
      expect(followUp.lastContact.atIso, name).toBe(waiting.lastContactIso);
      if (stage.waiting && stage.waiting.party === "the owner")
        expect(stage.waiting.lastContactIso, name).toBe(waiting.lastContactIso);
    }
    const scheduled = waitingFor(
      recordedState(LEASE),
      evidenceInput([
        message({ acceptedAtMs: null, scheduledForMs: SENT_AT_MS + 24 * HOUR }),
      ]),
    );
    // A scheduled message is no contact.
    expect(scheduled).toMatchObject({ party: "team", lastContactIso: null });
    expect(card(scheduled, []).lastContact).toEqual({
      state: "none",
      atIso: null,
      source: null,
    });
    const replied = waitingFor(
      recordedState(LEASE),
      evidenceInput([message({ replyAtMs: REPLY_AT_MS })]),
    );
    // A reply hands the move to the team; the last contact is the reply.
    expect(replied).toMatchObject({ party: "team", lastContactIso: iso(REPLY_AT_MS) });
    const bounced = waitingFor(
      recordedState(LEASE),
      evidenceInput([message({ bounceAtMs: SENT_AT_MS + 60_000 })]),
    );
    // A bounced message never counts as outreach or contact (S248 preserved).
    expect(bounced).toMatchObject({
      party: "team",
      lastContactIso: null,
      sinceIso: null,
    });
  });

  it("the step's waiting line names who, since when and the last contact from the projection", () => {
    const state = recordedState(LEASE);
    const stage = projectRenewalStage(state, context(evidenceInput([message()])));
    expect(renewalStageWaitingLine(stage.waiting!)).toMatch(
      /^Waiting on the owner since 11\/04\/2026\. Last contact 11\/04\/2026\. The app is watching: /,
    );
  });
});

describe("ARCH-S279-2 / BEH-S279-3 / AC-S279-2: the same status for every staff member", () => {
  it("BEH-S279-3: an Editor with a refreshed linked thread and an Approver with none read the same status", () => {
    const state = recordedState(LEASE);
    const outreach = evidenceInput([message({ audience: "owner" })]);
    // ARCH-S279-2: the projection takes the lease, cycle and stored evidence, no viewer.
    const editor = waitingFor(state, outreach);
    const approver = waitingFor(state, outreach);
    expect(editor).toEqual(approver);

    const editorCard = card(editor, [olderThread("editor")]);
    const approverCard = card(approver, []);
    for (const field of ["waiting", "lastContact", "due", "nextAction"] as const)
      expect(editorCard[field], field).toEqual(approverCard[field]);
    // Each person's own linked thread stays theirs, for their own attention only.
    expect(editorCard.linkedThread?.linkId).toBe("link-older-editor");
    expect(approverCard.linkedThread).toBeNull();

    // The stage takes no links at all: both read one waiting line, last contact and check.
    const stage = projectRenewalStage(state, context(outreach));
    expect(stage.stageLine).not.toMatch(/Needs a check/);
    expect(projectRenewalStage(state, context(outreach))).toEqual(stage);
  });

  it("AC-S279-2: a user without the Renewals Space reads no lease status", () => {
    const page = readFileSync(
      join(
        process.cwd(),
        "app",
        "lease-renewal",
        "live",
        "desk",
        "lease",
        "[leaseId]",
        "page.tsx",
      ),
      "utf8",
    );
    const guard = page.indexOf('await requirePageSpaceAccess("renewals")');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(page.indexOf("readLeaseOutreachEvidence(leaseId)"));
    expect(guard).toBeLessThan(page.indexOf("loadLiveRenewalLeaseWorkspace("));
  });
});

describe("R-S279-3 / BEH-S279-2 / AC-S279-3: the check compares like with like and names the fix", () => {
  it("AC-S279-3: an app-confirmed send beside an older unrelated thread shows no check", () => {
    const state = recordedState(LEASE, [
      {
        action: { kind: "activity", activity: "owner_outreach", outcome: "done" },
        atIso: iso(SENT_AT_MS + HOUR),
      },
    ]);
    const outreach = evidenceInput([message()]);
    const waiting = waitingFor(state, outreach);
    expect(waiting.check).toBeNull();
    const status = projectLeaseWorkStatus(
      deskLeaseWorkStatusInput(
        {
          guidance: { overallStatus: "waiting" } as never,
          manualProgress: manualRenewalSummary(state),
          staffRecordedAtIso: iso(SENT_AT_MS + HOUR),
          leaseWaiting: waiting,
        },
        READ_AT,
      ),
    );
    expect(status.status).not.toBe("needs_check");
    expect(leaseWorkStatusLines(status).check).toBeNull();
    expect(projectRenewalStage(state, context(outreach)).check).toBeNull();
  });

  it("BEH-S279-2: waiting on the tenant recorded after the tenant's reply shows both facts and the fix, once", () => {
    const approvedAt = iso(SENT_AT_MS - 2 * 24 * HOUR);
    const actions: { action: RenewalWorkspaceAction; atIso: string }[] = [
      {
        action: { kind: "activity", activity: "owner_outreach", outcome: "done" },
        atIso: approvedAt,
      },
      {
        action: {
          kind: "owner_response",
          outcome: "approved_terms",
          approval: {
            party: { kind: "representative", name: "Sample Agent", capacity: "Manager" },
            channel: { kind: "conversation", participants: "Sample Agent and staff" },
            occurredAt: approvedAt,
          },
        },
        atIso: approvedAt,
      },
      {
        action: { kind: "activity", activity: "tenant_offer", outcome: "done" },
        atIso: iso(SENT_AT_MS),
      },
      {
        action: { kind: "tenant_response", outcome: "awaiting_response" },
        atIso: iso(REPLY_AT_MS + HOUR),
      },
    ];
    const state = recordedState(LEASE, actions);
    const outreach = evidenceInput([
      message({ audience: "tenant", replyAtMs: REPLY_AT_MS }),
    ]);
    const stage = projectRenewalStage(state, context(outreach));
    const sentence =
      "The staff record says waiting on the tenant. The tenant replied on 11/05/2026. Record the response.";
    expect(stage.check).toEqual({
      kind: "evidence",
      sentence,
      fix: { label: "Record the response", target: "renewal-manual-tenant_response" },
    });
    expect(stage.stageLine).toBe(`Needs a check: ${sentence}`);
    // Once: the step's own detail does not repeat it.
    expect(stage.steps.find((step) => step.id === "offer-tenant")?.detail).toBeNull();
    expect(stage.evidenceLine).toBeNull();
    // The lease status lines read the same sentence from the same projection.
    expect(stage.leaseWaiting.check?.sentence).toBe(sentence);
  });
});

describe("R-S279-4 / BEH-S279-4 / AC-S279-4: the stage follows a recorded tenant acceptance", () => {
  const CONTEXT = context(null, {
    standingAgreement: { label: "Example standing agreement", reason: "Covered." },
  });
  const at = (minute: number) =>
    `2026-11-06T15:${String(minute).padStart(2, "0")}:00.000Z`;
  const stageAfter = (actions: readonly RenewalWorkspaceAction[]) =>
    projectRenewalStage(
      recordedState(
        LEASE,
        actions.map((action, index) => ({ action, atIso: at(index + 1) })),
      ),
      CONTEXT,
      { standingCovered: true },
    );
  const offer: RenewalWorkspaceAction = {
    kind: "activity",
    activity: "tenant_offer",
    outcome: "done",
  };
  const accepted: RenewalWorkspaceAction = {
    kind: "tenant_response",
    outcome: "accepted",
  };

  it("BEH-S279-4: after a recorded acceptance the stage line does not read Preparing tenant offer", () => {
    const before = stageAfter([offer]);
    expect(before.stage.key).toBe("waiting_on_tenant_response");
    for (const stage of [
      stageAfter([offer, accepted]),
      stageAfter([
        offer,
        accepted,
        { kind: "activity", activity: "information_form", outcome: "done" },
      ]),
    ]) {
      expect(stage.stageLine).not.toMatch(/Preparing tenant offer/);
      expect(stage.stage.key).not.toBe("preparing_tenant_offer");
      // The outstanding work reads in the existing closed list (the path's next stage).
      expect(stage.stage.key).toBe("preparing_lease_documents");
      expect(Object.keys(RENEWAL_WORK_STATUS_LABELS)).toContain(stage.stage.key);
    }
  });
});

describe("AC-S279-6: status reads save, send, claim and look up nothing, and carry no reply body", () => {
  it("the waiting projection imports only pure evidence and staff-record modules", () => {
    const source = readFileSync(
      join(process.cwd(), "lib", "lease-renewal", "lease-waiting.ts"),
      "utf8",
    );
    const imports = [...source.matchAll(/from "([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(imports)).toEqual(
      new Set([
        "@/lib/lease-renewal/outreach-evidence",
        "@/lib/lease-renewal/workspace-state",
      ]),
    );
    expect(source).not.toMatch(/\bfetch\(|getAdminFirestore|runTransaction/);
  });

  it("the projection holds times and words only, never a reply's content", () => {
    const state = recordedState(LEASE);
    const waiting = projectLeaseWaiting({
      evidence: {
        readable: true,
        cycleId: state.cycleId,
        owner: {
          audience: "owner",
          state: "replied",
          derived: null,
          lastSentAtMs: SENT_AT_MS,
          replyAtMs: REPLY_AT_MS,
          replyId: "reply-0001",
          replySequenceId: "sequence-0001",
          failedAtMs: null,
          scheduledForMs: null,
          draftSinceMs: null,
          unconfirmedSequenceId: null,
          corrected: [],
        },
        tenant: {
          audience: "tenant",
          state: "none",
          derived: null,
          lastSentAtMs: null,
          replyAtMs: null,
          replyId: null,
          replySequenceId: null,
          failedAtMs: null,
          scheduledForMs: null,
          draftSinceMs: null,
          unconfirmedSequenceId: null,
          corrected: [],
        },
      },
      fill: null,
      lane: manualRenewalSummary(state),
    });
    expect(Object.keys(waiting).sort()).toEqual(
      [
        "audience",
        "check",
        "cycleId",
        "lastContactIso",
        "party",
        "readable",
        "sinceIso",
        "version",
      ].sort(),
    );
    expect(JSON.stringify(waiting)).not.toMatch(/reply-0001|body|plainText|snippet/i);
  });
});
