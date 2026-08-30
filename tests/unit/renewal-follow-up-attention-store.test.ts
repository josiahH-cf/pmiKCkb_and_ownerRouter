import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  RENEWAL_FOLLOW_UP_ATTENTION_ACTIVITY_COLLECTION,
  listDismissedRenewalFollowUpKeys,
  transitionRenewalFollowUpAttention,
} from "@/lib/firestore/lease-renewal-follow-up-attention";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";

const editor: AuthenticatedUser = {
  uid: "editor-1",
  email: "editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};

const exactAttention = {
  leaseId: "lease-42",
  dedupeKey:
    "renewal-follow-up-v1:lease-42:9:lease:lease-42:message-1:2026-08-23T12:00:00.000Z",
  dueAtIso: "2026-08-23T12:00:00.000Z",
  lastContactAtIso: "2026-08-20T12:00:00.000Z",
  policyVersion: 9,
  policyScope: "lease" as const,
  sourceRefs: [
    "gmail-link:link-1",
    "gmail-thread:thread-1",
    "gmail-message:message-1",
    "notice-policy:active:v9:lease:lease-42",
  ],
};

describe("renewal follow-up attention audit", () => {
  it("dismisses, idempotently replays, and explicitly reopens one exact due item", async () => {
    const fake = new FakeFirestore();
    const db = fake as unknown as Firestore;

    const dismissed = await transitionRenewalFollowUpAttention(
      editor,
      {
        action: "dismiss",
        attention: exactAttention,
        reason: "Reviewed with the renewal team.",
        idempotencyKey: "018f5ca1-7b7c-7c3d-8b6f-5f83a36a5f51",
      },
      db,
      "2026-08-24T13:00:00.000Z",
    );
    expect(dismissed).toMatchObject({
      state: "dismissed",
      recordVersion: 1,
      duplicate: false,
    });
    expect(await listDismissedRenewalFollowUpKeys(editor, db)).toEqual([
      exactAttention.dedupeKey,
    ]);

    const replay = await transitionRenewalFollowUpAttention(
      editor,
      {
        action: "dismiss",
        attention: exactAttention,
        reason: "A different replay body is ignored by the exact attempt identity.",
        idempotencyKey: "018f5ca1-7b7c-7c3d-8b6f-5f83a36a5f51",
      },
      db,
      "2026-08-24T14:00:00.000Z",
    );
    expect(replay).toMatchObject({
      state: "dismissed",
      recordVersion: 1,
      duplicate: true,
    });

    const reopened = await transitionRenewalFollowUpAttention(
      editor,
      {
        action: "reopen",
        attention: exactAttention,
        reason: "Follow-up needs another review.",
        idempotencyKey: "018f5ca1-7b7c-7c3d-8b6f-5f83a36a5f52",
      },
      db,
      "2026-08-24T15:00:00.000Z",
    );
    expect(reopened).toMatchObject({
      state: "open",
      recordVersion: 2,
      duplicate: false,
    });
    expect(await listDismissedRenewalFollowUpKeys(editor, db)).toEqual([]);

    const activity = [...fake.store.entries()].filter(([path]) =>
      path.startsWith(`${RENEWAL_FOLLOW_UP_ATTENTION_ACTIVITY_COLLECTION}/`),
    );
    expect(activity).toHaveLength(2);
    expect(activity.map(([, record]) => record.action)).toEqual([
      "dismissed",
      "reopened",
    ]);
    expect(JSON.stringify(activity)).not.toContain("Reviewed with the renewal team");
    expect(JSON.stringify(activity)).not.toContain(editor.email);
  });

  it("rejects a second non-replay transition that does not match current state", async () => {
    const db = new FakeFirestore() as unknown as Firestore;
    await transitionRenewalFollowUpAttention(
      editor,
      {
        action: "dismiss",
        attention: exactAttention,
        reason: "First review.",
        idempotencyKey: "018f5ca1-7b7c-7c3d-8b6f-5f83a36a5f53",
      },
      db,
      "2026-08-24T13:00:00.000Z",
    );
    await expect(
      transitionRenewalFollowUpAttention(
        editor,
        {
          action: "dismiss",
          attention: exactAttention,
          reason: "Second review without reopen.",
          idempotencyKey: "018f5ca1-7b7c-7c3d-8b6f-5f83a36a5f54",
        },
        db,
        "2026-08-24T14:00:00.000Z",
      ),
    ).rejects.toThrow(/already dismissed/i);
  });

  it("rejects an attention identity that is not bound to the supplied exact lease", async () => {
    const db = new FakeFirestore() as unknown as Firestore;
    await expect(
      transitionRenewalFollowUpAttention(
        editor,
        {
          action: "dismiss",
          attention: {
            ...exactAttention,
            leaseId: "lease-forged",
          },
          reason: "This must not create a suppression record.",
          idempotencyKey: "018f5ca1-7b7c-7c3d-8b6f-5f83a36a5f55",
        },
        db,
        "2026-08-24T13:00:00.000Z",
      ),
    ).rejects.toThrow(/does not match the exact lease/i);
    expect(await listDismissedRenewalFollowUpKeys(editor, db)).toEqual([]);
  });
});
