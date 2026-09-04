import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { createUnverifiedIntakeFromPublic } from "@/lib/firestore/maintenance-unverified-intake";
import {
  listUnverifiedIntake,
  promoteUnverifiedIntake,
} from "@/lib/firestore/maintenance-intake-review";
import { projectMaintenanceWaitingOn } from "@/lib/maintenance/waiting-on";

// S109: the public writer derives urgency, evidence, and the resource from the pure rules and never
// from the request body, and promotion carries the triage onto the ticket so S108 shows the same
// blocker the reporter was told about. Values are synthetic.

const projectId = "pmi-kc-kb-s109-intake-triage-test";
const editor: AuthenticatedUser = {
  uid: "editor-1",
  email: "editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};

let app: App;
let db: Firestore;
let testEnv: RulesTestEnvironment;
let sequence = 0;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s109-intake-triage-${process.pid}`);
  db = getFirestore(app);
});

beforeEach(async () => testEnv.clearFirestore());

afterAll(async () => {
  await deleteApp(app);
  await testEnv.cleanup();
});

async function submit(overrides: Record<string, unknown> = {}) {
  sequence += 1;
  return createUnverifiedIntakeFromPublic(
    {
      propertyKey: "prop-1",
      dataMode: "live",
      jti: `jti-${sequence}`,
      tokenEpoch: 0,
      singleUse: true,
      summary: "Water under the kitchen sink",
      description: "",
      contact: "",
      issueType: "Plumbing",
      ipHash: null,
      dailyCap: 50,
      signageCap: 50,
      ...overrides,
    },
    db,
  );
}

describe("S109 the writer owns triage, not the request body (ARCH-S109-1)", () => {
  it("stores the derived urgency, evidence, and completion state", async () => {
    const { id } = await submit();
    const stored = (
      await db.collection("maintenance_unverified_intake").doc(id).get()
    ).data()!;
    expect(stored).toMatchObject({
      issue_type: "Plumbing",
      urgency: "normal",
      required_evidence: ["photos"],
      photos_needed: true,
      intake_complete: false,
    });
    expect(stored.resource_id).toBeUndefined();
  });

  it("ignores urgency and evidence supplied in the submission", async () => {
    const { id } = await submit({
      urgency: "emergency_fire",
      photos_needed: false,
      intake_complete: true,
      resource_id: "res-forged",
    } as Record<string, unknown>);
    const stored = (
      await db.collection("maintenance_unverified_intake").doc(id).get()
    ).data()!;
    expect(stored).toMatchObject({
      urgency: "normal",
      photos_needed: true,
      intake_complete: false,
    });
    expect(stored.resource_id).toBeUndefined();
  });

  it("derives the emergency and urgent paths from the report text", async () => {
    const fire = await submit({ summary: "There is smoke in the hallway" });
    const flooding = await submit({ summary: "The basement is flooding" });
    for (const [id, urgency] of [
      [fire.id, "emergency_fire"],
      [flooding.id, "urgent_flooding"],
    ] as const) {
      const stored = (
        await db.collection("maintenance_unverified_intake").doc(id).get()
      ).data()!;
      expect(stored.urgency).toBe(urgency);
    }
  });

  it("shows the reviewer the same triage before promotion", async () => {
    await submit();
    const queue = await listUnverifiedIntake(editor, "unverified", db);
    expect(queue[0]).toMatchObject({
      urgency: "normal",
      photos_needed: true,
      issue_type: "Plumbing",
    });
  });
});

describe("S109 promotion carries triage into the ticket (BEH-S109-3 / MAI-07)", () => {
  it("copies urgency, issue type, and the photo blocker onto the ticket", async () => {
    const { id } = await submit();
    const ticket = await promoteUnverifiedIntake(editor, id, {}, db);
    expect(ticket).toMatchObject({
      status: "Open",
      intake_urgency: "normal",
      intake_issue_type: "Plumbing",
      photos_needed: true,
    });
    const projection = projectMaintenanceWaitingOn({
      ticket: { ...ticket, unit: { unitId: "unit:1", label: "Unit 1" } },
      link: null,
      preapproval: null,
    });
    expect(projection.waitingOn).toBe("resident");
    expect(projection.photosNeeded).toBe(true);
    expect(projection.nextAction).toMatch(/photos/i);
  });

  it("promotes a fire report as Emergency with auto-inferred provenance", async () => {
    const { id } = await submit({ summary: "There is smoke in the hallway" });
    await expect(promoteUnverifiedIntake(editor, id, {}, db)).resolves.toMatchObject({
      priority: "Emergency",
      priority_provenance: "auto-inferred",
      intake_urgency: "emergency_fire",
    });
  });

  it("promotes an active-water report as Emergency", async () => {
    const { id } = await submit({ summary: "The basement is flooding" });
    await expect(promoteUnverifiedIntake(editor, id, {}, db)).resolves.toMatchObject({
      priority: "Emergency",
      intake_urgency: "urgent_flooding",
    });
  });

  it("still honors an explicit operator priority", async () => {
    const { id } = await submit({ summary: "There is smoke in the hallway" });
    await expect(
      promoteUnverifiedIntake(editor, id, { priority: "Low" }, db),
    ).resolves.toMatchObject({ priority: "Low", priority_provenance: "operator-set" });
  });

  it("records the triage in the promotion activity", async () => {
    const { id } = await submit();
    const ticket = await promoteUnverifiedIntake(editor, id, {}, db);
    const activity = await db
      .collection("maintenance_ticket_activity")
      .where("ticket_id", "==", ticket.id)
      .get();
    const text = activity.docs.map((doc) => String(doc.data().text)).join(" ");
    expect(text).toMatch(/Intake urgency: normal/);
    expect(text).toMatch(/Photos are still needed/);
  });
});
