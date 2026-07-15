import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { FakePublicationScanner } from "@/lib/publication/scanners";
import { resolvePublicationScanner } from "@/lib/publication/provider";
import { PUBLICATION_POLICY_COLLECTION } from "@/lib/publication/policy";
import {
  listActiveTrustedPublications,
  PUBLICATION_COLLECTIONS,
  publishTrustedContent,
  rollbackTrustedPublication,
} from "@/lib/publication/service";
import type {
  PublicationContentReference,
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
  fake.seed(
    `${PUBLICATION_POLICY_COLLECTION}/policy-1`,
    policy() as unknown as Record<string, unknown>,
  );
});

describe("trusted publication versioning", () => {
  it("publishes synthetic content through the emulator-only clean scanner", async () => {
    const scanner = resolvePublicationScanner("fake-clean-v1", {
      firestoreEmulatorHost: "127.0.0.1:8080",
      localDemoAuth: true,
      nodeEnv: "development",
    });
    const version = await publishTrustedContent(
      editor,
      policy(),
      envelope("synthetic-clean-fixture"),
      scanner,
      { db },
    );

    expect(version.validated).toBe(true);
    expect(version).not.toHaveProperty("contentBase64");
    expect(collectionData(PUBLICATION_COLLECTIONS.contentChunks)).toHaveLength(1);
  });

  it("advances the resource-owned sequence when Firestore retries transaction conflicts", async () => {
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
    expect(
      fake.store.get(`${PUBLICATION_COLLECTIONS.resources}/source:fixture`),
    ).toMatchObject({ lastVersionNumber: 2 });
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
    expect(rolledBack.contentRef).toEqual(first.contentRef);
    expect(rolledBack.contentByteSize).toBe(first.contentByteSize);
    expect(rolledBack).not.toHaveProperty("contentBase64");
    expect(collectionData(PUBLICATION_COLLECTIONS.contentChunks)).toHaveLength(2);
    expect(fake.store.has(`${PUBLICATION_COLLECTIONS.versions}/${second.id}`)).toBe(true);

    const active = await listActiveTrustedPublications(editor, "lease-renewals", db);
    expect(active.map((version) => version.id)).toEqual([rolledBack.id]);
    expect(
      fake.store.get(`${PUBLICATION_COLLECTIONS.resources}/source:fixture`),
    ).toMatchObject({ activeVersionId: rolledBack.id, lastVersionNumber: 3 });
  });

  it("aborts and removes staged content when the policy changes during validation", async () => {
    const candidate = envelope("policy-tightened-during-scan");
    const loadContent = candidate.loadContent;
    candidate.loadContent = async (maxBytes) => {
      fake.seed(`${PUBLICATION_POLICY_COLLECTION}/policy-1`, {
        ...policy(),
        enabled: false,
        updatedAt: "2026-07-14T00:01:00.000Z",
      });
      return loadContent(maxBytes);
    };

    await expect(
      publishTrustedContent(editor, policy(), candidate, new FakePublicationScanner(), {
        db,
      }),
    ).rejects.toMatchObject({ status: 409 });

    expect(collectionData(PUBLICATION_COLLECTIONS.contentChunks)).toHaveLength(0);
    expect(collectionData(PUBLICATION_COLLECTIONS.resources)).toHaveLength(0);
    expect(collectionData(PUBLICATION_COLLECTIONS.versions)).toHaveLength(0);
  });

  it.each(["missing", "corrupt"] as const)(
    "blocks rollback when target content is %s",
    async (failure) => {
      const first = await publishTrustedContent(
        editor,
        policy(),
        envelope(`rollback-${failure}-first`),
        new FakePublicationScanner(),
        { db },
      );
      const second = await publishTrustedContent(
        editor,
        policy(),
        envelope(`rollback-${failure}-second`),
        new FakePublicationScanner(),
        { db },
      );
      const chunkPath = `${PUBLICATION_COLLECTIONS.contentChunks}/${first.contentRef.contentId}_000`;
      if (failure === "missing") {
        fake.store.delete(chunkPath);
      } else {
        fake.store.set(chunkPath, {
          ...fake.store.get(chunkPath),
          chunkBase64: Buffer.from("tampered-content").toString("base64"),
        });
      }
      const versionsBefore = collectionData(PUBLICATION_COLLECTIONS.versions).length;
      const auditsBefore = collectionData(PUBLICATION_COLLECTIONS.audit).length;

      await expect(
        rollbackTrustedPublication(
          editor,
          "source:fixture",
          first.id,
          "Attempt rollback to unavailable fixture content.",
          db,
        ),
      ).rejects.toMatchObject({ status: 409 });

      expect(collectionData(PUBLICATION_COLLECTIONS.versions)).toHaveLength(
        versionsBefore,
      );
      expect(collectionData(PUBLICATION_COLLECTIONS.audit)).toHaveLength(auditsBefore);
      expect(
        fake.store.get(`${PUBLICATION_COLLECTIONS.resources}/source:fixture`),
      ).toMatchObject({ activeVersionId: second.id, lastVersionNumber: 2 });
    },
  );

  it.each([
    ["disabled", { enabled: false }],
    ["outside the current Space allowlist", { allowedSpaces: ["maintenance"] }],
    ["outside the current root", { rootId: "root-tightened" }],
    [
      "outside the current type allowlist",
      {
        allowedTypes: [{ extension: ".txt", maxBytes: 2048, mimeTypes: ["text/plain"] }],
      },
    ],
    [
      "over the tightened size ceiling",
      {
        allowedTypes: [{ extension: ".md", maxBytes: 1, mimeTypes: ["text/markdown"] }],
      },
    ],
  ] as const)("blocks rollback when its current policy is %s", async (_label, patch) => {
    const first = await publishTrustedContent(
      editor,
      policy(),
      envelope("rollback-policy-first"),
      new FakePublicationScanner(),
      { db },
    );
    const second = await publishTrustedContent(
      editor,
      policy(),
      envelope("rollback-policy-second"),
      new FakePublicationScanner(),
      { db },
    );
    fake.seed(`${PUBLICATION_POLICY_COLLECTION}/policy-1`, {
      ...policy(),
      ...patch,
      updatedAt: "2026-07-14T00:02:00.000Z",
    });
    const versionsBefore = collectionData(PUBLICATION_COLLECTIONS.versions).length;
    const auditsBefore = collectionData(PUBLICATION_COLLECTIONS.audit).length;

    await expect(
      rollbackTrustedPublication(
        editor,
        "source:fixture",
        first.id,
        "Attempt rollback after the policy tightened.",
        db,
      ),
    ).rejects.toMatchObject({ status: 409 });

    expect(collectionData(PUBLICATION_COLLECTIONS.versions)).toHaveLength(versionsBefore);
    expect(collectionData(PUBLICATION_COLLECTIONS.audit)).toHaveLength(auditsBefore);
    expect(
      fake.store.get(`${PUBLICATION_COLLECTIONS.resources}/source:fixture`),
    ).toMatchObject({ activeVersionId: second.id, lastVersionNumber: 2 });
  });

  it("blocks rollback when sensitivity is above the tightened current ceiling", async () => {
    const mediumScanner = new FakePublicationScanner("fake-clean-v1", {
      sensitivity: { code: "clean", sensitivity: "Medium" },
    });
    const first = await publishTrustedContent(
      editor,
      policy(),
      envelope("rollback-medium-first"),
      mediumScanner,
      { db },
    );
    const second = await publishTrustedContent(
      editor,
      policy(),
      envelope("rollback-medium-second"),
      mediumScanner,
      { db },
    );
    fake.seed(`${PUBLICATION_POLICY_COLLECTION}/policy-1`, {
      ...policy(),
      sensitivityCeiling: "Low",
      updatedAt: "2026-07-14T00:03:00.000Z",
    });

    await expect(
      rollbackTrustedPublication(
        editor,
        "source:fixture",
        first.id,
        "Attempt rollback above the current sensitivity ceiling.",
        db,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      fake.store.get(`${PUBLICATION_COLLECTIONS.resources}/source:fixture`),
    ).toMatchObject({ activeVersionId: second.id, lastVersionNumber: 2 });
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
    expect(collectionData(PUBLICATION_COLLECTIONS.contentChunks)).toHaveLength(0);
    const audits = collectionData(PUBLICATION_COLLECTIONS.audit);
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits[0])).not.toContain(secret);
  });

  it("exercises the local-demo malicious scanner without persisting content", async () => {
    const maliciousPolicy = {
      ...policy(),
      scannerKey: "fake-malicious-v1",
    };
    const scanner = resolvePublicationScanner("fake-malicious-v1", {
      firestoreEmulatorHost: "127.0.0.1:8080",
      localDemoAuth: true,
      nodeEnv: "development",
    });

    await expect(
      publishTrustedContent(
        editor,
        maliciousPolicy,
        envelope("synthetic-malware-fixture"),
        scanner,
        { db },
      ),
    ).rejects.toMatchObject({ code: "malware_detected" });

    expect(collectionData(PUBLICATION_COLLECTIONS.resources)).toHaveLength(0);
    expect(collectionData(PUBLICATION_COLLECTIONS.versions)).toHaveLength(0);
    expect(collectionData(PUBLICATION_COLLECTIONS.contentChunks)).toHaveLength(0);
    expect(collectionData(PUBLICATION_COLLECTIONS.audit)).toHaveLength(1);
  });

  it("cleans up staged chunks when the metadata transaction fails", async () => {
    const content = new TextEncoder().encode("synthetic-transaction-failure");
    let stagedRef: PublicationContentReference | undefined;
    const contentStore = {
      delete: vi.fn(async () => undefined),
      put: vi.fn(
        async (input: {
          content: Uint8Array;
          contentHash: string;
          contentId: string;
        }) => {
          stagedRef = {
            byteSize: input.content.byteLength,
            chunkCount: 1,
            contentHash: input.contentHash,
            contentId: input.contentId,
            storage: "firestore-chunks-v1",
          };
          return stagedRef;
        },
      ),
      read: vi.fn(async () => content),
    };

    await expect(
      publishTrustedContent(
        editor,
        policy(),
        envelope("synthetic-transaction-failure"),
        new FakePublicationScanner(),
        {
          contentStore,
          db,
          extendCommit: () => {
            throw new Error("synthetic transaction failure");
          },
        },
      ),
    ).rejects.toThrow("synthetic transaction failure");
    expect(contentStore.delete).toHaveBeenCalledWith(stagedRef);
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
