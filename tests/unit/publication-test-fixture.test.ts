import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { FakePublicationScanner } from "@/lib/publication/scanners";
import { PUBLICATION_POLICY_COLLECTION } from "@/lib/publication/policy";
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
import { validatePublication } from "@/lib/publication/validation";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";

const editor: AuthenticatedUser = {
  email: "editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
  uid: "editor-1",
};
let fake: FakeFirestore;
let db: Firestore;

beforeEach(() => {
  fake = new FakeFirestore();
  db = fake as unknown as Firestore;
  seedPolicy(policy());
});

describe("ordinary trusted publication after fixture retirement", () => {
  it("publishes immutable Live versions and rolls back through the normal service", async () => {
    const first = await publish("first verified source");
    const second = await publish("second verified source");
    const rollback = await rollbackTrustedPublication(
      editor,
      "source:ordinary",
      first.id,
      "Restore the first verified source version.",
      db,
    );

    expect([first.versionNumber, second.versionNumber, rollback.versionNumber]).toEqual([
      1, 2, 3,
    ]);
    expect(rollback).toMatchObject({
      contentHash: first.contentHash,
      data_mode: "live",
      rollbackOfVersionId: first.id,
    });
    expect(collection(PUBLICATION_COLLECTIONS.versions)).toHaveLength(3);
  });

  it("serializes concurrent writes through the resource-owned version sequence", async () => {
    serializeTransactions(fake);
    const versions = await Promise.all([
      publish("concurrent verified source A"),
      publish("concurrent verified source B"),
    ]);

    expect(versions.map((version) => version.versionNumber).sort()).toEqual([1, 2]);
    expect(
      fake.store.get(`${PUBLICATION_COLLECTIONS.resources}/source:ordinary`),
    ).toMatchObject({ activeVersionId: expect.any(String), lastVersionNumber: 2 });
  });

  it("returns Live by default and excludes a historical Test record from that projection", async () => {
    const live = await publish("live retrieval source");
    fake.seed(`${PUBLICATION_COLLECTIONS.resources}/source:historical-test`, {
      activeVersionId: "historical-test-version",
      data_mode: "test",
      id: "source:historical-test",
      lastVersionNumber: 1,
      policyId: "historical-test-policy",
      resourceType: "file",
      spaceId: "lease-renewals",
      updatedAt: "2026-07-01T00:00:00.000Z",
      updatedByUid: "historical",
    });
    fake.seed(`${PUBLICATION_COLLECTIONS.versions}/historical-test-version`, {
      data_mode: "test",
      id: "historical-test-version",
      resourceId: "source:historical-test",
      validated: true,
    });

    await expect(
      listActiveTrustedPublications(editor, "lease-renewals", db),
    ).resolves.toEqual([expect.objectContaining({ id: live.id, data_mode: "live" })]);
  });

  it("binds each stored version to the SHA-256 hash of its exact content", async () => {
    const content = "hash-bound verified source";
    const version = await publish(content);

    expect(version.contentHash).toBe(
      createHash("sha256").update(new TextEncoder().encode(content)).digest("hex"),
    );
    expect(version.contentRef.contentHash).toBe(version.contentHash);
  });

  it("preserves authorization and Live-mode validation refusals", async () => {
    const outOfScope: AuthenticatedUser = {
      ...editor,
      scopes: ["maintenance"],
    };
    await expect(
      validatePublication(
        outOfScope,
        policy(),
        envelope("unauthorized source"),
        new FakePublicationScanner(),
      ),
    ).rejects.toMatchObject({ code: "actor_not_authorized", status: 403 });
    await expect(
      validatePublication(
        editor,
        policy(),
        envelope("wrong lane", { data_mode: "test" }),
        new FakePublicationScanner(),
      ),
    ).rejects.toMatchObject({ code: "data_mode_mismatch", status: 409 });
  });

  it("fails closed when another policy collides with an existing resource identity", async () => {
    const first = await publish("first policy source");
    const other = policy({
      connectorId: "connector-other",
      id: "policy-other",
      rootId: "root-other",
    });
    seedPolicy(other);

    await expect(
      publishTrustedContent(
        editor,
        other,
        envelope("colliding source", {
          connectorId: other.connectorId,
          rootId: other.rootId,
        }),
        new FakePublicationScanner(),
        { db },
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      fake.store.get(`${PUBLICATION_COLLECTIONS.resources}/source:ordinary`),
    ).toMatchObject({ activeVersionId: first.id, policyId: "policy-live" });
    expect(collection(PUBLICATION_COLLECTIONS.versions)).toHaveLength(1);
  });
});

function publish(content: string) {
  return publishTrustedContent(
    editor,
    policy(),
    envelope(content),
    new FakePublicationScanner(),
    { db },
  );
}

function policy(
  overrides: Partial<PublicationPolicyRecord> = {},
): PublicationPolicyRecord {
  return {
    id: "policy-live",
    data_mode: "live",
    allowedSpaces: ["lease-renewals"],
    allowedTypes: [{ extension: ".md", maxBytes: 2048, mimeTypes: ["text/markdown"] }],
    connectorId: "connector-live",
    createdAt: "2026-08-03T00:00:00.000Z",
    createdByUid: "admin-1",
    enabled: true,
    rootId: "root-live",
    scannerKey: "fake-clean-v1",
    sensitivityCeiling: "Medium",
    updatedAt: "2026-08-03T00:00:00.000Z",
    updatedByUid: "admin-1",
    ...overrides,
  };
}

function envelope(
  content: string,
  metadata: Partial<PublicationEnvelope["metadata"]> = {},
): PublicationEnvelope {
  const bytes = new TextEncoder().encode(content);
  return {
    loadContent: async () => bytes,
    metadata: {
      citationLabel: "Verified source",
      connectorId: "connector-live",
      data_mode: "live",
      declaredByteSize: bytes.byteLength,
      declaredMimeType: "text/markdown",
      detectedMimeType: "text/markdown",
      fileName: "verified-source.md",
      path: "sources/verified-source.md",
      resourceId: "source:ordinary",
      resourceType: "file",
      rootId: "root-live",
      sourceState: "Verified Source",
      spaceId: "lease-renewals",
      ...metadata,
    },
  };
}

function seedPolicy(value: PublicationPolicyRecord) {
  fake.seed(
    `${PUBLICATION_POLICY_COLLECTION}/${value.id}`,
    value as unknown as Record<string, unknown>,
  );
}

function collection(name: string) {
  return [...fake.store.entries()]
    .filter(([path]) => path.startsWith(`${name}/`))
    .map(([, value]) => value);
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
