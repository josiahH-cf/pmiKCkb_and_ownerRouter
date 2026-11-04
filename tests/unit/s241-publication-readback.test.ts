import type { Firestore } from "firebase-admin/firestore";
import { afterEach, expect, it, vi } from "vitest";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";
const state = vi.hoisted(() => ({ db: null as Firestore | null }));
vi.mock("@/lib/firestore/admin", () => ({ getAdminFirestore: () => state.db }));
import { setAuthResolverForTest } from "@/lib/auth/session";
import { GET } from "@/app/api/process-definitions/[definitionId]/route";
import {
  createProcessDefinition,
  updateProcessDefinition,
} from "@/lib/firestore/workflows";
import { publishProcessDefinition } from "@/lib/publication/process-definition";
import { FakePublicationScanner } from "@/lib/publication/scanners";
const actor = {
  uid: "editor",
  email: "editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor" as const,
};
afterEach(() => setAuthResolverForTest(null));
async function fixture() {
  const fake = new FakeFirestore();
  const db = fake as unknown as Firestore;
  state.db = db;
  setAuthResolverForTest(() => actor);
  fake.seed("publication_policies/policy", {
    allowedSpaces: ["owner-renewal-outreach"],
    allowedTypes: [],
    connectorId: "fixture",
    enabled: true,
    rootId: "fixture-root",
    scannerKey: "fake-clean-v1",
    sensitivityCeiling: "Medium",
    createdAt: "2026-11-03",
    createdByUid: actor.uid,
    updatedAt: "2026-11-03",
    updatedByUid: actor.uid,
  });
  const definition = await createProcessDefinition(
    actor,
    {
      space_id: "owner-renewal-outreach",
      name: "Existing staff process",
      short_outcome: "Reviewed work",
      trigger: "Staff starts",
      owner_uid: actor.uid,
      default_approver_uid: actor.uid,
      source_links: [{ label: "Procedure", url: "https://example.test/procedure" }],
      steps: [{ id: "first", title: "Review current source" }],
      success_condition: "Recorded",
    },
    db,
  );
  const published = await publishProcessDefinition(
    actor,
    definition.id,
    { expected_revision: definition.revision! },
    { db, scanner: new FakePublicationScanner() },
  );
  const read = async () =>
    (
      await GET(new Request("http://local.test"), {
        params: Promise.resolve({ definitionId: definition.id }),
      })
    ).json();
  return { fake, db, definition, published, read };
}
it("ordinary GET proves exact immutable S21 bytes and matching current process content", async () => {
  const { fake, published, read } = await fixture();
  const before = JSON.stringify([...fake.store]);
  const result = await read();
  expect(result.publication).toMatchObject({
    state: "verified",
    versionId: published.publicationVersion.id,
    contentHash: published.publicationVersion.contentHash,
    definitionRevision: result.definition.revision,
  });
  expect(result.publication.contentIdentityHash).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify([...fake.store])).toBe(before);
});
it.each([
  "missing",
  "corrupt",
  "wrong-definition",
  "wrong-space",
  "wrong-resource",
  "changed-content",
  "wrong-hash",
  "missing-bytes",
])(
  "reports immutable publication %s as unavailable without mutable fallback",
  async (kind) => {
    const { fake, definition, published, read } = await fixture();
    const key = `process_definition_versions/${published.publicationVersion.id}`;
    const old = fake.store.get(key)!;
    if (kind === "missing") fake.store.delete(key);
    if (kind === "corrupt") fake.seed(key, { ...old, snapshot_json: "{" });
    if (kind === "wrong-definition") fake.seed(key, { ...old, definition_id: "another" });
    if (kind === "wrong-space")
      fake.seed(key, {
        ...old,
        snapshot_json: JSON.stringify({
          ...JSON.parse(String(old.snapshot_json)),
          space_id: "lease-renewals",
        }),
      });
    if (kind === "wrong-resource")
      fake.seed(`publication_resources/process-definition:${definition.id}`, {
        ...fake.store.get(`publication_resources/process-definition:${definition.id}`),
        activeVersionId: "another-version",
      });
    if (kind === "changed-content")
      fake.seed(`process_definitions/${definition.id}`, {
        ...fake.store.get(`process_definitions/${definition.id}`),
        name: "Changed after version",
      });
    if (kind === "wrong-hash")
      fake.seed(`publication_versions/${published.publicationVersion.id}`, {
        ...fake.store.get(`publication_versions/${published.publicationVersion.id}`),
        contentHash: "0".repeat(64),
      });
    if (kind === "missing-bytes")
      for (const key of [...fake.store.keys()])
        if (key.startsWith("publication_content_chunks/")) fake.store.delete(key);
    const result = await read();
    expect(result.publication).toMatchObject({ state: "unavailable" });
    expect(result.publication.message).toMatch(/immutable|published/i);
    expect(result.publication).not.toHaveProperty("contentIdentityHash");
  },
);
it("a saved Draft retains its old pointer without claiming current publication", async () => {
  const { db, definition, published, read } = await fixture();
  await updateProcessDefinition(
    actor,
    definition.id,
    { name: "New draft", expected_revision: published.definition.revision! },
    db,
  );
  const result = await read();
  expect(result.publication).toEqual({
    state: "not_published",
    priorVersionId: published.publicationVersion.id,
  });
});
