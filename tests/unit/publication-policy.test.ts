import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  PUBLICATION_POLICY_AUDIT_COLLECTION,
  createPublicationPolicy,
  tightenPublicationPolicy,
} from "@/lib/publication/policy";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";

const admin: AuthenticatedUser = {
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
  uid: "admin-1",
};
const editor: AuthenticatedUser = { ...admin, role: "Editor", uid: "editor-1" };
let db: Firestore;
let fake: FakeFirestore;

beforeEach(() => {
  fake = new FakeFirestore();
  db = fake as unknown as Firestore;
});

describe("publication policy", () => {
  it("requires Admin authority and writes a bodyless policy audit", async () => {
    const input = policyInput();
    await expect(createPublicationPolicy(editor, input, db)).rejects.toThrow(
      "Admin publication-policy authority",
    );

    const created = await createPublicationPolicy(admin, input, db);
    expect(created.rootId).toBe("root-1");
    expect(created.data_mode).toBe("live");
    const audits = collectionData(fake, PUBLICATION_POLICY_AUDIT_COLLECTION);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ eventType: "created", reason: input.reason });
    expect(JSON.stringify(audits[0])).not.toContain("rawContent");
  });

  it("permits only reasoned tightening of an existing policy", async () => {
    const created = await createPublicationPolicy(admin, policyInput(), db);
    const tightened = await tightenPublicationPolicy(
      admin,
      created.id,
      {
        allowedSpaces: ["lease-renewals"],
        allowedTypes: [
          { extension: ".md", maxBytes: 1024, mimeTypes: ["text/markdown"] },
        ],
        reason: "Reduce the launch boundary for the fixture.",
        sensitivityCeiling: "Low",
      },
      db,
    );
    expect(tightened.allowedTypes[0]?.maxBytes).toBe(1024);

    await expect(
      tightenPublicationPolicy(
        admin,
        created.id,
        {
          allowedSpaces: ["lease-renewals", "owner-email"],
          reason: "Attempt to widen the allowed Space list.",
        },
        db,
      ),
    ).rejects.toThrow("may only be tightened");
  });
});

function policyInput() {
  return {
    allowedSpaces: ["lease-renewals"],
    allowedTypes: [{ extension: ".md", maxBytes: 2048, mimeTypes: ["text/markdown"] }],
    connectorId: "connector-1",
    enabled: true,
    reason: "Create the fixture trust boundary.",
    rootId: "root-1",
    scannerKey: "fake-clean-v1",
    sensitivityCeiling: "Medium" as const,
  };
}

function collectionData(fakeDb: FakeFirestore, collection: string) {
  return Array.from(fakeDb.store.entries())
    .filter(([path]) => path.startsWith(`${collection}/`))
    .map(([, data]) => data);
}
