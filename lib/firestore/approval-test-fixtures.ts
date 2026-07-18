import type { Firestore } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { APPROVAL_TEST_FIXTURE_CONFIRMATION } from "@/lib/approval/test-fixture-contract";
import { appendApprovalQueueNotificationsForActivity } from "@/lib/firestore/approval-queue-notifications";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import type {
  ApprovalQueueActivityRecord,
  ApprovalQueueItemRecord,
  QueueItemType,
  QueueRiskLevel,
} from "@/lib/firestore/types";

const QUEUE_COLLECTION = "approval_queue_items";
const ACTIVITY_COLLECTION = "approval_queue_activity";

export { APPROVAL_TEST_FIXTURE_CONFIRMATION };

export const APPROVAL_TEST_FIXTURE_DEFINITIONS = Object.freeze([
  fixture("approve", "TEST — approve an app-only decision", "Low"),
  fixture("return", "TEST — return an app-only decision", "Medium"),
  fixture("snooze", "TEST — snooze an app-only decision", "Low"),
  fixture("assign", "TEST — assign an app-only decision", "Low"),
  fixture("disable", "TEST — disable an app-only decision", "Medium"),
  fixture(
    "execute-guard",
    "TEST — prove approval is separate from execution",
    "Medium",
    "No provider — execution must remain unavailable",
  ),
  fixture(
    "bulk-execute-guard",
    "TEST — prove bulk provider execution is denied",
    "Medium",
    "No provider — bulk execution must be skipped",
  ),
]);

export interface ApprovalTestFixtureStatus {
  fixture_count: number;
  item_ids: string[];
  ready_count: number;
  state: "missing" | "drifted" | "ready";
}

export async function inspectApprovalTestFixtures(
  actor: AuthenticatedUser,
  restrictedStaffUid: string,
  db: Firestore = getAdminFirestore(),
): Promise<ApprovalTestFixtureStatus> {
  assertAdmin(actor);
  assertDistinctRestrictedActor(actor, restrictedStaffUid);
  const snapshots = await Promise.all(
    APPROVAL_TEST_FIXTURE_DEFINITIONS.map((definition) =>
      db.collection(QUEUE_COLLECTION).doc(definition.id).get(),
    ),
  );
  const readyCount = snapshots.filter((snapshot, index) => {
    if (!snapshot.exists) return false;
    return matchesBaseline(
      snapshot.data() as Record<string, unknown>,
      baselineItem(
        APPROVAL_TEST_FIXTURE_DEFINITIONS[index],
        actor.uid,
        restrictedStaffUid,
        "2000-01-01T00:00:00.000Z",
      ),
    );
  }).length;
  return {
    fixture_count: APPROVAL_TEST_FIXTURE_DEFINITIONS.length,
    item_ids: APPROVAL_TEST_FIXTURE_DEFINITIONS.map((definition) => definition.id),
    ready_count: readyCount,
    state:
      readyCount === APPROVAL_TEST_FIXTURE_DEFINITIONS.length
        ? "ready"
        : snapshots.some((snapshot) => snapshot.exists)
          ? "drifted"
          : "missing",
  };
}

export async function restoreApprovalTestFixtures(
  actor: AuthenticatedUser,
  restrictedStaffUid: string,
  db: Firestore = getAdminFirestore(),
  now: number = Date.now(),
): Promise<ApprovalTestFixtureStatus & { restored_count: number }> {
  assertAdmin(actor);
  assertDistinctRestrictedActor(actor, restrictedStaffUid);
  const timestamp = new Date(now).toISOString();

  const restoredCount = await db.runTransaction(async (transaction) => {
    const refs = APPROVAL_TEST_FIXTURE_DEFINITIONS.map((definition) =>
      db.collection(QUEUE_COLLECTION).doc(definition.id),
    );
    const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
    let restored = 0;

    for (const [index, definition] of APPROVAL_TEST_FIXTURE_DEFINITIONS.entries()) {
      const snapshot = snapshots[index];
      const baseline = baselineItem(
        definition,
        actor.uid,
        restrictedStaffUid,
        timestamp,
        readCreatedAt(snapshot.data()),
      );
      if (snapshot.exists && matchesBaseline(snapshot.data()!, baseline)) continue;

      restored += 1;
      transaction.set(refs[index], baseline);
      const activityId = uuidv7();
      const activity: ApprovalQueueActivityRecord = {
        id: activityId,
        item_id: baseline.id,
        actor_uid: actor.uid,
        action: snapshot.exists ? "comment" : "created",
        ...(typeof snapshot.data()?.status === "string"
          ? { previous_state: String(snapshot.data()?.status) }
          : {}),
        new_state: baseline.status,
        reason: snapshot.exists
          ? "Restored the canonical isolated Test approval baseline."
          : "Created the canonical isolated Test approval baseline.",
        source_trigger: baseline.source_trigger_key,
        created_at: timestamp,
      };
      transaction.set(db.collection(ACTIVITY_COLLECTION).doc(activityId), activity);
      appendApprovalQueueNotificationsForActivity(transaction, db, {
        action: "created",
        actor,
        item: baseline,
        newState: baseline.status,
      });
    }

    return restored;
  });

  const status = await inspectApprovalTestFixtures(actor, restrictedStaffUid, db);
  return { ...status, restored_count: restoredCount };
}

function fixture(
  key: string,
  actionNeeded: string,
  risk: QueueRiskLevel,
  affectedSystemAction?: string,
) {
  return Object.freeze({
    id: `audit-test-approval-${key}-v1`,
    key: `audit:${key}:v1`,
    actionNeeded,
    risk,
    affectedSystemAction,
    itemType: "ApprovalPackage" as QueueItemType,
  });
}

function baselineItem(
  definition: (typeof APPROVAL_TEST_FIXTURE_DEFINITIONS)[number],
  adminUid: string,
  restrictedStaffUid: string,
  timestamp: string,
  existingCreatedAt?: string,
): ApprovalQueueItemRecord {
  return {
    id: definition.id,
    data_mode: "test",
    test_fixture_key: definition.key,
    process_run_ref: {
      id: "audit-test-approval-suite-v1",
      label: "TEST — Approval fixture suite",
    },
    item_type: definition.itemType,
    source_trigger_key: `audit:test:approval:${definition.key}`,
    status: "Ready for Approval",
    risk: definition.risk,
    audience_group: "Dan/Admin decisions",
    assignee_uid: restrictedStaffUid,
    required_approver_uid: adminUid,
    action_needed: definition.actionNeeded,
    ...(definition.affectedSystemAction
      ? { affected_system_action: definition.affectedSystemAction }
      : {}),
    direct_link: `/approval-queue?item_id=${encodeURIComponent(definition.id)}`,
    created_at: existingCreatedAt ?? timestamp,
    updated_at: timestamp,
  };
}

function matchesBaseline(
  raw: Record<string, unknown>,
  expected: ApprovalQueueItemRecord,
) {
  const fields = [
    "id",
    "data_mode",
    "test_fixture_key",
    "process_run_ref",
    "item_type",
    "source_trigger_key",
    "status",
    "risk",
    "audience_group",
    "assignee_uid",
    "required_approver_uid",
    "action_needed",
    "affected_system_action",
    "direct_link",
  ] as const;
  return fields.every((field) => stableJson(raw[field]) === stableJson(expected[field]));
}

function readCreatedAt(raw: Record<string, unknown> | undefined) {
  const value = raw?.created_at;
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "toDate" in value) {
    const toDate = (value as { toDate?: unknown }).toDate;
    if (typeof toDate === "function") {
      return (toDate.call(value) as Date).toISOString();
    }
  }
  return undefined;
}

function assertAdmin(actor: AuthenticatedUser) {
  if (!can(actor.role, "manageAdmin")) {
    throw new EditableLayerError(
      "Only an Admin can restore Approval Queue Test fixtures.",
      403,
    );
  }
}

function assertDistinctRestrictedActor(
  actor: AuthenticatedUser,
  restrictedStaffUid: string,
) {
  if (!restrictedStaffUid.trim() || restrictedStaffUid === actor.uid) {
    throw new EditableLayerError(
      "Approval Test fixtures require a distinct restricted staff identity.",
      409,
    );
  }
}

function stableJson(value: unknown) {
  return JSON.stringify(stableValue(value));
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}
