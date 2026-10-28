import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import { SYNTHETIC_OWNER_ROSTER } from "../helpers/owner-approval";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { COMMUNICATION_SEQUENCE_COLLECTIONS } from "@/lib/gmail-hub/sequence-store";
import { listLeaseOwnerReplies } from "@/lib/gmail-hub/sequence-store";
import {
  getRenewalWorkingRecord,
  saveRenewalWorkingField,
} from "@/lib/firestore/renewal-working-record";
import { tenantAnswerCoversCurrentTerms } from "@/lib/lease-renewal/tenant-answer-terms";
import {
  getRenewalWorkspace,
  listRenewalWorkspaceActivity,
  ownerRosterFingerprint,
  saveRenewalWorkspace,
  startRenewalCycle,
} from "@/lib/firestore/renewal-workspace";
import type { OwnerApprovalInput } from "@/lib/lease-renewal/workspace-state";

// S234 R-S234-1 (ARCH-S234-1, BEH-S234-1, AC-S234-1): an approval is recorded only with who
// approved, how and when. The store checks the party against the lease's current owner roster
// and a linked reply against this lease's own owner renewal thread, inside the capture; an
// unreadable roster records nothing. Synthetic owners, threads and times on the local emulator.

const projectId = "pmi-kc-kb-s234-owner-approval-test";
const editor: AuthenticatedUser = {
  uid: "editor-1",
  email: "editor1@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
let counter = 0;
const op = () => `5c9e3f40-7d6b-4e8f-a0b1-${String(++counter).padStart(12, "0")}`;
const LEASE = "4821";
const OWNER_REF = "rentvine:export:portfolio.owners[0].name";
const basis = {
  kind: "lease_end" as const,
  dateIso: "2026-11-30",
  source: "RentVine lease end",
};
const REPLY = "mailbox-key:reply-1";
const ROSTER = [{ label: "Example Owner LLC", sourceRef: OWNER_REF }];
// The owner as the form showed them, with the roster they were chosen from (PR #162 review).
const OWNER = {
  kind: "owner" as const,
  sourceRef: OWNER_REF,
  label: "Example Owner LLC",
  rosterFingerprint: ownerRosterFingerprint(ROSTER),
};
const OWNER_SEQUENCE = "6d0f4a51-8e7c-4f90-b1c2-000000000001";
const OTHER_SEQUENCE = "6d0f4a51-8e7c-4f90-b1c2-000000000002";

let app: App;
let db: Firestore;
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s234-owner-approval-${process.pid}`);
  db = getFirestore(app);
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await startRenewalCycle(
    editor,
    {
      leaseId: LEASE,
      expectedCycleId: null,
      expectedRevision: 0,
      operationId: op(),
      basis,
      reason: "Synthetic renewal cycle.",
    },
    basis,
    db,
  );
  for (const [field, value] of [
    ["terms_rent", 1750],
    ["terms_effective_date", "2026-12-01"],
    ["terms_end_date", "2027-11-30"],
  ] as const)
    await saveRenewalWorkingField(
      editor,
      { leaseId: LEASE, field, value, expectedRevision: 0, operationId: op() },
      db,
    );
  // One owner-thread communication with a reply and an automatic response, and a tenant thread
  // for the same lease with a reply: only the first reply is an approval channel.
  const inbound = (kind: string, id: string) => ({
    id,
    senderEmail: "staff@pmikcmetro.com",
    threadId: "thread-owner",
    messageId: id.split(":")[1],
    kind,
    receivedAtMs: Date.parse("2026-10-20T15:00:00Z"),
  });
  await db
    .collection(COMMUNICATION_SEQUENCE_COLLECTIONS.sequences)
    .doc(OWNER_SEQUENCE)
    .set({
      context: { entityType: "renewal_lease", entityId: LEASE, purpose: "renewal_owner" },
      inbound: [inbound("human", REPLY), inbound("auto_reply", "mailbox-key:ooo-1")],
    });
  await db
    .collection(COMMUNICATION_SEQUENCE_COLLECTIONS.sequences)
    .doc(OTHER_SEQUENCE)
    .set({
      context: {
        entityType: "renewal_lease",
        entityId: LEASE,
        purpose: "renewal_tenant",
      },
      inbound: [inbound("human", "mailbox-key:tenant-reply")],
    });
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await deleteApp(app);
  await testEnv.cleanup();
});

async function approve(
  approval: OwnerApprovalInput | undefined,
  verify = SYNTHETIC_OWNER_ROSTER,
) {
  const state = await getRenewalWorkspace(editor, LEASE, db);
  return saveRenewalWorkspace(
    editor,
    {
      leaseId: LEASE,
      cycleId: state!.cycleId,
      expectedRevision: state!.revision,
      operationId: op(),
      action: {
        kind: "owner_response",
        outcome: "approved_terms",
        ...(approval ? { approval } : {}),
      },
    },
    db,
    undefined,
    verify,
  );
}
async function refusal(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as { status?: number; message: string };
  }
  throw new Error("Expected a refusal.");
}
const WHEN = "2026-10-20T16:00:00.000Z";

describe("S234 owner approval evidence on the emulator", () => {
  it("refuses an approval missing who, how or when, naming each missing item", async () => {
    const missing = await refusal(approve(undefined));
    expect(missing).toMatchObject({ status: 400 });
    expect(missing.message).toContain("who approved");
    expect(missing.message).toContain("how they approved");
    expect(missing.message).toContain("when they approved");
    const noChannel = await refusal(approve({ party: OWNER, occurredAt: WHEN }));
    expect(noChannel.message).not.toContain("who approved");
    expect(noChannel.message).toContain("how they approved");
    expect((await getRenewalWorkspace(editor, LEASE, db))!.ownerResponse).toBeNull();
  });

  it("records nothing while the owner roster cannot be read", async () => {
    const unreadable = await refusal(
      approve(
        {
          party: { kind: "representative", name: "Example Agent", capacity: "Agent" },
          channel: { kind: "conversation", participants: "Example Agent and staff" },
          occurredAt: WHEN,
        },
        { ownerRoster: async () => null },
      ),
    );
    expect(unreadable).toMatchObject({ status: 409 });
    expect(unreadable.message).toContain("owner list could not be read");
    expect((await getRenewalWorkspace(editor, LEASE, db))!.ownerResponse).toBeNull();
  });

  it("refuses a party not on the roster and records an owner of record by its source label", async () => {
    const stranger = await refusal(
      approve({
        party: { ...OWNER, sourceRef: "rentvine:export:portfolio.owners[9].name" },
        channel: {
          kind: "written",
          medium: "Signed letter",
          reference: "drive:letter-1",
        },
        occurredAt: WHEN,
      }),
    );
    expect(stranger).toMatchObject({ status: 409 });
    const { state } = await approve({
      party: OWNER,
      channel: { kind: "written", medium: "Signed letter", reference: "drive:letter-1" },
      occurredAt: WHEN,
    });
    expect(state!.ownerResponse).toMatchObject({
      outcome: "approved_terms",
      occurredAt: WHEN,
      approval: {
        party: { kind: "owner", label: "Example Owner LLC", sourceRef: OWNER_REF },
        channel: {
          kind: "written",
          medium: "Signed letter",
          reference: "drive:letter-1",
        },
        occurredAt: WHEN,
      },
      approvedWorkingTerms: {
        rent: 1750,
        fieldRevisions: { rent: 1, effectiveDate: 1, endDate: 1 },
      },
    });
  });

  it("refuses an owner choice made from a roster that has since changed (PR #162 review)", async () => {
    const written = {
      kind: "written" as const,
      medium: "Signed letter",
      reference: "drive:letter-1",
    };
    // The same path now holds a different owner, or another owner was added: never substituted.
    for (const roster of [
      [{ label: "Replacement Owner LLC", sourceRef: OWNER_REF }],
      [
        ...ROSTER,
        {
          label: "Second Owner LLC",
          sourceRef: "rentvine:export:portfolio.owners[1].name",
        },
      ],
    ]) {
      const changed = await refusal(
        approve(
          { party: OWNER, channel: written, occurredAt: WHEN },
          { ownerRoster: async () => roster },
        ),
      );
      expect(changed).toMatchObject({ status: 409 });
      expect(changed.message).toContain("owner list changed since this page was opened");
    }
    // A label that is not the one at that path is refused even with the right fingerprint.
    expect(
      await refusal(
        approve({
          party: { ...OWNER, label: "Someone Else" },
          channel: written,
          occurredAt: WHEN,
        }),
      ),
    ).toMatchObject({ status: 409 });
    expect((await getRenewalWorkspace(editor, LEASE, db))!.ownerResponse).toBeNull();
  });

  it("binds a reply from this lease's owner thread and refuses any other reply", async () => {
    const party = OWNER;
    for (const channel of [
      {
        kind: "linked_reply" as const,
        sequenceId: OTHER_SEQUENCE,
        evidenceId: "mailbox-key:tenant-reply",
      },
      {
        kind: "linked_reply" as const,
        sequenceId: OWNER_SEQUENCE,
        evidenceId: "mailbox-key:ooo-1",
      },
      {
        kind: "linked_reply" as const,
        sequenceId: OWNER_SEQUENCE,
        evidenceId: "mailbox-key:missing",
      },
    ])
      expect(await refusal(approve({ party, channel, occurredAt: WHEN }))).toMatchObject({
        status: 409,
      });
    const { state } = await approve({
      party,
      channel: { kind: "linked_reply", sequenceId: OWNER_SEQUENCE, evidenceId: REPLY },
      occurredAt: WHEN,
    });
    expect(state!.ownerResponse?.approval?.channel).toEqual({
      kind: "linked_reply",
      sequenceId: OWNER_SEQUENCE,
      senderEmail: "staff@pmikcmetro.com",
      threadId: "thread-owner",
      messageId: "reply-1",
      receivedAt: "2026-10-20T15:00:00.000Z",
    });
    // The form's only reply choices are this lease's owner-thread replies.
    expect(await listLeaseOwnerReplies(LEASE, db)).toEqual([
      {
        sequenceId: OWNER_SEQUENCE,
        evidenceId: REPLY,
        senderEmail: "staff@pmikcmetro.com",
        receivedAt: "2026-10-20T15:00:00.000Z",
      },
    ]);
  });

  it("keeps the earlier approval in history when a new approval supersedes it", async () => {
    const first = {
      party: OWNER,
      channel: {
        kind: "conversation" as const,
        participants: "Example Owner LLC and staff",
      },
      occurredAt: WHEN,
    };
    await approve(first);
    await approve({ ...first, occurredAt: "2026-10-21T16:00:00.000Z" });
    const activity = await listRenewalWorkspaceActivity(editor, LEASE, db);
    const approvals = activity.filter(
      (entry) =>
        (entry as { action?: { kind?: string } }).action?.kind === "owner_response",
    );
    expect(approvals).toHaveLength(2);
    expect(
      (await getRenewalWorkspace(editor, LEASE, db))!.ownerResponse?.approval?.occurredAt,
    ).toBe("2026-10-21T16:00:00.000Z");
  });

  it("R-S234-5: keeps the Working term revisions a tenant answer was recorded against", async () => {
    const state = (await getRenewalWorkspace(editor, LEASE, db))!;
    const { state: answered } = await saveRenewalWorkspace(
      editor,
      {
        leaseId: LEASE,
        cycleId: state.cycleId,
        expectedRevision: state.revision,
        operationId: op(),
        action: { kind: "tenant_response", outcome: "accepted", source: "Tenant call" },
      },
      db,
    );
    // Read inside the capture transaction, never from the page.
    expect(answered!.tenantResponse?.workingTermRevisions).toEqual({
      rent: 1,
      effectiveDate: 1,
      endDate: 1,
    });
    expect(
      tenantAnswerCoversCurrentTerms(
        answered!,
        await getRenewalWorkingRecord(editor, LEASE, db),
      ),
    ).toBe(true);
    await saveRenewalWorkingField(
      editor,
      {
        leaseId: LEASE,
        field: "terms_rent",
        value: 1800,
        expectedRevision: 1,
        operationId: op(),
      },
      db,
    );
    expect(
      tenantAnswerCoversCurrentTerms(
        (await getRenewalWorkspace(editor, LEASE, db))!,
        await getRenewalWorkingRecord(editor, LEASE, db),
      ),
    ).toBe(false);
  });
});
