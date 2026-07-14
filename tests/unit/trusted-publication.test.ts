import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { createProcessDefinition } from "@/lib/firestore/workflows";
import { publishProcessDefinition } from "@/lib/publication/process-definition";
import { FakePublicationScanner } from "@/lib/publication/scanners";
import { PUBLICATION_COLLECTIONS } from "@/lib/publication/service";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";

const editor: AuthenticatedUser = {
  email: "editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
  uid: "editor-1",
};
let db: Firestore;
let fake: FakeFirestore;

beforeEach(() => {
  fake = new FakeFirestore();
  db = fake as unknown as Firestore;
});

describe("trusted process publication", () => {
  it("publishes a validated Editor process immediately without an Approval Queue item", async () => {
    seedPolicy();
    fake.seed("action_registry/gmail.thread.reply", {
      key: "gmail.thread.reply",
      production_allowed: false,
      readiness: "Disabled",
    });
    const definition = await createProcessDefinition(
      editor,
      {
        action_references: [
          {
            action_registry_key: "gmail.thread.reply",
            expected_action: "Draft an exact-confirmed reply.",
            label: "Reply",
            readiness: "Disabled",
            target_system: "Gmail",
          },
        ],
        default_approver_uid: "admin-1",
        name: "Fixture renewal process",
        owner_uid: editor.uid,
        required_starting_inputs: ["Fixture lease reference"],
        short_outcome: "Exercise validation without external effects.",
        source_links: [{ label: "Fixture source", url: "https://example.test/source" }],
        space_id: "lease-renewals",
        steps: [{ id: "step-1", title: "Review fixture" }],
        success_condition: "The fixture is reviewed.",
        trigger: "Manual fixture start.",
      },
      db,
    );

    const result = await publishProcessDefinition(
      editor,
      definition.id,
      { policy_id: "policy-1" },
      { db, scanner: new FakePublicationScanner() },
    );

    expect(result.definition.status).toBe("Active");
    expect(result.definition.active_version_id).toBe(result.publicationVersion.id);
    expect(collectionData("approval_queue")).toHaveLength(0);
    expect(collectionData(PUBLICATION_COLLECTIONS.versions)).toHaveLength(1);
    expect(fake.store.get("action_registry/gmail.thread.reply")).toMatchObject({
      production_allowed: false,
      readiness: "Disabled",
    });
  });

  it("fails closed for an unknown action or unavailable scanner", async () => {
    seedPolicy();
    const definition = await createProcessDefinition(
      editor,
      {
        action_references: [
          {
            action_registry_key: "unknown.action",
            expected_action: "Do not execute.",
            label: "Unknown",
            target_system: "Unknown",
          },
        ],
        default_approver_uid: "admin-1",
        name: "Blocked fixture process",
        owner_uid: editor.uid,
        short_outcome: "Remain inactive.",
        source_links: [{ label: "Fixture source", url: "https://example.test/source" }],
        space_id: "lease-renewals",
        steps: [{ title: "Stop" }],
        success_condition: "Never execute.",
        trigger: "Manual.",
      },
      db,
    );

    await expect(
      publishProcessDefinition(
        editor,
        definition.id,
        { policy_id: "policy-1" },
        { db, scanner: new FakePublicationScanner() },
      ),
    ).rejects.toThrow("unregistered action key");
    expect(collectionData(PUBLICATION_COLLECTIONS.resources)).toHaveLength(0);
    expect(collectionData(PUBLICATION_COLLECTIONS.audit)).toHaveLength(1);
  });
});

function seedPolicy() {
  fake.seed("publication_policies/policy-1", {
    allowedSpaces: ["lease-renewals"],
    allowedTypes: [{ extension: ".md", maxBytes: 2048, mimeTypes: ["text/markdown"] }],
    connectorId: "connector-1",
    createdAt: "2026-07-14T00:00:00.000Z",
    createdByUid: "admin-1",
    enabled: true,
    rootId: "root-1",
    scannerKey: "fake-clean-v1",
    sensitivityCeiling: "Medium",
    updatedAt: "2026-07-14T00:00:00.000Z",
    updatedByUid: "admin-1",
  });
}

function collectionData(collection: string) {
  return Array.from(fake.store.entries())
    .filter(([path]) => path.startsWith(`${collection}/`))
    .map(([, data]) => data);
}
