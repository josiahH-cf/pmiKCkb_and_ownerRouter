import { readFileSync } from "node:fs";
import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: {
      ...FIRESTORE_EMULATOR_TARGET,
      rules: readFileSync("firestore.rules", "utf8"),
    },
    projectId: "pmi-kc-kb-workflow-test",
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "process_definitions/definition-1"), {
      id: "definition-1",
      name: "Lease Renewal Test Process",
      short_outcome: "Prepare a renewal package.",
      trigger: "Manual start.",
      owner_uid: "editor-uid",
      default_approver_uid: "admin-uid",
      source_links: [{ label: "Workflow notes", url: "https://example.com/source" }],
      required_starting_inputs: [],
      steps: [{ id: "step-1", title: "Gather facts" }],
      action_references: [],
      success_condition: "Package is ready.",
      status: "Draft",
      created_by_uid: "editor-uid",
      created_at: "2026-06-06T00:00:00.000Z",
      updated_at: "2026-06-06T00:00:00.000Z",
    });
    await setDoc(doc(db, "process_definition_versions/version-1"), {
      id: "version-1",
      definition_id: "definition-1",
      version_number: 1,
      activated_by_uid: "admin-uid",
      snapshot_json: "{}",
      created_at: "2026-06-06T00:00:00.000Z",
    });
    await setDoc(doc(db, "workflow_runs/run-1"), {
      id: "run-1",
      definition_id: "definition-1",
      process_name: "Lease Renewal Test Process",
      status: "In Progress",
      owner_uid: "admin-uid",
      next_action: "Gather facts",
      due_date: "2026-07-01",
      is_test_run: true,
      simulation_only: true,
      production_metrics_included: false,
      started_by_uid: "editor-uid",
      created_at: "2026-06-06T00:00:00.000Z",
      updated_at: "2026-06-06T00:00:00.000Z",
    });
    await setDoc(doc(db, "workflow_run_timeline/timeline-1"), {
      id: "timeline-1",
      run_id: "run-1",
      actor_uid: "editor-uid",
      event_type: "started",
      summary: "Started simulation-only test run.",
      new_status: "In Progress",
      created_at: "2026-06-06T00:00:00.000Z",
    });
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe("workflow Firestore rules", () => {
  it("requires authentication to read workflow records", async () => {
    const db = testEnv.unauthenticatedContext().firestore();

    await assertFails(getDoc(doc(db, "process_definitions/definition-1")));
    await assertFails(getDoc(doc(db, "workflow_runs/run-1")));
    await assertFails(getDoc(doc(db, "workflow_run_timeline/timeline-1")));
  });

  it("allows signed-in app users to read workflow records", async () => {
    const db = authedDb("Editor");

    await assertSucceeds(getDoc(doc(db, "process_definitions/definition-1")));
    await assertSucceeds(getDoc(doc(db, "process_definition_versions/version-1")));
    await assertSucceeds(getDoc(doc(db, "workflow_runs/run-1")));
    await assertSucceeds(getDoc(doc(db, "workflow_run_timeline/timeline-1")));
  });

  it("denies all direct client writes to workflow records, even for Admins", async () => {
    const db = authedDb("Admin");

    await assertFails(
      setDoc(doc(db, "process_definitions/definition-2"), {
        id: "definition-2",
        name: "Forged Process",
      }),
    );
    await assertFails(
      updateDoc(doc(db, "process_definitions/definition-1"), { status: "Active" }),
    );
    await assertFails(deleteDoc(doc(db, "process_definitions/definition-1")));
    await assertFails(
      setDoc(doc(db, "process_definition_versions/version-2"), {
        id: "version-2",
      }),
    );
    await assertFails(
      setDoc(doc(db, "workflow_runs/run-2"), {
        id: "run-2",
        simulation_only: false,
      }),
    );
    await assertFails(updateDoc(doc(db, "workflow_runs/run-1"), { status: "Completed" }));
    await assertFails(deleteDoc(doc(db, "workflow_runs/run-1")));
    await assertFails(
      setDoc(doc(db, "workflow_run_timeline/timeline-2"), {
        id: "timeline-2",
        event_type: "completed",
      }),
    );
    await assertFails(deleteDoc(doc(db, "workflow_run_timeline/timeline-1")));
  });
});

function authedDb(role: "Editor" | "Approver" | "Admin") {
  return testEnv.authenticatedContext(`${role.toLowerCase()}-uid`, { role }).firestore();
}
