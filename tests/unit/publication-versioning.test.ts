import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { FakePublicationScanner } from "@/lib/publication/scanners";
import {
  listActiveTrustedPublications,
  PUBLICATION_COLLECTIONS,
  publishTrustedContent,
  rollbackTrustedPublication,
} from "@/lib/publication/service";
import type {
  PublicationEnvelope,
  PublicationPolicyRecord,
} from "@/lib/publication/types";
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

describe("trusted publication versioning", () => {
  it("orders concurrent saves when the Firestore transaction boundary serializes conflicts", async () => {
    serializeTransactions(fake);
    const versions = await Promise.all(
      ["concurrent-a", "concurrent-b"].map((value) =>
        publishTrustedContent(
          editor,
          policy(),
          envelope(value),
          new FakePublicationScanner(),
          { db },
        ),
      ),
    );
    expect(versions.map((version) => version.versionNumber).sort()).toEqual([1, 2]);
    expect(collectionData(PUBLICATION_COLLECTIONS.versions)).toHaveLength(2);
  });

  it("atomically advances one Active pointer and preserves immutable versions", async () => {
    const first = await publishTrustedContent(
      editor,
      policy(),
      envelope("first"),
      new FakePublicationScanner(),
      { db },
    );
    const second = await publishTrustedContent(
      editor,
      policy(),
      envelope("second"),
      new FakePublicationScanner(),
      { db },
    );
    expect([first.versionNumber, second.versionNumber]).toEqual([1, 2]);

    const rolledBack = await rollbackTrustedPublication(
      editor,
      "source:fixture",
      first.id,
      "Restore the first validated fixture version.",
      db,
    );
    expect(rolledBack.versionNumber).toBe(3);
    expect(rolledBack.rollbackOfVersionId).toBe(first.id);
    expect(rolledBack.contentHash).toBe(first.contentHash);
    expect(fake.store.has(`${PUBLICATION_COLLECTIONS.versions}/${second.id}`)).toBe(true);

    const active = await listActiveTrustedPublications(editor, "lease-renewals", db);
    expect(active.map((version) => version.id)).toEqual([rolledBack.id]);
  });

  it("records a bodyless rejection and creates no resource or version", async () => {
    const secret = "fixture-secret-never-persisted";
    await expect(
      publishTrustedContent(
        editor,
        policy(),
        envelope(secret),
        new FakePublicationScanner("fake-clean-v1", {
          sensitivity: { code: "sensitivity_violation" },
        }),
        { db },
      ),
    ).rejects.toMatchObject({ code: "sensitivity_violation" });

    expect(collectionData(PUBLICATION_COLLECTIONS.resources)).toHaveLength(0);
    expect(collectionData(PUBLICATION_COLLECTIONS.versions)).toHaveLength(0);
    const audits = collectionData(PUBLICATION_COLLECTIONS.audit);
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits[0])).not.toContain(secret);
  });
});

function policy(): PublicationPolicyRecord {
  return {
    id: "policy-1",
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
  };
}

function envelope(value: string): PublicationEnvelope {
  const content = new TextEncoder().encode(value);
  return {
    loadContent: async () => content,
    metadata: {
      citationLabel: "Fixture citation",
      connectorId: "connector-1",
      declaredByteSize: content.byteLength,
      declaredMimeType: "text/markdown",
      detectedMimeType: "text/markdown",
      fileName: "fixture.md",
      path: "sources/fixture.md",
      resourceId: "source:fixture",
      resourceType: "file",
      rootId: "root-1",
      sourceState: "Verified Source",
      spaceId: "lease-renewals",
    },
  };
}

function collectionData(collection: string) {
  return Array.from(fake.store.entries())
    .filter(([path]) => path.startsWith(`${collection}/`))
    .map(([, data]) => data);
}

function serializeTransactions(fakeDb: FakeFirestore) {
  const original = fakeDb.runTransaction.bind(fakeDb);
  let tail = Promise.resolve();
  fakeDb.runTransaction = async <T>(callback: Parameters<typeof original<T>>[0]) => {
    const previous = tail;
    let release: () => void = () => {};
    tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await original(callback);
    } finally {
      release();
    }
  };
}
