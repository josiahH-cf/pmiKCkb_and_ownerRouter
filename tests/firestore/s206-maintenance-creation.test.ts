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
  createMaintenanceTicket,
  MAINTENANCE_TICKET_COLLECTIONS as C,
} from "@/lib/firestore/maintenance-tickets";
const fixture = vi.hoisted(() => ({
  db: null as Firestore | null,
  sourceReadable: true,
}));
vi.mock("@/lib/firestore/admin", () => ({ getAdminFirestore: () => fixture.db }));
vi.mock("@/lib/maintenance/verified-ticket-property", () => ({
  verifyMaintenanceCreationUnit: vi.fn(async () => {
    if (!fixture.sourceReadable) throw Error("Unit source unavailable");
    return "901";
  }),
}));
import { setAuthResolverForTest } from "@/lib/auth/session";
import { GET, POST } from "@/app/api/maintenance/tickets/route";
import { readMaintenanceTicketCreation } from "@/lib/firestore/maintenance-tickets";
import { verifyMaintenanceCreationUnit } from "@/lib/maintenance/verified-ticket-property";
const staff = {
  uid: "creation-staff",
  email: "creation-staff@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor" as const,
};
let env: RulesTestEnvironment, app: ReturnType<typeof initializeApp>, db: Firestore;
const input = () => ({
  creation_id: randomUUID(),
  summary: "Local test dripping tap",
  description: "Synthetic issue for emulator only.",
  priority: "Normal",
  unit: {
    unitId: "unit:801",
    label: "Local fixture 801",
    confidence: "Verified" as const,
  },
});
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "pmi-kc-kb-s206-creation-test",
    firestore: {
      ...FIRESTORE_EMULATOR_TARGET,
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });
  app = initializeApp(
    { projectId: "pmi-kc-kb-s206-creation-test" },
    `creation-${process.pid}`,
  );
  db = getFirestore(app);
  fixture.db = db;
});
beforeEach(async () => {
  await env.clearFirestore();
  fixture.sourceReadable = true;
  setAuthResolverForTest(() => staff);
  vi.mocked(verifyMaintenanceCreationUnit).mockClear();
});
afterAll(async () => {
  setAuthResolverForTest(null);
  await env.cleanup();
  await deleteApp(app);
});
it("one creation intent settles one app ticket and one initial activity through concurrent/reopened requests", async () => {
  const command = input();
  const results = await Promise.all(
    Array.from({ length: 6 }, () => createMaintenanceTicket(staff, command, db, "901")),
  );
  expect(new Set(results.map((r) => r.id)).size).toBe(1);
  expect((await createMaintenanceTicket(staff, command, db, "901")).id).toBe(
    results[0].id,
  );
  expect((await db.collection(C.tickets).get()).size).toBe(1);
  expect((await db.collection(C.activity).get()).size).toBe(1);
  expect((await db.collection("action_executions").get()).empty).toBe(true);
});
it("a reused identity with changed content refuses instead of rewriting or creating another ticket", async () => {
  const command = input(),
    created = await createMaintenanceTicket(staff, command, db, "901");
  await expect(
    createMaintenanceTicket(
      staff,
      { ...command, description: "Changed after dispatch" },
      db,
      "901",
    ),
  ).rejects.toMatchObject({ status: 409 });
  expect((await db.collection(C.tickets).doc(created.id).get()).data()?.description).toBe(
    command.description,
  );
  expect((await db.collection(C.tickets).get()).size).toBe(1);
});
it("the same client UUID is private to the actor and a deliberately new intent is independent", async () => {
  const command = input(),
    one = await createMaintenanceTicket(staff, command, db, "901"),
    two = await createMaintenanceTicket(
      { ...staff, uid: "different-staff", email: "different@pmikcmetro.com" },
      command,
      db,
      "901",
    );
  expect(two.id).not.toBe(one.id);
  expect(
    (
      await createMaintenanceTicket(
        staff,
        { ...command, creation_id: randomUUID() },
        db,
        "901",
      )
    ).id,
  ).not.toBe(one.id);
  expect((await db.collection(C.tickets).get()).size).toBe(3);
});

it("recovers exact original HTTP/receipt state through a current unit-source outage without another ticket or provider effect", async () => {
  const command = input(),
    request = () =>
      new Request("http://local.test/api/maintenance/tickets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(command),
      });
  const first = await POST(request());
  expect(first.status).toBe(201);
  const created = await first.json();
  fixture.sourceReadable = false;
  const recovered = await POST(request());
  expect(recovered.status).toBe(200);
  expect((await recovered.json()).ticket.id).toBe(created.ticket.id);
  expect(verifyMaintenanceCreationUnit).toHaveBeenCalledTimes(1);
  const receipt = await GET(
    new Request(
      `http://local.test/api/maintenance/tickets?creation_id=${command.creation_id}`,
    ),
  );
  expect((await receipt.json()).state).toBe("created");
  setAuthResolverForTest(() => ({ ...staff, uid: "different-staff" }));
  const other = await GET(
    new Request(
      `http://local.test/api/maintenance/tickets?creation_id=${command.creation_id}`,
    ),
  );
  expect(await other.json()).toMatchObject({ state: "not_recorded", ticket: null });
  expect((await db.collection(C.tickets).get()).size).toBe(1);
  expect((await db.collection("action_executions").get()).empty).toBe(true);
});
it("an absent or unavailable receipt does not claim failure, and rejected transaction writes leave neither partial ticket nor intent", async () => {
  const command = input();
  expect(
    await readMaintenanceTicketCreation(staff, command.creation_id, undefined, db),
  ).toMatchObject({
    state: "not_recorded",
    ticket: null,
    detail: expect.stringContaining("does not prove"),
  });
  const rejected = new Proxy(db, {
    get(target, key) {
      if (key === "runTransaction")
        return (callback: (tx: unknown) => Promise<unknown>) =>
          target.runTransaction(async (tx) => {
            await callback(tx);
            throw new Error("Deliberate rejection before commit");
          });
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  await expect(createMaintenanceTicket(staff, command, rejected, "901")).rejects.toThrow(
    "before commit",
  );
  for (const collection of [C.tickets, C.activity, C.creationIntents])
    expect((await db.collection(collection).get()).empty).toBe(true);
  const made = await createMaintenanceTicket(staff, command, db, "901");
  await db.collection(C.tickets).doc(made.id).delete();
  expect(
    await readMaintenanceTicketCreation(staff, command.creation_id, undefined, db),
  ).toMatchObject({ state: "unresolved", ticket: null });
  await expect(createMaintenanceTicket(staff, command, db, "901")).rejects.toMatchObject({
    status: 409,
  });
  expect((await db.collection(C.creationIntents).get()).size).toBe(1);
});
it("rejects forged HTTP identity and verification writes before app commit, while preserving current managed staff admission", async () => {
  const post = (body: unknown) =>
    POST(
      new Request("http://local.test/api/maintenance/tickets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  expect((await post({ ...input(), reporter_uid: "another-person" })).status).toBe(400);
  expect((await post({ ...input(), creation_id: undefined })).status).toBe(400);
  await expect(
    createMaintenanceTicket(
      { ...staff, email: "canary-editor@pmikcmetro.com" },
      input(),
      db,
      "901",
    ),
  ).rejects.toMatchObject({ status: 403 });
  expect((await db.collection(C.tickets).get()).empty).toBe(true);
});
