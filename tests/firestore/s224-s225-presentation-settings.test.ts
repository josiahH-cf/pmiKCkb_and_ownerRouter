import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { beforeAll, beforeEach, afterAll, it, expect, vi } from "vitest";
import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import {
  savePresentationSetting as save,
  readBusinessProfile as read,
  inspectOwnBusinessProfile,
  readPresentationOperation,
  readApplicationDisplayName,
  stopPresentationOperation as stop,
} from "@/lib/firestore/presentation-settings";
import type { PresentationCommand } from "@/lib/staff/business-profile";
const admin = {
    uid: "profile-admin",
    email: "profile-admin@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Admin" as const,
  },
  staff = {
    uid: "profile-staff",
    email: "profile-staff@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor" as const,
  };
let env: RulesTestEnvironment, app: ReturnType<typeof initializeApp>, db: Firestore;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "pmi-kc-kb-presentation-test",
    firestore: {
      ...FIRESTORE_EMULATOR_TARGET,
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });
  app = initializeApp(
    { projectId: "pmi-kc-kb-presentation-test" },
    `presentation-${process.pid}`,
  );
  db = getFirestore(app);
});
beforeEach(async () => {
  await env.clearFirestore();
});
afterAll(async () => {
  await env.cleanup();
  await deleteApp(app);
});
const identity = vi.fn(async (uid: string) => ({
  uid,
  email: staff.email,
  emailVerified: true,
  disabled: false,
  customClaims: { role: "Editor" },
}));
function profile(): Extract<PresentationCommand, { op: "save_profile" }> {
  return {
    op: "save_profile",
    operationId: randomUUID(),
    expectedVersion: 0,
    uid: staff.uid,
    profile: {
      name: "Fixture staff",
      businessTitle: "Property Manager",
      phone: "",
      hours: "",
      website: "",
      source: "Fixture reviewed contacts",
    },
    reason: "Fixture actual business profile review",
  };
}
it("binds existing verified staff, refuses unknown/vendor/personal/disabled targets and non-Admin saves", async () => {
  const command = profile();
  for (const bad of [
    { uid: staff.uid, email: "personal@gmail.com", emailVerified: true },
    { uid: staff.uid, email: staff.email, emailVerified: false },
    { uid: staff.uid, email: staff.email, emailVerified: true, disabled: true },
    {
      uid: staff.uid,
      email: staff.email,
      emailVerified: true,
      customClaims: { vendor: true },
    },
  ])
    await expect(
      save(admin, command, { db, verifyStaff: async () => bad }),
    ).rejects.toMatchObject({ status: 400 });
  await expect(save(staff, command, { db, verifyStaff: identity })).rejects.toMatchObject(
    { status: 403 },
  );
  await expect(
    save({ ...admin, email: "canary-admin@pmikcmetro.com" }, command, {
      db,
      verifyStaff: identity,
    }),
  ).rejects.toMatchObject({ status: 403 });
  await save(admin, command, { db, verifyStaff: identity });
  expect((await read(staff, staff.uid, db))?.profile.businessTitle).toBe(
    "Property Manager",
  );
  await expect(read({ ...staff, uid: "other" }, staff.uid, db)).rejects.toMatchObject({
    status: 403,
  });
  expect((await db.collection("action_executions").get()).size).toBe(0);
});
it("recovers lost responses across identity outage and keeps versions, prior signatures and queued bytes unchanged", async () => {
  const signature = {
    name: "Prior fixture name",
    role: "Prior business title",
    phone: null,
    hours: null,
    website: null,
    source: "Fixture previous signature",
  };
  await db.collection("renewal_sender_signatures").doc(staff.uid).set({
    schemaVersion: "renewal-sender-signature/v1",
    actorUid: staff.uid,
    email: staff.email,
    signature,
    leaseId: "701",
    cycleId: randomUUID(),
    channel: "owner",
    updatedAt: new Date().toISOString(),
  });
  await db
    .collection("workflow_communication_sequences")
    .doc("original")
    .set({ exactMessage: "Prior immutable approved fixture bytes" });
  const command = profile(),
    saved = await save(admin, command, { db, verifyStaff: identity });
  expect(
    await save(admin, command, {
      db,
      verifyStaff: async () => {
        throw Error("Fixture auth outage");
      },
    }),
  ).toEqual(saved);
  expect((await readPresentationOperation(admin, command.operationId, db)).state).toBe(
    "committed",
  );
  await expect(
    save(
      admin,
      { ...command, profile: { ...command.profile, businessTitle: "Different" } },
      { db, verifyStaff: identity },
    ),
  ).rejects.toMatchObject({ status: 409 });
  const changes = await Promise.allSettled([
    save(
      admin,
      {
        ...command,
        expectedVersion: 1,
        operationId: randomUUID(),
        profile: { ...command.profile, businessTitle: "Reviewed next title" },
      },
      { db, verifyStaff: identity },
    ),
    save(
      admin,
      {
        ...command,
        expectedVersion: 1,
        operationId: randomUUID(),
        profile: { ...command.profile, businessTitle: "Concurrent title" },
      },
      { db, verifyStaff: identity },
    ),
  ]);
  expect(changes.filter((c) => c.status === "fulfilled")).toHaveLength(1);
  expect((await db.collection("staff_business_profile_versions").get()).size).toBe(2);
  expect((await inspectOwnBusinessProfile(staff, db)).retainedSignature).toEqual(
    signature,
  );
  expect(
    (await db.collection("workflow_communication_sequences").doc("original").get()).data()
      ?.exactMessage,
  ).toBe("Prior immutable approved fixture bytes");
});
it("saves/reset the display label without provider effects and fences cancellation before admission", async () => {
  expect(await readApplicationDisplayName(db)).toBe("PMI KC KB");
  const command: PresentationCommand = {
    op: "save_display_name",
    operationId: randomUUID(),
    expectedVersion: 0,
    displayName: "Fixture application name",
    reason: "Fixture display review",
  };
  await save(admin, command, { db });
  expect(await readApplicationDisplayName(db)).toBe(command.displayName);
  await save(
    admin,
    { ...command, operationId: randomUUID(), expectedVersion: 1, displayName: "" },
    { db },
  );
  expect(await readApplicationDisplayName(db)).toBe("PMI KC KB");
  expect((await db.collection("application_presentation_versions").get()).size).toBe(2);
  const stopped = { ...command, operationId: randomUUID(), expectedVersion: 2 };
  expect((await stop(admin, stopped.operationId, db)).state).toBe("cancelled");
  await expect(save(admin, stopped, { db })).rejects.toMatchObject({ status: 409 });
  expect((await db.collection("action_executions").get()).size).toBe(0);
});
