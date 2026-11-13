import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  getSuppliedRenewalPublication,
  publishSuppliedRenewalTemplate,
  suppliedRenewalPublication,
} from "@/lib/firestore/renewal-message-publication";
import {
  countOwnerMessagesHeldOnPublish,
  getOwnerCopyV21Publication,
  previewOwnerCopyPublication,
  publishOwnerCopyV21,
  readOwnerCopyPublications,
} from "@/lib/firestore/renewal-owner-copy-publication";
import { COMMUNICATION_SEQUENCE_COLLECTIONS } from "@/lib/gmail-hub/sequence-store";
import { listOwnerAnswerChoices } from "@/lib/gmail-hub/owner-answer-choices";

// S285 R-S285-2, R-S285-4, R-S285-5 and R-S285-6 against the real Firestore emulator. Owner copy
// v2.1 is its own approved record in the existing template store, published only by an existing
// template approver; until it reads back approved the owner copy in use is v2.0 and nothing is
// counted as held. The approver is told the count of unsent owner messages first, and a changed
// count publishes nothing. The answer's defaults are read on the server from stored sequence
// state: the term the latest confirmed owner message stated, and for each reply the one roster
// owner it came from, never an address. Synthetic owners, addresses and times only.

const projectId = "demo-pmi-s285-owner-copy-publication";
const approver: AuthenticatedUser = {
  uid: "synthetic-s285-approver",
  email: "synthetic-s285-approver@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};
const editor: AuthenticatedUser = {
  uid: "synthetic-s285-editor",
  email: "synthetic-s285-editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const LEASE = "9285";
const CYCLE = "5c1d2e3f-4a5b-4c6d-8e7f-000000009285";
let app: App, db: Firestore, testEnv: RulesTestEnvironment;

const recommend = {
  key: "ownerIntent",
  label: "Owner question",
  value: "Recommend a rent",
};
const renewOrNot = { key: "ownerIntent", label: "Owner question", value: "Renew or not" };

/** One owner communication as the sequence store keeps it, reduced to what these reads use. */
function ownerSequence(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "workflow-communication-sequence/v1",
    version: 3,
    context: {
      lane: "renewals",
      entityType: "renewal_lease",
      entityId: LEASE,
      purpose: "renewal_owner",
    },
    state: "active",
    noticeCycleId: CYCLE,
    confirmedCount: 0,
    nextDueAtMs: Date.parse("2026-11-13T15:00:00Z"),
    authorization: {
      revision: 1,
      approvedAtMs: Date.parse("2026-11-12T18:00:00Z"),
      schedule: { timeZone: "America/Chicago" },
      signatureSetup: {
        uid: editor.uid,
        email: editor.email,
        revision: 1,
        contentHash: "s".repeat(64),
        choice: "blank",
      },
      to: ["jordan@example.invalid"],
      cc: [],
      initial: { plainText: "Synthetic owner wording." },
    },
    authorizedContentBasis: {
      revision: 1,
      digest: "d".repeat(64),
      values: [recommend],
      draftHash: "h".repeat(64),
    },
    ...overrides,
  };
}

async function seed(id: string, data: Record<string, unknown>) {
  // An absent member stays absent, as on a record written before it was kept.
  await db
    .collection(COMMUNICATION_SEQUENCE_COLLECTIONS.sequences)
    .doc(id)
    .set(JSON.parse(JSON.stringify(data)) as Record<string, unknown>);
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s285-owner-copy-${process.pid}`);
  db = getFirestore(app);
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await publishSuppliedRenewalTemplate(approver, "owner", db);
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await testEnv?.cleanup();
  if (app) await deleteApp(app);
});

describe("AC-S285-2 v2.1 is a separate record, in use only once it reads back approved", () => {
  it("R-S285-6: before publication v2.0 is in use for every owner question and v2.1 is ready for an approver", async () => {
    const read = await readOwnerCopyPublications(editor, db);
    expect(read.v21Approved).toBe(false);
    expect(read.readyToPublish).toBe(true);
    expect(read.publicationFor("recommend_rent")).toMatchObject({
      status: "approved",
      version: "v2.0",
      contentHash: suppliedRenewalPublication("owner").contentHash,
    });
    expect((await getOwnerCopyV21Publication(editor, db)).status).toBe("unpublished");
  });

  it("R-S285-6: an Editor cannot publish the new owner wording and sees no count", async () => {
    await expect(previewOwnerCopyPublication(editor, db)).rejects.toMatchObject({
      status: 403,
    });
    await expect(publishOwnerCopyV21(editor, 0, db)).rejects.toMatchObject({
      status: 403,
    });
    expect((await getOwnerCopyV21Publication(editor, db)).status).toBe("unpublished");
  });

  it("BEH-S285-5: the stated count is the unsent authorized owner messages reviewed with v2.0; a changed count publishes nothing", async () => {
    await seed("owner-scheduled", ownerSequence());
    await seed("owner-paused", ownerSequence({ state: "paused", nextDueAtMs: null }));
    // Not held: sent, cancelled, a renew-or-not question and a tenant offer.
    await seed("owner-sent", ownerSequence({ state: "completed", confirmedCount: 1 }));
    await seed("owner-cancelled", ownerSequence({ state: "cancelled" }));
    await seed(
      "owner-renew-or-not",
      ownerSequence({
        authorizedContentBasis: {
          revision: 1,
          digest: "d".repeat(64),
          values: [renewOrNot],
          draftHash: "h".repeat(64),
        },
      }),
    );
    await seed(
      "tenant-scheduled",
      ownerSequence({
        context: {
          lane: "renewals",
          entityType: "renewal_lease",
          entityId: LEASE,
          purpose: "renewal_tenant",
        },
      }),
    );
    expect(await countOwnerMessagesHeldOnPublish(db)).toBe(2);
    const preview = await previewOwnerCopyPublication(approver, db);
    expect(preview).toEqual({ status: "ready", heldCount: 2 });
    // Another message is authorized before the approver confirms: nothing is published.
    await seed("owner-later", ownerSequence());
    await expect(publishOwnerCopyV21(approver, 2, db)).rejects.toMatchObject({
      status: 409,
      heldCount: 3,
    });
    expect((await getOwnerCopyV21Publication(editor, db)).status).toBe("unpublished");
    // Confirmed with the count stated again: v2.1 is published through the template store.
    const published = await publishOwnerCopyV21(approver, 3, db);
    expect(published).toMatchObject({
      status: "approved",
      duplicate: false,
      heldCount: 3,
    });
    const read = await readOwnerCopyPublications(editor, db);
    expect(read.v21Approved).toBe(true);
    expect(read.readyToPublish).toBe(false);
    expect(read.publicationFor("recommend_rent")).toMatchObject({
      status: "approved",
      version: "v2.1",
      contentHash: published.contentHash,
    });
    // The renew-or-not question keeps v2.0, and v2.0's record is unchanged.
    expect(read.publicationFor("renew_or_not")).toMatchObject({ version: "v2.0" });
    expect(await getSuppliedRenewalPublication(editor, "owner", db)).toMatchObject({
      status: "approved",
      contentHash: suppliedRenewalPublication("owner").contentHash,
    });
    // Publishing again is the same record.
    expect(await publishOwnerCopyV21(approver, 0, db)).toMatchObject({
      status: "approved",
      duplicate: true,
    });
  });
});

describe("AC-S285-3 / AC-S285-4 the answer's defaults are read on the server", () => {
  const roster = [
    {
      label: "Jordan Sample",
      sourceRef: "rentvine:export:portfolio.owners[0].name",
      email: "jordan@example.invalid",
    },
    {
      label: "Casey Sample",
      sourceRef: "rentvine:export:portfolio.owners[1].name",
      email: "casey@example.invalid",
    },
  ];
  const inbound = (id: string, kind: string, extra: Record<string, unknown> = {}) => ({
    id,
    senderEmail: "renewals@pmikcmetro.com",
    threadId: "thread-owner",
    messageId: id.split(":")[1],
    kind,
    receivedAtMs: Date.parse("2026-11-12T18:14:00Z"),
    ...extra,
  });

  it("BEH-S285-3: the latest confirmed owner message's stated term, and the owner each reply came from", async () => {
    await seed(
      "owner-sent",
      ownerSequence({
        state: "completed",
        confirmedCount: 1,
        lastSentAtMs: Date.parse("2026-11-12T17:00:00Z"),
        threads: [
          {
            senderEmail: "renewals@pmikcmetro.com",
            threadId: "thread-owner",
            messageId: "sent-1",
            rfcMessageId: "<pmi-sent-1@pmikcmetro.com>",
            sentAtMs: Date.parse("2026-11-12T17:00:00Z"),
          },
        ],
        authorizedContentBasis: {
          revision: 1,
          digest: "d".repeat(64),
          values: [
            recommend,
            { key: "renewalStart", label: "Renewal start date", value: "01/01/2027" },
            { key: "renewalEnd", label: "Renewal end date", value: "12/31/2027" },
          ],
          draftHash: "h".repeat(64),
        },
        inbound: [
          inbound("mailbox:reply-1", "human", { fromSentTo: true }),
          inbound("mailbox:reply-2", "human", { fromSentTo: false }),
          inbound("mailbox:ooo-1", "auto_reply"),
        ],
      }),
    );
    const result = await listOwnerAnswerChoices(
      { leaseId: LEASE, cycleId: CYCLE, roster },
      db,
    );
    expect(result.ownerMessageTerm).toEqual({ start: "2027-01-01", end: "2027-12-31" });
    expect(result.replies.map((reply) => reply.evidenceId).sort()).toEqual([
      "mailbox:reply-1",
      "mailbox:reply-2",
    ]);
    const matched = result.replies.find(
      (reply) => reply.evidenceId === "mailbox:reply-1",
    );
    expect(matched?.approver).toEqual({
      label: "Jordan Sample",
      sourceRef: "rentvine:export:portfolio.owners[0].name",
    });
    // From another participant: nothing selected.
    expect(
      result.replies.find((reply) => reply.evidenceId === "mailbox:reply-2")?.approver,
    ).toBeUndefined();
    // Only the roster entry leaves the server; no owner address.
    expect(JSON.stringify(result)).not.toContain("jordan@example.invalid");
    expect(JSON.stringify(result)).not.toContain("casey@example.invalid");
  });

  it("AC-S285-4: a shared address, an unreadable roster and a message sent before this suite select nothing and state no term", async () => {
    await seed(
      "owner-sent-before",
      ownerSequence({
        state: "completed",
        confirmedCount: 1,
        lastSentAtMs: Date.parse("2026-11-12T17:00:00Z"),
        authorizedContentBasis: undefined,
        inbound: [inbound("mailbox:reply-1", "human")],
      }),
    );
    const shared = await listOwnerAnswerChoices(
      {
        leaseId: LEASE,
        cycleId: CYCLE,
        roster: [roster[0]!, { ...roster[1]!, email: "jordan@example.invalid" }],
      },
      db,
    );
    expect(shared.replies[0]?.approver).toBeUndefined();
    expect(shared.ownerMessageTerm).toBeNull();
    const unreadable = await listOwnerAnswerChoices(
      { leaseId: LEASE, cycleId: CYCLE, roster: null },
      db,
    );
    expect(unreadable.replies[0]?.approver).toBeUndefined();
    // Earlier evidence with one To and no copy: the reply came from that address.
    const single = await listOwnerAnswerChoices(
      { leaseId: LEASE, cycleId: CYCLE, roster },
      db,
    );
    expect(single.replies[0]?.approver?.sourceRef).toBe(
      "rentvine:export:portfolio.owners[0].name",
    );
  });
});
