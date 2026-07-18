import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { resolvePublicationScanner } from "@/lib/publication/provider";
import { resolvePublicationPolicyForSpace } from "@/lib/publication/policy";
import {
  listActiveTrustedPublications,
  PUBLICATION_COLLECTIONS,
} from "@/lib/publication/service";
import {
  continueTestPublicationToPinnedRun,
  inspectTestPublicationFixture,
  publishTestPublicationRevision,
  restoreTestPublicationBaseline,
  rollbackTestPublicationToBaseline,
  TEST_PUBLICATION_EXACT_SCANNER_KEY,
  TEST_PUBLICATION_POLICY_ID,
  TEST_PUBLICATION_RESOURCE_ID,
} from "@/lib/publication/test-fixture";
import {
  TEST_PUBLICATION_CONFIRMATIONS,
  TEST_PUBLICATION_FIXTURE_KEY,
  TEST_PUBLICATION_SPACE_ID,
} from "@/lib/publication/test-fixture-contract";
import { UnavailablePublicationScanner } from "@/lib/publication/scanners";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";

const admin: AuthenticatedUser = {
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
  uid: "admin-1",
};
const editor: AuthenticatedUser = { ...admin, role: "Editor", uid: "editor-1" };
const NOW = Date.parse("2026-07-18T12:00:00.000Z");
let fake: FakeFirestore;
let db: Firestore;

beforeEach(() => {
  fake = new FakeFirestore();
  db = fake as unknown as Firestore;
});

describe("repository-authorized Test publication fixture", () => {
  it("publishes, deduplicates, revises, rolls back, and restores the exact Test baseline", async () => {
    const baseline = await restoreTestPublicationBaseline(
      admin,
      TEST_PUBLICATION_CONFIRMATIONS.restoreBaseline,
      db,
      NOW,
    );
    expect(baseline).toMatchObject({
      changed: true,
      effect: "published",
      status: {
        active_revision: "baseline",
        data_mode: "test",
        live_evidence_eligible: false,
        policy_ready: true,
        state: "ready",
        version_count: 1,
      },
    });
    expect(
      fake.store.get(`publication_policies/${TEST_PUBLICATION_POLICY_ID}`),
    ).toMatchObject({
      data_mode: "test",
      scannerKey: TEST_PUBLICATION_EXACT_SCANNER_KEY,
      test_fixture_key: TEST_PUBLICATION_FIXTURE_KEY,
    });
    expect(
      fake.store.get(
        `${PUBLICATION_COLLECTIONS.resources}/${TEST_PUBLICATION_RESOURCE_ID}`,
      ),
    ).toMatchObject({
      data_mode: "test",
      test_fixture_key: TEST_PUBLICATION_FIXTURE_KEY,
    });

    const duplicateBaseline = await restoreTestPublicationBaseline(
      admin,
      TEST_PUBLICATION_CONFIRMATIONS.restoreBaseline,
      db,
      NOW + 1,
    );
    expect(duplicateBaseline).toMatchObject({
      changed: false,
      effect: "unchanged",
      status: { version_count: 1 },
    });

    const revision = await publishTestPublicationRevision(
      admin,
      TEST_PUBLICATION_CONFIRMATIONS.publishRevision,
      db,
      NOW + 2,
    );
    expect(revision).toMatchObject({
      changed: true,
      effect: "published",
      status: { active_revision: "revision", state: "revision_active", version_count: 2 },
    });
    const duplicateRevision = await publishTestPublicationRevision(
      admin,
      TEST_PUBLICATION_CONFIRMATIONS.publishRevision,
      db,
      NOW + 3,
    );
    expect(duplicateRevision).toMatchObject({
      changed: false,
      effect: "unchanged",
      status: { version_count: 2 },
    });

    const rollback = await rollbackTestPublicationToBaseline(
      admin,
      TEST_PUBLICATION_CONFIRMATIONS.rollbackBaseline,
      db,
      NOW + 4,
    );
    expect(rollback).toMatchObject({
      changed: true,
      effect: "rolled_back",
      status: { active_revision: "baseline", state: "ready", version_count: 3 },
    });
    const activeVersion = fake.store.get(
      `${PUBLICATION_COLLECTIONS.versions}/${rollback.status.active_version_id}`,
    );
    expect(activeVersion).toMatchObject({
      data_mode: "test",
      rollbackOfVersionId: baseline.status.baseline_version_id,
      test_fixture_key: TEST_PUBLICATION_FIXTURE_KEY,
      versionNumber: 3,
    });
    await expect(
      restoreTestPublicationBaseline(
        admin,
        TEST_PUBLICATION_CONFIRMATIONS.restoreBaseline,
        db,
        NOW + 5,
      ),
    ).resolves.toMatchObject({ changed: false, effect: "unchanged" });
  });

  it("keeps Test publications out of default Live retrieval and generic upload policy resolution", async () => {
    await restoreTestPublicationBaseline(
      admin,
      TEST_PUBLICATION_CONFIRMATIONS.restoreBaseline,
      db,
      NOW,
    );

    await expect(
      listActiveTrustedPublications(admin, TEST_PUBLICATION_SPACE_ID, db),
    ).resolves.toEqual([]);
    await expect(
      listActiveTrustedPublications(admin, TEST_PUBLICATION_SPACE_ID, db, {
        dataMode: "test",
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        data_mode: "test",
        resourceId: TEST_PUBLICATION_RESOURCE_ID,
        validated: true,
      }),
    ]);
    await expect(
      resolvePublicationPolicyForSpace(
        admin,
        TEST_PUBLICATION_SPACE_ID,
        TEST_PUBLICATION_POLICY_ID,
        db,
      ),
    ).rejects.toThrow(/No enabled Live publication policy/i);

    const genericScanner = resolvePublicationScanner(TEST_PUBLICATION_EXACT_SCANNER_KEY, {
      firestoreEmulatorHost: "127.0.0.1:8080",
      localDemoAuth: true,
      nodeEnv: "development",
    });
    expect(genericScanner).toBeInstanceOf(UnavailablePublicationScanner);
  });

  it("continues a resolved Test Capture Task into one immutable version-pinned Test run", async () => {
    const baseline = await restoreTestPublicationBaseline(
      admin,
      TEST_PUBLICATION_CONFIRMATIONS.restoreBaseline,
      db,
      NOW,
    );
    seedActiveLeaseProcess(fake);

    const first = await continueTestPublicationToPinnedRun(
      admin,
      TEST_PUBLICATION_CONFIRMATIONS.continuePinnedRun,
      db,
      NOW + 1,
    );
    const duplicate = await continueTestPublicationToPinnedRun(
      admin,
      TEST_PUBLICATION_CONFIRMATIONS.continuePinnedRun,
      db,
      NOW + 2,
    );

    expect(first).toMatchObject({
      changed: true,
      effect: "continued",
      status: {
        capture_task_status: "resolved",
        continuation_ready: true,
        pinned_process_definition_version_id: "process-version-1",
        pinned_publication_version_id: baseline.status.active_version_id,
      },
    });
    expect(first.status.pinned_test_run_id).toBeTruthy();
    expect(duplicate).toMatchObject({ changed: false, effect: "unchanged" });
    expect(duplicate.status.pinned_test_run_id).toBe(first.status.pinned_test_run_id);
    expect(
      fake.store.get(`workflow_runs/${first.status.pinned_test_run_id}`),
    ).toMatchObject({
      definition_id: "lease-renewal",
      definition_version_id: "process-version-1",
      is_test_run: true,
      simulation_only: true,
      source_publication_pin: {
        data_mode: "test",
        resource_id: TEST_PUBLICATION_RESOURCE_ID,
        version_id: baseline.status.active_version_id,
        test_fixture_key: TEST_PUBLICATION_FIXTURE_KEY,
      },
    });
    expect(collection(fake, "workflow_run_timeline")).toHaveLength(1);
  });

  it("refuses a pinned continuation until the owning process has an Active version", async () => {
    await restoreTestPublicationBaseline(
      admin,
      TEST_PUBLICATION_CONFIRMATIONS.restoreBaseline,
      db,
      NOW,
    );
    fake.seed("process_definitions/lease-renewal", {
      ...activeLeaseProcess(),
      active_version_id: undefined,
      status: "Draft",
    });

    await expect(
      continueTestPublicationToPinnedRun(
        admin,
        TEST_PUBLICATION_CONFIRMATIONS.continuePinnedRun,
        db,
        NOW + 1,
      ),
    ).rejects.toThrow(/published Active process definition/i);
    expect(collection(fake, "workflow_runs")).toHaveLength(0);
  });

  it("requires Admin authority and exact operation-specific confirmation", async () => {
    await expect(inspectTestPublicationFixture(editor, db)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      restoreTestPublicationBaseline(admin, "stale confirmation", db, NOW),
    ).rejects.toMatchObject({ status: 409 });
    expect(fake.store.size).toBe(0);
  });

  it("fails closed when the reserved policy identity collides with Live state", async () => {
    fake.seed(`publication_policies/${TEST_PUBLICATION_POLICY_ID}`, {
      data_mode: "live",
      id: TEST_PUBLICATION_POLICY_ID,
    });
    await expect(
      restoreTestPublicationBaseline(
        admin,
        TEST_PUBLICATION_CONFIRMATIONS.restoreBaseline,
        db,
        NOW,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(collection(fake, PUBLICATION_COLLECTIONS.resources)).toHaveLength(0);
    expect(collection(fake, PUBLICATION_COLLECTIONS.versions)).toHaveLength(0);
  });
});

function collection(fakeDb: FakeFirestore, name: string) {
  return [...fakeDb.store.entries()]
    .filter(([path]) => path.startsWith(`${name}/`))
    .map(([, value]) => value);
}

function seedActiveLeaseProcess(fakeDb: FakeFirestore) {
  fakeDb.seed("process_definitions/lease-renewal", activeLeaseProcess());
  fakeDb.seed("process_definition_versions/process-version-1", {
    id: "process-version-1",
    definition_id: "lease-renewal",
    version_number: 1,
    activated_by_uid: admin.uid,
    snapshot_json: "{}",
    created_at: "2026-07-18T00:00:00.000Z",
  });
}

function activeLeaseProcess() {
  return {
    id: "lease-renewal",
    space_id: TEST_PUBLICATION_SPACE_ID,
    name: "Lease Renewal Test Process",
    short_outcome: "Complete the isolated Test process.",
    trigger: "Exact Test publication is active.",
    owner_uid: admin.uid,
    default_approver_uid: admin.uid,
    source_links: [{ label: "Test fixture", url: "/spaces/lease-renewals" }],
    required_starting_inputs: [],
    steps: [{ id: "step-1", title: "Review the pinned Test source" }],
    action_references: [],
    success_condition: "The Test checklist completes.",
    status: "Active",
    active_version_id: "process-version-1",
    created_by_uid: admin.uid,
    created_at: "2026-07-18T00:00:00.000Z",
    updated_at: "2026-07-18T00:00:00.000Z",
  };
}
