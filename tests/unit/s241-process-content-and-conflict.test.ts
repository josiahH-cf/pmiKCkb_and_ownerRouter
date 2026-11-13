import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";
import {
  createProcessDefinition,
  getProcessDefinition,
  getWorkflowRunDefinition,
  startWorkflowRun,
  updateProcessDefinition,
  updateWorkflowRunOutcome,
} from "@/lib/firestore/workflows";
import { setWorkflowRunStepCheck } from "@/lib/firestore/workflow-run-step-checks";
import { publishProcessDefinition } from "@/lib/publication/process-definition";
import { FakePublicationScanner } from "@/lib/publication/scanners";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";
import { buildOwnerRenewalOutreachProcessTemplate } from "@/lib/lease-renewal/owner-renewal-outreach/process-template";
import { computeSpaceCardState } from "@/lib/space-card-state";

const editor = {
  uid: "fixture-editor",
  email: "editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor" as const,
};
/** Every save, publish and start binds to the revision the caller just reviewed. */
const revisionOf = async (db: Firestore, id: string) =>
  (await getProcessDefinition(editor, id, db)).revision!;
async function fixture() {
  const fake = new FakeFirestore();
  const db = fake as unknown as Firestore;
  fake.seed("publication_policies/policy-1", {
    allowedSpaces: ["owner-renewal-outreach"],
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
  const template = buildOwnerRenewalOutreachProcessTemplate({
    ownerUid: editor.uid,
    approverUid: editor.uid,
    sourceLinks: [
      { label: "Approved fixture procedure", url: "https://example.test/procedure" },
    ],
  });
  const created = await createProcessDefinition(
    editor,
    { ...template, space_id: "owner-renewal-outreach" },
    db,
  );
  return { fake, db, created };
}
describe("S241 reviewed existing process content and conflict safety", () => {
  it("refuses starting Active content whose immutable version reference is absent", async () => {
    const { fake, db, created } = await fixture();
    fake.seed(`process_definitions/${created.id}`, {
      ...fake.store.get(`process_definitions/${created.id}`),
      status: "Active",
    });
    await expect(startWorkflowRun(editor, created.id, {}, db)).rejects.toMatchObject({
      status: 409,
    });
    expect(
      [...fake.store.keys()].filter((key) => key.startsWith("workflow_runs/")),
    ).toHaveLength(0);
  });

  it("preserves an existing unpinned run's legacy mutable-definition meaning", async () => {
    const { fake, db, created } = await fixture();
    const run = await startWorkflowRun(editor, created.id, {}, db);
    fake.seed(`process_definitions/${created.id}`, {
      ...fake.store.get(`process_definitions/${created.id}`),
      status: "Active",
      steps: [{ id: "legacy-current", title: "Current legacy work" }],
    });
    expect((await getWorkflowRunDefinition(editor, run, db)).steps).toEqual([
      { id: "legacy-current", title: "Current legacy work" },
    ]);
    expect(fake.store.get(`workflow_runs/${run.id}`)).not.toHaveProperty(
      "definition_version_id",
    );
  });

  it("starts edited Draft content without attributing it to the retained prior published version", async () => {
    const { db, created } = await fixture();
    const published = await publishProcessDefinition(
      editor,
      created.id,
      { expected_revision: await revisionOf(db, created.id) },
      { db, scanner: new FakePublicationScanner() },
    );
    await updateProcessDefinition(
      editor,
      created.id,
      {
        expected_revision: await revisionOf(db, created.id),
        name: "Edited draft",
        steps: [{ id: "draft-step", title: "Draft work" }],
      },
      db,
    );
    const run = await startWorkflowRun(editor, created.id, {}, db);
    expect(run.definition_version_id).toBeUndefined();
    expect(run.next_action).toBe("Draft work");
    expect((await getProcessDefinition(editor, created.id, db)).active_version_id).toBe(
      published.publicationVersion.id,
    );
  });

  it("keeps a published run's immutable steps after the current process is edited", async () => {
    const { fake, db, created } = await fixture();
    const published = await publishProcessDefinition(
      editor,
      created.id,
      { expected_revision: await revisionOf(db, created.id) },
      { db, scanner: new FakePublicationScanner() },
    );
    const run = await startWorkflowRun(editor, created.id, {}, db);
    const versionBefore = structuredClone(
      fake.store.get(`process_definition_versions/${published.publicationVersion.id}`),
    );
    await updateProcessDefinition(
      editor,
      created.id,
      {
        expected_revision: await revisionOf(db, created.id),
        steps: [{ id: "draft-step", title: "Draft work" }],
      },
      db,
    );
    expect((await getWorkflowRunDefinition(editor, run, db)).steps).toEqual(
      created.steps,
    );
    for (const step of created.steps)
      await expect(
        setWorkflowRunStepCheck(
          editor,
          { run_id: run.id, step_id: step.id, status: "Checked" },
          db,
        ),
      ).resolves.toMatchObject({ step_title: step.title });
    await expect(
      updateWorkflowRunOutcome(editor, run.id, { action: "complete" }, db),
    ).resolves.toMatchObject({
      status: "Completed",
      definition_version_id: published.publicationVersion.id,
    });
    expect(
      fake.store.get(`process_definition_versions/${published.publicationVersion.id}`),
    ).toEqual(versionBefore);
  });

  it("pins a new Active version while retaining the preceding immutable content", async () => {
    const { fake, db, created } = await fixture();
    const first = await publishProcessDefinition(
      editor,
      created.id,
      { expected_revision: await revisionOf(db, created.id) },
      { db, scanner: new FakePublicationScanner() },
    );
    const before = structuredClone(
      fake.store.get(`process_definition_versions/${first.publicationVersion.id}`),
    );
    await updateProcessDefinition(
      editor,
      created.id,
      {
        expected_revision: await revisionOf(db, created.id),
        steps: [{ id: "v2-step", title: "Version two work" }],
      },
      db,
    );
    const second = await publishProcessDefinition(
      editor,
      created.id,
      { expected_revision: await revisionOf(db, created.id) },
      { db, scanner: new FakePublicationScanner() },
    );
    const run = await startWorkflowRun(editor, created.id, {}, db);
    expect(run).toMatchObject({
      definition_version_id: second.publicationVersion.id,
      next_action: "Version two work",
    });
    expect((await getWorkflowRunDefinition(editor, run, db)).steps).toEqual([
      { id: "v2-step", title: "Version two work" },
    ]);
    expect(
      fake.store.get(`process_definition_versions/${first.publicationVersion.id}`),
    ).toEqual(before);
  });

  it.each(["missing", "invalid-json", "wrong-definition", "wrong-space"])(
    "refuses a %s pinned version for reads, checks and completion without rewriting the run",
    async (problem) => {
      const { fake, db, created } = await fixture();
      const published = await publishProcessDefinition(
        editor,
        created.id,
        { expected_revision: await revisionOf(db, created.id) },
        { db, scanner: new FakePublicationScanner() },
      );
      const run = await startWorkflowRun(editor, created.id, {}, db);
      const before = structuredClone(fake.store.get(`workflow_runs/${run.id}`));
      const key = `process_definition_versions/${published.publicationVersion.id}`;
      const version = { ...fake.store.get(key) };
      if (problem === "missing") fake.store.delete(key);
      else if (problem === "invalid-json")
        fake.seed(key, { ...version, snapshot_json: "not JSON" });
      else if (problem === "wrong-definition")
        fake.seed(key, { ...version, definition_id: "another-definition" });
      else
        fake.seed(key, {
          ...version,
          snapshot_json: JSON.stringify({
            ...JSON.parse(String(version.snapshot_json)),
            space_id: "lease-renewals",
          }),
        });
      await expect(getWorkflowRunDefinition(editor, run, db)).rejects.toMatchObject({
        status: 409,
      });
      await expect(
        setWorkflowRunStepCheck(
          editor,
          { run_id: run.id, step_id: created.steps[0].id, status: "Checked" },
          db,
        ),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        updateWorkflowRunOutcome(editor, run.id, { action: "complete" }, db),
      ).rejects.toMatchObject({ status: 409 });
      expect(fake.store.get(`workflow_runs/${run.id}`)).toEqual(before);
    },
  );

  it.each(["Editor", "Approver", "Admin"] as const)(
    "preserves %s staff version access and refuses a missing actor identity",
    async (role) => {
      const { db, created } = await fixture();
      await publishProcessDefinition(
        editor,
        created.id,
        { expected_revision: await revisionOf(db, created.id) },
        { db, scanner: new FakePublicationScanner() },
      );
      const actor = { ...editor, role };
      const run = await startWorkflowRun(actor, created.id, {}, db);
      expect((await getWorkflowRunDefinition(actor, run, db)).steps).toEqual(
        created.steps,
      );
      await expect(
        getWorkflowRunDefinition({ ...actor, uid: "" }, run, db),
      ).rejects.toMatchObject({ status: 403 });
    },
  );

  it("refuses starting a run when its read definition changes before the transaction", async () => {
    const { fake, db, created } = await fixture();
    const transaction = fake.runTransaction.bind(fake);
    vi.spyOn(fake, "runTransaction").mockImplementationOnce(async (callback) => {
      fake.seed(`process_definitions/${created.id}`, {
        ...fake.store.get(`process_definitions/${created.id}`),
        name: "Concurrent process",
      });
      return transaction(callback);
    });
    await expect(startWorkflowRun(editor, created.id, {}, db)).rejects.toThrow(
      /changed|reload/i,
    );
    expect(
      [...fake.store.keys()].filter((key) => key.startsWith("workflow_runs/")),
    ).toHaveLength(0);
  });

  it("publishes one reviewed existing owner process while retaining prior runs and refusing an unbound or stale retry", async () => {
    const { fake, db, created } = await fixture();
    const id = "owner-renewal-outreach";
    fake.seed(`process_definitions/${id}`, {
      ...fake.store.get(`process_definitions/${created.id}`),
      id,
    });
    fake.seed("workflow_runs/prior-run", {
      definition_id: id,
      definition_version_id: "prior-version",
      status: "In Progress",
    });
    fake.seed("process_definition_versions/prior-version", {
      snapshot_json: "retained prior content",
    });
    const beforeRun = structuredClone(fake.store.get("workflow_runs/prior-run"));
    const reviewed = await getProcessDefinition(editor, id, db);
    await expect(
      publishProcessDefinition(editor, id, { policy_id: "policy-1" } as never, {
        db,
        scanner: new FakePublicationScanner(),
      }),
    ).rejects.toThrow("revision");
    const result = await publishProcessDefinition(
      editor,
      id,
      { policy_id: "policy-1", expected_revision: reviewed.revision! },
      { db, scanner: new FakePublicationScanner() },
    );
    expect(result.definition.status).toBe("Active");
    expect(result.definition.active_version_id).toBe(result.publicationVersion.id);
    expect(fake.store.get("workflow_runs/prior-run")).toEqual(beforeRun);
    expect(fake.store.get("process_definition_versions/prior-version")).toEqual({
      snapshot_json: "retained prior content",
    });
    await expect(
      publishProcessDefinition(
        editor,
        id,
        { policy_id: "policy-1", expected_revision: reviewed.revision! },
        { db, scanner: new FakePublicationScanner() },
      ),
    ).rejects.toThrow("changed");
    expect(
      [...fake.store.keys()].filter((key) => key.startsWith("publication_versions/")),
    ).toHaveLength(1);
    expect(
      [...fake.store.keys()].filter((key) => key.startsWith("approval_queue_items/")),
    ).toHaveLength(0);
  });
  it("guides current confirmed delivery without a general Dan approval or draft-only rule", () => {
    const template = buildOwnerRenewalOutreachProcessTemplate({
      ownerUid: editor.uid,
      approverUid: editor.uid,
    });
    const content = JSON.stringify(template);
    expect(content).toContain("Send");
    expect(content).toContain("Schedule");
    expect(content).toContain("Resume");
    expect(content).not.toContain("Dan approves");
    expect(content).not.toContain("app only prepares the draft");
    expect(template.action_references).toEqual([]);
  });
  it("refuses a stale reviewed edit rather than overwriting another person's content", async () => {
    const { fake, db, created } = await fixture();
    fake.seed(`process_definitions/${created.id}`, {
      ...fake.store.get(`process_definitions/${created.id}`),
      name: "Concurrent staff title",
    });
    await expect(
      updateProcessDefinition(
        editor,
        created.id,
        {
          name: "Stale editor title",
          expected_revision: created.revision!,
        },
        db,
      ),
    ).rejects.toThrow(/changed|revision/i);
    expect((await getProcessDefinition(editor, created.id, db)).name).toBe(
      "Concurrent staff title",
    );
  });
  it("refuses publication when the definition changes during validation", async () => {
    const { fake, db, created } = await fixture();
    const scanner = new FakePublicationScanner();
    const scan = scanner.scanMalware.bind(scanner);
    scanner.scanMalware = async (...args) => {
      const result = await scan(...args);
      fake.seed(`process_definitions/${created.id}`, {
        ...fake.store.get(`process_definitions/${created.id}`),
        name: "Concurrent staff title",
      });
      return result;
    };
    await expect(
      publishProcessDefinition(
        editor,
        created.id,
        { policy_id: "policy-1", expected_revision: created.revision! },
        { db, scanner },
      ),
    ).rejects.toThrow(/changed|revision/i);
    expect((await getProcessDefinition(editor, created.id, db)).name).toBe(
      "Concurrent staff title",
    );
    expect(
      [...fake.store.keys()].filter((key) => key.startsWith("publication_versions/")),
    ).toHaveLength(0);
  });
  it("refuses an unbound save, publish or start so no caller can overwrite unseen content", async () => {
    const { fake, db, created } = await fixture();
    await expect(
      updateProcessDefinition(editor, created.id, { name: "Unbound" } as never, db),
    ).rejects.toThrow();
    await expect(
      publishProcessDefinition(editor, created.id, {} as never, {
        db,
        scanner: new FakePublicationScanner(),
      }),
    ).rejects.toThrow();
    await expect(
      startWorkflowRun(editor, created.id, { expected_revision: "b".repeat(64) }, db),
    ).rejects.toMatchObject({ status: 409 });
    expect((await getProcessDefinition(editor, created.id, db)).name).toBe(created.name);
    expect(
      [...fake.store.keys()].filter((key) => key.startsWith("workflow_runs/")),
    ).toHaveLength(0);
    const run = await startWorkflowRun(
      editor,
      created.id,
      { expected_revision: await revisionOf(db, created.id) },
      db,
    );
    expect(run.status).toBe("In Progress");
  });
  it("refuses to start a run while the definition still carries placeholder staff assignments", async () => {
    const { fake, db } = await fixture();
    const template = buildOwnerRenewalOutreachProcessTemplate({
      ownerUid: "process-owner-PLACEHOLDER",
      approverUid: "process-approver-PLACEHOLDER",
    });
    const seeded = await createProcessDefinition(
      editor,
      { ...template, space_id: "owner-renewal-outreach" },
      db,
    );
    // S283 R-S283-4: the refusal reads in staff words (rewritten on purpose).
    await expect(startWorkflowRun(editor, seeded.id, {}, db)).rejects.toMatchObject({
      status: 409,
      message:
        "This process has no assigned staff member yet. An Admin assigns one before a run can start.",
    });
    expect(
      [...fake.store.keys()].filter((key) => key.startsWith("workflow_runs/")),
    ).toHaveLength(0);
    await updateProcessDefinition(
      editor,
      seeded.id,
      {
        expected_revision: await revisionOf(db, seeded.id),
        owner_uid: editor.uid,
        default_approver_uid: editor.uid,
      },
      db,
    );
    const run = await startWorkflowRun(editor, seeded.id, {}, db);
    expect(run.owner_uid).toBe(editor.uid);
  });
  it("publishes a legacy Testing-status record once under the reader's normalized revision", async () => {
    const { fake, db, created } = await fixture();
    fake.seed(`process_definitions/${created.id}`, {
      ...fake.store.get(`process_definitions/${created.id}`),
      status: "Testing",
    });
    const reviewed = await getProcessDefinition(editor, created.id, db);
    expect(reviewed.status).toBe("Draft");
    const result = await publishProcessDefinition(
      editor,
      created.id,
      { expected_revision: reviewed.revision! },
      { db, scanner: new FakePublicationScanner() },
    );
    expect(result.definition.status).toBe("Active");
    expect(
      [...fake.store.keys()].filter((key) => key.startsWith("publication_versions/")),
    ).toHaveLength(1);
  });
  // S286 R-S286-4 (rewritten on purpose): the owner renewal Space used to read draft-process. Its
  // process is guidance now, so an unpublished one reads the desk state, never Guidance; the
  // draft-process state stays pinned on a Space that still runs its process.
  it("shows an unpublished definition as draft rather than published readiness", () => {
    const space = {
      id: "owner-renewal-outreach",
      name: "Owner renewal",
      processCategory: "Renewals",
      processDefinitionId: "owner-renewal-outreach",
    };
    expect(
      computeSpaceCardState(
        space,
        new Map([[space.processDefinitionId, { status: "Draft" }]]),
        {},
      ),
    ).toBe("renewal-desk");
    const owningSpace = {
      id: "owner-onboarding",
      name: "Owner onboarding",
      processCategory: "Onboarding",
      processDefinitionId: "owner-onboarding-process",
    };
    expect(
      computeSpaceCardState(
        owningSpace,
        new Map([[owningSpace.processDefinitionId, { status: "Draft" }]]),
        {},
      ),
    ).toBe("draft-process");
  });
});
