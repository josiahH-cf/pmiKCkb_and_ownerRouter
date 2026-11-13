import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  createProcessDefinition,
  getProcessDefinition,
  updateProcessDefinition,
} from "@/lib/firestore/workflows";
import { buildOwnerRenewalOutreachProcessTemplate } from "@/lib/lease-renewal/owner-renewal-outreach/process-template";
import { publishProcessDefinition } from "@/lib/publication/process-definition";
import { FakePublicationScanner } from "@/lib/publication/scanners";
import { rollbackTrustedPublication } from "@/lib/publication/service";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";

// S286 R-S286-5 and AC-S286-5: review, publication, versions and rollback of a renewal process are
// unchanged (S241). The form no longer asks for a run owner: a save with the run owner and
// approver left empty is accepted and keeps the stored placeholder values. A non-renewal definition
// still requires them. AC-S286-6: no run is created along the way. Synthetic fixtures only.

const ID = "owner-renewal-outreach";
const editor: AuthenticatedUser = {
  uid: "fixture-editor",
  email: "fixture-editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const PLACEHOLDER_OWNER = "process-owner-PLACEHOLDER";
const PLACEHOLDER_APPROVER = "process-approver-PLACEHOLDER";
const template = buildOwnerRenewalOutreachProcessTemplate({
  ownerUid: PLACEHOLDER_OWNER,
  approverUid: PLACEHOLDER_APPROVER,
  sourceLinks: [{ label: "Synthetic procedure", url: "https://example.test/procedure" }],
});

let fake: FakeFirestore;
let db: Firestore;

beforeEach(async () => {
  fake = new FakeFirestore();
  db = fake as unknown as Firestore;
  fake.seed("publication_policies/policy-1", {
    allowedSpaces: [ID],
    allowedTypes: [],
    connectorId: "connector-1",
    createdAt: "2026-11-03",
    createdByUid: editor.uid,
    enabled: true,
    rootId: "root-1",
    scannerKey: "fake-clean-v1",
    sensitivityCeiling: "Medium",
    updatedAt: "2026-11-03",
    updatedByUid: editor.uid,
  });
  const created = await createProcessDefinition(
    editor,
    { ...template, space_id: ID },
    db,
  );
  fake.seed(`process_definitions/${ID}`, {
    ...fake.store.get(`process_definitions/${created.id}`),
    id: ID,
  });
  fake.store.delete(`process_definitions/${created.id}`);
});

const revisionOf = async (id: string) =>
  (await getProcessDefinition(editor, id, db)).revision!;

function storedStaff() {
  const stored = fake.store.get(`process_definitions/${ID}`)!;
  return {
    owner_uid: stored.owner_uid,
    default_approver_uid: stored.default_approver_uid,
  };
}

function count(prefix: string) {
  return [...fake.store.keys()].filter((key) => key.startsWith(`${prefix}/`)).length;
}

async function publish() {
  return publishProcessDefinition(
    editor,
    ID,
    { expected_revision: await revisionOf(ID), policy_id: "policy-1" },
    { db, scanner: new FakePublicationScanner() },
  );
}

describe("AC-S286-5 a renewal definition saves, publishes and rolls back without a run owner", () => {
  it("AC-S286-5 accepts a save with the run owner and approver empty and keeps the stored placeholders", async () => {
    const saved = await updateProcessDefinition(
      editor,
      ID,
      {
        expected_revision: await revisionOf(ID),
        name: "Owner Renewal Outreach (reviewed)",
        owner_uid: "",
        default_approver_uid: "",
      },
      db,
    );

    expect(saved.name).toBe("Owner Renewal Outreach (reviewed)");
    expect(storedStaff()).toEqual({
      owner_uid: PLACEHOLDER_OWNER,
      default_approver_uid: PLACEHOLDER_APPROVER,
    });
  });

  it("AC-S286-5 publishes, edits, republishes and rolls back with the fields empty, keeping every version", async () => {
    const first = await publish();
    expect(first.definition).toMatchObject({ status: "Active" });
    const firstVersion = structuredClone(
      fake.store.get(`process_definition_versions/${first.publicationVersion.id}`),
    );

    await updateProcessDefinition(
      editor,
      ID,
      {
        expected_revision: await revisionOf(ID),
        steps: [{ id: "step-1", title: "Synthetic revised step" }],
        owner_uid: "",
        default_approver_uid: "",
      },
      db,
    );
    expect((await getProcessDefinition(editor, ID, db)).status).toBe("Draft");
    const second = await publish();
    expect(second.definition.active_version_id).toBe(second.publicationVersion.id);
    expect(second.definition.steps).toEqual([
      { id: "step-1", title: "Synthetic revised step" },
    ]);

    const rolledBack = await rollbackTrustedPublication(
      editor,
      `process-definition:${ID}`,
      first.publicationVersion.id,
      "Restore the first reviewed synthetic version.",
      db,
    );
    expect(rolledBack.rollbackOfVersionId).toBe(first.publicationVersion.id);

    // Prior immutable versions are retained unchanged, and the stored staff are untouched.
    expect(
      fake.store.get(`process_definition_versions/${first.publicationVersion.id}`),
    ).toEqual(firstVersion);
    expect(count("process_definition_versions")).toBe(2);
    expect(storedStaff()).toEqual({
      owner_uid: PLACEHOLDER_OWNER,
      default_approver_uid: PLACEHOLDER_APPROVER,
    });
    // AC-S286-6: nothing along the way started a run.
    expect(count("workflow_runs")).toBe(0);
  });

  it("AC-S286-5 still requires the fields on a non-renewal definition and keeps its stored values", async () => {
    const custom = await createProcessDefinition(
      editor,
      {
        ...template,
        space_id: ID,
        owner_uid: "staff-owner-1",
        default_approver_uid: "staff-approver-1",
      },
      db,
    );

    await expect(
      updateProcessDefinition(
        editor,
        custom.id,
        {
          expected_revision: await revisionOf(custom.id),
          owner_uid: "",
          default_approver_uid: "",
        },
        db,
      ),
    ).rejects.toThrow();
    expect(fake.store.get(`process_definitions/${custom.id}`)).toMatchObject({
      owner_uid: "staff-owner-1",
      default_approver_uid: "staff-approver-1",
    });
  });

  it("AC-S286-5 keeps a non-blank value sent for a renewal definition", async () => {
    await updateProcessDefinition(
      editor,
      ID,
      {
        expected_revision: await revisionOf(ID),
        owner_uid: "staff-owner-1",
        default_approver_uid: "",
      },
      db,
    );
    expect(storedStaff()).toEqual({
      owner_uid: "staff-owner-1",
      default_approver_uid: PLACEHOLDER_APPROVER,
    });
  });
});
