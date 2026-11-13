import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import type { CreateProcessDefinitionInput } from "@/lib/firestore/schemas";
import {
  createProcessDefinition,
  getProcessDefinition,
  startWorkflowRun,
} from "@/lib/firestore/workflows";
import { buildLeaseRenewalProcessTemplate } from "@/lib/lease-renewal/process-template";
import { buildOwnerRenewalOutreachProcessTemplate } from "@/lib/lease-renewal/owner-renewal-outreach/process-template";
import { buildTenantRenewalNoticeProcessTemplate } from "@/lib/lease-renewal/tenant-renewal-notice/process-template";
import { buildMoveInProcessTemplate } from "@/lib/move-in/process-template";
import { GUIDANCE_ONLY_RUN_START_REFUSAL } from "@/lib/processes/guidance-only";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";

// S286 R-S286-2, ARCH-S286-1, BEH-S286-2, AC-S286-2 and AC-S286-6: the run start service refuses
// the three renewal definitions for every caller, before any write, with the staff sentence,
// whether the definition still carries placeholder staff or real staff is recorded. A run on
// another Space still starts. Synthetic fixtures only; nothing leaves the in-memory store.

type Role = AuthenticatedUser["role"];
const actor = (role: Role): AuthenticatedUser => ({
  uid: `fixture-${role.toLowerCase()}`,
  email: `fixture-${role.toLowerCase()}@pmikcmetro.com`,
  hd: "pmikcmetro.com",
  role,
});
const editor = actor("Editor");
const PLACEHOLDER = {
  ownerUid: "process-owner-PLACEHOLDER",
  approverUid: "process-approver-PLACEHOLDER",
};
const REAL_STAFF = { ownerUid: "staff-owner-1", approverUid: "staff-approver-1" };
const SOURCES = [
  { label: "Synthetic procedure", url: "https://example.test/renewal-procedure" },
];

const RENEWAL_DEFINITIONS: ReadonlyArray<{
  id: string;
  spaceId: string;
  template: (staff: typeof PLACEHOLDER) => CreateProcessDefinitionInput;
}> = [
  {
    id: "lease-renewal",
    spaceId: "lease-renewals",
    template: (staff) =>
      buildLeaseRenewalProcessTemplate({ ...staff, sourceLinks: SOURCES }),
  },
  {
    id: "owner-renewal-outreach",
    spaceId: "owner-renewal-outreach",
    template: (staff) =>
      buildOwnerRenewalOutreachProcessTemplate({ ...staff, sourceLinks: SOURCES }),
  },
  {
    id: "tenant-renewal-notice",
    spaceId: "tenant-renewal-notice",
    template: (staff) =>
      buildTenantRenewalNoticeProcessTemplate({ ...staff, sourceLinks: SOURCES }),
  },
];

let fake: FakeFirestore;
let db: Firestore;

beforeEach(() => {
  fake = new FakeFirestore();
  db = fake as unknown as Firestore;
});

/** Writes a definition at its fixed seeded id through the app's own create normalization. */
async function seedAtFixedId(
  id: string,
  spaceId: string,
  template: CreateProcessDefinitionInput,
  overrides: Record<string, unknown> = {},
) {
  const created = await createProcessDefinition(
    editor,
    { ...template, space_id: spaceId },
    db,
  );
  fake.seed(`process_definitions/${id}`, {
    ...fake.store.get(`process_definitions/${created.id}`),
    id,
    ...overrides,
  });
  fake.store.delete(`process_definitions/${created.id}`);
  return getProcessDefinition(editor, id, db);
}

function count(prefix: string) {
  return [...fake.store.keys()].filter((key) => key.startsWith(`${prefix}/`)).length;
}

function snapshot() {
  return JSON.stringify([...fake.store.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

describe("R-S286-2 renewal run start refusal in the service", () => {
  for (const definition of RENEWAL_DEFINITIONS) {
    for (const [label, staff] of [
      ["placeholder staff", PLACEHOLDER],
      ["real staff recorded", REAL_STAFF],
    ] as const) {
      it(`BEH-S286-2 refuses a ${definition.id} start with ${label} and creates no run`, async () => {
        const seeded = await seedAtFixedId(
          definition.id,
          definition.spaceId,
          definition.template(staff),
        );
        const before = snapshot();

        await expect(
          startWorkflowRun(
            editor,
            definition.id,
            { expected_revision: seeded.revision!, note: "Synthetic start." },
            db,
          ),
        ).rejects.toMatchObject({
          status: 409,
          message: GUIDANCE_ONLY_RUN_START_REFUSAL,
        });

        expect(count("workflow_runs")).toBe(0);
        expect(count("workflow_run_timeline")).toBe(0);
        expect(snapshot()).toBe(before);
      });
    }
  }

  it("ARCH-S286-1 refuses a published renewal definition with real staff, the starting state's one run", async () => {
    // On the starting state this exact start created one run pinned to the published version.
    await seedAtFixedId(
      "owner-renewal-outreach",
      "owner-renewal-outreach",
      buildOwnerRenewalOutreachProcessTemplate({ ...REAL_STAFF, sourceLinks: SOURCES }),
      { status: "Active", active_version_id: "synthetic-version-1" },
    );

    await expect(
      startWorkflowRun(editor, "owner-renewal-outreach", {}, db),
    ).rejects.toMatchObject({ status: 409, message: GUIDANCE_ONLY_RUN_START_REFUSAL });
    expect(count("workflow_runs")).toBe(0);
  });

  it.each(["Editor", "Approver", "Admin"] as const)(
    "AC-S286-2 refuses every %s caller, including a trusted server run id",
    async (role) => {
      await seedAtFixedId(
        "tenant-renewal-notice",
        "tenant-renewal-notice",
        buildTenantRenewalNoticeProcessTemplate({ ...REAL_STAFF, sourceLinks: SOURCES }),
      );

      await expect(
        startWorkflowRun(actor(role), "tenant-renewal-notice", {}, db, {
          runId: "trusted-renewal-run",
        }),
      ).rejects.toMatchObject({ status: 409, message: GUIDANCE_ONLY_RUN_START_REFUSAL });
      expect(fake.store.has("workflow_runs/trusted-renewal-run")).toBe(false);
      expect(count("workflow_runs")).toBe(0);
    },
  );

  it("AC-S286-2 refuses before any read, so even a missing renewal definition answers the staff sentence", async () => {
    await expect(startWorkflowRun(editor, "lease-renewal", {}, db)).rejects.toMatchObject(
      {
        status: 409,
        message: GUIDANCE_ONLY_RUN_START_REFUSAL,
      },
    );
    expect(fake.store.size).toBe(0);
  });

  it("BEH-S286-2 still starts one run on another Space", async () => {
    await seedAtFixedId(
      "move-in",
      "move-in",
      buildMoveInProcessTemplate({ ...REAL_STAFF, sourceLinks: SOURCES }),
    );

    const run = await startWorkflowRun(
      editor,
      "move-in",
      { note: "Synthetic start." },
      db,
    );

    expect(run).toMatchObject({
      definition_id: "move-in",
      status: "In Progress",
      owner_uid: REAL_STAFF.approverUid,
    });
    expect(count("workflow_runs")).toBe(1);
    expect(count("workflow_run_timeline")).toBe(1);
  });

  it("BEH-S286-2 still starts a custom definition stamped with a renewal Space (S283 R-S283-4 owns it)", async () => {
    const custom = await createProcessDefinition(
      editor,
      {
        ...buildOwnerRenewalOutreachProcessTemplate({
          ...REAL_STAFF,
          sourceLinks: SOURCES,
        }),
        space_id: "owner-renewal-outreach",
      },
      db,
    );

    const run = await startWorkflowRun(editor, custom.id, {}, db);

    expect(run.definition_id).toBe(custom.id);
    expect(count("workflow_runs")).toBe(1);
  });
});

describe("AC-S286-6 counts before and after the refusals", () => {
  it("AC-S286-6 keeps runs, definitions and versions equal across every refused start", async () => {
    for (const definition of RENEWAL_DEFINITIONS)
      await seedAtFixedId(
        definition.id,
        definition.spaceId,
        definition.template(REAL_STAFF),
      );
    fake.seed("process_definition_versions/synthetic-version-1", {
      id: "synthetic-version-1",
      definition_id: "owner-renewal-outreach",
    });
    const before = {
      runs: count("workflow_runs"),
      definitions: count("process_definitions"),
      versions: count("process_definition_versions"),
    };
    const bytes = snapshot();

    for (const definition of RENEWAL_DEFINITIONS)
      for (const role of ["Editor", "Approver", "Admin"] as const)
        await expect(
          startWorkflowRun(actor(role), definition.id, {}, db),
        ).rejects.toMatchObject({ status: 409 });

    expect({
      runs: count("workflow_runs"),
      definitions: count("process_definitions"),
      versions: count("process_definition_versions"),
    }).toEqual(before);
    expect(snapshot()).toBe(bytes);
  });
});
