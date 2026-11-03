import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";
import { buildOwnerRenewalOutreachProcessTemplate } from "@/lib/lease-renewal/owner-renewal-outreach/process-template";
import {
  createProcessDefinition,
  getProcessDefinition,
  updateProcessDefinition,
} from "@/lib/firestore/workflows";
import {
  createPublicationPolicy,
  tightenPublicationPolicy,
} from "@/lib/publication/policy";
import { processDefinitionPublicationContent } from "@/lib/publication/process-definition-content";
import { publishProcessDefinition } from "@/lib/publication/process-definition";
import { FakePublicationScanner } from "@/lib/publication/scanners";

const actor: AuthenticatedUser = {
  uid: "fixture-admin",
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};
const id = "owner-renewal-outreach";
async function fixture() {
  const fake = new FakeFirestore(),
    db = fake as unknown as Firestore;
  const created = await createProcessDefinition(
    actor,
    {
      ...buildOwnerRenewalOutreachProcessTemplate({
        ownerUid: actor.uid,
        approverUid: actor.uid,
        sourceLinks: [
          { label: "Current fixture source", url: "https://example.test/procedure" },
        ],
      }),
      space_id: id,
    },
    db,
  );
  fake.seed(`process_definitions/${id}`, {
    ...fake.store.get(`process_definitions/${created.id}`),
    id,
  });
  const definition = await getProcessDefinition(actor, id, db);
  const review = processDefinitionPublicationContent(definition);
  const input = {
    allowedSpaces: [id],
    connectorId: "app-process-definitions",
    rootId: "process-definitions",
    scannerKey: "fake-clean-v1",
    sensitivityCeiling: "Low" as const,
    reason: "Review the exact current process without client data.",
    expectedDefinitionRevision: definition.revision!,
    resourceScope: {
      resourceType: "process_definition" as const,
      resourceId: `process-definition:${id}`,
      contentHash: review.contentHash,
      reviewedNoClientData: true as const,
    },
  };
  return { fake, db, definition, input };
}

describe("S241 fresh exact-byte policy review through existing Admin change path", () => {
  it("does not accept an arbitrary hash for the current process", async () => {
    const { db, input } = await fixture();
    await expect(
      createPublicationPolicy(
        actor,
        {
          ...input,
          resourceScope: { ...input.resourceScope, contentHash: "0".repeat(64) },
        },
        db,
      ),
    ).rejects.toThrow(/reviewed|current|hash/i);
  });
  it("publishes two freshly reviewed versions under the same policy/resource, preserving both immutable histories", async () => {
    const { fake, db, definition, input } = await fixture();
    const policy = await createPublicationPolicy(actor, input, db);
    const first = await publishProcessDefinition(
      actor,
      id,
      { policy_id: policy.id, expected_revision: definition.revision },
      { db, scanner: new FakePublicationScanner() },
    );
    const prior = structuredClone(
      fake.store.get(`publication_versions/${first.publicationVersion.id}`),
    );
    const current = await getProcessDefinition(actor, id, db);
    const changed = await updateProcessDefinition(
      actor,
      id,
      {
        expected_revision: current.revision,
        short_outcome: "Reviewed current outreach and reply handoff.",
      },
      db,
    );
    const nextHash = processDefinitionPublicationContent(changed).contentHash;
    await expect(
      publishProcessDefinition(
        actor,
        id,
        { policy_id: policy.id, expected_revision: changed.revision },
        { db, scanner: new FakePublicationScanner() },
      ),
    ).rejects.toMatchObject({ code: "resource_not_allowed" });
    const reviewed = await tightenPublicationPolicy(
      actor,
      policy.id,
      {
        reason: "Freshly review these changed process bytes only.",
        expectedContentHash: input.resourceScope.contentHash,
        expectedDefinitionRevision: changed.revision!,
        resourceScope: { ...input.resourceScope, contentHash: nextHash },
      },
      db,
    );
    expect(reviewed.id).toBe(policy.id);
    const second = await publishProcessDefinition(
      actor,
      id,
      { policy_id: policy.id, expected_revision: changed.revision },
      { db, scanner: new FakePublicationScanner() },
    );
    expect(second.publicationVersion.resourceId).toBe(
      first.publicationVersion.resourceId,
    );
    expect(second.publicationVersion.versionNumber).toBe(2);
    expect(fake.store.get(`publication_versions/${first.publicationVersion.id}`)).toEqual(
      prior,
    );
    expect(
      [...fake.store.values()].some(
        (record) =>
          record.eventType === "content_reviewed" &&
          record.previousContentHash === input.resourceScope.contentHash &&
          record.contentHash === nextHash,
      ),
    ).toBe(true);
  });
  it.each(["stale-hash", "wrong-resource", "stale-definition"])(
    "refuses %s without changing the reviewed hash",
    async (failure) => {
      const { db, input, definition } = await fixture();
      const policy = await createPublicationPolicy(actor, input, db);
      const patch = {
        reason: "A fresh exact-byte review must retain this boundary.",
        expectedContentHash:
          failure === "stale-hash" ? "0".repeat(64) : input.resourceScope.contentHash,
        expectedDefinitionRevision:
          failure === "stale-definition" ? "0".repeat(64) : definition.revision!,
        resourceScope: {
          ...input.resourceScope,
          resourceId:
            failure === "wrong-resource"
              ? "process-definition:another"
              : input.resourceScope.resourceId,
        },
      };
      await expect(
        tightenPublicationPolicy(actor, policy.id, patch, db),
      ).rejects.toMatchObject({ status: 409 });
    },
  );
  it("refuses a definition changed between byte review and the policy transaction", async () => {
    const { fake, db, input, definition } = await fixture();
    const policy = await createPublicationPolicy(actor, input, db);
    const run = fake.runTransaction.bind(fake);
    fake.runTransaction = async (callback) => {
      fake.seed(`process_definitions/${id}`, {
        ...fake.store.get(`process_definitions/${id}`),
        short_outcome: "Competing staff edit retained.",
      });
      return run(callback);
    };
    await expect(
      tightenPublicationPolicy(
        actor,
        policy.id,
        {
          reason: "Review the current bytes under a transactional source binding.",
          expectedContentHash: input.resourceScope.contentHash,
          expectedDefinitionRevision: definition.revision!,
          resourceScope: input.resourceScope,
        },
        db,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(fake.store.get(`publication_policies/${policy.id}`)).toMatchObject({
      resourceScope: input.resourceScope,
    });
    expect(fake.store.get(`process_definitions/${id}`)).toMatchObject({
      short_outcome: "Competing staff edit retained.",
    });
    expect(
      [...fake.store.values()].filter(
        (record) => record.eventType === "content_reviewed",
      ),
    ).toHaveLength(0);
  });
});
