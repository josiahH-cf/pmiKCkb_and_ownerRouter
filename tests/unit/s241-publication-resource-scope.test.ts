import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";
import {
  createPublicationPolicy,
  resolvePublicationPolicyForSpace,
  tightenPublicationPolicy,
} from "@/lib/publication/policy";
import { FakePublicationScanner } from "@/lib/publication/scanners";
import { validatePublication } from "@/lib/publication/validation";
import { publishTrustedContent } from "@/lib/publication/service";
import { createProcessDefinition, getProcessDefinition } from "@/lib/firestore/workflows";
import { buildOwnerRenewalOutreachProcessTemplate } from "@/lib/lease-renewal/owner-renewal-outreach/process-template";
import { processDefinitionPublicationContent } from "@/lib/publication/process-definition-content";
import type {
  PublicationEnvelope,
  PublicationPolicyRecord,
} from "@/lib/publication/types";

const actor: AuthenticatedUser = {
  uid: "fixture-admin",
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};
const scope = {
  resourceType: "process_definition",
  resourceId: "process-definition:owner-renewal-outreach",
  contentHash: "a".repeat(64),
  reviewedNoClientData: true,
} as const;
function policy(): PublicationPolicyRecord {
  return {
    id: "policy-1",
    allowedSpaces: ["owner-email"],
    allowedTypes: [{ extension: ".md", maxBytes: 2048, mimeTypes: ["text/markdown"] }],
    connectorId: "app-process-definitions",
    rootId: "process-definitions",
    scannerKey: "fake-clean-v1",
    sensitivityCeiling: "Low",
    enabled: true,
    createdAt: "2026-11-03T00:00:00.000Z",
    updatedAt: "2026-11-03T00:00:00.000Z",
    createdByUid: actor.uid,
    updatedByUid: actor.uid,
    resourceScope: scope,
  } as PublicationPolicyRecord;
}
describe("S241 exact process publication policy", () => {
  it("creates and reads one audited process-only definition boundary", async () => {
    const fake = new FakeFirestore(),
      db = fake as unknown as Firestore;
    const {
      id: _id,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      createdByUid: _createdByUid,
      updatedByUid: _updatedByUid,
      ...input
    } = policy();
    void [_id, _createdAt, _updatedAt, _createdByUid, _updatedByUid];
    const original = await createProcessDefinition(
      actor,
      {
        ...buildOwnerRenewalOutreachProcessTemplate({
          ownerUid: actor.uid,
          approverUid: actor.uid,
          sourceLinks: [{ label: "Fixture", url: "https://example.test/procedure" }],
        }),
        space_id: "owner-email",
      },
      db,
    );
    fake.seed("process_definitions/owner-renewal-outreach", {
      ...fake.store.get(`process_definitions/${original.id}`),
      id: "owner-renewal-outreach",
    });
    const definition = await getProcessDefinition(actor, "owner-renewal-outreach", db);
    const reviewedScope = {
      ...scope,
      contentHash: processDefinitionPublicationContent(definition).contentHash,
    };
    const created = await createPublicationPolicy(
      actor,
      {
        ...input,
        expectedDefinitionRevision: definition.revision!,
        resourceScope: reviewedScope,
        allowedSpaces: [...input.allowedSpaces],
        allowedTypes: input.allowedTypes.map((type) => ({
          ...type,
          mimeTypes: [...type.mimeTypes],
        })),
        reason: "Authorize only the reviewed existing process.",
      },
      db,
    );
    expect(created).toMatchObject({ resourceScope: reviewedScope });
    await expect(
      resolvePublicationPolicyForSpace(actor, "owner-email", created.id, db, scope),
    ).resolves.toMatchObject({ id: created.id });
    await expect(
      resolvePublicationPolicyForSpace(actor, "owner-email", created.id, db),
    ).rejects.toThrow(/resource|process|scope/i);
    await expect(
      resolvePublicationPolicyForSpace(actor, "owner-email", created.id, db, {
        ...scope,
        resourceId: "process-definition:another",
      }),
    ).rejects.toThrow(/resource|process|scope/i);
  });
  it.each(["file", "folder"] as const)(
    "refuses generic %s before bytes or scanner are touched",
    async (resourceType) => {
      const content = new TextEncoder().encode("plain fixture");
      const loadContent = vi.fn(async () => content);
      const scanner = new FakePublicationScanner(),
        scan = vi.spyOn(scanner, "scanMalware");
      const envelope: PublicationEnvelope = {
        loadContent,
        metadata: {
          connectorId: "app-process-definitions",
          rootId: "process-definitions",
          spaceId: "owner-email",
          resourceType,
          resourceId: scope.resourceId,
          fileName: "fixture.md",
          path: "fixture.md",
          declaredByteSize: content.length,
          declaredMimeType: "text/markdown",
          sourceState: "Verified Source",
          citationLabel: "Fixture",
        },
      };
      await expect(
        validatePublication(actor, policy(), envelope, scanner),
      ).rejects.toMatchObject({ code: "resource_not_allowed" });
      expect(loadContent).not.toHaveBeenCalled();
      expect(scan).not.toHaveBeenCalled();
    },
  );
  it("refuses another content hash for the same reviewed process before scanning", async () => {
    const content = new TextEncoder().encode(
      '{"id":"owner-renewal-outreach","description":"changed"}',
    );
    const scanner = new FakePublicationScanner(),
      scan = vi.spyOn(scanner, "scanMalware");
    await expect(
      validatePublication(
        actor,
        policy(),
        {
          loadContent: async () => content,
          metadata: {
            connectorId: "app-process-definitions",
            rootId: "process-definitions",
            spaceId: "owner-email",
            ...scope,
            fileName: "owner-renewal-outreach.json",
            path: "process-definitions/owner-renewal-outreach.json",
            declaredByteSize: content.length,
            declaredMimeType: "application/json",
            sourceState: "Verified Source",
            citationLabel: "Fixture",
          },
        },
        scanner,
      ),
    ).rejects.toMatchObject({ code: "resource_not_allowed" });
    expect(scan).not.toHaveBeenCalled();
  });
  it("cannot widen a scoped policy to a different definition or remove its scope", async () => {
    const fake = new FakeFirestore(),
      db = fake as unknown as Firestore;
    fake.seed(
      "publication_policies/policy-1",
      policy() as unknown as Record<string, unknown>,
    );
    await expect(
      tightenPublicationPolicy(
        actor,
        "policy-1",
        {
          reason: "Try changing the exact definition.",
          resourceScope: { ...scope, resourceId: "process-definition:another" },
        },
        db,
      ),
    ).rejects.toThrow();
  });
  it("refuses a scope changed during scanning without moving an Active pointer", async () => {
    const fake = new FakeFirestore(),
      db = fake as unknown as Firestore;
    const original = { ...policy(), resourceScope: undefined };
    fake.seed(
      "publication_policies/policy-1",
      original as unknown as Record<string, unknown>,
    );
    const content = new TextEncoder().encode("plain fixture");
    const scanner = new FakePublicationScanner();
    vi.spyOn(scanner, "scanMalware").mockImplementation(async () => {
      fake.seed(
        "publication_policies/policy-1",
        policy() as unknown as Record<string, unknown>,
      );
      return { code: "clean" };
    });
    await expect(
      publishTrustedContent(
        actor,
        original,
        {
          loadContent: async () => content,
          metadata: {
            connectorId: "app-process-definitions",
            rootId: "process-definitions",
            spaceId: "owner-email",
            resourceType: "file",
            resourceId: "fixture-source",
            fileName: "fixture.md",
            path: "fixture.md",
            declaredByteSize: content.length,
            declaredMimeType: "text/markdown",
            sourceState: "Verified Source",
            citationLabel: "Fixture",
          },
        },
        scanner,
        { db },
      ),
    ).rejects.toThrow(/policy changed/i);
    expect(
      [...fake.store.keys()].some((path) => path.startsWith("publication_resources/")),
    ).toBe(false);
    expect(fake.store.get("publication_policies/policy-1")).toMatchObject({
      resourceScope: scope,
    });
  });
});
