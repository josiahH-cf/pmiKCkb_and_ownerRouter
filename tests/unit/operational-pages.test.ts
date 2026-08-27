import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  OPERATIONAL_PAGE_COLLECTIONS,
  approveOperationalPageVersion,
  createOperationalPageDraft,
  publishOperationalPageVersion,
  readPublishedOperationalPage,
  rollbackOperationalPage,
} from "@/lib/firestore/operational-pages";
import {
  OperationalPageDefinitionSchema,
  operationalPageIdentity,
  type OperationalPageDefinition,
} from "@/lib/operational-pages/schema";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";

const admin: AuthenticatedUser = {
  uid: "admin-1",
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};

function definition(text: string): OperationalPageDefinition {
  return {
    pageType: "operational_process",
    spaceId: "lease-renewals",
    slug: "renewal-review-process",
    title: "Renewal review process",
    components: [
      { type: "heading", text: "Review steps", level: "2" },
      { type: "text", text },
      {
        type: "callout",
        tone: "warning",
        title: "Human review required",
        text: "Confirm source evidence before taking the next step.",
      },
      {
        type: "checklist",
        title: "Review checklist",
        items: ["Open the lease", "Compare the source records"],
      },
      { type: "internal_link", label: "Open renewals", href: "/lease-renewal" },
    ],
  };
}

describe("S37 bounded operational page schema", () => {
  it.each([
    [{ ...definition("Safe text"), html: "<b>unsafe</b>" }, "unrecognized"],
    [
      {
        ...definition("Safe text"),
        components: [{ type: "text", text: "<script>alert(1)</script>" }],
      },
      "HTML-like",
    ],
    [
      {
        ...definition("Safe text"),
        components: [
          { type: "internal_link", label: "Outside", href: "https://example.com" },
        ],
      },
      "approved internal",
    ],
    [
      {
        ...definition("Safe text"),
        components: [
          {
            type: "text",
            text: "Bearer abcdefghijklmnopqrstuvwxyz0123456789",
          },
        ],
      },
      "Secret-like",
    ],
    [
      {
        ...definition("Safe text"),
        components: [{ type: "text", text: "Safe", production_allowed: true }],
      },
      "unrecognized",
    ],
  ])("rejects authority/style/secret escape %#", (candidate, message) => {
    expect(() => OperationalPageDefinitionSchema.parse(candidate)).toThrow(message);
  });
});

describe("S37 version, approval, publish, readback, and rollback", () => {
  it("publishes exact approved versions and restores only the same page", async () => {
    const fake = new FakeFirestore();
    const db = fake as unknown as Firestore;
    const first = await createOperationalPageDraft(
      admin,
      { definition: definition("First reviewed version."), reason: "Initial process" },
      db,
      "2026-08-27T10:00:00.000Z",
    );
    await expect(
      approveOperationalPageVersion(
        admin,
        { versionId: first.id, previewHash: "0".repeat(64) },
        db,
      ),
    ).rejects.toThrow(/changed after preview/i);
    await approveOperationalPageVersion(
      admin,
      { versionId: first.id, previewHash: first.previewHash },
      db,
      "2026-08-27T10:01:00.000Z",
    );
    const firstReceipt = await publishOperationalPageVersion(
      admin,
      { versionId: first.id, previewHash: first.previewHash },
      db,
      "2026-08-27T10:02:00.000Z",
    );
    expect(firstReceipt).toMatchObject({ operation: "publish", duplicate: false });
    await expect(
      publishOperationalPageVersion(
        admin,
        { versionId: first.id, previewHash: first.previewHash },
        db,
      ),
    ).resolves.toMatchObject({ id: firstReceipt.id, duplicate: true });

    const second = await createOperationalPageDraft(
      admin,
      { definition: definition("Second reviewed version."), reason: "Clearer wording" },
      db,
      "2026-08-27T10:03:00.000Z",
    );
    expect(second.versionNumber).toBe(2);
    await approveOperationalPageVersion(
      admin,
      { versionId: second.id, previewHash: second.previewHash },
      db,
      "2026-08-27T10:04:00.000Z",
    );
    await publishOperationalPageVersion(
      admin,
      { versionId: second.id, previewHash: second.previewHash },
      db,
      "2026-08-27T10:05:00.000Z",
    );
    expect(
      (
        await readPublishedOperationalPage(
          admin,
          "lease-renewals",
          "renewal-review-process",
          db,
        )
      )?.id,
    ).toBe(second.id);

    const rollback = await rollbackOperationalPage(
      admin,
      {
        pageId: operationalPageIdentity(definition("ignored")),
        targetVersionId: first.id,
        previewHash: first.previewHash,
      },
      db,
      "2026-08-27T10:06:00.000Z",
    );
    expect(rollback).toMatchObject({
      operation: "rollback",
      fromVersionId: second.id,
      toVersionId: first.id,
      duplicate: false,
    });
    expect(
      (
        await readPublishedOperationalPage(
          admin,
          "lease-renewals",
          "renewal-review-process",
          db,
        )
      )?.id,
    ).toBe(first.id);
    expect(
      [...fake.store.keys()].filter((path) =>
        path.startsWith(`${OPERATIONAL_PAGE_COLLECTIONS.receipts}/`),
      ),
    ).toHaveLength(3);
  });

  it("refuses cross-page rollback without changing either head", async () => {
    const fake = new FakeFirestore();
    const db = fake as unknown as Firestore;
    const first = await createOperationalPageDraft(
      admin,
      { definition: definition("First page"), reason: "First" },
      db,
    );
    const otherDefinition = {
      ...definition("Other page"),
      slug: "other-process",
      title: "Other process",
    };
    const other = await createOperationalPageDraft(
      admin,
      { definition: otherDefinition, reason: "Other" },
      db,
    );
    await approveOperationalPageVersion(
      admin,
      { versionId: first.id, previewHash: first.previewHash },
      db,
    );
    await publishOperationalPageVersion(
      admin,
      { versionId: first.id, previewHash: first.previewHash },
      db,
    );
    await approveOperationalPageVersion(
      admin,
      { versionId: other.id, previewHash: other.previewHash },
      db,
    );
    await publishOperationalPageVersion(
      admin,
      { versionId: other.id, previewHash: other.previewHash },
      db,
    );

    await expect(
      rollbackOperationalPage(
        admin,
        {
          pageId: first.pageId,
          targetVersionId: other.id,
          previewHash: other.previewHash,
        },
        db,
      ),
    ).rejects.toThrow(/another page/i);
    expect(
      fake.store.get(`${OPERATIONAL_PAGE_COLLECTIONS.heads}/${first.pageId}`)
        ?.published_version_id,
    ).toBe(first.id);
    expect(
      fake.store.get(`${OPERATIONAL_PAGE_COLLECTIONS.heads}/${other.pageId}`)
        ?.published_version_id,
    ).toBe(other.id);
  });
});
